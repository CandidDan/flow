#!/usr/bin/env node
// flightdeck-state.mjs — cross-project state aggregation, in tested code, from one source.
//
// THE PROBLEM IT SOLVES. The flightdeck was not trusted, so the human sanity-checked every
// project directly before acting — which defeats the point of a portfolio view. The cause was not
// missing features. It was that aggregation lived in a prompt (`portfolio-manager.md`) and read
// the wrong source: each project's `.flow/` task files as they appear in a mounted local clone.
// That clone lags `origin`, because cloud workers merge to `origin/main` and the working copy only
// catches up when someone fetches. The agent spec was corrected to say "read origin/main, never
// the working tree" — but an instruction is not an enforcement, and nothing failed when it drifted.
//
// So this file does not read task files at all. Per project it shells out to that project's own
// `.flow/bin/flow-state.mjs --json`, which already resolves state from `origin/main` and
// reconciles each task against its PR via `gh`. This aggregator only fans out, stamps provenance,
// and merges. The prompt is left doing judgement and prose — and none of the data work.
//
//   node flightdeck/bin/flightdeck-state.mjs                    # every enabled project, as JSON
//   node flightdeck/bin/flightdeck-state.mjs --registry <path>  # a different registry file
//   node flightdeck/bin/flightdeck-state.mjs --no-pr            # skip gh reconciliation
//
// A project that cannot be resolved is reported as an explicit `unavailable` entry carrying the
// reason. It is never silently dropped, and there is NO working-tree fallback anywhere in this
// file — a stale number that looks fresh is the exact failure this replaces, so refusing to answer
// beats answering wrongly. `flightdeck-state.test.mjs` asserts that property against this source.
//
// Zero dependencies (Node >= 18), consistent with `.flow/bin/`.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync as __realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath, fileURLToPath } from "node:url";

// --- main-module detection (do not simplify back to a string compare) -------------------
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED. Reached
// through a symlink the two differ, the comparison is false, and the CLI below silently never
// runs — no output, exit 0, nothing to debug. Compare realpaths on both sides.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// The per-project resolver this aggregator delegates to. Named once so the reason strings and the
// lookup can never disagree about what is missing.
export const RESOLVER = join(".flow", "bin", "flow-state.mjs");

// ── pure: registry parsing ─────────────────────────────────────────────────
// projects.yml is small and fixed-shape, so this stays a tolerant line scan rather than a YAML
// dependency — consistent with the readers in `.flow/bin/`. It handles the one bug those readers
// actually shipped: a `#` inside a quoted value being truncated as a comment.
//
//   projects:
//     - name: "my-project"
//       repo: "owner/my-project"
//       path: "~/Projects/my-project"
//       enabled: true
export function parseRegistry(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^projects:\s*$/.test(l));
  if (start === -1) return [];

  const entries = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break;                       // dedent to a new top-level key
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const item = trimmed.match(/^-\s*(.*)$/);
    const body = item ? item[1] : trimmed;
    if (item) { cur = { name: "", repo: "", path: "", enabled: true }; entries.push(cur); }
    if (!cur) continue;

    const kv = body.match(/^(name|repo|path|enabled):\s*(.*)$/);
    if (!kv) continue;
    cur[kv[1]] = kv[1] === "enabled" ? unquote(kv[2]) !== "false" : unquote(kv[2]);
  }
  return entries.filter((e) => e.name);
}

// Take a quoted value verbatim (a `#` inside quotes is DATA, not a comment); strip a trailing
// comment only from an unquoted one.
function unquote(raw) {
  const v = String(raw).trim();
  const quoted = v.match(/^"([^"]*)"|^'([^']*)'/);
  if (quoted) return quoted[1] ?? quoted[2];
  return v.replace(/\s+#.*$/, "").trim();
}

// `~` is what the registry actually contains, so expanding it is not a nicety.
export function expandHome(p, home = homedir()) {
  const s = String(p ?? "").trim();
  if (s === "~") return home;
  if (s.startsWith("~/")) return join(home, s.slice(2));
  return s;
}

// ── pure: one project's outcome ────────────────────────────────────────────
export function unavailable(entry, reason) {
  return { name: entry.name, repo: entry.repo || "", path: entry.path || "", status: "unavailable", reason, tasks: [] };
}

