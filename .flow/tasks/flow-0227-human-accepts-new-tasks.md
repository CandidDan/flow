---
id: "flow-0227"
title: "New tasks land as proposed and become ready only when the human accepts them"
status: "in_progress"
priority: 1
project: "flow"
owner: "session_01NfrcUAejmYWpbguwNm28GT"
created: "2026-11-14"
started: "2026-11-14T02:16:40Z"
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: "CandidDan"
accepted_at: "2026-11-14T02:13:59Z"
accepted_via: "chat"
touches:
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.flow/tasks/_TEMPLATE.md"
  - "project-template/.flow/config.yml"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "project-template/.flow/bin/acceptance.mjs"
  - "project-template/.flow/bin/acceptance.test.mjs"
  - "project-template/.flow/bin/apply-board-edits.mjs"
  - "project-template/.flow/bin/apply-board-edits.test.mjs"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/bin/pick-task.mjs"
  - "project-template/.flow/bin/pick-task.test.mjs"
  - "project-template/.flow/bin/flow-dispatch.mjs"
  - "project-template/.flow/bin/flow-dispatch.test.mjs"
  - "project-template/.flow/bin/flow-state.mjs"
  - "project-template/.flow/bin/flow-state.test.mjs"
  - ".flow/bin/pick-task.mjs"
  - ".flow/bin/*.test.mjs"
  - ".flow/config.yml"
  - ".github/workflows/_flow-triage.yml"
  - "changes/flow-0227.md"
labels: [protocol, task-writer, urgent]
model: "opus"
effort: "high"
model_reason: "Protocol and Flow infra change that every adopter picks up at the next sync."
notes:
  - "2026-11-14: Dan asked for this in the Flow project thread and chose 'every new task' on a decision card (02:13Z). `urgent` label applied on his go, because canonical's ready queue is at the cap."
asks: []
---

## Context

Dan, 2026-11-13: "Can we have a new rule encoded so the Claude or whatever tool is writing a task
presents the task to the user to accept or reject. Right now I realise visibility over tasks or
intents or research is thin." In the day before, sessions wrote tanplan-0395..0397, flow-0223..0226
and mapd-0059 straight to `main` as `ready`, and told him afterwards. A worker can pick a `ready`
task up within minutes, so he saw the work only after it had started.

Intents are already gated: an intent counts only once its PR is merged. Research is a task whose
output is a doc under `docs/research/`, so gating tasks gates research too.

Dan chose that every new task needs his accept, including tasks derived from an intent he already
approved.

## Scope

1. **New status `proposed`**, before `ready`. A task writer writes `proposed`. Workers and the
   dispatcher never pick a `proposed` task.
2. **Acceptance fields**: `accepted_by` (who said yes: a GitHub login, or `label:approved` /
   `label:auto-ok` for the issue lanes), `accepted_at` (UTC ISO datetime), `accepted_via` (`chat`,
   `inflight`, `issue-label`). Accept sets `status: ready` and the three fields. Reject sets
   `status: cancelled` with the human's reason in `cancelled_reason`.
3. **Config switch** `tasks.accept_from: "YYYY-MM-DD"` in `.flow/config.yml`. Unset means the rule
   is off. Set, it applies to tasks whose `created` is on or after the date.
4. **Enforcement** (one shared module, `acceptance.mjs`):
   - `flow-doctor` fails a task created on or after `accept_from` that is not `proposed` or
     `cancelled` and has no `accepted_by` or no `accepted_at`.
   - `pick-task` and `flow-dispatch` skip a `ready` task that needs acceptance and lacks it.
5. **Store writer**: `apply-board-edits` accepts `proposed` as a status and may write
   `accepted_by`, `accepted_at`, `accepted_via` and `cancelled_reason`, so inflight can accept and
   reject through it.
6. **flow-state**: a `proposed` task does not count as started work for its intent.
7. **Protocol, template, task-writer skill, triage prompt**: say all of the above. The task-writer
   shows each new task (or batch) to the human with Accept / Reject before it is `ready`. The
   triage workflow fills the acceptance fields from the lane label.
8. Canonical sets `tasks.accept_from: "2026-11-14"`. Changelog fragment `changes/<id>.md`.

Out of scope: the inflight Proposed view and the MCP connector (they are inflight work).

## Acceptance criteria

- [ ] `acceptance.mjs` parses `tasks.accept_from`; unset or not a date means the rule is off.
- [ ] Given `accept_from` is set, when a task created on or after it is `ready` with no
      `accepted_by`, then `flow-doctor` reports a problem naming the task.
- [ ] A `proposed` task, a `cancelled` task, and a task created before `accept_from` are never
      reported.
- [ ] `pickTask` and `planDispatch` skip a `ready` task that needs acceptance and lacks it, and
      never pick a `proposed` task.
- [ ] `apply-board-edits` accepts `status: proposed` and writes the three acceptance fields and
      `cancelled_reason`.
- [ ] `deriveIntentStatus` returns `not_started` for an intent whose only tasks are `proposed`.
- [ ] The protocol's status lifecycle lists `proposed`, and the task-writer skill says to write
      `proposed` and present the task to the human for accept or reject.
- [ ] Canonical's `.flow/config.yml` sets `tasks.accept_from: "2026-11-14"`, and canonical's own
      `flow-doctor` passes.
