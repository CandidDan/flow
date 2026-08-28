---
id: "flow-0025"
title: "Fail the queue-runner job when a worker produces no verifiable outcome"
status: "in_review"
priority: 2
project: "flow"
owner: "session_01LeGZLrACwUQ6u2b6GDkvJT"
created: "2026-08-27"
started: "2026-08-28T06:45:01Z"
branch: "flow/flow-0025-queue-runner-verify-outcome"
pr: "https://github.com/CandidDan/flow/pull/42"
issue: "https://github.com/CandidDan/flow/issues/33"
blocked_reason: ""
serves: ["G2"]
touches: [".github/workflows/_flow-queue-runner.yml", "project-template/.flow/bin/queue-runner-verify.mjs", "project-template/.flow/bin/queue-runner-verify.test.mjs", ".flow/bin/queue-runner-verify.mjs", ".flow/bin/queue-runner-verify.test.mjs"]
labels: [infra, queue-runner, integrity]
notes:
  - "2026-08-28: built end to end, PR #42 open on branch flow/flow-0025-queue-runner-verify-outcome; gate green (build 21 workflows, lint 63 files, 627 tests pass / 1 pre-existing env-gated skip, coverage 96.2% vs floor 83.5). All Scope decisions honoured: notes-alone fails, bootstrap guard no-ops when the helper is absent (proved by executing the step's real script in a bare dir), flow-recover/flow-open-pr untouched, pure verifyOutcome + thin IO per the release-guard adapter pattern. Two implementation choices a fresh session should not re-litigate: (1) the step is gated `!cancelled() && steps.pick.outputs.task_id != ''` — it also runs when the worker step FAILED, purely as diagnostics (the job is already red); the spec's 'unconditionally after Work the task' is read as 'regardless of worker verdict', and the AC only forbids failure()-gating, which the parse test asserts. (2) the [<id>]-title PR fallback check filters titles in node with TASK_ID passed via env, not interpolated into a jq program — workflow_dispatch ids are untrusted input per config.yml's security focus. Next action: none for a worker — await review checks / human validation on PR #42; kickbacks on the same branch."
---

## Context

Observed on `CandidDan/write`, 2026-08-25: queue-runner run 32869817466 claimed `write-0003`,
ran 57/120 turns, the SDK result was `is_error: false`, and the job concluded **success** — but
pushed no branch, opened no PR, set no `blocked` status, and left no `notes` handoff. The task
sat falsely `in_progress` until `flow-recover`'s scheduled sweep reset it to `ready`. Same pattern
same day for the same task (run 32821080230), and previously for `write-0009` (×3) and
`write-0016`.

