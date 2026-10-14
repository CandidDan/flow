#!/usr/bin/env node
// task-model.mjs — canonical's adapter over the template's model resolver (flow-0083).
//
// `_flow-queue-runner.yml` runs `node .flow/bin/task-model.mjs resolve|decide|escalate` in the
// consuming repo, and canonical is one of those. See parse-task-id.mjs in this directory for why
// canonical adapts rather than copies.
//
// The one thing this file supplies that the template's CLI cannot is WHICH store to read and
// write. The template resolves the store from its own realpath — `project-template/.flow/tasks/`,
// the fixture store, which holds no real task. Run from there, `resolve` would fail every
// canonical task as "not found", and `escalate` could never write the task it was asked to.
//
// Not a copy and NOT a symlink: a symlink resolves to the template's bin directory, so the store
// walk lands in the fixture store — the silent-wrong-store failure CLAUDE.md names.
//
//   node .flow/bin/task-model.mjs resolve  --task-id flow-0083
//   node .flow/bin/task-model.mjs decide   --task-id flow-0083 --worker-failed 1 --branch-ahead 0 --has-open-pr 0
//   node .flow/bin/task-model.mjs escalate --task-id flow-0083 --event "run 123 ended without a PR"

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runCli } from "../../project-template/.flow/bin/task-model.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See the template file's header: a CLI block that never runs leaves the worker with no model.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// The public surface, re-exported rather than reimplemented.
export {
  TIERS,
  TIER_ORDER,
  EFFORTS,
  cliArgs,
  decideRunEscalation,
  escalate,
  findTaskFile,
  recordsEvent,
  resolve as resolveModel,
  runCli,
  summaryLine,
} from "../../project-template/.flow/bin/task-model.mjs";

// Canonical's repo root — two levels up from this `bin/` directory (`.flow/bin` -> `.flow` -> repo).
export function canonicalRepoRoot(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..", "..");
}

// Canonical's own store — the directory whose tasks this resolver reads and escalates.
export function canonicalTasksDir(root = canonicalRepoRoot()) {
  return join(root, ".flow", "tasks");
}

// ── CLI ──
if (__isMain) {
  process.exit(runCli(process.argv.slice(2), canonicalTasksDir()));
}
