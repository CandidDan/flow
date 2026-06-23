# Nudge Flow retrofit — runbook

> **If you are Claude Code:** run from `~/Projects/nudge`. Execute steps in order; report
> outcomes after each step. **Step 4 (CLAUDE.md merge) ends with a hard STOP for Dan's review
> — do not commit it or proceed past it without his explicit approval.** If anything conflicts
> with reality (paths, dirty tree, collisions), stop and ask — don't improvise. Sources live in
> `~/Projects/flow/project-template/` (the validated template) and
> `~/Projects/flow/nudge-migration/` (staged migration data).

Context: Flow's CI was live-validated 2026-06-05 (all green; see flow-validation repo).
`CandidDan/Nudge` is a personal repo, so **branch protection stays OFF** (personal repos can't
grant the Actions bot bypass — the gate still reports on every PR and Dan is the sole merger).

The retrofit commits go **directly to `main`** — this is the genesis of the store (the same
exemption as task-state commits; also the store-guard would otherwise block its own birth PR).
Code is not changing in this retrofit.

## 0. Preconditions

- `git status` clean on `main`, `git fetch origin` and confirm up to date. Anything dirty or
  unpushed → stop and ask Dan (his existing rule).
- Note: Linear CAN-15 is marked Done but the latest commit is "CAN-15 Phase 2B chunk 1" — ask
  Dan whether Phase 2B chunks 2+ are still in flight before assuming the tree is at rest. If
  in flight, that work becomes the second task file (id `CAN-15b` is NOT valid — create
  `CAN-30` "Finish §10B Phase 2B (chunks 2+)" as a ready task instead, with a note).

## 1. Overlay the Flow foundation

From `~/Projects/flow/project-template/`, copy into the repo:

- `.flow/bin/` (all four .mjs files), `.flow/tasks/_TEMPLATE.md`, `.flow/board.html`
- `.github/workflows/flow-gates.yml`, `flow-status.yml`, `flow-done.yml`, `flow-triage.yml`,
  `flow-review.yml`
- `.claude/agents/qa-verifier.md`, `security-reviewer.md`, `code-reviewer.md` and
  `.claude/skills/task-writer/`, `.claude/skills/board-builder/` — **merge** into the existing
  `.claude/`: list collisions first; if any same-named file differs, stop and show Dan.
- Append to the existing `.gitignore`: `.flow/board-edits.json`. Append the template's
  `.gitattributes` entries (or create the file).

Then copy the in-flight task from staging:
`~/Projects/flow/nudge-migration/tasks/0029-prompt-caching.md` → `.flow/tasks/`.

## 2. Fill `.flow/config.yml` (from the template's copy)

```yaml
project:
  name: "CAN"            # id-prefix continuity with Linear; new tasks from CAN-30
  language: "typescript"
  description: "Nudge — AI executive assistant (email + WhatsApp + calendar)"
commands:                # monorepo: app code lives in app/
  install: "cd app && npm ci"
  build:   "cd app && npm run build"
  lint:    "cd app && npm run lint"
  test:    "cd app && npm test"
  coverage: <see below>
git:
  base_branch: "main"
  branch_prefix: "flow/"
  protect_main: false    # personal repo — see 5b note above
```

