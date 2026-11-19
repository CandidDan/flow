---
id: "flow-0232"
title: "The old Haiku id scan runs only in canonical, so it stops failing adopting repos"
status: "in_progress"
priority: 1
project: "flow"
owner: "session_01NfrcUBgbAmfpXHKvUt2Bey"
created: "2026-11-19"
started: "2026-11-19T04:28:34Z"
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: "CandidDan"
accepted_at: "2026-11-19T04:28:34Z"
accepted_via: "chat"
touches:
  - "project-template/.flow/bin/task-model.test.mjs"
  - "changes/flow-0232.md"
labels: [tests, hotfix]
model: "sonnet"
effort: "medium"
model_reason: "A test-only change that follows an existing pattern (the canonical check in check-claude-md.test.mjs), with the proving test named."
notes:
  - "2026-11-19: Found while moving CandidDan/Nudge to v5 (its sync PR #416). Nudge names the old Haiku 4.5 id on purpose."
asks: []
---

## Context

`project-template/.flow/bin/task-model.test.mjs` has a test, "no tracked file outside the store,
changelog and fixtures still names the old Haiku 4.5 id", that searches every tracked file of the
repo it runs in. `flow-sync` copies this test into every adopting repo's `.flow/bin/`, so there it
searches the adopter's own code. CandidDan/Nudge names that id on purpose, so the test fails in
Nudge's gate.

In v5, `flow-review` needs the whole `flow-gates` job. A failing test there skips the qa,
code-review and security reviews on every PR in that repo. This blocks Nudge's move to v5.

The search is about canonical's own files. Other tests already skip outside canonical:
`IN_CANONICAL_TEMPLATE` in `asks.test.mjs` and `CANON` / `notCanonical` in
`check-claude-md.test.mjs`.

## Scope

Run the search only in canonical. Canonical is the repo that holds both
`project-template/.flow/bin/task-model.mjs` and `.flow/bin/task-model.mjs`, the same check
`check-claude-md.test.mjs` uses. Elsewhere the test is skipped with a reason that names the
adopting repo. Add a changelog fragment for this task.

## Acceptance criteria

- [ ] Given an adopting repo (no `project-template/`) with a tracked file naming the old Haiku 4.5
  id, the scan is skipped and does not fail. Proved by a test that builds such a repo in a temp
  directory.
- [ ] Given a canonical-shaped repo with the same file, the scan still reports that file. Proved by
  the same test.
- [ ] In canonical itself, the scan still runs and finds nothing.
- [ ] `changes/flow-0232.md` exists and says "No caller action" beyond taking the release.
- [ ] All five gate commands pass and coverage stays at or above the floor.

## Out of scope

- Any change to `task-model.mjs` or to which ids Flow uses.
