---
id: "flow-0194"
title: "docs/flow-routines.md says flow-dispatch starts on the flow-task-state event that unblock and recover send, not when they complete"
status: "in_progress"
priority: 3
project: "flow"
owner: "session_01NfrcUAMXfoDX76ao4p12jJ"
created: "2026-11-02"
started: "2026-11-02T01:16:26Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "docs/flow-routines.md"
  - ".flow/bin/protocol-routine-handoff.test.mjs"
  - "changes/flow-0194.md"
labels: [docs]
model: "haiku"
effort: "low"
model_reason: "One table row in one doc and one test assertion; fully mechanical"
asks: []
notes:
  - "2026-11-02 orchestrator: follow-up from flow-0185 (PR #274, merged), which moved flow-dispatch off workflow_run and onto repository_dispatch type flow-task-state, and named this line as outside its touches."
---

## Context

flow-0185 changed what starts `flow-dispatch`. `flow-unblock` and `flow-recover` no longer start
it by completing. Instead, after a run that pushed a task-file change, they send a
`repository_dispatch` event of type `flow-task-state`, and the `flow-dispatch` callers listen for
that event. A run that changed nothing sends nothing.

`docs/flow-routines.md` line 97, in the table under "flow-dispatch ... runs:", still says:
"`flow-unblock` or `flow-recover` completes".

## Scope

- Replace that table row's two cells. When: "`flow-unblock` or `flow-recover` pushed a task-file
  change". Why: they push with `GITHUB_TOKEN`, which starts no other workflow, so they send a
  `repository_dispatch` event of type `flow-task-state`, and a run that changed nothing sends
  nothing.
- Change nothing else in the file unless it also states the old `workflow_run` trigger; if it
  does, correct that sentence the same way.
- Add an assertion to `.flow/bin/protocol-routine-handoff.test.mjs`.
- Fragment `changes/flow-0194.md`: `**No caller action.**`

**Does not:** change any workflow or helper.

## Acceptance criteria

- [ ] `protocol-routine-handoff.test.mjs` asserts `docs/flow-routines.md` mentions `flow-task-state`
      and does not contain the text "`flow-recover` completes".
- [ ] `changes/flow-0194.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
