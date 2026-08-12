#!/usr/bin/env node
// flow-doctor.mjs — drift detection for the work store, back-ported from the canary repo's
// `state:check` pattern: a validated store beats a trusted one. Checks that the task
// files are internally consistent and that the board snapshot hasn't drifted from them.
// Run on demand or in CI (flow-tooling job). Exits non-zero on PROBLEMS; WARNINGS report only.
//
//   node .flow/bin/flow-doctor.mjs
//
// PROBLEMS (exit 1): malformed frontmatter · missing required fields · illegal status ·
//   duplicate ids · in_review without pr/branch · blocked without blocked_reason ·
//   in_progress without owner/started · two in_progress tasks with overlapping touches (the
//   atomic-claim rule was bypassed) · a declared source_root that's missing/uncovered, or a
//   top-level source tree no source_root covers (the gate-coverage floor — see below) ·
//   a task file present on disk but not committed (the uncommitted-task guard — see below).
// WARNINGS (exit 0): ready task with owner set · ready task with empty touches (concurrency
//   relies on it) · live tasks with overlapping touches (they can't run in parallel — sequence
//   them; don't call them parallel-safe) · board snapshot ids/statuses drifted from the files ·
//   no source_roots declared yet (adoption nudge) · Flow infra behind canonical (only when
//   FLOW_CANONICAL_VERSION is set — see "version drift" below).
// NOTES (exit 0): a check that was skipped because its precondition wasn't met (e.g. not run
//   inside a git work tree, so the uncommitted-task guard can't read `git status`).
//
// UNCOMMITTED-TASK GUARD (CAN-41). A task isn't in the store until it's committed to main —
// the store IS the committed `.flow/tasks/` on main, and concurrency depends on every session
// seeing the same committed state. A task file left uncommitted (or with uncommitted edits) is
// invisible to other sessions and to the board: it looks claimed/done locally but isn't. This
// fails on any `.flow/tasks/*.md` that `git status` reports as untracked or modified. Skipped
// (a note, not a failure) outside a git work tree, so unit fixtures and tarball checkouts are
// unaffected.
//
// VERSION DRIFT. Flow infra is authored in canonical (CandidDan/flow) and repos adopt it, so a
// repo can silently fall behind. Set FLOW_CANONICAL_VERSION (CI can derive it from
// `git ls-remote --tags https://github.com/CandidDan/flow`) and this warns when the repo's
// `.flow/VERSION` stamp is older. Off by default so local runs are unchanged.
//
// GATE-COVERAGE FLOOR. config.yml declares `source_roots:` — each `{ path, check }` naming a
// tree and the command that parses/lints it. The gate only validates trees a command reaches,
// so an undeclared runtime is invisible until production (real incident: Deno edge functions,
// gate ran only in app/, a parse error took down inbound for ~7 days). This check makes the
// floor a *declared, ratcheting* contract and catches it drifting as the repo grows: a new
// top-level source tree that no `source_root` covers FAILS the gate until it's declared (or
// explicitly ignored). It can't prove a command truly parses a tree — it makes coverage
// explicit and reviewed, not magically complete.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { STATUSES } from "./apply-board-edits.mjs";

const REQUIRED = ["id", "title", "status", "priority"];

// Dirs never treated as source trees (build output, deps, VCS, Flow's own plumbing).
const ROOT_IGNORE = new Set([
  "node_modules", ".git", ".github", ".flow", ".claude", "dist", "build", "out", ".next",
  "coverage", "vendor", ".venv", "venv", "target", ".turbo", ".cache", "tmp", ".vercel",
]);
const SOURCE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs", ".go", ".rb", ".java", ".kt",
  ".cs", ".php", ".ex", ".exs", ".swift", ".scala", ".dart",
]);

