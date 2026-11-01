---
id: "flow-0190"
title: "A change to a reviewer's prompt or model is scored against a set of past PRs where the review went wrongly red or missed a bug, and the score is posted on the PR"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-11-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits on flow-0188: the eval scores the verified verdict, so it needs the findings format and the verifier to exist first."
blocked_by: ["flow-0188"]
serves: ["G10"]
intent: "review-findings-converge"
touches:
  - "evals/review/**"
  - ".flow/bin/review-eval.mjs"
  - ".flow/bin/review-eval.test.mjs"
  - ".github/workflows/flow-review-eval.yml"
  - "docs/review-eval.md"
  - "changes/flow-0190.md"
labels: [review, gate, eval]
model: "opus"
effort: "high"
model_reason: "Designs the measurement every future reviewer change is judged by; a weak eval would approve bad prompts"
asks: []
notes:
  - "2026-11-01 orchestrator: third outcome of the approved intent review-findings-converge ('A change to a reviewer's prompt or model is scored against an eval set built from past PRs where the reviewers went red wrongly or missed a bug')."
  - "2026-11-01 orchestrator: the intent's open questions are decided here. (1) The eval set lives in canonical only (`evals/review/`): the reviewers are canonical's, and adopting repos' client code must not be copied into it (intent constraint). Cases from adopting repos reference a public repo or are rewritten as minimal fixtures. (2) A case enters the set by a PR to canonical; Dan merging it is the label. (3) The score is reported but does not block until the set holds at least 20 cases; below that it says 'too few cases to judge'. (4) It runs automatically on canonical PRs that change a reviewer prompt or model, and on demand. Canonical is public, so these runs bill no Actions minutes; the model calls use the same subscription credential as the reviews. Dan can overrule any of these."
---

## Context

Reviewer prompts live inline in `.github/workflows/_flow-review.yml` (the `prompt:` blocks of
each review step); reviewer models are `DEFAULT_MODELS` in
`project-template/.flow/bin/flow-review.mjs`; the verifier prompt is in
`project-template/.flow/bin/flow-verify.mjs` (flow-0188). Today a change to any of these is
judged only by reading it. Known past failures include PRs that went red on findings that were
wrong (for example `CandidDan/flow` PRs merged over a failed review check) and bugs found after
merge that the reviewers passed.

## Scope

1. **Case format.** One directory per case under `evals/review/cases/<case-id>/` with
   `case.yml`: `repo` (a repo whose content may be stored here), `base_sha`, `head_sha` (or a
   `fixture/` directory holding a minimal before/after when the original repo is private),
   `check` (`qa` | `code-review` | `security`), `expect` (`green` | `red`), and for `red` a
   `finding` with `file` and a one-line `claim`. Plus `source` (the PR or incident url) and
   `why` (one sentence). Validate the format in `.flow/bin/review-eval.mjs`.
2. **Runner.** `node .flow/bin/review-eval.mjs` runs, for each case, the named review and the
   flow-0188 verifier exactly as `_flow-review.yml` would (same prompt text, same model, read
   from the files above, not copied), and scores the case: a `green` case passes when no
   blocking finding survives verification; a `red` case passes when a surviving blocking
   finding names the expected `file`. It writes `evals/review/results.json` (gitignored) and
   prints per-check and total pass rates.
3. **Workflow.** `.github/workflows/flow-review-eval.yml` (canonical-only, not shipped to
   adopters) runs the runner on `workflow_dispatch` and on canonical pull requests whose diff
   touches `.github/workflows/_flow-review.yml`, `project-template/.flow/bin/flow-review.mjs`
   or `project-template/.flow/bin/flow-verify.mjs`. It posts one PR comment with the score on
   the PR's head and on `main`, side by side. The check fails only when the set has at least
   20 cases **and** the PR's total pass rate is lower than `main`'s; below 20 cases it never
   fails and says "too few cases to judge".
4. **Seed set.** Add the cases you can establish from canonical's own history: PRs merged while
   a review check was red (candidate wrong-reds), and tasks whose notes record a bug that a
   reviewed PR let through (candidate misses). Every seeded case states its `source` and `why`;
   leave out any case you cannot justify from a cited source.
5. `docs/review-eval.md`: how to add a case, what the score means, and the 20-case rule.
6. Fragment `changes/flow-0190.md`: `**No caller action.**` (canonical-only).

**Does not:** change any reviewer prompt or model; ship anything in `project-template/`;
copy code from a private adopting repo into `evals/`.

## Acceptance criteria

- [ ] `review-eval.test.mjs`: the case validator accepts a well-formed `green` case and a
      well-formed `red` case, and rejects a `red` case with no `finding.file`, an unknown
      `check`, and a case with neither `head_sha` nor `fixture/`.
- [ ] `review-eval.test.mjs`: given stubbed review and verify results, scoring passes a `green`
      case with no surviving finding, fails it with one, passes a `red` case whose surviving
      finding names the expected file, and fails it when the finding names another file.
- [ ] `review-eval.test.mjs`: the runner reads the prompt text from `_flow-review.yml` and the
      models from `DEFAULT_MODELS` (asserted by changing a fixture copy of each and seeing the
      runner's input change), not from a copy of its own.
- [ ] `review-eval.test.mjs`: the check decision is "never fail" below 20 cases, fail at 20 or
      more when the PR's pass rate is lower than `main`'s, and pass when it is equal or higher.
- [ ] `.github/workflows/flow-review-eval.yml` parses (proved by `npm run build`) and its
      `paths` filter lists exactly the three files in Scope item 3 (asserted in
      `review-eval.test.mjs`).
- [ ] Every case in `evals/review/cases/` passes the validator, and each has a non-empty
      `source` and `why` (asserted in `review-eval.test.mjs` over the real directory).
- [ ] `changes/flow-0190.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
