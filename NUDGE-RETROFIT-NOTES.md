# Nudge retrofit — audit findings (VALIDATION COMPLETE 2026-06-05 — pause lifted)

Status: CI validation GREEN across steps 0–5a. Three CC fixes back-ported into the template:
yq install brace precedence (flow-gates), Node 22 pins (coverage flags need ≥22), and
apply-board-edits treating a missing task file as a warning so flow-status/done no-op green on
unknown ids. One known limitation encoded in README/handoff: **branch protection stays OFF on
personal repos** (they can't grant the Actions bot bypass, so protection blocks the store-sync
pushes; on a GitHub org, use a Ruleset with the Integration as bypass actor). The retrofit is
unblocked.

## What Nudge's "state board and schedules" actually are

- **`docs/state.yml` + `app/scripts/generate-state.mjs`** — a validated deployment manifest:
  every edge function with category/status/version/PRD/cron, `state:check` validates it against
  the codebase, `state:generate` regenerates marker blocks in CLAUDE.md / ARCHITECTURE.md /
  Nudge-Context.md. Plus a `/state` Next.js dashboard (kanban of functions, PRDs, migrations,
  activity), `STATE_ENABLED`-gated.
- **CLAUDE.md** — 156 lines: Rules, PRD routing, Edge Functions table, Key Implementation
  Notes, and a rich per-PRD **Build Status** table with deferral rationale.
- **Work tracking, fragmented across:** `docs/TASKS-CC.md` (phased CC orchestration),
  `docs/UX-BACKLOG.md`, `docs/prds/PRD-STATUS.md`, `HANDOFF-CAN28.md`, Linear (`CAN-nn` refs
  throughout git log), and `tasks.txt`/`bone-shaker.md`.
- **Schedules (Cowork scheduled tasks):** `nudge-docs-audit` (Mon/Thu drift audit) and
  `nudge-monday-sanity-sweep` (production data-quality checks via Supabase).
- **Existing workflows:** `claude.yml` (@claude on issues/PRs), `claude-code-review.yml`
  (/review on demand), `deploy-edge-functions.yml`.

## Learnings to take before sunsetting anything

1. **Don't sunset the state manifest — it isn't a board.** `state.yml` tracks *deployment*
   state (what's shipped), not *work* state (what's in flight). Flow replaces the latter, has
   no equivalent of the former. Keep manifest + check + generate; it's the same data→views
   philosophy as Flow and arguably better executed (validated manifest, generated marker
   blocks — a pattern worth back-porting into Flow someday).
2. **The docs-audit schedule is silently broken.** Its prompt points at
   `~/Documents/Claude/Projects/Email Intent Extractor` — the project now lives at
   `~/Projects/nudge` — yet it "ran" yesterday. Exactly the silent-degradation failure mode
   Flow's observability section warns about. Fix or fold into Flow regardless of the retrofit.
   Migration idea: audit findings should become GitHub issues (capture inbox), not markdown
   reports in `docs/audit-reports/` that need remembering to read.
3. **The Monday sanity sweep is production monitoring, not project management.** Keep it; it's
   out of Flow's scope. Improvement: red findings should file issues into the inbox.
4. **TASKS-CC.md independently evolved Flow's core conventions** — 🛑 stop-and-confirm gates
   (= touchpoints), "if the handoff conflicts with reality, stop and ask" (= blocked),
   sequential sign-off phases. Validates the design; also means the migration is a
   formalisation, not a behaviour change.
5. **Misfiled capture proves the inbox need:** `tasks.txt` and `bone-shaker.md` are a *Bone
   Shaker SEO punch list* living in the Nudge repo — capture landed wherever the editor was
   open. The GitHub-issues inbox is the designed fix. Relocate these to the Bone Shaker
   project at migration time.
6. **CLAUDE.md collision is the trickiest retrofit step.** Flow's CLAUDE.md is the protocol;
   Nudge's is dense project knowledge (rules, PRD routing, implementation notes). Merge, don't
   replace: Flow protocol + Nudge's project sections, with Build Status likely splitting into
   (a) shipped-state → the manifest, (b) in-flight work → `.flow/tasks/`, (c) deferral
   decisions → PRD docs.
