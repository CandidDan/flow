---
id: "flow-0084"
title: "After the reviews finish, one review-guide comment tells the human where to look: TL;DR, hotspots, assumptions, smoke test, verdicts"
status: "in_review"
priority: 2
project: "flow"
owner: "claude-worker"
created: "2026-09-26"
started: "2026-10-01T16:28:30Z"
branch: "flow/flow-0084-review-guide"
pr: "https://github.com/CandidDan/flow/pull/158"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G12", "G10"]    # G12: what Flow needs from the human is quick to act on. G10: hotspots are computed facts, not the worker's self-report.
touches:
  - ".github/workflows/_flow-review.yml"
  - "project-template/.flow/bin/review-guide.mjs"
  - "project-template/.flow/bin/review-guide.test.mjs"
  - ".flow/bin/review-guide.mjs"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - "changes/flow-0084.md"
labels: [review, g12]
notes:
  - "2026-09-26 (orchestrator): From the operator: PRs are long and it's hard to know where to look. Decided: a separate Claude round writes the guide after the three checks, never the worker (the worker would steer away from its own weak spots). Copilot stays optional and advisory; it can't see the Flow context this comment exists to surface."
  - "2026-09-26 (orchestrator): flow-0082 (auto-fix) should reuse this comment as its escalation decision card when it lands. Not in scope here, but keep the comment's structure stable so that is a small change."
  - "2026-10-01 (worker): Branch `flow/flow-0084-review-guide` pushed. DONE: project-template/.flow/bin/review-guide.mjs (facts/comment/comment-id, pure + CLI), .flow/bin/review-guide.mjs adapter, and the `guide` job in _flow-review.yml (needs plan+qa+code-review+security, if always() && needs.plan.result == 'success', job-level continue-on-error, marker-based comment upsert via gh). NOT DONE: project-template/.flow/bin/review-guide.test.mjs, the static workflow assertions in .flow/bin/flow-review-workflow.test.mjs (the existing --model count / plan-invocation count / HELPER_JOBS lists must be updated for the 4th job), changes/flow-0084.md, and the gate. DECISION: the guide model is `needs.plan.outputs.model` (review.model, default sonnet) rather than a new plan output — project-template/.flow/bin/flow-review.mjs is OUTSIDE this task's touches, so no guide_model output could be added. NEXT: write the template test file, update flow-review-workflow.test.mjs, write the changelog fragment, run all five gate commands."
---

## Context

The human's merge touchpoint is weak today (VISION G10's own words: "PR text is long and often not
plain English"). The worker's PR description is written by the context that produced the work, so
it is the wrong author for "here is what to check". The three review checks already run outside
that session, and a fourth job after them can combine their results with facts computed from the
diff into one short comment the human can act on from a phone.

## Scope

**Does:**

- Add a `guide` job to `_flow-review.yml`. It runs after `qa`, `code-review` and `security`
  whatever their outcome, including when security was visibly skipped, and on the same draft and
  fork fences as `plan`.
- `review-guide.mjs` (pure, tested) computes the **facts**, with no model involved:
  - files in the diff matching `review.security_paths` or the always-reviewed floor;
  - test files deleted, or test assertions removed (a net decrease in assertion count per test
    file is sufficient);
  - files changed outside the task's `touches`;
  - the three verdicts;
  - the PR description's `## Assumptions` section, quoted verbatim, or "none stated".
- A model call (**Sonnet**, effort low) writes only:
  - a one-line TL;DR;
  - up to three "Look here" items, chosen from the computed facts and the reviewers' non-blocking
    notes;
  - one smoke-test suggestion.

  The model may not add, drop or reword any computed fact. Facts render from code, prose renders
  from the model, in separate sections.
- The comment is **one comment per PR, updated in place**, found by a hidden marker. It is never
  a new comment per run. Fixed order: TL;DR · Look here (max 3) · Assumptions · Smoke test ·
  Verdicts.
- If the model call fails, the comment still posts with the facts and verdicts, and a line
  saying the summary is unavailable. Fail-open for prose, never for facts.
- Changelog fragment `changes/flow-0084.md`. Caller action: none (the job lives in the reusable).

**Does not touch:**

- The three existing checks, their verdicts or blocking behaviour. The guide is advisory and never
  blocks.
- Copilot configuration.
- flow-0082's escalation path.

## Acceptance criteria

- [ ] Given a diff touching a `security_paths` file, then that file appears under "Look here",
      computed by `review-guide.mjs` (unit test).
- [ ] Given a diff that deletes a test file, or removes assertions from one, then it appears under
      "Look here" regardless of what the model wrote.
- [ ] Given a diff with a file outside the task's `touches`, then it is listed.
- [ ] Given a PR description with `## Assumptions`, then the comment quotes it verbatim. Without
      one, it says "none stated".
- [ ] Given more than three candidate hotspots, then "Look here" shows three, and a count of the rest.
- [ ] Given the review workflow runs twice on one PR, then exactly one guide comment exists,
      updated in place (marker-based).
- [ ] Given the model call fails, then the comment still posts with facts and verdicts plus an
      "summary unavailable" line.
- [ ] Given the security check was skipped, then the verdicts row says skipped with its reason,
      not pass.
- [ ] Given the workflow, then `guide` never runs on drafts or fork PRs, and its failure never
      fails the PR's required checks (static assertion).
- [ ] Given `changes/flow-0084.md`, then it exists and states "caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **Suggested for this task itself:** `model: opus`, `effort: high`. It edits the review workflow,
  so the always-reviewed floor makes its own security review run, and it must get the fact/prose
  separation right.
