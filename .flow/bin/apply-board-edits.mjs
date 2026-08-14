#!/usr/bin/env node
// apply-board-edits.mjs — canonical's adapter over the template's apply-board-edits.
//
// `_flow-status.yml` and `_flow-done.yml` write `.flow/board-edits.json` and then run
// `node .flow/bin/apply-board-edits.mjs` in the consuming repo. See parse-task-id.mjs in this
// directory for why canonical adapts rather than copies, and flow-doctor.mjs for why the store
// location has to be supplied here rather than inherited from the template's CLI.
//
//   node .flow/bin/apply-board-edits.mjs [edits.json] [--keep]
//
// Exits 1 on problems, 0 otherwise. The edits file is consumed (deleted) on a clean run so a
// re-run cannot silently reapply a stale transition.

import { existsSync, readFileSync, unlinkSync, realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { applyEdits } from "../../project-template/.flow/bin/apply-board-edits.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export { STATUSES, applyEdits } from "../../project-template/.flow/bin/apply-board-edits.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ──
function main(argv) {
  const flowDir = canonicalFlowDir();
  const tasksDir = join(flowDir, "tasks");

  const args = argv.slice(2);
  const keep = args.includes("--keep");
  const editsPath = resolve(args.find((a) => !a.startsWith("--")) || join(flowDir, "board-edits.json"));

  const die = (msg) => { console.error(`apply-board-edits: ${msg}`); process.exit(1); };

  if (!existsSync(editsPath)) die(`no edits file at ${editsPath}`);

  let payload;
  try { payload = JSON.parse(readFileSync(editsPath, "utf8")); }
  catch (e) { die(`could not parse ${editsPath}: ${e.message}`); }

  const updates = Array.isArray(payload) ? payload : payload.updates;
  if (!Array.isArray(updates)) die("edits file has no `updates` array");

  const { applied, problems, warnings } = applyEdits({ tasksDir, updates });

  if (warnings.length) console.warn("apply-board-edits: warnings:\n  - " + warnings.join("\n  - "));
  if (problems.length) console.error("apply-board-edits: problems:\n  - " + problems.join("\n  - "));
  console.log(`apply-board-edits: applied ${applied} update(s) from ${editsPath}`);

  if (!keep && problems.length === 0) unlinkSync(editsPath);   // consume it so it can't reapply

  process.exit(problems.length ? 1 : 0);
}

if (__isMain) main(process.argv);
