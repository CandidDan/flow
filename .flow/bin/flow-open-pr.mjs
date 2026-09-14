#!/usr/bin/env node
// flow-open-pr.mjs — canonical's adapter over the template's open-PR decision.
//
// `_flow-open-pr.yml` (on branch push) and `_flow-recover.yml` (the reopen-pr recovery path)
// both run `node .flow/bin/flow-open-pr.mjs` in the consuming repo, and canonical is one of
// those. See parse-task-id.mjs in this directory for why canonical adapts rather than copies,
// and flow-doctor.mjs for why the store location has to be supplied here.
//
//   node .flow/bin/flow-open-pr.mjs --branch claude/foo-x --base main --ahead 3 \
//        --has-open-pr 0 --id flow-0042
//
// Prints the PR to open as JSON, or nothing. Always exits 0.

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { decideOpenPr, idFromBranch, readTaskTitle } from "../../project-template/.flow/bin/flow-open-pr.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See project-template/.flow/bin/flow-open-pr.mjs for the incident this guards against.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export { decideOpenPr, idFromBranch, readTaskTitle } from "../../project-template/.flow/bin/flow-open-pr.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory. The template would
// resolve `project-template/.flow`, whose fixture tasks would supply the wrong PR title.
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

// ── CLI ── mirrors the template's shell exactly, differing only in the store it reads. `--id`
// is the recovery override: it names the task when the branch is a platform-assigned `claude/…`
// that idFromBranch cannot parse.
if (__isMain) {
  const flags = parseFlags(process.argv.slice(2));
  const branch = flags.branch;
  const baseBranch = flags.base || "main";
  const aheadOfBase = Number(flags.ahead || 0) > 0;
  const hasOpenPr = Number(flags["has-open-pr"] || 0) > 0;

  const id = flags.id || idFromBranch(branch);
  const taskTitle = id ? readTaskTitle(join(canonicalFlowDir(), "tasks"), id) : "";

  const decision = decideOpenPr({ branch, baseBranch, hasOpenPr, aheadOfBase, taskTitle, id });
  if (decision) process.stdout.write(JSON.stringify(decision) + "\n");
  process.exit(0);
}
