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
//   node .flow/bin/flow-recover.mjs classify --status in_progress --branch-exists 1 …
//   node .flow/bin/flow-recover.mjs list-in-progress
//   node .flow/bin/flow-recover.mjs branch-candidates flow-0040 claude/foo-x
//   gh pr list --state open --json title | node .flow/bin/flow-recover.mjs count-task-prs flow-0040
//   node .flow/bin/flow-recover.mjs reset flow-0040

import { readFileSync, realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import {
  buildResetEdit, classifyStranded, isTaskPrTitle, readTasks, recoveryBranchCandidates,
  DEFAULT_THRESHOLD_MINUTES,
} from "../../project-template/.flow/bin/flow-recover.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/flow-recover.mjs for the incident this guards against.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export {
  classifyStranded, buildResetEdit, minutesSince, readTasks, recoveryBranchCandidates,
  isTaskPrTitle, DEFAULT_THRESHOLD_MINUTES,
} from "../../project-template/.flow/bin/flow-recover.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory. This is the whole
// point of the adapter: the template resolves `project-template/.flow/tasks`, so a copy would
// have swept the FIXTURE store and reset fixture tasks while canonical's real claims stranded.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

// ── CLI ── mirrors the template's shell, differing only in the store it reads. Always exits 0:
// the sweep must degrade to a no-op rather than fail a scheduled run.
if (__isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const tasksDir = join(canonicalFlowDir(), "tasks");

  if (cmd === "classify") {
    const f = parseFlags(rest);
    process.stdout.write(classifyStranded(
      { status: f.status },
      {
        branchExists: Number(f["branch-exists"] || 0) > 0,
        hasOpenPr: Number(f["has-open-pr"] || 0) > 0,
        aheadOfBase: Number(f.ahead || 0) > 0,
        ageMinutes: Number(f.age || 0),
      },
      f.threshold ? Number(f.threshold) : DEFAULT_THRESHOLD_MINUTES,
    ) + "\n");
  } else if (cmd === "list-in-progress") {
    for (const t of readTasks(tasksDir)) {
      if (t.status === "in_progress") {
        process.stdout.write(`${t.id}\t${t.started}\t${t.branch}\n`);
      }
    }
  } else if (cmd === "branch-candidates") {
    const [id, declared] = rest;
    if (id) for (const p of recoveryBranchCandidates(id, declared)) process.stdout.write(p + "\n");
  } else if (cmd === "count-task-prs") {
    const id = rest[0];
    let raw = "";
    try { raw = readFileSync(0, "utf8"); } catch { raw = ""; }
    let n = 0;
    try {
      const prs = JSON.parse(raw || "[]");
      if (Array.isArray(prs)) n = prs.filter((p) => isTaskPrTitle(p && p.title, id)).length;
    } catch { n = 0; }
    process.stdout.write(String(n) + "\n");
  } else if (cmd === "reset") {
    const id = rest[0];
    if (id) process.stdout.write(JSON.stringify({ updates: [buildResetEdit(id)] }) + "\n");
  } else {
    process.stderr.write(
      "usage: flow-recover.mjs <classify|list-in-progress|branch-candidates|count-task-prs|reset> …\n",
    );
  }
  process.exit(0);
}
