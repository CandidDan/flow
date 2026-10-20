# ADR-0009: Workstreams: a grouping of intents that serves goals, carries a purpose and has an end

**Status:** Proposed — accepted when this PR merges
**Date:** 2026-10-20
**Deciders:** Dan (inspirator / sole maintainer)

## Context

Real plans group intents. Dan built a workstreams view for TanPlan by hand (stream C, "TanPlan
Link", rows C-1..C-n). Each row is an intent. The group above the rows has no home in Flow: it
carries a purpose, constraints, dated dependencies and open questions that none of its intents
should repeat.

Dan's sketch (2026-10-17) set out the hierarchy he wants Flow and inflight to support:

```
Vision
 └─ Workstream (name + "vision")      ← shareable with non-technical stakeholders
     └─ Intent                         ← shareable
         └─ Task                       ← operator and agents only
```

with two notes: "a small project may only have a single workstream" and "this should be
shareable to non-tech stakeholders to track".

The sketch leaves out goals, and it gives each workstream a vision of its own. Both points needed
settling before anything is built, because they decide what a workstream is allowed to say.

**What this ADR does not reopen.** ADR-0004 (vision layer) and ADR-0007 (intent layer) stand in
full. Intents stay the unit a human approves. Tasks stay the unit of work. ADR-0001's one queue is
untouched: nobody works from a workstream.

## Decision

### 1. The hierarchy

```
VISION.md ── goals G1..Gn            why; long-lived; no finish line
     ▲ serves (1, rarely more)
Workstream ── purpose, constraints,  what this body of work delivers; has an end;
              dependencies, status   may run in parallel with others
     ▲ workstream:
Intent ────── one approved outcome
     ▲ intent:
Task ──────── one unit of work
```

Arrows point from child to parent. Membership lives on the child (`workstream:` on an intent),
never as a list on the parent, so it has one source of truth.

### 2. A workstream has no vision of its own. It serves goals.

The "why" lives in VISION.md and only there. A workstream says which goals it serves (`serves:`,
same resolution rules as an intent's) and carries a **purpose**: what it delivers and when it is
finished. The two are deliberately different words:

| | Goal | Workstream purpose |
|---|---|---|
| Answers | Why | What this chunk of work delivers |
| Lifespan | Long-lived, no finish line | Ends when delivered |
| Example | "A salon outside the UK runs its whole business on TanPlan" | "Launch AU. Done when the first AU salon is live." |

### 3. Work that fits no goal amends the vision first, in the same PR

When a workstream arrives that no goal covers (example: TanPlan multi-territory, which came from
salon feedback and was never in the vision), the existing three-way test applies: maintenance,
missing goal, or drift. A missing goal is added to VISION.md, with a change-log entry naming the
source, **in the same PR as the workstream file**. Merging that PR approves both. That is one
decision, not two (G12).

The vision records what has been decided, not what was predicted. Feedback-driven change is the
normal way a goal gets added, and the change log is how a stakeholder sees that the plan moved
because customers asked rather than because it drifted.

### 4. The workstream file

`.flow/workstreams/<id>.md`, on the CODE plane like `.flow/intents/`. Merging its PR is its
approval.

```yaml
id: ""          # kebab-case, equal to the filename
title: ""
created: ""     # YYYY-MM-DD
serves: []      # goal ids. Usually one. [] allowed for exploration, but flagged
status: active  # active | done | retired, set by hand
owner: ""       # optional
```

Body sections: **Purpose**, **Constraints**, **Dependencies**, **Open questions**.

A dependency may name another workstream by id (workstreams can run in parallel and sometimes
wait on each other). It is written as a Dependencies bullet starting `workstream: <id>`.

### 5. `status` is stored, by hand. Progress is derived.

This reverses the 2026-10-01 decision ("no `status` field, not even paused", recorded in
flow-0112's "Decided" section before its 2026-10-20 rescope). Reason: whether a
workstream is *finished* or *abandoned* is a human call that cannot be derived. "Every intent is
done" is not the same as "this workstream is finished" (more intents may be coming), and retiring
one is a decision, not an observation. Progress (how many intents done, in progress, blocked) is
still derived by `flow-state` and never stored.

### 6. One term, `workstream`, everywhere

Field `workstream:`, directory `.flow/workstreams/`, label "Workstream" in inflight. It is the
word Dan reached for unprompted, it is standard language for the non-technical readers this layer
exists for, and it carries the meaning that workstreams can run in parallel. The 2026-10-01 draft
used `stream`; that is superseded.

### 7. Optional, and a project with none still renders

Workstreams are optional. A repo with no `.flow/workstreams/` gets no finding at all. Readers
(flow-state, inflight) show such a project as one implicit workstream named after the project, so
a small project never needs a workstream file. In a repo that has workstreams, an intent with no
`workstream:` is never a finding; readers show it under "Not in a workstream".

### 8. Where the stakeholder boundary sits

Vision, goals, workstreams and intents are readable by non-technical stakeholders (inflight
`client-reads-the-plan`). Tasks are not shown to them.

### 9. Checks: warnings, plus one fact-check (ADR-0007's teeth budget)

Every check is a WARNING except duplicate ids, which is a PROBLEM exactly as a duplicate intent id
is under ADR-0007: it is a fact, and it cannot fail a repo that was passing, because no repo has
workstreams yet. Unlike intents, malformed frontmatter and missing fields only warn here. That is
deliberate: the layer is optional, so a half-written workstream should not stop a repo's gate.

| Condition | Finding |
|---|---|
| No `.flow/workstreams/` | None |
| Malformed frontmatter, or missing `id` / `title` / `created` | WARNING naming file and field |
| `id` differs from the filename | WARNING (unlike intents, where ADR-0007 left it unchecked) |
| Two workstreams with one id | PROBLEM, as for duplicate intent ids |
| Intent's `workstream:` names an unknown id | WARNING naming both |
| `serves: []` | WARNING: "not tied to a goal" |
| `serves` lists 3 or more goals (1 or 2 pass silently) | WARNING: probably two workstreams |
| `status` outside `active / done / retired` | WARNING |
| Dependency names an unknown workstream id | WARNING |

## Rejected alternatives

- **A workstream carries its own vision** (the sketch as drawn). Rejected: every workstream would
  become a way around VISION.md, goals would stop meaning anything, and a stakeholder reading the
  vision would find it explained only part of the work.
- **A workstream is a VISION.md goal.** Rejected: goals have no finish line; workstreams do.
  Putting workstreams in VISION.md would churn the drift anchor each time a plan moved.
- **A workstream is a parent intent.** Rejected: an intent is approved as one outcome. "TanPlan
  Link" is not one outcome.
- **A free-form tag on intents, no file.** Viable fallback if workstreams turn out to hold one
  intent each. Rejected for now: shared constraints and dated dependencies need a home.
- **Tasks name a workstream directly.** Rejected: it bypasses the intent, the thing a human
  approved.
- **Workstream lists its intents.** Rejected: two sources of truth for membership.
- **Workstream progress stored.** Rejected: derivable, so storing it only lets it go stale.
- **Other names.** `stream` (clashes with code meaning, reads as a pun on Flow), `initiative`
  (strongest alternative: a bounded push serving an objective, but loses "in parallel" and is not
  the word Dan uses), `epic` (Jira baggage), `theme` (no finish line, so it is a goal),
  `project` (the repo is the project), `track` (says nothing).

## Consequences

- TanPlan's hand-built workstreams view has a home, and inflight can render it from files.
- Adding a direction the vision did not foresee costs one PR, and leaves a dated record of why.
- Adopting repos stay green: no check can fail a repo that was passing, and the layer is optional.
- flow-0112 ("streams") is rescoped to this ADR and split in three: the store and templates
  (flow-0112), flow-doctor's shape checks, and flow-doctor's goal/status/dependency warnings. The
  unsplit task failed twice on the top model tier; its own ask recommended splitting.
- flow-state reports workstreams with derived progress; inflight shows `status` and `owner`.

## What would void this decision

- **Workstreams with `serves: []` pile up instead of being resolved.** The escape hatch has become
  the default; make it fail, or drop it.
- **Most workstreams serve three or more goals.** Either the goals are too fine-grained or
  workstreams are being used as themes.
- **Most workstreams hold one intent.** Fall back to a tag on intents.
- **Workstream files start being worked from directly.** The one-queue invariant (ADR-0001) is
  being lost.
- **A second person joins.** ADR-0004's void condition for a second operator applies unchanged.
