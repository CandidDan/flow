---
id: "flow-0125"
title: "Flow goes to v3: template callers, flow-init and flow-sync's fallback pin @v3, and VERSION moves to 3.0.0, because flow-0080 changed the queue-runner caller contract"
status: "blocked"
priority: 1
project: "flow"
owner: "claude-worker"
created: "2026-10-02"
started: "2026-10-02T04:41:59Z"
branch: "flow/flow-0125-go-to-v3"
pr: "https://github.com/CandidDan/flow/pull/171"
issue: ""
blocked_reason: "VERSION 3.0.0 cannot go green without a `## 3.0.0` section in CHANGELOG.md, and CHANGELOG.md is not in `touches` — the task excludes it ('Does not: assemble the changelog (the release PR does)'). `release-stamp.test.mjs` 'the changelog carries a section named by the root stamp, and it is not empty' looks the section up BY the stamp, so bumping the stamp first is a half-release by that test's definition and `main` goes red the moment this merges. Three tests fail, one cause: release-stamp 'section named by the root stamp' + 'every entry in the stamp's section names its caller action', and release-assemble 'after a release assembles the fragments...', which only reports the other two. Everything else is green: 1769/1773 pass, build and lint clean. NOT fixable in scope and NOT fixable by weakening the test: it is the check that catches a release shipping unannounced, and acceptance criterion 1 requires it to pass. Needs a HUMAN ORDERING DECISION, which is why this is not machine-checkable — two resolutions, both one edit away: (A) add `CHANGELOG.md` to this task's `touches` on `main` and I carry the `## 3.0.0` section in this PR alongside the pins, or (B) land release/3.0.0's CHANGELOG section FIRST and I rebase. (B) is verified green, not assumed: probed locally with a `## 3.0.0` section against VERSION 2.2.0 and release-stamp passes, because the test only looks up the section the stamp names and never the reverse. (B) also keeps the task's own stated split intact, so it is the smaller change of the two."
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
labels: [flow-infra, release, major, urgent]
notes:
  - "2026-10-02 orchestrator: Dan approved the MAJOR bump ('v3 makes sense') and asked for this to be set ready and labelled urgent."
  - "2026-10-02 orchestrator: preparing the next release found that it is MAJOR, not 2.3.0. flow-0080 (PR #161) made the flow-queue-runner CALLER grant `actions: read`; without that grant GitHub refuses the run at startup, which is what canonical hit until flow-0124. docs/flow-versioning-policy.md: 'if a change requires editing the per-repo callers, it is MAJOR'. The 1.3.0 incident (CHANGELOG 2.0.0) is this exact mistake. Moving `v2` onto this tree would break every repo pinned @v2 whose caller lacks the grant: tanplan-platform today, and the external test user's repo. release-stamp.test.mjs checks that every template caller pins the major the root VERSION declares, so the re-pin and the VERSION bump must land together. That is this task. The release PR that follows touches only CHANGELOG.md and changes/, and the orchestrator has it prepared locally on release/3.0.0. DECISION: v2 stays on 2.2.0 and is never moved onto this tree; repos opt in to @v3 via flow-sync, whose PR carries the caller edits including `actions: read`."
  - "2026-10-02 claude-worker: branch `flow/flow-0125-go-to-v3` pushed. DONE: all ten template callers pin `@v3`; `_flow-sync.yml` default description + `FALLBACK_REF` are `v3`; both stamps read 3.0.0; `changes/flow-0125.md` written; `caller-pins.test.mjs`'s hypothetical-next-major case now derives the bumped stamp instead of hard-coding 3.0.0 (it was itself the stale literal). flow-init.mjs needed NO edit — flow-0058 already derives the pin from the stamp it copies. NOT done: `docs/repinning-a-consuming-repo.md` v2-to-v3 step. BLOCKER FOUND, see next note."
  - "2026-10-02 claude-worker: BLOCKED on the above, after finishing everything else. Branch `flow/flow-0125-go-to-v3` pushed (draft PR #171), 3 commits, gate green except the three changelog-coupled tests. DONE and proven: ten template callers `@v3`; `_flow-sync.yml` description + `FALLBACK_REF` `v3` (+ the one comment that stated the old value); both stamps 3.0.0; `changes/flow-0125.md`; `docs/repinning-a-consuming-repo.md` v2-to-v3 section with the `actions: read` step, plus a new derived test in `caller-pins.test.mjs` proving it; caller-pins' hypothetical-next-major case now DERIVES the bumped stamp (as the literal 3.0.0 it was itself the stale stamp that file refuses, and it went red today). NO EDIT NEEDED: `flow-init.mjs` (flow-0058 already derives the pin from the stamp it copies \u2014 criterion 3 passes via flow-init.test as-is) and the template queue-runner `actions: read` grant (criterion 4 already true, proven by `queue-runner-switch.test.mjs`: `wf.jobs['schedule-gate'].permissions.actions === 'read'`). EXACT NEXT ACTION for the orchestrator: pick (A) or (B) in `blocked_reason`. For (A) add `CHANGELOG.md` to `touches` and set status back to `ready`; for (B) merge release/3.0.0's CHANGELOG section, then set `ready` \u2014 either way the next worker rebases `flow/flow-0125-go-to-v3`, re-runs `npm test` (expect 1773/1773) and marks PR #171 ready. Do NOT redo the branch; it is complete bar this one coupling."
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
