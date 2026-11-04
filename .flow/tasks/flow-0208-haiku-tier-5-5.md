---
id: "flow-0208"
title: "The haiku tier runs on Haiku 5.5, not Haiku 4.5, so it matches the other tiers' current models"
status: "in_review"
priority: 2
project: "flow"
owner: "session_01NfrcUBhLpiVaHLdtT7wJBf"
created: "2026-11-04"
started: "2026-11-04T00:03:33Z"
branch: "flow/flow-0208-haiku-tier-5-5"
pr: "https://github.com/CandidDan/flow/pull/288"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/task-model.mjs"
  - "project-template/.flow/bin/task-model.test.mjs"
  - "changes/flow-0208.md"
labels: [models]
model: ""
effort: ""
model_reason: ""
notes: []
asks:
  - "fyi: PR 288 code-review (non-blocking) - the old-id sweep test ships to adopters and scans their whole repo, so an adopter file naming the old haiku id turns their npm test red after sync. Left as the task specified; scope the sweep to Flow-owned paths if that bites."
---

## Context

`project-template/.flow/bin/task-model.mjs` holds `TIERS`, the only table in Flow that turns a
tier name into a model ID. Three tiers name current models (`claude-sonnet-5-5`,
`claude-opus-5-5`, `claude-fable-5-1`). The fourth, `haiku`, still names
`claude-haiku-4-5-20251001`, which is Haiku 4.5. The current Haiku is Haiku 5.5, whose ID is
`claude-haiku-5-5`.

Anything that resolves the `haiku` tier gets the old model: a task with `model: "haiku"`, a
routine created from that tier (`docs/flow-routines.md`), and flow-0207's PR-text judge, which
defaults to `TIERS.haiku`.

## Scope

- In `task-model.mjs`, set `TIERS.haiku` to `claude-haiku-5-5`.
- In `task-model.test.mjs`, update the pinned table in the test "TIERS maps the four tiers to
  full model IDs, in escalation order".
- Changelog fragment `changes/flow-0208.md`. Caller action: none; the next flow-sync delivers it.
  Say that a task set to `model: "haiku"` builds on Haiku 5.5 from then on, and that a routine an
  adopter created for the haiku tier names its model itself, so its owner should switch that
  routine to Haiku 5.5 by hand.

**Does not touch:** the fixture string `claude-haiku-4-5` in `.flow/bin/model-ids.test.mjs`
(it is test data for reading model names from a run log, not a tier); the other three tiers; the
escalation order; any task file.

## Acceptance criteria

- [ ] Given `TIERS`, then `haiku` is `claude-haiku-5-5` and the other three entries and the order
      are unchanged. Proved by `task-model.test.mjs :: TIERS maps the four tiers to full model IDs, in escalation order`.
- [ ] Given a task with `model: "haiku"`, then `resolve` returns id `claude-haiku-5-5`. Proved by
      a test in `task-model.test.mjs`.
- [ ] No file outside `.flow/tasks/`, `CHANGELOG.md`, `changes/` and test fixtures still names
      `claude-haiku-4-5-20251001`. Proved by a test in `task-model.test.mjs` that searches the
      tracked files.
- [ ] `changes/flow-0208.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
