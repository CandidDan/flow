---
id: "flow-0182"
title: "flow-dispatch fires the worker routine for the task's tier whenever a task becomes ready, with a daily sweep as the fallback"
status: "blocked"
priority: 1
project: "flow"
owner: ""
created: "2026-10-29"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits for flow-0179 (go to v4): the new caller must pin @v4, and flow-0179 rewrites the caller-pin tests this task also extends."
blocked_by: ["flow-0179"]
serves: ["G9"]
intent: "model-work-off-github-actions"
touches:
  - ".github/workflows/_flow-dispatch.yml"
  - ".github/workflows/flow-dispatch.yml"
  - "project-template/.github/workflows/flow-dispatch.yml"
  - "project-template/.flow/bin/flow-dispatch.mjs"
  - "project-template/.flow/bin/flow-dispatch.test.mjs"
  - ".flow/bin/flow-dispatch.mjs"
  - ".flow/bin/flow-dispatch-workflow.test.mjs"
  - ".flow/bin/adapters.test.mjs"
  - ".flow/bin/caller-pins.test.mjs"
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-sync.mjs"
  - "project-template/.flow/config.yml"
  - "docs/flow-routines.md"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0182.md"
labels: [workflows, routines, worker]
model: "opus"
effort: "high"
model_reason: "A new reusable workflow the whole fleet calls, holding routine tokens as secrets, whose trigger set must start every ready task exactly once without looping"
asks: []
notes:
  - "2026-10-29 orchestrator: Dan chose 'Event, plus daily sweep' over 'Hourly schedule only'. Events start work in seconds and no session runs when nothing is ready. The daily sweep catches a missed event. This settles the intent's open question 'What starts a worker once flow-queue-runner is gone'."
  - "2026-10-29 orchestrator: the sweep runs in this Actions workflow rather than as a scheduled routine. A scheduled routine runs on one model, so with an empty trigger it would pick a task of any tier. The Actions job spends seconds and calls no model, which is within the intent's rule against billing Actions for model time."
---

## Context

flow-0174 retired `flow-queue-runner`. A Flow worker now runs as a Claude Code cloud routine
(`docs/flow-routines.md`): one routine per model tier per repo, named
`flow-worker-<repo>-<tier>`, fired through its API trigger with the task id as `text`. Nothing
fires those routines yet, so after v4.0.0 no worker starts unless a person starts one. This task
adds the thing that fires them.

## Scope

A new reusable `_flow-dispatch.yml`, its caller (template and canonical), and a helper
`flow-dispatch.mjs`, with logic in the template and a thin adapter in `.flow/bin/`.

**When it runs (the caller's `on:`):**
- `push` to `main` with paths `.flow/tasks/**`. This covers a task allocated `ready`, a claim, and a
  human's state edit.
- `workflow_run` of `flow-unblock` and `flow-recover`, types `completed`. Their commits are pushed
  with `GITHUB_TOKEN`, and GitHub does not start workflows from a `GITHUB_TOKEN` push, so the
  `push` trigger alone would miss a task they release or reset to `ready`.
- `schedule`: once a day, as the sweep.
- `workflow_dispatch`.
- `concurrency: flow-dispatch`, `cancel-in-progress: false`.

**What one run does:**
1. Count the `in_progress` tasks on `main`. If the count is at or above `dispatch.max_in_progress`
   (`.flow/config.yml`, default 3), stop with a decision line.
2. Pick with `pick-task.mjs` (highest priority `ready`, no overlap with in-flight work). If it
   picks nothing, stop with a decision line.
3. Resolve the task's tier with `task-model.mjs` (unset means `sonnet`).
4. Fire that tier's routine: `POST https://api.anthropic.com/v1/claude_code/routines/<id>/fire`,
   body `{"text": "<task-id>"}`, with the headers in `docs/flow-routines.md`. The trigger id is
   the repo variable `FLOW_ROUTINE_<TIER>_ID`. The token is the repo secret
   `FLOW_ROUTINE_<TIER>_TOKEN`, passed only through `secrets:`/`env:`, never interpolated into
   `run:`.
5. Fire **at most one** task per run. The claim that run starts is a push to `.flow/tasks/`,
   which starts the next run. That chain is how parallel work fans out, and step 1 is what ends it.

**Fail-safe rules:**
- If the tier's variable or secret is missing, print a visible
  `flow-dispatch: decision=skipped reason=no-routine-for-<tier>` line and exit 0. A repo that has
  not set up routines yet stays green.
- A non-2xx response from the fire call fails the job, naming the status and the tier. Never log
  the token.
- Never fire for a task that is not `ready` on `main` at the moment of the call. Re-read the task
  just before firing.
- Exactly one decision line per run: `fired`, `skipped` (with a reason) or `failed`.

**Delivery:** `flow-sync` ships the new caller to adopting repos, the same way it ships the other
callers. `docs/flow-routines.md` gains a "Wiring the trigger" section: per tier, create the API
trigger, store its token as `FLOW_ROUTINE_<TIER>_TOKEN` and its id as `FLOW_ROUTINE_<TIER>_ID`.
`docs/flow-reusable-workflows.md` lists the new reusable.

**Does not:**
- Create routines or tokens. That is a claude.ai UI step, and the token is shown once.
- Change the protocol, pick-task's ordering, or the routine prompt.
- Re-dispatch a stalled run. flow-recover already resets a stranded claim, and that reset now
  fires dispatch through `workflow_run`.

## Acceptance criteria

- [ ] Given a store with one `ready` sonnet task, no in-flight work, and `FLOW_ROUTINE_SONNET_*`
      set, when the helper runs with a stubbed fire endpoint, then it POSTs once to the sonnet
      trigger with `{"text": "<task-id>"}` and prints `decision=fired`.
- [ ] Given a task with `model: "opus"`, then the opus trigger is the one fired.
- [ ] Given no variable or secret for the picked task's tier, then nothing is POSTed, the line says
      `decision=skipped reason=no-routine-for-<tier>`, and the exit code is 0.
- [ ] Given `in_progress` already at `max_in_progress`, then nothing is POSTed and the line says
      `decision=skipped reason=at-capacity`.
- [ ] Given no eligible task, then nothing is POSTed and the line says `decision=skipped reason=nothing-ready`.
- [ ] Given a 4xx/5xx from the fire endpoint, then the job exits non-zero, names the status and the
      tier, and the token appears nowhere in the output.
- [ ] Parsing `_flow-dispatch.yml` and the template caller shows: every trigger listed under
      "When it runs" is present, the concurrency group is not cancel-in-progress, the token
      reaches the script only through `secrets:`/`env:`, and `uses:` is pinned `@v4`.
- [ ] `caller-pins.test.mjs` covers the new caller, and the caller count rises by one.
- [ ] Given a repo whose sync runs at this release, then its sync PR adds `.github/workflows/flow-dispatch.yml`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
