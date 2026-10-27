---
id: "flow-0162"
title: "A task with an open PR keeps it: a second flow/<id>- branch gets no PR, and its PR events never rewrite or escalate the task"
status: "in_review"
priority: 3
project: "flow"
owner: "claude"
created: "2026-10-27"
started: "2026-10-27T02:07:03Z"
branch: "flow/flow-0162-pr-of-record"
pr: "https://github.com/CandidDan/flow/pull/238"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G7", "G9"]    # G7: the store must say which PR a task is on. G9: 14 stray drafts cost CI runs and nearly a fresh top-tier worker.
intent: ""
touches:
  - ".github/workflows/_flow-open-pr.yml"
  - ".github/workflows/_flow-status.yml"
  - "project-template/.flow/bin/flow-open-pr.mjs"
  - "project-template/.flow/bin/flow-open-pr.test.mjs"
  - "project-template/.flow/bin/pr-of-record.mjs"
  - "project-template/.flow/bin/pr-of-record.test.mjs"
  - ".flow/bin/pr-of-record.mjs"
  - ".flow/bin/pr-of-record.test.mjs"
  - "changes/flow-0162.md"
labels: [bug, flow-infra, cost]
model: "sonnet"
model_reason: "one guard applied at three decision points, each with a unit test; no new design"
effort: ""
notes:
  - "2026-10-27 (orchestrator): ORIGIN, tanplan-platform tanplan-0171, 26 Oct. The task's PR of record was #200 on flow/tanplan-0171-uuid-cutover. A session split the work across helpers on branches flow/tanplan-0171-uuid-cutover-{a..i,m,n,fixj,fixk,fixl}, each merged back into #200's branch. That pattern was an owner-approved deviation recorded on the task, so the helpers were legitimate. Flow mis-read every one: (1) flow-open-pr opened a draft PR per helper push (#201-#214), because decideOpenPr only checks for an open PR on THAT branch; (2) flow-status recorded each draft as the task's PR, overwriting branch/pr and setting in_review -> in_progress 15 times; (3) on 27 Oct, closing those 14 drafts made flow-status set the task back to ready with owner/branch/pr cleared, and escalate raised it opus -> fable and added a 'split it' decision ask. The task sat `ready` for about a minute with a queue-runner dispatch in flight, and was restored by hand (tanplan commit 8551821e). Cost: about 155 CI runs, roughly 200 billed minutes, plus a near-miss fresh top-tier worker on a task with an open PR."
  - "2026-10-27 (orchestrator): DESIGN, decided. Define the task's PR OF RECORD as the PR its `pr:` field names on `main`, when that PR is OPEN. A PR event whose PR is not the PR of record, for a task that HAS an open PR of record, is FOREIGN. Foreign events change nothing in the store: no open-pr, no branch/pr/status rewrite, no reset to ready, no escalation. Each no-op prints one line naming the PR of record. When `pr:` is empty, or names a PR that is closed or merged, behaviour is exactly as today: the first open PR becomes the record. Read `pr:` from origin/main, NEVER from the pushed branch: a worker branch carries a frozen copy of the task file (CLAUDE.md, 'stale by design'), which is wrong exactly when this matters."
  - "2026-10-27 (orchestrator): OUT OF SCOPE, deliberately. (a) flow-recover's 18:26 repair set status and pr but left `branch` on the helper's -n; a recover that also rewrites branch from the PR's head ref is a separate follow-up. (b) A protocol rule naming helper branches. With this guard the branch name stops mattering, so no prose rule is needed. (c) Closing or deleting stray PRs: Flow only stops creating them."
asks: []
---

## Context