**Coverage floor — measure, don't guess.** Vitest needs a coverage provider: `cd app && npm i -D
@vitest/coverage-v8`, then run `npx vitest run --coverage` and read the actual line %.
**Before committing, run `npm ci` once** to prove `package.json` and `package-lock.json` are in
sync — adding the provider updates both, and a half-updated lock passes locally (`npm install`
is lenient) but fails the gate's strict `npm ci`. (Live finding 2026-06-08: the Nudge retrofit
committed a drifted lock and the first PR's gate caught it — the gate working, but avoidable.) Set
`coverage` to `"cd app && npx vitest run --coverage.enabled --coverage.thresholds.lines=<N>"`
where **N = actual minus 5** (an honest ratchet floor, not theatre). Record actual + chosen N in
the report. `coverage_min` in the yml = same N.

**Security focus** (from CLAUDE.md's battle scars): RLS policies on every table; OAuth token
handling + Vault storage (never frontend); Twilio webhook signature verification; input
validation on all inbound webhook payloads; prompt-injection surface on AI-processed
email/WhatsApp content.

## 3. Stack-specific CI line

In the copied `flow-gates.yml`, replace the toolchain NOTE with `actions/setup-node@v4`,
`node-version: 22` (coverage flags require ≥22 — validation finding), with npm cache keyed on
`app/package-lock.json`.

## 4. Merge CLAUDE.md  🛑 STOP FOR DAN AFTER THIS STEP

Produce the merged file but **do not commit until Dan approves**. Structure:

1. Title + intro (Nudge's).
2. **Flow protocol** (from the template's CLAUDE.md): the store, status lifecycle, concurrency,
   the loop, the gate, hard rules. Adapt: id prefix `CAN`, monorepo command notes.
3. **Nudge's Rules** — kept, minus "Fetch origin before branching" (superseded by the claim
   protocol's pull-rebase-push; note the CAN-21 history in a one-liner).
4. **PRD Routing, Tech Stack, Key Implementation Notes** — kept verbatim.
5. **Edge Functions table — SLIM IT.** This is the single biggest block in the file. First,
   move every per-version changelog paragraph from CLAUDE.md's hand-authored table into the
   matching entry's `changelog:` field in `docs/state.yml` (the manifest was designed for
   exactly this — its own comment says CLAUDE.md's table stays hand-authored "until that
   migration happens"; this is that migration). Then replace CLAUDE.md's table with a
   `<!-- generated:edge-functions format=short -->` marker block and run `npm run
   state:generate`. One line per function; full history lives in the manifest and git.
6. **Build Status table** — replaced by a short pointer: shipped state → `docs/state.yml`;
   in-flight work → `.flow/tasks/` + GitHub Issues; deferral rationale stays in each PRD.
   Preserve the two ⚡ partial entries' deferral text by moving it into the relevant PRDs first.
7. **Key Implementation Notes** — keep, but each note longer than ~10 lines gets its detail
   moved to `docs/ARCHITECTURE.md` (or the relevant PRD) with a 2-3 line summary + pointer left
   in CLAUDE.md. Judgement call per note; list the moves in the report.

**Hard size budget: the merged CLAUDE.md must be ≤ 25k chars** (`wc -c CLAUDE.md`). Context:
the current file is 52.5k against Claude Code's 40k limit — every session pays that tax and
the tail may silently not load. 25k leaves headroom to grow. If you can't reach 25k without
losing real protocol content, stop and show Dan what's left.

Present the diff + the final char count to Dan. Wait.

## 5. Create the GitHub issues (the migrated Linear backlog)

For each file in `~/Projects/flow/nudge-migration/issue-bodies/*.md` (title + labels in the
HTML comments at the top): create labels as needed (`gh label create` — also create the triage
set: `proposed`, `approved`, `auto-ok`, `triaged`, plus `trust-buster`, `hold`), then
`gh issue create --title "<title>" --body-file <file> --label <labels>`.
Eleven issues: CAN-5, 6, 8, 9, 11, 16, 19, 20, 23, 26, 27.

## 6. Repo settings (via gh api)

- Workflow permissions read+write: `gh api -X PUT repos/CandidDan/Nudge/actions/permissions/workflow -f default_workflow_permissions=write`
- Confirm branch protection is OFF on main. Do NOT set `FLOW_AI` yet (triage/review stay
  dormant until Dan flips it — needs `CLAUDE_CODE_OAUTH_TOKEN` secret too).
- Existing `claude.yml` + `claude-code-review.yml` workflows: leave in place (on-demand
  @claude//review are complementary); note the overlap with flow-review for when FLOW_AI goes on.

## 7. Board + verify + commit

- Update `.flow/board.html`'s `TASKS` array to match the store (one task: CAN-29).
- Run: `node --test .flow/bin/*.test.mjs` (expect 16/16) · `node .flow/bin/flow-doctor.mjs`
  (expect healthy) · `cd app && npm run state:check` (manifest untouched — must still pass) ·
  the five config commands by hand.
- Commit to main in two commits: `flow: retrofit foundation (store, gates, workflows)` and
  `flow: migrate in-flight work + archive superseded trackers` (see step 8). Push.

## 8. Archive the superseded trackers (same PR-less commit #2)

`git mv` into `docs/archive/`: `docs/TASKS-CC.md`, `docs/UX-BACKLOG.md`, `HANDOFF-CAN28.md`.
**First** check each for still-live items: anything not shipped/obsolete becomes a GitHub issue
(same flow as step 5) before archiving — list what you converted in the report.
`tasks.txt` + `bone-shaker.md` are Bone Shaker files misfiled here: move to
`~/Projects/bone-shaker/` if it exists, else `docs/archive/misfiled/` and flag to Dan.
Do NOT touch `docs/state.yml`, `app/scripts/generate-state.mjs`, or `/state` app code — their
slimming is task CAN-30+ territory, not this retrofit.

## 9. Report

Per step: done/blocked + anything surprising. Include: measured coverage % and chosen floor,
collision list from step 1, live items rescued from archived trackers, issue URLs created.

## Dan's steps (not CC's)

- Approve the CLAUDE.md merge at the step-4 stop.
- Linear: full export (Settings → Export) for the archive; close CAN-17 (obsolete — the deck it
  refreshes was deleted 2026-05-21) with a one-liner; then downgrade/cancel whenever ready.
- Later, to enable the AI lanes: `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` secret →
  `FLOW_AI=true` variable.
- Cowork side (I'll do on request): re-point/replace the `nudge-docs-audit` schedule (stale
  path; findings should become issues) and add the portfolio-digest routine.
