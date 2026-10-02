#!/usr/bin/env node
// queue-runner-schedule.mjs — canonical's adapter over the template's queue-runner schedule gate.
//
// `_flow-queue-runner.yml`'s schedule-gate job runs `node .flow/bin/queue-runner-schedule.mjs`
// in the consuming repo, and canonical is one of those. See queue-runner-verify.mjs in this
// directory for why canonical adapts rather than copies.
//
// Unlike the other adapters here, this one supplies NOTHING but the CLI shell: the decision is
// pure — a tick, two repo variables, and this workflow's earlier runs — so it reads no store and
// has no canonical-specific input to inject. The file still exists rather than being a copy or a
// symlink, for the reason CLAUDE.md gives: a copy drifts from the template at the next fix, and
// a symlink resolves into `project-template/.flow/bin/`, where every helper's store walk lands
// in the fixture tree with the command still exiting 0.
//
// Canonical's own caller is `workflow_dispatch`-only (no `schedule:` block — see
// `.github/workflows/flow-queue-runner.yml`), so in THIS repo the gate job never fires and this
// adapter exists to keep the reusable's contract honest for the repos where it does.
//
//   node .flow/bin/queue-runner-schedule.mjs --event schedule --now 2026-10-02T20:00:00Z \
//        --tz Australia/Sydney --run-hour 7 --runs-file earlier-runs.json
//
// Exits 0 whichever way the decision goes; `proceed=true|false` in `$GITHUB_OUTPUT` is the answer.

import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runCli } from "../../project-template/.flow/bin/queue-runner-schedule.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// A CLI block that never runs writes no `proceed` output, the dispatch job's condition reads an
// empty string, and the queue runner silently stops working — green, every hour. See the
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
  DEFAULT_RUN_HOUR,
  DEFAULT_TZ,
  decisionArgsFromFlags,
  isKnownZone,
  localParts,
  parseFlags,
  quoteValue,
  readRunsFile,
  resolveSchedule,
  runCli,
  scheduleDecision,
  summaryLine,
} from "../../project-template/.flow/bin/queue-runner-schedule.mjs";

// ── CLI ──
if (__isMain) {
  runCli(process.argv.slice(2));
}
