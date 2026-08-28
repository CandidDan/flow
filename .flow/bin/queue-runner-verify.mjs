#!/usr/bin/env node
// queue-runner-verify.mjs — canonical's adapter over the template's queue-runner verifier.
//
// `_flow-queue-runner.yml`'s "Verify the worker produced an outcome" step runs
// `node .flow/bin/queue-runner-verify.mjs` in the consuming repo, and canonical is one of
// those. See parse-task-id.mjs in this directory for why canonical adapts rather than copies,
// and flow-doctor.mjs for why the store location has to be supplied here.
//
// The one thing this file supplies that the template's CLI cannot is WHICH store to read the
// task's status from. The template resolves the store from its own realpath, which is
// `project-template/.flow/tasks/` — the fixture store, which holds no real task. Run from
// there, outcome 3 (blocked + reason) could never hold for a canonical task and outcome
// checks would judge the wrong tree while still printing a plausible verdict.
//
// Not a copy and NOT a symlink: a symlink resolves to the template's bin directory, so the
// store walk lands in the fixture store with every command still exiting cleanly — the exact
// silent-wrong-store failure CLAUDE.md names.
//
//   node .flow/bin/queue-runner-verify.mjs --task-id flow-0025 \
//        --branch-exists 1 --ahead 3 --has-open-pr 0
//
// Exits 0 when the run left a verifiable outcome (branch pushed / PR open / blocked with a
// reason), 1 otherwise — the non-zero exit is what fails the queue-runner job.

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import {
  parseFlags,
  reportAndExit,
  runVerify,
  verifyArgsFromFlags,
} from "../../project-template/.flow/bin/queue-runner-verify.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// A verifier whose CLI block never runs exits 0 having checked nothing — the job goes green
// on the worker's word alone, which is the failure this helper exists to remove. See the
// template file's header for the full mechanism.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// The public surface, re-exported rather than reimplemented — same posture as the other
// adapters, so a consumer can import from either path and get one implementation.
export {
  parseFlags,
  readTaskState,
  reportAndExit,
  runVerify,
  verifyArgsFromFlags,
  verifyOutcome,
} from "../../project-template/.flow/bin/queue-runner-verify.mjs";

// Canonical's repo root — two levels up from this `bin/` directory (`.flow/bin` -> `.flow` -> repo).
export function canonicalRepoRoot(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..", "..");
}

// Canonical's own store — the directory whose task the verifier must judge.
export function canonicalTasksDir(root = canonicalRepoRoot()) {
  return join(root, ".flow", "tasks");
}

// ── CLI ──
if (__isMain) {
  const flags = parseFlags(process.argv.slice(2));
  reportAndExit(runVerify(verifyArgsFromFlags(flags, canonicalTasksDir())));
}
