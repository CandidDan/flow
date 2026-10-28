---
id: "flow-0173"
title: "flow-unblock releases blocked tasks and stops there: it no longer dispatches flow-queue-runner, because the worker routine's schedule picks up ready work"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-code:worker-flow-0173"
created: "2026-10-28"
started: "2026-10-28T03:38:36Z"
branch: "flow/flow-0173-unblock-stops-dispatching"
pr: "https://github.com/CandidDan/flow/pull/254"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G9"]
intent: "model-work-off-github-actions"
touches:
  - ".github/workflows/_flow-unblock.yml"
  - "project-template/.github/workflows/flow-unblock.yml"
  - ".github/workflows/flow-unblock.yml"
  - "project-template/.flow/bin/flow-unblock.mjs"
  - "project-template/.flow/bin/flow-unblock.test.mjs"
  - ".flow/bin/adapters.test.mjs"
  - ".flow/bin/queue-runner-bot-dispatch.test.mjs"
  - ".flow/bin/unblock-no-dispatch.test.mjs"
  - "project-template/.flow/PROTOCOL.md"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0173.md"
labels: [workflows, unblock, routines, cost]
model: "opus"
effort: "medium"
model_reason: "Changes a reusable workflow every adopting repo runs, and the protocol text describing it"
notes:
  - "2026-10-28 worker: kept count-ready/count-active-runs/should-dispatch/dispatch-outcome in project-template/.flow/bin/flow-unblock.mjs. git grep shows canonical's adapter .flow/bin/flow-unblock.mjs (outside touches) re-exports shouldDispatch, countActiveRuns, httpStatusOf, dispatchOutcome by name, so removing them breaks its import. Their tests stay. A comment marks them unused."
  - "2026-10-28 worker: done on branch flow/flow-0173-unblock-stops-dispatching, PR https://github.com/CandidDan/flow/pull/254. Dispatch step removed; queue_runner_workflow declared and ignored; caller permissions untouched. Local gate: build, lint and coverage (97.46%) green. test has 5 failures that also fail on clean main (adapters flightdeck + flow-state --json, flow-init-downstream, release-assemble rerun). Next: CI and review checks, then the human merges."
asks:
  - "follow-up: drop the now-unused actions: write from both flow-unblock.yml callers (a caller-permission change)."
  - "follow-up: when the queue runner is retired (flow-0174 or later), delete the four dispatch subcommands and functions from project-template/.flow/bin/flow-unblock.mjs together with their re-export in .flow/bin/flow-unblock.mjs."
---

## Context

Intent `model-work-off-github-actions` (merged 2026-10-28, PR #250): Flow's model work moves off
GitHub Actions, and Dan's own call is "queue runner has to go". flow-0172 makes the worker loop
runnable from a Claude Code cloud routine, which is started on a schedule (hourly at most) or by
an API call, and picks the top `ready` task itself with `.flow/bin/pick-task.mjs`.

`_flow-unblock.yml` does two things today (its header, steps 1 and 2). Step 1 releases every
`blocked` task whose `blocked_by` entries have all resolved. Step 2, "Start the next worker",
dispatches `flow-queue-runner.yml` through `POST repos/$GITHUB_REPOSITORY/actions/workflows/$RUNNER_WF/dispatches`
when a task is `ready`, no queue-runner run is active and `FLOW_QUEUE_RUNNER` is not `paused`.

Step 2 now points at a workflow that is being retired: on 2026-10-28 `flow-queue-runner` was
disabled by hand in every private Flow repo (tanplan-platform, write, inflight, Nudge, progress,
mapd, meadow). A released task becomes `ready`, and the routine's next scheduled run picks it.
Nothing needs to be dispatched.

## Scope

- `.github/workflows/_flow-unblock.yml`: remove the "Start the next worker" step, and rewrite the
  header so it describes one job (release) and says the worker routine's schedule picks up what
  it releases. Keep the `queue_runner_workflow` input **declared** but unused, with a comment that
  it is ignored and kept so a caller that still passes it does not fail at startup. Removing a
  declared input is a caller-contract break.
- `project-template/.flow/bin/flow-unblock.mjs`: remove the subcommands only step 2 used
  (`count-ready`, `count-active-runs`, `should-dispatch`, `dispatch-outcome`) and their tests in
  `flow-unblock.test.mjs`, **if and only if** nothing else in the repo calls them
  (`git grep` proves it). If something does, keep them and say so in a `notes` line.
- Both callers (`project-template/.github/workflows/flow-unblock.yml` and canonical's own
  `.github/workflows/flow-unblock.yml`): update only the comments that say unblock dispatches
  flow-queue-runner. **Do not change their `permissions:`, triggers or `with:`.** Dropping the
  now-unneeded `actions: write` grant is a separate decision (see Notes).
- `.flow/bin/adapters.test.mjs` and `.flow/bin/queue-runner-bot-dispatch.test.mjs`: change only the
  assertions that pin the dispatch step, so they now assert it is absent.
- New `.flow/bin/unblock-no-dispatch.test.mjs`: fails if `_flow-unblock.yml` contains any
  `actions/workflows/` dispatch call or a step named "Start the next worker".
- `project-template/.flow/PROTOCOL.md`: in the `blocked_by` paragraph, replace "then starts the
  next worker" with wording saying the released task is picked up by the next worker run. Change
  nothing else in that file.
- `docs/flow-reusable-workflows.md`: update the flow-unblock row and section to match.
- Changelog fragment `changes/flow-0173.md`. **Caller action: run flow-sync.** A MINOR release:
  no caller needs a new input, secret or grant.

**Deliberately does NOT:**
- Delete or edit `flow-queue-runner` (reusable, callers or helpers). That is the retirement task.
- Change how release (step 1) decides anything.
- Add any routine-firing API call or secret. Firing on demand belongs to inflight's "Work this →",
  in the inflight repo.

## Acceptance criteria

- [ ] Given `.github/workflows/_flow-unblock.yml`, when it is parsed, then no step dispatches a workflow and no step is named "Start the next worker" (`.flow/bin/unblock-no-dispatch.test.mjs`).
- [ ] Given `_flow-unblock.yml`, when its `workflow_call.inputs` are parsed, then `queue_runner_workflow` is still declared, so a caller passing it still starts (same test file).
- [ ] Given a store with a `blocked` task whose every `blocked_by` entry has resolved, when the release step's logic runs, then the task is set `ready` with `blocked_reason` and `blocked_by` cleared, exactly as before (`project-template/.flow/bin/flow-unblock.test.mjs`, the existing release tests unchanged and passing).
- [ ] Given both `flow-unblock.yml` callers, when their `permissions:` blocks are parsed, then they are unchanged from `main` before this task (`.flow/bin/adapters.test.mjs` and the existing `unblock-pr-read-scope.test.mjs` passing unmodified).
- [ ] Given `project-template/.flow/PROTOCOL.md`, when the `blocked_by` paragraph is read, then it no longer says flow-unblock "starts the next worker" (`.flow/bin/unblock-no-dispatch.test.mjs`).
- [ ] Given `changes/flow-0173.md`, then it states the caller action "run flow-sync" (`.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- The callers keep `actions: write`, which only the removed step needed. Dropping it is a caller
  permission change; raise it as a `follow-up` ask rather than doing it here.
- If removing the subcommands would drop coverage below the floor, keep the coverage honest by
  removing their tests with them. Never lower `coverage_min`.
