---
id: "flow-0213"
title: "A repo whose coverage command already runs every test can tell the gate not to run the tests a second time"
status: "in_review"
priority: 1
project: "flow"
owner: "session_01NfrcUA1iK1VWSMA6KY1Hmm"
created: "2026-11-06"
started: "2026-11-06T11:15:00Z"
branch: "claude/project-thread-jxfa8r"
pr: "https://github.com/CandidDan/flow/pull/299"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - ".github/workflows/_flow-gates.yml"
  - ".flow/bin/gate-cost.test.mjs"
  - "project-template/.flow/config.yml"
  - "changes/flow-0213.md"
labels: [cost]
model: ""
effort: ""
model_reason: ""
notes:
  - "2026-11-06 (orchestrator, on Dan's direction in the cost thread): written and claimed in the same session because Dan asked for the PR now and the ready queue is at queue_cap. Measured cost: in mapd every gate run spends 16 min in Test and then 18.5 min in Coverage, which reruns the same vitest suite (run https://github.com/CandidDan/mapd/actions/runs/42148195608)."
asks: []
---

## Summary

The gate job runs the repo's `test` command and then its `coverage` command. In most stacks the
coverage command runs the whole test suite again, with coverage switched on, and fails when a test
fails. So the suite runs twice and is billed twice. After this task, a repo can set
`coverage_runs_tests: true` in `.flow/config.yml`, and the gate then skips the separate Test step.
Coverage still runs, and still fails the gate on a failing test.

## Context

Measured on 6 Nov 2026 in `CandidDan/mapd`, a private repo, where Actions minutes are billed: Test
16 min, then Coverage 18.5 min, on every gate run. In `tanplan-platform`'s gate job: Test 4.6 min,
then Coverage 1.8 min. Dan's Actions budget is $50 a month and was at $35 on 6 Nov.

## Scope

- `_flow-gates.yml`, gate job: the "Read commands from .flow/config.yml" step also outputs
  `coverage_runs_tests`, read with `yq -r '.coverage_runs_tests // false'`. The Test step runs only
  when that output is not `true` (and, as today, only for a non-intent PR). The Coverage step is
  unchanged.
- `project-template/.flow/config.yml` documents the key, commented out, with when it is safe:
  only when the `coverage` command runs every test the `test` command runs and exits non-zero on a
  failing test.
- `changes/flow-0213.md`.

Not in scope: canonical's own `.flow/config.yml` (canonical is public, so its minutes are free);
setting the key in any adopting repo; the `source-root` job; `tanplan-platform`'s own copy of the
gate.

## Acceptance criteria

1. Given a config without `coverage_runs_tests` (or set to `false`), when the gate job runs on a
   non-intent PR or a manual run, then install, build, lint, test and coverage all run.
   Proved by `.flow/bin/gate-cost.test.mjs` :: "flow-0178 criterion 2: a non-intent PR, and a manual run, still run all five".
2. Given `coverage_runs_tests: true`, when the gate job runs on a non-intent PR, then install,
   build, lint and coverage run and test does not. Proved by `.flow/bin/gate-cost.test.mjs` ::
   "flow-0213 criterion 2: with coverage_runs_tests true, a non-intent PR skips Test and still runs Coverage".
3. The key is read in the config step and nowhere else, defaults to false, and a Test step that
   loses the condition is caught. Proved by `.flow/bin/gate-cost.test.mjs` ::
   "flow-0213 criterion 3 (mutation): the Test step that ignores coverage_runs_tests is caught, and the key defaults to false".
4. The changelog fragment exists and states the caller action. Proved by
   `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
