---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0104"
title: "flow-recover moves an in_progress task whose PR is open and ready to in_review, so a re-claimed task is never stuck"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-09-30"
started: ""
branch: ""
pr: ""
issue: "https://github.com/CandidDan/flow/issues/91"
blocked_reason: ""
blocked_by: []
serves: ["G7"]
touches:
  - "project-template/.flow/bin/flow-recover.mjs"
  - "project-template/.flow/bin/flow-recover.test.mjs"
  - ".github/workflows/_flow-recover.yml"
  - "changes/flow-0104.md"
labels: [flow-infra, status-lifecycle, flow-recover]
notes:
  - "2026-09-30 (orchestrator): Written from #91 at the human's request. The spec proposed on the issue (as 'flow-0069', an id since used for changelog fragments) is NOT followed: it added a flow-doctor warning fed by an env var that nothing in CI sets, so it would never fire. The sweep that already exists for stuck in_progress tasks (flow-recover) already queries open PRs per task, so it is the place to fix the state, not just warn about it."
  - "2026-09-30 (orchestrator): Why this state only means 'stuck'. Since flow-0039 a worker's PR is a draft until the worker runs `gh pr ready`, and flow-status turns that into in_review. So an in_progress task whose PR is open AND not a draft only arises when the ready_for_review event cannot fire again: the task was hand-returned to ready and re-claimed while its PR was already out of draft. The issue rejects adding `synchronize` to flow-status (it would flip tasks to in_review mid-work, re-opening #52); this task does not touch flow-status."
---

## Context

#91: a task hand-returned to `ready` while its PR is open and out of draft, then re-claimed
(`ready` → `in_progress`, a commit to `main`), stays `in_progress` for good. flow-status listens
for `opened`, `reopened`, `ready_for_review` and `closed`, and none of them can fire again on a PR
that is already open and ready. The board then says `in_progress` about a PR that is waiting for
review. Nothing is lost (flow-done still resolves the task on merge), but the store is wrong about
what is in flight, which is G7.

`flow-recover` already sweeps every `in_progress` task on a schedule, finds its branch and asks
`gh pr list` whether it has an open PR. Today any open PR makes the classifier return `ok`
(`classifyStranded`, "progressing — never disturbed"). This task adds one outcome for the case
where that open PR is not a draft.

## Scope

**Does:**
- `classifyStranded` gains one input, whether the task's open PR is **ready** (open and not a
  draft), and one outcome, `promote-in-review`. It returns `promote-in-review` only when all hold:
  status is `in_progress`, PR state is known, an open PR exists and is not a draft, and the age is
  at or past the threshold (the same age and threshold the other outcomes use, so a worker still
  pushing to the branch is never flipped mid-work). An open **draft** PR stays `ok`, exactly as today.
- The CLI `classify` subcommand takes the new fact as a flag (e.g. `--open-pr-ready 0|1`,
  defaulting to `0` so an older workflow calling it is unchanged).
- `_flow-recover.yml` finds the task's open PR by the same two sources it already uses (the `[<id>]`
  PR title, and `--head <branch>`), reads its draft state and URL from the same `gh pr list` call
  (add `isDraft` and `url` to the `--json` fields; no extra API call per task), and passes the
  flag. If the draft state cannot be read, it passes `0` (unknown never promotes).
- On `promote-in-review`, it writes the board edit `status: in_review` plus that PR's `pr` URL and
  `branch`, through `apply-board-edits.mjs`, and commits to `main` with the message
  `flow: recover <id> -> in_review (PR #<n> open and ready, status was stuck in_progress)`, using
  the same commit-and-push path the `reset-to-ready` branch uses.
- Changelog fragment `changes/flow-0104.md`. **No caller action.**

**Does not touch:** flow-status or its triggers (no `synchronize`); flow-doctor; the existing
`reopen-pr` and `reset-to-ready` behaviour; any PR itself (the sweep never marks a PR ready or
draft, it only corrects the store).

## Acceptance criteria

- [ ] Given an `in_progress` task, PR state known, an open PR that is **not** a draft, and age at
      or past the threshold, when `classifyStranded` runs, then it returns `promote-in-review`.
- [ ] Given the same but the open PR **is** a draft, then it returns `ok`.
- [ ] Given the same as the first criterion but age below the threshold, then it returns `ok`.
- [ ] Given the same as the first criterion but PR state unknown, then it returns `ok`.
- [ ] Given a task whose status is not `in_progress` (e.g. `in_review`, `ready`), then it returns
      `ok` whatever the PR facts.
- [ ] Given the CLI `classify` called without the new flag, then its output matches today's for
      the same other flags (an unchanged older caller keeps working).
- [ ] `_flow-recover.yml` passes the new flag from `gh pr list` data it already requests, and has a
      `promote-in-review` branch that writes `status: in_review` with `pr` and `branch` and commits to
      `main`; a test reads the workflow file and asserts both.
- [ ] `changes/flow-0104.md` exists and says no caller action is needed.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
