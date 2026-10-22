---
id: "flow-0156"
title: "A worker checks the task and its notes before asking a decision, and a done task carries no open decision"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-10-22"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G12"]
touches:
  - "project-template/.flow/PROTOCOL.md"
  - ".flow/bin/decision-asks-docs.test.mjs"
  - "changes/flow-0156.md"
labels: [protocol, asks]
notes:
  - "2026-10-22 (orchestrator, Dan asked for this task): FOUND on write-0130 (CandidDan/write). The worker finished, its PR merged, and it left a decision ask: 'adopt the narrower line?'. The task it fed (write-0132) already said 'if the research says the line is not distinctive, use the narrower line'. So the question reached Dan after the spec had already answered it, and sat on a done task where inflight showed it as blocked. G12 says anything Flow needs from Dan is one decision. A question the spec already answers should not be a decision at all."
model: "sonnet"
model_reason: "two protocol paragraphs plus a docs test"
asks: []
---

## Context

`asks` with kind `decision` is the one route that interrupts the human. Two gaps let it fire
when it should not:
1. Nothing tells the worker to check whether the spec already settles the question. That means
   this task's body and notes, the intent it names, and the tasks it feeds or waits on.
2. Nothing says what happens to a decision on a task that is otherwise finished. It survives the
   merge and keeps asking.

## Scope

**Does**, in `project-template/.flow/PROTOCOL.md`, under the `asks` section:
- Before writing a `decision` ask, the worker checks this task's body and notes, the intent it
  names, and the tasks named in its `blocked_by` and in other tasks' `blocked_by` that point at
  it. If any of them already answers the question, the worker follows that answer and records it as
  a `notes` line citing where the answer came from. Then it is not a decision.
- A worker does not open its PR for review with an open `decision` ask. Either the work does not
  depend on the answer (so it is a `fyi`, or a `follow-up` for the task that does depend on it),
  or it does (so the task is `blocked`).

Add `.flow/bin/decision-asks-docs.test.mjs` proving both rules are in the protocol. Add the
changelog fragment.

**Not in scope:** flow-doctor or workflow enforcement (a later, separate decision); inflight's label
(inflight-0052).

## Acceptance criteria

- [ ] Given `project-template/.flow/PROTOCOL.md`, when read, then the `asks` section says to check
      the task, its notes, its intent and its linked tasks before asking a decision, and to record a
      found answer as a `notes` line citing its source.
- [ ] Given the same file, when read, then it says a PR is not handed off for review with an open
      `decision` ask, and names the two alternatives (`fyi`/`follow-up`, or `blocked`).
- [ ] Given the existing protocol docs tests, when run, then they still pass.
- [ ] `changes/flow-0156.md` exists and states caller action: none (protocol text arrives through
      flow-sync).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
