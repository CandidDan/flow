#!/usr/bin/env node
// pick-task.mjs — canonical's adapter over the template's queue selector.
//
// WHY THIS FILE EXISTS AT ALL. A worker started without a task id — a Claude Code routine with
// an empty trigger (docs/flow-routines.md) — picks with `node .flow/bin/pick-task.mjs`, and in
// canonical that has to read canonical's store. (Its first caller was the queue-runner, retired in
// flow-0174.)
//
// See parse-task-id.mjs in this directory for why canonical adapts rather than copies, and
// flow-doctor.mjs for why the store location has to be supplied here.
//
//   node .flow/bin/pick-task.mjs        # prints e.g. "flow-0016" or nothing

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { pickTask, readTasks } from "../../project-template/.flow/bin/pick-task.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/pick-task.mjs for the incident this guards against.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export {
  parseTask, staticPrefix, globsOverlap, touchesOverlap, pickTask, readTasks,
} from "../../project-template/.flow/bin/pick-task.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory. Resolved from THIS
// file's realpath, not the template's: the template resolves its own `flowDir` to
// `project-template/.flow`, which is the fixture store, and picking from that would dispatch a
// worker at a fixture task id that does not exist here.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ── prints the next task id, or nothing. Always exits 0 — "queue dry" means the worker
// stops, not an error.
if (__isMain) {
  const id = pickTask(readTasks(join(canonicalFlowDir(), "tasks")));
  if (id) process.stdout.write(id + "\n");
  process.exit(0);
}