// Parse the `source_roots:` block from config.yml without a YAML dep. Tolerant line scan of:
//   source_roots:
//     - path: "app/"
//       check: "npm run lint"
function parseSourceRoots(configPath) {
  if (!existsSync(configPath)) return { exists: false, declared: false, roots: [] };
  const lines = readFileSync(configPath, "utf8").split("\n");
  const start = lines.findIndex((l) => /^source_roots:/.test(l));
  if (start === -1) return { exists: true, declared: false, roots: [] };
  const roots = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break;                     // dedent to a new top-level key → block done
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const unq = (v) => v.split("#")[0].trim().replace(/^["'](.*)["']$/, "$1");
    let m;
    if ((m = trimmed.match(/^-\s*path:\s*(.+)$/))) { cur = { path: unq(m[1]), check: "" }; roots.push(cur); }
    else if ((m = trimmed.match(/^path:\s*(.+)$/)))  { cur = { path: unq(m[1]), check: "" }; roots.push(cur); }
    else if ((m = trimmed.match(/^check:\s*(.+)$/)) && cur) { cur.check = unq(m[1]); }
  }
  return { declared: true, roots };
}

// Does any directory at or beneath `dir` (bounded depth, ignoring junk) hold a source file?
function containsSource(dir, depth = 0) {
  if (depth > 4) return false;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  for (const e of entries) {
    if (e.isFile() && SOURCE_EXT.has(e.name.slice(e.name.lastIndexOf(".")))) return true;
  }
  for (const e of entries) {
    if (e.isDirectory() && !ROOT_IGNORE.has(e.name) && !e.name.startsWith(".")) {
      if (containsSource(join(dir, e.name), depth + 1)) return true;
    }
  }
  return false;
}

// Top-level dirs (depth 1 from repo root) that hold source and aren't ignored.
function topLevelSourceDirs(repoRoot) {
  let entries;
  try { entries = readdirSync(repoRoot, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !ROOT_IGNORE.has(e.name) && !e.name.startsWith("."))
    .map((e) => e.name)
    .filter((name) => containsSource(join(repoRoot, name)));
}

// A top-level dir is covered if a declared root path equals it, sits inside it, or contains it.
function rootCovers(declaredPath, topDir) {
  const p = declaredPath.replace(/\/+$/, "");
  return p === topDir || p.startsWith(topDir + "/") || topDir.startsWith(p + "/");
}

// Parse the `touches:` value, tolerating BOTH frontmatter forms:
//   inline:      touches: ["src/**", "api/x.ts"]
//   multi-line:  touches:
//                  - "src/**"
//                  - "api/x.ts"
// (A naive same-line scan misses the multi-line form — it would read those tasks as having
// empty touches, silencing both the empty-touches warning and overlap detection below.)
function parseTouchesList(head) {
  const lines = head.split("\n");
  const i = lines.findIndex((l) => /^\s*touches:/.test(l));
  if (i === -1) return [];
  const inline = lines[i].replace(/^\s*touches:\s*/, "").split("#")[0].trim();
  if (inline.startsWith("[")) return [...inline.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t === "" || t.startsWith("#")) continue;
    const m = t.match(/^-\s*(.+)$/);
    if (!m) break; // dedent to the next key → list done
    out.push(m[1].split("#")[0].trim().replace(/^["'](.*)["']$/, "$1"));
  }
  return out.filter(Boolean);
}

// The non-wildcard leading path of a glob, trimmed to whole segments — what we compare for overlap.
//   "a/b/**" -> "a/b" · "a/b/c.ts" -> "a/b/c.ts" · "a/**/x" -> "a"
function staticPrefix(glob) {
  const i = glob.search(/[*?[\]{}]/);
  let p = i === -1 ? glob : glob.slice(0, i);
  if (i !== -1 && !p.endsWith("/")) p = p.slice(0, p.lastIndexOf("/") + 1);
  return p.replace(/\/+$/, "");
}
// Segment-aware path containment, so "app/foo" and "app/foobar" do NOT match.
function pathContains(p, q) { return p === q || q.startsWith(p + "/") || p.startsWith(q + "/"); }
// Two globs overlap if identical or one's static prefix contains the other's. Heuristic (no full
// glob-intersection), but it catches the dominant cases: an exact shared file, and nested trees.
function globsOverlap(a, b) { return a === b || pathContains(staticPrefix(a), staticPrefix(b)); }
// First overlapping (a, b) glob pair between two touches lists, or null.
function touchesOverlap(A, B) {
  for (const a of A) for (const b of B) if (globsOverlap(a, b)) return [a, b];
  return null;
}

// ── version drift (Flow infra is authored in canonical; repos adopt — this is the guard) ──
// Parse "v1.2.3" / "1.2" / "0.1.0" into numeric segments; a `v` prefix and a short form are fine.
function parseVersion(v) {
  return String(v).trim().replace(/^v/i, "").split(".").map((s) => parseInt(s, 10) || 0);
}
// -1 if a < b, 0 if equal, 1 if a > b (segment-wise, missing segments treated as 0).
export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// ── uncommitted-task guard (CAN-41) ──
// Pure detector: given `git status --porcelain` output and the list of on-disk task-file
// paths (repo-relative, e.g. ".flow/tasks/0099-x.md"), return the task files that are present
// but not committed — untracked or with staged/unstaged changes. `_TEMPLATE.md` is ignored;
// staged deletions (not on disk) are ignored via the `files` filter. When `files` is
// empty/omitted, no on-disk filtering is applied (so the function is unit-testable from canned
// porcelain alone).
export function findUncommittedTasks(porcelain, files) {
  const onDisk = new Set(files ?? []);
  const offending = [];
  for (const raw of String(porcelain).split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.length < 4) continue;
    let path = line.slice(3).trim(); // porcelain is "XY <path>"
    if (path.includes(" -> ")) path = path.split(" -> ").pop().trim(); // renames
    path = path.replace(/^"(.*)"$/, "$1"); // git quotes paths with special chars
    if (!path.startsWith(".flow/tasks/") || !path.endsWith(".md")) continue;
    if (path.endsWith("_TEMPLATE.md")) continue;
    if (onDisk.size && !onDisk.has(path)) continue; // e.g. a staged deletion
    if (!offending.includes(path)) offending.push(path);
  }
  return offending;
}

// Thin git wrapper (the only side-effecting part). Reads porcelain status scoped to
// `.flow/tasks` from the repo root. Returns `{ inRepo: false }` outside a git work tree so the
// caller can skip gracefully (a note, not a failure).
function realGitPorcelain(flowDir) {
  const repoRoot = resolve(flowDir, "..");
  try {
    const inside = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (inside !== "true") return { inRepo: false, porcelain: "" };
    const porcelain = execFileSync("git", ["status", "--porcelain", "--", ".flow/tasks"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { inRepo: true, porcelain };
  } catch {
    return { inRepo: false, porcelain: "" };
  }
}

function parseTask(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const head = text.slice(3, end);
  const get = (k) => {
    const m = head.match(new RegExp(`^${k}:\\s*(.*)$`, "m"));
    return m ? m[1].split("#")[0].trim().replace(/^"(.*)"$/, "$1") : undefined;
  };
  return { id: get("id"), title: get("title"), status: get("status"), priority: get("priority"),
           owner: get("owner"), started: get("started"), branch: get("branch"), pr: get("pr"),
           blocked_reason: get("blocked_reason"), touches: get("touches"),
           touchesList: parseTouchesList(head) };
}

export function runDoctor({ flowDir, canonicalVersion, gitStatus }) {
  const problems = [], warnings = [], notes = [];
  const tasksDir = join(flowDir, "tasks");
  const seen = new Map();
  const tasks = [];
  const onDiskTaskPaths = [];

  for (const name of readdirSync(tasksDir).sort()) {
    if (!name.endsWith(".md") || name === "_TEMPLATE.md") continue;
    onDiskTaskPaths.push(`.flow/tasks/${name}`);
    const t = parseTask(readFileSync(join(tasksDir, name), "utf8"));
    if (!t) { problems.push(`${name}: malformed frontmatter`); continue; }
    const missing = REQUIRED.filter((k) => !t[k]);
    if (missing.length) { problems.push(`${name}: missing required field(s): ${missing.join(", ")}`); continue; }
    if (!STATUSES.has(t.status)) { problems.push(`${name}: illegal status "${t.status}"`); continue; }
    if (seen.has(t.id)) problems.push(`${name}: duplicate id ${t.id} (also in ${seen.get(t.id)})`);
    seen.set(t.id, name);

    if (t.status === "in_review" && (!t.pr || !t.branch))
      problems.push(`${t.id}: in_review but ${!t.pr ? "pr" : "branch"} is empty — hand-off incomplete or flow-status didn't fire`);
    if (t.status === "blocked" && !t.blocked_reason)
      problems.push(`${t.id}: blocked with no blocked_reason — undecidable AND unexplained`);
    if (t.status === "in_progress" && (!t.owner || !t.started))
      problems.push(`${t.id}: in_progress but ${!t.owner ? "owner" : "started"} is empty — claim was not completed properly`);
    if (t.status === "ready" && t.owner)
      warnings.push(`${t.id}: ready but owner="${t.owner}" — stale claim? clear it so the task is re-claimable`);
    if (t.status === "ready" && (!t.touchesList || t.touchesList.length === 0))
      warnings.push(`${t.id}: ready with empty touches — overlap detection can't protect it under parallel sessions`);
    tasks.push(t);
  }

  // Touches overlap among the *live* set (ready + in_progress). The concurrency model assumes a
  // ready task can be claimed without colliding with anything in flight, and that tasks the
  // orchestrator calls "parallel-safe" truly are. This makes that mechanical, not a prose claim:
  //   - two in_progress tasks sharing touches -> PROBLEM (two sessions in the same files; the
  //     atomic-claim rule was bypassed).
  //   - any other live pair sharing touches   -> WARNING (they can't run in parallel; the queue
  //     will serialize them — surfaced so "parallel-safe" can't be asserted falsely, the exact
  //     miss that shipped two overlapping "parallel" tasks once).
  const live = tasks.filter((t) => t.status === "ready" || t.status === "in_progress");
  for (let a = 0; a < live.length; a++) {
    for (let b = a + 1; b < live.length; b++) {
      const ov = touchesOverlap(live[a].touchesList || [], live[b].touchesList || []);
      if (!ov) continue;
      const where = ov[0] === ov[1] ? ov[0] : `${ov[0]} vs ${ov[1]}`;
      if (live[a].status === "in_progress" && live[b].status === "in_progress")
        problems.push(`${live[a].id} and ${live[b].id} are BOTH in_progress with overlapping touches (${where}) — two sessions in the same files; the atomic-claim rule was bypassed`);
      else
        warnings.push(`${live[a].id} and ${live[b].id} have overlapping touches (${where}) — they can't run in parallel; sequence them or split the shared path (don't label them parallel-safe)`);
    }
  }

  // Board snapshot drift (warn only — live mode and regeneration both fix it).
  const boardPath = join(flowDir, "board.html");
  if (existsSync(boardPath)) {
    const m = readFileSync(boardPath, "utf8").match(/const TASKS = \[([\s\S]*?)\n\];/);
    if (m) {
      const snapIds = new Map([...m[1].matchAll(/id:"([^"]+)"[^}]*?status:"([^"]+)"/g)].map((x) => [x[1], x[2]]));
      for (const t of tasks) {
        if (!snapIds.has(t.id)) warnings.push(`board snapshot missing ${t.id} — regenerate (board-builder)`);
        else if (snapIds.get(t.id) !== t.status)
          warnings.push(`board snapshot has ${t.id}=${snapIds.get(t.id)}, files say ${t.status} — regenerate`);
      }
      for (const id of snapIds.keys())
        if (!seen.has(id)) warnings.push(`board snapshot has ${id} but no task file exists — regenerate`);
    }
  }

  // Gate-coverage floor: every source tree must be declared + mapped to a check, and no
  // undeclared top-level source tree may exist. Graceful adoption: a repo that hasn't declared
  // source_roots yet only gets a warning (so dropping this check into an existing project
  // doesn't fail its gate before it's calibrated).
  const repoRoot = dirname(flowDir);
  const { exists: configExists, declared, roots } = parseSourceRoots(join(flowDir, "config.yml"));
  if (configExists && !declared) {
    warnings.push("no source_roots declared in config.yml — gate coverage is unverified; " +
      "declare each source tree + the check that parses it (see config.yml note).");
  } else if (declared) {
    for (const r of roots) {
      if (!r.path) { problems.push("source_root with no path in config.yml"); continue; }
      if (!r.check) problems.push(`source_root "${r.path}" has no check — declare the command that parses/lints it`);
      if (!existsSync(join(repoRoot, r.path))) problems.push(`source_root "${r.path}" does not exist on disk — stale declaration`);
    }
    for (const dir of topLevelSourceDirs(repoRoot)) {
      if (!roots.some((r) => r.path && rootCovers(r.path, dir))) {
        problems.push(`source tree "${dir}/" is not covered by any source_root — declare it (with a check) ` +
          `or it's never parsed before production. If it shouldn't be gated, add it to ROOT_IGNORE.`);
      }
    }
  }

  // Version drift: Flow infra is authored in canonical and repos adopt it, so a repo can fall
  // behind. When the caller supplies canonical's current version (CI passes FLOW_CANONICAL_VERSION,
  // e.g. from `git ls-remote --tags`), compare it to this repo's `.flow/VERSION` stamp. Warn (don't
  // fail) — same graceful-adoption posture as source_roots: surface the drift, don't block on it.
  // Inactive when no canonical version is supplied, so local runs behave exactly as before.
  if (canonicalVersion !== undefined && canonicalVersion !== "") {
    const versionPath = join(flowDir, "VERSION");
    if (!existsSync(versionPath)) {
      warnings.push(`canonical Flow is ${canonicalVersion} but this repo has no .flow/VERSION stamp — ` +
        "record the adopted version so drift can be detected (see docs/flow-reusable-workflows.md).");
    } else {
      const local = readFileSync(versionPath, "utf8").trim();
      if (compareVersions(local, canonicalVersion) < 0)
        warnings.push(`Flow infra is behind canonical: repo .flow/VERSION=${local}, canonical=${canonicalVersion} — ` +
          "re-sync (bump the reusable-workflow tag + adopt template changes; see docs/flow-reusable-workflows.md).");
    }
  }

  // Uncommitted-task guard (CAN-41): a task isn't in the store until it's committed to main.
  // Fails on task files present on disk but not committed. The git read is injectable
  // (`gitStatus`) for tests; in production it shells out, and skips gracefully (a note) when
  // not in a git work tree — so unit fixtures and tarball checkouts are unaffected.
  const { inRepo, porcelain } = (gitStatus ?? (() => realGitPorcelain(flowDir)))();
  if (inRepo) {
    for (const f of findUncommittedTasks(porcelain, onDiskTaskPaths)) {
      problems.push(
        `${f}: present on disk but not committed — a task isn't in the store until it's committed to main (commit + push it)`,
      );
    }
  } else {
    notes.push("uncommitted-task check skipped — not a git work tree");
  }

  return { problems, warnings, notes, count: tasks.length };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const flowDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const canonicalVersion = process.env.FLOW_CANONICAL_VERSION || undefined;
  const { problems, warnings, notes, count } = runDoctor({ flowDir, canonicalVersion });
  console.log(`flow-doctor: ${count} task(s) checked`);
  for (const n of notes ?? []) console.log(`  note  ${n}`);
  for (const w of warnings) console.warn(`  WARN  ${w}`);
  for (const p of problems) console.error(`  FAIL  ${p}`);
  if (!problems.length && !warnings.length) console.log("  store is healthy");
  process.exit(problems.length ? 1 : 0);
}
