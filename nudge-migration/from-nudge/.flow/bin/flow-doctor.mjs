#!/usr/bin/env node
// flow-doctor.mjs — drift detection for the work store, back-ported from Nudge's
// `state:check` pattern: a validated store beats a trusted one. Checks that the task
// files are internally consistent and that the board snapshot hasn't drifted from them.
// Run on demand or in CI (flow-tooling job). Exits non-zero on PROBLEMS; WARNINGS report only.
//
//   node .flow/bin/flow-doctor.mjs
//
// PROBLEMS (exit 1): malformed frontmatter · missing required fields · illegal status ·
//   duplicate ids · in_review without pr/branch · blocked without blocked_reason ·
//   in_progress without owner/started · source_roots coverage gap.
// WARNINGS (exit 0): ready task with owner set · ready task with empty touches (concurrency
//   relies on it) · board snapshot ids/statuses drifted from the files.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { STATUSES } from "./apply-board-edits.mjs";

const REQUIRED = ["id", "title", "status", "priority"];

// Top-level repo dirs that intentionally have no gate coverage.
// Add entries here (with a comment) rather than leaving an uncovered tree undeclared.
const ROOT_IGNORE = new Set([
  "docs",         // documentation only — no parseable source
  "holding",      // deprecated code, intentionally not gated
  "node_modules", // dependency tree — gitignored, not a source tree
  "scripts",      // shell/utility scripts, not a compiled/linted tree
  "tests",        // harness fixtures — run via vitest under app/, not a separate runtime
]);

/**
 * Parse the `source_roots:` block from a config.yml file.
 * Returns an array of { path, check } objects, or null if the file doesn't exist,
 * or undefined if the file exists but has no source_roots block.
 */
export function parseSourceRoots(configPath) {
  if (!existsSync(configPath)) return null;
  const text = readFileSync(configPath, "utf8");
  const roots = [];
  let inBlock = false;
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (/^source_roots:/.test(line)) { inBlock = true; continue; }
    if (inBlock) {
      // A non-indented line ends the block.
      if (line.length > 0 && !/^\s/.test(line)) { inBlock = false; break; }
      const pathM = line.match(/^\s+-\s+path:\s*"([^"]+)"/);
      if (pathM) {
        if (current) roots.push(current);
        current = { path: pathM[1], check: "" };
        continue;
      }
      if (current) {
        const checkM = line.match(/^\s+check:\s*"(.*)"/);
        if (checkM) current.check = checkM[1];
      }
    }
  }
  if (current) roots.push(current);
  return inBlock || roots.length ? roots : undefined;
}

/**
 * Given declared source_roots and the list of top-level directories at repoRoot,
 * return problem strings for any coverage gap.
 *
 * A top-level dir is "covered" when at least one declared root path starts with
 * `${dir}/` (i.e. the root is inside the dir). ROOT_IGNORE and hidden dirs (`.`)
 * are unconditionally skipped.
 *
 * topDirs defaults to a real readdirSync call when omitted; pass an array of
 * {name, isDirectory()} objects for unit tests.
 */
export function checkSourceRoots(repoRoot, roots, topDirsOverride) {
  const problems = [];
  // Declared roots must each have a non-empty check command.
  for (const root of roots) {
    if (!root.check || !root.check.trim()) {
      problems.push(
        `source_roots["${root.path}"]: check command is empty — add a parse/lint command for this tree`,
      );
    }
  }
  // Scan actual top-level dirs.
  let entries;
  try {
    entries = topDirsOverride ?? readdirSync(repoRoot, { withFileTypes: true });
  } catch {
    return problems; // can't scan — skip silently
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith(".")) continue; // hidden dirs excluded
    if (ROOT_IGNORE.has(name)) continue;
    const covered = roots.some(
      (r) => r.path === `${name}/` || r.path === name || r.path.startsWith(`${name}/`),
    );
    if (!covered) {
      problems.push(
        `source_roots: "${name}/" is a top-level source tree with no gate coverage — ` +
          `declare it in config.yml source_roots or add to ROOT_IGNORE with a comment`,
      );
    }
  }
  return problems;
}

/**
 * Pure detector: given `git status --porcelain` output and the list of on-disk
 * task-file paths (repo-relative, e.g. ".flow/tasks/0099-x.md"), return the task
 * files that are present but not committed — untracked or with staged/unstaged
 * changes. `_TEMPLATE.md` is ignored; staged deletions (not on disk) are ignored
 * via the `files` filter. When `files` is empty/omitted, no on-disk filtering is
 * applied (so the function is unit-testable from canned porcelain alone).
 */
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

/**
 * Thin git wrapper (the only side-effecting part). Reads porcelain status scoped
 * to `.flow/tasks` from the repo root. Returns `{ inRepo: false }` outside a git
 * work tree so the caller can skip gracefully.
 */
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
           blocked_reason: get("blocked_reason"), touches: get("touches") };
}

export function runDoctor({ flowDir, gitStatus, topDirsOverride }) {
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
    if (t.status === "ready" && (!t.touches || t.touches === "[]"))
      warnings.push(`${t.id}: ready with empty touches — overlap detection can't protect it under parallel sessions`);
    tasks.push(t);
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

  // Uncommitted-task guard (ADR-0001): a task isn't in the store until it's
  // committed to main. Fails on task files present on disk but not committed.
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

  // Source-roots gate-coverage check: every top-level source tree must be declared
  // in source_roots in config.yml with a non-empty check command.
  const repoRoot = resolve(flowDir, "..");
  const configPath = join(flowDir, "config.yml");
  const roots = parseSourceRoots(configPath);
  if (roots === null) {
    notes.push("source_roots check skipped — no config.yml found");
  } else if (roots === undefined) {
    notes.push("source_roots check skipped — no source_roots block in config.yml");
  } else {
    for (const p of checkSourceRoots(repoRoot, roots, topDirsOverride)) {
      problems.push(p);
    }
  }

  return { problems, warnings, notes, count: tasks.length };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const flowDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { problems, warnings, notes, count } = runDoctor({ flowDir });
  console.log(`flow-doctor: ${count} task(s) checked`);
  for (const n of notes ?? []) console.log(`  note  ${n}`);
  for (const w of warnings) console.warn(`  WARN  ${w}`);
  for (const p of problems) console.error(`  FAIL  ${p}`);
  if (!problems.length && !warnings.length) console.log("  store is healthy");
  process.exit(problems.length ? 1 : 0);
}
