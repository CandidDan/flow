---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0049"
title: "Make the queue-runner's failure summary state the run's actual outcome instead of asserting one"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-15"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G7"]   # see the note on why this is G7 and not maintenance or G10
touches: [".github/workflows/_flow-queue-runner.yml", "project-template/.flow/bin/queue-runner-verify.mjs", "project-template/.flow/bin/queue-runner-verify.test.mjs", ".flow/bin/queue-runner-verify.mjs", ".flow/bin/queue-runner-verify.test.mjs"]
labels: [infra, queue-runner, integrity]
notes:
  - "2026-09-15 (orchestrator): found by reading a real failure notice for `progress-0014` in an adopting repo. The notice is Flow working as designed — the claim is deliberately left for flow-recover — but two defects in the summary text surfaced on inspection of `_flow-queue-runner.yml`. Neither was observed failing in the wild; both are read off the workflow source and the step ordering, and the first is provable from the `if:` conditions alone. Recorded as inspection, not incident."
  - "2026-09-15 (orchestrator): `serves` is G7, deliberately not `maintenance` and not G10. flow-0047 set the precedent for refusing G10 when the failure mode is not 'a green gate on wrong work', and that reasoning holds here — nothing about this makes a gate lie. `maintenance` was the other candidate and is the one to argue with: it would be right if this were canonical's own housekeeping. It is not. `_flow-queue-runner.yml` is a reusable shipped to the fleet, and this summary is what an operator in an *adopting* repo reads to learn what happened to an in-flight claim — which is G7's subject exactly. A repo that reports its own state incorrectly is G7 failing, not canonical tidying up."
---

## Context

`_flow-queue-runner.yml` ends with a step, `Explain what happens to the claim`, that writes a
failure notice to `$GITHUB_STEP_SUMMARY`. It exists for a good reason, stated in its own comment:
a capped worker exits non-zero having opened no PR, and the raw log says only "Claude execution
failed", so the consequence for the claim is spelled out to make the run diagnosable from the
summary alone. That intent is correct and is not in question here.

Two defects in how it does it, both read off the workflow source rather than observed in the wild:

**1. It asserts a fact it has not checked.** The step is gated `if: ${{ failure() && ... }}` —
that is *any* step failing, not specifically a worker that produced nothing — and it opens with
the flat claim "No PR was opened." The step that opens the PR is the worker itself (`id: work`).
A worker that pushes its branch, opens its PR, and *then* exits non-zero — a turn cap landing just
after PR creation is the obvious case — produces a job status of `failure`, so this step fires and
states something false. `Verify the worker produced an outcome` will have passed happily on the
same run, so the contradiction is invisible unless a human reads both steps.

This is the same class of defect as the incident flow-0025 was written to close (a run reporting
an outcome it had not established), pointing the other way: that was a green job with nothing
behind it, this is a red job asserting an absence it never looked for.

**2. It prints a decision tree it already holds the answer to.** `Verify the worker produced an
outcome` runs immediately before, gated `!cancelled()`, so it runs on this exact path. It derives
`branch_exists`, `ahead` and `has_open_pr` from `origin` — precisely the three facts that decide
which of the notice's two bullets applies. It then discards them: they are shell locals, the step
carries no `id:`, and nothing reaches `$GITHUB_OUTPUT`. So the operator is handed "which way it
goes depends on what this run managed to push" by a job that knows which way it went.

The cost is small per run and real in aggregate: the notice's closing advice is to check whether a
branch is landing between runs, which is the question the run could have answered for free.

## Scope

**Does:**

- Give `Verify the worker produced an outcome` an `id:` and have it publish `branch_exists`,
  `ahead`, `has_open_pr` and the resolved branch name to `$GITHUB_OUTPUT`. These must be written
  **before** `queue-runner-verify.mjs` is invoked, so a run where that helper fails the job still
  carries the facts into the summary.
- Rewrite `Explain what happens to the claim` to render the outcome those facts determine, rather
  than the two-branch hypothetical:
  - open PR for the task → say so, name it, and do not claim no PR was opened;
  - branch ahead of `main`, no PR → name the branch and the commit count, and state that
    flow-recover reopens the PR from it;
  - no branch → state that the task resets to `ready` past the staleness threshold.
  In every case keep the existing, correct statements that the claim is **not** released here and
  that flow-recover owns that decision on its own schedule.
