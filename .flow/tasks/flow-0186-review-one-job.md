---
id: "flow-0186"
title: "The PR review runs qa, code-review and security in one runner job, each still its own model invocation and its own PR check, with the verdict read from a vendor-neutral file"
status: "blocked"
priority: 1
project: "flow"
owner: "session_01NfrcU8NxwWt137Ds3Lw2Ai"
created: "2026-11-01"
started: "2026-11-01T07:53:41Z"
branch: ""
pr: ""
issue: ""
blocked_reason: "One runner job cannot carry the qa, code-review and security check names without changes outside touches: (1) the check runs or commit statuses need checks: write or statuses: write, which a reusable workflow cannot grant itself above its caller, and no flow-review caller grants it today; (2) the check names today are job names, flow-review / qa etc., so check runs created from one job rename what branch protection requires; (3) _flow-kickback.yml finds the failed check by failed JOB name, so with one job it sees review, cannot tell security from qa, and auto-fix stops working. A human must decide the scope; not machine-checkable."
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
asks:
  - "decision: widen touches and accept a caller action, or keep the review jobs separate? Recommend: widen touches to add .github/workflows/flow-review.yml, project-template/.github/workflows/flow-review.yml (grant checks: write), .github/workflows/_flow-kickback.yml, .github/workflows/flow-kickback.yml and project-template/.github/workflows/flow-kickback.yml (grant checks: read; read failed check runs instead of failed jobs), plus the kickback tests, and ship with a caller action: every adopter adds checks: write to its flow-review caller and checks: read to its flow-kickback caller, and changes required checks from flow-review / qa, flow-review / code-review, flow-review / security to qa, code-review, security. Without the caller permission the check-run call fails closed, so every PR stays red until the caller is updated; release it as a version that says so."
  - "fyi: the intent-review job is asserted advisory partly because the workflow grants no checks: or statuses: permission (flow-review-workflow.test.mjs). Granting checks: write removes that argument, so the assertion must move to: no step in intent-review creates a check run."
  - "fyi: the Report the model that answered steps read steps.claude.outputs.execution_file, which acceptance criterion 2 forbids. They will have to read the action's execution file by path straight after each model step, before the next model call overwrites it."
notes:
  - "2026-11-01 orchestrator: phase 1 (review half) of the cost plan Dan approved on 2026-11-01. Option B2 in the options doc, with one change Dan required when approving: Flow stays agent-agnostic, so any single review must be switchable between Claude and Codex at any time. That rules out B2's 'one session, three verdicts': three checks sharing one model session cannot have one of them moved to a different vendor. Each check keeps its own invocation; the saving comes from one runner instead of four, not from one session."
  - "2026-11-01 orchestrator: the Codex invocation itself is NOT in this task. Adding a second vendor is product work that needs its own approved intent (Dan was asked on 2026-11-01). This task only removes the Claude-specific coupling in how a verdict is read, so that adding Codex later changes one step per check and nothing else."
  - "2026-11-01 orchestrator: Dan, on why the reviews must not share a session: \"We just need to ensure every review is as impartial and accurate as possible, a shared session for 3 reviews feels like we're opening the door for slopiness to be introduced\". So separate invocations are a requirement for review independence, not only for vendor switching. Do not merge the three reviews into one model session to save time or tokens, even if a later measurement says it would be cheaper; that is a decision for Dan."
  - "2026-11-01 worker session_01NfrcU8NxwWt137Ds3Lw2Ai: BLOCKED before writing code; nothing pushed, no branch. Read _flow-review.yml, both callers, _flow-kickback.yml and flow-kickback.mjs. Findings: callers grant contents/pull-requests/issues/id-token only, and a reusable cannot raise a permission above its caller, so no check run or commit status can be created; check names are <caller job> / <job>; kickback reads failed job names from actions/runs/<id>/jobs and decides security-never-auto-fixed on the name security. Design worked out for the next session: one review job; before each model step delete $RUNNER_TEMP/flow-review/<check>.json; immediately after it, a non-model step validates the file (new exported validator in flow-review.mjs, fail closed) and creates that check run, so a later model call cannot rewrite an earlier verdict; prompts change only their output-file lines (path ${{ runner.temp }}/flow-review/<check>.json, lowercase verdict, check field). NEXT: once the decision ask is answered and touches widened, set ready."
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
