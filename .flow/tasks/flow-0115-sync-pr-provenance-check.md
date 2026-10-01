---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0115"
title: "A sync PR is classified only when its content matches canonical at the Canonical-SHA it claims"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-worker"
created: "2026-10-01"
started: "2026-10-01T13:25:30Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # the gate tells the truth: "copied from canonical" should be checked, not assumed from a branch name.
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "changes/flow-0115.md"
labels: [review, flow-sync, security, flow-infra]
notes:
  - "2026-10-01 (orchestrator): ORIGIN. Security review FAIL on CandidDan/flow#146 (flow-0089). classifyPr marks a PR as SYNC from branch prefix `flow-sync/` plus every path inside the synced surface. That proves location, not provenance. #146 answered the prompt half (every reviewer now still reads a sync PR and FAILs permission, pull_request_target, uses: or secret changes). This task is the code half the reviewer also asked for. `_flow-sync.yml` already writes a `Canonical-SHA:` trailer, so the data to check against exists."
  - "2026-10-01 (orchestrator): SEQUENCING. Shares flow-review.mjs with flow-0089. pick-task keeps them apart; build on flow-0089 as merged."
  - "2026-10-01 (worker): PROGRESS. Branch flow/flow-0115-sync-pr-provenance-check pushed. DONE: `syncProvenance` + `canonicalShaTrailers` + `sameSyncedFile` + `canonicalPathFor` in project-template/.flow/bin/flow-review.mjs; runPlan calls it only for an already-path-classified `flow-sync/` PR and overwrites `classified` with the verdict; taskContext carries the failure reason into task.md; planSummary prints VERIFIED / NOT VERIFIED and names the mismatched files. 8 new tests in flow-review.test.mjs (90/90 pass), plus changes/flow-0115.md. NOT YET DONE: the full five-command gate (build, lint, test, coverage, check-claude-md) and the PR. Next: run `npm run build && npm run lint && npm test && npm run coverage`, then open the PR titled [flow-0115]."
---

## Context

`classifyPr` (flow-0089) gives a PR the `SYNC PR` sentinel when its branch starts with
`flow-sync/` and every changed path sits inside the synced surface. Anyone with write access can
name a branch that way. The synced surface is the most sensitive part of an adopting repo:
caller workflows, `.flow/bin/**`, `.flow/PROTOCOL.md`.

## Scope

- When classifying a sync PR, read the `Canonical-SHA:` trailer from the PR's head commit(s).
- Fetch canonical (or the release repo) at that SHA and compare each changed file byte for byte
  with the file at the same synced path there.
- Every file matches: classify as today. Any mismatch, or no trailer: do not classify. The PR is
  reviewed as a normal task-less PR, and the plan summary says why.

## Acceptance criteria

- [ ] A sync PR whose files match canonical at its `Canonical-SHA:` gets the `SYNC PR` sentinel.
- [ ] A `flow-sync/*` PR with one file edited after the sync is not classified, and the summary
      names the file.
- [ ] A `flow-sync/*` PR with no `Canonical-SHA:` trailer is not classified.
- [ ] No network call is made for a PR that is not on a `flow-sync/` branch.
- [ ] `changes/flow-0115.md` describes the change.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
