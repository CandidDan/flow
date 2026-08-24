#!/usr/bin/env node
// flow-review.mjs — canonical's adapter over the template's review-gate CLI.
//
// WHY THIS FILE EXISTS AT ALL. `_flow-review.yml` (flow-0007) runs `node .flow/bin/flow-review.mjs
// plan` — and later `verdict` — as a job on EVERY pull request. flow-0007's declared `touches`
// covered `project-template/.flow/bin/flow-review.mjs` (the shared logic every adopting repo
// gets) but never canonical's own adapter, so this file simply did not exist here: the same gap
// `flow-state.mjs`'s header describes happening once before ("nothing in CI invokes flow-state,
// so it was never added"), except this one is not latent — the reusable invokes it on every PR,
// so `flow-review / plan` has been failing on every open PR (`.flow/bin/flow-review.mjs is
// missing`) since flow-0007 merged. This closes that.
//
// See parse-task-id.mjs in this directory for why canonical adapts rather than copies, and
// flow-doctor.mjs for why the store location has to be supplied here.
//
// UNLIKE the other three adapters, this one supplies no repo root: `runPlan`'s `configPath`
// defaults to `.flow/config.yml` relative to the invoking process's own CWD, and `verdict`'s
// file argument is a path CI passes explicitly — both already resolve correctly for canonical
// when CI runs from canonical's own root (as it always does), exactly as they do for any
// adopting repo. So this adapter's only job is to exist and call the template's `runReviewCli`
// — the one thing genuinely canonical-specific about it is nothing at all, which is itself worth
// stating: an adapter that supplies zero repo-specific configuration is still an adapter, not a
// copy, because it imports rather than reimplements.
//
//   node .flow/bin/flow-review.mjs plan
//   node .flow/bin/flow-review.mjs verdict .flow-review/qa.json --check qa

import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runReviewCli } from "../../project-template/.flow/bin/flow-review.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/flow-review.mjs for the incident this class of check guards
// against generally. Here specifically: reached through a symlink, the CLI block never runs, the
// `plan`/`verdict` job silently produces nothing, and the review gate that exists to stop a
// worker certifying its own work goes green having certified nothing.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// The CLI's public surface, re-exported rather than reimplemented — same posture as the other
// adapters, so a consumer can import from either path and get one implementation.
export {
  CHECKS,
  DEFAULT_MAX_DIFF_BYTES,
  DEFAULT_MODEL,
  ReviewError,
  boundDiff,
  parseReviewConfig,
  parseVerdict,
  reviewBlock,
  runPlan,
  runReviewCli,
  securityDecision,
  verdictOutcome,
} from "../../project-template/.flow/bin/flow-review.mjs";

// ── CLI ──
if (__isMain) {
  process.exit(runReviewCli());
}
