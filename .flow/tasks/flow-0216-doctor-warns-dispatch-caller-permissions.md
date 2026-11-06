---
id: "flow-0216"
title: "flow-doctor warns when the flow-dispatch caller's job has no permissions block, because the reusable now inherits whatever the caller grants"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-11-06"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Parked by queue cap at creation (Dan, 2026-11-06: follow-ups from PR #297). Not machine-checkable: flip to ready when the ready count drops below the cap."
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - ".flow/bin/flow-doctor.mjs"
  - "changes/flow-0216.md"
labels: [doctor, dispatch, security]
model: "sonnet"
effort: "medium"
notes:
  - "2026-11-06 (session_01NfrcU9iRVh8RVpDF6wsSzV): from the Medium security note on PR #297 (flow-0211), at Dan's request. flow-0120 will make flow-status follow the same callers-grant pattern; extending this warning to that caller belongs to flow-0120 or a later task, not this one."
asks: []
---

## Context

Since flow-0211 (PR #297), `.github/workflows/_flow-dispatch.yml` declares no `permissions:`. It
inherits whatever its caller, `.github/workflows/flow-dispatch.yml` in the consuming repo, grants
on the `flow-dispatch` job. This was Dan's decision ("callers grant, the reusable inherits"), so
that a repo whose caller has not been synced keeps dispatching.

The synced caller grants exactly `contents: read` and `issues: write`, and tests pin that. The
gap: a repo that hand-edits its caller and removes the job's `permissions:` block gives the
reusable the repo's default token scope, which can be write-all. Before flow-0211, the
reusable's own `permissions: contents: read` capped that. Nothing tells the owner today.

## Scope

1. `flow-doctor` reads `.github/workflows/flow-dispatch.yml` in the repo it checks. When the file
   exists and its `flow-dispatch` job has no `permissions:` key, and the file has no top-level
   `permissions:` key either, the doctor prints one **warning** (not a problem: it must not turn
   a repo's gate red). The warning names the file and says, in plain English, that the job then
   runs with the repo's default token scope and should grant `contents: read` and
   `issues: write`.
2. No file, or a job that declares any `permissions:`, gives no warning. The doctor does not judge
   the values: the tests on canonical's shipped callers already pin them.
3. Follow the doctor's existing style: a line scan, no YAML dependency. Export the new check as a
   pure function that takes the file's text, and re-export it from canonical's adapter
   `.flow/bin/flow-doctor.mjs` (the adapters test requires every named export to be re-exported).
4. Changelog fragment `changes/flow-0216.md`. Caller action: none.

**Does not touch:** the workflows themselves; any other caller (`flow-status` gets the same
pattern in flow-0120, and is left for that task); the doctor's problems list.

## Acceptance criteria

- [ ] Given a `flow-dispatch.yml` whose `flow-dispatch` job has no `permissions:` and no
      top-level `permissions:`, then the doctor returns exactly one warning naming
      `.github/workflows/flow-dispatch.yml`, and no problem. Proved by `flow-doctor.test.mjs`.
- [ ] Given the caller exactly as `project-template/.github/workflows/flow-dispatch.yml` ships it,
      then no warning. Proved by `flow-doctor.test.mjs`, reading that file.
- [ ] Given a top-level `permissions:` and none on the job, or no `flow-dispatch.yml` at all, then
      no warning. Proved by `flow-doctor.test.mjs`.
- [ ] `changes/flow-0216.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
