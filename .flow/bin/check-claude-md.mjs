#!/usr/bin/env node
// check-claude-md.mjs — canonical's adapter over the template's CLAUDE.md ceiling check.
//
// `_flow-gates.yml` runs `node .flow/bin/check-claude-md.mjs` in the *consuming* repo, and
// canonical is one of those. See source-roots.mjs in this directory for why canonical adapts
// rather than copies: a copy inside the repo that authors the original is two implementations
// that will disagree, in the one repo where a disagreement propagates to every other.
//
// The one thing this file supplies that the template's CLI cannot is WHICH REPO to measure. The
// template resolves its root from its own realpath, which points at `project-template/` — so its
// CLI measures the template's fixture `CLAUDE.md` plus `project-template/.flow/PROTOCOL.md`
// (26,899 bytes), against the uncalibrated REPLACE-ME config beside it. Resolving the root from
// *this* file's location points at canonical's real root, whose `CLAUDE.md` is the session brief
// the gate must actually hold to canonical's own `claude_md_max`.
//
// (A symlink would not work, for exactly that reason: `realpathSync` would resolve back to the
// template and the command would still exit 0, having measured the wrong repo — and the number it
// printed would even look plausible.)
//
// The host file is NOT defaulted here either, for the same reason it is not defaulted in the
// template: `protocol-portability.test.mjs` forbids the filename in a bin helper's executable code
// in BOTH directories. It arrives as `--entry <path>`, from the gate step.
//
//   node .flow/bin/check-claude-md.mjs --entry CLAUDE.md           # enforce
//   node .flow/bin/check-claude-md.mjs --entry CLAUDE.md --json    # the same verdict as data

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { main } from "../../project-template/.flow/bin/check-claude-md.mjs";

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
  CEILING_KEY, ENTRY_ENV, ENTRY_FLAG, MAX_IMPORT_DEPTH, USAGE, checkClaudeMd, main, parseCeiling,
  parseImports, resolveEntry, resolveImportSet,
} from "../../project-template/.flow/bin/check-claude-md.mjs";

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
    repoRoot: canonicalRepoRoot(),
    configPath: canonicalConfigPath(),
  }));
}
