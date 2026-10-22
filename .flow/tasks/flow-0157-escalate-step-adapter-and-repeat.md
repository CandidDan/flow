---
id: "flow-0157"
title: "The escalate step records an infrastructure failure on canonical too, and survives a repeat of the same failure"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-worker-flow-0157"
created: "2026-10-22"
started: "2026-10-22T05:30:13Z"
branch: "flow/flow-0157-escalate-adapter-repeat"
pr: "https://github.com/CandidDan/flow/pull/223"
issue: ""
intent: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".flow/bin/task-model.mjs"
  - ".github/workflows/_flow-queue-runner.yml"
  - ".flow/bin/queue-runner-verify.test.mjs"
  - ".flow/bin/adapters.test.mjs"
  - "changes/flow-0157.md"
labels: [queue-runner, bug, adapters]
notes:
  - "2026-10-22 (orchestrator, Dan approved): FOUND on PR #220 (flow-0154). Its code-review check FAILED with two blockers; the auto-fix round never ran, and the PR was merged with neither fixed. Both are on main now and sit in changes/flow-0154.md, so they reach the fleet at the next tag. (1) The inline classifier does `const { readAsks, writeAsks } = await import(\"<repo>/.flow/bin/task-model.mjs\")`. On canonical that file is the ADAPTER, and its export list stops short of those two (checked 2026-10-22: both import as undefined), so every infrastructure failure on canonical's own queue throws TypeError in the escalate step and records no ask. The flow-0154 tests did not catch it because adopterRepo() copies the TEMPLATE's task-model.mjs, which exports both. (2) A second infra failure with the same error leaves the task file byte-identical (the ask is de-duplicated and carries no run id), so `git commit -q` exits 1 under bash -e and the step fails. The existing repeat-run test never asserts the second run's exit status. Reviewer's full comment: https://github.com/CandidDan/flow/pull/220."
  - "2026-10-22 (orchestrator): flow-0154 left a separate follow-up ask — move the classifier out of the inline heredoc into project-template/.flow/bin/queue-runner-verify.mjs. That is NOT this task; it stays open on flow-0154 and gets its own task once this fix lands."
model: "opus"
effort: "high"
model_reason: "edits a reusable workflow every repo runs, plus the adapter/template boundary"
asks: []
---

## Context

flow-0154 taught the queue runner to tell "the worker tried and failed" from "the run died before
the worker started", so the second case leaves `model` alone and records a `follow-up` ask naming
the error. Two bugs in that path shipped to `main` unfixed:

1. **Canonical's adapter does not export what the step imports.** `.flow/bin/task-model.mjs` is
   an adapter over `project-template/.flow/bin/task-model.mjs` ("the public surface, re-exported
   rather than reimplemented") but its export list omits `readAsks` and `writeAsks`. The inline
   classifier imports exactly those two from `<repo>/.flow/bin/task-model.mjs`. Adopters hold the
   template copy and are fine; canonical throws `TypeError: readAsks is not a function` on every
   infrastructure failure of its own queue, and the step fails with nothing recorded. The tests
   passed because `adopterRepo()` builds its fixture from the template file, never the adapter.
2. **A repeated failure fails the step.** The ask is de-duplicated by exact text and names no run,
   so the second identical failure stages nothing, `git commit -q` exits 1, and `set -e` ends the
   step. The repeat run in the first flow-0154 test is executed but its exit status is never
   asserted.

## Scope

**Does:**

- `.flow/bin/task-model.mjs` (canonical's adapter): re-export the template's full public surface,
  `readAsks` and `writeAsks` included. Do not reimplement either.
- `.flow/bin/adapters.test.mjs`: a test that every named export of
  `project-template/.flow/bin/task-model.mjs` is re-exported by `.flow/bin/task-model.mjs`, so the
  adapter can never again lag the surface a workflow imports. Compare the two modules' export
  names mechanically (`Object.keys(await import(...))`), not a hand-written list.
- `.github/workflows/_flow-queue-runner.yml`, escalate step, `tried=false` path: when nothing is
  staged after `git add .flow/tasks/`, print that the ask was already recorded and `exit 0` instead
  of committing. Use `git -C "$wt" diff --cached --quiet`. The `tried=true` path is unchanged.
- `.flow/bin/queue-runner-verify.test.mjs`:
  - run the real escalate step against a fixture whose `.flow/bin/task-model.mjs` is **canonical's
    adapter layout** (adapter importing from a `project-template/.flow/bin/` copy), not only the
    template copy — this is the test that would have caught bug 1;
  - in the existing repeat-run test, assert the second run exits 0 and the task file is unchanged;
  - pin the boundary at 2 turns: 2 turns with no claim is an infrastructure failure (today only 3
    is tested, from the other side).
- `changes/flow-0157.md`.

**Does not touch:** `project-template/.flow/bin/task-model.mjs` (the template is correct);
`project-template/.flow/bin/queue-runner-verify.mjs` (moving the classifier there is flow-0154's
open follow-up ask, a separate task); `_flow-review.yml`, `_flow-kickback.yml`; any task file.

## Acceptance criteria

- [ ] Given canonical's adapter layout (`.flow/bin/task-model.mjs` adapting a
      `project-template/.flow/bin/task-model.mjs` copy), when the escalate step runs for a
      `<3 turns, no claim` run, then it exits 0, `model` is unchanged, and the task on `main`
      carries the `follow-up` ask naming the error. Proved by a new `flow-0157:` test in
      `.flow/bin/queue-runner-verify.test.mjs` that runs the real step against that layout.
- [ ] Given `.flow/bin/task-model.mjs` and `project-template/.flow/bin/task-model.mjs`, when both
      are imported, then every named export of the template is a named export of the adapter.
      Proved by a new test in `.flow/bin/adapters.test.mjs` that derives the list from the
      template module at run time; removing `readAsks` from the adapter's export list makes it fail.
- [ ] Given a task that already carries the infrastructure-failure ask for error E, when the
      escalate step runs again for the same error E, then it exits 0, commits nothing, pushes
      nothing, and the task file on `main` is byte-identical to before. Proved by the existing
      repeat-run test in `.flow/bin/queue-runner-verify.test.mjs`, extended to assert the second
      run's exit status and the file's content.
- [ ] Given a run with exactly 2 turns and no claim, when the escalate step runs, then it is
      classified `tried=false`. Proved by a new `flow-0157:` test in
      `.flow/bin/queue-runner-verify.test.mjs`.
- [ ] Given `changes/flow-0157.md`, then it exists and states caller action: none. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

- The adapter-layout fixture: build it the way `adapterRepo()` builds the template one, then
  overwrite `.flow/bin/task-model.mjs` with a copy of canonical's adapter and put the template
  copy at `project-template/.flow/bin/task-model.mjs` so the adapter's relative import resolves.
  If `adapterRepo()` needs a parameter for that, add one; do not fork the helper.
- The `tried=false` "already recorded" exit must still happen inside the push-retry loop's
  first attempt — nothing to push means nothing to retry.
