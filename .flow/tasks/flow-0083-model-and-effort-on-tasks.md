---
id: "flow-0083"
title: "A task can recommend its model and effort, the orchestrator sets them deliberately, and the runner honours them"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-26"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G9", "G10"]      # G9: stop paying Opus prices for mechanical work. G10: put the hardest work on the model most likely to get it right.
touches:
  - "project-template/.flow/tasks/_TEMPLATE.md"
  - "project-template/.flow/bin/task-model.mjs"
  - "project-template/.flow/bin/task-model.test.mjs"
  - ".flow/bin/task-model.mjs"
  - ".github/workflows/_flow-queue-runner.yml"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "changes/flow-0083.md"
labels: [queue-runner, cost, task-writer]
notes:
  - "2026-10-02 (orchestrator): unblocked on the human's say-so. Every blocked_by entry had landed (checked against main), and inflight listed it as UNBLOCK."
  - "2026-09-26 (orchestrator): From the operator. Every task runs on Opus today, whatever it needs. Fable is available on his Max plan and should be recommended where a task suits it. Effort matters as much as model: the TanPlan planning work that went in circles probably needed more effort, not just a bigger model."
---

## Context

The queue runner hardcodes `--model opus` for every worker. That is right for risky or ambiguous
work and wasteful for mechanical work, and it never reaches for Fable (Mythos tier, above Opus),
which suits the rare hardest tasks. Effort (how much the model thinks before acting) is not set at
all.

The decision belongs with the orchestrator, who writes the task and knows how much judgement it
needs. It should be made once, with a reason, and recorded in the task, so it can be checked later
against how the task actually went.

## Scope

**Does:**

- Add two optional frontmatter fields to `_TEMPLATE.md`, with guidance comments:
  - `model:` one of `fable`, `opus`, `sonnet`, `haiku`;
  - `effort:` one of `low`, `medium`, `high`, `max`.

  Plus `model_reason:`, one line on why, required whenever either field is set.
- `task-model.mjs`: a pure, dependency-free resolver. Input: the task file. Output: the model and
  effort to run, with defaults of `opus` / `high` when the fields are absent. It rejects any value
  outside the allowed lists, and a rejected value **fails the run with the reason**; it never
  silently runs the default. It also emits the exact CLI arguments for the action.
- The queue runner calls the resolver and passes its output into `claude_args` in place of the
  hardcoded `--model opus`. The run summary states the model, effort and reason used.
- **Effort mechanics:** use whatever effort or thinking control the pinned `claude-code-action` /
  Claude Code version actually supports. Verify it against that version's documentation at
  implementation time. Do not guess a flag. If no effort control exists at that version, implement
  `model` fully, record `effort` in the summary as "requested, not supported by this action
  version", and note it on the task. That is a partial delivery, stated, not a silent drop.
- **task-writer guidance.** Add a short section to the skill with the rubric below, and require the
  orchestrator to set `model`/`effort` plus a reason on any task that departs from the default:
  - **fable / high–max:** hardest judgement (planning a large rebuild, turning a messy brief into
    intents, debugging where earlier attempts went in circles). **Never for security-review-style
    work**: its cybersecurity safeguards make it the wrong tool there.
  - **opus / high:** risky or ambiguous (money, auth, concurrency, cross-cutting changes,
    open design decisions). This is the default.
  - **sonnet / medium:** well-specified (precise criteria, small `touches`, no design decisions:
    docs, config, renames, tests to a clear spec, UI following an existing pattern).
  - **haiku / low:** trivial, repetitive, fully mechanical.
- Changelog fragment `changes/flow-0083.md`. Caller action: none.

**Does not touch:**

- The review workflow's models. Those stay in `config.yml` `review:`.
- Automatic selection of model by the runner. The choice is the orchestrator's, recorded in the task.
- Any tracking dashboard. The run summary line is the record for now.

## Acceptance criteria

- [ ] Given a task with no `model`/`effort`, when the resolver runs, then it returns `opus` /
      `high` and a reason of "default".
- [ ] Given `model: sonnet`, `effort: medium` and a `model_reason`, then the resolver returns
      them and the emitted CLI arguments contain `--model sonnet`.
- [ ] Given `model: fable`, then the emitted arguments select Fable.
- [ ] Given `model: gpt-5`, or `effort: extreme`, then the resolver exits non-zero with a message
      naming the bad field and the allowed values.
- [ ] Given `model` set without `model_reason`, then the resolver exits non-zero, naming the
      missing reason.
- [ ] Given the queue-runner workflow, then no literal `--model opus` remains in the dispatch
      step; the model comes from the resolver. This is a static assertion.
- [ ] Given a run, then the step summary names the model, effort and reason used.
- [ ] Given the effort control was verified against the pinned action version, then the PR
      description names the flag used and the documentation it came from, or states it is
      unsupported and what was done instead.
- [ ] Given the task-writer skill, then it contains the four-tier rubric, including the rule
      "never Fable for security-review-style work".
- [ ] Given `changes/flow-0083.md`, then it exists and states "caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **Suggested for this task itself:** `model: opus`, `effort: medium`. It is well-bounded, but
  the effort-flag verification needs care.