- Implement the rendering as a pure function exported from
  `project-template/.flow/bin/queue-runner-verify.mjs` — it already receives exactly these inputs,
  so the decision and its description stay in one place — with canonical's adapter re-exporting it
  from `.flow/bin/queue-runner-verify.mjs`. Same pure-function-plus-thin-IO shape the file already
  uses; no new helper module.
- Preserve the bootstrap guard's behaviour. When `.flow/bin/queue-runner-verify.mjs` is absent
  from the consuming repo, the verify step still no-ops, no outputs exist, and the explain step
  must fall back to the current generic two-branch text rather than failing or rendering an
  outcome it cannot support.

**Deliberately does NOT:**

- Touch `CHANGELOG.md`. `## Unreleased` is a red gate for every PR that writes to it until
  flow-0047 lands (see that task), and the file is already contended by flow-0047 and flow-0048.
  This task takes no changelog entry; whoever releases the next version records it.
- Change what the job's exit status is. A worker that fails still fails the job — this is the
  summary text and its inputs only, never the pass/fail verdict `queue-runner-verify.mjs` returns.
- Change what `flow-recover` does with a stranded claim. Its `reopen-pr` / `reset-to-ready`
  decisions are unchanged; the notice only describes them accurately.
- Release the claim from the failure path. The existing comment is explicit that doing so would
  race a worker still finishing, and that reasoning stands.
- Add attempt or cap counting so the notice can answer "is this task capping repeatedly?" on its
  own. That is a separate question about the store's schema and flow-recover's write behaviour,
  and it is not this task — see Notes.
- Touch the worker's prompt, model, turn cap or permissions.

## Acceptance criteria

- [ ] Given an open PR exists for the task and the worker exited non-zero, when the summary is
      rendered, then it does not contain the claim that no PR was opened, and it names the PR.
- [ ] Given a branch ahead of `origin/main` and no open PR, when the summary is rendered, then it
      names that branch and states that flow-recover reopens the PR from it.
- [ ] Given no branch on `origin`, when the summary is rendered, then it states that the task
      resets to `ready` past the staleness threshold.
- [ ] Given any of the above, when the summary is rendered, then it still states that the claim is
      not released by this job and that flow-recover owns the decision.
- [ ] Given the pure renderer, when tested across every combination of
      {branch-exists, ahead>0, has-open-pr}, then each returns the documented outcome text,
      including the contradictory input {no branch, open PR} — which must not crash and must
      describe the PR rather than the reset.
- [ ] Given `_flow-queue-runner.yml`, when parsed, then the verify step carries an `id:`, and the
      explain step's script references that step's outputs.
- [ ] Given `_flow-queue-runner.yml`, when parsed, then the writes to `$GITHUB_OUTPUT` occur
      before `queue-runner-verify.mjs` is invoked in that step's script.
- [ ] Given a checkout with no `.flow/bin/queue-runner-verify.mjs`, when the queue-runner fails,
      then no outputs are published, the explain step renders the current generic two-branch text,
      and neither step errors.
- [ ] Given the canonical adapter, when it re-exports the renderer, then it resolves the
      template's logic rather than duplicating it (the assertion `.flow/bin/adapters.test.mjs`
      already makes for its siblings).
- [ ] Given the repo after this change, when `npm run build`, `npm run lint`, `npm test` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved · build +
lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task linked,
criteria checklist ticked with the proving test named.

## Notes / open questions

- The `{no branch, open PR}` combination in the criteria is not hypothetical bookkeeping: the
  existing step already falls back to matching a `[<id>]` PR title when no `flow/<id>-*` branch is
  found, precisely because a cloud worker can be forced onto a non-`flow/` branch. The renderer
  must handle it, and "unreachable" is the wrong answer.
- **Not in this task, and worth a decision separately:** the notice closes by telling the operator
  to check whether the same task is capping repeatedly, and nothing in Flow can answer that. There
  is no `attempts` field in `_TEMPLATE.md`, no counter in flow-recover's reset path, and nothing in
  the flightdeck — so following the advice means reading Actions history by hand. The candidate
  fix is flow-recover appending a `notes` entry when it resets a claim, rather than a new schema
  field. It is left out here because it changes a deliberately conservative scheduled sweep into
  one that writes to the store, which is a judgment for the human, not a detail of this task.
