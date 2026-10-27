---
id: "flow-0169"
title: "A draft PR opening never moves a blocked task back to in_progress"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude[bot]"
created: "2026-10-27"
started: "2026-10-27T06:47:00Z"
branch: "flow/flow-0169-draft-keeps-blocked"
pr: "https://github.com/CandidDan/flow/pull/244"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
model: "opus"
effort: "medium"
model_reason: "Changes a state transition in a reusable workflow every repo runs"
touches:
  - ".github/workflows/_flow-status.yml"
  - ".flow/bin/draft-pr-lifecycle.test.mjs"
  - "changes/flow-0169.md"
labels: [bug, workflows, status]
notes:
  - "2026-10-27 (orchestrator): from Dan. Found when flow-0164's gate went red on a touches overlap with 0165 and 0166, both of which were really blocked but read in_progress on main."
---

## Context

When a worker blocks a task, it commits `status: blocked` to `main`. Its branch push also makes
`flow-open-pr` open a **draft** PR, and `_flow-status.yml` then syncs that event. For a draft
opened or reopened, it writes `status: in_progress` plus `branch` and `pr`, **whatever the task's
current status is** (`.github/workflows/_flow-status.yml`, the `opened|reopened` arm, DRAFT branch).

The two commits race, and on 2026-10-27 the sync landed second both times, overwriting `blocked`:

| Task | Blocked | Then synced back to `in_progress` |
|---|---|---|
| flow-0165 | `305870c` "flow-0165 -> blocked (tests outside touches)" | `6934aea` "flow-0165 status sync (opened, PR #242)" |
| flow-0166 | `99e00e7` "flow-0166 -> blocked (watchdog.yml outside touches)" | `f8010df` "flow-0166 status sync (opened, PR #243)" |

What it cost: a blocked task that reads `in_progress` counts in flow-doctor's `touches` overlap
check. Here it failed the gate on three open PRs (#241, #242, #243) with an overlap that did not
really exist, and it blocked a third task (flow-0164) whose code was finished. It also hides the
block from anything that reads `status`, such as `flow-state`, `pick-task` and flow-unblock, which
only releases `blocked` tasks. The orchestrator fixed the store by hand in `8cc0a0c`.

## Scope

- In `_flow-status.yml`, when a PR is **opened or reopened as a draft**, read the task's current
  status from the store. If it is `blocked`, record `branch` and `pr` and **leave `status`,
  `blocked_reason` and `blocked_by` exactly as they are**. Otherwise behave as today.
- Keep the decision in testable code. If the logic outgrows a one-line shell test, put it in a
  pure function the workflow calls, following the existing `pr-of-record` pattern. Either way, the
  test must exercise the decision, not just grep the YAML.

**Deliberately does NOT:**
- Change `ready_for_review`. A worker marking a PR ready is a hand-off and still moves the task to
  `in_review`, even from `blocked` (a human may have lifted the block by hand).
- Change `closed` (back to `ready`) or anything `flow-done` owns.
- Repair existing store data. The two known cases are already fixed on `main`.

## Acceptance criteria

- [ ] Given a task with `status: blocked`, a `blocked_reason` and a non-empty `blocked_by`, when a draft PR for it opens, then the task keeps `status: blocked`, the same `blocked_reason` and the same `blocked_by`, and gains the PR's `branch` and `pr` (`.flow/bin/draft-pr-lifecycle.test.mjs`).
- [ ] Given the same blocked task, when a draft PR for it is reopened, then the same holds.
- [ ] Given a task with `status: in_progress`, when a draft PR for it opens, then it stays `in_progress` and records `branch` and `pr`, exactly as today.
- [ ] Given a blocked task, when its PR opens ready for review (not a draft) or is marked ready, then it moves to `in_review`, exactly as today.
- [ ] Given this task's fragment `changes/flow-0169.md`, when the store-wide test runs, then it passes: `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

If proving the criteria needs a test file outside `touches`, or a helper under
`project-template/.flow/bin/`, block and name it, as flow-0163 and flow-0164 did. Do not widen.
