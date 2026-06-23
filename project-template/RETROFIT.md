# Flow onboarding - Route B: backfill / migration

Adopting Flow into an **existing** repo that already has history, code, CI of its own, a
populated CLAUDE.md, and probably a tracker (Linear/Jira/issues/markdown lists). This route adds
a migration prefix to the clean route (steps 1-4 below); from step 5 it converges with INIT.md.

Generalized from the first real migration (Nudge). The placeholders `<TRACKER>`, `<ID-PREFIX>`,
`<app-dir>`, `<other-runtime-dir>` mark what changes per project; the lessons are baked in - they
each cost a detour the first time and shouldn't again.

Run as the orchestrator (Cowork) + human GitHub steps. The retrofit commits go **straight to
`main`**: this is the genesis of the store (the same exemption as task-state commits, and the
store-guard would otherwise block its own birth PR). No application code changes in the retrofit.

## 0. Preconditions

- Clean working tree on `main`, fetched and up to date. Anything dirty/unpushed -> stop, ask.
- Note any in-flight branches/PRs - they keep working; the retrofit doesn't touch them.

## 1. Overlay the Flow files (merge, don't clobber)

Copy from `project-template/`: `.flow/` (config, _TEMPLATE, board, `VERSION`, **all of** `bin/`),
`.github/workflows/flow-*.yml` (thin callers of canonical's reusable workflows — see
`docs/flow-reusable-workflows.md` in the flow repo), and **merge** `.claude/` (agents + skills)
into any existing `.claude/` - list collisions first; if a same-named file differs, stop and show
the human. Append `.flow/board-edits.json` to `.gitignore`; add the `.gitattributes` entries.

## 2. Calibrate `.flow/config.yml`

Same as INIT.md step 2, against the real repo:
- `project.name` = `<ID-PREFIX>` (keep continuity with the old tracker's ids if migrating one).
- Five commands. **Monorepo note:** if code lives in `<app-dir>/`, prefix commands (`cd <app-dir> && ...`).
- **`source_roots`** - declare EVERY runtime. The dangerous case is a second tree (edge functions,
  a worker, a second language in `<other-runtime-dir>/`) the main build never parses. Add a parse
  check per tree (e.g. `deno check <other-runtime-dir>/**/*.ts`).
- `coverage_min` - measure, set floor at measured-minus-margin. **Lockfile stacks:** after adding
  any dev dep (e.g. a coverage provider), regenerate the lockfile **on the CI platform** (Linux)
  and run the strict install once before committing - a half-updated or wrong-platform lock passes
  locally but fails the gate's `npm ci`.
- `security.focus` from the codebase's actual scars (read the existing CLAUDE.md / incident notes).

## 3. Merge CLAUDE.md  [STOP for human approval]

The existing CLAUDE.md is dense project knowledge; the template's is the protocol. Merge, don't
replace:
1. Flow protocol section (from template CLAUDE.md): store, lifecycle, concurrency, loop, gate,
   hard rules - adapt id prefix + monorepo command notes.
2. Keep the project's rules / routing / implementation notes.
3. **Shipped-state tables** (deployed components, build status) -> point to wherever the project's
   manifest/source-of-truth lives; don't duplicate. In-flight work -> `.flow/tasks/` + issues.
4. **Hard size budget: <= 25k chars** (`wc -c CLAUDE.md`). Past ~40k, Claude Code truncates the
   tail and every session pays the tax. Move per-version changelogs / long notes into a manifest
   or architecture doc and leave summaries + pointers.

Present the diff + final char count. **Wait for approval before committing.**

## 4. Migrate the existing tracker

- **In-flight items** -> ready task files in `.flow/tasks/` (apply the readiness bar; the old
  ticket is raw material, not a spec). Preserve original ids as the task id where it aids continuity.
- **Backlog / raw ideas** -> GitHub **issues** (the capture inbox); triage turns them into tasks.
  Pull FULL descriptions across **before** decommissioning `<TRACKER>` - its URLs die with it.
- **Done / obsolete** -> archive list / close; don't migrate.
- Export a backup of `<TRACKER>` for the historical record, then downgrade/cancel it later.

## 5-8. Converge with the clean route (see INIT.md)

From here the routes are identical:
- **5. Stack-specific CI line** in flow-gates.yml; **set board REPO**.
- **6. Gate-green the baseline FIRST** - run the full gate on `main` and fix all latent infra debt
  in ONE pass (lockfile, lint config, undeclared source_roots, Node version) *before* the first
  task. On an existing repo this is where the debt lives; do not let the first task discover it
  one red CI run at a time.
- **7. Register with the global flightdeck** - append to `flightdeck/projects.yml`. Also copy in
  `.claude/settings.json` (the `extraKnownMarketplaces` pointer to the private Flow plugin) and run
  `claude plugin install flow@flow`, so Cowork/orchestrator sessions can drive this repo. The worker
  needs nothing - it runs the gate from the repo's committed `.claude/`; the plugin only registers
  `task-writer`/`board-builder`/`portfolio-manager` for Cowork, which doesn't auto-discover repo skills.
- **8. Run the loop** - manual one-liner, or enable `FLOW_AI` + token for triage/review/queue-runner.

## Sunset checklist (migration only)

- Every open `<TRACKER>` item exists as a task or an issue (spot-check a couple of detailed ones).
- Old work-tracking docs archived; misfiled files relocated.
- `<TRACKER>` exported, then downgraded.
- The board reflects reality (regenerate with board-builder).
