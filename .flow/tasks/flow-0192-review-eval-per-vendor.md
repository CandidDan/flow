---
id: "flow-0192"
title: "The review eval set scores each check on both Claude and Codex, and posts the two scores side by side"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-11-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits on flow-0190, which builds the eval runner and case set this task extends, and on flow-0191, which adds the Codex review steps whose prompt and model this task must reuse."
blocked_by: ["flow-0190", "flow-0191"]
serves: ["G10"]
intent: "review-runs-on-any-agent"
touches:
  - ".flow/bin/review-eval.mjs"
  - ".flow/bin/review-eval.test.mjs"
  - ".github/workflows/flow-review-eval.yml"
  - "docs/review-eval.md"
  - "changes/flow-0192.md"
labels: [review, gate, eval, vendor]
model: "opus"
effort: "high"
model_reason: "Extends the measurement the vendor switch is judged by; a comparison that runs the two vendors on different prompts or inputs would mislead every switching decision"
asks: []
notes:
  - "2026-11-01 orchestrator: derived from the approved intent review-runs-on-any-agent, outcome 'every review stays as impartial and accurate as it can be, whichever vendor runs it'. It answers the intent's open question on calibration with data, not a gate: the vendor switch is never blocked by this score (see flow-0191's notes). Dan may overrule and make it a gate; that would be a follow-up task."
  - "2026-11-01 orchestrator: the eval workflow is canonical-only (flow-0190), so running the Codex half needs the FLOW_CODEX_AUTH secret in CandidDan/flow. Without it, the Codex column reports 'not run: FLOW_CODEX_AUTH not set' and the Claude half runs as before; it never fails the check on that alone."
---

## Context

flow-0190 adds `node .flow/bin/review-eval.mjs`, which runs each case in `evals/review/cases/`
through the named review and the flow-0188 verifier exactly as `_flow-review.yml` would, scores
it, and posts the pass rate on canonical PRs. flow-0191 lets each check run on Claude or Codex.
After both, the eval still only measures whichever vendor the check is set to. Nobody can see
whether Codex would review a check as well as Claude before switching it.

## Scope

1. **A vendor option on the runner.** `review-eval.mjs` takes `--vendor claude|codex|both`
   (default `both`). For each case and each vendor it runs the review and the verifier with that
   vendor's step from `_flow-review.yml` (the same prompt source and the model the plan would
   resolve for that vendor, read from the files, not copied). The two vendors get identical
   inputs: the same case, the same diff, the same prompt text.
2. **Scores per vendor.** The results file and the printed summary give the pass rate per check
   per vendor, and the total per vendor. A vendor whose credential is missing is reported as
   `not run: <secret> not set` for every case, not as failures.
3. **The PR comment.** The comment flow-0190 posts gains one column per vendor: per check, the
   head score and the `main` score for Claude and for Codex.
4. **What blocks.** Unchanged from flow-0190 for the vendor each check is currently set to. The
   other vendor's score is information only: it never fails the check.
5. `docs/review-eval.md`: a section `## Comparing vendors` saying what the two columns mean, that
   the comparison never blocks, and that the Codex column needs the `FLOW_CODEX_AUTH` secret.
6. Fragment `changes/flow-0192.md`: `**No caller action.**` (canonical-only).

**Does not:** change any reviewer prompt, model, default vendor or the 20-case rule; add or
change eval cases; ship anything in `project-template/`.

## Acceptance criteria

- [ ] `review-eval.test.mjs`: given stubbed review and verify results for both vendors,
      `--vendor both` produces a pass rate per check per vendor and a total per vendor.
- [ ] `review-eval.test.mjs`: for one case, the Claude run and the Codex run receive byte-identical
      prompt text and diff, and each receives its own vendor's model as `plan` would resolve it.
- [ ] `review-eval.test.mjs`: with no Codex credential, every Codex result is
      `not run: FLOW_CODEX_AUTH not set`, the Claude results are unchanged, and the check
      decision is the same as with Claude alone.
- [ ] `review-eval.test.mjs`: with 20 or more cases, a Codex score lower than `main`'s does not
      fail the check when the checks are set to Claude.
- [ ] `.github/workflows/flow-review-eval.yml` parses (proved by `npm run build`) and passes
      `FLOW_CODEX_AUTH` to the runner only through `env:`.
- [ ] `changes/flow-0192.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
