---
id: "flow-0148"
title: "adopter-layout runs the synced tests against stubbed repo-owned files, so a test that reads one fails in canonical first"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-10-13"
started: ""
branch: ""
pr: ""
issue: "https://github.com/CandidDan/flow/issues/193"
blocked_reason: "Parked by queue cap at creation (Dan, 2026-10-13: p1/p2 first). Not machine-checkable: flip to ready when the ready count drops below the cap."
blocked_by: []
serves: ["G10"]
intent: ""
touches:
  - ".flow/bin/adopter-layout.test.mjs"
  - "changes/flow-0148.md"
labels: [testing, flow-sync, canary]
notes:
  - "2026-10-13 (orchestrator): ORIGIN flow#193. Twice (flow-0133, flow-0138) a synced test read a file adopters own and flow-sync does not deliver (CLAUDE.md, .flow/tasks/_TEMPLATE.md). It passed in canonical, because adopter-layout.test.mjs builds its fake adopter from the template's own copies, and went red in every adopter's 3.2.0 sync PR. Dan ruled 2026-10-13: write it, normal priority."
  - "2026-10-13 (orchestrator): DECIDED (the issue's open question): a NAMED list of repo-owned paths, not 'stub everything'. Stubbing every file would also stub ones flow-sync does deliver and hide nothing useful. Guard the list so it cannot drift: a test asserts each listed path is NOT among the paths `_flow-sync.yml` delivers (read from that workflow, the source adopter-layout's header already cites)."
---

## Context

`adopter-layout.test.mjs` simulates an adopting repo by copying the template, removing
`.flow/intents/` and filling config placeholders. Files an adopter owns and rewrites (its own
`CLAUDE.md`, its own `.flow/tasks/_TEMPLATE.md`) keep the template's content in that simulation,
so a synced test that reads them passes here and fails in the fleet.

## Scope

**Does:** in `buildAdopter()`, replace each path in a named `REPO_OWNED` list with a minimal stub
(content that is valid but shares nothing with the template's copy, e.g. a one-line
`# <repo> — adopter-owned` CLAUDE.md, and a `_TEMPLATE.md` with frontmatter keys only). Start the
list with `CLAUDE.md` and `.flow/tasks/_TEMPLATE.md`; add any other path the worker finds that
`_flow-sync.yml` does not deliver and a synced test reads. Add a test that every `REPO_OWNED` path
is outside `_flow-sync.yml`'s delivered set. Add a mutation check: a fixture synced test that reads
`CLAUDE.md`'s template-only text fails under the new layout. Changelog fragment, caller action none.

**Does not touch:** any synced test (if one now fails, that is the bug this task exists to find:
stop, set this task blocked naming it, and the orchestrator writes the fix), `_flow-sync.yml`,
`project-template/`.

## Acceptance criteria

- [ ] Given the simulated adopter, then each `REPO_OWNED` path holds the stub, not the template's content. Proved by `adopter-layout.test.mjs`.
- [ ] Given `REPO_OWNED`, then none of its paths is delivered by `_flow-sync.yml`. Proved by `adopter-layout.test.mjs`.
- [ ] Given a fixture synced test that asserts on template-only text in `CLAUDE.md`, when run in the simulated adopter, then it fails. Proved by `adopter-layout.test.mjs`.
- [ ] Given `changes/flow-0148.md`, then it exists and states the caller action (none). Proved by `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
