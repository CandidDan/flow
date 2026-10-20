---
id: "flow-0112"
title: "Workstreams, part 1: the store, its template and the `workstream:` field on intents (ADR-0009 §4)"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-10-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G11"]
touches:
  - "project-template/.flow/workstreams/_TEMPLATE.md"
  - "project-template/.flow/intents/_TEMPLATE.md"
  - ".flow/intents/_TEMPLATE.md"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/README.md"
  - "project-template/.claude/skills/vision-writer/SKILL.md"
  - ".flow/bin/workstreams-docs.test.mjs"
  - "changes/flow-0112.md"
labels: [intent-layer, workstreams]
notes:
notes:
  - "2026-10-01 (orchestrator): SEQUENCING, checked not asserted. touches overlaps flow-0074 and flow-0108 (project-template/.flow/bin/flow-doctor.mjs), flow-0072, flow-0074, flow-0090 and flow-0108 (project-template/.flow/PROTOCOL.md) and flow-0016 (project-template/README.md), per flow-doctor 2026-10-01. flow-doctor keeps this unclaimable while either is in_progress. No logical dependency on either: build against flow-doctor as it is on main when claimed. `.flow/bin/streams-docs.test.mjs` is canonical-only on purpose — it reads canonical's own ADR and its copy of the intent template, which an adopting repo does not have (the 2.1.1 lesson, adopter-layout.test.mjs)."
  - "2026-10-01 (orchestrator): ORIGIN. Dan built a workstreams view by hand for TanPlan (stream C, 'TanPlan Link', rows C-1..C-n). Reading it against the intent template: each row is an intent (an observable outcome in his words, with its why, approvable alone, 'not sliced' = approved with no tasks yet). The stream above the rows is a level Flow does not have. Dan confirmed 2026-10-01: a `stream:` field on intents plus a stream file."
model: "fable"
  - "2026-10-20 (orchestrator, Dan approved): RESCOPED AND SPLIT, answering the ask below. The unsplit task failed twice on the top tier. Decisions since 2026-10-01 are in ADR-0009 (PR #212), which is now its own PR, so this task no longer writes it. The term is `workstream` everywhere (was `stream`). flow-doctor's checks moved to two follow-up tasks, so this task touches no code: templates, one protocol paragraph, one skill paragraph, and a docs test."
  - "2026-10-20 (orchestrator): UNBLOCKED. ADR-0009 merged (PR #212); it is on main at docs/adr/0009-workstreams.md."
model: "opus"
model_reason: "reset after the 2026-10-20 split; both failures were on the unsplit task"
asks: []
---

## Context

ADR-0009 (PR #212) settles the workstream layer: a grouping of intents that serves VISION goals,
carries a purpose and has an end. Read it first; it is the spec. This task lays down only the
files: the store's template, the `workstream:` field on intents, and the prose that tells
operators and agents how the layer works. It changes no behaviour.

## Scope

**Does:**
- `project-template/.flow/workstreams/_TEMPLATE.md`, on the CODE plane like `.flow/intents/`
  (the store guard's `.flow/tasks/` prefix already leaves it alone). Frontmatter, each field
  commented the way the intent template comments its fields:
  `id` (kebab-case, equal to the filename), `title`, `created` (YYYY-MM-DD), `serves` (goal ids,
  same resolution rules as an intent's; usually one; `[]` allowed for exploration and flagged),
  `status` (`active | done | retired`, set by hand, default `active`), `owner` (optional).
  Body sections, each with a one-line instruction:
  - `## Purpose`: what this workstream delivers and when it is done, in the human's words.
  - `## Constraints`: boundaries every intent in it lives within, each citing its decision. A
    constraint true of one intent belongs on that intent.
  - `## Dependencies`: outside gates, each with a date and what slips if it is missed. A
    dependency on another workstream is a bullet starting `workstream: <id>`.
  - `## Open questions`: surfaced here, never resolved here.
- A `workstream: ""` field on the intent template, documented beside `serves`: one workstream per
  intent at most; empty means ungrouped and is never a finding. Added to **both**
  `project-template/.flow/intents/_TEMPLATE.md` and canonical's `.flow/intents/_TEMPLATE.md`,
  which stay identical.
- `project-template/.flow/PROTOCOL.md`: one short paragraph. What a workstream is; that merging its
  PR is its approval; that membership lives on the intent, never as a list on the workstream; that
  tasks never name one; that `status` is set by hand and progress is derived, never stored; that a
  repo with none is valid.
- `project-template/README.md`: one line listing `.flow/workstreams/` beside `.flow/intents/`.
- `project-template/.claude/skills/vision-writer/SKILL.md`: one paragraph. A workstream no goal
  covers is case (b) of the three-way test; the new goal and its change-log entry ship in the same
  PR as the workstream file (ADR-0009 §3).
- `.flow/bin/workstreams-docs.test.mjs` proving the criteria below.
- `changes/flow-0112.md`: caller action none (the store and field are optional).

**Deliberately not in scope:**
- **Any flow-doctor check.** Shape checks are the next task; goal, status and dependency warnings
  the one after. This task must leave `flow-doctor.mjs` untouched.
- **Editing ADR-0009.** It is fixed by PR #212. Cite it; do not change it.
- **Reporting** workstream state: flow-0113. **Rendering**: inflight.
- **Delivering the template to adopting repos** via flow-sync: a one-line follow-up after this
  lands (see flow-0092's "only the template" scope).

## Acceptance criteria

- [ ] Given `project-template/.flow/workstreams/_TEMPLATE.md`, when its frontmatter is parsed,
      then it declares `id`, `title`, `created`, `serves`, `status` and `owner`, and `status`
      defaults to `active`.
- [ ] Given the same template, when its body is read, then it has exactly the sections Purpose,
      Constraints, Dependencies and Open questions, in that order, and the Dependencies section
      documents the `workstream: <id>` bullet form.
- [ ] Given both intent templates, when parsed, then each declares a documented `workstream`
      field, and the two files are byte-identical.
- [ ] Given `project-template/.flow/PROTOCOL.md`, when read, then a workstreams paragraph states
      that merging the PR is the approval, that tasks never name a workstream, and that progress
      is derived while `status` is set by hand.
- [ ] Given the vision-writer skill, when read, then it says a workstream no goal covers adds the
      goal in the same PR, citing ADR-0009.
- [ ] Given `flow-doctor.mjs`, when diffed against main, then it is unchanged.
- [ ] `changes/flow-0112.md` exists and states caller action: none.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Decided

- 2026-10-01 (Dan): merging a workstream's PR is its approval; constraints are shown once, on the
  workstream; intents within it are ordered by `created`.
- 2026-10-17 to 2026-10-20 (Dan): everything in ADR-0009 — no vision of its own; serves goals;
  unplanned work adds a goal in the same PR; `status` and `owner`; the term `workstream`.
