---
id: "flow-0128"
title: "A sync PR that ships canonical skills is still classified as a sync PR"
status: "ready"
priority: 1
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
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "changes/flow-0128.md"
labels: [flow-infra, review, sync, canary, urgent]
notes:
  - "2026-10-04 orchestrator: Dan approved the recommendations: run first, labelled urgent."
  - "2026-10-03 orchestrator: found by the v3 canary, progress PR #115 (flow-sync/3.0.0). flow-0081 made `_flow-sync.yml` copy `.claude/skills/<canonical-name>/`, but `SYNC_PR_PATHS` in flow-review.mjs still lists only .flow/bin/**, flow-*.yml callers, PROTOCOL.md and VERSION. So every v3 sync that ships a skill is refused the SYNC PR classification. Reviewers then read it like a feature PR: qa fails it for having no task, and a large sync also fails on diff truncation."
---

## Context

`SYNC_PR_PATHS` is meant to be "the surface `_flow-sync.yml` copies, exactly as that workflow's own
header lists it". Since flow-0081 that header also lists `.claude/skills/<name>/` for every
canonical-named skill. The constant was never widened to match.

## Scope

- Add the skills surface to `SYNC_PR_PATHS`. Scope it to the canonical skill names that canonical's `project-template/.claude/skills/` ships, not `.claude/skills/**`. A repo's own skill must still be read as a feature change.
- The provenance check from flow-0115 (`Canonical-SHA` trailer, byte-compare against the template) must cover the skill files the same way.
- A test pins `SYNC_PR_PATHS` to the surface `_flow-sync.yml`'s header lists, so the next surface added to the sync cannot drift again.

Out of scope: how a repo keeps local edits to a canonical skill. That is the separate task about skill sync overwriting repo sections.

## Acceptance

1. A `flow-sync/*` PR whose changes are `.flow/bin/**` plus `.claude/skills/task-writer/SKILL.md` matching the template classifies as `sync`.
2. A `flow-sync/*` PR that adds `.claude/skills/my-own-skill/SKILL.md`, a name canonical does not ship, does not classify as `sync`.
3. A test fails if `_flow-sync.yml`'s header lists a copied path that `SYNC_PR_PATHS` does not cover.
4. `changes/flow-0128.md` exists, with no caller action.
