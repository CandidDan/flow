---
id: "flow-0179"
title: "Flow goes to v4: template callers and flow-sync's fallback pin @v4, and VERSION moves to 4.0.0, because flow-0174 deleted the queue-runner reusable"
status: "done"
priority: 1
project: "flow"
owner: "flow-0179-worker"
created: "2026-10-29"
started: "2026-10-29T04:28:00Z"
branch: "flow/flow-0179-go-to-v4"
pr: "https://github.com/CandidDan/flow/pull/264"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: "model-work-off-github-actions"
touches:
  - "project-template/.github/workflows/*.yml"
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-init.mjs"
  - "project-template/.flow/bin/*.test.mjs"
  - ".flow/bin/*.test.mjs"
  - "VERSION"
  - "project-template/.flow/VERSION"
  - "docs/repinning-a-consuming-repo.md"
  - "changes/flow-0179.md"
labels: [flow-infra, release, major, urgent]
model: "sonnet"
effort: "medium"
model_reason: "Mechanical repin with an existing precedent (flow-0125) and tests that check every pin"
asks: []
notes:
  - "2026-10-29 orchestrator: Dan chose to cut v4.0.0 once flow-0165, flow-0176 and flow-0178 merged; they have. Release PR #261 (release/4.0.0) assembles the changelog into `## 4.0.0` and leaves VERSION at 3.5.0, the same order 3.0.0 used (5941f6a, then flow-0125). This task is the stamp and repin half. Its own fragment is folded into 4.0.0 by a small final release-files PR before the tag."
---

## Context

Flow's versioning policy makes a change that needs a caller edit MAJOR. flow-0174 deleted
`_flow-queue-runner.yml`, so every downstream `flow-queue-runner.yml` caller must be deleted and
`flow-unblock.yml` loses `actions: write`. The release on `main` is therefore 4.0.0, and the
published artefact has to say so. Every template caller and `_flow-sync.yml`'s default and fallback
ref must pin `@v4`, and both VERSION stamps must read 4.0.0. `caller-pins.test.mjs` and
`release-stamp.test.mjs` check that these agree. Bumping only VERSION fails 10 tests, which is why
this cannot ride in the release PR (a release PR may change release files only).

Precedent: flow-0125 (PR #171) did exactly this for v3. Read its diff (`git show 81f4822`) first.

## Scope

- Every `project-template/.github/workflows/flow-*.yml` caller pins `_flow-<name>.yml@v4`.
- `_flow-sync.yml`'s `canonical_ref` default, the input description that advertises it, and its
  no-caller `FALLBACK_REF` become `v4`. Update any comment there that states the current major
  (for example the flow-0158 comment near line 500).
- `flow-init.mjs` writes `@v4` callers. flow-0058 makes it derive the pin from the stamp it copies,
  so this probably needs no edit; prove it with the existing flow-init test.
- `VERSION` and `project-template/.flow/VERSION` read `4.0.0`.
- Tests that hard-code `v3` as the current major move to `v4`, or better, derive it from VERSION.
  Tests about the v1→v2 or v2→v3 history stay as they are.
- `docs/repinning-a-consuming-repo.md` already has the v3→v4 section. Check that it matches what
  the sync actually does at `@v4`, and fix it only if it does not.
- Changelog fragment `changes/flow-0179.md`. It states the caller action: repin `@v3` to `@v4`,
  then run flow-sync, which deletes `flow-queue-runner.yml` and drops `actions: write` from
  `flow-unblock.yml`.

**Does not:** move or create any tag or alias, assemble the changelog (#261 does that), or change
any reusable's behaviour.

## Acceptance criteria

- [ ] `release-stamp.test.mjs` and `caller-pins.test.mjs` pass with VERSION 4.0.0, including
      "every template caller pins the major root VERSION declares".
- [ ] No `@v3` remains in `project-template/.github/workflows/`, nor in `_flow-sync.yml`'s default
      or fallback ref. The existing pin-scan test, or a grep test, proves it.
- [ ] Given an empty directory, when `flow-init` runs, then every caller it writes pins `@v4`
      (flow-init.test).
- [ ] The full canonical suite passes in CI: `npm test`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
