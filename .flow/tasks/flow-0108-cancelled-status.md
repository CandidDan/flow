---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0108"
title: "Add a terminal `cancelled` status so dead work stops squatting in `blocked`"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-09-30"
started: ""
branch: ""
pr: ""
issue: "https://github.com/CandidDan/flow/issues/73"
blocked_reason: ""
blocked_by: []
serves: ["G7"]    # G7: a Flow repo reports its own state, completely enough to render without
                  # asking the owner. Superseded/obsoleted/deferred work sitting in `blocked`
                  # (observed 30% of Nudge's blocked column) makes that report wrong: it reads
                  # as "stuck on a human decision" when nothing is actually waiting on one.
touches:
  - "project-template/.flow/bin/pick-task.mjs"
  - "project-template/.flow/bin/pick-task.test.mjs"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/bin/flow-recover.mjs"
  - "project-template/.flow/bin/flow-recover.test.mjs"
  - "project-template/.flow/bin/apply-board-edits.mjs"
  - "project-template/.flow/bin/apply-board-edits.test.mjs"
  - "project-template/.claude/skills/board-builder/SKILL.md"
  - "project-template/.flow/tasks/_TEMPLATE.md"
  - "project-template/.flow/PROTOCOL.md"
  - "changes/flow-0108.md"
labels: [flow-infra, protocol]
notes:
  - "2026-09-30 (orchestrator): Renumbered from flow-0104: the triage run allocated that id a minute after a local session had already taken it (duplicate id). Changelog fragment path updated to match; content otherwise unchanged."
---

## Context

The status lifecycle (`ready → in_progress → in_review → done`, with `blocked` as the only
detour) has no terminal state for work that will **never ship** — superseded by other work,
obsoleted by a refactor, or deliberately deferred with no intent to return. `done` cannot be
hand-written (it is the merge workflow's transition and would be a lie: the work didn't ship),
so `blocked` becomes the dumping ground. `blocked` carries a specific meaning — a worker hit
something undecidable and a human must act — and every entry is an implicit request for
attention. Issue #73 found 3 of 10 blocked tasks in a real repo (Nudge) were dead work wearing
that label, diluting the signal for the 7 that genuinely needed a human.

Full issue: https://github.com/CandidDan/flow/issues/73

## Scope

**Does:**

- Add `cancelled` as a valid `status` value, alongside `ready`, `in_progress`, `in_review`,
  `done`, `blocked`.
- Add a new frontmatter field `cancelled_reason` (a string, empty by default), required
  whenever `status` is `cancelled` — parallel to how `blocked_reason` is required for
  `blocked`. Do not overload `blocked_reason` for this: `blocked_by`'s "clear it when the
  block clears" checks and the "not machine-checkable" convention are specific to `blocked`'s
  semantics, and reusing the field would make those checks ambiguous.
- `cancelled` is **terminal**: nothing transitions out of it automatically. It is reversible
  only by a human (the orchestrator) hand-editing the file's `status` back to `ready`.
- `cancelled` is **hand-writable by the orchestrator only, never the worker** — the same rule
  as `blocked`: a worker deciding its own task is pointless is exactly the guess this protocol
  exists to prevent. A worker that concludes its task should not proceed still sets `blocked`
  and surfaces it.
- The orchestrator may set `status: cancelled` directly from `ready` or from `blocked` (the two
  real cases from #73 — a queued task that's now moot, or a blocked task whose premise died).
  A task that is `in_progress` or `in_review` is being actively worked or reviewed and is out
  of scope for this task; it must reach `blocked` or `in_review`/`done` first, as today.
- Update every consumer of the status enum:
  - `pick-task.mjs` — `cancelled` is invisible to selection, like `done`.
  - `flow-doctor.mjs` — accept `cancelled` as a valid status; require `cancelled_reason` when
    `status` is `cancelled` (mirroring the existing `blocked_reason` requirement check); treat
    a `cancelled` task like `done` for the `serves`-resolution warning (it is history, not live
    work, so an unresolvable `serves` is not re-warned) and for any other "live status" branch
    that currently lists `blocked`/`in_progress`/`in_review`.
  - `flow-recover.mjs` — a `cancelled` task is never `in_progress`, so the stranded-claim sweep
    naturally never touches it; add a test asserting this rather than new production logic, so
    a future change to `classifyStranded` can't silently start reaping cancelled tasks.
  - `apply-board-edits.mjs` — add `cancelled` to the `STATUSES` set so a board-driven edit may
    set it.
  - `board-builder/SKILL.md` — document rendering `cancelled` in its own column, or folded
    into a "closed" heading with `done` (either is acceptable; state which was chosen and why).
  - `_TEMPLATE.md` — the `status` field comment lists `cancelled` in the enum, and the
    `cancelled_reason` field is documented with the same "required iff" phrasing as
    `blocked_reason`.
  - `PROTOCOL.md` — the lifecycle diagram gains the `cancelled` terminal state; the *Status
    lifecycle* section documents it (hand-writable, orchestrator-only, requires
    `cancelled_reason`); the *Hard rules* sentence "you hand-write exactly two transitions"
    becomes three.
  - Changelog fragment `changes/flow-0108.md`.

**Does not touch:**

- `.flow/bin/` (canonical's adapters) beyond what re-exporting the template's changed exports
  already requires — no new adapter-only logic.
- The board's HTML generation mechanics beyond the column/heading documented in the skill.
- Migrating any existing `blocked` task to `cancelled` — that is a per-task orchestrator
  judgement call, not this task's job.

## Acceptance criteria

- [ ] Given a task file with `status: "cancelled"` and a non-empty `cancelled_reason`, when
      `flow-doctor` validates it, then it reports no problem for that task's status/reason pair.
- [ ] Given a task file with `status: "cancelled"` and an empty `cancelled_reason`, when
      `flow-doctor` validates it, then it reports a FAIL naming the missing reason, mirroring
      the existing `blocked` + empty `blocked_reason` check.
- [ ] Given a `cancelled` task with an unresolvable `serves` id, when `flow-doctor` runs, then
      it does NOT warn (same treatment as `done`).
- [ ] Given a store containing one `cancelled` task and one `ready` task with identical
      `priority`, when `pick-task` runs, then only the `ready` task is eligible — the
      `cancelled` one is never returned, the same way a `done` task never is.
- [ ] Given a `cancelled` task, when `flow-recover`'s stranded-claim sweep runs, then it is
      never classified as reapable (test pins this the same way the existing `in_progress`
      + open-PR "never disturbed" case is pinned).
- [ ] Given a board edit setting a task's status to `cancelled`, when `apply-board-edits`
      validates it, then `cancelled` is accepted as a member of `STATUSES`.
- [ ] `_TEMPLATE.md`'s `status` field comment and its `cancelled_reason` field comment are
      present and match the "required iff status is cancelled" phrasing pattern.
- [ ] `PROTOCOL.md`'s lifecycle diagram and *Status lifecycle* section document `cancelled` as
      a third hand-written, orchestrator-only transition.
- [ ] `board-builder/SKILL.md` documents where `cancelled` tasks render.
- [ ] `changes/flow-0108.md` exists and summarizes the new status.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

- The issue also floats an interim workaround in use downstream (`git mv` to
  `.flow/tasks/archive/`, relying on non-recursive `readdir`). This task does not touch that
  convention or migrate any repo's archived files — it only ships the mechanism so a future
  sweep can stop needing it.
