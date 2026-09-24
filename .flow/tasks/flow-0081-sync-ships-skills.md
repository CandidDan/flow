---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0081"
title: "flow-sync ships the template's skills, so AGENTS.md never points an adopter at a skill it doesn't have"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-24"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # sync delivery health; no live VISION goal names it (same anchor as flow-0075)
touches:
  - ".github/workflows/_flow-sync.yml"
  - ".flow/bin/sync-surface.test.mjs"
  - ".flow/bin/sync-skills.test.mjs"
  - "changes/flow-0081.md"
labels: [infra, sync]
notes:
  - "2026-09-24 (orchestrator): Reported during a 1.x → 2.0.0 migration as 'AGENTS.md points at a skill that doesn't exist'. The skill does exist, at project-template/.claude/skills/vision-writer/; the defect is that flow-sync's surface (bin + callers + PROTOCOL.md + VERSION) never carries .claude/skills/. Fix it in sync; the AGENTS.md pointer is correct and stays."
  - "2026-09-24 (orchestrator): Overlaps flow-0075 (in_progress) and flow-0076 on _flow-sync.yml; pick-task sequences them. Rebase onto whichever lands first."
---

## Context

The template ships four skills under `project-template/.claude/skills/`: `task-writer`,
`vision-writer`, `board-builder` and `flow-compass`. `AGENTS.md` and `PROTOCOL.md` tell agents
to read them by path. `flow-init` copies them once, at adoption, and `flow-sync` never touches
them again. So:

- a repo adopted before a skill existed never gets it: `vision-writer` is missing in repos that
  predate it, and `AGENTS.md` points at a file that isn't there;
- a skill fixed in canonical (the `task-writer` changelog-fragment rule, for example) never
  reaches the fleet.

This is the same shape of bug flow-0048 fixed for `PROTOCOL.md`.

## Scope

**Does:**

- Add each **canonical-named** skill directory (every directory under
  `project-template/.claude/skills/`) to flow-sync's surface. Each is replaced wholesale in the
  adopting repo, so a deleted file in canonical is deleted downstream too.
- Leave every other directory under the adopter's `.claude/skills/` untouched. A project's own
  skills are its own.
- Never touch `.claude/settings.json` or `.claude/settings.local.json`. Those are project-owned.
- Add a comment in `_flow-sync.yml` next to the new copy step: canonical-named skill directories
  are canonical's, and a local edit to one is overwritten by the next sync, in the same way as
  `.flow/bin/`.
- Changelog fragment `changes/flow-0081.md`. Caller action: none (the surface is in the reusable).

**Does not touch:**

- `AGENTS.md` or `PROTOCOL.md`.
- Retiring `board-builder` (flow-0022 owns that; when it lands, the skill leaves the template and
  so leaves the sync surface automatically).
- `.claude/agents/`.

## Acceptance criteria

- [ ] Given an adopter with no `.claude/skills/`, when the sync step runs against canonical, then
      every skill directory in `project-template/.claude/skills/` exists in the adopter,
      byte-identical to canonical.
- [ ] Given an adopter with its own `.claude/skills/my-skill/`, when the sync step runs, then
      `my-skill/` is unchanged.
- [ ] Given an adopter whose `task-writer/SKILL.md` differs from canonical's, when the sync step
      runs, then it matches canonical's afterwards and the path appears in the sync PR's list of
      changed files.
- [ ] Given an adopter with `.claude/settings.json`, when the sync step runs, then the file is
      unchanged.
- [ ] Given the template's `AGENTS.md`, then every `.claude/skills/*/SKILL.md` path it names is
      present in the synced surface. Proved by a test that parses `AGENTS.md` for skill paths, so
      a future pointer to an unsynced skill fails the gate.
- [ ] Given `changes/flow-0081.md`, then it exists and states "caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

None.