Flow assumes one task has one branch and one PR, and it keys everything off the branch pattern
`flow/<id>-…`. When more than one branch carries the same id, every push and every PR event on
any of them is treated as *the* task's. On tanplan-0171 that produced 14 stray draft PRs and 15
overwrites of the task's `branch`/`pr`/`status`. Then, when the drafts were closed, the task was
reset to `ready`, moved up a model tier to fable, and given a "split it" ask, all while its real
PR (#200) was open and in review. See the notes for the full timeline.

The fix is one rule, applied at three places: **a task that already has an open PR of record
ignores every other PR.**

## Scope

- A single tested function, `project-template/.flow/bin/pr-of-record.mjs`, that takes the task's
  `pr:` value from `main`, the open/closed/merged state of that PR, and the event's PR number. It
  returns whether the event is the record, foreign, or there is no record yet. Canonical gets a
  thin adapter in `.flow/bin/` (never a copy or a symlink; see CLAUDE.md).
- **Open-pr** (`_flow-open-pr.yml`, `flow-open-pr.mjs`): no PR is opened for a pushed
  `flow/<id>-…` branch when the task already has an open PR of record on a different branch.
- **Status sync on opened/reopened/ready_for_review** (`_flow-status.yml`): a foreign PR writes
  nothing to the store.
- **Status sync and escalation on closed-unmerged** (`_flow-status.yml`, both the transition step
  and the separate "Escalate the model of a task whose PR closed unmerged" step): a foreign PR
  neither resets the task to `ready` nor escalates its model nor adds an ask.
- Each skipped action logs one line: `<event> on PR #N ignored: <id>'s PR of record is #M (open)`.
- A changelog fragment, `changes/flow-0162.md`.
- **Does not touch:** flow-done (a merge of a foreign PR is outside this task; flag it if you
  find it reachable), flow-recover, flow-state's `pickPrForTask`, the queue runner, the protocol
  prose, or any task file.

## Acceptance criteria

- [ ] Given a task whose `pr:` on main names an OPEN PR #M on branch `flow/<id>-x`, when
  `pr-of-record` is asked about an event on PR #N ≠ M, then it answers `foreign` and names #M.
  (`pr-of-record.test.mjs`)
- [ ] Given a task whose `pr:` is empty, OR names a PR that is CLOSED or MERGED, when asked about
  any PR #N, then it answers `no-record` (today's behaviour applies). (`pr-of-record.test.mjs`)
- [ ] Given the event's PR is the one `pr:` names, then it answers `record`. (`pr-of-record.test.mjs`)
- [ ] Given a push to `flow/<id>-y` with commits ahead of base and no PR on that branch, when the
  task's open PR of record is on `flow/<id>-x`, then `decideOpenPr` returns null and the CLI prints
  the ignore line. With no open PR of record, it opens the PR exactly as today.
  (`flow-open-pr.test.mjs`)
- [ ] Given `_flow-status.yml`, when its opened/reopened/ready_for_review path and its
  closed-unmerged path are read, then each calls `pr-of-record` against `pr:` read from
  **origin/main** before writing `.flow/board-edits.json`, and exits 0 without writing it on
  `foreign`. (structural test in `pr-of-record.test.mjs`, following `gate-cost.test.mjs`'s
  workflow-text style)
- [ ] Given `_flow-status.yml`'s "Escalate the model of a task whose PR closed unmerged" step,
  when it is read, then it applies the same `foreign` check before calling `task-model.mjs
  escalate`. (structural test, same file)
- [ ] Given `_flow-open-pr.yml`, when it is read, then the task's `pr:` it passes to
  `flow-open-pr.mjs` comes from origin/main, not the checked-out branch. (structural test)
- [ ] Mutation proof: with the `foreign` check removed from any one of the three places, at least
  one of the tests above fails. Say in the PR which test catches which removal.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Reading the PR's state needs `gh pr view <M> --json state`. Both workflows already hold a
  token that can read PRs; do not widen `permissions:`. If one cannot, stop and say so rather than
  adding a scope.
- Race, accepted: if a helper branch is pushed before the real PR exists, the helper's PR becomes
  the record. Do not try to guess intent from branch names.
