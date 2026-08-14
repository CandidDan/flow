#!/usr/bin/env node
// flow-doctor.mjs — canonical's adapter over the template's flow-doctor.
//
// `_flow-gates.yml` runs `node .flow/bin/flow-doctor.mjs` in the consuming repo. See
// parse-task-id.mjs in this directory for why canonical adapts rather than copies.
//
// The one thing this file supplies that the template's CLI cannot is the store location:
// the template resolves `flowDir` from its own realpath, which points at
// `project-template/.flow` — the fixture store, not canonical's. Resolving it from *this*
// file's location points at canonical's real `.flow/`, which is the store that must be
// validated on every PR here.
//
//   node .flow/bin/flow-doctor.mjs
//
// Exits 1 on problems, 0 otherwise. Warnings report and do not fail — the same
// graceful-adoption posture the template uses.

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runDoctor } from "../../project-template/.flow/bin/flow-doctor.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export { compareVersions, findUncommittedTasks, runDoctor } from "../../project-template/.flow/bin/flow-doctor.mjs";

// Canonical's own store — `.flow/`, one level up from this `bin/` directory.
export function canonicalFlowDir(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..");
}

// ── CLI ──
if (__isMain) {
  const flowDir = canonicalFlowDir();
  const canonicalVersion = process.env.FLOW_CANONICAL_VERSION || undefined;
  const { problems, warnings, notes, count } = runDoctor({ flowDir, canonicalVersion });

  console.log(`flow-doctor: ${count} task(s) checked`);
  for (const n of notes ?? []) console.log(`  note  ${n}`);
  for (const w of warnings) console.warn(`  WARN  ${w}`);
  for (const p of problems) console.error(`  FAIL  ${p}`);
  if (!problems.length && !warnings.length) console.log("  store is healthy");
  process.exit(problems.length ? 1 : 0);
}
