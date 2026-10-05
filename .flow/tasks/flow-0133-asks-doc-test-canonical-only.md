---
id: "flow-0133"
title: "The asks prose test checks the template's CLAUDE.md and task template only in canonical, so an adopting repo's own files cannot fail flow-tooling"
status: "done"
priority: 1
project: "flow"
owner: "orchestrator-cowork-2026-10-05"
created: "2026-10-05"
started: "2026-10-05T04:40:00Z"
branch: "flow/flow-0133-asks-doc-test-canonical-only"
pr: "https://github.com/CandidDan/flow/pull/182"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "project-template/.flow/bin/asks.test.mjs"
  - "changes/flow-0133.md"
labels: [flow-infra, hotfix]
notes:
  - "2026-10-05 orchestrator: every 3.1.0 sync PR (write #132, later #33, Nudge #328, inflight #42, tanplan-platform #53) fails flow-tooling on asks.test.mjs 'criterion 7' (tests 73-76). The test reads CLAUDE.md and .flow/tasks/_TEMPLATE.md relative to project-template/. In canonical those are the template's files; in an adopting repo the same relative path is the repo's own root CLAUDE.md and its own task template, which flow-sync deliberately never touches. Only .flow/PROTOCOL.md is synced. Blocks the v3 rollout."
---

## Context

flow-0119's criterion-7 tests assert that three documents teach the notes/asks split. The test
resolves them relative to `project-template/`, which in canonical is the template and in an
adopting repo is the repo root. Two of the three files are repo-owned there and never synced.

## Scope

- Check `CLAUDE.md` and `.flow/tasks/_TEMPLATE.md` only when the test runs from canonical's
  `project-template/`. In an adopting repo, check the synced `.flow/PROTOCOL.md` only.
- A canonical-only test that fails if canonical ever stops checking all three.
- Changelog fragment.

## Acceptance criteria

- [ ] From canonical, the criterion-7 tests check all three documents (as before).
- [ ] From an adopting repo (template copied to a repo root with its own CLAUDE.md), they check PROTOCOL.md only and pass.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
