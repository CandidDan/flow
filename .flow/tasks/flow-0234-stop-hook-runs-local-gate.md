---
id: "flow-0234"
title: "A worker cannot finish a session while the local gate is failing"
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
  - "project-template/.flow/bin/stop-gate.mjs"
  - "project-template/.flow/bin/stop-gate.test.mjs"
  - "project-template/.claude/settings.json"
  - "changes/flow-0234.md"
labels: [hooks, template]
model: "opus"
effort: "high"
model_reason: "Hook behaviour in the published template, with loop and timeout risks; wrong behaviour stalls every worker that adopts it."
notes:
  - "2026-11-19: Written from the Claude Code best-practices review (reports/claude-code-best-practices-vs-flow.md, item 3). Tested against Flow's own gate: not yet. The worker measures the gate's run time (see Scope)."
asks:
  - "fyi: flow-sync never touches .claude/settings.json in an adopting repo (see _flow-sync.yml: hooks and permissions are the repo's own choice). So the hook script reaches every repo at the next sync, but the settings entry that runs it reaches only repos set up after this release. Existing repos add the entry by hand. A task to offer that through the sync PR is a separate decision."
---

## Context

The protocol says to run `build`, `lint`, `test` and `coverage` locally before a PR is marked
ready. Today that is a written rule. A worker can ignore it and hand off a red PR, which then costs a
CI run and three review runs.

Claude Code has a `Stop` hook. It runs when the session is about to end. If the hook exits with
code 2, Claude Code sends the hook's stderr back to the worker and the worker keeps going. Claude
Code gives up after 8 blocked stops in a row.

## Scope

- Read the Stop hook section of https://code.claude.com/docs/en/hooks.md first. Record in the PR
  what it says about the input fields (especially `stop_hook_active` and `session_id`), exit code
  2, and the per-hook `timeout`. Follow the docs where they differ from this task.
- Add `project-template/.flow/bin/stop-gate.mjs`. It reads the hook input from stdin and decides:
  - **Skip (exit 0, print one line saying why)** when any of these is true: there is no
    `.flow/config.yml`; the current branch is `main`; the branch has no changed file outside
    `.flow/tasks/` compared with `origin/main`; the environment variable `FLOW_STOP_GATE` is `off`.
    This keeps it quiet for orchestrator and state-only sessions.
  - **Otherwise run** the `build`, `lint`, `test` and `coverage` commands from `commands:` in
    `.flow/config.yml`, in that order, and stop at the first failure.
  - **On a failure**, exit 2 and write to stderr the command that failed and the last 40 lines of its
    output.
  - **Never loop.** Count consecutive blocked stops per `session_id` in a file under `os.tmpdir()`.
    After 2 blocked stops in a row, exit 0 and print that the worker is stopping with a red gate, so
    the PR must stay a draft. A passing run resets the count.
- Add a `Stop` entry to `project-template/.claude/settings.json` that runs
  `node .flow/bin/stop-gate.mjs` with `timeout` 900. Keep the existing `PreCompact` entries unchanged.
- Run the whole gate in canonical once and put its run time in the PR. If it is over 600 seconds,
  set the task `blocked` with a `decision` ask instead of shipping a slow hook.
- Add `changes/flow-0234.md`. It says: no caller action to receive the script; to turn the hook on in
  an existing repo, copy the `Stop` entry from the template's `.claude/settings.json`.
- Not in scope: canonical's own `.claude/`, `flow-sync`, any workflow, and the review checks.

## Acceptance criteria

- [ ] Given a repo whose gate commands all pass and a branch with a code change, the script exits 0.
- [ ] Given a failing `lint` command, the script exits 2, stderr names `lint`, and `test` and
  `coverage` are not run.
- [ ] Given the branch is `main`, or the only changes are under `.flow/tasks/`, or
  `FLOW_STOP_GATE=off`, the script exits 0 without running any gate command.
- [ ] Given two blocked stops in a row for one `session_id`, the third stop exits 0 and the output
  says the gate is red. A passing run in between resets the count.
- [ ] `project-template/.claude/settings.json` is valid JSON, has the `Stop` entry with
  `timeout` 900, and still has both `PreCompact` entries.
- [ ] `changes/flow-0234.md` exists and states the caller action above. Proved by
  `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] All five gate commands pass and coverage stays at or above the floor.

All script criteria are proved by `project-template/.flow/bin/stop-gate.test.mjs`, which builds
temporary git repos with stub gate commands.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

The review that produced this task could not confirm that the template's `PreCompact` hook output
field (`additionalContext`) is accepted by Claude Code. While reading `hooks.md`, state in the PR
what it says about that. Do not change the `PreCompact` entries in this task.
