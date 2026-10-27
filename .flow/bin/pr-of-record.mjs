#!/usr/bin/env node
// pr-of-record.mjs — canonical's adapter over the template's PR-of-record guard (flow-0162).
//
// `_flow-open-pr.yml` and `_flow-status.yml` run `node .flow/bin/pr-of-record.mjs` in the
// consuming repo, and canonical is one of those. See parse-task-id.mjs in this directory for why
// canonical adapts rather than copies. The guard reads the task from origin/main by git path, so
// no store location is needed here — only the CLI shell.
//
//   node .flow/bin/pr-of-record.mjs --id flow-0042 --event-pr 7 --event opened [--json]

import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { main } from "../../project-template/.flow/bin/pr-of-record.mjs";

export { prNumber, prOfRecord, ignoreLine, readPrField, main } from "../../project-template/.flow/bin/pr-of-record.mjs";

// See project-template/.flow/bin/flow-open-pr.mjs for why main-module detection compares realpaths.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();

if (__isMain) {
  const r = main(process.argv.slice(2));
  process.stdout.write(r.stdout);
  process.exit(r.code);
}
