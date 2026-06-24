# Flow infrastructure propagation — scope

**Status:** Proposed · **Date:** 2026-06-18 · **Decider:** Dan

## Problem (one line)

Flow infra is *copied* into each repo at onboarding and then never re-synced, so fixes made in a
live repo (Nudge, under load) and edits made in the template drift apart in both directions — with
no guard to catch it. We fix the *project's* code with a gate; Flow's *own* infra has no gate.

## Principle

**Reference, don't copy, wherever possible. Where copy is unavoidable, version it and add a drift
check. Author infra in canonical; repos adopt.** The more we reference vs copy, the smaller the
surface that *can* drift — and a check makes the rest non-skippable.

## What's Flow infra, and the target model for each

| Piece | Today | Target | Why |
|---|---|---|---|
| `.github/workflows/flow-*.yml` | copied per repo | **Reference** — reusable workflows (`uses: CandidDan/flow/.github/workflows/_flow-gates.yml@v1`); each repo keeps a 3-line caller | Workflows were the worst drift surface; reusable workflows eliminate the copy entirely |
| `.flow/bin/*.mjs` (flow-doctor, apply-board-edits, touches-guard, pick-task, flow-open-pr, flow-recover, parse-task-id, flow-sync) | copied per repo | **Resolved (Decision 2):** copy + version stamp + drift check, updated by `flow-sync`. npm package deferred as optional | Copy+check proved out; closes the drift surface without an npm-publish pipeline |
| `.claude/skills/*` (task-writer, board-builder) | copied per repo | **Reference** — the Flow plugin (already underway) | Plugin already registers them; drop the repo copies once stable |
| `.claude/agents/*` (qa/security/code reviewers, portfolio-manager) | copied per repo | **Mostly reference via plugin**; keep in-repo only if a CI step must read them without the plugin installed | Same as skills, modulo the CI-reads-repo constraint |
| `CLAUDE.md` Flow-protocol section | copied per repo | Copy + drift check on the protocol block (or factor the protocol into a referenced doc the CLAUDE.md links to) | It must be one file per repo; can't be referenced cleanly |
| `.flow/config.yml`, `CLAUDE.md` project notes | per repo | **Per repo — intentionally divergent** | These are *meant* to differ; not infra |

## Phases (in leverage order)

