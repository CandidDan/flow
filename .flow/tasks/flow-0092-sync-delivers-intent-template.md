---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0092"
title: "flow-sync delivers the intent template (and only the template) so every adopting repo can write intents"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-09-29"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G11"]
touches:
  - ".github/workflows/_flow-sync.yml"
  - ".flow/bin/sync-surface.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0092.md"
labels: [flow-sync, intent-layer]
notes:
  - "2026-09-29 (orchestrator): flow-0063/0073 ship `project-template/.flow/intents/_TEMPLATE.md`, but flow-sync never copies `.flow/intents/`, so an adopting repo only has the template if it was onboarded after flow-0063 or copied it by hand (the handoff lists 'copy the intent template in' as a manual step for TanPlan). flow-0072's intent-writer skill writes against that template. 2.1.1 made the template's own tests skip where it is absent; this task makes it present."
  - "2026-09-29 (orchestrator): ONLY THE TEMPLATE. `.flow/intents/` also holds the repo's own intents, which are per-repo data like `.flow/tasks/`. The sync copies exactly one file and never deletes or rewrites anything else in that directory."
---

## Context

flow-sync's copied surface is `.flow/bin/*`, the thin `flow-*.yml` callers, `.flow/PROTOCOL.md`
and `.flow/VERSION` (see `_flow-sync.yml`'s header). The intent template ships in
`project-template/.flow/intents/_TEMPLATE.md` but is outside that surface, so adopting repos
onboarded before flow-0063 never receive it, and the intent-writer skill (flow-0072) has nothing
to write against there.

## Scope

**Does:**

- Add `.flow/intents/_TEMPLATE.md` to flow-sync's copied surface, as a single file, creating
  `.flow/intents/` if absent. No `rsync --delete` on that directory.
- Update the "What it syncs" header of `_flow-sync.yml` and `docs/flow-reusable-workflows.md`.
- Changelog fragment `changes/flow-0092.md`. **Caller action:** expect the next sync PR to add
  `.flow/intents/_TEMPLATE.md`.

**Does not touch:** any other file in `.flow/intents/`, the template's content, flow-doctor.

## Acceptance criteria

- [ ] `sync-surface.test.mjs` asserts the surface includes `.flow/intents/_TEMPLATE.md` and no
      other path under `.flow/intents/`.
- [ ] Given a target repo with `.flow/intents/0001-x.md` and no template, when the copy step runs
      (exercised in isolation, as flow-0076's test does), then the template is added and
      `0001-x.md` is byte-identical afterwards.
- [ ] Given a target repo with no `.flow/intents/` directory, then the copy creates it with only
      the template.
- [ ] The copy never uses `--delete` (or equivalent) on `.flow/intents/` (structure test).
- [ ] The workflow header and `docs/flow-reusable-workflows.md` list the template in the surface.
- [ ] `changes/flow-0092.md` exists and states the caller action.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
