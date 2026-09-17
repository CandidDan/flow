---
id: "flow-0054"
title: "A sync PR that adds files must not claim 'version stamp only — no infra files differed'"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-09-16"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.github/workflows/flow-sync.yml"
  - "project-template/.flow/bin/flow-sync.mjs"
  - "project-template/.flow/bin/flow-sync.test.mjs"
  - "CHANGELOG.md"
labels: [infra, sync, fleet, reporting]
notes:
  - "2026-09-16 (orchestrator): found by the flow-0051 worker and recorded in PR #77's body as out of scope. Verified independently here against `_flow-sync.yml` on `main`. Line 117 computes `CHANGED=\"$(git diff --name-only)\"`; line 121 runs `git add -A`. `git diff --name-only` with no `--cached` reports the unstaged worktree diff, which covers modifications and deletions of TRACKED files and omits untracked ones entirely. So the commit and the push are correct — `git add -A` stages everything — and only the list handed to `pr-body` is wrong."
  - "2026-09-16 (orchestrator): the severity is higher than the 'under-reports' framing it arrived with, and this is the finding that sets priority 1. `prContent` in `project-template/.flow/bin/flow-sync.mjs:70` does not degrade to a short list when `files` is empty — it substitutes `- _(version stamp only — no infra files differed)_`. A sync whose entire payload is newly created files therefore produces a PR body that AFFIRMATIVELY STATES the opposite of its own diff. This is not an omission a reviewer can notice is missing; it is a sentence that tells them not to look."
  - "2026-09-16 (orchestrator): the asymmetry matters when writing the tests. Deletions ARE reported correctly — `rsync -a --delete` removes tracked files and `git diff --name-only` lists them — so a test fixture built only from modifications and deletions passes against the broken code. The bug is additions-only, and a proving test must add an untracked file."
  - "2026-09-16 (orchestrator): this is about to go from latent to load-bearing, which is why it should not wait. flow-0051 (done, PR #77) exists so `flow-sync` can push `.github/workflows/flow-*.yml` at all, and the first thing the v2 wave delivers into each repo is NEW caller files. The watchdog's run 18 shows `CandidDan/TanPlan`'s `flow-sync` has NEVER recorded a successful run, so its first sync is close to all-additions — the exact shape that produces the false sentence. The files being misreported are workflow files, which carry CI execution rights, at the one touchpoint where a human decides whether to accept them."
  - "2026-09-16 (orchestrator): `serves: [\"G10\"]` rather than `maintenance`, deliberately, and the distinction is worth stating because flow-0051 — same subsystem — is `maintenance`. flow-0051 was pure mechanism: a push that could not happen. This one is about what a human is shown at the moment they approve, and G10's own *Progress looks like* names that failure directly: 'PR text is long and often not plain English, so the approve-the-merge touchpoint is weaker than a green check makes it look.' A green gate on a PR whose body denies its own diff is that sentence in the concrete. `maintenance` was considered and rejected as the weaker anchor."
  - "2026-09-17 (orchestrator): OBSERVED LIVE, and the shape differs from the one this task is named for — a second failure mode, not the predicted one. TanPlan#26 (`flow-sync/2.0.0`, opened 06:30Z by the first successful sync this repo has ever had) carries 37 files: 22 modified, 15 added, +6489/-499. Its body lists exactly 22 under `### Synced from canonical` — the modified set — and every added file is absent. Among the omitted 15: `.github/workflows/flow-compass.yml`, which is the precise path GitHub named when it rejected the push that started this whole incident, plus seven new `.flow/bin/` helpers (`allocate-task-id`, `flow-init`, `flow-review`, `flow-state`, `queue-runner-verify`, `release-guard`, `main-module`) and their tests, and `.flow-canonical`. The `version stamp only` branch never fired because `CHANGED` was non-empty. That makes this variant MORE dangerous than the one in the title: `version stamp only` against 6489 additions is self-evidently absurd and a reviewer would stop; a plausible 22-item list against a 37-file diff reads as complete and invites the skim. Both fall out of the same line-117-before-line-121 defect, and a fix for one fixes both — but the tests should cover the mixed case (modifications AND additions in one sync) as well as the all-additions case, because only the mixed case produces a body that looks right."
  - "2026-09-16 (orchestrator): fix the reporting, not the guard. Line 113's `if git diff --quiet` is NOT a second instance of this bug — it only echoes an explanatory message and does not exit, so an additions-only sync still commits, pushes and opens its PR. It reads as though it were a guard, which is worth a comment, but changing its control flow is out of scope."
