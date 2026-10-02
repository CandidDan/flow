---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0106"
title: "The watchdog stops calling one failing pull-request check 'automation down': an event workflow is down only on a streak of failures"
status: "done"
priority: 3
project: "flow"
owner: "claude-worker-flow-0106"
created: "2026-09-30"
started: "2026-10-01T15:32:20Z"
branch: "flow/flow-0106-event-liveness-failure-streak"
pr: "https://github.com/CandidDan/flow/pull/157"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # watchdog accuracy; same anchor as flow-0066/0067
touches:
  - "flightdeck/bin/liveness.mjs"
  - "flightdeck/bin/liveness.test.mjs"
  - "flightdeck/bin/watchdog.mjs"
  - "flightdeck/bin/watchdog.test.mjs"
labels: [infra, watchdog, liveness, false-positive]
notes:
  - "2026-09-30 (orchestrator): Written at the human's request from CandidDan/flow#130 ('Automation down: flow-review'). The 2026-09-29 flow-review run that triggered it was a reviewer returning FAIL on a PR — the check doing its job, not the machinery breaking. The next run succeeded. The same shape flapped before: #115 auto-closed 2026-09-28, #130 opened 2026-09-29. Every PR a reviewer or the gate rejects files an 'automation down' issue in the one channel that must not cry wolf."
  - "2026-09-30 (orchestrator): Why the rule is a streak and not 'ignore pull_request failures'. flow-status, flow-done and flow-open-pr also run on pull_request events, and a failure there IS broken machinery. Keying on the event type would blind the watchdog to those. What separates a verdict from a breakage is spread: a broken workflow fails every run, on every PR; a verdict fails one PR. The page of runs needed to see that is already fetched (RUN_PAGE = 100) and only the newest is kept today."
  - "2026-09-30 (orchestrator): Overlaps flow-0066 (ready) on liveness.mjs and flow-0067 (blocked) on watchdog.mjs. Sequence behind flow-0066 if both are ready; the changes are to different functions (scheduled bound vs event rule)."
  - "2026-09-30 (orchestrator): No changelog fragment: flightdeck/ is canonical-only and not part of the synced surface, matching flow-0066."
  - "2026-10-01T15:37:40Z (worker): Branch flow/flow-0106-event-liveness-failure-streak pushed. Done: eventLiveness takes optional recentRuns with the streak rule + the two named constants (EVENT_FAILURE_STREAK, PR_STREAK_DISTINCT_BRANCHES), isCompletedRun exported from liveness.mjs, recentRunSummaries + recentRuns wiring in watchdog.mjs, and liveness.test.mjs covers criteria 1-6 (44 tests green). Not done: watchdog.test.mjs tests for criteria 7-8, and the flow-0061 criterion-5 test at watchdog.test.mjs:938 still expects crit from ONE failed pull_request run end-to-end — that fixture must become a 3-branch streak, since the new rule deliberately makes a single rejected PR good. Next: write those tests, run all five gate commands, open the PR."
  - "2026-10-01T15:44:34Z (worker): Done and handed off. PR #157 marked ready for review from branch flow/flow-0106-event-liveness-failure-streak. All 8 acceptance criteria have a named proving test; gate green locally (build 34 workflows, lint 104 .mjs, test 1571 pass/0 fail, coverage 96.02% vs floor 83.5). Diff is the four declared touches paths only. Two notes a reviewer should not re-litigate: (1) the flow-0061 criterion-5 test was rewritten because it asserted crit from ONE failed pull_request run end to end — exactly the false alarm this task removes — and its fixture is now a 3-PR streak, with what flow-0061 actually pins (ran-and-failed is not reported as a parse failure) intact; (2) the comment in liveness.mjs names canonical issue #130 WITHOUT the CandidDan/flow prefix on purpose — .flow/bin/adr-split-authoring.test.mjs censuses files carrying that bare string against a count in docs/adr/, and bumping that count is outside this task touches. Next: human review/merge; flow-done sets status."
---

## Context

`eventLiveness` (`flightdeck/bin/liveness.mjs`) calls an event-triggered workflow `crit` whenever
its **latest** run concluded `failure`. For a pull-request check that verdicts on the PR —
flow-review, flow-gates, plane-guard, an adopter's own CI — the latest run fails every time a PR is
rejected. The watchdog then files an `automation-down` issue, and closes it when the next PR passes.

`collectRepoEntries` (`flightdeck/bin/watchdog.mjs`) already requests a page of up to 100 runs per
workflow and keeps only the newest (`newestRun`). The runs it discards are what tells a verdict from
a breakage.

## Scope

**Does:**
- `collectRepoEntries` keeps, alongside `latestRun`, a `recentRuns` list built from the same
  response (no extra API call): for each run, `conclusion`, `event`, `head_branch`, `head_sha` and
  `created_at`, newest first, completed runs only (skip runs whose `status` is not `completed`).
- `eventLiveness` takes an optional `recentRuns`. When it is **absent** (as from `mission-control.mjs`,
  which is not changed), behaviour is exactly today's: latest run failed → `crit`.
  When it is **present**, take the streak of consecutive `failure` runs from the newest:
  - if the streak's runs are all `pull_request` or `pull_request_target` events, `crit` only when the
    streak spans **at least 3 distinct `head_branch` values** (three different PRs failing in a row);
  - otherwise (any other event in the streak, e.g. `push`, `workflow_run`), `crit` when the streak is
    **at least 3 runs long**;
  - a shorter streak is `good`, with no alarm.
  The `crit` reason names the count and the spread, e.g. `last 4 runs failed across 3 pull requests`
  or `last 3 runs failed (push)`.
- The two thresholds are named constants in `liveness.mjs` with a one-line comment each.
- `evaluateWorkflows` passes `recentRuns` into `eventLiveness`.
- The startup-failure check (`startupFailure`, flow-0061) is unchanged and still runs first, so a
  workflow GitHub cannot parse is still reported on its first failed run.

**Does not touch:** `scheduledLiveness` and the crit bound (flow-0066); `mission-control.mjs`; the
issue body, labels or the open/close protocol; the self-report gap (flow-0067).

## Acceptance criteria

- [ ] Given no `recentRuns` and a failed latest run, when `eventLiveness` runs, then it returns `crit`
      (unchanged for existing callers).
- [ ] Given `recentRuns` whose newest run is a failed `pull_request` run on one branch and the next is
      a success, then it returns `good`.
- [ ] Given five consecutive failed `pull_request` runs all on the same `head_branch`, then it returns
      `good` (one PR being rejected repeatedly is a verdict).
- [ ] Given three consecutive failed `pull_request` runs on three different `head_branch` values, then
      it returns `crit` and the reason names 3 runs across 3 pull requests.
- [ ] Given three consecutive failed `push` runs, then it returns `crit`; given two, then `good`.
- [ ] Given `recentRuns` containing in-progress runs, then they are ignored when finding the streak.
- [ ] Given a workflow whose file GitHub could not parse, then `evaluateWorkflows` still reports it via
      the startup-failure path on the first failed run, whatever `recentRuns` holds.
- [ ] `collectRepoEntries` builds `recentRuns` from the same `/runs?per_page=` response it already
      requests; a test with a stubbed `io.rest` asserts no additional request is made per workflow.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
