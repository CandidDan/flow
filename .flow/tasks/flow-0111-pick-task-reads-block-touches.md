---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0111"
title: "pick-task reads block-form `touches`, so the queue runner stops dispatching into collisions"
status: "done"
priority: 1
project: "flow"
owner: "claude-cowork-orchestrator"
created: "2026-10-01"
started: "2026-09-30T23:49:29Z"
branch: "flow/flow-0111-pick-task-reads-block-touches"
pr: "https://github.com/CandidDan/flow/pull/145"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # the gate tells the truth: a concurrency guard that fails open reports "safe" on every collision.
touches:
  - "project-template/.flow/bin/pick-task.mjs"
  - "project-template/.flow/bin/pick-task.test.mjs"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "changes/flow-0111.md"
labels: [queue-runner, concurrency, flow-infra]
notes:
  - "2026-10-01 (orchestrator): from the flow-0089 worker's 30 Sep note, confirmed by reading pick-task.mjs at main. `parseTask()` reads `touches` only as an inline array (`/^touches:\\s*\\[(.*?)\\]/m`). Every real task file in canonical and in tanplan-platform uses the YAML block-sequence form, so `touches` parses as [] for every task, `touchesOverlap()` is always false, and the queue runner's overlap filter is inert fleet-wide."
  - "2026-10-01 (orchestrator): LIVE EVIDENCE in an adopting repo. tanplan-platform's queue runner on 30 Sep 07:25 UTC picked tanplan-0026 while tanplan-0022 was in_progress with an overlapping file (globalSetup.ts). The worker caught it by reading, refused, and the run was marked failed. The guard should have skipped the task before a worker was ever started."
---

## Context

`pick-task.mjs` chooses the next `ready` task for the queue runner and skips one whose `touches`
overlaps an `in_progress` task. Its frontmatter parse only understands `touches: ["a", "b"]`.
`flow-doctor.mjs` already has `parseListField(head, key)`, which reads both the inline and the
block-sequence forms, and its comment names this exact failure ("A naive same-line scan misses the
multi-line form"). The fix is to use that parser, not to write a third one.

## Scope

**Does:**

- Export `parseListField` from `flow-doctor.mjs` (no behaviour change there).
- `pick-task.mjs` `parseTask()` reads `touches` through it. The inline form keeps working.
- Tests in `pick-task.test.mjs` for both forms, for overlap detection across them, and one over
  the real store proving the parse is not empty for a known task.
- Changelog fragment `changes/flow-0111.md`. **Caller action: none** (adopters get it at the next sync).

**Does not touch:** touches-guard, flow-doctor's findings, the queue-runner workflow.

## Acceptance criteria

- [ ] Given a task whose `touches` is a YAML block sequence of two paths, when `parseTask` reads it,
      then `touches` holds both paths, quotes stripped, trailing `#` comments ignored.
- [ ] Given a task with the inline-array form, then `parseTask` returns the same list as before.
- [ ] Given one `in_progress` task (block form) and one `ready` task (block form) sharing a path,
      when `pickTask` runs, then the `ready` task is not picked.
- [ ] Given this repo's own store, when `readTasks` runs, then no task that declares `touches`
      parses to an empty list (the store-wide regression guard).
- [ ] `pick-task.mjs` imports `parseListField` from `flow-doctor.mjs`; it contains no `touches:`
      regex of its own (structure test).
- [ ] `changes/flow-0111.md` exists and states "Caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
