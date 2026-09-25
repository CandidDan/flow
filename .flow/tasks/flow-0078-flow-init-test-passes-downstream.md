---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0078"
title: "flow-init.test.mjs passes in an adopting repo, proved by running it from an adopter layout"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-worker"
created: "2026-09-24"
started: "2026-09-25T07:57:49Z"
branch: "flow/flow-0078-flow-init-test-passes-downstream"
pr: "https://github.com/CandidDan/flow/pull/110"
issue: "https://github.com/CandidDan/flow/issues/103"
blocked_reason: ""
blocked_by: []
serves: ["G10"]   # a copied test that is red in every adopter makes the gate's red mean nothing
touches:
  - "project-template/.flow/bin/flow-init.test.mjs"
  - ".flow/bin/flow-init-downstream.test.mjs"
  - "changes/flow-0078.md"
labels: [flow-infra, tests, bug]
notes:
  - "2026-09-24 (orchestrator): converted from issue #103 on the human's direct instruction. `flow-gates / flow-tooling` is red on Nudge's 2.0.0 sync (CandidDan/Nudge#297): 2 of 345 tests fail, both in `.flow/bin/flow-init.test.mjs`. The fixture builds its fake canonical partly from `TEMPLATE_ROOT`, which is `project-template/` in canonical but the adopter's repo root downstream (the file's own comment at the `TEMPLATE_ROOT` line says so). The two failures are the board assertion in 'the template's sample task does not travel…' and the `AGENTS.md` assertion in 'a complete input set initialises an empty repo…'."
  - "2026-09-24 (orchestrator): REPRODUCE BEFORE FIXING. The issue blames the board failure on the adopter's real board lacking the placeholder. But `prepareBoard` (flow-init.mjs) rewrites ANY `const REPO = \"…\";` at line start, so the actual cause may differ (a board with a different shape, no line-start match, or no board at all). Build the downstream harness first, watch both tests fail in it, and fix the cause you observe. Put the observed cause in the PR body."
  - "2026-09-24 (orchestrator): DECIDED: THE FIXTURE OWNS WHAT IT ASSERTS ON. A test in the copied surface may only assert things that are true in every repo it is copied into (the issue's own rule). So the canonical fixture stops sourcing the board and the host files from the environment. It writes a small synthetic `board.html` holding a placeholder `const REPO = \"\";` and a `TASKS` snapshot containing the sample task, and synthetic `CLAUDE.md` and `AGENTS.md`. The assertions then test flow-init's behaviour (the board is repointed and emptied; both host files travel) and hold everywhere. This also stops the test depending on the real board, which flow-0022 plans to delete. Nothing is lost in canonical: `.flow/bin/protocol-portability.test.mjs` already asserts that the real template ships `AGENTS.md`."
  - "2026-09-24 (orchestrator): DECIDED: NO SKIP-WHEN-DOWNSTREAM. The issue offers skipping as an alternative. Rejected: a test that skips downstream proves nothing there, and a skip condition is one more thing to get wrong. Make the tests true everywhere instead."
  - "2026-09-25 (worker): branch `flow/flow-0078-flow-init-test-passes-downstream` pushed with the fixture fix. REPRODUCED FIRST, and the observed cause is NOT the one the issue guessed: an ad-hoc adopter layout (template `.flow/bin`, `.claude/`, callers, `CLAUDE.md`, no `AGENTS.md`) reproduces exactly the two Nudge failures. Nudge's real `.flow/board.html` (fetched via gh) contains NO `const REPO` declaration at all — not a missing placeholder value, a missing line — so `prepareBoard`'s anchored regex has nothing to rewrite and the assertion fails. The host-file failure is simply that `TEMPLATE_ROOT/AGENTS.md` is the adopter's own, absent on 1.x. Fix applied per the DECIDED note: `canonicalFixture` now writes `SAMPLE_BOARD` and both host files itself; the board test's `if (existsSync(...))` guard is gone (a missing board can no longer pass by skipping). Canonical: 40/40, same count as before. NEXT: write `.flow/bin/flow-init-downstream.test.mjs` (adopter layout as a data-driven file list, spawn `node --test .flow/bin/flow-init.test.mjs`, assert exit 0), then `changes/flow-0078.md`, then the four gate commands, then the PR."
---

## Context

`project-template/.flow/bin/` is copied into every adopting repo by flow-init and flow-sync, and
its tests run there in `flow-gates / flow-tooling`. `flow-init.test.mjs` is green in canonical
and red in every adopter, permanently. Its fixture reads part of its fake canonical from
`TEMPLATE_ROOT`, which downstream is the adopter's own repo root, so two tests are testing the
adopter rather than flow-init. Nudge's 2.0.0 sync PR cannot pass its own gate because of this, and
nothing in canonical's CI could have caught it: canonical only ever runs the copied tests in
place.

## Scope

**Does:**

- Make the `canonicalFixture` in `project-template/.flow/bin/flow-init.test.mjs` write its own
  board and host files, as the notes decide, so the two failing tests are true in any repo. Keep
  every assertion's intent: the board is repointed at the target repo and its task snapshot is
  emptied, and both host files travel.
- Add `.flow/bin/flow-init-downstream.test.mjs`, a canonical-only test. It builds, in a temp
  directory, a minimal **adopter layout**:
  - `.flow/bin/`: a copy of `project-template/.flow/bin/`.
  - `.flow/board.html`: already initialised for some other repo, with its own tasks.
  - `.flow/PROTOCOL.md`, `.claude/`, `.github/workflows/flow-*.yml` and `CLAUDE.md`.
  - **No** `AGENTS.md`: a repo on 1.x doesn't have one yet.

  It then runs `node --test .flow/bin/flow-init.test.mjs` there and asserts exit 0. Structure
  the file list as data, so adding another copied test to the harness later is a one-line change.
- Write the changelog fragment `changes/flow-0078.md`.

**Does not touch:**

- `flow-init.mjs`, unless reproduction shows its behaviour is actually wrong. If it does, stop
  and ask: that would be a behaviour change beyond this issue.
- Other copied test files. Running *all* of them from an adopter layout is the issue's broader
  suggestion, and a separate task, because it may surface failures beyond this one.
- `project-template/.flow/board.html`, which flow-0022 owns.

## Acceptance criteria

- [ ] Given the adopter layout described above, when `.flow/bin/flow-init.test.mjs` runs there,
      then every test passes. Proved by `.flow/bin/flow-init-downstream.test.mjs`, which also
      fails when run against the current (unfixed) test file.
- [ ] Given canonical, when `npm test` runs, then `flow-init.test.mjs` still passes in place,
      with the same number of tests as before.
- [ ] Given the board test, then it asserts that the initialised board names the target repo and
      no longer contains the sample task, using a board the fixture wrote itself.
- [ ] Given the host-files assertion, then the fixture supplies `CLAUDE.md` and `AGENTS.md`
      itself, and the assertion checks that flow-init copied both to the target.
- [ ] Given `changes/flow-0078.md`, then it exists and names the failure fixed and the new
      downstream harness.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- The harness spawns `node --test` in a child process; keep it off the network and clean up its
  temp directory, following the temp-dir pattern `flow-init.test.mjs` already uses.
- Nudge's sync PR (#297) goes green once a release carrying this fix is synced. Its second ask,
  adding `AGENTS.md`, is not needed for the gate after this change.