---

## Context

`_flow-sync.yml` copies canonical's template into an adopting repo, commits, pushes and opens the
adoption PR. The file list in that PR's body is computed one line too early:

```bash
CHANGED="$(git diff --name-only)"     # :117 — worktree diff: tracked files only
git config user.name  "flow-bot"
git config user.email "flow-bot@users.noreply.github.com"
git checkout -b "$BRANCH"
git add -A                            # :121 — everything, including new files
git commit -m "flow: adopt canonical Flow infra $CANON_VER"
```

Newly created files are untracked when `CHANGED` is computed, so they never appear in it. The
commit is right; the description of the commit is not.

What turns that from a gap into a false statement is how the body renders an empty list
(`flow-sync.mjs:70`):

```javascript
const fileLines = list.length
  ? list.map((f) => `- \`${f}\``).join("\n")
  : "- _(version stamp only — no infra files differed)_";
```

A sync that delivers nothing but new files produces a PR headed *"Synced from canonical"* whose
only content is a sentence saying no infra files differed — while the diff beside it adds workflow
files that will execute in that repo's CI. The body ends with *"Review the diff, let the gate run,
then merge"*, and the sentence above it is an argument for not bothering.

## Acceptance criteria

- [ ] Given a sync whose payload is entirely newly created files, when the PR body is generated,
      then every added file is listed by path and the string `version stamp only` does not appear.
      The proving fixture must create untracked files — a fixture of modifications alone passes
      against the current code.
- [ ] Given a sync that adds, modifies and deletes files in one run, when the PR body is
      generated, then all three classes appear, with added and deleted distinguishable from
      modified rather than flattened into one list.
- [ ] Given a sync where the version stamp advances and genuinely no other file differs, when the
      PR body is generated, then `version stamp only — no infra files differed` is still produced —
      the sentence is correct in its one true case and must not be deleted to make the bug go away.
- [ ] Given the corrected computation, when `_flow-sync.yml` is read, then the file list is derived
      from the staged or committed tree (`git diff --cached --name-only` after `git add -A`, or the
      commit itself) and a comment states why the pre-`add` worktree diff was wrong, so the line is
      not optimised back later.
- [ ] Given `project-template/.github/workflows/flow-sync.yml`, when it is read, then the thin
      caller remains consistent with the reusable — if the ordering lives in the caller too, it is
      fixed in the same commit; if it does not, the PR body states that explicitly rather than
      leaving the reader to check.
- [ ] Given the shipped `_flow-sync.yml`, when the proving test runs, then it executes the
      workflow's own shell for this step rather than a reimplementation of it — the same technique
      `sync-permissions.test.mjs` uses to lift the copy loop verbatim — because a test that
      reimplements the ordering cannot detect the ordering being wrong.
- [ ] Given `CHANGELOG.md`, when it is read after this change, then the entry states that sync PR
      bodies previously omitted newly added files and could assert that none differed, and that a
      repo which merged such a PR received more than its body listed.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run, then
      all pass and coverage stays at or above 83.5.

## Scope

**Does not change what `flow-sync` copies** — the copied surface is flow-0051's settled question
and narrowing it here would undo that deliberately. **Does not change the commit, the push, the
branch name or the idempotent no-op** on an existing sync branch; all four are correct. **Does not
alter the control flow of the `git diff --quiet` check at line 113** — it is a message, not a
guard, and rewriting it belongs to a task that has established what it should do. **Does not
retro-fix** any sync PR already open or merged in an adopting repo; recovery there is a fresh sync
once this lands. **Does not touch `decide`, `syncBranch` or `pr-title`.**
