#!/usr/bin/env node
// parse-task-id.mjs — canonical's adapter over the template's parse-task-id.
//
// WHY AN ADAPTER AND NOT A COPY. `_flow-status.yml` and `_flow-done.yml` invoke
// `.flow/bin/parse-task-id.mjs` in the *consuming* repo, and canonical is now one of those.
// INIT.md tells a normal adopter to `cp -R project-template/.flow .` — but canonical already
// holds the original, and a copy inside the repo that authors it is two implementations that
// will disagree, in the one repo where a disagreement propagates to every other.
//
// So canonical adopts by *calling* its own template instead: this file re-exports the pure
// logic and supplies only the CLI shell. One implementation in the repo, and the template's
// 124 proving tests cover the behaviour these workflows depend on.
//
// (A symlink would not work: every template helper resolves its store as
// `dirname(realpath(import.meta.url))/..`, so a symlinked `.flow/bin` would read the
// *template's* store — `project-template/.flow/tasks/` — not canonical's.)
//
//   node .flow/bin/parse-task-id.mjs "<branch>" "<pr-title>"   # prints the id, or nothing

import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { parseTaskId } from "../../project-template/.flow/bin/parse-task-id.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/parse-task-id.mjs for the incident this guards against.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export { idFromBranch, idFromTitle, parseTaskId } from "../../project-template/.flow/bin/parse-task-id.mjs";

// ── CLI ── argv[2] = branch, argv[3] = pr title. Prints the id or nothing; always exit 0,
// because "no id" is the workflows' safe no-op rather than an error.
if (__isMain) {
  const id = parseTaskId(process.argv[2], process.argv[3]);
  if (id) process.stdout.write(id + "\n");
  process.exit(0);
}
