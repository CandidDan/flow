---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0043"
title: "Stop flow-doctor warning that finished work serves a retired goal"
status: "in_progress"
priority: 3
project: "flow"
owner: "session_01Fo8Wc8oxHhe8rkbuLpshzR"
created: "2026-09-14"
started: "2026-09-14T02:10:04Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G7"]            # the repo's self-report is the thing being made legible
touches: ["project-template/.flow/bin/flow-doctor.mjs", "project-template/.flow/bin/flow-doctor.test.mjs", "CHANGELOG.md"]
labels: [infra, protocol]
notes:
  - "2026-09-14: NOT parallel-safe with flow-0043's sibling flow-0040, which is also `ready` and also touches project-template/.flow/bin/flow-doctor.mjs and its test. There is no dependency in either direction — they collide on files, not on logic — so either may go first; they simply must not run at once. The concurrency model enforces this on its own (a ready task is skipped while its touches overlap an in_progress one), so this note is the record, not the mechanism. flow-doctor WARNs on the pair; verified after claiming flow-0043 that the warning does NOT clear on `in_progress` — the overlap check spans the live set regardless of status, so the line stands until one of the two is `done`. Expect it on this PR and do not treat it as a finding."
---

## Context

`flow-doctor` warns when a task's `serves` names a goal sitting under `VISION.md`'s `## Retired`,
telling the reader to "re-anchor it to a live goal, or drop the task with the goal it served".

Against canonical's own store today that fires **36 times across 35 tasks** (flow-0010 serves two
retired goals and so warns twice). The cause is not drift: `VISION.md`'s change log records that
G1–G5 were *all* retired in one stroke on 2026-09-01, when the vision was rewritten from a
`vision-writer` interview. Every task written before that date against a then-live goal now warns,
forever.

The overwhelming majority of those are **finished**:

| Status | Warning lines | Can the advice be taken? |
|---|---|---|
| `done` | 28 (27 tasks) | **No** — neither remedy exists |
| `blocked` | 7 | Yes — "drop the task" is a live option |
| `ready` | 1 | Yes — both remedies available |

For a `done` task neither remedy is available. It cannot be dropped, because it is completed work
and the record of it is the point. It cannot be re-anchored either, and not merely as a matter of
taste: `task-writer`'s own rule is "don't retrofit `serves` onto tasks that are already
`in_progress`, `in_review`, `done` or `blocked` — the field records the goal a task was *written*
to advance". A `done` task serving a since-retired goal is therefore **correct history**, and the
warning asks the reader to falsify it.

The cost is that the one line which *does* need action is buried. `flow-0016` is `ready` —
claimable by a worker right now — and traces to retired G4. It is currently the 30th of 36
identical-looking lines. Note that flow-doctor escalates a `ready` task to a *failure* when its
`serves` is undeclared or names a non-goal, but a retired goal only ever warns regardless of
status; that asymmetry is what lets flow-0016 hide.

This is the same failure mode flow-0032 was about, one altitude up: a check that reports something
technically true but no longer meaningful, until nobody reads it.

## Scope

In `project-template/.flow/bin/flow-doctor.mjs`, suppress the **retired-goal warning only** for
tasks whose `status` is `done`.

Deliberately narrow, and the narrowness is the design:

- **Only `done` is suppressed.** Not "terminal statuses" as a class. `blocked`, `in_progress` and
  `in_review` keep warning, because for each of those the task is still alive and *some* decision
  remains open to the reader — dropping a blocked task is a real and often correct call. Only
  `done` has no available remedy at all.
- **Only the retired-goal branch changes.** The sibling branches in the same `else if` chain — an
  undeclared goal id, and a `serves` naming a declared non-goal — must behave exactly as they do
  now for every status, `done` included. Those two indicate a broken or contradictory record
  rather than merely an aged one, and are worth surfacing on history.

This task does **not**: touch `VISION.md` or retire/declare any goal; re-anchor, edit or delete any
existing task file; change canonical's thin adapter at `.flow/bin/flow-doctor.mjs` (it imports the
template's logic and needs no edit); alter the warning's wording; or change whether warnings affect
the exit code (they must still report without failing).

## Acceptance criteria

- [ ] Given a task with `status: done` whose `serves` names a goal under `## Retired`, when
      flow-doctor runs, then it emits **no** warning for that task, and `problems` stays empty.
- [ ] Given the same task with `status: ready`, then the retired-goal warning **is** emitted —
      proving the suppression is keyed on status and the existing behaviour is otherwise intact.
- [ ] Given the same task with `status: blocked`, then the retired-goal warning **is** emitted.
- [ ] Given the same task with `status: in_progress` and again with `in_review`, then the
      retired-goal warning **is** emitted in both cases.
- [ ] Given a task with `status: done` whose `serves` names a goal `VISION.md` does not declare at
      all, when flow-doctor runs, then the existing "does not declare" report is unchanged —
      the suppression must not leak to the sibling branches.
- [ ] Given a task with `status: done` whose `serves` names a declared **non-goal**, then the
      existing NON-GOAL report is unchanged.
- [ ] Given canonical's own store, when `node .flow/bin/flow-doctor.mjs` runs, then every
      remaining retired-goal warning names a task whose status is not `done`, and the command
      still exits 0. (State it as that property, derived at run time — do not assert a hardcoded
      count, which ages the moment the store moves. See the note below.)
- [ ] `CHANGELOG.md`'s `## Unreleased` section records the behaviour change and names flow-0043,
      in the style of the entries already there, since adopting repos consume this helper.
- [ ] `build`, `lint`, `test` and `coverage` all pass, coverage at or above the floor of 83.5.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **Do not pin a count.** An earlier task in this repo (flow-0032) shipped a test asserting a
  hardcoded file count that its own helper re-derived with the same flawed measurement — it passed
  while being wrong, because it agreed with itself. Assert the *property* ("no remaining
  retired-goal warning names a `done` task"), re-derived from the store at run time.
- The existing test at `project-template/.flow/bin/flow-doctor.test.mjs:637` ("serves naming a
  retired goal → WARNING, not a problem") uses a fixture that does not set a status. Check what
  status the `task()` fixture helper defaults to before assuming that test still proves what its
  name claims — if it defaults to `done`, that test would silently invert under this change and
  needs its status made explicit rather than left implicit.
- `flow-0016` is the live finding this change surfaces, not something to fix here. It is `ready`
  and serves retired G4; raising it is the orchestrator's call, not this task's.
