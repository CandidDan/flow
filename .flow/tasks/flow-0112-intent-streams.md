---
id: "flow-0112"
title: "Streams: group intents under a stream that carries their shared purpose, constraints and dependencies"
status: "ready"
priority: 3
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
  - "project-template/.flow/streams/_TEMPLATE.md"
  - "project-template/.flow/intents/_TEMPLATE.md"
  - ".flow/intents/_TEMPLATE.md"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/README.md"
  - "docs/adr/0009-streams.md"
  - ".flow/bin/streams-docs.test.mjs"
  - "changes/flow-0112.md"
labels: [intent-layer, streams, flow-doctor]
notes:
  - "2026-10-01 (orchestrator): SEQUENCING, checked not asserted. touches overlaps flow-0074 and flow-0108 (project-template/.flow/bin/flow-doctor.mjs), flow-0072, flow-0074, flow-0090 and flow-0108 (project-template/.flow/PROTOCOL.md) and flow-0016 (project-template/README.md), per flow-doctor 2026-10-01. flow-doctor keeps this unclaimable while either is in_progress. No logical dependency on either: build against flow-doctor as it is on main when claimed. `.flow/bin/streams-docs.test.mjs` is canonical-only on purpose — it reads canonical's own ADR and its copy of the intent template, which an adopting repo does not have (the 2.1.1 lesson, adopter-layout.test.mjs)."
  - "2026-10-01 (orchestrator): ORIGIN. Dan built a workstreams view by hand for TanPlan (stream C, 'TanPlan Link', rows C-1..C-n). Reading it against the intent template: each row is an intent (an observable outcome in his words, with its why, approvable alone, 'not sliced' = approved with no tasks yet). The stream above the rows is a level Flow does not have. Dan confirmed 2026-10-01: a `stream:` field on intents plus a stream file."
---

## Context

An intent is the unit a human approves: one observable outcome, in their words, with the reason
it is worth having. Real plans group intents. The TanPlan workstreams view groups four or more
intents under "TanPlan Link", and the group carries things none of its intents should have to
repeat: a one-line purpose, constraints that cite decisions, an open question, and a dependency
with a date on it ("C-2 onward needs the bench rig and a Pi Zero 2 W, ordered by 1 October").

Flow has no home for that layer today. It is not a VISION.md goal: goals are long-lived product
aims, and a stream has a finish line. It is not an intent either: nobody approves "TanPlan Link"
as one outcome. Without a home, the shared context gets copied into every intent and drifts, or
it lives only in a hand-built page and is lost.

This task gives it a home and changes nothing else. Intents stay the approved unit. A stream is
grouping and shared context, never a unit of work and never something a task names.

## Scope

