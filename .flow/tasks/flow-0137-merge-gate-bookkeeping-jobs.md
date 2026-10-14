---
id: "flow-0137"
title: "The PR gate's 1-minute bookkeeping jobs become one job, so each gate run bills ~2 fewer minutes"
status: "blocked"
priority: 2
project: "flow"
owner: "session_01ANQhXq3EhUmXDuzdUbRRsF"
created: "2026-10-08"
started: "2026-10-14T01:36:20Z"
branch: "flow/flow-0137-merge-gate-bookkeeping-jobs"
pr: "https://github.com/CandidDan/flow/pull/208"
issue: ""
blocked_reason: "Done and green on branch flow/flow-0137-merge-gate-bookkeeping-jobs, but it must edit .flow/bin/canonical-helpers-workflow.test.mjs, which is not in touches: that test pins four copies of the fetch step (one per job, incl. the removed `touches` job) and slices out the removed `flow-tooling` job. Waiting on a scope decision; not machine-checkable."
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-gates.yml"
  - ".flow/bin/gate-cost.test.mjs"
  - ".flow/bin/gate-assertion.test.mjs"
  - ".flow/bin/source-roots-gate.test.mjs"
  - ".flow/bin/check-workflows.test.mjs"
  - "changes/flow-0137.md"
labels: [ci, cost]
asks:
  - "decision: add `.flow/bin/canonical-helpers-workflow.test.mjs` to touches? Merging the jobs leaves 3 fetch-step copies, not the 4 it pins, and no `flow-tooling` job to slice, so it fails without an edit. The edit (commit 2dbd4c3, 16 lines, test-only) is already on the branch, separate from the rest. Recommend: yes; it is the same pin as the in-scope tests, missed when touches was written. Then set status back to in_progress; the worker or any session marks PR ready."
notes:
  - "2026-10-08 (orchestrator): unblocked — flow-0136 merged (PR #187) and shipped in 3.2.0 (PR #188). Build against _flow-gates.yml as it is on main now, which carries flow-0136's draft clauses; keep them on every job, merged or not (gate-cost.test.mjs enforces it)."
  - "2026-10-08 (orchestrator): ORIGIN: the Actions cost review (see flow-0136's notes). GitHub bills every job at least one minute. A gate run carries `touches`, `flow-tooling` and `source-roots-plan`, each a few seconds of work billed as 1 minute, so ~3 billed minutes per run for ~20 seconds of work. Measured: those three jobs were ~3 min of every gate run in all five adopters. Approved by Dan 2026-10-08."
  - "2026-10-08 (orchestrator): DECIDE IN THE PR, with the reason: which jobs merge. `source-roots-plan` emits the matrix the `source-root` jobs read, so it must stay a job those can `needs:`. The cheap shape: fold `touches` and `flow-tooling` into `source-roots-plan` as steps (one job, ~1 billed min instead of 3), and leave `gate` alone, so the matrix still starts without waiting on the 5–8 min gate."
  - "2026-10-08 (orchestrator): RISK TO CHECK FIRST: renaming or removing a job renames its check (`flow-gates / touches`). Any adopter whose branch protection REQUIRES one of those check names would then have every PR blocked on a check that never reports. Before merging, list each adopter's required checks (`GET /repos/{o}/{r}/branches/main/protection/required_status_checks`, or ask Dan). If any requires a merged-away name, keep a job by that name or say exactly what the adopter must change in the fragment's caller action."
  - "2026-10-14 (worker session_01ANQhXq3EhUmXDuzdUbRRsF): BUILT, gate green locally (build, lint, test 2009/2009, coverage 97% lines). Branch flow/flow-0137-merge-gate-bookkeeping-jobs: commit 1320d20 = all in-scope work (workflow, 4 tests, fragment); commit 2dbd4c3 = the one out-of-touches test edit. touches + flow-tooling are now steps in source-roots-plan (id kept, so source-root is untouched and still needs only it). Required-check risk: could not read adopters' branch protection from this sandbox; the fragment's caller action says to swap `flow-gates / touches` and `flow-gates / flow-tooling` for `flow-gates / source-roots-plan`. NEXT once the ask is answered: if yes, add the path to touches, set in_progress, mark the PR ready (title `[flow-0137] <title>`). If no, drop 2dbd4c3 and say how the test should change instead. Follow-up, not this task: docs/flow-reusable-workflows.md:443 still says `flow-tooling` job."
---

## Context

GitHub bills every job at least one minute. The PR gate runs three bookkeeping jobs (`touches`,
`flow-tooling`, `source-roots-plan`) that each finish in seconds, so every gate run bills about
3 minutes for about 20 seconds of work.

## Scope

**Does:** merge the bookkeeping jobs into as few jobs as the `source-root` matrix allows (see
notes), keeping every check they run and each step's failure message. Pin the job count and the
preserved checks in `gate-cost.test.mjs`. Changelog fragment, with the required-check caller
action if one applies.

**Does not touch:** the `gate` job's steps, the `source-root` job, the review workflow, the callers.

## Acceptance criteria

- [ ] Given `_flow-gates.yml`, then the store-guard, touches-guard, flow-tooling tests and
      source-roots plan each still run as a step, and each still fails the run on its own failure.
- [ ] Given `_flow-gates.yml`, then at most one job besides `gate` and `source-root` runs on a
      non-draft PR.
- [ ] Given the `source-root` matrix, then it still reads its plan from a job output and starts
      without waiting on `gate`.
- [ ] Given each adopter's required status checks, then none names a check this removes, or the
      fragment's caller action says exactly what to change.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
