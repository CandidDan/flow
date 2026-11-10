---
id: "flow-0220"
title: "Flow goes to v5: template callers and flow-sync's fallback pin @v5, and VERSION moves to 5.0.0"
status: "done"
priority: 1
project: "flow"
owner: "claude/project-thread-8x6fo7"
created: "2026-11-10"
started: "2026-11-10T19:29:06Z"
branch: "claude/project-thread-8x6fo7"
pr: "https://github.com/CandidDan/flow/pull/306"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.github/workflows/*.yml"
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-init.mjs"
  - "project-template/.flow/bin/*.test.mjs"
  - ".flow/bin/*.test.mjs"
  - "VERSION"
  - "project-template/.flow/VERSION"
  - "docs/repinning-a-consuming-repo.md"
labels: [flow-infra, release, major, urgent]
model: "opus"
effort: "medium"
model_reason: "Mechanical repin with two precedents (flow-0125 for v3, flow-0179 for v4) and tests that check every pin"
notes:
  - "2026-11-10 (project thread, at Dan's request: 'Go for it' on cutting 5.0.0 and running flow-sync): release PR #305 (release/5.0.0) assembles the changelog into `## 5.0.0` and leaves VERSION at 4.2.0, the order 4.0.0 used (#261, then flow-0179). This task is the stamp and repin half. It declares no changelog fragment: the 5.0.0 opening paragraph in #305 already states the repin, so no final release-files PR is needed."
asks: []
---

## Context

5.0.0 is MAJOR: flow-0217 changed the `flow-gates.yml` and `flow-kickback.yml` callers and
retired `flow-review.yml`, and flow-0219 changed the `flow-done.yml` caller. The published
artefact has to say so. Every template caller and `_flow-sync.yml`'s default and fallback ref must
pin `@v5`, and both VERSION stamps must read 5.0.0. `caller-pins.test.mjs` and
`release-stamp.test.mjs` check that these agree, and `release-stamp.test.mjs` needs the
`## 5.0.0` section that #305 adds, so this lands after #305.

Precedent: flow-0179 (PR #264, `git show b699d92`) did exactly this for v4.

## Scope

- Every `project-template/.github/workflows/flow-*.yml` caller pins `_flow-<name>.yml@v5`.
- `_flow-sync.yml`'s `canonical_ref` default, the input description that advertises it, and its
  no-caller `FALLBACK_REF` become `v5`. Update any comment there that states the current major.
- `flow-init.mjs` writes `@v5` callers (it derives the pin from the stamp; prove it with the
  existing flow-init test).
- `VERSION` and `project-template/.flow/VERSION` read `5.0.0`.
- Tests that hard-code `v4` as the current major move to `v5`, or derive it from VERSION. Tests
  about earlier majors stay as they are.
- `docs/repinning-a-consuming-repo.md` gains a v4 to v5 section: run flow-sync at 5.0.

**Does not:** move or create any tag or alias, assemble the changelog (#305 does that), or change
any reusable's behaviour.

## Acceptance criteria

- [ ] `release-stamp.test.mjs` and `caller-pins.test.mjs` pass with VERSION 5.0.0, including
      "every template caller pins the major root VERSION declares".
- [ ] No `@v4` remains in `project-template/.github/workflows/`, nor in `_flow-sync.yml`'s default
      or fallback ref. The existing pin-scan test, or a grep test, proves it.
- [ ] Given an empty directory, when `flow-init` runs, then every caller it writes pins `@v5`
      (flow-init.test).
- [ ] The full canonical suite passes in CI: `npm test`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
