---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0073"
title: "Intent template, part 2: serves, supersedes, the [assumption] marker and the sections the interview needs"
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
serves: ["G11"]
touches:
  - "project-template/.flow/intents/**"
  - ".flow/intents/_TEMPLATE.md"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "changes/flow-0073.md"
labels: [intent-layer, store, flow-doctor]
notes:
  - "2026-09-24 (orchestrator): DEPENDS ON flow-0063, which is in progress. This task extends the intent `_TEMPLATE.md` files and the intent rules in flow-doctor that flow-0063 creates. If flow-0063 is not `done` when you pick this up, set this task `blocked` with `blocked_by: [\"flow-0063\"]`. Do not start from the draft's shape. Build on what flow-0063 merged, including its id/naming convention and the decisions in `docs/adr/0007-intent-layer.md`."
  - "2026-09-24 (orchestrator): ORIGIN. Written from `_private/intent-layer-drafts/intent-store.md` (2026-09-03), an earlier draft of the same store that flow-0063 superseded. The human chose (2026-09-24) to carry forward only what flow-0063 lacks. This task is that part, and only that part."
  - "2026-09-24 (orchestrator): DECIDED, dropped from the draft, do not reintroduce. (1) THE STORE-PLANE MOVE. The draft put intents on `main` and extended the store-guard to fail any PR touching `.flow/intents/`. That contradicts the draft's own 'approved by merging its PR', flow-0063's plane note (`plane-guard` STORE_PREFIX is deliberately `.flow/tasks/` only), and G11. Intents stay on the code plane. Do not touch `plane-guard`, `touches-guard` or PROTOCOL.md's store section. (2) THE `author` FIELD. flow-0063's `source` already records whose words the intent holds. A second field for the same question would drift from it. (3) THE `approved` DATE RULE. flow-0063 ships `approved_by`/`approved_at` unvalidated by design, and slice 4 (CI stamping on merge) owns filling them. (4) THE `tasks` BACK-LINK LIST. Slice 2 puts `intent:` on tasks. A list on the intent would be the same link stored in two places, and they would drift apart."
  - "2026-09-24 (orchestrator): DECIDED: EVERY NEW RULE HERE IS A WARNING, NOT A PROBLEM. flow-0063's ADR records 'no teeth in slice 1'. This task is still slice 1, so it inherits that budget. Teeth arrive with slice 2, when tasks start depending on intents. The one exception is presence of `[assumption]` lines: that is never reported at all, because an intent may be approved with assumptions still in it (that is why they are marked)."
  - "2026-09-24 (orchestrator): DECIDED: THE MARKER IS `[assumption]` AT THE START OF A LINE (a list item's text counts as the start). This replaces the `ASSUMED:` convention flow-0072 had defined, and flow-0072 has been updated to obey this template instead. Defining the marker in the template rather than the skill means a hand-written intent and a skill-written one look the same."
---

## Context

G11 (VISION.md): *work traces to a stated intent*. flow-0063 is slice 1 of the intent layer. It
adds the store, a template (`id`, `title`, `status`, `created`, `source`, `approved_by`,
`approved_at`, `evidence`, plus Problem and Outcome sections) and a warn-only validator. It
deliberately leaves out several things the interview skill (flow-0072) needs to write into:

- **A link to the vision.** Nothing ties an intent to a VISION goal, so the anchor stops at the
  task instead of reaching the intent.
- **A way to replace an intent.** An approved intent's body is never revised (flow-0063's ADR),
  so a changed mind has to be a new intent that names the one it replaces.
- **A marker for guesses.** The skill writes detail the human did not state. Without a marker,
  that guess reads exactly like something the human said, which is the fluency failure the intent
  layer exists to prevent.
- **Sections for the interview's answers.** There is no place for the cost of inaction (the
  skill's first question), constraints, or open questions.

## Scope

**Does:**

