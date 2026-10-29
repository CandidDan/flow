---
id: "flow-0165"
title: "Remove the flightdeck and the watchdog from canonical: inflight is where state is viewed, and the watchdog has failed every day for a week"
status: "in_review"
priority: 3
project: "flow"
owner: "worker-flow-0165"
created: "2026-10-27"
started: "2026-10-28T23:22:15Z"
branch: "flow/flow-0165-remove-flightdeck"
pr: "https://github.com/CandidDan/flow/pull/242"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
asks: []
serves: ["maintenance"]
intent: ""
model: "sonnet"
effort: "medium"
model_reason: "Deletion plus one small inline move; canonical-only, nothing published changes"
touches:
  - "flightdeck/**"
  - ".github/workflows/flow-watchdog.yml"
  - ".flow/bin/plane-guard.mjs"
  - ".flow/bin/plane-guard.test.mjs"
  - ".github/workflows/plane-guard.yml"
  - ".flow/bin/adapters.test.mjs"
  - ".flow/bin/adr-mission-control.test.mjs"
  - ".flow/bin/protocol-docs.test.mjs"
  - ".flow/bin/flow-state.mjs"
  - ".flow/config.yml"
  - "package.json"
  - ".gitignore"
  - "CLAUDE.md"
  - "README.md"
  - ".flow/bin/action-pins.test.mjs"
  - ".flow/bin/adr-split-authoring.test.mjs"
  - ".flow/bin/release-assemble.test.mjs"
  - "project-template/.flow/bin/source-roots.test.mjs"
labels: [canonical, cleanup, cost]
notes:
  - "2026-10-27 (orchestrator, Dan's answer): decision answered, touches widened to action-pins.test.mjs, adr-split-authoring.test.mjs, release-assemble.test.mjs and project-template/.flow/bin/source-roots.test.mjs (canonical-specific fixture expectations only). Blocked on flow-0164 so the two land in order; flow-unblock releases it when 0164 is done. Ships in 3.6.0."
  - "2026-10-27 (worker): branch flow/flow-0165-remove-flightdeck pushed with all in-scope work done (deletions, codeSpan inlined, config/package/CLAUDE/README/tests). Gate: build+lint green; npm test has 6 failures, all from the 4 out-of-touches files in blocked_reason (plus ADR-0006 path test in adr-mission-control.test.mjs, in touches, needs a filter for deleted paths). Next: once touches widened, fix those tests (drop flow-watchdog/flightdeck expectations; source-roots test: 3 roots), rerun coverage, open PR."
  - "2026-10-27 (orchestrator): Dan does not use the flightdeck. It runs no model, so the cost is not tokens: it is a daily 7-minute watchdog run that has failed 2026-10-24..26 and filed an automation-down issue on itself (#205), plus ~13 files of code and tests every gate run carries. inflight holds its own copies of liveness.mjs / mission-control.mjs and imports nothing from here (checked 2026-10-27)."
  - "2026-10-27 (Dan via orchestrator): sequenced after flow-0166 so the p1 Node security fix is not held behind this cleanup. On rebase, flow-watchdog.yml will carry 0166's check-latest edit: delete it anyway."
---

## Context

`flightdeck/` (rendered page, `mission-control.mjs`, `flightdeck-state.mjs`, `liveness.mjs`,
`watchdog.mjs`, the `portfolio-manager` agent, `projects.yml`) and its one scheduled workflow
`.github/workflows/flow-watchdog.yml` were canonical's cross-project view. ADR-0006 moved mission
control to its own repo, inflight, which is self-contained. What is left here is unused, and the
watchdog is red daily.

One live dependency: `.flow/bin/plane-guard.mjs` imports `codeSpan` from
`flightdeck/bin/watchdog.mjs` (line 55), and `plane-guard.test.mjs` line 1193 pins that import.

## Scope

1. Delete `flightdeck/` entirely and `.github/workflows/flow-watchdog.yml`.
2. Move `codeSpan` into `plane-guard.mjs` (same behaviour), and update the test that pinned the
   import so it asserts the function's behaviour instead. Drop the `plane-guard.yml` comment that
   names the watchdog import.
3. Remove `flightdeck/` from `package.json` (`test` glob, c8 `include`), from `.flow/config.yml`
   `source_roots` (and its comment), and `flightdeck/projects.yml` from `.gitignore`.
4. Tests that exercise the flightdeck (`adapters.test.mjs`'s flightdeck-state cases and its
   source-roots list, `adr-mission-control.test.mjs`'s checks that `flightdeck/` files exist,
   `protocol-docs.test.mjs`'s board/flightdeck comment) lose the flightdeck-specific cases. Tests
   that check **ADR wording** stay: the ADRs are history and are not edited.
5. `CLAUDE.md` (canonical's): remove the `flightdeck/` row, the "flightdeck supersedes it" wording
   in the board-builder and "No `.flow/board.html`" bullets, and the `npm test` row's flightdeck
   clause. `README.md`: drop the flightdeck section. `flow-state.mjs`: reword the header comment
   so it no longer names `flightdeck-state.mjs` as its caller; behaviour unchanged.

**Deliberately does NOT:**
- Touch anything under `project-template/` or any `_flow-*.yml` reusable. Nothing published changes,
  so no changelog fragment and no release.
- Edit `docs/adr/`, or `release-publish.mjs` / its tests. Their `flightdeck/` mentions are an
  exclusion-list entry and synthetic fixtures, harmless once the directory is gone.
- Close issue #205. That happens by hand once this merges.
- Touch inflight.

## Acceptance criteria

- [ ] Given the repo after this change, when tracked files are listed, then nothing under `flightdeck/` and no `.github/workflows/flow-watchdog.yml` exists (`adapters.test.mjs`).
- [ ] Given `plane-guard.mjs`, when its source is read, then it imports nothing from `flightdeck/`, and `codeSpan` gives the same output as before for a plain string, a string containing backticks, and an empty string (`plane-guard.test.mjs`).
- [ ] Given `.flow/config.yml` and `package.json`, when parsed, then neither names `flightdeck`, and every declared source root exists on disk (`adapters.test.mjs`).
- [ ] Given `CLAUDE.md`, when read, then it does not contain `flightdeck` (`protocol-docs.test.mjs`).
- [ ] `npm run build`, `lint`, `test` and `coverage` (floor 83.5) all pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

Removing well-covered flightdeck code can move total coverage either way. If it falls under 83.5,
add tests to what remains; never lower the floor. If that cannot be done inside `touches`, block.

Sequencing: disjoint from flow-0164's `touches` (checked: 0164 takes the template, `_flow-*.yml`,
`.gitattributes` and its own tests; 0165 takes `CLAUDE.md`, `README.md` and `flightdeck/`), so the
two can run in either order.
