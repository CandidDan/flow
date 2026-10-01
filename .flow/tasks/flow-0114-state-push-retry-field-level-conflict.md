---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0114"
title: "State-push retry re-applies over an unrelated edit to the same task file, and refuses only when a field it writes was changed"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-worker"
created: "2026-10-01"
started: "2026-10-01T04:56:36Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # the gate tells the truth: a refusal that fires on every worker note reports a conflict that is not there.
touches:
  - ".github/workflows/_flow-status.yml"
  - ".github/workflows/_flow-done.yml"
  - ".flow/bin/state-push-retry.test.mjs"
  - "changes/flow-0114.md"
labels: [flow-status, flow-done, concurrency, flow-infra]
notes:
  - "2026-10-01 (orchestrator): EVIDENCE. CandidDan/tanplan-platform#25 (tanplan-0033). flow-status's ready_for_review run lost the race, re-fetched, and found the task file changed: the worker had pushed a handoff NOTE to the same file. Re-applying the edit still changed the file (status in_progress -> in_review), the blob differed from base, so the loop exited with CONFLICTING EDIT and the transition was dropped. A human set in_review by hand and re-ran the check. The worker's note and flow-status's status write touch different fields and compose cleanly; nothing would have been overwritten."
  - "2026-10-01 (orchestrator): WHY THIS IS COMMON, not bad luck. The worker's last act is a note on its own task file on main, and marking the draft ready fires flow-status seconds later on the same file. Every queue-runner task walks into this window."
---

## Context

The flow-0059 state-push-retry block (byte-identical in `_flow-status.yml` and `_flow-done.yml`)
discards a refused push, re-fetches `main`, and re-applies the same board edits. Before
re-committing it compares the task file's blob on the new tip with the blob it started from and,
if they differ, exits with `CONFLICTING EDIT`.

That guard is right in intent (never overwrite someone else's change) and too coarse in fact.
`apply-board-edits.mjs` writes named fields only (`status`, `owner`, `branch`, `pr`). An edit
by another actor to a field this run does NOT write (a worker's `notes:` entry, a widened
`touches`, a body edit) cannot be overwritten by re-applying, because re-applying re-derives from
the new tip. The blob comparison treats those as conflicts anyway, and the most common one, a
worker's final note followed by flow-status on ready_for_review, happens on almost every task.

## Scope

- Replace the blob comparison with a field comparison. Before the first commit, record the values
  of exactly the fields this run's edits write, as they were at the starting tip. On a retry,
  read those same fields at the new tip.
  - Every written field unchanged since the start: re-apply and push (the other actor's edit is
    preserved by construction).
  - A written field now holds the value this run would write: the existing "already landed" no-op.
  - A written field changed to anything else: `CONFLICTING EDIT`, exit non-zero, as today. The
    message names the field(s) and both values.
- Keep the two copies byte-identical (the existing test already enforces it).
- Keep everything flow-0059 deliberately excludes: no pull, rebase, merge or force.

## Acceptance criteria

- [ ] A contender that appends a `notes:` entry to the same task file between checkout and push no
      longer fails the run: the transition lands, and the contender's note is still on main,
      byte for byte. Proved against real git repos in `state-push-retry.test.mjs`, for flow-status
      AND flow-done.
- [ ] A contender that sets `status` to a different value (the existing flow-recover `blocked`
      case) still fails with `CONFLICTING EDIT`, still leaves the contender's value on main, and the
      message names `status` and both values.
- [ ] A contender that changes `pr` or `branch` (a field the closed-unmerged edit clears) is a
      conflict for that edit, proved by one test.
- [ ] The existing duplicate-transition no-op, exhaustion and byte-identical tests pass unchanged.
- [ ] `changes/flow-0114.md` describes the behaviour change for adopters.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
