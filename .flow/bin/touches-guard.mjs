#!/usr/bin/env node
// touches-guard.mjs — canonical's adapter over the template's touches-guard.
//
// `_flow-gates.yml` runs `node .flow/bin/touches-guard.mjs` in the consuming repo. See
// parse-task-id.mjs in this directory for why canonical adapts rather than copies, and
// flow-doctor.mjs for why the store location has to be supplied here.
//
// Everything that decides anything is imported: `runGuard` reaches the decision, prints the
// human-readable lines AND the machine-checkable `touches-guard: decision=…` line the gate
// asserts on, and returns the exit code. This file supplies one thing — canonical's own store
// location — which is the entire reason an adapter exists at all.
//
// It used to carry its own copy of that CLI shell. That copy was the flow-0008 hazard in
// miniature: the decision line had to be added in two places to be true in both, and the gate
// would have gone green on canonical's own PR had only one been updated. One implementation,
// two stores.
//
//   HEAD_REF=… PR_TITLE=… BASE_REF=… node .flow/bin/touches-guard.mjs
//
// Exits 1 when the diff strays outside the claimed task's declared `touches`, 0 otherwise.
// Skips cleanly (exit 0) when no task id resolves — an untagged PR is the automation's no-op,
// and the store-guard plus review cover it. A skip is now *stated* on the decision line rather
// than inferred from silence.

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runGuard } from "../../project-template/.flow/bin/touches-guard.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// This one matters most: reached through a symlink the CLI block never runs, the scope check
// silently does not happen, and the gate goes GREEN. A guard that fails open is worse than no
// guard, because it reports enforcement it did not perform. The gate's decision-line assertion
// (flow-0008) is the backstop for exactly this, but the detection below is the first line.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export {
  checkTouches,
  globToRegExp,
  parseTouches,
  findTaskFile,
  runGuard,
  decisionLine,
  DECISION_PREFIX,
  DECISIONS,
} from "../../project-template/.flow/bin/touches-guard.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ──
if (__isMain) {
  process.exit(runGuard({ tasksDir: join(canonicalFlowDir(), "tasks"), env: process.env }));
}
