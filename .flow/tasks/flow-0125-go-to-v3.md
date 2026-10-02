---
id: "flow-0125"
title: "Flow goes to v3: template callers, flow-init and flow-sync's fallback pin @v3, and VERSION moves to 3.0.0, because flow-0080 changed the queue-runner caller contract"
status: "blocked"
priority: 1
project: "flow"
owner: ""
created: "2026-10-02"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Not machine-checkable: waits on Dan's go-ahead to make the next release MAJOR (3.0.0) rather than 2.3.0. When he agrees, set ready. queue_cap (8) is already exceeded, so he may need to label it urgent."
blocked_by: []
serves: ["maintenance"]
touches:
  - "project-template/.github/workflows/*.yml"
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-init.mjs"
  - "project-template/.flow/bin/*.test.mjs"
  - ".flow/bin/*.test.mjs"
  - "VERSION"
  - "project-template/.flow/VERSION"
  - "docs/repinning-a-consuming-repo.md"
  - "changes/flow-0125.md"
labels: [flow-infra, release, major]
notes:
  - "2026-10-02 orchestrator: preparing the next release found that it is MAJOR, not 2.3.0. flow-0080 (PR #161) made the flow-queue-runner CALLER grant `actions: read`; without that grant GitHub refuses the run at startup, which is what canonical hit until flow-0124. docs/flow-versioning-policy.md: 'if a change requires editing the per-repo callers, it is MAJOR'. The 1.3.0 incident (CHANGELOG 2.0.0) is this exact mistake. Moving `v2` onto this tree would break every repo pinned @v2 whose caller lacks the grant: tanplan-platform today, and the external test user's repo. release-stamp.test.mjs checks that every template caller pins the major the root VERSION declares, so the re-pin and the VERSION bump must land together. That is this task. The release PR that follows touches only CHANGELOG.md and changes/, and the orchestrator has it prepared locally on release/3.0.0. DECISION: v2 stays on 2.2.0 and is never moved onto this tree; repos opt in to @v3 via flow-sync, whose PR carries the caller edits including `actions: read`."
---

## Context

Flow's versioning policy makes a change that needs a caller edit MAJOR, so it cannot slide onto a
fleet through the `vX` alias. flow-0080 added `actions: read` to the queue-runner caller. The
release now on `main` is therefore 3.0.0, and the published artefact has to say so: every template
caller, `flow-init`, and `_flow-sync.yml`'s fallback ref must pin `@v3`, and VERSION must read
3.0.0. `release-stamp.test.mjs` enforces that these agree.

## Scope

- Every `project-template/.github/workflows/flow-*.yml` caller pins `_flow-<name>.yml@v3`.
- `_flow-sync.yml`'s `canonical_ref` default and its fallback ref become `v3`, including the input
  description that advertises the default.
- `flow-init.mjs` writes `@v3` callers.
- `VERSION` and `project-template/.flow/VERSION` read `3.0.0`.
- Tests that hardcode `v2` as the current major move to `v3`. Tests about the v1-to-v2 history stay
  as they are.
- `docs/repinning-a-consuming-repo.md` gains the v2-to-v3 step, which is the `actions: read` grant
  on flow-queue-runner.
- Changelog fragment `changes/flow-0125.md`, which states the caller action.

**Does not:** move any tag or alias, assemble the changelog (the release PR does), or change any
reusable's behaviour.

## Acceptance criteria

- [ ] `release-stamp.test.mjs` "every template caller pins the major root VERSION declares" and its
      siblings pass with VERSION 3.0.0.
- [ ] No `@v2` remains in `project-template/.github/workflows/` or in `_flow-sync.yml`'s default or
      fallback (a grep test, or the existing pin-scan test).
- [ ] `flow-init` on an empty directory produces callers pinned `@v3` (flow-init.test).
- [ ] The template flow-queue-runner caller grants `actions: read` (already true; asserted by
      adapters/caller tests).
- [ ] The full canonical suite passes: `npm test`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
