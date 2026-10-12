---
id: "flow-0145"
title: "Compass and triage name their model with a full ID instead of running the CLI default"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-10-13"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Parked by queue cap at creation (Dan, 2026-10-13: p1/p2 first). Not machine-checkable: flip to ready when the ready count drops below the cap."
blocked_by: []
serves: ["G9", "G10"]
intent: ""
touches:
  - ".github/workflows/_flow-compass.yml"
  - ".github/workflows/_flow-triage.yml"
  - ".flow/bin/model-ids.test.mjs"
  - "changes/flow-0145.md"
labels: [cost, models]
notes:
  - "2026-10-13 (orchestrator): ORIGIN. flow-0140's follow-up ask: compass and triage pass no `--model`, so they run whatever claude-code-action's CLI defaults to, which can change under the pin. Dan approved writing it 2026-10-13."
  - "2026-10-13 (orchestrator): DECIDED, mirrors flow-0083 note (4) 'planning stays on the higher model': triage drafts tasks from issues, which is planning, so `claude-opus-5-5`; compass summarises drift against VISION.md, so `claude-sonnet-5-5`. Literals in the workflow, not config."
---

## Context

`_flow-compass.yml` (line ~84) and `_flow-triage.yml` (line ~573) call claude-code-action with
`claude_args: "--max-turns 150 --permission-mode bypassPermissions"` and no `--model`. Every other
Claude step in the reusables names a full model ID (flow-0140, flow-0143). These two run whatever the
CLI defaults to, so a pin bump can silently change their model and cost.

## Scope

**Does:** add `--model claude-sonnet-5-5` to compass's Claude step and `--model claude-opus-5-5` to
triage's. In `model-ids.test.mjs`, add an assertion that every Claude step in every
`PINNED_REUSABLES` file passes a literal `--model` full ID (if no such "must name a model" check
exists yet), with a mutation check that removing compass's flag fails naming the file and line.
Changelog fragment, caller action none.

**Does not touch:** the report steps, prompts, `--max-turns`, the callers, `_flow-review.yml`,
`_flow-kickback.yml`, `_flow-queue-runner.yml` (flow-0083 owns the runner's model).

## Acceptance criteria

- [ ] Given `_flow-compass.yml`, then its Claude step passes `--model claude-sonnet-5-5`. Proved by `model-ids.test.mjs`.
- [ ] Given `_flow-triage.yml`, then its Claude step passes `--model claude-opus-5-5`. Proved by `model-ids.test.mjs`.
- [ ] Given a copy of any pinned reusable with a Claude step whose `claude_args` has no `--model`, then the test fails naming the file and line.
- [ ] Given `changes/flow-0145.md`, then it exists and states the caller action (none). Proved by `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
