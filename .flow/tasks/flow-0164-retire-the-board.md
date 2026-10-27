---
id: "flow-0164"
title: "Retire the board fleet-wide: no worker regenerates board.html, the board-builder skill is gone, and flow-sync deletes both downstream"
status: "ready"
priority: 2
project: "flow"
owner: "claude-worker-flow-0164"
created: "2026-10-27"
started: "2026-10-27T04:14:30Z"
branch: "flow/flow-0164-retire-the-board"
pr: "https://github.com/CandidDan/flow/pull/241"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
model: "opus"
effort: "medium"
model_reason: "Wide but mechanical; the risk is the published template and the sync step every repo runs"
touches:
  - "project-template/.claude/skills/board-builder/**"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "project-template/.claude/settings.json"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.flow/board.html"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/bin/flow-init.mjs"
  - "project-template/.flow/bin/flow-init.test.mjs"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "project-template/.flow/bin/pick-task.test.mjs"
  - "project-template/.flow/bin/touches-guard.test.mjs"
  - "project-template/.gitattributes"
  - "project-template/.gitignore"
  - "project-template/AGENTS.md"
  - "project-template/FLOW-handoff.html"
  - "project-template/INIT.md"
  - "project-template/README.md"
  - "project-template/RETROFIT.md"
  - ".github/workflows/_flow-sync.yml"
  - ".github/workflows/_flow-done.yml"
  - ".github/workflows/_flow-gates.yml"
  - ".gitattributes"
  - ".flow/bin/flow-init-downstream.test.mjs"
  - ".flow/bin/protocol-portability.test.mjs"
  - ".flow/bin/board-retired.test.mjs"
  - ".flow/bin/sync-*.test.mjs"
  - "changes/flow-0164.md"
  - "project-template/.flow/bin/apply-board-edits.mjs"
  - ".flow/bin/protocol-docs.test.mjs"
  - "CLAUDE.md"
labels: [template, protocol, sync, cost]
asks: []
notes:
  - "2026-10-27 (orchestrator): Dan no longer uses the board. Measured cost: in the 30 days to 2026-10-27, workers committed .flow/board.html 112x in tanplan-platform, 81x in inflight, 54x in nudge, 18x in progress. Each is a session writing a whole HTML file. flow-0022 / flow-0023 had this premise but were parked as stale; this replaces them."
  - "2026-10-27T04:50Z (worker, opus): BLOCKED, with the work otherwise done. Branch flow/flow-0164-retire-the-board, pushed (2 commits); draft PR #241 opened by flow-open-pr, NOT marked ready. GENUINELY DONE: scope items 1-7. Deleted board-builder/ and board.html from the template. Removed the board from PROTOCOL.md (store paragraph, loop steps 2 and 8, What stays out), task-writer, AGENTS.md, INIT/README/RETROFIT, FLOW-handoff.html, settings.json $comment, both .gitattributes, template .gitignore, and the _flow-done and _flow-gates comments. flow-doctor no longer checks board drift (its test now asserts no board warning). flow-init writes no board and prepareBoard is gone; --repo stays REQUIRED but is now unused, see the fyi below. flow-review drops board-builder from CANONICAL_SKILLS (and from the SYNC_PR_PATHS pin). _flow-sync.yml has a literal two-entry RETIRED loop inside the copy region. New .flow/bin/board-retired.test.mjs covers the scan, the list pin, single-delete and no-variable checks, execution with both paths, with neither, and with a symlink, plus Removed in the PR body. changes/flow-0164.md is in place. Protocol-portability digests were updated for three sections. build and lint are green. ONLY LOOKS DONE: npm test has 4 failures, all from the blocker: board-retired scan (apply-board-edits.mjs), protocol-docs x2, and release-assemble, which only re-runs the protocol-docs ones. Coverage was not run. NEXT ACTION, once touches is widened: on the branch, reword apply-board-edits.mjs lines 4-5 and 175 without the forbidden strings; in protocol-docs.test.mjs drop the board.html line assertion and rename the test; remove CLAUDE.md lines 84-85 and 104. Then run all four gate commands, rebase, fill PR #241's body (checklist below), and run gh pr ready."
  - "2026-10-27 (worker): fyi for the PR: flow-init's --repo is now used only for validation. Removing the flag is a CLI change and out of scope. The first adopter sync PR that deletes .flow/board.html will be unclassified by flow-review (the path is not in SYNC_PR_PATHS), so it gets the full review. That is fail-closed and happens once."
  - "2026-10-27 (Dan via orchestrator): decision: how to clear the three out-of-touches board pins? — answered: Accepted: widen touches to add project-template/.flow/bin/apply-board-edits.mjs (comment and log-line edits ONLY; name, CLI and behaviour unchanged), .flow/bin/protocol-docs.test.mjs and CLAUDE.md (drop the board-builder lines now; flow-0165 rebases onto this). Set ready to resume on the existing branch and PR #241."
---

## Context

