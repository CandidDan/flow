---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0011"
title: "Ship the vision artifact and the skill that writes it, so a repo can have an anchor at all"
status: "done"
priority: 2
project: "flow"
owner: "claude/flow-0011-i70940"
created: "2026-08-18"
started: "2026-08-18T13:56:46Z"
branch: "claude/flow-0011-i70940"
pr: "https://github.com/CandidDan/flow/pull/14"
issue: ""
blocked_reason: ""
serves: ["G3"]            # direction survives the work — this is the anchor it survives against
touches: ["project-template/VISION.md", "project-template/.claude/skills/vision-writer/SKILL.md", "project-template/.flow/tasks/0001-newsletter-signup.md"]
labels: [infra, vision, adoption]
notes:
  - "2026-08-18: PR #14 open on branch claude/flow-0011-i70940. Eight of nine acceptance criteria are met and named to a proving test in .flow/bin/vision-template.test.mjs. The exception is criterion 4 (template flow-doctor CLI exits 0): it exits 1 because project-template/.flow/config.yml ships source_roots [{path: REPLACE-ME/}] as a deliberate placeholder, and a declared root not on disk is a flow-doctor PROBLEM. Pre-existing, unrelated to this change, and the config file is outside this task's touches — so it was NOT touched. The test instead asserts REPLACE-ME is the ONLY problem, that no problem mentions VISION/serves, and that the vision-layer-inactive warning is gone. Do not re-litigate this by widening scope; if the fixture should be fully green that is a new task calibrating the template's config.yml. Proving tests live in .flow/bin/ (not project-template/.flow/bin/, where they would ship downstream and fail once an adopter wrote their own vision); touches-guard excludes .flow/ by design and protocol-docs.test.mjs is the precedent. Next action: none — awaiting human review of PR #14."
  - "2026-08-18: deliverable D1 of the vision-layer handoff. Placement decided rather than left open — see Scope. Parallel-safe with flow-0010 and flow-0012; verified disjoint against every ready task on 2026-08-18."
---

## Context

`serves` resolves against something. This task ships that something: a one-page `VISION.md`
template, and the `vision-writer` skill that interviews a human into filling it in.

The skill matters more than the file. A vision written by reading the codebase describes the drift
rather than catching it — the layer then reports "on course" forever and has failed while looking
like it succeeded. So `vision-writer` is an extraction tool, not an authoring tool: it asks the
questions that surface what the human actually intends, and it never invents a goal or softens a
non-goal to keep options open.

The other load-bearing rule is that a vision change is always a branch and a PR, never a direct
commit. That is what makes evolution mechanically distinguishable from drift: divergence with a
reviewed vision change is evolution, divergence without one is drift. The vision lives at the repo
root — on the code plane — precisely so the existing PR machinery enforces this without carving an
exception into the store-plane rule.

## Scope

**Does:**

- Add `project-template/VISION.md`: purpose paragraph, `### G<n> — <title>` goals, `### NG<n> —
  <title>` non-goals, a `## Retired` section, and a change-log table. Placeholder content that
  demonstrates the shape, with comments explaining the id rules (append-only, never renumbered,
  retired ids stay reserved).
- Add `serves: ["G1"]` to `project-template/.flow/tasks/0001-newsletter-signup.md`. This is not
  cosmetic: the template's own doctor resolves its store to `project-template/.flow`, so shipping
  a `VISION.md` at `project-template/` activates the check over the sample store, and a `ready`
  sample task with no `serves` would fail it. The sample also becomes the field's worked example.
- Add `project-template/.claude/skills/vision-writer/SKILL.md`, following `task-writer`'s
  structure and voice, covering: where authority sits (the human owns every goal and non-goal);
  the create-mode interview; the amend mode; and the id rules.
- The interview must cover, at minimum: what this is and who for; the 3–6 outcomes that define
  success; the non-goals, pushed on explicitly because humans under-supply them; the audience as a
  **decision** (solo / team / product, and whether a multi-user option is preserved or foreclosed);
  and what "off course" would look like in six weeks.
