---
id: "flow-0126"
title: "flow-0105's fragment test reads its entry through changelog-entry.mjs, so the 3.0.0 release PR goes green"
status: "in_progress"
priority: 1
project: "flow"
owner: "orchestrator-cowork-2026-10-02"
created: "2026-10-02"
started: "2026-10-02T05:30:00Z"
branch: "flow/flow-0126-sync-default-ref-test-reads-changelog-entry"
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".flow/bin/sync-default-ref.test.mjs"
  - "changes/flow-0126.md"
labels: [flow-infra, release, changelog, hotfix]
notes:
  - "2026-10-02 orchestrator: found on release PR #172. Same class as flow-0123. The release-assemble check (flow-0090) did not catch it because sync-default-ref.test.mjs needs `yaml`, and that check runs in a job with no `npm ci`, so the test skipped there. Fixed by the orchestrator directly: one test, and it blocks the release."
---

## Context

`changelog-fragments.mjs --assemble` deletes `changes/<id>.md` once it has folded the fragment into
`CHANGELOG.md`. `sync-default-ref.test.mjs` read `changes/flow-0105.md` directly. That made it fail
on the 3.0.0 release PR (#172), in `flow-gates / gate`.

## Scope

- Read the entry with `changelogEntry(REPO, "flow-0105")`. The test file is canonical-only, so it uses a static import, as `sync-skills.test.mjs` does.
- The content assertions stay as they are.

## Acceptance

- `node --test .flow/bin/sync-default-ref.test.mjs` passes both with `changes/flow-0105.md` present and with it assembled into CHANGELOG.md.
