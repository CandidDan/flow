#!/usr/bin/env node
// flow-review.mjs — canonical's adapter over the template's review-gate helper.
//
// WHY THIS FILE EXISTS AT ALL. `_flow-review.yml` runs `node .flow/bin/flow-review.mjs` in the
// consuming repo, and canonical is one of those: flow-0015 added the `flow-review.yml` caller
// but not this adapter, so the review gate's `plan` step died on canonical's own PRs with
// ".flow/bin/flow-review.mjs is missing" (first seen on PR #25). The error's suggested remedy —
// run flow-sync — cannot apply here: canonical is the sync source, and deliberately has no
// flow-sync caller (see adapters.test.mjs). The fix is the same as for every other helper the
// reusables invoke: an adapter.
//
// See parse-task-id.mjs in this directory for why canonical adapts rather than copies, and
// flow-doctor.mjs for why the store location has to be supplied here.
//
// The one thing this file supplies that the template's CLI cannot is WHICH repo the review is
// planned against. The template's CLI resolves `.flow/config.yml`, `.flow-review/` and its git
// diffs from the process cwd — correct in CI, where the workflow runs at the workspace root,
// and wrong anywhere else. This adapter pins all three to canonical's own tree, resolved from
// this file's realpath, so the gate reads canonical's config and diffs canonical's history no
// matter where it is invoked from. Everything that decides anything is imported: `runReviewCli`
// is the template's own shell, returned exit code and all — a second copy of that shell is the
// flow-0008 hazard touches-guard.mjs documents.
//
//   node .flow/bin/flow-review.mjs plan
//   node .flow/bin/flow-review.mjs verdict .flow-review/qa.json --check qa
//
// The environment overrides the template's CLI honours (FLOW_CONFIG, REVIEW_OUT_DIR, BASE_REF,
// REVIEW_DIFF_MAX_BYTES) still win over the pinned defaults — same contract as in CI.

import { execFileSync } from "node:child_process";
import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runReviewCli } from "../../project-template/.flow/bin/flow-review.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// Reached through a symlink the CLI block never runs, `plan` materialises nothing, and the
// verdict steps that gate the PR are enforcing files that were never written — which the
// fail-closed verdict reader turns into a hard failure, not a silent pass. Still: a gate that
// fails for the wrong reason is a gate nobody trusts. Compare realpaths on both sides.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

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

// Canonical's own store — `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ──
if (__isMain) {
  const root = resolve(canonicalFlowDir(), "..");
  process.exit(runReviewCli(process.argv.slice(2), {
    configPath: join(canonicalFlowDir(), "config.yml"),
    outDir: join(root, ".flow-review"),
    git: (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }),
  }));
}
