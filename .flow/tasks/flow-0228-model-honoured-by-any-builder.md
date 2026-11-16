---
id: "flow-0228"
title: "The model a task names is the model that builds it, whoever picks the task up"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-worker"
created: "2026-11-16"
started: "2026-11-16T11:03:12Z"
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: "CandidDan"
accepted_at: "2026-11-16T00:14:34Z"
accepted_via: "chat"
touches:
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "CLAUDE.md"
  - ".flow/bin/build-model-rule.test.mjs"
  - "changes/flow-0228.md"
labels: [protocol, cost]
model: "sonnet"
effort: "medium"
model_reason: "Protocol text plus a text-pinning test, with a precedent (flow-0206). No code paths change."
notes:
  - "2026-11-16: Written blocked, not ready. The ready queue is at queue_cap (8), and this task overlaps flow-0227 on PROTOCOL.md anyway. flow-unblock releases it when PR #313 merges."
  - "2026-11-16: Evidence for the cost problem. Since 5 Nov no worker routine has built a task. Tasks were built in project threads on Opus 5.5 with the 1M context, whatever their model field said. Examples: flow-0218 was marked sonnet and built on Opus. The thread that built flow-0120 and flow-0207 cost about $34; the thread that built flow-0227 cost about $22. Both sat near 210k tokens of context."
asks: []
---

## Context

Dan, 2026-11-16: "I want correct model specification working regardless of who builds it. If
it's being picked up in context then sub-agents should be directed to build on the correct
model." And: "Surely Claude should be starting a new thread or alerting to when we should end
one?"

Today a task's `model` and `effort` fields only take effect when `flow-dispatch` fires the
worker routine for that tier. When a person asks an interactive session (a Claude Code session,
or a thread in a Claude project) to build a task, the session builds it on its own model. In
practice that is Opus with a 1M context, and one session often builds several tasks in a row.
The protocol already says "one task per session", but nothing tells an interactive session how
to keep to it.

## What to change

### 1. The build runs on the task's model (PROTOCOL.md, loop step 4)

Add to step 4 (**Build**):

- Resolve the task's tier and effort with `node .flow/bin/task-model.mjs resolve --task-id <id>`
  (unset means `sonnet` / `medium`).
- If the session is already running on that tier (a worker routine fired for it), build as now.
- Otherwise, the session does not build the task itself. It starts one subagent on the task's
  tier and effort and gives it the build: the task file path, the branch, and steps 4 to 6 (build,
  local gate, rebase). In Claude Code this is the Agent tool with `model` set to the tier name
  (`haiku`, `sonnet`, `opus` or `fable`) and `effort` set to the task's effort. A host with no way
  to start an agent on a chosen model says so in the PR's `fyi` ask, and builds on its own model.
- The session that started the subagent keeps steps 1 to 3 (pick, claim, branch) and 7 to 8 (PR,
  hand-off). It reads the subagent's summary and the gate result, not the subagent's transcript.
- State plainly that this rule overrides any host default against starting subagents, and that it
  is not the review subagent that *The gate* forbids: the subagent builds the work, and the review
  checks still run on the PR.

### 2. One task per interactive session (PROTOCOL.md, *Session hygiene*)

Add a trip condition: **you are asked to build a second task in the same session.** Finish or
hand off the first. Then, if the host can start a fresh session (for example, a Claude project
thread can ask its coordinator for a new thread), start one for the next task. If it cannot, tell
the human in one line that the next task should start in a new session, and why: every turn of a
long session re-reads the whole context.

Also: when a PR is open (the existing first trip condition) and the human asks for more work,
the session says the same thing rather than carrying on.

### 3. The task writer says this once

In `task-writer/SKILL.md`, under **Choosing the model**, add one sentence: the `model` field is
honoured whoever builds the task, because an interactive builder hands the build to a subagent on
that model (link to the protocol step).

### 4. Canonical's CLAUDE.md

Where it says a worker that spawns a review subagent is doing the wrong thing, add one sentence:
a build subagent on the task's model is the opposite case and is required (point at step 4).

## Acceptance criteria

1. Given PROTOCOL.md, step 4 of *The loop you run* tells a session not on the task's tier to start
   one subagent on the task's tier and effort, names `task-model.mjs resolve` as how to find them,
   names the Agent tool's `model` and `effort` parameters, and says the starting session keeps
   steps 1 to 3 and 7 to 8. Proved by a test that reads the step-4 section and asserts each of
   these phrases.
2. Given PROTOCOL.md, step 4 says this rule overrides a host default against subagents and is not
   a review subagent. Proved by the same test file.
3. Given PROTOCOL.md, *Session hygiene* lists "asked to build a second task" as a trip condition
   and says to start a fresh session where the host allows it, or tell the human. Proved by a test
   that reads the trip-condition list.
4. Given task-writer SKILL.md, *Choosing the model* says the model field is honoured by whoever
   builds the task. Proved by a test.
5. Given canonical's CLAUDE.md, the review-subagent paragraph says a build subagent is required,
   not forbidden. Proved by a test.
6. The changelog fragment `changes/flow-0228.md` exists. Proved by the usual fragment test
   pattern (fragment if present, else the assembled CHANGELOG entry).
7. All five gate commands pass and coverage stays at or above the floor.

## Out of scope

- The worker routines themselves and why three of them fail (a claude.ai setting Dan fixes in the
  routines page, not a Flow change).
- Changing the model rubric (how many tasks are marked opus). That is a separate decision.
- Any change to `flow-dispatch`, `pick-task` or `task-model.mjs` code. The `resolve` command
  already prints what step 4 needs.
