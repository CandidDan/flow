---
id: "flow-0217"
title: "The review checks run only after the gate has passed, and in fewer jobs"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-11-06"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/_flow-gates.yml"
  - ".github/workflows/flow-gates.yml"
  - ".github/workflows/flow-review.yml"
  - ".github/workflows/flow-kickback.yml"
  - "project-template/.github/workflows/flow-gates.yml"
  - "project-template/.github/workflows/flow-review.yml"
  - "project-template/.github/workflows/flow-kickback.yml"
  - ".flow/bin/gate-cost.test.mjs"
  - "changes/flow-0217.md"
labels: [cost]
model: "opus"
effort: "high"
model_reason: "Changes the reusable review and gate workflows, check names and the kickback trigger across every adopting repo."
notes:
  - "2026-11-06 (orchestrator, on Dan's direction in the cost thread): written blocked, not ready, because the design choice below is Dan's."
  - "2026-11-09: Dan chose option (a) on the decision card: the gate caller runs review as a job with needs: gate, check names become 'flow-gates / review / ...', kickback moves to workflow_run on flow-gates. List, per adopting repo, the branch-protection required-check names that must change, in the PR description and the changelog fragment's caller action (this makes it a MAJOR bump)."
asks: []
---

## Summary

On every push to a ready PR, the review (five jobs: plan, qa, code-review, security, guide) starts
at the same moment as the gate. When the gate fails or a newer push cancels it, the review still
runs and is billed, plus its Claude tokens. Each of the five jobs is billed at least one minute.
After this task, review starts only once the gate has passed, and runs in three jobs instead of
five.

## Context

Measured 5 to 6 Nov 2026 in `tanplan-platform`: 47 review runs a day, at least 5 billed minutes
each. 12 of 54 gate runs in the sample failed or were cancelled, and the review ran on each. The
estimated saving is about 150 billed minutes a day in that repo alone.

## Scope

- Review starts only after the gate job has succeeded on the same head commit (design per the
  decision ask).
- `plan` and `guide` stop being separate jobs: plan's outputs are computed as steps in each reviewer
  job, or in the gate; guide runs as the last step of one reviewer job. qa, code-review and security
  stay separate jobs so their checks keep reporting separately.
- Kickback still sees which review jobs failed.
- `changes/flow-0217.md`, stating what each adopting repo must change in branch protection.

Not in scope: the review prompts, models or verdict rules.

## Acceptance criteria

1. On a PR whose gate fails or is cancelled, no review job runs. Proved by a test in
   `.flow/bin/gate-cost.test.mjs`.
2. On a PR whose gate passes, qa, code-review and security run and report as before. Proved by a
   test in `.flow/bin/gate-cost.test.mjs`.
3. A review run is at most three jobs. Proved by a test in `.flow/bin/gate-cost.test.mjs`.
4. Kickback still dispatches on a failed qa, code-review or security check, and never on a
   cancelled run. Proved by the existing flow-0136 criterion 4 test, updated.
5. The changelog fragment states the caller action. Proved by
   `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
