---
id: "flow-0130"
title: "The v2-to-v3 repin doc says to run the v3 sync, not the v2 one, or skills are skipped"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-10-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "docs/repinning-a-consuming-repo.md"
  - ".flow/bin/caller-pins.test.mjs"
  - "changes/flow-0130.md"
labels: [flow-infra, docs, sync, canary, urgent]
notes:
  - "2026-10-04 orchestrator: Dan approved the recommendations: run first, labelled urgent."
  - "2026-10-03 orchestrator: found by the v3 canary, progress PR #115. The doc's easy path, `gh workflow run flow-sync.yml -f canonical_ref=v3`, runs the repo's CURRENT caller, which is `_flow-sync.yml@v2` (2.2.0). That copies 3.0.0's .flow/bin, but 2.2.0's reusable predates flow-0081 and ships no skills. The synced allocate-task-id.test.mjs then fails on the task-writer skill's missing queue_cap paragraph, so the repo's flow-tooling check goes red on the adoption PR itself."
---

## Scope

- Repinning doc, v2-to-v3 section: say that the adopting sync must run the v3 reusable. Either repin `flow-sync.yml` to `@v3` by hand first and then dispatch it, or, after a v2-driven sync merges, run the sync once more. Explain why in one sentence.
- If any of the doc's commands are pinned by a test, change that test to match.

## Acceptance

1. The doc's v2-to-v3 section names the two-step order and the reason.
2. `changes/flow-0130.md` exists, with a caller action that points at the doc.