- Extend both intent templates (`project-template/.flow/intents/_TEMPLATE.md` and
  `.flow/intents/_TEMPLATE.md`, kept identical) with:
  - `serves: []`: VISION goal ids, with the same resolution rules and the same reserved
    `maintenance` id as a task's `serves`. The template comment says so and points at the task
    template's three-way rule for when nothing fits.
  - `supersedes: ""`: the id of the intent this one replaces, empty if none.
  - `status` guidance listing the allowed values `proposed`, `approved`, `superseded`. The
    template's own initial value is `proposed`.
  - A **Cost of inaction** section (what happens if we do not build this; a sentence is enough).
  - A **Constraints** section.
  - An **Open questions** section. Its guidance says open questions are surfaced, never resolved
    by a model, and that an empty section is a claim that nothing is uncertain.
  - Documentation of the **`[assumption]` marker**: a line beginning `[assumption]` is detail the
    human did not state, for the human to strike or keep. The Problem section holds only the
    human's words and never contains an assumption.
- Add one worked example intent to `project-template/.flow/intents/`, named by flow-0063's
  convention. It is filled in, `proposed`, with at least one `[assumption]` line and one open
  question. Precedent: the example task `project-template/.flow/tasks/0001-newsletter-signup.md`.
  Canonical's own `.flow/intents/` gets no example.
- Extend flow-doctor's intent rules. All of them are **warnings** (see notes):
  - An intent's `serves` names an id VISION.md does not declare → warning naming the file and
    the id.
  - No `VISION.md` → no per-intent `serves` warning. The existing single "vision layer is
    inactive" warning covers it, matching the task-side graceful-adoption behaviour.
  - `status` outside `proposed | approved | superseded` → warning naming the file and the value.
  - `supersedes` naming an id no intent declares → warning naming both.
  - `[assumption]` lines are never reported, whatever the intent's status.
- Write the changelog fragment `changes/flow-0073.md`.

**Does not touch:**

- `plane-guard`, `touches-guard`, `project-template/.flow/PROTOCOL.md` (see notes: no store-plane
  move).
- The task template, `pick-task.mjs`, or anything that puts `intent:` on a task (slice 2).
- `approved_by` / `approved_at` validation (slice 4).
- `docs/adr/0007-intent-layer.md`, `VISION.md`, and the intent-writer skill (flow-0072).
- Any existing field or rule flow-0063 shipped. This task only adds.

## Acceptance criteria

- [ ] Given both shipped intent `_TEMPLATE.md` files, when their frontmatter is parsed, then each
      contains `serves` as an empty list and `supersedes` as an empty string, and the two files
      are byte-identical.
- [ ] Given the shipped template, then it documents the `[assumption]` marker, lists the three
      `status` values, and has Cost of inaction, Constraints and Open questions sections. The
      Open questions guidance says questions are surfaced, never resolved.
- [ ] Given the worked example intent, when `flow-doctor` runs over the template repo, then it
      reports no problem and no warning for that file, and the file contains at least one
      `[assumption]` line and one open question.
- [ ] Given an intent whose `serves` names an id VISION.md does not declare, when `flow-doctor`
      runs, then it emits a warning naming the file and the id, and still exits 0.
- [ ] Given a repo with no `VISION.md` and an intent with a non-empty `serves`, when
      `flow-doctor` runs, then no intent-specific `serves` warning is emitted beyond the existing
      single vision-inactive warning.
- [ ] Given an intent with `status: done`, when `flow-doctor` runs, then it emits a warning naming
      the file and the value `done`.
- [ ] Given an intent whose `supersedes` names an id no intent declares, when `flow-doctor` runs,
      then it emits a warning naming the file and the missing id.
- [ ] Given an intent with `status: approved` containing `[assumption]` lines, when `flow-doctor`
      runs, then nothing is reported for those lines.
- [ ] Given `changes/flow-0073.md`, then it exists and describes the additions.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Doctor touches overlap with flow-0052 (`flow-doctor.mjs`). The flow-0063 dependency already
  sequences this task after 0063; if flow-0052 is `in_progress` when you pick this up, rebase onto
  it rather than working around it.
