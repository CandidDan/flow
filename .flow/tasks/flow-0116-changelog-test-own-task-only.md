---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0116"
title: "The store-wide changelog test checks in-flight tasks only on their own branch, so one claimed task stops failing every other PR"
status: "done"
priority: 1
project: "flow"
owner: "claude-cowork-orchestrator"
created: "2026-10-01"
started: "2026-10-01T05:06:17Z"
branch: "flow/flow-0116-changelog-test-own-task-only"
pr: "https://github.com/CandidDan/flow/pull/149"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # the gate tells the truth: a red that belongs to another PR is a false finding on this one.
touches:
  - ".flow/bin/changelog-fragments.test.mjs"
  - "changes/flow-0116.md"
labels: [changelog, flow-gates, flow-infra]
notes:
  - "2026-10-01 (orchestrator): EVIDENCE. CandidDan/flow#146 (flow-0089) flow-tooling failed on `every claimed task that declares a changelog fragment has an entry stating its caller action` with `flow-0114: declares changes/flow-0114.md in touches but has no changelog entry`. flow-0114 was in_progress on main; its fragment lives on its own branch (#147) until merge. The PR checkout carries main's store, so the check (flow-0107, merged today) fails EVERY open PR while ANY task with a fragment is in_progress or in_review."
---

## Context

flow-0107's store-wide test reads every task in `.flow/tasks/` and requires an entry for each
`in_progress`, `in_review` or `done` task that declares `changes/<id>.md`. A PR's checkout holds
main's task store, where other tasks are claimed but their fragments sit on their own branches.
`done` is right to check store-wide (merged means the fragment is on main). The two in-flight
statuses are only meaningful for the task the checkout belongs to.

## Scope

- Work out the checkout's own task id from the PR head branch (`GITHUB_HEAD_REF`, then the local
  branch name), using the `flow/<id>-<slug>` convention.
- Check `done` tasks store-wide, as today. Check `in_progress` and `in_review` only for that id.
- Keep the test's exact name (the task-writer skill cites it).

## Acceptance criteria

- [ ] Another task that is in_progress with no fragment is not a finding on this checkout.
- [ ] This checkout's own in_progress task with no fragment is still a finding, naming the id.
- [ ] A done task with no entry is a finding wherever the test runs.
- [ ] The own-task id is read from `GITHUB_HEAD_REF` first and the local branch second; with
      neither, only done tasks are checked.
- [ ] `changes/flow-0116.md` describes the change.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
