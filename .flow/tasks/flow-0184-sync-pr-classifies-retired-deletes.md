---
id: "flow-0184"
title: "A flow-sync PR that deletes a retired path still classifies as a sync PR, so the reviewers apply the sync rule instead of reading a 400 KB diff as a feature"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-worker-flow-0184"
created: "2026-10-30"
started: "2026-10-30T02:47:02Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - ".github/workflows/_flow-sync.yml"
  - ".flow/bin/sync-retired-paths.test.mjs"
  - "changes/flow-0184.md"
labels: [hotfix, review, sync]
model: "sonnet"
effort: "high"
model_reason: "Classification is a security boundary (flow-0115 provenance); widening it must stay exact and be pinned to the sync's own retired list"
asks: []
notes:
  - "2026-10-30 orchestrator: found in the 4.0.1 rollout. CandidDan/Nudge#392 (flow-sync/4.0.1) was not classified as SYNC PR. Its diff deletes `.flow/board.html` and `.claude/skills/board-builder/SKILL.md`, both outside SYNC_PR_PATHS. So qa, code-review and security reviewed 415 KB as a feature PR, truncated it at 300 KB, and failed closed. write#227 and later#56 hit the same misclassification and passed only because their diffs fit."
---

## Context

`_flow-sync.yml` (about line 608) deletes retired paths downstream:
`for RETIRED in ".claude/skills/board-builder/" ".flow/board.html" ".github/workflows/flow-queue-runner.yml"`.
`SYNC_PR_PATHS` in `project-template/.flow/bin/flow-review.mjs` (about line 535) lists the copied
surface: `.flow/bin/**`, `.github/workflows/flow-*.yml`, `.flow/PROTOCOL.md`, the
`CANONICAL_SKILLS` globs and `.flow/VERSION`. It does not list the retired paths. `classifyPr`
therefore returns `classified: false` for every sync that removes one, which is every 3.x → 4.x
sync. flow-0128 hit the same class of bug with skills.

## Scope

- Make the retired paths part of the sync surface that `classifyPr` accepts, **for deletions
  only**. A sync PR that *adds or modifies* `.flow/board.html` must still fail to classify. If
  `classifyPr` sees only names, add the change status to its input (for example,
  `git diff --name-status`) where the plan builds it.
- One source of truth for the retired list. Either `_flow-sync.yml` reads it from the helper, or a
  canonical test (`.flow/bin/sync-retired-paths.test.mjs`) parses the `for RETIRED in …` line and
  asserts it equals the helper's list, so the two cannot drift.
- Keep `syncProvenance` (flow-0115) applied to the classified PR unchanged.
- Fragment `changes/flow-0184.md`: a top-level bullet, `**No caller action.**`

**Does not:** change the sync rule's review text, the truncation limit, or `_flow-review.yml`.

## Acceptance criteria

- [ ] Given branch `flow-sync/4.0.1` whose files are the copied surface plus *deleted*
      `.flow/board.html` and `.claude/skills/board-builder/SKILL.md`, `classifyPr` returns
      `kind: "sync"`, `classified: true`.
- [ ] The same branch with `.flow/board.html` *modified or added* returns `classified: false`
      and names it.
- [ ] The retired list in `_flow-sync.yml` and the helper's list are asserted equal by a test
      that fails if either changes alone.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
