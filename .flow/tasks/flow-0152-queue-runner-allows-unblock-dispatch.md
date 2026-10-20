---
id: "flow-0152"
title: "The queue runner accepts a run dispatched by flow-unblock, so an auto-unblocked task does not fail in 15 seconds"
status: "done"
priority: 1
project: "flow"
owner: "claude-session_015SJbzZrb7RuJ87bd7n3mC2"
created: "2026-10-20"
started: "2026-10-20T02:56:28Z"
branch: "flow/flow-0152-queue-runner-allows-unblock-dispatch"
pr: "https://github.com/CandidDan/flow/pull/213"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-queue-runner.yml"
  - ".flow/bin/queue-runner-bot-dispatch.test.mjs"
  - "changes/flow-0152.md"
labels: [queue-runner, bug]
notes:
  - "2026-10-20 (orchestrator, Dan approved the fix shape): FOUND on runs 39359842080 (flow-0112) and 39359768889 (flow-0129). flow-unblock dispatches the runner with GITHUB_TOKEN (_flow-unblock.yml:169), so the run's actor is github-actions[bot], and claude-code-action refuses it: 'Workflow initiated by non-human actor: github-actions (type: Bot). Add bot to allowed_bots list'. The worker step failed in under a second, the verify step saw no PR, and the escalate step bumped each task's model as if the task had been too hard."
model: "sonnet"
model_reason: "one input on one step plus a static test"
asks: []
---

## Context

When a task's blocker merges, `_flow-unblock.yml` sets it `ready` and dispatches the queue runner
with `GITHUB_TOKEN`. That run's actor is `github-actions[bot]`. The worker step's
`claude-code-action` rejects any bot-initiated run unless the bot is in `allowed_bots`, so every
auto-unblocked task fails immediately, and the escalate step then wrongly moves it up a model tier.
Scheduled ticks and hand dispatches are unaffected (their actor is a human).

## Scope

**Does:** add `allowed_bots: "github-actions[bot]"` to the worker step's `with:` in
`.github/workflows/_flow-queue-runner.yml`, with a comment saying why it names exactly one bot.
Add a static test. Add the changelog fragment.

**Deliberately narrower than `_flow-review.yml`'s `allowed_bots: "*"`.** The reviewers only read
and comment; the worker runs with `bypassPermissions` and pushes code with `FLOW_PAT`. Allowing
any bot would let any installed app that can dispatch a workflow start a code-writing agent. The
only bot that should is Flow's own dispatcher.

**Not in scope:** changing how flow-unblock dispatches (for example dispatching with `FLOW_PAT` so
the actor is a human). That would hide the actor, not fix the check. Also out of scope: making the
escalate step tell an infrastructure failure from a task failure. Worth a follow-up, but a separate
decision.

## Acceptance criteria

- [ ] Given `_flow-queue-runner.yml`, when the step named "Work the task (fresh worker session)"
      is parsed, then its `with.allowed_bots` is exactly `github-actions[bot]`.
- [ ] Given every step in `_flow-queue-runner.yml`, when parsed, then no step sets
      `allowed_bots: "*"`.
- [ ] Given `_flow-review.yml`, when parsed, then its `allowed_bots` values are unchanged (`*`).
- [ ] `changes/flow-0152.md` exists and states caller action: none (callers reference the reusable
      workflow; the fix arrives with the next pinned release).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
