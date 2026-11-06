---
id: "flow-0211"
title: "When a ready task cannot be started because its model tier has no routine, the owner is told once, in an issue, instead of every run skipping green"
status: "in_progress"
priority: 1
project: "flow"
owner: "session_01NfrcU9iRVh8RVpDF6wsSzV"
created: "2026-11-04"
started: "2026-11-06T02:36:41Z"
branch: ""
pr: ""
issue: "https://github.com/CandidDan/flow/issues/289"
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G10"]
intent: "model-work-off-github-actions"
touches:
  - "project-template/.flow/bin/flow-dispatch.mjs"
  - "project-template/.flow/bin/flow-dispatch.test.mjs"
  - ".github/workflows/_flow-dispatch.yml"
  - ".flow/bin/flow-dispatch-workflow.test.mjs"
  - ".flow/bin/actions-write-scope.test.mjs"
  - "docs/flow-routines.md"
  - "changes/flow-0211.md"
labels: [dispatch, routines]
model: "opus"
effort: "high"
model_reason: "Changes a reusable workflow every adopter runs hourly, and gives it write access to issues"
notes: []
asks: []
---

## Context

`flow-dispatch` picks the next ready task and fires the model-tier routine that should work it.
When the repo has no routine configured for that task's tier (`FLOW_ROUTINE_<TIER>_ID` or
`_TOKEN` missing), it logs `decision=skipped reason=no-routine-for-<tier>` and exits 0. That is
deliberate: the header says "A repo that has not set up routines stays green".

The result in CandidDan/tanplan-platform (issue #289, item 4): of the last 38 dispatch runs with
readable logs, 29 skipped with `no-routine-for-sonnet` (25) or `no-routine-for-opus` (4), and the
other 9 were `at-capacity`. Not one task has ever been started automatically, and every run was
green. The owner had no way to know. This is a green result that did nothing, the failure Flow
exists to prevent.

Runs must not go red every hour in a repo that has simply not set up routines yet. So the fix is
not a failing run. It is one message that reaches the owner and goes away by itself once the
problem is fixed.

## Scope

1. When dispatch skips with `no-routine-for-<tier>`, it makes sure **one** open issue exists in
   the repo saying so. Its title names the tier, for example "Flow cannot start sonnet tasks: no
   routine is configured for the sonnet tier". Its body says, in plain English: how many ready
   tasks use that tier and which ones (ids), which two settings are missing (by name, never a
   value), and the one place to fix it (`docs/flow-routines.md`). The issue carries a fixed label
   that dispatch uses to find it again (for example `flow-dispatch`).
   - If that issue is already open, dispatch updates its body (current count and ids) and opens
     no second one. One issue per tier, never one per run.
   - When a later run fires a routine for that tier successfully, dispatch closes the tier's
     issue with a one-line comment saying it started a task.
2. The run itself stays green for this skip, and its job summary shows the skip reason and the
   issue link, so the run page is not silent either.
3. `_flow-dispatch.yml` gains exactly the permission this needs (`issues: write`), and nothing
   else. Update `.flow/bin/actions-write-scope.test.mjs` to allow it for this workflow only.
4. `docs/flow-routines.md`: say what the issue means and that it closes itself.
5. Changelog fragment `changes/flow-0211.md`. Caller action: none; the issue appears on the next
   dispatch run in any repo with ready tasks on a tier that has no routine.

**Does not touch:** which routine is fired or how (fleet-wide routines are issue #289's main
question, being explored separately); the other skip reasons (`at-capacity`, `nothing-ready`,
`no-longer-ready`) stay silent, because they are normal; `flow-doctor` (it runs in the gate,
which cannot see secrets, so it cannot tell whether a routine is configured).

## Acceptance criteria

- [ ] Given a ready sonnet task and no sonnet routine settings, when dispatch runs, then it exits
      0, and exactly one open issue with the fixed label names the sonnet tier, the task id and
      the two missing setting names. Proved by `flow-dispatch.test.mjs` with the GitHub calls
      replaced by a fake.
- [ ] Given that issue is already open, when dispatch runs again with two ready sonnet tasks, then
      no second issue is opened and the existing one lists both ids. Proved by
      `flow-dispatch.test.mjs`.
- [ ] Given an open sonnet issue, when a run fires the sonnet routine successfully, then the
      issue is closed with a comment. Proved by `flow-dispatch.test.mjs`.
- [ ] Given skips for `at-capacity`, `nothing-ready` or `no-longer-ready`, then no issue is opened
      or changed. Proved by `flow-dispatch.test.mjs`.
- [ ] The issue body never contains a routine token or id value, only setting names. Proved by
      `flow-dispatch.test.mjs`, with a fake env holding a recognisable token value that must not
      appear in any request.
- [ ] If the GitHub issue calls fail, then dispatch still exits 0 for this skip, and the job
      summary says the issue could not be written. Proved by `flow-dispatch.test.mjs`.
- [ ] Given `_flow-dispatch.yml`, then it grants `issues: write` and no other new permission.
      Proved by `.flow/bin/flow-dispatch-workflow.test.mjs` and
      `.flow/bin/actions-write-scope.test.mjs`.
- [ ] `changes/flow-0211.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
