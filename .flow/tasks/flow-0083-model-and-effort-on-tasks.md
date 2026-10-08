---
id: "flow-0083"
title: "Each task names its model and effort (default Sonnet 5.5), the runner honours it, and a task that fails moves up a model"
status: "blocked"
priority: 1
project: "flow"
owner: ""
created: "2026-09-26"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Sequenced behind flow-0140: both edit `_flow-queue-runner.yml` (0140 repins the action and replaces `--model opus` with a full ID; this task replaces that with the resolver). Unblocks when flow-0140 merges."
blocked_by: ["flow-0140"]
serves: ["G9", "G10"]      # G9: stop paying Opus prices for mechanical work. G10: put the hardest work on the model most likely to get it right.
touches:
  - "project-template/.flow/tasks/_TEMPLATE.md"
  - "project-template/.flow/bin/task-model.mjs"
  - "project-template/.flow/bin/task-model.test.mjs"
  - ".flow/bin/task-model.mjs"
  - ".github/workflows/_flow-queue-runner.yml"
  - "project-template/.flow/bin/flow-state.mjs"
  - "project-template/.flow/bin/flow-state.test.mjs"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "project-template/.flow/PROTOCOL.md"
  - ".flow/bin/serves-template.test.mjs"
  - ".flow/bin/protocol-portability.test.mjs"
  - ".flow/bin/queue-runner-verify.test.mjs"
  - ".flow/bin/queue-runner-switch.test.mjs"
  - "changes/flow-0083.md"
labels: [queue-runner, cost, task-writer, urgent]
notes:
  - "2026-10-02 (orchestrator): unblocked on the human's say-so. Every blocked_by entry had landed (checked against main), and inflight listed it as UNBLOCK."
  - "2026-09-26 (orchestrator): From the operator. Every task runs on Opus today, whatever it needs. Fable is available on his Max plan and should be recommended where a task suits it. Effort matters as much as model: the TanPlan planning work that went in circles probably needed more effort, not just a bigger model."
  - "2026-10-08 (orchestrator): REWRITTEN and made URGENT, approved by Dan 2026-10-08 (Actions/quota cost review). Changes from the 26 Sep spec, decided with Dan, do not re-litigate: (1) the DEFAULT is Sonnet 5.5 / medium, not Opus / high; the orchestrator raises a task to Opus or Fable deliberately, with a reason. (2) Tiers map to FULL model IDs in one table (see flow-0140's notes for why aliases drifted). (3) Escalation is MECHANICAL as well as self-reported: models judge their own limits poorly, so a weaker model asking for help cannot be the only trigger. (4) Planning stays on the higher model; this task changes only the build worker."
  - "2026-10-08 (orchestrator): ESCALATION WRITES TO MAIN. Bumping `model` is a task-state change, so it is a small commit to the task file on `main` (the same plane as a claim), never on a branch. The runner already commits to main for recovery; reuse that path. A task already at `fable` does not escalate further: it gets an `asks` decision instead (`Recommend:` split the task)."
  - "2026-10-08 (orchestrator): touches lists tests that pin the template's key order (serves-template), the PROTOCOL hard-rules digest (protocol-portability, only if a hard rule changes), and the queue runner's dispatch step (queue-runner-*). Edit them only if they actually fail; do not widen further without a note."
---

## Context

The queue runner runs every worker on one model whatever the task needs. Most tasks (tight
criteria, small `touches`, following an existing pattern) are Sonnet work; a few need Opus or
Fable. The choice belongs to the orchestrator, who writes the task, made once with a reason. Because
a model rarely knows when it is out of its depth, a failed attempt must also move the task up a
model on its own.

## Scope

**Does:**

- `_TEMPLATE.md`: optional `model:` (`haiku` | `sonnet` | `opus` | `fable`), `effort:` (`low` |
  `medium` | `high` | `max`), and `model_reason:` (one line, required whenever either is set).