### Phase 0 — Make canonical real + reconcile *(prerequisite)*
- Turn the canonical source into a **real versioned git repo** (recommend `CandidDan/flow`; today it's just a folder in `~/Projects/flow`). Tag releases (`v1`, …).
- **One-time reconciliation:** bring every Nudge-evolved piece into canonical in corrected form —
  `flow-open-pr` (non-draft) + its helper, `flow-recover` + helper, `parse-task-id` (PR-title fallback),
  the CAN-41 uncommitted-task guard, the **CAN-58 `FLOW_PAT` gate-trigger fix** — *and* keep canonical's
  ahead-bits (touches-overlap check, Opus worker, task-writer pre-flight checklist). Result: canonical is
  the true superset. Tag `v1`.
- Nothing downstream is meaningful until this lands.

### Phase 1 — Reusable workflows *(highest leverage)*
- Convert the `flow-*` workflows in canonical to **reusable** (`on: workflow_call`).
- Each consuming repo's workflow shrinks to a thin caller pinned to a tag (`@v1`).
- Migrate **Nudge first** (dogfood), then Roost/Meadow. Kills the workflow drift surface outright.

### Phase 2 — Version stamp + drift check *(the guard)*
- Stamp a `FLOW_VERSION` in canonical and in each repo.
- Extend `flow-doctor` (or a CI job) to **fail/warn when a repo's Flow infra is behind canonical** —
  the same encode-the-lesson-as-a-check move as `source_roots` and the uncommitted-task guard. This is
  what makes "remember to adopt" non-skippable.

### Phase 3 — bin + skills reference *(per Decision 2 & 3)*
- ✅ **bin → kept copied under the Phase-2 drift check** (Decision 2, resolved 2026-06-24): the
  copy + version-stamp + `flow-doctor` drift-check path is the chosen model; the npm package is
  deferred as optional. `flow-sync` (Phase 4) now actively updates the copy, closing the loop.
- skills/agents → drop repo copies in favour of the plugin (where CI allows). *Still open — needs
  the plugin stable + cross-repo; out of the canonical repo's reach.*

### Phase 4 — Adopt mechanism + governance
- ✅ **`flow-sync`** (`_flow-sync.yml` reusable + thin caller + `flow-sync.mjs` + tests): when a
  repo's `.flow/VERSION` is behind canonical, it copies the updated `.flow/bin/*` + thin callers in,
  bumps the stamp, and opens a **reviewed PR** (Dependabot-style). The sync PR isn't a `flow/<id>`
  branch, so touches-guard skips it and the store-guard passes — but flow-gates' `flow-tooling` job
  runs the *synced* tests + `flow-doctor`, so the gate validates each adoption for free. Complements
  flow-doctor's drift *warning* (the warning says "behind"; flow-sync is the fix).
- ✅ **Governance rule written into the protocol** (`project-template/CLAUDE.md` → Hard rules):
  **infra is authored in canonical; repos adopt — never patch it as a project task.** A repo can
  *discover* a bug under load; the fix is committed to canonical and pulled back in via `flow-sync`.

## Decisions (locked 2026-06-18)

1. **Canonical lives in a dedicated `CandidDan/flow` repo.** The existing `~/Projects/flow` folder
   (already holding `project-template/`, `flow-plugin/`, `flightdeck/`, `docs/`) becomes that repo —
   `git init` + push. It hosts the reusable workflows, the bin package, and the template.
2. ~~**`.flow/bin` becomes a versioned npm package** (`@candid/flow-bin` or similar), published
   from the `flow` repo, that the reusable workflows and repos call (`npx flow-doctor`, etc.).~~
   **Superseded 2026-06-24 (Phase 3):** the bin stays **copied per repo, governed by the version
   stamp + `flow-doctor` drift check, and actively updated by `flow-sync`** (Phase 4). The
   copy+check path proved out and needs no npm-publish pipeline or `npx` indirection in CI; the
   npm package is deferred as an optional later refactor, not a prerequisite. The drift surface is
   already closed by the stamp+check+sync loop.
3. **Committed scope = Phase 0 → 2** (reconcile + versioned canonical, reusable workflows, drift
   check). Phases 3–4 follow once proven. **First move: Phase 0 + 1 on Nudge.**

## Phase 0–1 execution checklist

**Phase 0 — stand up canonical + reconcile**
- [ ] `git init` `~/Projects/flow`; create empty private `CandidDan/flow` on GitHub; first push *(Dan: create the repo)*
- [ ] Reconcile the **superset** into canonical — bring the corrected Nudge-evolved infra in:
  - [ ] `flow-open-pr` workflow (drop `--draft`) + `flow-open-pr.mjs` helper + test + the **CAN-58 `FLOW_PAT`** gate-trigger pattern
  - [ ] `flow-recover` workflow + `flow-recover.mjs` helper + test
  - [ ] `parse-task-id.mjs` (PR-title fallback) + test + the `flow-status`/`flow-done` wiring (CAN-52)
  - [ ] `flow-doctor` uncommitted-task guard (CAN-41) — merge with canonical's touches-overlap check
  - [ ] keep canonical's ahead-bits: touches-overlap, Opus worker, task-writer pre-flight checklist
- [ ] Add `FLOW_VERSION` (e.g. `flow/VERSION` + the bin package version); tag `v1`

**Phase 1 — reusable workflows**
- [ ] Convert each `flow-*.yml` in canonical to `on: workflow_call` (reusable), under `.github/workflows/_flow-*.yml`
- [ ] Build the **thin caller** template (`project-template/.github/workflows/flow-*.yml` = 3-line `uses: CandidDan/flow/...@v1`)
- [ ] `.flow/bin` → the npm package; reusable workflows call `npx`
- [ ] Cut **Nudge** over to the thin callers + the package (dogfood); then Roost/Meadow
- [ ] Confirm the gate still fires end-to-end on a real Nudge PR

**Phase 2 — drift check** *(after 0–1 prove out)*
- [ ] `flow-doctor`/CI check: fail/warn when a repo's `FLOW_VERSION` is behind canonical's latest tag

## Recommended first move

Phase 0 + Phase 1 on Nudge: stand up `CandidDan/flow` as the versioned canonical repo with the
reconciled superset, convert the workflows to reusable, and cut Nudge's `.github/workflows/` over to
thin callers. That single change eliminates the surface that just bit us (the workflows), and proves
the model before touching Roost/Meadow or the bin/skills layers.

## Non-goals / risks

- Reusable workflows across private repos need the caller to have repo access — fine within one
  owner/org. Pin to a tag (`@v1`) for stability, or `@main` for always-latest (riskier).
- Secrets (`FLOW_PAT`, `CLAUDE_CODE_OAUTH_TOKEN`) stay per-repo regardless — they're never templated.
- This is meta-work on Flow itself; time-box Phase 0–2 so it doesn't crowd out actual product tasks.
