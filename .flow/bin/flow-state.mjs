#!/usr/bin/env node
// flow-state.mjs — canonical's adapter over the template's flow-state resolver.
//
// WHY THIS FILE EXISTS AT ALL. `flightdeck-state.mjs` resolves every registered project by
// shelling out to that project's own `.flow/bin/flow-state.mjs --json`. Canonical had no such
// file, so the flightdeck reported the repo that AUTHORS the flightdeck as
// `unavailable — no .flow/bin/flow-state.mjs` (PR #13). `flow-0004` created the four adapters
// the reusable workflows invoke; nothing in CI invokes flow-state, so it was never added. This
// closes that.
//
// See parse-task-id.mjs in this directory for why canonical adapts rather than copies, and
// flow-doctor.mjs for why the store location has to be supplied here.
//
// The one thing this file supplies that the template's CLI cannot is WHICH repo root to
// resolve state from. The template resolves it from its own realpath, which is
// `project-template/` — and `project-template/.flow/tasks/` holds only `_TEMPLATE.md`. So a
// copy or a symlink here would not merely read the wrong store: it would report canonical as
// having NO TASKS AT ALL, exit 0, and the flightdeck would render that as a healthy, empty
// project. An empty answer that looks like an answer is the exact failure the resolver exists
// to remove, which is why `runStateCli` takes the root as a required argument rather than
// defaulting it.
//
//   node .flow/bin/flow-state.mjs              # resolved state of every task, one line each
//   node .flow/bin/flow-state.mjs flow-0015    # just that task, with detail
//   node .flow/bin/flow-state.mjs --json       # machine-readable (what flightdeck-state calls)
//   node .flow/bin/flow-state.mjs --no-pr      # store-only (skip gh reconciliation)
//   node .flow/bin/flow-state.mjs --fetch      # force a `git fetch origin main` first
//
// READ-ONLY, like the template's: it never writes a task file, never commits, never opens a PR.

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runStateCli } from "../../project-template/.flow/bin/flow-state.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/flow-state.mjs for the incident this guards against. Here the
// failure is quiet in a particular way: flightdeck-state treats an empty stdout as "the
// resolver failed" and reports canonical unavailable — back to the bug this file fixes.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// The resolver's public surface, re-exported rather than reimplemented — same posture as the
// other adapters, so a consumer can import from either path and get one implementation.
export {
  branchMatchesTask,
  idNum,
  parseTask,
  pickPrForTask,
  readPrs,
  readTasksFromOrigin,
  reconcile,
  resolveState,
  runStateCli,
} from "../../project-template/.flow/bin/flow-state.mjs";

// Canonical's repo root — two levels up from this `bin/` directory (`.flow/bin` -> `.flow` -> repo).
export function canonicalRepoRoot(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..", "..");
}

// Canonical's own store — the directory whose task ids this resolver must report.
export function canonicalTasksDir(root = canonicalRepoRoot()) {
  return join(root, ".flow", "tasks");
}

// ── CLI ──
if (__isMain) {
  process.exit(runStateCli({ repoRoot: canonicalRepoRoot(), argv: process.argv.slice(2) }));
}
