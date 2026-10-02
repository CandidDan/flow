---
id: "flow-0121"
title: "Canonical's flow-recover adapter runs the template's CLI instead of a copy of it, so its own sweep can promote a ready PR to in_review"
status: "done"
priority: 2
project: "flow"
owner: "claude-worker-flow-0121"
created: "2026-10-02"
started: "2026-10-02T00:29:20Z"
branch: "flow/flow-0121-recover-adapter-runs-template-cli"
pr: "https://github.com/CandidDan/flow/pull/164"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "project-template/.flow/bin/flow-recover.mjs"
  - "project-template/.flow/bin/flow-recover.test.mjs"
  - ".flow/bin/flow-recover.mjs"
  - ".flow/bin/adapters.test.mjs"
  - "changes/flow-0121.md"
labels: [flow-infra, flow-recover, adapters]
notes:
  - "2026-10-02 orchestrator: written at Dan's request from PR #156 (flow-0104). That worker recorded the gap: `.flow/bin/flow-recover.mjs` (canonical's adapter) duplicates the template's CLI shell, so it ignores `--open-pr-ready` and has no `ready-pr` or `promote` subcommand. promote-in-review is therefore inert in canonical's own sweep. Nothing regresses: ready-pr prints nothing and the flag arrives as 0. DECISION, do not relitigate: the fix is to remove the duplicate, not to copy three more branches into it. The adapter's CLI is a hand-kept copy of the template's, which is the second implementation NG5 rules out, and it is why this gap exists at all. The next subcommand added to the template would go inert in canonical the same way. Follow the flow-doctor adapter's pattern, which calls the template's `runDoctor({ flowDir })`: the template exports a CLI runner that takes the store location, and both the template's main block and the adapter call it."
  - "2026-10-02 worker: branch `flow/flow-0121-recover-adapter-runs-template-cli` pushed. DONE: `runRecoverCli(argv, { tasksDir, stdin, out })` exported from `project-template/.flow/bin/flow-recover.mjs` (the template main block now calls it), and `.flow/bin/flow-recover.mjs` reduced to one call into it — no `cmd ===` branch, no `parseFlags`, and the re-export list gained `readyOpenPr`/`buildPromoteEdit`/`runRecoverCli`. Verified by hand against canonical's store: classify --open-pr-ready 1 prints promote-in-review, ready-pr and promote both answer, list-in-progress prints flow-0121. NOT DONE: the table-driven test over all seven subcommands in `.flow/bin/adapters.test.mjs`, the no-`cmd ===` source test, `changes/flow-0121.md`, and the full gate. NEXT: write those tests, run build/lint/test/coverage, open the PR."
  - "2026-10-02 worker: DONE and handed off. PR #164 is open and marked ready for review; branch `flow/flow-0121-recover-adapter-runs-template-cli`, rebased onto 417bbf7. `runRecoverCli(argv, { tasksDir, stdin, out })` is exported from the template and both the template main block and canonical's adapter call it; the adapter has no `cmd ===` branch and no `parseFlags`, and its re-export list now covers all ten of the template's exports. Four new tests in `.flow/bin/adapters.test.mjs` cover all six criteria, mutation-checked against main's adapter. Gate: build, lint and coverage (96.85%, floor 83.5) green. ONE PRE-EXISTING TEST FAILURE, not from this branch and red on main at 417bbf7 with the identical message: `release-assemble.test.mjs` -> 'after a release assembles the fragments, every changelog-aware test still passes', naming flow-0104's criterion 8 (in `project-template/.flow/bin/flow-recover.test.mjs`, inside this task's touches) and flow-0115's (in `project-template/.flow/bin/flow-review.test.mjs`, OUTSIDE it). Both read `changes/<id>.md` directly instead of via `.flow/bin/changelog-entry.mjs`. Deliberately untouched: fixing only the in-scope one leaves the gate red and the other needs a widened `touches`. ORCHESTRATOR ACTION: write a task declaring both test files to route them through changelog-entry.mjs — until then every PR in canonical is red on this one test."
---

## Context

`_flow-recover.yml` runs `node .flow/bin/flow-recover.mjs` in every consuming repo, and canonical
is one of them. In canonical that path is an adapter. It exists so the sweep reads canonical's real
store (`.flow/tasks`), not the template's fixture store, because the template resolves its store
relative to its own file.

The adapter re-exports the template's pure helpers, but its CLI (`classify`, `list-in-progress`,
`branch-candidates`, `count-task-prs`, `reset`) is a copy of the template's. flow-0104 added three
things to the template's CLI:

- `classify --open-pr-ready`
- `ready-pr <id> <branch>`
- `promote <id> <pr-url> <branch>`

The copy has none of them, so canonical's sweep can never take the `promote-in-review` branch.

## Scope

- In `project-template/.flow/bin/flow-recover.mjs`, export one CLI entry point. It takes `argv`
  and the tasks directory, plus injectable stdin and stdout for tests, and returns the exit code:

  ```ts
  export function runRecoverCli(
    argv: string[],
    opts: { tasksDir: string; stdin?: () => string; out?: { write(s: string): void } },
  ): number
  ```

  The template's main block calls it with its own tasks directory. Its behaviour must stay
  byte-for-byte what it is today.
- `.flow/bin/flow-recover.mjs` keeps its header, `canonicalFlowDir()` and its re-exports. Its CLI
  becomes one call to `runRecoverCli` with canonical's tasks directory, and the copied
  subcommand branches and `parseFlags` are deleted.
- `adapters.test.mjs` proves the adapter now answers all seven subcommands against canonical's
  store. Today it pins only that the adapter resolves the right store.

**Does not:** change `_flow-recover.yml`, any classification rule, or what any subcommand prints.

## Acceptance criteria

- [ ] Given an in_progress task in canonical's store older than the threshold, with an open
      non-draft PR, `node .flow/bin/flow-recover.mjs classify … --has-open-pr 1 --open-pr-ready 1`
      prints `promote-in-review`.
- [ ] `… ready-pr <id> <branch>`, fed a `gh pr list` JSON array on stdin, prints
      `<number>\t<url>` for that task's non-draft PR and prints nothing for a draft.
- [ ] `… promote <id> <pr-url> <branch>` prints the same board edit as the template's `promote`.
- [ ] Every subcommand returns identical output from the template and the adapter for the same
      inputs, apart from which store is read. This is one table-driven test over all seven, so a
      subcommand added later is covered without anyone remembering to add it.
- [ ] `.flow/bin/flow-recover.mjs` contains no `cmd ===` branch (a source test), so the copy
      cannot quietly grow back.
- [ ] The existing `adapters.test.mjs` assertions on store resolution and the template's
      `flow-recover.test.mjs` suite pass unchanged.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
