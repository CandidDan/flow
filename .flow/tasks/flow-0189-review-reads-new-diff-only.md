---
id: "flow-0189"
title: "After a push, the review reads only the diff since the last reviewed commit, re-checks earlier findings, and reports findings on code the PR did not change as pre-existing without blocking"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-11-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits on flow-0188: re-checking earlier findings reuses its per-finding verifier and its findings format."
blocked_by: ["flow-0188"]
serves: ["G10", "G9"]
intent: "review-findings-converge"
touches:
  - ".github/workflows/_flow-review.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "project-template/.flow/bin/flow-rereview.mjs"
  - "project-template/.flow/bin/flow-rereview.test.mjs"
  - ".flow/bin/review-rereview-workflow.test.mjs"
  - "changes/flow-0189.md"
labels: [review, gate, cost]
model: "opus"
effort: "high"
model_reason: "Changes what the fleet's review gate reads; a wrong base commit would skip code that was never reviewed"
asks: []
notes:
  - "2026-11-01 orchestrator: second outcome of the approved intent review-findings-converge ('After a fix round, the re-review reads only what changed since the last review, and a finding on code that was already there is tagged pre-existing')."
  - "2026-11-01 orchestrator: the intent's open questions are decided here. (1) A pre-existing finding is reported and never blocks: it is not this PR's defect, and blocking on it makes a worker change code outside its task's touches. A security finding on pre-existing code is still reported in full so a human can raise a task for it. (2) After a rebase or force-push, when the last reviewed commit is not an ancestor of the new head, the review falls back to the full PR diff. A smaller diff is never trusted when its base cannot be proved. Dan can overrule either; both are recorded here so a worker does not re-decide them."
---

## Context

Today every push to a ready PR re-runs each review over the whole PR diff (base to head). After
an auto-fix round (flow-0082) that changed three lines, the reviewers read the whole PR again and
can raise new findings on code they already passed. The intent names this as a cause of reviews
that do not converge.

After flow-0186 and flow-0188, each review writes `<check>.json` with `findings[]`, and each
blocking finding is verified in its own session.

## Scope

1. **Record what was reviewed.** Each review's PR comment carries a hidden marker
   `<!-- flow-review:<check>:reviewed-sha=<40-char sha> -->` naming the head commit it reviewed,
   and the check's findings (with their verify outcomes) are recoverable from that comment.
   Put the marker writer and parser in `project-template/.flow/bin/flow-rereview.mjs`.
2. **Choose the diff.** On a new review run for a check, find that check's most recent marker
   on the PR. If one exists and its sha is an ancestor of the new head, the reviewer's diff is
   `<reviewed-sha>..<head>`. Otherwise (no marker, sha not found, or not an ancestor after a
   rebase or force-push) it is the full PR diff, and the run says why. Marker text is untrusted
   input: accept only a 40-character hex sha, and only from a comment written by the workflow's
   own identity.
3. **Re-check earlier findings.** Every earlier finding of that check that was not `rejected`
   is re-run through the flow-0188 verifier against the new head. A finding the verifier now
   rejects is reported as resolved.
4. **Tag pre-existing findings.** A new finding whose `file` and `line` fall outside the lines
   the PR changes (base to head) is tagged `pre-existing`. Pre-existing findings appear in the
   report under their own heading and never make the check red.
5. **Decide the check.** Red if and only if at least one finding, new or carried over, is
   blocking, not pre-existing, and not rejected. Failures of the verifier still count as
   confirmed (flow-0188's fail-closed rule).
6. **Report.** Add to the report line: `diff: incremental from <short sha>` or
   `diff: full (<reason>)`, and the counts of carried-over findings resolved and still open.
7. Fragment `changes/flow-0189.md`: a top-level bullet stating the caller action.

**Does not:** build the eval set (flow-0190); change prompts beyond telling the reviewer which
diff it is reading; change `guide`, `intent-review` or `plan`'s security-skip rule (the skip
decision still reads the full PR diff).

## Acceptance criteria

- [ ] `flow-rereview.test.mjs`: the marker parser returns the sha from a well-formed marker and
      returns nothing for a short sha, a non-hex sha, a marker for a different check, and a
      marker in a comment by another author.
- [ ] `flow-rereview.test.mjs`: the diff chooser returns `<sha>..<head>` when the sha is an
      ancestor, and the full diff with a named reason when there is no marker and when the sha
      is not an ancestor (a test with a real git repo in a temp directory, rebased).
- [ ] `flow-rereview.test.mjs`: a finding on a line the PR did not change is tagged
      `pre-existing`; one on a changed line is not.
- [ ] `flow-rereview.test.mjs`: the decision is green when the only remaining findings are
      pre-existing or rejected, and red when a carried-over finding is still confirmed or its
      re-verification failed.
- [ ] `.flow/bin/review-rereview-workflow.test.mjs` parses `_flow-review.yml` and asserts each
      check's reviewer receives the chosen diff and that `plan`'s security-skip still reads the
      full PR diff.
- [ ] `changes/flow-0189.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
