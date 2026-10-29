#!/usr/bin/env node
// flow-dispatch.mjs — canonical's adapter over the template's routine dispatcher (flow-0182).
//
// `_flow-dispatch.yml` runs `node .flow/bin/flow-dispatch.mjs` in the consuming repo, and canonical
// is one of those. The template resolves its store from its own realpath, which here is
// `project-template/.flow` — the FIXTURE store — so a copy would pick a fixture task and fire a
// routine at an id that does not exist here. A symlink fails the same way. This file supplies only
// the CLI shell and canonical's own store location; the CLI itself is ONE call into the template's
// `runDispatchCli`.
//
//   node .flow/bin/flow-dispatch.mjs

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runDispatchCli } from "../../project-template/.flow/bin/flow-dispatch.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/flow-dispatch.mjs: a CLI block that never runs fires nothing.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// Re-exported, never re-implemented.
export {
  FIRE_BASE, ANTHROPIC_VERSION, DEFAULT_MAX_IN_PROGRESS, fireUrl, readMaxInProgress,
  routineEnvNames, routineFor, planDispatch, decisionLine, readLatestFromMain, dispatch,
  runDispatchCli,
} from "../../project-template/.flow/bin/flow-dispatch.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ── the template's shell, pointed at canonical's store.
if (__isMain) {
  process.exit(await runDispatchCli(process.argv.slice(2), { flowDir: canonicalFlowDir() }));
}
