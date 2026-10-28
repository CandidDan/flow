---
id: "flow-0176"
title: "flow-status never moves a cancelled task: a PR closing unmerged leaves it cancelled and does not escalate its model"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-10-28"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits for flow-0169 (PR #244): both edit .github/workflows/_flow-status.yml and draft-pr-lifecycle.test.mjs, and this task should reuse the store-status read flow-0169 adds rather than write a second one."
cancelled_reason: ""
blocked_by: ["flow-0169"]
serves: ["maintenance"]
intent: ""
touches:
  - ".github/workflows/_flow-status.yml"
  - ".flow/bin/status-closed-cancelled.test.mjs"
  - ".flow/bin/draft-pr-lifecycle.test.mjs"
  - "project-template/.flow/bin/status-transition*.mjs"
  - ".flow/bin/status-transition*.mjs"
  - "changes/flow-0176.md"
labels: [bug, workflows, status]
model: "opus"
effort: "medium"
model_reason: "Changes a reusable workflow every adopting repo runs, on the path that writes task state to main"
notes: []
asks: []
---

## Context

The protocol (`project-template/.flow/PROTOCOL.md`, *Status lifecycle*) says of `cancelled`:
"Nothing transitions out of it automatically … and only a human reverses it, by editing `status`
back to `ready`."

`_flow-status.yml` breaks that. On 2026-10-28 the orchestrator cancelled flow-0171 on `main`
(c8e2c0d) because Dan ruled its runbook a duplicate, then closed its PR #252 unmerged. flow-status
(as flow-bot) then committed 5e38216, "flow: flow-0171 status sync (closed, PR #252)", which
changed `status: "cancelled"` to `status: "ready"`. claude[bot] restored it a minute later
(7691949). Without that restore, a deliberately cancelled task would have gone back to the queue,
and pick-task could have claimed it.

The cause is the `closed)` branch of the transition step's `case "$ACTION"`. It writes
`{"status":"ready","owner":"","branch":"","pr":""}` without reading the task's current status.
The separate step "Escalate the model of a task whose PR closed unmerged" then bumps its model tier
with `task-model.mjs escalate --once`, with the same blind spot.

Cancelling a task and then closing its PR is the expected order: the protocol requires a task to
be `ready` or `blocked` before it is cancelled, and the PR usually still exists. So every
cancellation of a task that had a PR hits this.

## Scope

- In `_flow-status.yml`'s `closed` (unmerged) path, read the task's current status from `main`
  before writing anything. If it is `cancelled`, write **nothing** to the task. That means no
  status change, and no clearing of `owner`, `branch` or `pr`, so the record of which PR it had
  survives. Log one line saying the task is cancelled and was left alone. Otherwise behave
  exactly as today.
- Apply the same guard to the "Escalate the model of a task whose PR closed unmerged" step: a
  cancelled task's `model` is not raised.
- Reuse the store-status read that flow-0169 adds for the draft case. If flow-0169 put it in a pure
  helper, extend that helper; if it is inline shell, extract it now into
  `project-template/.flow/bin/status-transition*.mjs` with a canonical adapter in `.flow/bin/`,
  following the `pr-of-record` pattern. The decision must be exercised by a test, not a grep of
  the YAML.
- Changelog fragment `changes/flow-0176.md`. This is a fix inside a reusable workflow with no
  caller change, so it is a PATCH under `docs/flow-versioning-policy.md`. State the caller action
  that policy gives for a PATCH: a repo picks it up through flow-sync's repin.

**Deliberately does NOT:**
- Change the `ready_for_review`, `opened` or `reopened` paths. flow-0169 owns the draft and
  `blocked` case.
- Guard `done`. A merged PR is flow-done's, and a closed-unmerged PR on a `done` task is already
  filtered by `pr-of-record`.
- Repair store data. flow-0171 is already `cancelled` on `main`.
- Touch `flow-done`, `flow-recover` or `pick-task`. They already ignore `cancelled`.

## Acceptance criteria

- [ ] Given a task whose status on `main` is `cancelled`, when its PR closes unmerged, then the transition decision is "leave unchanged", and no status, owner, branch or pr edit is produced (`.flow/bin/status-closed-cancelled.test.mjs`).
- [ ] Given the same cancelled task, when the escalate step's decision runs, then its `model` is not raised (same test file).
- [ ] Given a task that is `in_progress` or `in_review` (not cancelled), when its PR closes unmerged, then it still goes back to `ready` with owner, branch and pr cleared, and its model escalates one tier, exactly as today (same test file).
- [ ] Given `_flow-status.yml`, when it is parsed, then both the `closed` transition and the escalate step call the shared status decision rather than writing `ready` unconditionally (same test file).
- [ ] Given `changes/flow-0176.md`, then it states its caller action (`.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Who restored flow-0171 (claude[bot], 7691949) is not known. It may be a session subscribed to
  PR #252. That restore is not a mechanism to rely on, so do not build on it.
- If extracting the helper means a third `.flow/bin/` adapter test needs updating
  (`adapters.test.mjs`), that file is outside `touches`. Set the task `blocked` with a `decision`
  ask rather than editing it.
