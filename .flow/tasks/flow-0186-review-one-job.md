---
id: "flow-0186"
title: "The PR review runs qa, code-review and security in one runner job, each still its own model invocation and its own PR check, with the verdict read from a vendor-neutral file"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-11-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G9", "G10"]
intent: "model-work-off-github-actions"
touches:
  - ".github/workflows/_flow-review.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/review-one-job.test.mjs"
  - "changes/flow-0186.md"
labels: [cost, review, "4.0.3"]
model: "opus"
effort: "high"
model_reason: "Restructures the fleet's review gate; a wrong check name or verdict path turns every adopting repo's PRs red or, worse, green"
asks: []
notes:
  - "2026-11-01 orchestrator: phase 1 (review half) of the cost plan Dan approved on 2026-11-01. Option B2 in the options doc, with one change Dan required when approving: Flow stays agent-agnostic, so any single review must be switchable between Claude and Codex at any time. That rules out B2's 'one session, three verdicts': three checks sharing one model session cannot have one of them moved to a different vendor. Each check keeps its own invocation; the saving comes from one runner instead of four, not from one session."
  - "2026-11-01 orchestrator: the Codex invocation itself is NOT in this task. Adding a second vendor is product work that needs its own approved intent (Dan was asked on 2026-11-01). This task only removes the Claude-specific coupling in how a verdict is read, so that adding Codex later changes one step per check and nothing else."
---

## Context

`.github/workflows/_flow-review.yml` runs `plan`, then `qa`, `code-review` and `security` as three
more jobs, plus `guide` and `intent-review`. Each verdict job starts its own runner and waits
1–2 minutes on `anthropics/claude-code-action`. `security` starts a runner even when `plan` has
already decided to skip it (`needs.plan.outputs.security_run != 'true'`). Every job bills at least
one minute.

The verdict is currently read from what `claude-code-action` leaves behind. Nothing defines it
independently of that action.

## Scope

- One job (call it `review`) runs the qa, code-review and security reviews one after another, after
  `plan`. When `plan` decides security is skipped, no security model call is made and the security
  check still records the skip on the PR, as today.
- Each review is still a separate model invocation, with its own prompt, its own model from
  `parseReviewConfig` (`model`, `code_review_model`, `security_model`) and its own turn limit.
  No two reviews share a model session or a conversation.
- **The verdict contract.** Each review's model step writes its verdict to a file,
  `$RUNNER_TEMP/flow-review/<check>.json`, with at least `{ "check", "verdict": "pass" | "fail",
  "summary" }`. Everything after the model step (posting the PR comment, setting the check
  result, the auto-fix trigger) reads that file and nothing else from the model step. Define and
  validate the shape in `project-template/.flow/bin/flow-review.mjs` (export a validator), so
  that a missing or malformed file fails the check closed.
- The PR still shows three separate checks named exactly `qa`, `code-review` and `security`,
  because adopting repos list those names in branch protection. Create them as check runs or
  commit statuses from the one job if job names can no longer carry them.
- `guide` and `intent-review` keep their current behaviour. Fold them into the same job only if
  that keeps their check names and their advisory (never-blocking) status.
- Fragment `changes/flow-0186.md`: a top-level bullet stating the caller action (expected:
  **No caller action** if the check names are unchanged).

**Does not:** add Codex or any other vendor; change any review prompt's content; change
`DEFAULT_MODELS`; change `_flow-gates.yml`; change the bookkeeping workflows (flow-0185).

## Acceptance criteria

- [ ] `.flow/bin/review-one-job.test.mjs` parses `_flow-review.yml` and asserts that qa,
      code-review and security run in a single job, and that no job other than `plan` and that
      one starts a runner on a non-intent PR.
- [ ] The same test asserts each of the three reviews has exactly one model step of its own, and
      that no step after a model step reads that step's `outputs`: they read only
      `$RUNNER_TEMP/flow-review/<check>.json`.
- [ ] `flow-review.test.mjs`: the exported verdict validator accepts a well-formed file and
      rejects a missing file, invalid JSON, a wrong `check` name and a `verdict` outside
      `pass`/`fail`, each as a failing verdict.
- [ ] Given `plan` decides security is skipped, the workflow makes no security model call and
      the `security` check records the skip reason (asserted by the workflow test).
- [ ] The PR checks are still named `qa`, `code-review` and `security` (asserted by the workflow
      test against the names `.flow/bin/flow-review-workflow.test.mjs` already pins).
- [ ] `changes/flow-0186.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
