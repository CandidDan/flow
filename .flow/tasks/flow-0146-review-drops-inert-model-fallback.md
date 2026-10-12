---
id: "flow-0146"
title: "Code-review resolves only its own model key; the inert fallback to review.model goes"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-10-13"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Parked by queue cap at creation (Dan, 2026-10-13: p1/p2 first). Not machine-checkable: flip to ready when the ready count drops below the cap."
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - ".github/workflows/_flow-review.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - "changes/flow-0146.md"
labels: [review, models, cleanup]
notes:
  - "2026-10-13 (orchestrator): ORIGIN. flow-0142's follow-up ask: after per-check defaults, `needs.plan.outputs.code_review_model || needs.plan.outputs.model` is inert because `code_review_model` always resolves (`flow-review.mjs` resolves each key as `value || DEFAULT_MODELS[key]`). The ask said to wait until every adopter's base-branch helper is at or past flow-0142; all six synced 3.3.2 on 2026-10-12 (progress#130 write#158 later#46 Nudge#343 inflight#64 tanplan#106). Dan approved 2026-10-13."
  - "2026-10-13 (orchestrator): CHECK FIRST, do not assume: confirm `plan` emits `code_review_model` unconditionally (non-empty) in every path, including when the base branch's flow-review.mjs is older. If any path can emit empty, stop and set this task blocked with what you found."
---

## Context

`_flow-review.yml` lines ~528 and ~591 still read `code_review_model || model`. Since flow-0142 the
plan step always resolves `code_review_model`, so the fallback can only ever pick a model the
resolver did not choose, which is the drift flow-0144 removed everywhere else.

## Scope

**Does:** replace both `needs.plan.outputs.code_review_model || needs.plan.outputs.model` with
`needs.plan.outputs.code_review_model`. Apply the same to any `security_model || model` fallback if
one exists. Add a test in `flow-review-workflow.test.mjs` that no `*_model || ` fallback remains,
with a mutation check. Changelog fragment, caller action none.

**Does not touch:** `flow-review.mjs` or its `DEFAULT_MODELS`, the callers, any config.

## Acceptance criteria

- [ ] Given `_flow-review.yml`, then no expression falls back from one model output to another. Proved by `flow-review-workflow.test.mjs`, with a mutation that reinserts `|| needs.plan.outputs.model` and fails naming the line.
- [ ] Given the plan job, then `code_review_model` is emitted non-empty on every path (the CHECK FIRST note), proved by an existing or new test naming it.
- [ ] Given `changes/flow-0146.md`, then it exists and states the caller action (none). Proved by `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
