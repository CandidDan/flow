---
id: "flow-0138"
title: "The task-template intent test runs in canonical only, so an adopting repo's own task template cannot fail flow-tooling"
status: "in_review"
priority: 1
project: "flow"
owner: "orchestrator-cowork-2026-10-08"
created: "2026-10-08"
started: "2026-10-08T00:41:40Z"
branch: "flow/flow-0138-intent-template-test-canonical-only"
pr: "https://github.com/CandidDan/flow/pull/189"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "changes/flow-0138.md"
labels: [flow-infra, hotfix, urgent]
notes:
  - "2026-10-08 (orchestrator): URGENT, applied by Dan 2026-10-08 (bypasses queue_cap). ORIGIN: every 3.2.0 sync PR (write#149, later#39, Nudge#336, inflight#51, progress#124, tanplan-platform#76) fails flow-tooling on one test, 'flow-0074 criterion 9' (flow-doctor.test.mjs). It reads `.flow/tasks/_TEMPLATE.md` relative to the test. In canonical that is project-template's template. In an adopting repo it is the repo's OWN template, which flow-sync never touches, so it has no `intent:` and the assertion fails. This is the flow-0133 class of bug again (3.1.0 → 3.1.1), and the test's own comment says the template is not synced. Blocks the 3.2.0 rollout, which carries the Actions cost fix (flow-0136)."
---

## Context

flow-0074's criterion-9 test checks that the task template ships `intent: ""`. It skips only when
no template file exists beside it. Every adopting repo has its own template there, and flow-sync
does not update it, so the test runs against the wrong file and fails in all of them.

## Scope

- Run the criterion-9 test only from canonical's `project-template/` (the `inCanonical` check this
  file already uses), and skip it visibly elsewhere, saying why.
- A test that fails if criterion 9 stops running in canonical.
- Changelog fragment.

**Does not touch:** the template, flow-doctor's logic, any other test.

## Acceptance criteria

- [ ] From canonical, the criterion-9 test still runs and checks `project-template/.flow/tasks/_TEMPLATE.md`.
- [ ] From an adopting layout (template copied to a repo root with its own `_TEMPLATE.md` lacking
      `intent:`), the test skips with a reason that names the repo-owned template, and the file passes.
- [ ] A canonical-only test fails if criterion 9's skip condition ever becomes true in canonical.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
