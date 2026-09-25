---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0072"
title: "intent-writer skill: interview a human into an intent, open the PR, stop"
status: "in_progress"
priority: 3
project: "flow"
owner: "claude-worker-flow-0072"
created: "2026-09-24"
started: "2026-09-25T12:30:03Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G11"]
touches:
  - "project-template/.claude/skills/intent-writer/**"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/README.md"
  - ".flow/bin/intent-writer-skill.test.mjs"
  - "changes/flow-0072.md"
labels: [skills, intent-layer]
notes:
  - "2026-09-24 (orchestrator): DEPENDS ON flow-0063 (intent store + template). This is slice (3) of the four-slice intent layer that flow-0063's notes lay out. The skill writes files into `.flow/intents/` using the template flow-0063 ships, and must match its frontmatter (`id`, `title`, `status`, `created`, `source`, `approved_by`, `approved_at`, `evidence`). It ALSO DEPENDS ON flow-0073, which adds `serves`, `supersedes`, the Cost of inaction / Constraints / Open questions sections and the `[assumption]` marker to that template. If either is not `done` when you pick this up, set this task `blocked` with `blocked_by` listing whichever are outstanding (for example `[\"flow-0063\", \"flow-0073\"]`) rather than guessing the template's shape. Same pattern as flow-0070's dependency on flow-0069."
  - "2026-09-24 (orchestrator): DECIDED (revised the same day): THE ASSUMPTION MARKER IS THE TEMPLATE'S `[assumption]`. This note first defined an `ASSUMED:` convention local to this skill, because flow-0063 has no marker. flow-0073 now puts `[assumption]` at the start of a line into the intent template, so a hand-written intent and a skill-written one look the same. The skill obeys the template's marker and does not define its own."
  - "2026-09-24 (orchestrator): DECIDED: THE REJECTION TEST IS NOT vision-writer's TEST. The draft said to 'port vision-writer's wording down'. But vision-writer step 6 checks whether the *document* rejects a plausible-but-wrong *feature idea*. Here the *human* rejects plausible-but-wrong *readings of their own answers*. They are related but different tests. Borrow vision-writer's tone and its 'try one out loud' move, but state intent-writer's test in its own words. Do not copy step 6 verbatim."
  - "2026-09-24 (orchestrator): DECIDED: FILE NAMING AND id. Follow whatever flow-0063's template and `docs/adr/0007-intent-layer.md` specify. If they specify neither, the skill writes `.flow/intents/<slug>.md` with `id` equal to the slug, `status` as the template's initial status, and `source` naming the human interviewed. Intents are on the code plane (`plane-guard` STORE_PREFIX is `.flow/tasks/` only; see flow-0063 notes), so a branch + PR is correct and passes the store-guard."
  - "2026-09-24 (orchestrator): the changelog entry is a fragment, `changes/flow-0072.md` (flow-0069's convention). Do not edit CHANGELOG.md. The source draft predates flow-0069 and listed CHANGELOG.md in touches."
  - "2026-09-24 (orchestrator): noticed, not in scope: `project-template/README.md` lists only task-writer and board-builder under skills. vision-writer and flow-compass are missing too. Add intent-writer only. Fixing the others is a separate task."
---

## Context

G11 (VISION.md): *work traces to a stated intent*. The Purpose paragraph now reads "approve the
intent, approve the merge", and flow-0063 gives intents a store and a template. Nothing yet helps
a human *produce* an intent that really holds their words. This skill fills that gap.

An intent a model writes from the repo repeats the failure `vision-writer` exists to prevent, one
level down: it describes what the codebase already implies, not what a human wanted.
`vision-writer` is the precedent to follow. It extracts rather than authors: the human owns the
content and the skill owns the shape. Its output is always a branch and a PR, and the merge is the
approval.

The failure this skill defends against is **fluency**. A model writes a well-formed intent, and it
reads as correct. The human skims it and approves. The gap between what they meant and what the
page says survives into the audit trail. That is worse than having no artefact, because everything
downstream treats it as authoritative. VISION.md's change log records this exact failure one level
up, in the retired G1–G5. Asking the human to "correct anything the model misunderstood" is the
weakest possible check. A tired reader cannot reliably spot a subtle mismatch in fluent prose they
did not write.

Design principle: **make the human reject, not approve.** Skimming is enough to approve something,
but not to reject a specific reading.

## Scope

**Does:**

- Add `project-template/.claude/skills/intent-writer/SKILL.md`. Model its structure and voice on
  `project-template/.claude/skills/vision-writer/SKILL.md`.
