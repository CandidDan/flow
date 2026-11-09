---
id: "flow-0218"
title: "Workers open PRs as drafts, mark them ready only after the local gate, and push fixes once"
status: "in_review"
priority: 2
project: "flow"
owner: "claude/project-thread-irhd4m"
created: "2026-11-09"
started: "2026-11-09T12:38:29Z"
branch: "claude/project-thread-irhd4m"
pr: "https://github.com/CandidDan/flow/pull/303"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/PROTOCOL.md"
  - ".flow/bin/protocol-portability.test.mjs"
  - ".flow/bin/draft-push-rule.test.mjs"
  - ".github/workflows/ci.yml"
  - ".github/workflows/_flow-open-pr.yml"
  - "docs/running-flow-cheaply.md"
  - "changes/flow-0218.md"
labels: [cost]
model: "sonnet"
effort: "medium"
model_reason: "Protocol text, one trigger removed from a canonical-only workflow, and text-pinning tests."
notes:
  - "2026-11-09 (Dan, in the Flow project thread 'Build the draft-PR cost rule into Flow'): approved building the draft-PR cost rule into Flow. Written and claimed in one commit by the session doing the work, so flow-dispatch does not also start a routine on it."
  - "2026-11-09 (worker): the gate already skips drafts (flow-0136) and the review checks start on ready_for_review (flow-0039), so no reusable workflow changes here. What was missing is the worker's half, in the protocol."
  - "2026-11-09 (worker): touches overlap flow-0217 (in_progress, PR #302) on PROTOCOL.md and protocol-portability.test.mjs. Claimed anyway because the edits are in different sections: 0217 edits 'The gate' section and adds its divergence entry; this task edits 'The loop you run' and its existing entry. A test merge of the two branches is clean. The gate section's sentence 'only then open the PR' is left for after #302 merges, to keep the two PRs independent."
asks: []
---

## Summary

Every push to a ready PR runs the CI gate and the three review checks. A push to a draft runs
neither. The protocol did not tell the worker to use that: step 7 told a worker opening its own PR
to open it non-draft, and step 9 said nothing about how many pushes a fix round takes.

## Scope

- Protocol loop: step 7 opens a self-opened PR as a draft (gh and REST routes); steps 5 and 8 mark
  the PR ready only after the local gate passes, and name the on-demand gate run for a draft;
  step 9 fixes every point of a kickback or red check, then pushes once.
- Canonical's `ci.yml` stops running on pull requests, where the gate's `npm test` already runs
  the same tests.
- Fix the `_flow-open-pr.yml` comment that says the gate runs on drafts.
- A section in `docs/running-flow-cheaply.md`, and `changes/flow-0218.md`.

Not in scope: the reusable gate and review workflows (flow-0217 changes those).

## Acceptance criteria

1. Step 7 opens a self-opened PR as a draft by both routes. `draft-push-rule.test.mjs` criterion 1.
2. Steps 5 and 8 mark the PR ready only after the local gate passes. Criterion 2.
3. Step 9 says to fix everything and push once, for comments and red checks. Criterion 3.
4. Step 5 names `gh workflow run flow-gates.yml --ref <branch>`, and both gate callers accept
   `workflow_dispatch`. Criterion 4.
5. Canonical's `ci.yml` has no `pull_request` trigger. Criterion 5.
