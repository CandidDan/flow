---
id: "flow-0153"
title: "A test pins which reusable workflows may grant `actions: write`, so widening who can start the worker is a reviewed change"
status: "done"
priority: 3
project: "flow"
owner: "claude"
created: "2026-10-21"
started: "2026-10-21T01:38:38Z"
branch: "flow/flow-0153-actions-write-scope"
pr: "https://github.com/CandidDan/flow/pull/216"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".flow/bin/actions-write-scope.test.mjs"
  - "changes/flow-0153.md"
labels: [security, queue-runner]
notes:
  - "2026-10-21 (orchestrator): from the security gate on PR #213 (flow-0152). Since flow-0152, any workflow in a repo that dispatches with GITHUB_TOKEN can start the bypassPermissions worker, and dispatching needs `actions: write`. Pinning which reusables may hold it makes widening that set a deliberate, reviewed edit."
model: "sonnet"
model_reason: "one static test over workflow YAML"
asks: []
---

## Context

flow-0152 let `github-actions[bot]` start the queue-runner worker. The real boundary is therefore
"any workflow in the repo that holds `actions: write` and dispatches with GITHUB_TOKEN". Today only
`_flow-unblock.yml` (and the runner itself) should need it.

## Scope

**Does:** add `.flow/bin/actions-write-scope.test.mjs`. It parses every `.github/workflows/_flow-*.yml`
and fails if any workflow- or job-level `permissions` grants `actions: write` outside an explicit
allowlist in the test (the current holders, each with a one-line reason). Add the changelog fragment.

**Not in scope:** changing any workflow's permissions.

## Acceptance criteria

- [ ] Given today's reusable workflows, when the test runs, then it passes, and its allowlist names
      exactly the workflows that grant `actions: write` today, each with a reason.
- [ ] Given a copy of a reusable workflow with `actions: write` added to a job, when the test's
      checker runs over it, then it fails naming the file and the job.
- [ ] Given `permissions: write-all` on a workflow not in the allowlist, when the checker runs,
      then it fails (write-all implies actions: write).
- [ ] `changes/flow-0153.md` exists and states caller action: none.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
