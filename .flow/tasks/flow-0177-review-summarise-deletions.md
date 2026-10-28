---
id: "flow-0177"
title: "flow-review summarises whole-file deletions by name and line count when a diff is over budget, so a retirement PR is reviewed in full instead of truncated"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-10-28"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - ".github/workflows/_flow-review.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/flow-review-adapter.test.mjs"
  - "changes/flow-0177.md"
labels: [workflows, review]
model: "opus"
effort: "medium"
model_reason: "Changes what every adopting repo's three Definition-of-Done reviewers read; a mistake here lets unreviewed code pass"
notes: []
asks: []
---

## Context

PR #256 (flow-0174, retire queue-runner) failed qa, code-review and security on 2026-10-28, all
three for truncation alone: the diff is 414,082 bytes against `DEFAULT_MAX_DIFF_BYTES = 300_000`
(`project-template/.flow/bin/flow-review.mjs`). `boundDiff` cuts the diff at a byte offset, so 16
files at the tail went unread — including real behaviour changes (`task-model.mjs`,
`flow-recover.yml`, `pick-task.mjs`). Most of the 414 KB is the full text of files the PR
**deletes** (78 files, +803/−4142).

The body of a wholly deleted file is not code anyone has to approve: it is leaving. What a reviewer
needs is *that* it was deleted, and enough to judge the consequence. Spending the byte budget on
its old contents pushes out the code that actually changes. Every retirement PR (flow-0164 retired
the board; flow-0174 retires queue-runner) will hit this again.

## Scope

- In `boundDiff` (or a helper it calls), when the full diff is **over** the byte cap, replace the
  hunk body of every **whole-file deletion** (a per-file section whose header carries
  `deleted file mode`) with a one-line summary naming the path and its removed line count, e.g.
  `*** DELETED FILE SUMMARISED: path/to/file.mjs (412 lines removed) — read it at the base ref if
  the deletion matters. ***`. Keep the `diff --git` header line for that file.
- Work from the diff text alone. `runPlan`'s git calls are pinned to the two existing diffs (see
  the comment near "NOT A GIT CALL, DELIBERATELY"); add no third git call.
- After summarising, re-measure. If the result fits, `truncated` is **false** and the reviewers
  see every non-deleted line. If it still does not fit, truncate exactly as today (same marker,
  `truncated: true`), so a genuinely oversized change still cannot PASS.
- When summarising happened, add a header marker at the top of the text that lists the summarised
  paths and says the reviewer may read any of them from the base worktree. Report the count in the
  returned object (e.g. `summarisedDeletions`) and in the plan's step output alongside
  `diff_bytes` / `diff_full_bytes`, so the verdict summary can quote it.
- A diff under the cap is returned **byte-for-byte unchanged**: deletions are only summarised when
  the budget forces a choice.
- Partial deletions (lines removed from a file that still exists), renames, and mode changes are
  NOT summarised. They are reviewable change.
- Update the three reviewer prompts in `_flow-review.yml` with one line each: a
  `DELETED FILE SUMMARISED` marker is not truncation, does not by itself block a PASS, and the
  reviewer judges whether removing that file breaks a caller. Keep `flow-review-workflow.test.mjs`
  holding the marker text and the prompts in step, as it already does for the PASS lines.
- Changelog fragment `changes/flow-0177.md`. This is a behaviour change inside a
  reusable workflow's helper with no caller change; state the caller action that
  `docs/flow-versioning-policy.md` gives for it.

**Deliberately does NOT:**
- Raise or remove the 300 KB cap, or change how `REVIEW_DIFF_MAX_BYTES` / `review.max_diff_bytes`
  resolve.
- Change the truncation-fails-the-check rule (flow-0103). A still-truncated diff still fails.
- Add an intent-only PR class or any other path-based skip.
- Touch PR #256 or its branch.

## Acceptance criteria

- [ ] Given a diff under the cap that includes a whole-file deletion, when `boundDiff` runs, then the text is returned unchanged and `truncated` is false (`project-template/.flow/bin/flow-review.test.mjs`).
- [ ] Given a diff over the cap whose whole-file deletions account for the excess, when `boundDiff` runs, then each deleted file's body is replaced by one summary line naming its path and removed line count, every non-deleted hunk is present in full, and `truncated` is false (same file).
- [ ] Given a diff still over the cap after summarising, when `boundDiff` runs, then it truncates with today's `DIFF TRUNCATED` marker and `truncated` is true (same file).
- [ ] Given a diff over the cap with a partial deletion and a rename, when `boundDiff` runs, then neither is summarised (same file).
- [ ] Given a summarised diff, then the returned object reports the summarised count and the text's header marker lists every summarised path (same file).
- [ ] Given `_flow-review.yml`, when it is parsed, then each of the three reviewer prompts carries the summarised-deletion line and it matches the marker the helper writes (`.flow/bin/flow-review-workflow.test.mjs`).
- [ ] Given `runPlan`, then its git calls are still exactly the two existing diffs (existing pin, still green).
- [ ] Given the changelog fragment, then it states its caller action (`.flow/bin/changelog-fragments.test.mjs`).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Once this merges, the orchestrator re-runs the reviews on PR #256. If #256 still truncates
  after summarising, that is a signal to split it, not to widen this task.
- `.flow/bin/flow-review-adapter.test.mjs` is in `touches` only in case the adapter's export list
  needs the new field; do not edit it otherwise.