`flow-recover` already heals the *task state* (see `_flow-recover.yml`'s `reset-to-ready` path),
so this is not a data-loss bug. The problem this task closes is narrower and specifically about
observability: the queue-runner **job** reports success when the protocol's own definition of a
finished run (a PR, a `blocked` transition, or at minimum a pushed branch) never happened, so nobody
looking at Actions history can tell a real run from a wasted one, and repeated failures on the same
task burn cost (~$4-5/run) silently instead of surfacing as a pattern.

## Scope

**Does:**

- Add a verification step to `_flow-queue-runner.yml`'s `dispatch` job, running unconditionally
  after "Work the task" (i.e. not gated on `if: failure()` — it must also catch a worker that
  exits 0 having done nothing) and only when a task was actually picked
  (`steps.pick.outputs.task_id != ''`). It determines whether the claimed task reached one of
  three legitimate outcomes since the claim:
  1. a `flow/<id>-*` branch exists on `origin`, ahead of `origin/main`;
  2. an open PR exists for that branch/task id;
  3. the task file on `main` now has `status: blocked` with a non-empty `blocked_reason`.

  If none hold, the step fails the job, naming the task id and which of the three it checked for.
- Implement the check as a pure decision function (inputs: branch-exists, ahead-count,
  has-open-pr, task status + blocked_reason — the same injected-args shape `flow-recover.mjs`'s
  `classify` and `flow-open-pr.mjs`'s decision already use) plus a thin git/gh IO wrapper, in
  `project-template/.flow/bin/queue-runner-verify.mjs`, with canonical's adapter at
  `.flow/bin/queue-runner-verify.mjs` (imports the template's logic; supplies canonical's own
  paths — mirrors `release-guard.mjs`, not a copy).
- Follow the existing bootstrap-guard convention (see `_flow-open-pr.yml`'s "Decide whether to
  open a PR" step): if `.flow/bin/queue-runner-verify.mjs` doesn't exist in the calling repo's
  checkout, the new step no-ops with a clear message instead of failing — a repo that hasn't yet
  synced this helper must not have its queue-runner start failing on the next run.
- Tests for the pure function (all outcome combinations, including "task file not found") and for
  the canonical adapter resolving canonical's own `.flow/tasks/`/remote rather than the template's
  fixture store (the same assertion `.flow/bin/adapters.test.mjs` makes for its siblings).

**Deliberately does NOT:**

- Treat a `notes` entry alone (no branch, no PR, not blocked) as a passing outcome. The workflow's
  own existing prompt already tells the worker that pushing nothing "costs the whole run" even
  with a note left behind — a note is a good habit for the *next* worker picking the task back up,
  but it is not itself a finished or blocked outcome, so it must not silence this check.
- Change what `flow-recover` does with a stranded task. Its `reopen-pr` / `reset-to-ready`
  decisions are unchanged; this task only stops the *originating* job from lying about its own
  result.
- Retry the worker, raise `--max-turns`, or touch the worker's prompt/model/permissions.
- Touch `_flow-open-pr.yml` or `_flow-recover.yml` — that's the shape of the #32 proposal, kept
  separate (see overlap note in Notes).

## Acceptance criteria

- [ ] Given a run where the worker pushed no branch, opened no PR, and left the task `in_progress`
      with no `blocked` transition, when the verification step runs, then the job fails and the
      message names the task id and the three outcomes it checked for.
- [ ] Given a run where the worker pushed a `flow/<id>-*` branch ahead of `main` but opened no PR,
      when verification runs, then the job succeeds.
- [ ] Given a run where a PR is open for the task, when verification runs, then the job succeeds.
- [ ] Given a run where the worker set the task to `blocked` with a non-empty `blocked_reason`,
      when verification runs, then the job succeeds.
- [ ] Given a run where the worker appended a `notes` entry but pushed no branch and did not
      block, when verification runs, then the job still fails (see Scope).
- [ ] Given the pure decision function, when tested against every combination of
      {branch-exists, ahead>0, has-open-pr, status=blocked+reason}, then each returns the
      documented pass/fail verdict, including the "task file not found" edge case.
- [ ] Given the canonical adapter, when it resolves its paths, then it resolves canonical's own
      store and remote, not the template's fixture store.
- [ ] Given a checkout with no `.flow/bin/queue-runner-verify.mjs`, when the queue-runner runs,
      then the new step no-ops with a message rather than failing the job.
- [ ] Given `_flow-queue-runner.yml`, when parsed, then the new step is present in the `dispatch`
      job, is not gated on `if: failure()`, and is gated on `steps.pick.outputs.task_id != ''`.
- [ ] Given the repo after this change, when `npm run build`, `npm run lint`, `npm test` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved · build +
lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task linked,
criteria checklist ticked with the proving test named.

## Notes / open questions

- The "notes-alone is not sufficient" decision above is this proposal's one real judgment call —
  flagged rather than left implicit, per the readiness bar. If the human disagrees (i.e. wants a
  fresh `notes` entry to count as a soft-pass), that's a kickback on the PR; otherwise the criteria
  above stand as written.
- Touches overlaps flow-0026 (from issue #32) on `_flow-queue-runner.yml` — sequence, don't
  parallelize. `flow-doctor` will warn on this overlap between the two `ready` tasks; that warning
  is expected, not a defect.
