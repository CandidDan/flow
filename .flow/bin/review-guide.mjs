#!/usr/bin/env node
// review-guide.mjs — canonical's adapter over the template's review-guide helper (flow-0084).
//
// WHY THIS FILE EXISTS. `_flow-review.yml`'s `guide` job runs `node $FLOW_REVIEW_DIR/review-guide.mjs`
// in the consuming repo, and canonical is one of those. Same reason as `.flow/bin/flow-review.mjs`,
// and the same shape: everything that decides anything is imported, and the only thing supplied
// here is WHICH repo the guide is computed for.
//
// The template's CLI resolves `.flow/config.yml` and `.flow-review/` from the process cwd — right
// in CI, where the workflow runs at the workspace root, and wrong anywhere else. This pins both to
// canonical's own tree, resolved from this file's realpath.
//
// DO NOT REPLACE THIS WITH A COPY, AND DO NOT SYMLINK IT. The store is resolved as
// `dirname(realpath(import.meta.url))/..`, so a symlink would read the TEMPLATE's fixture tree
// while still exiting 0. See `.flow/bin/flow-review.mjs` and CLAUDE.md's adapters section.
//
//   node .flow/bin/review-guide.mjs facts
//   node .flow/bin/review-guide.mjs comment
//   node .flow/bin/review-guide.mjs comment-id comments.json
//
// The environment overrides the template's CLI honours (FLOW_CONFIG, REVIEW_OUT_DIR) still win
// over the pinned defaults — same contract as in CI.

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runGuideCli } from "../../project-template/.flow/bin/review-guide.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// Reached through a symlink the CLI block never runs, the guide writes no comment, and the job
// shows a green tick over nothing. Compare realpaths on both sides.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export {
  ASSUMPTIONS_HEADING,
  GUIDE_MARKER,
  GuideError,
  HOTSPOT_KINDS,
  LOOK_HERE_MAX,
  NO_ASSUMPTIONS,
  PROSE_UNAVAILABLE,
  assumptionsSection,
  computeFacts,
  factsBrief,
  guideComment,
  isTestFile,
  parseDiffFiles,
  parseProse,
  pickGuideComment,
  rankHotspots,
  runGuideCli,
  selectLookHere,
  testChanges,
  touchesFromTaskContext,
  verdictRows,
} from "../../project-template/.flow/bin/review-guide.mjs";

// Canonical's own `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ──
if (__isMain) {
  const root = resolve(canonicalFlowDir(), "..");
  process.exit(runGuideCli(process.argv.slice(2), {
    configPath: join(canonicalFlowDir(), "config.yml"),
    outDir: join(root, ".flow-review"),
  }));
}
