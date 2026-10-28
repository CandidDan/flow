#!/usr/bin/env node
// flow-unblock.mjs — canonical's adapter over the template's blocked-task release sweep.
//
// `_flow-unblock.yml` runs `node .flow/bin/flow-unblock.mjs` in the consuming repo, and canonical
// is one of those. The template resolves its store from its own realpath, which here is
// `project-template/.flow/tasks` — the FIXTURE store — so a copy would sweep the fixtures and
// release nothing real, with every command exiting 0. A symlink fails the same way, because the
// realpath is what the template resolves from. This file therefore supplies only the CLI shell and
// canonical's own store location, and the CLI itself is ONE call into the template's
// `runUnblockCli` (see flow-recover.mjs in this directory for the drift a hand-copied CLI
// produced). Do not add a `cmd === …` branch here — adapters.test.mjs fails the build if one
// appears.
//
//   node .flow/bin/flow-unblock.mjs pr-refs
//   node .flow/bin/flow-unblock.mjs plan  --pr-facts <file>
//   node .flow/bin/flow-unblock.mjs edits --pr-facts <file>

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runUnblockCli } from "../../project-template/.flow/bin/flow-unblock.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/flow-recover.mjs for the incident this guards against.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// Re-exported, never re-implemented.
export {
  classifyBlocked, resolveEntry, parsePrUrl, buildReleaseEdit, readTasks, prRefs, parsePrFacts,
  planReleases, runUnblockCli,
} from "../../project-template/.flow/bin/flow-unblock.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ── the template's shell verbatim, pointed at canonical's store. Always exits 0.
if (__isMain) {
  process.exit(runUnblockCli(process.argv.slice(2), { tasksDir: join(canonicalFlowDir(), "tasks") }));
}
