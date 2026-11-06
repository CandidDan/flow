#!/usr/bin/env node
// deployable-sha.mjs — canonical's adapter over the template's deployable-sha (flow-0210).
//
// All decision logic lives in project-template/.flow/bin/deployable-sha.mjs, where every repo
// gets it. This file is only the CLI shell, so canonical can name its own release commit.
// The check reads git, not the store, so there is no store location to supply.

import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runCli } from "../../project-template/.flow/bin/deployable-sha.mjs";

const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();

export { DEFAULT_MAX, FLOW_PATHS, MAX_CEILING, findDeployable, parseArgs, runCli } from "../../project-template/.flow/bin/deployable-sha.mjs";

if (__isMain) {
  let code = 1;
  try { code = runCli(process.argv.slice(2)); } catch { code = 1; }
  process.exitCode = code;
}
