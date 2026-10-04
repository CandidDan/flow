---
id: "flow-0128"
title: "A sync PR that ships canonical skills is still classified as a sync PR"
status: "in_review"
priority: 1
project: "flow"
owner: "claude-worker-flow-0128"
created: "2026-10-03"
started: "2026-10-03T22:19:40Z"
branch: "flow/flow-0128-sync-pr-classifies-shipped-skills"
pr: "https://github.com/CandidDan/flow/pull/176"
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
  - "2026-10-04 orchestrator: the worker was right — I wrote 0128/0129/0130 with `## Acceptance` (numbered) instead of `## Acceptance criteria` with `- [ ]`, and 0130 had no `## Context`. Fixed all three bodies on main. The branch needs no change; updated it and marked PR #176 ready."
  - "2026-10-03 worker: BUILD DONE, GATE BLOCKED ON A STORE DEFECT ELSEWHERE. Branch flow/flow-0128-sync-pr-classifies-shipped-skills is pushed; flow-open-pr opened draft PR #176 and its description is written in full (change, criteria→test mapping, gate table). GENUINELY DONE: SYNC_PR_PATHS now carries .claude/skills/<name>/** for each of canonical's five skill directories via a new CANONICAL_SKILLS constant + skillSurfaceGlob(); the flow-0089 closed-list pin was updated to the full literal list; changes/flow-0128.md written; six new tests in project-template/.flow/bin/flow-review.test.mjs cover all four criteria and all pass (96/96 in that file, 0 skipped), each verified to FAIL against the pre-fix constant. DECISION, so it is not re-litigated: the skills surface is scoped to canonical's NAMES, not .claude/skills/** — the sync loop only ever writes canonical's own directories, so the broad glob would grant the fixed SYNC PR PASS line to a flow-sync/ branch that added a skill the repo invented. The flow-0115 provenance check needed NO code change: canonicalPathFor already maps a skill path into project-template/ and rsync -a copies byte for byte, so the existing byte-compare covers skills — proved by a test, not assumed. ONLY LOOKS DONE: the gate. build OK (34 workflows), lint OK (113 .mjs), coverage 96.97% lines vs floor 83.5 — but `npm test` is 2 failures, both pre-existing on main, both from flow-0130's task body missing `## Context` / `## Acceptance criteria`; see blocked_reason. NEXT ACTION: fix flow-0130's body on main (and flow-0129's and this file's, same shape), re-run the five gate commands, then `gh pr ready 176`. No code change is needed on the branch."
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

## Acceptance criteria

- [ ] A `flow-sync/*` PR whose changes are `.flow/bin/**` plus `.claude/skills/task-writer/SKILL.md` matching the template classifies as `sync`.
- [ ] A `flow-sync/*` PR that adds `.claude/skills/my-own-skill/SKILL.md`, a name canonical does not ship, does not classify as `sync`.
- [ ] A test fails if `_flow-sync.yml`'s header lists a copied path that `SYNC_PR_PATHS` does not cover.
- [ ] `changes/flow-0128.md` exists, with no caller action.