**Does:**
- Add `.flow/streams/`, on the CODE plane like `.flow/intents/` (a stream arrives by PR; the store
  guard's `.flow/tasks/` prefix already leaves it alone).
- Add `project-template/.flow/streams/_TEMPLATE.md` with frontmatter `id` (kebab-case slug, equal
  to the filename), `title`, `created`, optional `serves` (same resolution rules as an intent's), and
  four body sections:
  - `## Purpose`: one or two lines in the human's words. What this group of intents is for.
  - `## Constraints`: boundaries every intent in the stream lives within. The template says that
    a constraint true of only one intent belongs on that intent.
  - `## Dependencies`: external gates, each with the date by which it must clear and what slips if
    it does not.
  - `## Open questions`: same rule as the intent template (surface them, never resolve them).
- Add an optional `stream: ""` to the intent template, documented beside `serves`. One stream per
  intent at most. Empty means ungrouped and is never a finding.
- `flow-doctor`, **warn-only** in line with ADR-0007's teeth budget:
  - no `.flow/streams/` → nothing at all (streams are optional; no repo-level warning either);
  - a stream file with malformed frontmatter or a missing required field (`id`, `title`,
    `created`) → WARNING naming the file;
  - two streams declaring one id → PROBLEM, matching how duplicate intent ids are treated;
  - an intent whose `stream` names an id no stream declares → WARNING naming both.
- `PROTOCOL.md` gets one short paragraph: what a stream is, that merging its PR is its approval,
  that tasks never name one, and that
  stream status is derived (see flow-0113) and never stored.
- `docs/adr/0009-streams.md`: the decision, with the rejected alternatives below.

**Deliberately not in scope:**
- **Any stored status on a stream.** "Done" for a stream is derived from its intents, and theirs
  from the tasks that name them. Storing it creates a second source of truth (ADR-0007, §2).
- **Merge surface and migration range.** Both appear in the TanPlan view, and both are orchestrator
  planning data derivable from task `touches` and allocations. A client reader does not need
  them. If they are wanted, they belong in an operator view computed from tasks.
- **A decisions or questions register** (the D-040 / Q-014 references in the TanPlan view). Flow
  has nowhere to record decisions in an adopting repo. That is real, and it is G12's territory
  (decision cards), not this task's.
- **Delivering the stream template to adopting repos.** flow-0092 delivers the intent template
  "and only the template". Extending sync to carry `streams/_TEMPLATE.md` is a one-line follow-up
  once this lands; do not widen this task to do it.
- **Reporting or rendering stream state.** Reporting is flow-0113 (`flow-state`), which depends on
  this one. Rendering is inflight's (`inflight-client-reads-the-plan.md`).

## Acceptance criteria

- [ ] Given a repo with no `.flow/streams/` directory, when `flow-doctor` runs, then it reports no
      finding about streams at all (warning or problem).
- [ ] Given a stream file missing `title`, when `flow-doctor` runs, then it warns naming the file
      and the missing field, and does not fail.
- [ ] Given two stream files declaring the same `id`, when `flow-doctor` runs, then it reports a
      problem naming both files.
- [ ] Given an intent with `stream: "tanplan-link"` and no stream declaring that id, when
      `flow-doctor` runs, then it warns naming the intent and the unresolved stream id.
- [ ] Given an intent with `stream: ""` or no `stream` field, when `flow-doctor` runs, then no
      stream finding is reported for it.
- [ ] Given `project-template/.flow/streams/_TEMPLATE.md`, when `.flow/bin/streams-docs.test.mjs`
      parses it, then it carries the
      fields `id`, `title`, `created`, `serves` and the four sections Purpose, Constraints,
      Dependencies and Open questions.
- [ ] Given both intent templates (`project-template/` and canonical's `.flow/intents/`), when
      `.flow/bin/streams-docs.test.mjs` parses them, then each carries a documented `stream` field
      and the two files are byte-identical.
- [ ] Given `docs/adr/0009-streams.md`, when `.flow/bin/streams-docs.test.mjs` reads it, then it
      names each of the four rejected alternatives listed below with a reason.
- [ ] `changes/flow-0112.md` exists and states the caller action (none: the field and the store are optional) — proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Rejected alternatives (for the ADR)

- **A stream is a parent intent.** Rejected: an intent is approved as one outcome. "TanPlan Link"
  is not one outcome, and approving it as one makes the approval meaningless.
- **A stream is a VISION.md goal.** Rejected: goals are long-lived and stream boundaries move
  with deadlines. Putting them in VISION.md would churn the drift anchor every time a plan changed.
- **A free-form `tag` on intents, no stream file.** Viable, and the fallback if streams turn out to
  hold one intent each. Rejected for now because the shared constraints and dated dependencies
  need a home, and a tag has none.
- **Tasks name a stream directly.** Rejected: it bypasses the intent, which is the one thing a
  human approved.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Decided (Dan, 2026-10-01)

- **A stream is approved the way an intent is: merging its PR is the approval.** Its constraints
  bind every intent in it, so they need sign-off. No `approved_by` / `approved_at` fields now;
  when ADR-0007's slice 4 (CI stamps the approval on merge) is built, it covers streams too.
- **No `status` field, not even "paused".** A paused stream is one whose intents have no active
  tasks, which is derivable. Revisit only if a stream ever needs pausing while it still has
  `ready` tasks.
- **A stream's constraints are reported and shown once, on the stream,** never repeated under each
  intent.
- **Intents within a stream are ordered by their `created` date.** No ordering field.
