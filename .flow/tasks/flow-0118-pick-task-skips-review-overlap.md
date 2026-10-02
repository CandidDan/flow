---
id: "flow-0118"
title: "pick-task skips a ready task whose touches overlap a task in review, not only one in progress"
status: "done"
priority: 2
project: "flow"
owner: "claude-worker-flow-0118"
created: "2026-10-01"
started: "2026-10-02T04:29:00Z"
branch: "flow/flow-0118-pick-task-skips-review-overlap"
pr: "https://github.com/CandidDan/flow/pull/170"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G8"]    # G8: holds at scale. More parallel workers mean more review-stage overlap, and today that overlap dispatches a worker into a known conflict.
touches:
  - "project-template/.flow/bin/pick-task.mjs"
  - "project-template/.flow/bin/pick-task.test.mjs"
  - "project-template/.flow/PROTOCOL.md"
  - "changes/flow-0118.md"
labels: [flow-infra, concurrency, queue-runner]
notes:
  - date: "2026-10-02"
    by: "claude-worker-flow-0118"
    text: >-
      Build complete on branch flow/flow-0118-pick-task-skips-review-overlap (pushed). All four
      gate commands green: build 34 workflows, lint 113 .mjs, test 1779/1778 pass, coverage
      96.97% lines (floor 83.5). pickTask now filters against IN_FLIGHT_STATUSES =
      ["in_progress", "in_review"]; both statements of the claim rule in PROTOCOL.md name
      in_review; six new tests in pick-task.test.mjs cover every acceptance criterion.
      ONE FILE OUTSIDE `touches`, flagged rather than hidden: .flow/bin/protocol-portability.test.mjs.
      Its digest pin fails on ANY PROTOCOL.md edit and its own failure message prescribes
      recording an INTENTIONAL_DIVERGENCES entry in the same commit, so the declared PROTOCOL.md
      edit is not landable without it. Two entries added (Concurrency, The loop you run), each
      with a reason and task id. It is canonical-only bookkeeping, touches-guard excludes
      `.flow/**` from scope judging, and no other task is in flight, so nothing collides — but
      the orchestrator may want to add it to `touches` for any future protocol-editing task.
      NEXT ACTION: open the PR titled "[flow-0118] pick-task skips a ready task whose touches
      overlap a task in review, not only one in progress", then `gh pr ready`.
---

## Context

On 2026-10-01 in `CandidDan/inflight`, `inflight-0015` was `in_review` (PR #30 open, not merged) and
`inflight-0016` was `ready` with overlapping `touches`: four shared files, including
`app/_components/needs-you.js` and `bin/home-view.mjs`. The scheduled queue runner picked
`inflight-0016` anyway, because `pickTask` only excludes tasks that overlap an **`in_progress`** one.
The worker claimed it, saw the overlap with the open PR, and blocked itself by hand (its note:
"The protocol's claim rule only skips ready tasks overlapping an in_progress task, and 0015 is
in_review, so this task looked claimable; the overlap is real anyway"). A person then had to
unblock it after #30 merged and dispatch it again.

The worker made the right call, but nothing makes it do so. A less careful worker would have
branched off `main` beneath a PR about to rewrite the same regions, and opened a PR conflicting in
four files. `in_review` work has not landed yet. For collision purposes it is still in flight.

## Scope

Does:

- `pickTask` treats a task as **in flight** when its status is `in_progress` **or** `in_review`,
  and skips any `ready` task whose `touches` overlap an in-flight task's `touches`. Sort order,
  tie-breaks and the empty-result behaviour are unchanged.
- Rename the internal filter variable (e.g. `inFlight`) so the code says what it means.
- Update the module's header comment and the two sentences in `project-template/.flow/PROTOCOL.md`
  that state the rule (the *Concurrency* paragraph on `touches`, and step 1 of *The loop you run*)
  to say "an `in_progress` or `in_review` task". Change nothing else in PROTOCOL.md.
- A changelog fragment, `changes/flow-0118.md`, in the format `changes/README.md` describes.

Does not:

- Touch `flow-doctor`'s overlap warning, `flow-recover`, or any workflow. The queue runner calls
  `pick-task.mjs` unchanged.
- Treat `blocked` tasks as in flight. A blocked task has no live branch heading for `main`, and
  `blocked_by` already sequences it.
- Change canonical's `.flow/bin/pick-task.mjs` adapter. It imports the template's logic.

## Acceptance criteria

- [ ] Given a `ready` task A and an `in_review` task B whose `touches` overlap, when `pickTask` runs,
      then A is not returned. (`pick-task.test.mjs`)
- [ ] Given the same pair with B `in_progress`, A is still not returned: today's behaviour is kept.
      (`pick-task.test.mjs`)
- [ ] Given a `ready` task A whose `touches` overlap only a `blocked` task and a `done` task, A is
      returned. (`pick-task.test.mjs`)
- [ ] Given two `ready` tasks, where the higher-priority one overlaps an `in_review` task and the
      lower-priority one overlaps nothing, the lower-priority one is returned.
      (`pick-task.test.mjs`)
- [ ] Given task files whose `touches` are written in YAML block-sequence form (the form every real
      store uses), the `in_review` overlap above is still detected, so the guard cannot fail open
      on the parse. (`pick-task.test.mjs`, from fixture text read by `readTasks`)
- [ ] Given `project-template/.flow/PROTOCOL.md`, both statements of the claim rule name `in_review`
      alongside `in_progress`. (A string assertion in `pick-task.test.mjs`, so the rule and the
      document cannot drift apart silently.)

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Decided: `in_review` counts and `blocked` does not. A review-stage PR is about to change `main`.
  A blocked task is not.
- Trade-off, accepted: a PR that sits unmerged for days now holds back the ready tasks that overlap
  it. That is the intended pressure: it surfaces as a waiting item instead of as a merge conflict.
- Consuming repos get this at the next `flow-sync`.
