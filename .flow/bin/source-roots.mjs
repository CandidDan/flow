#!/usr/bin/env node
// source-roots.mjs — canonical's adapter over the template's source-roots helper.
//
// `_flow-gates.yml` runs `node .flow/bin/source-roots.mjs plan` (and then `run`) in the
// *consuming* repo, and canonical is one of those. See parse-task-id.mjs in this directory for
// why canonical adapts rather than copies: a copy inside the repo that authors the original is
// two implementations that will disagree, in the one repo where a disagreement propagates to
// every other.
//
// The one thing this file supplies that the template's CLI cannot is the store location. The
// template resolves its root from its own realpath, which points at `project-template/` — the
// fixture tree, whose `.flow/config.yml` is the uncalibrated REPLACE-ME one. Resolving it from
// *this* file's location points at canonical's real root, which is the tree the gate must plan
// and run against.
//
// (A symlink would not work, for exactly that reason: `realpathSync` would resolve back to the
// template and every command would still exit 0, having planned the wrong repo.)
//
//   node .flow/bin/source-roots.mjs plan   # prints `matrix=<json>` and `count=<n>`
//   node .flow/bin/source-roots.mjs run    # runs one entry's check, from FLOW_SOURCE_ROOT_*
//
// Canonical's own plan is EMPTY, by design: all four of its source_roots declare `npm run lint`
// or `npm run build`, which the `gate` job already runs, so every entry is excluded as already
// covered. `count=0` here is the check working, not the check missing.

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { main } from "../../project-template/.flow/bin/source-roots.mjs";

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
  DEFAULT_RETRY, DEFAULT_RUNTIME, DEFAULT_VERSIONS, ENTRY_FIELDS, MAX_RETRY, PLACEHOLDER,
  PRIMARY_COMMAND_KEYS, RUNTIMES, isPlaceholder, main, parseCommands, parseSourceRoots,
  planSourceRoots, runCheck,
} from "../../project-template/.flow/bin/source-roots.mjs";

// Canonical's own root — two levels up from this `bin/` directory — and the config beside it.
export function canonicalRepoRoot(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..", "..");
}
export function canonicalConfigPath(here = __fileURLToPath(import.meta.url)) {
  return join(canonicalRepoRoot(here), ".flow", "config.yml");
}

// ── CLI ──
if (__isMain) {
  process.exit(main(process.argv.slice(2), {
    configPath: canonicalConfigPath(),
    repoRoot: canonicalRepoRoot(),
  }));
}