7. **Workflow overlap to dedupe:** `claude-code-review.yml` (/review on demand) vs Flow's
   `flow-review.yml` (automatic on flow PRs); `claude.yml`'s issues:opened trigger vs
   `flow-triage.yml`. Nudge already has claude-code-action wired (check which auth secret it
   uses — align on CLAUDE_CODE_OAUTH_TOKEN).
8. **Linear question must be answered at retrofit time:** `CAN-nn` ids are load-bearing in
   commits, PRD notes, and deferral gates (CAN-12, CAN-9, CAN-15…). Either Flow's store
   replaces Linear for Nudge (migrate open CAN items to tasks/issues, keep old ids as
   references), or Linear stays and Flow's local-store decision gets revisited for this
   project. Don't drift into running both.

## Progress since the pause (2026-06-05, prep only — nothing applied to Nudge)

- **Linear → Flow migration STAGED** in `nudge-migration/`: full inventory of all 28 CAN issues
  (`linear-migration.md`), a real task file for the one in-flight item (`tasks/0029-prompt-caching.md`,
  CAN-29 with criteria derived from its own test plan), 11 backlog items mapped to GitHub-issue
  creation (executor pulls full descriptions from Linear before Linear dies), CAN-17 flagged
  obsolete, 12 done items archived as reference. Decision taken: Linear is replaced by the store;
  task-id prefix stays `CAN`, continuing from CAN-30.
- **Id parser relaxed** (`\d{4}` → `\d{1,4}`) in flow-done/flow-status so `flow/CAN-29-…`
  branches parse — verified against CAN-29, CAN-9, flowval-0001.
- **state:check back-ported as `flow-doctor`** (.flow/bin/, 6 tests, CI step in flow-gates):
  validates the store (duplicate ids, illegal status, incomplete claims, in_review without PR)
  and warns on board-snapshot drift. Caught two real drifts in its first three runs.

## Sunset map for Nudge's custom state management (apply at retrofit)

| Component | Fate |
|---|---|
| Linear (CAN board) | **Sunset** → store + issues inbox (staged above). Export backup first. |
| `docs/TASKS-CC.md`, `UX-BACKLOG.md`, handoff docs | **Sunset** → triage live items into issues, then archive |
| `/state` dashboard + `parse.ts`/`sources.ts` | **Sunset** → flow board (work) + flow-doctor (consistency). CAN-20 closes with it. |
| `state.yml` + `state:check` + `state:generate` | **Slim, not sunset**: deployment inventory has no Flow equivalent. Proposed simplification: derive the function table from `supabase/functions/*` + `vercel.json` + `config.toml` directly (kill the hand-fed yml middle layer; move purpose/changelog into function file headers) — then the manifest-drift failure class disappears and docs still generate. A good first CAN-3x task. |
| `nudge-docs-audit` schedule | **Replace**: re-point to `~/Projects/nudge`, output → GitHub issues (inbox) instead of report files |
| `nudge-monday-sanity-sweep` | **Keep** (production monitoring, out of Flow's scope); red findings → issues |
| CLAUDE.md Edge Functions/Build Status tables | **Merge**: Flow protocol + Nudge's rules/PRD-routing/notes; shipped-state stays manifest-generated |

## Open items for the retrofit plan (when resumed)

- Inventory in-flight work: open CAN-nn issues in Linear, unticked TASKS-CC.md sections
  (incl. CAN-15 Phase 2B in progress per latest commit), UX-BACKLOG items → triage into
  issues (raw) vs ready tasks (specified).
- Map config.yml: app/ scripts exist (build/lint/vitest); no coverage script yet — needs
  adding for the gate. Monorepo nuance: commands run from app/, functions live in supabase/.
- Decide fate of /state dashboard vs Flow board (complementary: deployment vs work — likely
  keep both, board for work, /state for infra).
- Re-point or sunset the two scheduled tasks; fix the stale path either way.
- Parallel-run period + explicit sunset criteria before deleting TASKS-CC.md / UX-BACKLOG.
