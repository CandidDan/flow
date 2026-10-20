---
id: "flow-0150"
title: "Workstreams, part 2: flow-doctor checks a workstream's shape and that intents name real ones (ADR-0009 §9)"
status: "blocked"
priority: 1
project: "flow"
owner: ""
created: "2026-10-20"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits on flow-0112 (the template and field these checks read)."
blocked_by: ["flow-0112"]
serves: ["G11"]
touches:
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "changes/flow-0150.md"
labels: [intent-layer, workstreams, flow-doctor]
notes:
  - "2026-10-20 (orchestrator, Dan approved): split from flow-0112, which failed twice unsplit. This is the mechanical half of ADR-0009 §9: facts, not judgement."
model: "opus"
model_reason: "one file plus its tests, after the split"
asks: []
---

## Context

ADR-0009 adds `.flow/workstreams/` and a `workstream:` field on intents (flow-0112 lays down the
template and field). flow-doctor can see neither. This task teaches it the checks that are pure
fact: is the file well-formed, is each id unique, does each intent's `workstream:` resolve. All
warn-only except duplicate ids, which match how duplicate intent ids are already treated.

## Scope

**Does**, in `project-template/.flow/bin/flow-doctor.mjs`, following the existing intent checks:
- No `.flow/workstreams/` directory → no finding at all, not even a repo-level warning.
- A workstream file with malformed frontmatter, or missing `id`, `title` or `created` → WARNING
  naming the file and the field.
- A workstream whose `id` does not equal its filename → WARNING.
- Two workstream files declaring one `id` → PROBLEM naming both files.
- An intent whose `workstream` names an id no workstream declares → WARNING naming the intent and
  the id. Empty or absent `workstream` → no finding.
- `_TEMPLATE.md` in the store is skipped, as it is for intents.

**Deliberately not in scope:** the goal, status and dependency warnings (the next task); any
change to templates or prose (flow-0112); reporting (flow-0113).

## Acceptance criteria

- [ ] Given a repo with no `.flow/workstreams/`, when flow-doctor runs, then it reports nothing
      about workstreams.
- [ ] Given a workstream file missing `title`, when flow-doctor runs, then it warns naming the
      file and `title`, and exits as it would without that file.
- [ ] Given a workstream file `a.md` declaring `id: "b"`, when flow-doctor runs, then it warns.
- [ ] Given two workstream files declaring the same `id`, when flow-doctor runs, then it reports
      a problem naming both.
- [ ] Given an intent with `workstream: "nope"` and no workstream `nope`, when flow-doctor runs,
      then it warns naming the intent and `nope`.
- [ ] Given an intent with `workstream: ""`, when flow-doctor runs, then no workstream finding
      is reported for it.
- [ ] Given only `.flow/workstreams/_TEMPLATE.md`, when flow-doctor runs, then it reports nothing.
- [ ] `changes/flow-0150.md` exists and states caller action: none.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
