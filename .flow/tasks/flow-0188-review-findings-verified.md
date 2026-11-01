---
id: "flow-0188"
title: "A review finding turns a PR red only after a separate model call has checked it against the code and confirmed it"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-11-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits on flow-0186, which introduces the per-review verdict file this task extends. Built before it, the verifier would read claude-code-action's output directly, which is the vendor coupling flow-0186 removes."
blocked_by: ["flow-0186"]
serves: ["G10"]
intent: "review-findings-converge"
touches:
  - ".github/workflows/_flow-review.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "project-template/.flow/bin/flow-verify.mjs"
  - "project-template/.flow/bin/flow-verify.test.mjs"
  - ".flow/bin/review-verify-workflow.test.mjs"
  - "changes/flow-0188.md"
labels: [review, gate]
model: "opus"
effort: "high"
model_reason: "Changes when the fleet's review gate blocks; a verifier that fails open would hide real findings in every adopting repo"
asks: []
notes:
  - "2026-11-01 orchestrator: Dan asked whether Flow follows Anthropic's review process. Anthropic's Code Review (code.claude.com/docs/en/code-review) runs four stages: Find (parallel agents), Verify ('checks the candidate findings against the code and filters out false positives'), Rank (deduplicate, order by severity), Post. Flow has Find and Post. This task adds Verify, the first outcome of the approved intent review-findings-converge. Its other two outcomes (re-review of the new diff only, and the eval set) are NOT in this task."
  - "2026-11-01 orchestrator: the intent's open question 'what verified means' is decided here as: one verifier model call per blocking finding, in a fresh session, run once. Not a vote, and not one sweep over all three reviews. Reason: Dan's rule from 2026-11-01 that reviews must not share context ('every review is as impartial and accurate as possible, a shared session for 3 reviews feels like we're opening the door for slopiness'). A single sweep reading all three reports would let one reviewer's framing shape the judgement of another's findings."
  - "2026-11-01 orchestrator: the verifier's model is the same model as the check that raised the finding (from parseReviewConfig), in a new session that does not see the reviewer's reasoning. A separate verifier-model setting, or a different vendor for verification, is left to the Codex intent Dan asked to be drafted on 2026-11-01."
---

## Context

After flow-0186, each review (qa, code-review, security) runs as its own model call in its own
job and writes `$RUNNER_TEMP/flow-review/<check>.json` with `{ check, verdict, summary }`.
Everything after the model step reads only that file. A `fail` verdict turns the check red
immediately: no second look checks whether the finding is real.

## Scope

1. **Findings in the verdict file.** Extend the verdict shape (validator in
   `project-template/.flow/bin/flow-review.mjs`) with `findings`: an array of
   `{ id, file, line, claim, blocking }`, where `claim` is one sentence stating the defect and
   `blocking` is a boolean. A `fail` verdict must carry at least one blocking finding; a `pass`
   verdict carries none. Update each review prompt only as far as needed to emit this shape.
2. **Verify each blocking finding.** For every finding with `blocking: true`, run one verifier
   model call in a new session. Its input is: the finding (`file`, `line`, `claim`), the PR diff
   (as an untrusted block, using `untrustedBlock`), and read access to the checked-out code. It
   does **not** receive the reviewer's summary, the other findings, or any other check's output.
   It writes `$RUNNER_TEMP/flow-review/<check>.verify/<id>.json` with
   `{ id, outcome: "confirmed" | "rejected", reason }`. Put the prompt, the input builder and the
   result validator in a new helper `project-template/.flow/bin/flow-verify.mjs`.
3. **Decide the check from verified findings.** The check is red if and only if at least one
   blocking finding is **not** `rejected`. A verification that errors, times out, returns invalid
   JSON, or returns any outcome other than the two allowed values counts as `confirmed`
   (**fail closed**: verification can only remove a wrong red, never hide a real one).
4. **Report.** The check's output (PR comment and job summary) lists every blocking finding with
   its outcome and the verifier's one-line reason, and a line
   `findings: <raised> raised, <confirmed> confirmed, <rejected> rejected`. Rejected findings stay
   visible, marked rejected, so a human can disagree with the verifier.
5. **Auto-fix.** The auto-fix round (flow-0082, `review.auto_fix_rounds`) is given only the
   findings that were not rejected.
6. Fragment `changes/flow-0188.md`: a top-level bullet stating the caller action (expected:
   **No caller action**; adopting repos get it through `flow-sync`).

**Does not:** re-review only the new diff after a fix round, or build an eval set (the intent's
other two outcomes, separate tasks); deduplicate across checks; change `guide` or
`intent-review`; change which model any review uses; add a config key.

## Acceptance criteria

- [ ] `flow-review.test.mjs`: the verdict validator rejects a `fail` verdict with no blocking
      finding, a `pass` verdict with a blocking finding, and a finding missing `file`, `claim` or
      `blocking`; it accepts a well-formed file of each kind.
- [ ] `flow-verify.test.mjs`: the input builder includes the finding and the diff inside the
      untrusted block, and includes neither the reviewer's summary nor any other finding
      (asserted on the built prompt text).
- [ ] `flow-verify.test.mjs`: given verify results, the decision function returns red when any
      blocking finding is `confirmed`, green when all are `rejected`, and red when a verify
      result is missing, is invalid JSON, or has an outcome outside `confirmed`/`rejected`
      (one test per failure case).
- [ ] `flow-verify.test.mjs`: the report line reads
      `findings: 3 raised, 1 confirmed, 2 rejected` for that input, and every rejected finding
      appears in the report with its reason.
- [ ] `.flow/bin/review-verify-workflow.test.mjs` parses `_flow-review.yml` and asserts: one
      verifier model step per check, which runs only when that check's verdict is `fail`; the
      verifier step reads `<check>.json` and nothing from another check's file; the auto-fix
      trigger reads the verified result, not the raw verdict.
- [ ] `changes/flow-0188.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
