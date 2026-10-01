---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0089"
title: "Release and sync PRs are classified by code, so the reviewers stop guessing about task-less PRs"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-code-5470b933"
created: "2026-09-28"
started: "2026-10-01T04:35:35Z"
branch: "flow/flow-0089-release-pr-gated-by-code"
pr: "https://github.com/CandidDan/flow/pull/146"
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
  - "2026-10-01 (worker): BUILD COMPLETE, PR next. Branch `flow/flow-0089-release-pr-gated-by-code` (3 commits, rebased on main, pushed). build / lint / coverage green; coverage 95.98% lines against a floor of 83.5. `npm test` is 1542 pass / 1 FAIL, and the one failure is NOT from this diff — see the next note."
  - "2026-10-01 (worker): PRE-EXISTING GATE FAILURE on `main`, outside this task and outside its `touches`, reported rather than fixed. `adapters.test.mjs` -> `flow-doctor reports no consistency failures against this repo` fails with: FAIL flow-0114: `## Acceptance criteria` has no `- [ ]` items — a heading is not a contract. flow-0114 (allocated 2026-10-01, commit 75c5689) writes its criteria as a numbered list (`1.`, `2.`, ...) instead of checkboxes. Reproduced on a clean `main` with the branch stashed, so it is not this diff: `git checkout main && node --test .flow/bin/adapters.test.mjs` gives the same single FAIL. It reddens `npm test` for EVERY open PR in canonical until it is fixed. The fix is one store commit to `main` converting flow-0114's numbered criteria to `- [ ]` items; a worker neither writes nor rewrites another task's acceptance criteria, and a branch may not touch `.flow/tasks/` at all, so it is left for the orchestrator."
  - "2026-10-01 (worker): PROGRESS. Branch `flow/flow-0089-release-pr-gated-by-code`, pushed. DONE: `classifyPr` / `releaseReport` / `prKindText` plus the RELEASE PR and SYNC PR sentinels in `project-template/.flow/bin/flow-review.mjs`, wired through `taskContext` / `runPlan` / `planSummary`; the shared classified-PR block in all three reviewer prompts in `_flow-review.yml`; the release-PR and hotfix rules in `docs/flow-versioning-policy.md`; `changes/flow-0089.md`; 8 new unit tests in the template's `flow-review.test.mjs` (81 pass). REMAINING: the workflow-structure tests in `.flow/bin/flow-review-workflow.test.mjs` (prompts name both sentinels, the checkRelease-import structure test, the docs criterion, the fragment criterion), then the full gate and the PR. DECISION, do not re-litigate: the prospective tag handed to `checkRelease` is derived from the PR tree's own root stamp (`v` + VERSION), NOT from the branch name, because branch spelling is not enforced (`release/2.1.1` vs `release/v2.1.1`) and deriving from the branch would silently disable release-guard's leftover-fragment check on the un-prefixed spelling. SECOND DECISION: the stamp PAIR is chosen by tree shape (canonical = `VERSION` + `project-template/.flow/VERSION`; an adopting repo = `.flow/VERSION` alone), because an adopting repo's root `VERSION` is its PRODUCT version and comparing it against the Flow stamp would report false stamp drift on every release PR in the fleet."
  - "2026-10-01 (worker): SCOPE ANSWER to the orchestrator note of the same date — vision and intent-only PRs are NOT classified by this task, deliberately, and this note is the `record why not`. Each needs its own CLOSED allowed-path list agreed first (a `[vision]` PR: `VISION.md` only, or `docs/` too? an intent-only PR: `.flow/intents/**` only, or the ADR alongside it?), and agreeing one is a decision rather than an implementation detail — the same reason this task's own two lists are closed and its Notes say widening one is a reviewed change. Shipping them unasked would also add behaviour with no acceptance criterion, which is the thing the qa gate exists to catch. The code is left as a table (`PR_KINDS` in `project-template/.flow/bin/flow-review.mjs`): a new kind is one row plus one line in the shared prompt block, so the follow-up is small. Next action: orchestrator writes that task once the two path lists are decided."
  - "2026-10-01 (orchestrator): SCOPE NOTE, for whoever claims this. Two more task-less PR kinds hit the same guess, both by design: `[vision]` PRs (vision-writer skill, `vision/<slug>` branch) and intent-only PRs (`.flow/intents/` by PR, ADR-0007). Observed: CandidDan/inflight#28 got qa PASS and FAIL from the same reviewer on the same `VISION.md`-only diff; CandidDan/flow#143 (docs-only) did the same. Consider classifying these in code alongside release and sync, or record why not. Not a scope change to touches by itself; widen touches on main if the worker needs to."
  - "2026-09-28 (orchestrator): DECIDED WITH THE HUMAN. Two options were on the table: every release PR gets a task, or the reviewers exempt `release/*`. Neither. A pure release PR has no behaviour to write criteria for, so a task is ceremony, and a branch-name exemption is a loophole: any PR named `release/…` would skip review. The split: code changes always go through a task PR (a hotfix is a task PR, then a release PR); a release PR may touch only release files, and CODE decides that, not a model."
  - "2026-09-28 (orchestrator): EVIDENCE. #117 (2.1.0) and #121 (2.1.1) were both task-less release PRs. qa passed #117 ('no task, expected') and failed #121 ('no task resolved'). #121 also bundled test changes and a new test into the release, which is the smell this task removes; flow-0088 was written after the fact to give it criteria."
  - "2026-09-29 (orchestrator): SCOPE ADDED from progress #107 (`flow-sync/2.1.1`, title `flow: adopt canonical Flow infra 2.1.1`): qa FAIL, 'no task id resolves'. A sync PR is task-less by design (see `_flow-sync.yml`'s header) and its surface is closed and known, so it is classified by code exactly like a release PR: branch `flow-sync/*`, every changed path inside the synced surface. This case matters more than the release one: it hits every adopting repo on every sync, not only canonical."
  - "2026-09-28 (orchestrator): NOT parallel-safe with flow-0084 or flow-0085 (both edit `_flow-review.yml` and its workflow test). pick-task keeps them apart; whichever lands later rebases."
  - "2026-09-30 (worker): NOT CLAIMED — collision, deliberately yielded. flow-0099 went `in_progress` at 02:52:05Z (owner claude-code-e6eba4e8), 83 seconds before this session tried to claim, and its `touches` names `project-template/.flow/bin/flow-review.mjs` and `flow-review.test.mjs` verbatim — the same two files, and the same plan step, this task rewrites. Per PROTOCOL.md *Concurrency* a `ready` task overlapping an `in_progress` one is skipped and worked later, so this task was left `ready` (NOT `blocked`: it needs no decision and clears itself the moment flow-0099 merges, whereas `blocked` has no automatic way out). No branch, no commits, nothing to resume. Next action: re-dispatch this task once flow-0099 is `done`."
  - "2026-09-30 (worker): ROOT CAUSE of that collision, and it is a live fleet-wide bug OUTSIDE this task's `touches` — `pick-task.mjs` `parseTask()` reads `touches` only in the inline-array form (`/^touches:\s*\[(.*?)\]/m`). Every real task file in this store uses the YAML block-sequence form, so `touches` parses as `[]` for every task, `touchesOverlap()` is always false, and `pickTask()`'s overlap filter is inert: it dispatches straight into collisions. Verified live: `touchesOverlap(flow-0089, flow-0099)` returns false against the real store despite two identical paths. The guard fails OPEN, which is the wrong direction, and it hits every adopting repo's queue-runner. `flow-doctor` is the corroboration on both halves: run against the same store it prints `WARN flow-0089 and flow-0099 have overlapping touches (project-template/.flow/bin/flow-review.mjs)`, so the overlap is real AND block-form `touches` is parseable — flow-doctor reads it correctly and pick-task alone does not. Fix by reusing flow-doctor's list parse rather than writing a third one. Needs its own task (worker cannot create one): fix the block-sequence parse in `project-template/.flow/bin/pick-task.mjs` + a test asserting overlap is detected for block-form `touches`. Until then, treat pick-task output as unchecked for concurrency and confirm overlap by hand before claiming."
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
- Classify a PR as a **sync PR** the same way: head branch starts with `flow-sync/`, and every
  changed path is inside flow-sync's copied surface (`.flow/bin/**`, `.github/workflows/flow-*.yml`,
  `.flow/PROTOCOL.md`, `.flow/VERSION`, as `_flow-sync.yml`'s header lists them). Its sentinel is
  `SYNC PR`, listing the changed files. There is no guard to run: the synced tests themselves run
  in `flow-tooling`. The reviewers PASS it with "sync PR: synced surface only; flow-tooling
  validates it". A `flow-sync/*` PR touching anything else is not a sync PR.
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
- [ ] Given branch `flow-sync/9.9.9` changing only `.flow/bin/x.mjs`, `.flow/VERSION` and
      `.github/workflows/flow-gates.yml`, then `task.md` begins with the `SYNC PR` sentinel; with
      one extra path outside the surface (e.g. `.flow/config.yml`), it carries the no-task sentinel.
- [ ] Every reviewer prompt names the `SYNC PR` sentinel with its PASS line.
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
