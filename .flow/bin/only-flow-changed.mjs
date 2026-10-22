#!/usr/bin/env node
// only-flow-changed.mjs — canonical's adapter over the template's only-flow-changed.
//
// All decision logic lives in project-template/.flow/bin/only-flow-changed.mjs, where every repo
// gets it. This file is only the CLI shell, so canonical's own flow-site can use the same hook.
// The check reads git, not the store, so there is no store location to supply.

import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runCli } from "../../project-template/.flow/bin/only-flow-changed.mjs";

const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();

export { FLOW_PATHS, decide, parseArgs, pickBase, runCli } from "../../project-template/.flow/bin/only-flow-changed.mjs";

if (__isMain) {
  let code = 1;
  try { code = runCli(process.argv.slice(2)); } catch { code = 1; }
  process.exit(code);
}
