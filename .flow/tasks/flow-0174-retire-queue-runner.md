---
id: "flow-0174"
title: "Retire flow-queue-runner: the reusable, the callers and its helpers are gone, flow-sync removes the caller downstream, and the protocol names the worker routine as what runs the loop"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-10-28"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits for flow-0172 (routine worker protocol) and flow-0173 (unblock stops dispatching queue-runner), and for flow-0164 (PR #241), which adds the flow-sync mechanism for deleting a retired file downstream that this task reuses. It also carries an open decision: what replaces queue-runner's automatic model-tier escalation."
cancelled_reason: ""
blocked_by: ["flow-0172", "flow-0173", "flow-0164"]
serves: ["G9"]
intent: "model-work-off-github-actions"
touches:
  - ".github/workflows/_flow-queue-runner.yml"
  - ".github/workflows/flow-queue-runner.yml"
  - "project-template/.github/workflows/flow-queue-runner.yml"
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-sync.mjs"
  - "project-template/.flow/bin/flow-sync.test.mjs"
  - ".flow/bin/queue-runner-*.mjs"
  - "project-template/.flow/bin/queue-runner-*.mjs"
  - ".flow/bin/*.test.mjs"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/bin/flow-init.mjs"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "docs/flow-reusable-workflows.md"
  - "docs/adopting-flow-cutover.md"
  - "docs/repinning-a-consuming-repo.md"
  - "README.md"
  - "changes/flow-0174.md"
  - "project-template/.flow/bin/flow-unblock.mjs"
  - "project-template/.flow/bin/flow-unblock.test.mjs"
  - ".flow/bin/flow-unblock.mjs"
  - "project-template/.github/workflows/flow-unblock.yml"
  - ".github/workflows/flow-unblock.yml"
labels: [workflows, retirement, routines, cost]
model: "opus"
effort: "high"
model_reason: "Removes a reusable workflow the fleet calls and deletes its caller downstream through flow-sync; cross-cutting across tests, docs and the protocol"
notes: []
asks:
  - "decision: queue-runner's escalate step moves a task up a model tier (haiku -> sonnet -> opus -> fable) when a run ends without a PR, and that step leaves with it, because a routine has no post-run step. What replaces it? Recommend: flow-recover escalates instead. When it resets a stranded in_progress task with nothing pushed back to ready, it applies the same one-tier bump through task-model.mjs. That keeps the ladder mechanical, runs no model, and recover already sees exactly the runs that ended without a PR."
---

## Context

Intent `model-work-off-github-actions` (merged 2026-10-28, PR #250), in Dan's words: "queue runner
has to go, we need a better way to do this". flow-0172 makes the loop runnable from a Claude Code
cloud routine, and flow-0173 stops flow-unblock from dispatching queue-runner. After both,
queue-runner is dead code that every adopting repo still syncs and schedules: an hourly caller
that bills a minute per tick even when `FLOW_QUEUE_RUNNER=paused`. That was found on 2026-10-28,
and the workflow was disabled by hand in all seven private Flow repos.

`git grep -l queue-runner` on `main` at f5b3260 lists about 50 files, outside the task store and
the changelog. They fall into three groups: the reusable plus its two callers, its helpers
(`queue-runner-schedule.mjs`, `queue-runner-verify.mjs` and their tests), and references in tests,
docs, the protocol, `flow-doctor`, `flow-init`, `pick-task` and `task-model`.

## Scope

- Delete `_flow-queue-runner.yml`, canonical's `flow-queue-runner.yml` caller, and
  `project-template/.github/workflows/flow-queue-runner.yml`.
- Make flow-sync remove `.github/workflows/flow-queue-runner.yml` in an adopting repo, using the
  same retired-file mechanism flow-0164 adds for the board. Do not invent a second mechanism.
- Delete the queue-runner-only helpers and their tests. Keep `pick-task.mjs` and `task-model.mjs`:
  the routine worker uses both.
- Update every remaining reference so nothing describes queue-runner as live. That covers the
  protocol's *Concurrency* and model-tier paragraphs, flow-doctor, flow-init, the task-writer
  skill's "Choosing the model" section, README and docs.
- Implement the answer to this task's `decision` ask (see `asks`) before it returns to `ready`.
- From flow-0173 (2026-10-28): delete the four dispatch-only subcommands and functions in
  `project-template/.flow/bin/flow-unblock.mjs` (`count-ready`, `count-active-runs`,
  `should-dispatch`, `dispatch-outcome`) together with their re-export in `.flow/bin/flow-unblock.mjs`,
  and drop the now-unused `actions: write` from both `flow-unblock.yml` callers. The latter is a
  caller-permission change, which this task's MAJOR release already covers.
- Changelog fragment `changes/flow-0174.md`. Removing a reusable that callers reference, and
  deleting a caller downstream, is a **MAJOR** release under `docs/flow-versioning-policy.md`
  unless the decision ask's answer says otherwise. **Caller action: run flow-sync.**

**Deliberately does NOT:**
- Move review, kickback, triage or compass. The intent leaves that open.
- Touch inflight's "Work this →" link (another repo).

## Acceptance criteria

The `touches` list and these criteria are re-cut when the task returns to `ready`, after flow-0164
lands, against the file list on `main` at that point.

- [ ] Given `main` after this task, when `git grep -l "flow-queue-runner"` runs outside `.flow/tasks/`, `changes/` and `CHANGELOG.md`, then it finds only historical mentions that are marked as retired (proving test named when re-cut).
- [ ] Given an adopting repo that has `.github/workflows/flow-queue-runner.yml`, when flow-sync runs, then the file is deleted in the sync PR (`project-template/.flow/bin/flow-sync.test.mjs`).
- [ ] Given a task whose worker run ended with nothing pushed, when flow-recover resets it to `ready`, then its model tier behaves as the decision ask resolved (proving test named when re-cut).
- [ ] Given `changes/flow-0174.md`, then it states the caller action "run flow-sync" (`.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- The `.flow/bin/*.test.mjs` glob in `touches` is deliberately wide while the task is `blocked`.
  Narrow it to the exact files when re-cutting.
