---
id: "flow-0239"
title: "Let the flow-pr-text judge run on bot-opened PRs"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-11-25"
started: ""
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: "CandidDan"
accepted_at: "2026-11-25T03:38:50Z"
accepted_via: "chat"
touches:
  - ".github/workflows/_flow-pr-text.yml"
  - ".flow/bin/pr-text-workflow.test.mjs"
  - "changes/flow-0239.md"
labels: [workflows]
model: "opus"
effort: "high"
model_reason: "Edits a reusable workflow that every repo calls; a bug breaks the fleet's CI at once."
notes:
  - "2026-11-25: Found on CandidDan/drop, where flow-pr-text failed on PRs opened by the Cursor bot. The fix is already written and open as PR #321, which this task adopts."
asks: []
---

## Context

When a bot opens or updates a PR, that bot is the run's actor. `claude-code-action` refuses a run whose actor is a bot that is not in `allowed_bots`, with "Workflow initiated by non-human actor". The `flow-pr-text` judge step sets no `allowed_bots`, so the check fails on bot-opened PRs before it judges anything.

## Scope

**Does:** add `allowed_bots: "*"` to the judge step's `with:` in `.github/workflows/_flow-pr-text.yml`, with a comment saying why it is safe. The judge has one turn and no tools, and runs only on a same-repo PR. Add a static test and the changelog fragment.

**Not in scope:** the "job.workflow_sha is empty" error some runs print. It comes from the helper-fetch step, is a different failure, and needs its own investigation.

## Acceptance criteria

- [ ] Given `_flow-pr-text.yml`, when the judge step is parsed, then its `with.allowed_bots` is `*`. Proved by the test "the judge accepts a bot actor" in `pr-text-workflow.test.mjs`.
- [ ] `changes/flow-0239.md` exists and states caller action: none.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or visibly skipped as out of its trigger paths · code-review check blocking items resolved · build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving test named.
