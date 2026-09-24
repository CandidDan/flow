---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0080"
title: "Give the queue runner's schedule its own pause switch, so pausing it no longer switches off review"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-24"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]           # today the only way to pause the runner also silently stops every review
touches:
  - ".github/workflows/_flow-queue-runner.yml"
  - "project-template/.github/workflows/flow-queue-runner.yml"
  - ".flow/bin/queue-runner-switch.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0080.md"
labels: [infra, queue-runner]
notes:
  - "2026-09-24 (orchestrator): Found during the 1.x → 2.0.0 migrations. The migration advice was 'disable the queue runner', and the obvious way to do that (FLOW_AI=false) also disabled review, compass and triage, so migrated repos briefly had no review at all. Interim workaround in use: FLOW_AI=true plus `gh workflow disable flow-queue-runner`."
  - "2026-09-24 (orchestrator): Overlaps flow-0049 on _flow-queue-runner.yml; pick-task will sequence them. Whichever lands second rebases."
---

## Context

`vars.FLOW_AI` gates review, the queue runner, triage and compass together. A human who wants to
pause autonomous work (during a migration, a delicate release, or a trip) has two bad options:

- set `FLOW_AI=false`, which also switches off the three PR review checks, so the gate goes green
  on build/lint/test alone;
- disable the workflow in GitHub, which also blocks manual `workflow_dispatch` runs, the one way
  to work a single task on purpose. Editing the caller doesn't work either: the next `flow-sync`
  overwrites it.

## Scope

**Does:**

- Add a repo variable `FLOW_QUEUE_RUNNER`. When it is `paused`, **scheduled** queue-runner runs
  do nothing. `workflow_dispatch` runs still work, so a human can still start one task on purpose.
  Unset, or any other value: today's behaviour. No existing repo changes behaviour by default.
- When a scheduled run is skipped because of the pause, the run page says so in its step summary
  (one line: paused by `FLOW_QUEUE_RUNNER`, and how to resume). A pause must be visible, not
  indistinguishable from a dead cron.
- `FLOW_AI` stays the master switch: `false` still turns everything off, exactly as today.
- Document the variable in `docs/flow-reusable-workflows.md` and in the template caller's header
  comment.
- Changelog fragment `changes/flow-0080.md`. Caller action: none (the variable is optional).

**Does not touch:**

- `_flow-review.yml`, `_flow-triage.yml`, `_flow-compass.yml` or `_flow-recover.yml`. Their gating
  is unchanged.
- The cron schedule itself, or trigger-on-merge (a separate, later task).

## Acceptance criteria

- [ ] Given `FLOW_AI=true` and `FLOW_QUEUE_RUNNER` unset, when a scheduled run fires, then the
      dispatch job's condition is true (backward compatible). Proved by a static assertion on the
      workflow's job conditions in `.flow/bin/queue-runner-switch.test.mjs`.
- [ ] Given `FLOW_AI=true` and `FLOW_QUEUE_RUNNER=paused`, when a **scheduled** run fires, then
      the dispatch job is skipped and a notice job writes a step summary naming the pause and how
      to resume.
- [ ] Given `FLOW_AI=true` and `FLOW_QUEUE_RUNNER=paused`, when a **workflow_dispatch** run fires,
      then the dispatch job runs.
- [ ] Given `FLOW_AI=false`, when any run fires, then neither the dispatch job nor the notice
      job runs.
- [ ] Given `_flow-review.yml`, then it does not reference `FLOW_QUEUE_RUNNER`. Pausing the runner
      provably cannot affect review.
- [ ] Given `docs/flow-reusable-workflows.md` and the template caller, then both name the variable,
      its one meaningful value, and that dispatch still works while paused.
- [ ] Given `changes/flow-0080.md`, then it exists and states "caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

None. The value `paused` (rather than a boolean) is deliberate, so an unset variable can never be
misread as "off".
