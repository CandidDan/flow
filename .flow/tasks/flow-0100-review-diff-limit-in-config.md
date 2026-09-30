---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0100"
title: "A repo sets its review diff limit in config.yml as review.max_diff_bytes"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-30"
started: ""
branch: ""
pr: ""
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
