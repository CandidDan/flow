#!/usr/bin/env node
// status-transition.mjs — canonical's adapter over the template's status-transition decision
// (flow-0169's blocked read, flow-0176's cancelled guard).
//
// `_flow-status.yml` runs `node .flow/bin/status-transition.mjs` in the consuming repo, and
// canonical is one of those. The template resolves its store from its own realpath, which here is
// the template's FIXTURE store, so this file supplies only the CLI shell and canonical's store.
//
//   node .flow/bin/status-transition.mjs status --id flow-0042
//   node .flow/bin/status-transition.mjs closed --id flow-0042 --event-pr 7 [--edits <file>]

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { main } from "../../project-template/.flow/bin/status-transition.mjs";

export { readStatus, readTask, closedUnmerged, main } from "../../project-template/.flow/bin/status-transition.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// See project-template/.flow/bin/flow-open-pr.mjs for why main-module detection compares realpaths.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();

if (__isMain) {
  const r = main(process.argv.slice(2), { tasksDir: join(canonicalFlowDir(), "tasks") });
  process.stdout.write(r.stdout);
  process.exit(r.code);
}