// Decide a single project's entry. All IO is injected, so every branch below is testable without
// a filesystem — and the real `io` is assembled once, in the CLI.
//
//   io.exists(path)            -> boolean
//   io.provenance(root)        -> { commit, committed_at } | null   (from origin/main)
//   io.flowState(root, noPr)   -> { source, prReconciled, tasks } | null
export function resolveProject(entry, io) {
  const path = expandHome(entry.path);
  if (!path) {
    return unavailable(entry, "no local path registered — state is read from a clone's origin/main, so a path is required");
  }
  if (!io.exists(path)) {
    return unavailable(entry, `path does not exist: ${path}`);
  }
  if (!io.exists(join(path, RESOLVER))) {
    return unavailable(entry, `no ${RESOLVER} in ${path} — this project is on a Flow version without the state resolver, so its state cannot be read from origin/main`);
  }

  const prov = io.provenance(path);
  if (!prov) {
    return unavailable(entry, `origin/main is unreadable in ${path} — cannot establish provenance, and stale state is worse than none`);
  }

  const state = io.flowState(path);
  if (!state) {
    return unavailable(entry, `${RESOLVER} failed in ${path}`);
  }
  // flow-state falls back to the working tree when origin/main is unreadable, and says so in
  // `source`. Accepting that would silently reintroduce the staleness this whole task removes.
  if (/^WORKING TREE/i.test(String(state.source ?? ""))) {
    return unavailable(entry, `${RESOLVER} fell back to the working tree in ${path} — refusing state that is not from origin/main`);
  }

  return {
    name: entry.name,
    repo: entry.repo || "",
    path,
    status: "ok",
    provenance: {
      commit: prov.commit,
      committed_at: prov.committed_at,
      pr_reconciled: state.prReconciled === true,
    },
    // Stamp each task with its project so a flat consumer can group without re-walking.
    tasks: (state.tasks ?? []).map((t) => ({ ...t, project: entry.name })),
  };
}

// Fan out across the registry. Disabled entries are dropped entirely; everything else appears,
// resolved or not.
export function aggregate({ registryText, io }) {
  const entries = parseRegistry(registryText);
  const projects = entries
    .filter((e) => e.enabled)
    .map((e) => resolveProject(e, io));

  return {
    projects,
    summary: {
      total: projects.length,
      ok: projects.filter((p) => p.status === "ok").length,
      unavailable: projects.filter((p) => p.status === "unavailable").length,
      tasks: projects.reduce((n, p) => n + p.tasks.length, 0),
    },
  };
}

// ── impure: thin shells over git and the per-project resolver ──────────────
function trySh(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...opts });
  } catch { return null; }
}

// Provenance comes from origin/main's tip, never from HEAD or the index: %H is the full commit,
// %cI is strict ISO-8601. If either is unreadable the project is unavailable, by design.
export function gitProvenance(repoRoot) {
  const out = trySh("git", ["-C", repoRoot, "log", "-1", "--format=%H%n%cI", "origin/main"]);
  if (!out) return null;
  const [commit, committed_at] = out.trim().split("\n");
  if (!commit || !committed_at) return null;
  return { commit: commit.trim(), committed_at: committed_at.trim() };
}

export function runFlowState(repoRoot, { noPr = false } = {}) {
  const args = [join(repoRoot, RESOLVER), "--json"];
  if (noPr) args.push("--no-pr");
  const out = trySh(process.execPath, args);
  if (!out) return null;
  try { return JSON.parse(out); } catch { return null; }
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (__isMain) {
  const argv = process.argv.slice(2);
  const noPr = argv.includes("--no-pr");
  const flagIdx = argv.indexOf("--registry");
  const flightdeckDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const registryPath = resolve(flagIdx !== -1 && argv[flagIdx + 1] ? argv[flagIdx + 1] : join(flightdeckDir, "projects.yml"));

  if (!existsSync(registryPath)) {
    console.error(`flightdeck-state: no registry at ${registryPath}`);
    process.exit(1);
  }

  const io = {
    exists: existsSync,
    provenance: gitProvenance,
    flowState: (root) => runFlowState(root, { noPr }),
  };

  const result = aggregate({ registryText: readFileSync(registryPath, "utf8"), io });
  process.stdout.write(JSON.stringify({ registry: registryPath, ...result }, null, 2) + "\n");
  // Exit 0 even when projects are unavailable: an unreachable project is data the caller must see,
  // not a failure of the aggregation. A non-zero exit here would make the flightdeck all-or-nothing.
  process.exit(0);
}
