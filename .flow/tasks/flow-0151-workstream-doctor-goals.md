---
id: "flow-0151"
title: "Workstreams, part 3: flow-doctor flags a workstream with no goal, too many goals, an unknown status or a dangling dependency (ADR-0009 §9)"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-10-20"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G11"]
touches:
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "changes/flow-0151.md"
labels: [intent-layer, workstreams, flow-doctor]
notes:
  - "2026-10-20 (orchestrator, Dan approved): split from flow-0112. These are the warnings that keep workstreams honest against VISION.md (ADR-0009 §2, §3, §5). All warn-only."
model: "opus"
model_reason: "one file plus its tests, after the split"
asks: []
---

## Context

ADR-0009 says a workstream serves goals (usually one), may run with `serves: []` while exploring
but must not hide there, has a hand-set `status`, and may depend on another workstream. flow-0150
parses workstream files; this task adds the four warnings that make those rules visible.

## Scope

**Does**, in `project-template/.flow/bin/flow-doctor.mjs`:
- `serves: []` → WARNING "not tied to a goal".
- `serves` with 3 or more ids → WARNING "probably two workstreams".
- A `serves` id VISION.md does not declare → WARNING, with the same resolution rules (and the
  reserved `maintenance` id) as for intents. No VISION.md → no per-workstream finding.
- `status` outside `active | done | retired` → WARNING naming the allowed values. Absent → treated
  as `active`, no finding.
- A Dependencies bullet starting `workstream: <id>` naming an id no workstream declares →
  WARNING naming both.

**Deliberately not in scope:** anything flow-0150 checks; making any of these a PROBLEM (ADR-0007's
teeth budget); reporting (flow-0113).

## Acceptance criteria

- [ ] Given a workstream with `serves: []`, when flow-doctor runs, then it warns that the
      workstream is not tied to a goal, and does not fail.
- [ ] Given a workstream whose `serves` lists 3 goals, when flow-doctor runs, then it warns.
- [ ] Given a workstream serving `G99` that VISION.md does not declare, when flow-doctor runs,
      then it warns; serving `maintenance` raises nothing.
- [ ] Given `status: "paused"`, when flow-doctor runs, then it warns naming
      `active | done | retired`; given no `status`, nothing.
- [ ] Given a Dependencies bullet `workstream: no-such-id`, when flow-doctor runs, then it warns
      naming the workstream and `no-such-id`.
- [ ] Given a workstream that breaks none of these rules, when flow-doctor runs, then no
      finding from this task is reported for it.
- [ ] `changes/flow-0151.md` exists and states caller action: none.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
