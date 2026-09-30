---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0103"
title: "verdict fails closed when the plan truncated the diff: no reviewer can PASS what it did not see"
status: "in_progress"
priority: 3
project: "flow"
owner: "claude-worker-flow-0103"
created: "2026-09-30"
started: "2026-09-30T06:04:11Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - ".github/workflows/_flow-review.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/flow-review-adapter.test.mjs"
  - "changes/flow-0103.md"
labels: [flow-review, review-gate, fail-closed]
notes:
  - "2026-09-30 (orchestrator): Decided by the human, resolving the open question recorded on flow-0101. On a tanplan-platform PR the diff was 789 KB, cut at 300 KB; qa refused, code-review and security passed, and the two greens were read as a full review. flow-0101 makes the three prompts consistent; this task makes the rule hold in code, the same way a missing verdict already fails closed."
  - "2026-09-30 (orchestrator): SEQUENCE AFTER flow-0100 AND flow-0101. flow-0100 (review.max_diff_bytes) must ship first or a repo that routinely opens large PRs goes permanently red with no setting to change; flow-0101 touches the same workflow file. Priority 3 so pick-task takes those first."
  - "2026-09-30 (orchestrator): No new override mechanism (no label, no config switch to disable this). The human override is merging past the red check, which is a visible human decision; the durable fix for a repo is raising review.max_diff_bytes."
  - "2026-09-30 (orchestrator): Changelog criterion now says HOW to prove it. flow-0101 (#134) and flow-0102 (#135) both failed qa on exactly this criterion."
  - "2026-09-30 (worker): Branch flow/flow-0103-verdict-fails-closed-on-truncated-diff pushed with the implementation (no tests yet). DONE: verdictOutcome takes {diffTruncated,diffBytes,diffFullBytes} and a true truncation forces FAIL with the truncation lines naming review.max_diff_bytes and the merge-past-it escape; parseVerdictArgs/parseDiffTruncated make --diff-truncated required (missing or non-boolean = ReviewError) and fix the old positional-arg bug where `--check qa f.json` read the file as `qa`; plan now emits diff_bytes and diff_full_bytes alongside diff_truncated; _flow-review.yml publishes all three as plan job outputs and all three verdict steps pass them via env: (house rule: no ${{ }} in run blocks). NOT DONE: the proving tests in project-template/.flow/bin/flow-review.test.mjs, .flow/bin/flow-review-workflow.test.mjs, .flow/bin/flow-review-adapter.test.mjs (existing verdict tests there still call the CLI without the now-required flag, so `npm test` is red until they are updated), and changes/flow-0103.md. NEXT: write those tests, add the fragment, run all five gate commands, open the PR."
---

## Context

`runPlan` bounds the diff every reviewer reads and already emits `diff_truncated=true|false` as a
step output. `verdict` turns each reviewer's written verdict into the check's exit code and fails
closed on a missing or unparseable verdict, but it takes a PASS at face value even when the
reviewer was handed a truncated diff. Whether a reviewer names the truncation is left to its
prompt, so the gate can go green on work nobody read.

## Scope

**Does:**
- `verdict` takes the plan's truncation fact as `--diff-truncated true|false`. The workflow
  passes it from the plan's job/step output (`diff_truncated`) for all three checks (qa,
  code-review, security), never from a file in the workspace, which the reviewer can write to.
- When the fact is `true`, a PASS verdict resolves to FAIL. The output names the truncation, the
  full and kept byte counts if available, and the two ways out: raise `review.max_diff_bytes` in
  `.flow/config.yml`, or a human merges past the check knowing the diff was not fully reviewed.
  A FAIL verdict stays FAIL, with the truncation line added.
- `--diff-truncated` is required. Missing, or any value other than `true`/`false`, is a
  `ReviewError` (the check fails). The reusable workflow and the helper ship from the same commit
  (flow-0094), so a required flag cannot be broken by version skew.
- Update the canonical adapter and workflow tests that call `verdict` to pass the flag.
- Changelog fragment `changes/flow-0103.md`. **No caller action**, but say plainly that a PR whose
  diff exceeds the review limit now fails all three review checks, and that a repo which
  routinely opens such PRs should set `review.max_diff_bytes` (flow-0100) before taking this
  release.

**Does not touch:** the diff limit itself (flow-0100); the reviewer prompts (flow-0101); any
override label or switch (see notes); how the diff is truncated.

## Acceptance criteria

- [ ] Given a PASS verdict and `--diff-truncated true`, then `verdict` exits non-zero and its
      output names the truncation and `review.max_diff_bytes`.
- [ ] Given a PASS verdict and `--diff-truncated false`, then `verdict` exits 0 (existing
      behaviour kept).
- [ ] Given a FAIL verdict and `--diff-truncated true`, then `verdict` exits non-zero and the
      output carries both the reviewer's findings and the truncation line.
- [ ] Given no `--diff-truncated`, or `--diff-truncated maybe`, then `verdict` exits non-zero
      with an error naming the flag.
- [ ] In `_flow-review.yml`, each of the three verdict steps passes `--diff-truncated` from the
      plan's output expression, not from a workspace file, and a test asserts all three do.
- [ ] `changes/flow-0103.md` exists, says no caller action is needed, and names `review.max_diff_bytes`
      for repos with large PRs
      Prove it with a test in a canonical `.flow/bin/*.test.mjs` (never in `project-template/`,
      which adopting repos receive) that reads the entry through `changelogEntry` from
      `.flow/bin/changelog-entry.mjs`, so it still passes after a release assembles the fragment.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
