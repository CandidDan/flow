---
id: "flow-0132"
title: "The schedule gate names its caller workflow from a workflow_ref whose ref holds slashes, so a scheduled tick can list its own runs"
status: "in_progress"
priority: 1
project: "flow"
owner: "orchestrator-cowork-2026-10-05"
created: "2026-10-05"
started: "2026-10-05T01:00:00Z"
branch: "flow/flow-0132-schedule-gate-reads-workflow-name"
pr: "https://github.com/CandidDan/flow/pull/180"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-queue-runner.yml"
  - ".flow/bin/queue-runner-switch.test.mjs"
  - "changes/flow-0132.md"
labels: [flow-infra, queue-runner, hotfix]
notes:
  - "2026-10-05 orchestrator: the v3 canary's (progress) first scheduled queue-runner tick failed in schedule-gate, step 'Gather this workflow's earlier scheduled runs': `could not find any workflows named main` (run 37247213658). github.workflow_ref is `CandidDan/progress/.github/workflows/flow-queue-runner.yml@refs/heads/main`; `${WORKFLOW_REF##*/}` strips through the LAST slash, which is inside `refs/heads/main`, leaving `main`. Every scheduled tick on 3.0.0 therefore fails closed and dispatches nothing. Manual dispatch is unaffected (the gate is skipped). Blocks advancing the v3 alias. Fixed by the orchestrator directly, as flow-0124 was."
---

## Context

flow-0080's schedule gate lists the caller workflow's own earlier scheduled runs with
`gh run list --workflow "$file"`. It derives `$file` from `github.workflow_ref`, whose ref part is
`refs/heads/<branch>` — it contains slashes. The derivation strips to the last slash before
stripping the `@ref`, so `$file` is the branch name and `gh` fails. No unit test ran the line
against a real-shaped `workflow_ref`.

## Scope

- Strip `@<ref>` first, then the path, in the run-history step of `_flow-queue-runner.yml`.
- A test in `queue-runner-switch.test.mjs` that executes the step's exact derivation line in bash
  against `…/flow-queue-runner.yml@refs/heads/main` and a tag ref, and a mutation check that the
  old line yields `main`.
- Changelog fragment.

## Acceptance criteria

- [ ] The derivation line yields `flow-queue-runner.yml` for `@refs/heads/main` and `@refs/tags/v3.0.0`.
- [ ] The test fails against the old line (`${WORKFLOW_REF##*/}` first) and passes with the fix.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
