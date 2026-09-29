---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0098"
title: "Tests find a task's changelog entry whether it is still a fragment or already assembled, so the 2.1.2 release gate is green"
status: "in_review"
priority: 1
project: "flow"
owner: "orchestrator"
created: "2026-09-29"
started: "2026-09-29"
branch: "flow/flow-0098-changelog-entry-helper"
pr: "https://github.com/CandidDan/flow/pull/129"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - ".flow/bin/changelog-entry.mjs"
  - ".flow/bin/changelog-entry.test.mjs"
  - ".flow/bin/flow-pat-forwarding.test.mjs"
  - ".flow/bin/canonical-helpers-workflow.test.mjs"
  - "changes/flow-0098.md"
labels: [release, testing, flow-infra]
notes:
  - "2026-09-29 (orchestrator): Written and built by the orchestrator to unblock 2.1.2, kept as a task PR so the release PR stays release-files-only (the rule flow-0089 will enforce). Assembling 2.1.2's fragments turned three tests red: flow-0093's and flow-0095's in `flow-pat-forwarding.test.mjs` and flow-0094's in `canonical-helpers-workflow.test.mjs`, each reading `changes/<id>.md`, which `--assemble` deletes. Fourth and fifth occurrence of the pattern (0069, 0073, 0050 before). flow-0090 remains the systemic gate; this adds the shared helper it can build on."
---

## Context

`changes/<task-id>.md` holds a task's changelog entry until a release runs
`changelog-fragments.mjs --assemble`, which folds it into `CHANGELOG.md` and deletes the file.
Tests that read the fragment directly go red on every release.

## Scope

**Does:** add canonical-only `.flow/bin/changelog-entry.mjs` exporting
`changelogEntry(repo, id)`: the fragment's text if `changes/<id>.md` exists, otherwise the
assembled entry from `CHANGELOG.md` (the bullet whose file list ends `, <id>)` plus any following
bullets of the same entry, stopping at the next entry naming another task or the next `## `
heading), otherwise `""`. Switch the three tests above to it. Fragment `changes/flow-0098.md`
(**Caller action: none**).

**Does not touch:** `changelog-fragments.mjs`, any helper under `project-template/`, flow-0090's
gate.

## Acceptance criteria

- [ ] Given a repo with `changes/flow-9999.md`, then `changelogEntry` returns its text.
- [ ] Given no fragment and a CHANGELOG bullet ending `, flow-9999)` followed by a second bullet
      of the same entry and then another task's bullet, then it returns the first two bullets only.
- [ ] Given the entry is last before a `## ` heading, then the heading is not included.
- [ ] Given neither, then it returns `""`.
- [ ] The flow-0093, flow-0094 and flow-0095 changelog tests use `changelogEntry` and pass both
      before and after `--assemble`.
- [ ] `changes/flow-0098.md` exists and states "Caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