- The retrofit warning is explicit in the skill: on an existing codebase, write the vision the
  human intends, not a description of what the repo currently is.
- The rejection test is explicit: could a stranger use this document to correctly reject a
  plausible-but-wrong feature idea? If not, sharpen the purpose paragraph or the non-goals.
- Output is always a branch and a PR titled `[vision] …`, never a commit to `main`, and the skill
  says so in its own words.

**Deliberately does NOT:**

- **Ship a `VISION.md` at canonical's root.** Already on `main` as of 2026-08-18; this task ships
  the *template's*.
- **Add the doctor check** (`flow-0010`) **or the `serves` field on `_TEMPLATE.md`**
  (`flow-0012`). Different files, different tasks, deliberately kept apart.
- **Write `RETROFIT-VISION.md`, or touch `INIT.md` / `RETROFIT.md`.** Those files are claimed by
  `flow-0005` and `flow-0006`; the adoption-runbook wiring is a follow-up once they land.
- **Teach `flow-init` to copy the vision template.** That is `flow-0005`'s surface.
- **Decide any consuming repo's actual goals.** The template ships placeholders. A vision with
  invented content would be the as-built failure mode shipped as a default.

## Acceptance criteria

- [ ] Given `project-template/VISION.md`, when its headings are read, then it contains at least
      one `### G<n> — ` goal and one `### NG<n> — ` non-goal in exactly that form, a `## Retired`
      section, and a change-log table with dated rows.
- [ ] Given `project-template/VISION.md`, when the goal-id extraction regex from `flow-0010`'s
      check is run over it, then every intended goal and non-goal id is extracted and none is
      missed — the shipped template cannot be a shape the checker can't read.
- [ ] Given `project-template/.flow/tasks/0001-newsletter-signup.md`, when its frontmatter is
      read, then `serves` names a goal id that exists in `project-template/VISION.md`.
- [ ] Given `project-template/.flow/bin/flow-doctor.mjs` run as a CLI against the template's own
      store after this change, then it exits 0 — proving the shipped fixture is self-consistent.
- [ ] Given `vision-writer`'s SKILL.md, when its create-mode procedure is read, then it requires
      the audience to be recorded as a decision, including whether a multi-user option is
      preserved or foreclosed.
- [ ] Given `vision-writer`'s SKILL.md, when it is read, then it states the retrofit warning
      (aspirational, not as-built) and the rejection test, each as an instruction rather than an
      aside.
- [ ] Given `vision-writer`'s SKILL.md, when its output step is read, then it requires a branch
      and a PR titled `[vision] …` and forbids committing `VISION.md` directly to `main`.
- [ ] Given `vision-writer`'s amend-mode procedure, when it is read, then it states that ids are
      append-only, that retiring a goal moves it to Retired with a reason and keeps the id
      reserved, that promoting a non-goal retires the NG id rather than converting it in place,
      and that every material edit appends a change-log row.
- [ ] Given the repo after this change, when `npm test`, `npm run lint` and `npm run build` run,
      then all three pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Placement was an open question in the handoff and is decided here:** ship it as
  `project-template/VISION.md` rather than `VISION.template.md`. The alternative avoids activating
  the check over the sample store but hands every new repo a file whose name it must know to
  rename. Adding `serves` to the sample task costs one line and turns the fixture into
  documentation. If a worker finds this wrong in practice, that is a `blocked` note, not a silent
  rename.
- The second criterion deliberately couples this task to `flow-0010`'s regex. If `flow-0010` has
  not landed, satisfy it against the regex as specified in that task's acceptance criteria and say
  so in the PR — the point is that the two cannot ship a shape mismatch between them.
- Canonical's own `VISION.md` is the worked example to imitate for tone, but not to copy: it is a
  real vision for a real repo, and the template's job is to show the shape without pre-loading
  anyone's goals.