The protocol tells every worker to **regenerate `.flow/board.html`** whenever task state changes
(`project-template/.flow/PROTOCOL.md` around lines 99–101, 238 and 261; the task-writer skill's
last paragraph; `project-template/AGENTS.md` line 31). Nobody reads the board any more: inflight
(its own repo, ADR-0006) is where state is viewed. So every regeneration spends tokens for nothing.

**`apply-board-edits.mjs` is NOT the board.** Despite its name it is the store writer every
workflow (`_flow-done.yml`, `_flow-status.yml`, `_flow-unblock.yml`, …) uses to patch task
frontmatter. It stays, with its name and its CLI, untouched.

flow-sync mirrors **canonical-named** skill directories only (`_flow-sync.yml` around line 544).
Deleting `board-builder` from the template would therefore leave a stale copy in every adopter,
still telling sessions to regenerate a board. Sync has to retire it explicitly.

## Scope

1. **Delete** `project-template/.claude/skills/board-builder/` and `project-template/.flow/board.html`.
2. **Protocol and docs stop asking for a board.** Remove every instruction to regenerate, read or
   edit the board from `PROTOCOL.md`, the task-writer skill, `AGENTS.md`, `INIT.md`,
   `RETROFIT.md`, `README.md`, `FLOW-handoff.html` and the `settings.json` `$comment`. Where a
   passage explains *why* state is viewed somewhere, it points at inflight in one line.
   `PROTOCOL.md`'s description of `apply-board-edits.mjs` stays, reworded as "the store writer".
3. **flow-doctor** drops the board-snapshot drift check (around line 1220) and its tests.
   **flow-init** stops writing or emptying a board snapshot. **flow-review** drops
   `"board-builder"` from its list (line 514).
4. **flow-sync retires them downstream.** `_flow-sync.yml` gains a small, commented list of
   retired paths — `.claude/skills/board-builder/` and `.flow/board.html` — that it deletes in the
   adopter when present, so they appear under **Removed** in the sync PR body. A path not present
   is a no-op, not a failure. Nothing outside that list is ever deleted.
5. `.gitattributes` / `project-template/.gitattributes` / `project-template/.gitignore`: drop the
   board lines. `_flow-done.yml` and `_flow-gates.yml`: drop the comments naming the board.
6. Tests that use `.flow/board.html` only as an arbitrary path fixture (`pick-task.test.mjs`,
   `touches-guard.test.mjs`) switch to another path; their assertions do not change.
7. New `.flow/bin/board-retired.test.mjs` (see criteria). Changelog fragment
   `changes/flow-0164.md`: **MINOR**, caller action **"run flow-sync"** (no caller is edited, so
   per `docs/flow-versioning-policy.md` this is not MAJOR).

**Deliberately does NOT:**
- Rename or change `apply-board-edits.mjs`, `.flow/board-edits.json`, or any workflow step using them.
- Touch `flightdeck/`, `flow-watchdog.yml` or canonical's `CLAUDE.md`/`README.md`. That is flow-0165.
- Edit `docs/adr/`, `docs/flow-map.html` or other historical docs under `docs/`.
- Touch the separate `CandidDan/flow-plugin` repo, which ships its own board-builder copy.
- Bump `VERSION` or cut the release.

## Acceptance criteria

- [ ] Given the repo after this change, when `board-retired.test.mjs` scans every tracked file under `project-template/` (excluding `.flow/tasks/`), then none contains `board-builder`, `board.html` or `regenerate the board` (case-insensitive), and the test names any file that does.
- [ ] Given `project-template/.flow/bin/apply-board-edits.mjs`, when the existing tests run, then they pass unchanged (`apply-board-edits.test.mjs`).
- [ ] Given a store with a task file and a stale `.flow/board.html`, when flow-doctor runs, then it reports no board-related warning (`flow-doctor.test.mjs`).
- [ ] Given `flow-init` run into an empty directory, when it finishes, then no `.flow/board.html` and no `.claude/skills/board-builder/` exist there (`flow-init.test.mjs`, `flow-init-downstream.test.mjs`).
- [ ] Given `_flow-sync.yml`, when its retired-paths list is parsed, then it holds exactly `.claude/skills/board-builder/` and `.flow/board.html`, and the step deleting them cannot delete anything else — no glob, no path outside the list (`board-retired.test.mjs`).
- [ ] Given an adopter checkout that has both retired paths, when the sync's delete step runs against it, then both are gone and a sibling skill directory (e.g. `task-writer`) is untouched; given a checkout with neither, the step exits 0 (`board-retired.test.mjs`, exercising the step's shell or the helper it calls).
- [ ] Given `changes/flow-0164.md`, when `.flow/bin/changelog-fragments.test.mjs` runs, then it passes.
- [ ] `npm run build`, `lint`, `test` and `coverage` (floor 83.5) all pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

Security-reviewer focus: the new delete step in `_flow-sync.yml` runs in every adopter. It must be
a literal list, scoped to the checkout, with no variable or glob that could widen it.

If another test outside `touches` pins board text, block rather than widen; the orchestrator
widens `touches` on `main`.
