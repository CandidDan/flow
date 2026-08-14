#!/usr/bin/env node
// touches-guard.mjs — canonical's adapter over the template's touches-guard.
//
// `_flow-gates.yml` runs `node .flow/bin/touches-guard.mjs` in the consuming repo. See
// parse-task-id.mjs in this directory for why canonical adapts rather than copies, and
// flow-doctor.mjs for why the store location has to be supplied here.
//
// The glob matching, the `touches` frontmatter parse (both YAML forms) and the id resolution
// are all imported — `checkTouches`, `parseTouches` and `parseTaskId` are the template's, with
// its proving tests behind them. Only the task-file lookup is local, because the template does
// not export it; it is a filename-to-id scan over canonical's own `.flow/tasks/`.
//
//   HEAD_REF=… PR_TITLE=… BASE_REF=… node .flow/bin/touches-guard.mjs
//
// Exits 1 when the diff strays outside the claimed task's declared `touches`, 0 otherwise.
// Skips cleanly (exit 0) when no task id resolves — an untagged PR is the automation's no-op,
// and the store-guard plus review cover it.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { checkTouches, parseTouches } from "../../project-template/.flow/bin/touches-guard.mjs";
import { parseTaskId } from "../../project-template/.flow/bin/parse-task-id.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// This one matters most: reached through a symlink the CLI block never runs, the scope check
// silently does not happen, and the gate goes GREEN. A guard that fails open is worse than no
// guard, because it reports enforcement it did not perform.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export { checkTouches, globToRegExp, parseTouches } from "../../project-template/.flow/bin/touches-guard.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// The task file in `tasksDir` whose frontmatter `id` is `id`, or null. Not exported by the
// template, so it lives here — a scan, not a second implementation of any parsing rule.
export function findTaskFile(tasksDir, id) {
  for (const name of readdirSync(tasksDir)) {
    if (!name.endsWith(".md") || name === "_TEMPLATE.md") continue;
    const file = join(tasksDir, name);
    const m = readFileSync(file, "utf8").match(/^id:\s*"?([^"\n]+)"?/m);
    if (m && m[1].trim() === id) return file;
  }
  return null;
}

// ── CLI ──
if (__isMain) {
  const tasksDir = join(canonicalFlowDir(), "tasks");
  const headRef = process.env.HEAD_REF
    || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"]).toString().trim();
  const prTitle = process.env.PR_TITLE || "";

  // Branch first, PR title second — the same resolution flow-status/flow-done use. Matching on
  // the branch alone meant every cloud-session PR (forced onto `claude/…` by the platform)
  // skipped the guard silently, which is exactly the branch this PR is on.
  const id = parseTaskId(headRef, prTitle);
  if (!id) {
    console.log(`touches-guard: no task id in branch '${headRef}' or title '${prTitle}' — skipping.`);
    process.exit(0);
  }

  const file = findTaskFile(tasksDir, id);
  if (!file) {
    console.log(`touches-guard: no task file for ${id} — skipping (store-guard / review will catch oddities).`);
    process.exit(0);
  }

  const touches = parseTouches(readFileSync(file, "utf8"));
  if (touches.length === 0) {
    console.warn(`touches-guard: ${id} declares no touches — cannot enforce a blast radius. ` +
      `flow-doctor flags this; add touches to make scope checkable. Passing for now.`);
    process.exit(0);
  }

  const base = process.env.BASE_REF || "origin/main";
  const changedFiles = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`])
    .toString().split("\n").map((s) => s.trim()).filter(Boolean);

  const { outside, checked } = checkTouches({ changedFiles, touches });
  console.log(`touches-guard: ${id} — ${checked} feature file(s) checked against ${touches.length} glob(s).`);
  if (outside.length) {
    console.error("::error::Changed files fall outside this task's declared `touches`:");
    for (const f of outside) console.error(`  outside touches: ${f}`);
    console.error("Either narrow the change to the declared scope, or — if the wider radius is " +
      "real — block the task and have the orchestrator update `touches` on main before continuing. " +
      "Do not widen scope silently.");
    process.exit(1);
  }
  process.exit(0);
}
