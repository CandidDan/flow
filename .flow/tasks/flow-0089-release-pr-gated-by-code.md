---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0089"
title: "A release PR carries only release files, is checked by code, and the reviewers stop guessing about it"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-28"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # G10: the gate tells the truth. The same task-less release PR got PASS (#117) and FAIL (#121) from the same reviewer.
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - ".github/workflows/_flow-review.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - "docs/flow-versioning-policy.md"
  - "changes/flow-0089.md"
labels: [review, release, flow-infra]
notes:
  - "2026-09-28 (orchestrator): DECIDED WITH THE HUMAN. Two options were on the table: every release PR gets a task, or the reviewers exempt `release/*`. Neither. A pure release PR has no behaviour to write criteria for, so a task is ceremony, and a branch-name exemption is a loophole: any PR named `release/…` would skip review. The split: code changes always go through a task PR (a hotfix is a task PR, then a release PR); a release PR may touch only release files, and CODE decides that, not a model."
  - "2026-09-28 (orchestrator): EVIDENCE. #117 (2.1.0) and #121 (2.1.1) were both task-less release PRs. qa passed #117 ('no task, expected') and failed #121 ('no task resolved'). #121 also bundled test changes and a new test into the release, which is the smell this task removes; flow-0088 was written after the fact to give it criteria."
  - "2026-09-28 (orchestrator): NOT parallel-safe with flow-0084 or flow-0085 (both edit `_flow-review.yml` and its workflow test). pick-task keeps them apart; whichever lands later rebases."
---

## Context

`_flow-review.yml` resolves a task from the branch (`flow/<id>-…`) or a `[<id>]` title prefix. A
release PR has neither, so its reviewers get the `NO TASK FILE RESOLVED` sentinel and improvise.
Release correctness is mechanical and already coded: `release-guard.mjs` (`checkRelease`) knows
whether the stamps agree and whether fragments are left over. What is missing is (a) a rule about
which files a release PR may touch, and (b) telling the reviewers, in code, that a PR met it.

## Scope

**Does:**

- In `flow-review.mjs`'s plan step (it already runs from the BASE branch, flow-0079), classify a
  PR as a **release PR** when BOTH hold:
  - its head branch starts with `release/`;
  - every changed path is one of `CHANGELOG.md`, `changes/**`, `VERSION`,
    `project-template/.flow/VERSION`, `.flow/VERSION`.
- For a release PR, run `release-guard`'s pure `checkRelease` over the PR tree's stamps and
  fragments (import it; no new copy of its rules). Write the outcome into
  `.flow-review/task.md` as a third sentinel, `RELEASE PR`, listing the changed files and the
  guard's problems (if any).
- A `release/*` PR that touches ANY other path is not a release PR. It gets today's no-task
  handling unchanged, so the branch name alone exempts nothing, in canonical or in the fleet.
- In `_flow-review.yml`, each reviewer's prompt handles the `RELEASE PR` sentinel explicitly:
  PASS with the one line "release PR: release files only, release-guard clean" when the guard
  reported no problems; FAIL naming the guard's problems otherwise. No judgement call.
- In `docs/flow-versioning-policy.md`'s release procedure: a hotfix is a task PR first, then a
  release PR; a release PR contains release files only, and the review gate enforces it.
- Changelog fragment `changes/flow-0089.md`. **Caller action: none.**

**Does not touch:**

- `release-guard.mjs`'s rules, or `release-tag.yml`.
- How a normal task PR or a no-task non-release PR is reviewed.
- The security review's trigger paths (a release PR touches none of them, so it stays skipped).

## Acceptance criteria

Unit tests in `flow-review.test.mjs`; workflow-structure tests in `flow-review-workflow.test.mjs`.

- [ ] Given branch `release/v9.9.9` and changed files `CHANGELOG.md`, `VERSION`,
      `project-template/.flow/VERSION`, `changes/flow-0001.md`, then the plan classifies it as a
      release PR and `task.md` begins with the `RELEASE PR` sentinel listing those files.
- [ ] Given the same branch with one extra changed file (e.g. `src/x.mjs`, or any
      `*.test.mjs`), then it is NOT a release PR and `task.md` carries today's no-task sentinel.
- [ ] Given a non-`release/` branch changing only release files, then it is NOT a release PR.
- [ ] Given a release PR whose two VERSION files disagree, then the `RELEASE PR` sentinel carries
      release-guard's problem text, and the classification still holds (the problem is reported,
      not hidden).
- [ ] Given a release PR that leaves a fragment in `changes/` other than `README.md`, then the
      sentinel carries release-guard's leftover-fragment problem.
- [ ] The classification uses `checkRelease` imported from `release-guard.mjs`; no release rule is
      duplicated in `flow-review.mjs` (structure test on the import).
- [ ] Every reviewer prompt in `_flow-review.yml` names the `RELEASE PR` sentinel with an explicit
      PASS condition (guard clean) and FAIL condition (guard problems).
- [ ] `docs/flow-versioning-policy.md` states that a hotfix is a task PR followed by a release PR,
      and that a release PR may contain release files only.
- [ ] `changes/flow-0089.md` exists and states "Caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

- This PR is reviewed by the old rules (the plan runs from base). Expected.
- The allowed path list is deliberately closed. If a future release needs another file, that is a
  change to this list, reviewed as a task, not a reason to widen it now.