- `task-model.mjs` (pure, dependency-free):
  - `TIERS`: the single table from tier to full model ID: `haiku → claude-haiku-4-5-20251001`,
    `sonnet → claude-sonnet-5-5`, `opus → claude-opus-5-5`, `fable → claude-fable-5-1`. Verify each
    ID is known to the CLI that flow-0140's pin installs; a new model is a one-line edit here.
  - `resolve(task)`: returns `{ tier, id, effort, reason }`. Defaults: `sonnet` / `medium` /
    reason "default". Rejects a value outside the lists, or `model`/`effort` without
    `model_reason`, by failing the run and naming the field and allowed values. Never silently
    falls back.
  - `escalate(task, event)`: returns the task text with `model` one tier up (`haiku → sonnet →
    opus → fable`) and `model_reason: "escalated after <event> (was <tier>)"`. At `fable` it adds
    a `decision` ask instead (`Recommend: split the task`) and leaves `model` alone.
  - Emits the exact CLI arguments for the action.
- Queue runner: calls the resolver; `claude_args` gets `--model <id>` from it instead of a
  literal. The step summary states tier, ID, effort and reason. **Escalation trigger 1:** a run
  that ends without opening or updating a PR (`error_max_turns`, or no branch pushed) commits
  `escalate(task, "run <id> ended without a PR")` to main.
- `flow-state.mjs`, in the closed-unmerged → `ready` transition: **escalation trigger 2:** apply
  `escalate(task, "PR #<n> closed unmerged")` in the same commit.
- **Escalation trigger 3 (self-report):** PROTOCOL and task-writer tell a worker that judges the
  task beyond it to set `blocked` with a `decision` ask carrying `Recommend: re-run on <tier>`
  rather than guess.
- **Effort:** use whatever effort control the pinned Claude Code version supports (`2.1.293`
  after flow-0140; there is an `effortLevel` setting, so check for a flag or settings route).
  Verify it against that version's docs. Do not guess a flag. If none works, implement `model` fully
  and say "effort requested, not supported by this version" in the summary and the PR.
- task-writer: the rubric, and a rule that every task departing from the default sets `model`,
  `effort` and `model_reason`:
  - **fable / high–max:** hardest judgement (planning a large rebuild, a messy brief, debugging that
    went in circles). **Never for security-review-style work.**
  - **opus / high:** risky or ambiguous: money, auth, concurrency, CI workflows and Flow infra,
    cross-cutting changes, open design decisions.
  - **sonnet / medium (default):** well-specified: precise criteria, small `touches`, no design
    decisions, following an existing pattern.
  - **haiku / low:** trivial, fully mechanical.
- Changelog fragment `changes/flow-0083.md`. Caller action: none. Note that existing tasks with no
  `model` now build on Sonnet 5.5, so an adopter with risky queued tasks should tag them `opus`.

**Does not touch:** review models (flow-0140, `config.yml` `review:`), the kickback workflow,
planning/orchestrator sessions, any dashboard.

## Acceptance criteria

- [ ] Given a task with no `model`/`effort`, then the resolver returns `sonnet` /
      `claude-sonnet-5-5` / `medium` / "default".
- [ ] Given `model: opus`, `effort: high` and a `model_reason`, then the emitted CLI arguments
      contain `--model claude-opus-5-5`; given `model: fable`, they contain `claude-fable-5-1`.
- [ ] Given `model: gpt-5` or `effort: extreme`, then the resolver fails naming the field and the
      allowed values; given `model` without `model_reason`, it fails naming the missing reason.
- [ ] Given `TIERS`, then it is the only place in the repo that maps a tier to a model ID (static
      assertion over `.github/workflows/` and `project-template/.flow/bin/`).
- [ ] Given `escalate` on a `sonnet` task, then `model` becomes `opus` with an "escalated after"
      reason; on a `fable` task, `model` is unchanged and a valid `decision` ask with
      `Recommend:` is added (flow-doctor accepts it).
- [ ] Given a queue-runner run that ends without a PR, then the task on main is escalated by one
      tier (proved by a test on the step's logic, not a live run).
- [ ] Given a PR closed unmerged, then `flow-state`'s return-to-ready also escalates the task.
- [ ] Given the queue-runner workflow, then no literal `--model` value remains in the dispatch step.
- [ ] Given a run, then the step summary names tier, model ID, effort and reason.
- [ ] Given the effort control was verified, then the PR names the mechanism and its source, or
      states it is unsupported and what was done instead.
- [ ] Given task-writer and PROTOCOL, then they contain the four-tier rubric, the default, the
      self-escalation rule, and "never Fable for security-review-style work".
- [ ] Given `changes/flow-0083.md`, then it exists and states the caller action.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **Suggested for this task itself:** `model: opus`, `effort: high`. It edits the queue runner and
  the store's state transitions.
