---
id: "flow-0124"
title: "Canonical's own queue-runner caller grants actions: read, and the caller-permissions test checks job-level grants too"
status: "done"
priority: 1
project: "flow"
owner: "orchestrator-cowork-2026-10-02"
created: "2026-10-02"
started: "2026-10-02T04:09:52Z"
branch: "flow/flow-0124-canonical-runner-grants-actions-read"
pr: "https://github.com/CandidDan/flow/pull/169"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/flow-queue-runner.yml"
  - ".flow/bin/adapters.test.mjs"
  - "changes/flow-0124.md"
labels: [flow-infra, queue-runner, hotfix]
notes:
  - "2026-10-02 orchestrator: canonical's queue runner has hit startup_failure on every dispatch since flow-0080 (PR #161) merged; the first was run 36960907776 dispatching flow-0118. #161 gave the reusable's schedule-gate job a job-scoped `actions: read` and added it to the TEMPLATE caller, but canonical's own caller (`.github/workflows/flow-queue-runner.yml`, pinned @main) still grants only contents, pull-requests and id-token. A reusable cannot raise a scope above its caller's grant, so GitHub refuses to start the run. adapters.test.mjs 'every new caller grants at least the permissions its reusable declares' did not catch it, because it reads only the reusable's TOP-LEVEL permissions, and #161 deliberately kept actions: read job-scoped. Fixed by the orchestrator directly because it stops every canonical dispatch."
---

## Context

GitHub refuses to start a run (`startup_failure`, no jobs) when a reusable workflow's job asks for
a permission its caller did not grant. flow-0080 added `actions: read` to the reusable's
`schedule-gate` job and to the template caller. Canonical's own caller was not updated, and its
test only compares top-level permissions.

## Scope

- Add `actions: read` to the job permissions in canonical's `.github/workflows/flow-queue-runner.yml`,
  with the same comment the template caller has.
- In adapters.test.mjs, compute "required" as the union of the reusable's top-level permissions and
  every job's `permissions`, so a job-scoped grant the caller lacks fails the test.

## Acceptance criteria

- [ ] Canonical's flow-queue-runner caller grants `actions: read`.
- [ ] The caller-permissions test fails when that line is removed (checked by hand, and stated in
      the PR body), and passes with it.
- [ ] Every other caller in ADDED still passes the widened test unchanged.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
