---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0012"
title: "Give every task a goal to name, so the anchor exists before the check enforces it"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-08-18"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G3"]            # direction survives the work — this is the field that carries it
touches: ["project-template/.flow/tasks/_TEMPLATE.md", "project-template/.claude/skills/task-writer/SKILL.md"]
labels: [infra, vision, docs]
notes:
  - "2026-08-18: deliverable D2 of the vision-layer handoff. flow-0010 carries the matching doctor check and explicitly excludes these two files, so the two are parallel-safe. Order does not matter: the check is graceful when a repo has no VISION.md, and the field is inert until a check reads it."
---

## Context

The vision layer's premise is that a task should name the goal it advances, so that drift is
visible at the planning altitude rather than discovered weeks later. `flow-0010` builds the check
that enforces it. This task builds the thing being checked: the `serves` field on the task
template, and the `task-writer` guidance that decides what goes in it.

Splitting them is deliberate. The check without the field is graceful (no `VISION.md` warns, never
fails); the field without the check is an unenforced convention, which the protocol's own thesis
says is a prompt asking nicely. Both land, in either order, and the layer is only real once they
have met.

The judgement this teaches matters more than the syntax. A task the orchestrator cannot assign a
goal to is one of three things — maintenance, a vision that is missing a goal, or drift being born
— and the honest move is to surface which, not to reach for the nearest plausible id. That is the
protocol's refuse-to-guess behaviour applied one altitude up from the worker.

## Scope

**Does:**

- Add `serves: []` to `project-template/.flow/tasks/_TEMPLATE.md`, positioned after
  `blocked_reason` and before `touches`, with a comment block stating: goal ids come from
  `VISION.md`; `maintenance` is a reserved id for repo/infra/protocol health; a `ready` task needs
  at least one entry once a `VISION.md` exists; and the three-way test above for a task that can't
  name a goal.
- Weave the matching guidance into `project-template/.claude/skills/task-writer/SKILL.md`, in its
  existing voice and structure rather than as a trailing section:
  - `VISION.md` joins the required reading in step 1, with an explicit note when it is absent
    (the layer is inactive and tasks are unanchored — say so to the human, don't go quiet).
  - A step that sets `serves` after acceptance criteria are written, carrying the three-way test.
  - The readiness question extends to: could a fresh session say, from the task alone, which goal
    the work serves?
  - Pre-flight gains a mechanical check that every entry resolves, and a note that a batch which
    is mostly `maintenance` is worth a sentence to the human before saving.
  - The triage Propose lane includes `serves` in proposed specs, and "close with one line saying
    why" gains a citable reason: no goal serves it.
  - The Don't list gains: don't retrofit `serves` onto in-flight or finished tasks.

**Deliberately does NOT:**

- **Add the doctor check.** That is `flow-0010`, on different files, deliberately kept apart.
- **Add `VISION.md` to the template repo, or the vision-writer skill.** That is `flow-0011`. This
  task's template comment may reference `VISION.md` before the template ships one — the reference
  is to the *consuming repo's* vision, which is where the file always lives.
- **Backfill `serves` onto canonical's own tasks.** Already done on `main`, 2026-08-18, and a PR
  cannot touch `.flow/tasks/` anyway.
- **Touch `project-template/CLAUDE.md`.** Claimed by `flow-0006`; the worker-facing line about
  `serves` passing through untouched belongs with that task's rewrite.

## Acceptance criteria

- [ ] Given `project-template/.flow/tasks/_TEMPLATE.md`, when its frontmatter is read, then it
      contains a `serves` key defaulting to an empty list, positioned between `blocked_reason` and
      `touches`, and the existing keys are otherwise unchanged in name and order.
- [ ] Given the template's `serves` comment block, when it is read, then it states all four of:
      ids come from `VISION.md`; `maintenance` is reserved; `ready` requires at least one entry
      when a `VISION.md` exists; and the three-way test for a task that cannot name a goal.
- [ ] Given `task-writer`'s procedure, when step 1 is read, then `VISION.md` is named as required
      reading alongside `_TEMPLATE.md` and `.flow/config.yml`, with the instruction to tell the
      human when it is absent.
- [ ] Given `task-writer`'s procedure, when it is read end to end, then there is a step that sets
      `serves` and it states the three-way test rather than instructing the orchestrator to pick a
      plausible goal.
- [ ] Given `task-writer`'s readiness test, when it is read, then it includes the question of
      whether a fresh session could name the served goal from the task alone.
- [ ] Given `task-writer`'s pre-flight checklist, when it is read, then it includes a mechanical
      `serves`-resolves check, and it names the doctor as the backstop rather than duplicating the
      doctor's rules.
- [ ] Given `task-writer`'s triage section, when the Propose lane is read, then a proposed spec
      includes `serves`, and the close-with-a-reason lane cites "no goal serves it" as a valid
      reason.
- [ ] Given `task-writer`'s Don't list, when it is read, then it forbids retrofitting `serves`
      onto tasks that are already in flight or finished.
- [ ] Given the repo after this change, when `npm test` and `npm run lint` run, then both pass —
      this task adds no executable surface and must not perturb the existing one.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **This task is prose, and canonical's Definition of Done asks for a proving test per criterion.**
  The honest reading: the criteria above are stated as observable properties of the two files, so
  the qa-verifier can check each by inspection and name the line that satisfies it. Do not invent
  a test that asserts on Markdown wording — it would pin prose to a regex and break on the next
  honest edit. If the verifier disagrees, that is a `blocked` conversation about how canonical
  gates documentation, not a reason to bolt on a brittle test.
- `_TEMPLATE.md` is being added to `flow-sync`'s copied surface separately (decision recorded in
  `docs/handoff-vision-layer-review.md` §10.6). This task ships the content; propagation is that
  change's job.
