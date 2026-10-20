---
id: "flow-0154"
title: "A run that dies before the worker does any work does not raise the task's model tier"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-10-21"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Needs Dan's decision on the rule (see asks). Not machine-checkable."
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-queue-runner.yml"
  - ".flow/bin/queue-runner-verify.mjs"
  - ".flow/bin/queue-runner-verify.test.mjs"
  - "changes/flow-0154.md"
labels: [queue-runner, bug]
notes:
  - "2026-10-21 (orchestrator): ORIGIN. On 2026-10-20 runs 39359842080 (flow-0112) and 39359768889 (flow-0129) failed in under a second on an infrastructure error (bot actor refused, fixed by flow-0152). The escalate step still read 'ended without a PR' as 'too hard for this model' and raised both tasks a tier, and flow-0112 got a 'split it' ask it did not deserve."
model: "sonnet"
model_reason: "a classification rule plus tests"
asks:
  - "decision: what counts as the worker having tried? Recommend: escalate only when the worker step ran at least N turns (e.g. 3, read from the action's execution file) or claimed the task; anything shorter is an infrastructure failure: leave the model alone and post a follow-up ask naming the error instead."
---

## Context

The escalate step in `_flow-queue-runner.yml` moves a task up a model tier whenever a run ends
without a PR. That conflates two different failures: the model could not do the task, and the run
never reached the model (auth, actor checks, runner loss). The second wrongly escalates the task,
and at the top tier it asks a human to split a task that never ran.

## Scope

**Does:** after Dan decides the rule, apply it in the escalate step (classification logic in
`queue-runner-verify.mjs`, with tests). An infrastructure failure leaves `model` unchanged and
records a `follow-up` ask naming the error.

**Not in scope:** retrying failed runs.

## Acceptance criteria

- [ ] Given a run whose worker step failed with zero turns, when the escalate step runs, then the
      task's `model` is unchanged and a `follow-up` ask names the failure.
- [ ] Given a run where the worker took at least the agreed number of turns and opened no PR, when
      the escalate step runs, then the task moves up one tier, exactly as today.
- [ ] Given a task already at the top tier and an infrastructure failure, when the step runs, then
      no "split it" decision ask is added.
- [ ] `changes/flow-0154.md` exists and states caller action: none.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
