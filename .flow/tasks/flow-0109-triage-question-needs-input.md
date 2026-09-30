---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0109"
title: "Triage's ask-the-human path gets an @mention and a needs-input label, so questions surface once and stop repeating"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-09-30"
started: ""
branch: ""
pr: ""
issue: "https://github.com/CandidDan/flow/issues/49"
blocked_reason: ""
blocked_by: []
serves: ["G12"]    # G12: anything Flow needs from the operator is one decision, answerable in
                  # under a minute from a phone. A triage question is exactly that kind of
                  # ask, and today it posts silently with no mention and no label — it doesn't
                  # reach a phone and the sweep re-asks it daily because nothing marks it asked.
touches:
  - ".github/workflows/_flow-triage.yml"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "flightdeck/bin/mission-control.mjs"
  - "flightdeck/bin/mission-control.test.mjs"
  - "changes/flow-0109.md"
labels: [flow-infra, triage]
notes:
  - "2026-09-30 (orchestrator): Renumbered from flow-0105: the triage run allocated that id a minute after a local session had already taken it (duplicate id). Changelog fragment path updated to match; content otherwise unchanged."
---

## Context

Both `_flow-triage.yml`'s prompt and the task-writer skill's "Triaging the inbox" section tell
the sweep to ask a question instead of proposing a guess when an issue's intent is unclear. The
sweep does post the comment, but plain: no `@`-mention, and no label. That has three
consequences, all rooted in the question path having no state of its own:

1. **No notification signal.** A question comment looks identical to a `proposed` spec comment
   to anyone not actively watching the issue, and reaches nobody who isn't already subscribed.
2. **The sweep re-asks it.** Step 1 of the sweep skips only issues labelled `proposed` or
   `triaged`. A question comment applies neither, so the next sweep sees an untouched issue and
   either asks again or proposes the guess the hard limit exists to prevent.
3. **Invisible to the flightdeck.** `deriveNeeds` (`flightdeck/bin/mission-control.mjs`) builds
   its "needs a human" rollup from issues labelled `proposed` and `compass` only. A question
   awaiting an answer is in neither set, so the one cross-project surface whose job is "this is
   waiting on you" never shows it.

Full issue: https://github.com/CandidDan/flow/issues/49

## Scope

**Does:**

- In `_flow-triage.yml`: add a step, before the AI action, that creates a `needs-input` label
  if it doesn't already exist (`gh label create needs-input --force`, matching the pattern
  `_flow-compass.yml` already uses for its own `compass` label — see that file's "Ensure the
  compass label exists" step).
- In `_flow-triage.yml`'s prompt: when the sweep asks a question rather than proposing (the
  existing "ask the question in the issue comment instead of proposing" hard limit), it must
  also: `@`-mention the repo owner (source it from `github.repository_owner`, the same source
  `flow-watchdog` already uses) in that comment, and apply the `needs-input` label to the
  issue. Update the skip list in step 1 of the prompt so a subsequent sweep also skips issues
  labelled `needs-input` — otherwise the label stops the flightdeck blind spot but not the
  daily re-ask.
- In `project-template/.claude/skills/task-writer/SKILL.md`'s "Triaging the inbox" section:
  document the question path as its own named outcome (alongside Propose / Convert / Auto-ok),
  stating it posts an `@`-mention and applies `needs-input`, and that a later sweep skips
  `needs-input`-labelled issues the same way it skips `proposed`/`triaged` ones.
- In `flightdeck/bin/mission-control.mjs`: fetch open issues labelled `needs-input` the same
  way `proposedIssues`/`compassIssues` are fetched (a `budgetedRest` call against
  `/repos/${fullName}/issues?labels=needs-input&state=open&per_page=50`); extend
  `deriveNeeds`'s parameters with `needsInputIssues` and push one `needs-input-issue` entry per
  issue (mirroring the existing `proposed-issue` / `compass-finding` entry shapes: `type`,
  `title`, `url`).
- Changelog fragment `changes/flow-0109.md`.

**Does not touch:**

- The `compass` label's own creation step or `_flow-compass.yml`.
- `Propose` / `Convert` / `Auto-ok` lane behaviour — this only adds the fourth, previously
  unstated lane's mechanics.
- Any rendering of the flightdeck HTML output beyond what `deriveNeeds`'s existing consumers
  already do with its returned array (no new severity rule beyond the existing "needs.length
  > 0" check picking the new entries up for free).

## Acceptance criteria

- [ ] Given `_flow-triage.yml` runs on a repo with no `needs-input` label yet, when the new
      "ensure label exists" step runs, then the label is created without erroring (workflow
      structure test on the step, mirroring the existing compass-label structure test).
- [ ] `_flow-triage.yml`'s prompt text instructs: an `@`-mention of `github.repository_owner`
      and the `needs-input` label on any comment that asks a question instead of proposing
      (workflow structure test asserting both substrings are present in the prompt step).
- [ ] `_flow-triage.yml`'s prompt's step-1 skip list names `needs-input` alongside `proposed`
      and `triaged` (workflow structure test).
- [ ] `task-writer/SKILL.md`'s "Triaging the inbox" section names the question path as a fourth
      outcome and states it applies `needs-input` and an `@`-mention.
- [ ] Given `deriveNeeds` is called with a non-empty `needsInputIssues` array, when it builds
      the needs list, then it includes one `needs-input-issue` entry per issue with that
      issue's `title` and `url`.
- [ ] Given `deriveNeeds` is called with `needsInputIssues: []` or omitted, then no
      `needs-input-issue` entries appear and every other entry type is unaffected (regression
      test on the existing shape).
- [ ] `mission-control.mjs`'s repo-summarizing function fetches `labels=needs-input` open
      issues the same way it fetches `labels=proposed`/`labels=compass`, and passes them into
      `deriveNeeds` (test on the fetch call / the assembled needs list for a mocked repo).
- [ ] `changes/flow-0109.md` exists and summarizes the new label and mention.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

- The issue notes that neither `INIT.md` nor `RETROFIT.md` creates Flow's labels at all (a
  onboarding gap the issue attributes to `docs/handoff-vision-layer-review.md` §3.5). This task
  does not fix onboarding label creation generally — it only ensures `needs-input` exists at
  triage time, the same narrow fix `_flow-compass.yml` already applies for its own label.
