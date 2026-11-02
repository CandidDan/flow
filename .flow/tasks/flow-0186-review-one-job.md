---
id: "flow-0186"
title: "Each review check reads its verdict from a vendor-neutral file, and the security job starts no runner when the plan skips it"
status: "in_progress"
priority: 1
project: "flow"
owner: "session_01NfrcUBzD5XdFYPdjBTniNs"
created: "2026-11-01"
started: "2026-11-02T01:16:27Z"
branch: "flow/flow-0186-review-verdict-file"
pr: "https://github.com/CandidDan/flow/pull/275"
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
  - ".flow/bin/review-verdict-file.test.mjs"
  - ".flow/bin/intent-pr-kind.test.mjs"
  - "project-template/.flow/bin/review-guide.mjs"
  - "changes/flow-0186.md"
labels: [cost, review, "4.0.3"]
model: "opus"
effort: "high"
model_reason: "Changes how the fleet's review gate reads every verdict; a wrong verdict path or a fail-open validator turns every adopting repo's PRs red or, worse, green"
asks: []
notes:
  - "2026-11-01 orchestrator: phase 1 (review half) of the cost plan Dan approved on 2026-11-01. Option B2 in the options doc, with one change Dan required when approving: Flow stays agent-agnostic, so any single review must be switchable between Claude and Codex at any time. That rules out B2's 'one session, three verdicts': three checks sharing one model session cannot have one of them moved to a different vendor. Each check keeps its own invocation; the saving comes from one runner instead of four, not from one session."
  - "2026-11-01 orchestrator: the Codex invocation itself is NOT in this task. Adding a second vendor is product work that needs its own approved intent (Dan was asked on 2026-11-01). This task only removes the Claude-specific coupling in how a verdict is read, so that adding Codex later changes one step per check and nothing else."
  - "2026-11-01 orchestrator: Dan, on why the reviews must not share a session: \"We just need to ensure every review is as impartial and accurate as possible, a shared session for 3 reviews feels like we're opening the door for slopiness to be introduced\". So separate invocations are a requirement for review independence, not only for vendor switching. Do not merge the three reviews into one model session to save time or tokens, even if a later measurement says it would be cheaper; that is a decision for Dan."
  - "2026-11-01 worker session_01NfrcU8NxwWt137Ds3Lw2Ai: BLOCKED before writing code; nothing pushed, no branch. Read _flow-review.yml, both callers, _flow-kickback.yml and flow-kickback.mjs. Findings: callers grant contents/pull-requests/issues/id-token only, and a reusable cannot raise a permission above its caller, so no check run or commit status can be created; check names are <caller job> / <job>; kickback reads failed job names from actions/runs/<id>/jobs and decides security-never-auto-fixed on the name security. Design worked out for the next session: one review job; before each model step delete $RUNNER_TEMP/flow-review/<check>.json; immediately after it, a non-model step validates the file (new exported validator in flow-review.mjs, fail closed) and creates that check run, so a later model call cannot rewrite an earlier verdict; prompts change only their output-file lines (path ${{ runner.temp }}/flow-review/<check>.json, lowercase verdict, check field). NEXT: once the decision ask is answered and touches widened, set ready."
  - "2026-11-01 orchestrator: Dan answered the worker's decision ask: keep the three review jobs separate for now (the narrower scope). Reason: one job needs checks: write on every caller and renames the required checks (flow-review / qa etc.), a breaking release for every adopter; and phase 2 (flow-0187, PR #272) may move reviews off runners, which would force that same breaking change again. Doing it once, in phase 2, costs adopters once. The one-job consolidation is therefore OUT of this task and goes to phase 2. Scope rewritten below; touches unchanged except the new test file name."
  - "2026-11-01 orchestrator: the worker's two fyi asks are resolved in the rewritten scope. (1) intent-review advisory assertion: no permission changes in this task, so the existing assertion stands unchanged. (2) the Report-the-model steps may keep reading the action's execution file: they report, they do not decide the check. Criterion 2 now forbids only the steps that decide the check (verdict enforcement, PR comment, auto-fix trigger) from reading model-step outputs."
  - "2026-11-01 orchestrator: the worker's design notes above still apply where they fit three jobs: delete $RUNNER_TEMP/flow-review/<check>.json before the model step, validate it in a non-model step straight after, fail closed; prompts change only their output-file lines."
  - "2026-11-01 worker session_01NfrcU8R7fYHGfpL83V3xWR: BLOCKED with the work done. Branch flow/flow-0186-review-verdict-file (commit 3ef26ed) carries every criterion: validateVerdictFile + an `enforce` CLI command in flow-review.mjs (the old lenient `verdict` command is kept, because an adopter's synced helper can be newer than its pinned workflow tag); _flow-review.yml deletes $RUNNER_TEMP/flow-review/<check>.json before each model step, prompts write that path with a check field and lowercase verdict, enforce reads it; the security job has a job-level if and planSummary writes '### Security review — SKIPPED' + reason; new .flow/bin/review-verdict-file.test.mjs; flow-review-workflow.test.mjs and flow-review.test.mjs updated; changes/flow-0186.md. Local gate: build, lint green; test 2117 pass, 1 fail; coverage 97.82% (exits 1 only because of that failure). The one failure is .flow/bin/intent-pr-kind.test.mjs:177 `assert.equal(sec.if, undefined, ...)`, outside touches. Two choices made on the branch: (1) the security model step keeps a redundant `if:` on security_run, so intent-pr-kind.test.mjs:182 still holds and only line 177 conflicts; (2) the three blocking reviewers get `--add-dir ${{ runner.temp }}/flow-review` in claude_args, so the model can write outside the workspace. NEXT (once touches is widened): check out the branch, rebase on main, change intent-pr-kind.test.mjs:177 to `assert.equal(sec.if, \"${{ needs.plan.outputs.security_run == 'true' }}\", \"the security job's only job-level if is the plan's review decision (flow-0186)\")`, run the five gate commands, open the PR titled [flow-0186] <title> (REST fallback if GraphQL is blocked), and hand off. fyi for the PR: review-guide.mjs line ~298 has a comment saying the security job always runs; now stale, outside touches, not a test."
  - "2026-11-02 orchestrator: decision ask answered YES. touches widened by .flow/bin/intent-pr-kind.test.mjs and project-template/.flow/bin/review-guide.mjs. Why it is safe: the flow-0178 assertion exists so that security is never skipped or reworded BECAUSE a PR is intent-only. A job-level if on needs.plan.outputs.security_run keeps that: the plan still forces security on for .flow/** (the security floor), and the test's other assertion (no intent_pr anywhere in the security job) stays. Change line 177 exactly as the worker's note says. Also fix the stale review-guide.mjs comment (~line 298) that says the security job always runs. NEXT: follow the worker's NEXT above, on the existing branch flow/flow-0186-review-verdict-file and PR #275; do not open a second PR."
