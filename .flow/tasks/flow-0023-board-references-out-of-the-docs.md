---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0023"
title: "Clear the retired board and flightdeck registry out of the runbooks and reference docs"
status: "blocked"
priority: 4
project: "flow"
owner: ""
created: "2026-08-19"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Depends on flow-0022, which deletes the machinery this task stops describing — documenting the absence before the absence exists inverts the drift. Flow has no dependency field (a gap ADR-0002 recorded), so `blocked` is how the sequence is expressed. ALSO blocked on two file claims: project-template/INIT.md is flow-0005's and project-template/README.md + project-template/.flow/PROTOCOL.md are flow-0016's, both `ready`. UNBLOCK: flip to ready once flow-0022 has merged AND flow-0005 and flow-0016 are `done`; if either is still live then, split its files out rather than claiming them here."
serves: ["G4"]            # what canonical says is what the fleet runs — a runbook describing gone infra is drift
touches: ["CLAUDE.md", "project-template/INIT.md", "project-template/RETROFIT.md", "project-template/README.md", "project-template/.flow/PROTOCOL.md", "project-template/FLOW-handoff.html", "docs/flow-map.html", "docs/flow-infra-propagation-plan.md"]
labels: [docs, cleanup]
notes:
  - "2026-08-19: the prose half of the board retirement decided this day. flow-0022 is the machinery half. Split here because the machinery must land atomically and is testable, while this half is text across eight files with essentially no test surface — and because every file-claim collision in the retirement lives on this side of the seam."
  - "2026-08-19: the reference counts at the time of writing — INIT.md 3, RETROFIT.md 2, project-template/README.md 4, PROTOCOL.md 2, FLOW-handoff.html 4, docs/flow-map.html 2, docs/flow-infra-propagation-plan.md 1, root CLAUDE.md 2. Re-derive them before starting; flow-0022 and the tasks ahead of this one will have moved the ground."
---

## Context

flow-0022 deletes `board.html`, the `board-builder` skill, the flightdeck registry and the offline
aggregator. This task removes the places that still *tell a reader to use them*.

The two halves matter separately. A deleted file that documentation still describes is worse than
either state alone: a new repo follows `INIT.md`, runs a step that references a skill it does not
have, and concludes the runbook is unreliable — which is the one property a runbook cannot lose.
That is drift arriving by publication, and G4's sentence for it is that the fleet should never be
running, or be told to run, infra canonical cannot name.

The doc set is also where the retirement collides with other live work: `INIT.md` belongs to
flow-0005 and `project-template/README.md` and `PROTOCOL.md` belong to flow-0016. Keeping the prose
in its own task is what lets the machinery ship the moment mission control is trusted, instead of
waiting on two unrelated tasks.

## Scope

**Does** — remove or rewrite every reference to the retired surfaces, leaving each document
coherent rather than merely de-referenced:

- `project-template/INIT.md` — the onboarding runbook. Drop the board configuration step and the
  registry-registration step; point the "how do I see state" question at mission control.
- `project-template/RETROFIT.md` — same, for the adopt-an-existing-repo path.
- `project-template/README.md` — the template's front door; drop the board from what a repo gets.
- `project-template/.flow/PROTOCOL.md` — **the protocol itself.** The paragraph in *The store*
  ("`.flow/board.html` is the human's view … regenerate it with the **board-builder** skill") and
  step 2/step 8's "Then regenerate the board" in *The loop you run*. Removing the regenerate steps
  shortens the worker's loop by two instructions; say what, if anything, replaces them (nothing
  does — the store on `main` is the state, and mission control computes the view on open).
  **Keep every mention of `apply-board-edits.mjs`'s role as the state writer** — it is not retired.
- `project-template/FLOW-handoff.html` — the handoff explainer.
- `docs/flow-map.html` — the map of the system.
- `docs/flow-infra-propagation-plan.md` — the propagation plan.
- Root `CLAUDE.md` — canonical's brief: the `board-builder` line under *Skills and agents*, and the
  "No `.flow/board.html`" bullet under *Things that are absent on purpose*. That bullet's premise
  changes: it is no longer "absent here, present downstream" but "retired everywhere", so it either
  moves out of that section or is reworded. Do not silently delete it — a reader who knows the old
  layout needs to find out what happened.

**Deliberately does NOT:**

- **Touch any code, test, workflow, skill, agent, `.gitattributes` or `.gitignore`.** All of that is
  flow-0022. If a doc edit seems to require a code change, that is a scope signal: block and say so.
- **Edit `docs/adr/0001-*` or `docs/adr/0002-*`.** ADRs are dated records of decisions taken, and
  editing one to remove a thing it correctly decided at the time falsifies the record.
- **Edit `docs/handoff-vision-layer-review.md`.** Same reason: a dated review of a repo as it stood.
- **Edit anything in `.flow/tasks/`.** History, and a PR touching the store fails the gate.
- **Write the ADR recording the retirement.** Wanted, but it is neither this task nor flow-0022.

## Acceptance criteria

- [ ] Given the eight files in `touches`, when each is searched for `board.html`, `board-builder`,
      `flightdeck.html`, `projects.yml`, `projects.example.yml` and `flightdeck-state`, then no
      match remains.
- [ ] Given the whole repo after this change, when it is searched for the same terms, then the only
      matches are in `.flow/tasks/`, `docs/adr/`, `docs/handoff-vision-layer-review.md`, and the
      `board-edits.json` transport that `apply-board-edits.mjs` still uses — and a test asserts that
      allow-list, so a later stray reference fails rather than accumulates.
- [ ] Given `project-template/.flow/PROTOCOL.md`, when *The store* and *The loop you run* are read,
      then no step instructs the worker to regenerate a board, the loop's remaining steps are
      correctly numbered and internally consistent, and `apply-board-edits.mjs`'s role as the writer
      of PR-event state transitions is still described.
- [ ] Given `project-template/INIT.md` and `RETROFIT.md`, when each is followed end to end against a
      fresh repo, then no step references a file or skill the template no longer ships, and each
      answers "where do I see the state of this project" with mission control.
- [ ] Given the root `CLAUDE.md`, when *Things that are absent on purpose* is read, then it does not
      claim `board.html` is absent only from canonical, and a reader who expected a board learns
      what replaced it and when.
- [ ] Given `project-template/CLAUDE.md`, when its character count is measured, then it is still
      under the 25k budget that file states for itself.
- [ ] Given the repo after this change, when `npm run build`, `npm run lint`, `npm test` and
      `npm run coverage` run, then all pass and coverage is at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **The repo-wide allow-list assertion is the deliverable that outlives this task.** A one-off sweep
  decays; `.flow/bin/protocol-docs.test.mjs` already holds assertions of exactly this shape, and the
  new one belongs beside it — but that file is **flow-0022's**, so add it there if the two tasks are
  worked in sequence by the same session, and otherwise put it in a new test file rather than
  reaching into another task's `touches`.
- **`project-template/CLAUDE.md` is deliberately absent from `touches`.** It carries no board
  reference today — it is a pointer to `PROTOCOL.md` plus project notes. The character-budget
  criterion above reads it; it does not edit it.
- **Read, do not pattern-match.** These files are prose that explains a system. Deleting the
  sentences that contain the word "board" will leave paragraphs that no longer parse and lists with
  dangling "and finally" clauses. Each edit is a small rewrite of its paragraph.
