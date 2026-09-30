---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0101"
title: "code-review and security refuse to pass a truncated diff, as qa already does"
status: "in_review"
priority: 2
project: "flow"
owner: "claude-worker-flow-0101"
created: "2026-09-30"
started: "2026-09-30T04:43:49Z"
branch: "flow/flow-0101-reviewers-refuse-truncated-diff"
pr: "https://github.com/CandidDan/flow/pull/134"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - ".github/workflows/_flow-review.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - "changes/flow-0101.md"
labels: [flow-review, review-gate]
notes:
  - "2026-09-30 (orchestrator): Found while triaging a tanplan-platform PR. All three reviewers read the same `.flow-review/diff.patch`, bounded at 300 KB. Only the qa prompt says 'If the diff says it was truncated, say so in your verdict rather than approving what you could not read.' code-review and security passed a 789 KB PR, which was read on the tanplan side as 'they read the full diff'. They did not: they passed on a partial read, and nothing told them not to."
  - "2026-09-30 (orchestrator): Open question for the human, deliberately NOT in this task: whether `verdict` should fail closed in code whenever the plan truncated the diff, rather than relying on the prompt. That would block every oversized PR until a human overrides. This task only makes the three prompts consistent."
  - "2026-09-30 (orchestrator): Overlaps flow-0084, flow-0085 and flow-0089 on _flow-review.yml; sequence."
  - "2026-09-30 (worker): Built on branch flow/flow-0101-reviewers-refuse-truncated-diff, pushed. All three prompts in _flow-review.yml now carry one byte-identical truncation instruction (do NOT return a PASS verdict; name the truncation), and security's `FAIL iff High/Critical` verdict contract gained a clause naming truncation as a second cause so it does not contradict it. Four new assertions in flow-review-workflow.test.mjs; mutation-checked by deleting the security copy, which fails test 26. Gate green locally: build 34 workflows, lint 101 .mjs, test 1437 pass, coverage 95.81%. Next action: open the PR and mark it ready for review."
---

## Context

The qa prompt in `.github/workflows/_flow-review.yml` tells the reviewer to name a truncation
rather than approve what it could not read. The code-review and security prompts read the same
bounded diff and carry no such instruction, so on an oversized PR two of the three checks can go
green on a partial read, and a human reads that as a full review.

## Scope

**Does:** add to the code-review and security prompts the same instruction qa carries: if the diff
says it was truncated, say so in the verdict and do not PASS. Phrase it the same way in all three
so a test can pin one sentence. Changelog fragment `changes/flow-0101.md` (**No caller action**
beyond picking up the release).

**Does not touch:** `flow-review.mjs`; the diff limit (flow-0100); any fail-closed logic in
`verdict` (see notes).

## Acceptance criteria

- [ ] The qa, code-review and security prompts in `_flow-review.yml` each contain the same
      truncation instruction, and a test asserts all three contain it.
- [ ] That instruction says the reviewer must not PASS a truncated diff and must name the
      truncation in its verdict.
- [ ] `changes/flow-0101.md` exists and says no caller action is needed.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
