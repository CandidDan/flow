---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0070"
title: "Queue cap: refuse to allocate a new ready task while the queue is full, unless it is urgent"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-23"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # a WIP limit on Flow's own queue; no live VISION goal names it (spec workstream A)
touches:
  - "project-template/.flow/bin/allocate-task-id.mjs"
  - "project-template/.flow/bin/allocate-task-id.test.mjs"
  - ".flow/bin/allocate-task-id.mjs"
  - ".flow/bin/allocate-task-id.test.mjs"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "project-template/.flow/config.yml"
  - ".flow/config.yml"
  - "changes/flow-0070.md"
labels: [task-writer, queue, wip-limit]
notes:
  - "2026-09-23 (orchestrator): DEPENDS ON flow-0069 (changelog fragments). This task writes its changelog entry as `changes/flow-0070.md`, a convention that exists only once flow-0069 merges, and both tasks edit the task-writer SKILL. If flow-0069 is not `done` when you pick this up, set this task `blocked` with `blocked_by: [\"flow-0069\"]` rather than editing CHANGELOG.md. Same shape as flow-0002's dependency on flow-0001."
  - "2026-09-23 (orchestrator): decided, so the worker does not re-litigate. (1) The spec says to refuse 'while more than 8 are ready'. This task reads `queue_cap: 8` as a MAXIMUM: the queue may hold at most 8 ready tasks, so allocation refuses when 8 or more are already ready. That is what a WIP limit means. (2) The cap is ENFORCED in the allocator, not only described in the SKILL. Prose in a skill is exactly the kind of rule that holds until the session that most wants to break it arrives, and the allocator is already the one path every new task takes to main. (3) The only bypass is the `urgent` label on the draft. There is no flag, no env var and no --force. (4) A draft whose status is not `ready` (for example `blocked`) is never capped: the cap limits the ready queue, not the store."
  - "2026-09-23 (orchestrator): once this is live, canonical's queue (13 ready on 2026-09-23) means new ready tasks are refused until the queue drains below 8. That is intended: the spec says nothing new enters canonical's queue until workstreams A–D merge."
---

## Context

Flow applies a WIP limit to the work it runs, through `touches` and one claim per session, but not to
the work it plans. On canonical the orchestrator keeps writing `ready` tasks faster than they drain: 13
were `ready` on 2026-09-23, and nearly all of the last ~25 were Flow maintaining
itself. The spec behind this task (workstream A, item 4) asks for a cap. When more tasks are ready than
the cap allows, a new `ready` task is refused unless it is labelled `urgent`.

Every new task already reaches `main` through `allocate-task-id` (flow-0021), which reads `origin/main`
fresh before it allocates. So the allocator can count the ready queue at the same moment it allocates,
against the same state, with no extra git call.

## Scope

- **Config.** Add an optional integer, `queue_cap`, to `.flow/config.yml`. When it is absent,
  nothing is capped. That is the default, so consuming repos are unaffected unless they opt in.
  - Set canonical's `.flow/config.yml` to `queue_cap: 8`, with a comment that points at this task.
  - Document the key as a **commented-out** example in `project-template/.flow/config.yml`.
- **Allocator core** (`project-template/.flow/bin/allocate-task-id.mjs`): accept an optional
  `queueCap`. It refuses only when all three of these hold:
  - the draft's frontmatter `status` is `ready`,
  - the draft's `labels` do not include `urgent`,
  - the number of `ready` tasks on the freshly fetched `origin/main` is `>= queueCap`.
- **What a refusal does.** It throws the existing `AllocationError` before anything is written,
  committed or pushed. The message names the current ready count, the cap, and the two ways forward:
  label the draft `urgent`, or write it `blocked`.
- **The count** comes from the same fetched state the id is allocated against, not the working tree.
- **Both CLIs** (the template's and canonical's adapter at `.flow/bin/allocate-task-id.mjs`) read
  `queue_cap` from the repo's `.flow/config.yml` and pass it through.
  - Keep the adapter to CLI shell only. The logic lives in the template, per root `CLAUDE.md`.
  - `--dry-run` reports whether the draft would be refused, but only when a `--content-file` is
    given.
- **The task-writer SKILL** gets one short paragraph. The allocator enforces `queue_cap`. A refused
  task is either not written yet, or written `blocked`. `urgent` is the human's label, and the
  orchestrator never applies it on its own judgement (the same rule as `auto-ok`).

Deliberately **not** touched:

- `flow-doctor`. It does not check the cap. A queue over the cap is store state, and failing every
  PR's gate on store state is the flow-0052 trap.
- `pick-task`, the queue runner, and anything else that consumes the queue. This task limits what
  enters the queue, not how it is worked.
- `.flow/tasks/**`. No existing ready task is demoted to make room.

## Acceptance criteria

- [ ] Given `queueCap: 8` and 8 `ready` tasks on `origin/main`, when a `ready` draft without the
      `urgent` label is allocated, then `AllocationError` is thrown. The message contains the ready
      count, the cap, and the word `urgent`. No file is written, no commit is made and nothing is
      pushed (the injected git runner records no `add`, `commit` or `push`).
- [ ] Given `queueCap: 8` and 7 `ready` tasks, when the same draft is allocated, then it succeeds
      exactly as it does today.
- [ ] Given `queueCap: 8` and 8 `ready` tasks, when a `ready` draft labelled `urgent` is allocated,
      then it succeeds.
- [ ] Given `queueCap: 8` and 8 `ready` tasks, when a `blocked` draft is allocated, then it succeeds.
- [ ] Given no `queueCap` (config key absent), when a `ready` draft is allocated with 50 `ready`
      tasks on `origin/main`, then it succeeds. The default is uncapped.
- [ ] Given `queueCap: 8`, when a `ready` draft is allocated and the local working tree holds more
      ready tasks than `origin/main`, then only the tasks on `origin/main` are counted.
- [ ] Given canonical's `.flow/config.yml`, when the canonical adapter's CLI runs `--dry-run` with a
      `--content-file` for a non-urgent `ready` draft, then it reads `queue_cap: 8` from the config
      and reports the refusal decision without writing anything.
- [ ] The task-writer SKILL names `queue_cap`, `urgent` and `blocked` in its cap paragraph, and a test
      asserts all three words are present.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

The allocator already has a pure core with an injected git runner and existing tests using that
seam. Extend those tests; do not add a new harness. If `readTasksFromOrigin` does not expose
`status` and `labels` in a form the core can count, extending its return shape is in scope only if it
stays inside `allocate-task-id.mjs`. `flow-state.mjs` is not in `touches`, so a change there is a
block, not a silent widening.