---

## Context

`.github/workflows/_flow-review.yml` runs `plan`, then `qa`, `code-review` and `security` as
separate jobs, plus `guide` and `intent-review`. Each verdict job's model step
(`anthropics/claude-code-action`) is told to write `.flow-review/<check>.json`, and
`flow-review.mjs verdict` enforces it. Nothing defines that verdict shape independently of the
prompt text, so the contract a second vendor would have to meet exists only inside Claude prompts.

`security` starts a runner even when `plan` has decided to skip it
(`needs.plan.outputs.security_run != 'true'`): the job runs one step that prints the skip reason,
and that costs a billed runner minute on every skipped PR.

## Scope

- **The jobs stay as they are.** qa, code-review and security remain three separate jobs, each
  with its own model invocation, so the PR checks stay `flow-review / qa`,
  `flow-review / code-review` and `flow-review / security` and no caller or branch protection
  changes. No permission is added to any workflow.
- **The verdict contract.** Each review's model step writes its verdict to
  `$RUNNER_TEMP/flow-review/<check>.json`, with at least
  `{ "check", "verdict": "pass" | "fail", "summary" }`. Export a validator from
  `project-template/.flow/bin/flow-review.mjs`; a missing file, invalid JSON, a wrong `check` or a
  `verdict` outside `pass`/`fail` fails the check closed. The file is deleted before the model step
  runs, so a stale file can never pass. The steps that decide the check (verdict enforcement, the
  PR comment, the auto-fix trigger) read that file and nothing else from the model step. Prompts
  change only their output-file lines.
- **Security skip without a runner.** When `plan` decides security is skipped, the `security` job
  does not start (`if:` at job level on `needs.plan.outputs.security_run == 'true'`). The skip
  reason, `### Security review — SKIPPED` followed by `security_reason`, is written to the `plan`
  job's summary instead, so the skip stays on the record. GitHub reports a job skipped by `if:` as
  a successful required check, so branch protection is unaffected.
- `guide` and `intent-review` keep their current behaviour.
- Fragment `changes/flow-0186.md`: a top-level bullet stating the caller action (expected:
  **No caller action**).

**Does not:** merge the review jobs into one job (that is phase 2, after flow-0187); add Codex or
any other vendor; change any review prompt beyond its output-file lines; change `DEFAULT_MODELS`;
change any `permissions:` block, either caller, `_flow-kickback.yml` or `_flow-gates.yml`; change
the bookkeeping workflows (flow-0185).

## Acceptance criteria

- [ ] `.flow/bin/review-verdict-file.test.mjs` parses `_flow-review.yml` and asserts that qa,
      code-review and security are still three jobs, each with exactly one model step, and that
      each model step is preceded by a step deleting `$RUNNER_TEMP/flow-review/<check>.json`.
- [ ] The same test asserts that no step that decides a check (verdict enforcement, PR comment,
      auto-fix trigger) reads a model step's `outputs`; they read only
      `$RUNNER_TEMP/flow-review/<check>.json`.
- [ ] `flow-review.test.mjs`: the exported verdict validator accepts a well-formed file and
      rejects a missing file, invalid JSON, a wrong `check` name and a `verdict` outside
      `pass`/`fail`, each as a failing verdict.
- [ ] Given `plan` decides security is skipped, the `security` job has a job-level `if:` that keeps
      it from starting, and the `plan` job's summary contains `Security review — SKIPPED` and the
      reason (asserted by the workflow test and by a `flow-review.test.mjs` test of the plan
      summary).
- [ ] `flow-review-workflow.test.mjs`: the job names `qa`, `code-review` and `security` and every
      `permissions:` block are unchanged.
- [ ] `changes/flow-0186.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