- **Four questions, and only four.** A long intake brings back what Flow's Purpose paragraph was
  written to remove, and it is how humans stop writing intents. Each question below covers
  something that is expensive to get wrong and cheap to check. Everything else is guessed visibly
  (next bullet) rather than asked.
  1. **The counterfactual, first.** "What happens if we do not build this? What would you do
     instead?" A real intent has a cost of inaction the human can state in a sentence. This is the
     cheapest filter, and it kills more bad intents than the other three combined.
  2. **The observable.** "How would someone outside know this worked?" If there is no answer, the
     intent is not ready. Record that as an open question; do not paper over it.
  3. **The boundary.** "What should this deliberately not do?" Unstated boundaries are where
     intents rot into scope creep.
  4. **The rejection test.** Offer two or three plausible-but-wrong readings of what the human
     said, and ask which are wrong and why. This is the step that defeats fluency. Picking out the
     wrong reading forces the human to think about the right one, and skimming cannot fake that.
     It is a required step, not an aside (see notes for how it differs from vision-writer's test).
- **Everything not asked is a marked assumption, never a silent fill.** Affected systems, likely
  approach, and unstated constraints are written as lines beginning `[assumption]`, the marker
  the intent template defines (flow-0073; see notes). The human strikes what is wrong instead of having to notice what is
  missing. An unmarked guess is the fluency failure in miniature.
- **The skill may surface open questions. It may never resolve one.** A question the model
  resolves looks exactly like one the human decided, so the drift is invisible in the output. An
  intent with three honest open questions is more useful than one that answered them for the human.
- **`serves`:** ask the human which VISION goal this advances. If none fits, apply the three-way
  rule already in `project-template/.flow/tasks/_TEMPLATE.md` and `task-writer/SKILL.md`: it is
  maintenance, the vision needs amending first, or this is drift being born. Say which case
  applies. Never reach for the nearest plausible id.
- **Output is a branch and a PR** titled `[intent] <what we want>`, never a direct commit to `main`.
  The skill stops once the PR is open. The human's merge is the approval, and it is touchpoint 1.
- **No task.** The skill must not write a task file. Scoping is `task-writer`'s job after the
  merge. Keeping authoring and approval in separate sessions is the point.
- Register the skill: one line in `project-template/.flow/PROTOCOL.md` next to the existing
  `task-writer` pointer, and an entry in the skills tree and "Skills" bullet of
  `project-template/README.md`. Each entry states the skill's role.
- Add `.flow/bin/intent-writer-skill.test.mjs`, which proves the criteria below by asserting on the
  SKILL.md, PROTOCOL.md and README.md text. `.flow/bin/protocol-docs.test.mjs` is the precedent for
  testing doc content; follow its style and do not invent a second mechanism.
- Write the changelog fragment `changes/flow-0072.md`.

**Does not touch:**

- `flow-doctor` or any `.flow/bin/*.mjs` logic (slices 1 and 2 own those rules).
- The intent `_TEMPLATE.md` in either store (flow-0063 owns it).
- `VISION.md`, `task-writer/SKILL.md`, `vision-writer/SKILL.md`.
- Any automation that opens an intent PR unattended, and any workflow under `.github/workflows/`.
- README entries for vision-writer or flow-compass (see notes).

## Acceptance criteria

- [ ] Given the skill file, when a session reads it, then it says the intent's content is the
      human's and the skill's role is extraction, in the same terms `vision-writer` uses.
- [ ] Given the skill file, when a session reads it, then the interview has exactly four
      questions, in the order counterfactual, observable, boundary, rejection test.
- [ ] Given the skill file, when a session reads it, then the rejection test (two or three
      plausible-but-wrong readings for the human to reject) is a numbered step, not an aside.
- [ ] Given the skill file, when a session reads it, then detail the human did not state must go
      as lines beginning with the template's `[assumption]` marker, and silently filling it in is
      explicitly forbidden.
- [ ] Given the skill file, when a session reads it, then it says the skill may surface an open
      question but may never resolve one.
- [ ] Given the skill file, when the human's answers name no resolvable goal, then the skill tells
      the session to say which of the three cases applies (maintenance, amend the vision, drift)
      and forbids choosing a `serves` id.
- [ ] Given the skill file, when a session reads it, then the output is a branch and an open PR
      titled `[intent] ...`, a direct commit to `main` is forbidden, and the skill stops at the
      open PR.
- [ ] Given the skill file, when a session reads it, then writing a task file is explicitly
      forbidden, and it points at `task-writer` for what happens after the merge.
- [ ] Given `project-template/.flow/PROTOCOL.md` and `project-template/README.md` after this
      change, when a reader looks for the skills, then `intent-writer` appears in both with its
      role stated.
- [ ] Given `changes/flow-0072.md`, then it exists and describes the new skill.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Source: `_private/intent-layer-drafts/intent-writer-skill.md` (draft, 2026-09-03). The
  frontmatter `notes` record where this task deliberately departs from it.
- The new test file is `.mjs`: `git add` it before running `npm run lint`, because lint only sees
  tracked files.
