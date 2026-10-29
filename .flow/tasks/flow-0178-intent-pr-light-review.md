---
id: "flow-0178"
title: "An intent-only PR gets an intent-shape gate and one low-effort advisory intent reviewer instead of the full gate and the code reviewers; security is unchanged"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-session-angry-matsumoto-202d23"
created: "2026-10-28"
started: "2026-10-28T23:23:34Z"
branch: "flow/flow-0178-intent-pr-light-review"
pr: "https://github.com/CandidDan/flow/pull/260"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G10", "G9"]
intent: "reviewer-matches-the-change"
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/_flow-gates.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/intent-pr-kind.test.mjs"
  - ".flow/bin/gate-cost.test.mjs"
  - ".flow/bin/model-ids.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0178.md"
labels: [workflows, review, intents]
model: "opus"
effort: "medium"
model_reason: "Decides which checks a class of PR skips in reusable workflows the whole fleet runs; a wrong classification lets unreviewed code merge"
notes:
  - "Dan, 2026-10-28: follow reviewer-matches-the-change; intent review is advisory and low effort; security floor unchanged."
asks: []
---

## Context

An intent PR changes one Markdown file under `.flow/intents/`, yet it runs the full gate (`npm ci`,
build, lint, test, coverage, about 3 minutes) and the three code reviewers. PR #248 (one intent
file) spent roughly 5 Actions minutes, and qa and code-review judged it for proving tests and code
quality, which an intent has neither of. Nothing checked what an intent actually needs.

This is the first slice of the approved intent `reviewer-matches-the-change`
(`.flow/intents/reviewer-matches-the-change.md`). Dan's decisions for this slice (2026-10-28):
the intent reviewer is **advisory** (it never blocks and never approves, ADR-0007), it runs at
**low effort**, and the security floor is **unchanged**.

## Scope

- **Classify** in `flow-review.mjs`: add an `intent` kind. A PR is intent-only when it changes at
  least one file and **every** changed path matches `.flow/intents/*.md`, excluding
  `.flow/intents/_TEMPLATE.md` (a template edit changes the protocol and gets full review). Classify
  by **paths alone**: there is no codified intent-branch prefix, and the closed path list is what
  makes it safe. Pure, fail-closed: an empty diff, any other path, or a mix of an intent with
  anything else is not intent-only and gets today's handling. The classifier runs from the
  base-branch helper, as the existing kinds do, so a PR cannot widen its own list. Follow the
  `PR_KINDS` / `classifyPr` pattern, but do not reuse its branch-prefix requirement.
- **Gate** (`_flow-gates.yml`): for an intent-only PR, the `gate` job still runs and still reports
  under its own check name, but runs only `node .flow/bin/flow-doctor.mjs` (which already fails on
  malformed intent frontmatter, missing required fields and duplicate ids) instead of install,
  build, lint, test and coverage. `source-roots-plan` / `source-root` do not run their matrix. The
  classification comes from the same base-branch helper, not from re-implemented shell.
- **Reviews** (`_flow-review.yml`): for an intent-only PR,
  - qa and code-review do **not** invoke Claude. Each reports PASS with one fixed line pinned in
    code and in the workflow (`intent PR: intent files only; read by the advisory intent
    reviewer`), the way release and sync PRs carry theirs.
  - security runs **exactly as today**; the floor over `.flow/**` already triggers it.
  - one **advisory** intent reviewer runs at low effort (small `--max-turns`, e.g. 15, on the
    configured review model). It posts one PR comment checking the intent against
    `.flow/intents/_TEMPLATE.md`: the Problem quotes the human's own words with a named source;
    anything the writer added is marked `[assumption]`; the Outcome states a result, not a
    solution; Open questions are real questions. It never produces a check status and can never
    turn the PR red or green.
  - the run summary names which reviewers ran and at what effort (G9).
- Docs: one short section in `docs/flow-reusable-workflows.md` saying what an intent-only PR runs.
- Changelog fragment `changes/flow-0178.md`, with the caller action that
  `docs/flow-versioning-policy.md` gives for this change.

**Deliberately does NOT:**
- Change the security trigger or the floor.
- Add research, design or effort-by-risk review (later slices of the intent).
- Make the intent reviewer blocking, or let it write `approved_by` / `approved_at`.
- Classify a PR that mixes an intent with any other file.

## Acceptance criteria

- [ ] Given changed files that are all `.flow/intents/<slug>.md`, when classified, then the kind is `intent`; given `_TEMPLATE.md`, any other path, a mix, or an empty list, then it is not (`.flow/bin/intent-pr-kind.test.mjs`).
- [ ] Given an intent-only PR, when `_flow-gates.yml` is parsed, then the `gate` job runs flow-doctor and skips install, build, lint, test and coverage, and a non-intent PR still runs all five (`.flow/bin/gate-cost.test.mjs`).
- [ ] Given an intent-only PR, when `_flow-review.yml` is parsed, then qa and code-review skip the Claude step and report the pinned PASS line, and the line in the workflow matches the one in `flow-review.mjs` (`.flow/bin/flow-review-workflow.test.mjs`).
- [ ] Given an intent-only PR, then the security job's trigger is unchanged and still fires on the `.flow/**` floor (`.flow/bin/intent-pr-kind.test.mjs`).
- [ ] Given `_flow-review.yml`, then the intent reviewer step has a `--max-turns` no higher than 15, cannot set a check status, and runs only for the intent kind (`.flow/bin/flow-review-workflow.test.mjs`).
- [ ] Given the changelog fragment, then it states its caller action (`.flow/bin/changelog-fragments.test.mjs`).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- If skipping the gate's matrix leaves a required check name never reported, set the task
  `blocked` with a `decision` ask rather than renaming checks or changing branch protection.
