#!/usr/bin/env node
// flow-recover.mjs — canonical's adapter over the template's stranded-task sweep.
//
// WHY THIS FILE EXISTS AT ALL. `_flow-recover.yml` runs `node .flow/bin/flow-recover.mjs` in the
// consuming repo, and canonical is one of those. It was missing, and the sweep opens with a
// bootstrap guard — `if [ ! -f .flow/bin/flow-recover.mjs ]` — so every scheduled run took that
// branch, printed "nothing to do" and exited 0. The workflow reported success roughly eight times
// a day for 160+ runs while never once reading canonical's store. A green check that verified
// nothing is precisely the failure mode this repo's other guards exist to prevent, and it hid the
// branch-discovery bug for the whole of that period: the sweep could not surface a defect in code
// it never reached.
//
// See parse-task-id.mjs in this directory for why canonical adapts rather than copies, and
// flow-doctor.mjs for why the store location has to be supplied here.
//
// WHAT THIS FILE IS NOT, as of flow-0121: a second copy of the template's CLI. It was one, and
// the copy went stale the way a second implementation always does — flow-0104 added
// `--open-pr-ready`, `ready-pr` and `promote` to the template and the copy grew none of them, so
// `promote-in-review` could never fire in canonical's own sweep. Nothing failed loudly: a missing
// flag arrives as 0 and a missing `ready-pr` prints nothing, which is exactly what "no ready PR"
// looks like. The CLI below is therefore ONE call into the template's `runRecoverCli`, which is
// the same shell every adopting repo runs, differing only in the store it is pointed at. Do not
// reintroduce a `cmd === …` branch here — adapters.test.mjs fails the build if one appears.
//
//   node .flow/bin/flow-recover.mjs classify --status in_progress --branch-exists 1 …
//   node .flow/bin/flow-recover.mjs list-in-progress
//   node .flow/bin/flow-recover.mjs branch-candidates flow-0040 claude/foo-x
//   gh pr list --state open --json title | node .flow/bin/flow-recover.mjs count-task-prs flow-0040
//   gh pr list --state open --json number,title,headRefName,isDraft,url \
//     | node .flow/bin/flow-recover.mjs ready-pr flow-0040 <branch>
//   node .flow/bin/flow-recover.mjs reset flow-0040
//   node .flow/bin/flow-recover.mjs promote flow-0040 <pr-url> <branch>

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runRecoverCli } from "../../project-template/.flow/bin/flow-recover.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/flow-recover.mjs for the incident this guards against.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// Re-exported, never re-implemented — including the pure helpers flow-0104 added
// (`readyOpenPr`, `buildPromoteEdit`), because a hand-kept re-export list is the same drift
// hazard in miniature as the hand-kept CLI this file used to carry.
export {
  classifyStranded, buildResetEdit, buildPromoteEdit, minutesSince, readTasks, readyOpenPr,
  recoveryBranchCandidates, isTaskPrTitle, runRecoverCli, DEFAULT_THRESHOLD_MINUTES,
} from "../../project-template/.flow/bin/flow-recover.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory. This is the whole
// point of the adapter: the template resolves `project-template/.flow/tasks`, so a copy would
// have swept the FIXTURE store and reset fixture tasks while canonical's real claims stranded.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ── the template's shell verbatim, pointed at canonical's store. Always exits 0: the
// sweep must degrade to a no-op rather than fail a scheduled run.
if (__isMain) {
  process.exit(runRecoverCli(process.argv.slice(2), { tasksDir: join(canonicalFlowDir(), "tasks") }));
}
