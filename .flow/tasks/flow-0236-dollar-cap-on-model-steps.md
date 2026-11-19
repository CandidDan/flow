---
id: "flow-0236"
title: "Every model step in the reusable workflows has a dollar cap"
status: "proposed"
priority: 3
project: "flow"
owner: ""
created: "2026-11-19"
started: ""
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: ""
accepted_at: ""
accepted_via: ""
touches:
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/_flow-kickback.yml"
  - ".github/workflows/_flow-compass.yml"
  - ".github/workflows/_flow-triage.yml"
  - ".flow/bin/max-budget.test.mjs"
  - "changes/flow-0236.md"
labels: [ci, cost]
model: "opus"
effort: "high"
model_reason: "Edits reusable workflows that every adopting repo runs; a wrong flag breaks review across the fleet."
notes:
  - "2026-11-19: Written from the Claude Code best-practices review (reports/claude-code-best-practices-vs-flow.md, item 5). The dollar values below are starting points chosen without cost data. Dan can change them when accepting."
asks:
  - "fyi: The numbers in Scope are unmeasured. _flow-recover.yml records one run that spent about 13 dollars on a worker that hit its turn limit, so the caps are meant to stop a runaway, not to tune normal runs."
---

## Context

Each model step in the reusable workflows is limited by `--max-turns` and by nothing else. Turns are
a poor proxy for cost: one turn on a large diff with Opus costs far more than one turn on a small
one. Claude Code has a `--max-budget-usd` option that stops a run once it has spent that amount.
Spend is the top concern for this project.

## Scope

- First check that `anthropics/claude-code-action` (pinned in the workflows) passes
  `--max-budget-usd` from `claude_args` to Claude Code, by reading the action's source at the pinned
  commit. If it does not, set this task `blocked` with a `decision` ask carrying a recommendation.
- Add `--max-budget-usd <n>` to every `claude_args` that already has `--max-turns`, in the four
  workflows listed in `touches`. Use these values:

  | Step | Cap (USD) |
  |---|---|
  | 60 turns, Opus (code-review, security) | 8 |
  | 60 turns, Sonnet (qa) | 4 |
  | 15 or 20 turns | 2 |
  | 6 turns | 1 |
  | 1 turn | 0.5 |
  | 150 turns (compass, triage) | 12 |

  Pick the row from the step's own `--max-turns` and model. A step not covered by a row gets the
  nearest row above it and the PR says which.
- When a run stops on the cap, the result must be the same as when it stops on `--max-turns`: the
  review check does not pass. Find the existing handling (the verdict step reads a verdict file and
  fails when it is missing) and show in the PR that a budget stop reaches it.
- Add `changes/flow-0236.md`: no caller action beyond taking the release.
- Not in scope: reviewer prompts, model choices, turn limits, `_flow-fix*` or any workflow not
  listed, and adopting repos' own caller files.

## Acceptance criteria

- [ ] Given each of the four workflow files, every `claude_args` that contains `--max-turns` also
  contains `--max-budget-usd` with a positive number. Proved by `.flow/bin/max-budget.test.mjs`,
  which parses the workflows and fails on any step without it.
- [ ] The numbers equal the table above for the matching steps. Proved by the same test.
- [ ] Given a model step that ends without writing its verdict file, the review check ends red and
  not green. Proved by the existing test that covers a missing verdict file (name it in the PR), or
  by a new case in `.flow/bin/max-budget.test.mjs` if none exists.
- [ ] `changes/flow-0236.md` exists and says no caller action beyond taking the release. Proved by
  `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] All five gate commands pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

None.
