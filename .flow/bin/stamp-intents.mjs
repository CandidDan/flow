#!/usr/bin/env node
// stamp-intents.mjs — canonical's adapter over the template's stamp-intents.
//
// `_flow-done.yml` invokes `.flow/bin/stamp-intents.mjs` in the *consuming* repo, and canonical is
// one of those. Canonical already holds the original in `project-template/.flow/bin/`, so this file
// is a CLI shell over it and nothing else: no decision logic lives here (see CLAUDE.md, "adapters,
// not copies"). The template's helper resolves nothing from its own location — it works on the
// checkout it is run in — so there is no store path to supply.
//
//   node .flow/bin/stamp-intents.mjs --base <sha> --head <sha> --merged-by <login> --merged-at <iso>

import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runStampCli } from "../../project-template/.flow/bin/stamp-intents.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/parse-task-id.mjs for the incident this guards against.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export {
  INTENTS_DIR, isIntentPath, validateMerge, intentStatus, stampText, stampIntents, parseArgs, runStampCli,
} from "../../project-template/.flow/bin/stamp-intents.mjs";

if (__isMain) process.exit(runStampCli(process.argv.slice(2)));
