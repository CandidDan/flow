#!/usr/bin/env node
// flow-kickback.mjs — canonical's adapter over the template's auto-fix decision helper.
//
// WHY AN ADAPTER AND NOT A COPY. `_flow-kickback.yml` runs `node .flow/bin/flow-kickback.mjs` in
// the consuming repo, and canonical is one of those. The originals live in
// `project-template/.flow/bin/`, where every adopting repo gets them; everything that DECIDES is
// imported from there, and only the CLI shell plus canonical's own store location lives here.
// A second copy of the decision logic is the flow-0008 hazard touches-guard.mjs documents.
//
// DO NOT REPLACE THIS WITH A SYMLINK. Every helper resolves its store as
// `dirname(realpath(import.meta.url))/..`, so a symlink would read the TEMPLATE's fixture store
// instead of canonical's, with every command still exiting 0.
//
// The one thing this file supplies that the template's CLI cannot is WHICH repo's config the cap
// is read from. The template's CLI takes `.flow/config.yml` from the `FLOW_CONFIG` environment
// variable — correct in CI, where the workflow sets it — and this adapter defaults it to
// canonical's own copy, resolved from this file's realpath, so a local run reads canonical's cap
// rather than the template's REPLACE-ME fixture.
//
//   node .flow/bin/flow-kickback.mjs decide
//   node .flow/bin/flow-kickback.mjs weakens /tmp/round.diff

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runKickbackCli } from "../../project-template/.flow/bin/flow-kickback.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// Reached through a symlink the CLI block never runs: the workflow's `decide` step writes no
// outputs, every downstream `if:` reads empty, and the run reports success having decided
// nothing. Compare realpaths on both sides.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export {
  AUTO_FIXABLE_CHECKS,
  CARD_FALLBACK_TITLE,
  CARD_MAX_CHARS,
  CARD_TITLE,
  DISPATCH,
  ESCALATE,
  HARD_MAX_ROUNDS,
  MERGE_LINE,
  MESSAGE_SEPARATOR,
  NEEDS_HUMAN_LABEL,
  OUTCOME_DIR,
  OUTCOME_FILE,
  OUTCOMES,
  REVIEWABLE_STATUS,
  ROUND_TRAILER,
  SECURITY_CHECK,
  SKIP,
  cardFooter,
  cardFromOutcome,
  countRounds,
  decide,
  decisionCard,
  effectiveCap,
  fitFields,
  isTestPath,
  parseAutoFixRounds,
  parseOutcome,
  roundTrailer,
  runKickbackCli,
  trailerBlock,
  validateCard,
  weakensReport,
  weakensTests,
} from "../../project-template/.flow/bin/flow-kickback.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ──
if (__isMain) {
  process.exit(runKickbackCli(process.argv.slice(2), {
    env: { FLOW_CONFIG: join(canonicalFlowDir(), "config.yml"), ...process.env },
  }));
}
