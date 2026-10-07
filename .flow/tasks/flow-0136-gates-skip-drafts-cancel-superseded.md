---
id: "flow-0136"
title: "PR gates skip drafts, and a newer push cancels the gate and review runs it supersedes"
status: "in_progress"
priority: 1
project: "flow"
owner: "orchestrator-cowork-2026-10-08"
created: "2026-10-08"
started: "2026-10-07T22:49:27Z"
branch: "flow/flow-0136-gates-skip-drafts-cancel-superseded"
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-gates.yml"
  - ".github/workflows/flow-gates.yml"
  - ".github/workflows/flow-review.yml"
  - "project-template/.github/workflows/flow-gates.yml"
  - "project-template/.github/workflows/flow-review.yml"
  - ".flow/bin/gate-cost.test.mjs"
  - ".flow/bin/adapters.test.mjs"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/sync-customised-caller.test.mjs"
  - "changes/flow-0136.md"
labels: [ci, cost, urgent]
notes:
  - "2026-10-08 (orchestrator): URGENT, approved by Dan 2026-10-08, so it bypasses queue_cap. ORIGIN: GitHub Actions spend reached $90 of the $100 budget by 8 Oct (≈$30/day). Measured 1–8 Oct across the six private adopters: ~15,300 billed minutes. flow-gates ≈ 39%, flow-review ≈ 23%, flow-queue-runner ≈ 22%, 1-minute jobs ≈ 10%. The gate caller has no `types:`, so it runs on every push including drafts, and no caller has a `concurrency:` block, so a superseded run always finishes. Example: write had 138 pushes to flow/** and 136 gate runs. A worker runs the whole local gate before it marks the PR ready (protocol step 4), so a draft gate re-proves what the worker already proved."
  - "2026-10-08 (orchestrator): tanplan-platform is fixed separately (tanplan-0075, tanplan PR #74), because its flow-gates.yml is a sanctioned local fork that sync does not overwrite. The design here matches it on purpose: types + `ready_for_review`, a job-level draft clause, and `concurrency` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` so a manual run on `main` is never cancelled."
  - "2026-10-08 (orchestrator): checked safe. `_flow-kickback.yml` acts only on `workflow_run.conclusion == 'failure'`, so a cancelled review run never triggers a round. `_flow-review.yml` already skips drafts in `plan`. The queue runner does not read gate results. Required checks: a job skipped on a draft reports success, and a draft cannot merge anyway."
  - "2026-10-08 (orchestrator): touches lists three existing tests that read the caller files (adapters, flow-review-workflow, sync-customised-caller), because they may pin the callers' shape. Edit them only if they actually fail; do not widen further without a note."
---

## Context

The PR gate (`_flow-gates.yml` via each repo's `flow-gates.yml` caller) runs in full on every push
to every PR, drafts included. A Flow worker pushes several commits to its draft before marking it
ready, so most gate runs re-prove what the worker's local gate already proved. No `flow-gates` or
`flow-review` caller cancels a superseded run either, so a fast follow-up push pays twice. Across
the six private adopters this is the largest Actions cost, at ~$30 a day.

## Scope

**Does:**
- Both `flow-gates.yml` callers (canonical's and the template's): `pull_request.types:
  [opened, reopened, synchronize, ready_for_review]`, and a top-level `concurrency` group per PR
  (`flow-gates-${{ github.event.pull_request.number || github.ref }}`) with `cancel-in-progress:
  ${{ github.event_name == 'pull_request' }}`.
- `_flow-gates.yml`: every job skips on a draft `pull_request` (`github.event_name !=
  'pull_request' || github.event.pull_request.draft == false`, combined with any existing
  condition). `workflow_dispatch` is unaffected.
- Both `flow-review.yml` callers: the same per-PR concurrency group (`flow-review-…`), cancelling
  on `pull_request` only.
- A structural test, `.flow/bin/gate-cost.test.mjs`, pinning all of the above, with a mutation
  check per rule.
- Changelog fragment. **Caller action:** none beyond the next flow-sync, which delivers the
  callers. Note there that a repo with a customised `flow-gates.yml` (tanplan-platform) does not
  get this by sync and must port it by hand.

**Does not touch:** job contents, the review prompts, `_flow-review.yml`'s existing draft clause,
the queue runner, flow-status, the 1-minute-job consolidation (flow-0137).

## Acceptance criteria

- [ ] Given both `flow-gates.yml` callers, then `pull_request.types` is exactly opened, reopened,
      synchronize, ready_for_review.
- [ ] Given `_flow-gates.yml`, then every job's `if` is false for a draft `pull_request` event,
      true (or unchanged) for a non-draft one and for `workflow_dispatch`. Mutation: removing the
      clause from any one job fails the test, naming the job.
- [ ] Given both `flow-gates.yml` and both `flow-review.yml` callers, then each declares a
      concurrency group keyed on the PR number, with `cancel-in-progress` true only for
      `pull_request` events.
- [ ] Given `_flow-kickback.yml`, then a review run concluding `cancelled` does not dispatch a round
      (its trigger requires `failure`). Proved by a test on the `if`.
- [ ] Given `changes/flow-0136.md`, then it exists, states the caller action, and names the
      customised-caller exception.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
