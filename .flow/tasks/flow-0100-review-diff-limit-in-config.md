---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0100"
title: "A repo sets its review diff limit in config.yml as review.max_diff_bytes"
status: "done"
priority: 2
project: "flow"
owner: "claude-worker-flow-0100"
created: "2026-09-30"
started: "2026-09-30T05:27:46Z"
branch: "flow/flow-0100-review-diff-limit-in-config"
pr: "https://github.com/CandidDan/flow/pull/136"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "project-template/.flow/config.yml"
  - "changes/flow-0100.md"
labels: [flow-review, review-gate, config]
notes:
  - "2026-09-30 (orchestrator): Reported from tanplan-platform. A 789 KB PR diff was cut at 300 KB (`DEFAULT_MAX_DIFF_BYTES`, flow-review.mjs line 60) and qa correctly refused to pass what it could not read. `REVIEW_DIFF_MAX_BYTES` is read by the helper but no reusable workflow passes it, so a consuming repo has no way to raise the limit. The only per-repo surface Flow has is `.flow/config.yml`, which the plan step already reads for `review:`."
  - "2026-09-30 (orchestrator): Overlaps flow-0089 on flow-review.mjs and flow-0102 on project-template/.flow/config.yml; sequence, do not run in parallel."
  - "2026-09-30 (worker): Branch `flow/flow-0100-review-diff-limit-in-config` pushed, all 8 criteria implemented with proving tests (65/65 pass in project-template/.flow/bin/flow-review.test.mjs). Done: MAX_DIFF_BYTES_CEILING + checkMaxDiffBytes + resolveMaxDiffBytes in the template helper; runPlan resolves the limit AFTER parseReviewConfig (its `maxBytes` parameter is replaced by an `env` parameter, since the old default pre-collapsed env/default before config was read); planSummary names the limit and its source; the key documented commented-out in project-template/.flow/config.yml; changes/flow-0100.md. Decision not to re-litigate: the ceiling binds REVIEW_DIFF_MAX_BYTES too (a bound one source can step over is not a bound), and an invalid env value now throws rather than becoming NaN. Canonical's .flow/bin/flow-review.mjs adapter is deliberately NOT touched (outside `touches`) — it re-exports a hand-kept list that now omits MAX_DIFF_BYTES_CEILING/resolveMaxDiffBytes; no test asserts export parity, so this is cosmetic, but it is worth a follow-up task. Next action: run the remaining gate commands (build, lint, coverage) and open the PR titled `[flow-0100] A repo sets its review diff limit in config.yml as review.max_diff_bytes`."
  - "2026-09-30 (worker): COMPLETE. PR #136 marked ready for review; the four local gate commands are green (build 34 workflows, lint 101 .mjs, test 1448 pass / 1 pre-existing skip, coverage 95.85% vs a floor of 83.5). Every criterion is ticked in the PR body with its proving test named. Nothing is left to do on the branch; the qa, security and code-review checks now run on the PR. Follow-up worth a task, deliberately left undone as out of `touches`: canonical's .flow/bin/flow-review.mjs adapter re-exports a hand-kept name list that now omits MAX_DIFF_BYTES_CEILING and resolveMaxDiffBytes — nothing is broken (no test asserts export parity) but the list is the flow-0008 shape and will drift again."
---

## Context

`runPlan` bounds the diff every reviewer reads to `DEFAULT_MAX_DIFF_BYTES` (300 000) unless the
environment sets `REVIEW_DIFF_MAX_BYTES`. The reusable workflow sets neither, so the limit is
fixed fleet-wide. Some repos legitimately open large PRs (generated docs, fixtures), and for them
the gate is red on work it simply did not read.

## Scope

**Does:**
- `parseReviewConfig` reads an optional `review.max_diff_bytes` (a positive integer, at most
  2 000 000). A value that is not a positive integer, or is above that ceiling, is a
  `ReviewError` naming the key and the value, so a bad config fails the plan loudly rather than
  silently using the default.
- The effective limit is chosen in this order: `REVIEW_DIFF_MAX_BYTES` env, then
  `review.max_diff_bytes`, then `DEFAULT_MAX_DIFF_BYTES`. The config is read from the same BASE
  copy the plan already reads `review:` from, so a PR cannot raise its own limit.
- The plan's run summary states the effective limit and which of the three it came from.
- `project-template/.flow/config.yml` documents the key under `review:`, commented out, with one
  line on cost (a bigger diff is a bigger model call on every PR).
- Changelog fragment `changes/flow-0100.md`. **No caller action**; a repo opts in by setting
  the key.

**Does not touch:** the reusable workflow; the reviewer prompts; what happens when a diff IS
truncated (that is flow-0101's).

## Acceptance criteria

- [ ] Given `review.max_diff_bytes: 900000` and no env override, then a 789 000-byte diff is not
      truncated.
- [ ] Given no key and no env override, then the limit is 300 000 (existing behaviour kept).
- [ ] Given both the key and `REVIEW_DIFF_MAX_BYTES`, then the env value wins.
- [ ] Given `max_diff_bytes: 0`, `-5`, `"lots"` or `2000001`, then the plan fails with an error
      naming `review.max_diff_bytes`.
- [ ] Given a PR whose HEAD config raises the limit but whose BASE config does not, then the BASE
      limit applies.
- [ ] The run summary names the effective limit and its source (env, config or default).
- [ ] `project-template/.flow/config.yml` documents the key, commented out.
- [ ] `changes/flow-0100.md` exists and says no caller action is needed.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
