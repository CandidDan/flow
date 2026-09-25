---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0077"
title: "_flow-gates runs every declared source_root's check as a matrix, so extra trees need no hand-written job"
status: "done"
priority: 2
project: "flow"
owner: "claude-worker"
created: "2026-09-24"
started: "2026-09-25T07:43:23Z"
branch: "flow/flow-0077-source-roots-gate-matrix"
pr: "https://github.com/CandidDan/flow/pull/109"
issue: "https://github.com/CandidDan/flow/issues/34"
blocked_reason: ""
blocked_by: []
serves: ["G8"]   # "a repo with several build surfaces runs Flow without special-casing"
touches:
  - ".github/workflows/_flow-gates.yml"
  - "project-template/.flow/bin/source-roots.mjs"
  - "project-template/.flow/bin/source-roots.test.mjs"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/config.yml"
  - ".flow/bin/source-roots.mjs"
  - ".flow/bin/adapters.test.mjs"
  - ".flow/bin/source-roots-gate.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0077.md"
labels: [flow-infra, gate]
notes:
  - "2026-09-25 (worker): COMPLETE — PR #109 marked ready for review. All ten acceptance criteria have a named proving test in the PR body. Gate green: build 34 workflows, lint 92 .mjs, 1232/1233 tests pass (1 pre-existing live-agent skip), coverage 95.72% lines vs floor 83.5. Diff stays inside touches (all 10 declared paths, nothing else). Files: project-template/.flow/bin/source-roots.mjs (parser + plan + run + main), its test, canonical adapter .flow/bin/source-roots.mjs, .flow/bin/source-roots-gate.test.mjs, adapters.test.mjs section, two new jobs in _flow-gates.yml (source-roots-plan, source-root), template config.yml docs, docs row, changes/flow-0077.md. denoland/setup-deno pinned to 22d081ff2d3a40755e97629de92e3bcbfa7cf2ed (v2.0.5). ONE DEVIATION, flagged in the PR body: flow-doctor loads source-roots.mjs optionally rather than by static import, because flow-doctor.test.mjs's cliFixture copies a hardcoded file list and is NOT in touches, so a static import would fail the no-test-edited criterion with no legal fix. Nothing is left half-done; next action is human review of PR #109."
  - "2026-09-25 (worker): branch flow/flow-0077-source-roots-gate-matrix pushed. DONE: project-template/.flow/bin/source-roots.mjs (shared parser + plan/run + main()), canonical adapter .flow/bin/source-roots.mjs, flow-doctor now reads the shared parser. DEVIATION FROM THE DECIDED NOTE, deliberate: flow-doctor loads source-roots.mjs with `await import(...).then(m=>m, ()=>null)` rather than a static import. A static import fails the acceptance criterion \"flow-doctor's existing test suite passes without any test being edited\" — flow-doctor.test.mjs's cliFixture copies a hardcoded [flow-doctor.mjs, apply-board-edits.mjs] into a temp store, so a static sibling import dies with ERR_MODULE_NOT_FOUND there, and flow-doctor.test.mjs is NOT in this task's touches so it cannot be edited. Optional load also matches the partial-sync state the task's own plan-job error message exists to name. Absence yields one NOTE and no fallback scan, so there is still exactly one parser. All 90 flow-doctor tests pass unedited. NEXT: source-roots.test.mjs, _flow-gates.yml jobs, source-roots-gate.test.mjs, adapters.test.mjs, template config.yml docs, docs row, changes/flow-0077.md."
  - "2026-09-24 (orchestrator): converted from issue #34 on the human's direct instruction. Triage asked on 2026-08-26 whether to wait for a second consumer before fixing the schema. The human's 2026-09-24 escalation settles it: this now blocks Nudge's v1 → v2 migration, and the minimum ask is 'one job that iterates the declared checks, with a way to declare setup (deno version)'. So design now, from Nudge's three jobs. The fields below are deliberately few, and each is optional, so a second consumer can extend them without breaking anyone. Triage's 2026-08-28 proposal on the issue is the starting point; this task departs from it where the notes say so."
  - "2026-09-24 (orchestrator): DECIDED: ONE SHARED PARSER, MOVED OUT OF flow-doctor. `parseSourceRoots` in `project-template/.flow/bin/flow-doctor.mjs` is a private line-scan (no YAML dependency). Move it into the new `source-roots.mjs`, extend it to read the optional fields, export it, and have flow-doctor import it. Two parsers of one block would drift. flow-doctor's behaviour must not change: its existing source_roots tests stay green untouched. That import is the ONLY flow-doctor edit. flow-0052, flow-0063, flow-0073 and flow-0074 also edit flow-doctor.mjs, so this task is not parallel-safe with them."
  - "2026-09-24 (orchestrator): DECIDED: SKIP ENTRIES THE PRIMARY GATE ALREADY RUNS. The escalation says the matrix is for checks 'whose tree lies outside the core commands'. Triage's proposal ran everything and accepted duplicates. Instead: an entry whose `check` is exactly equal to one of `commands.build`, `commands.lint`, `commands.test` or `commands.coverage` is left out of the matrix, because the `gate` job already runs that command. Otherwise canonical's own four entries (all `npm run lint` / `npm run build`) would re-run lint three times on every PR for nothing, which costs CI minutes (G9). Canonical's matrix is therefore empty, by design."
  - "2026-09-24 (orchestrator): DECIDED: THE SCHEMA. Optional per-entry fields: `runtime` (`node`, the default; `deno`; or `none`, meaning no setup step and the check provisions its own toolchain), `version` (node default `\"22\"`, deno default `\"v2.x\"`; ignored for `none`) and `retry` (integer 0–3, default 0; the check is attempted `1 + retry` times). Anything else fails the plan step with an error naming the entry and the field. `retry` is capped at 3 so a broken check cannot pass as merely flaky, and the job log prints which attempt succeeded or that all failed. The check runs from the repo root, exactly as written, the same convention `commands.*` uses. Install steps belong in the check command (e.g. `cd mcp && npm ci && npm run build`). For node, the npm cache keys on `<path>/package-lock.json` when that file exists, otherwise no cache. There is no escape-hatch field: a repo whose need still doesn't fit keeps its own job, and flow-0076 stops sync from deleting it."
  - "2026-09-24 (orchestrator): SECURITY. `path` and `check` come from `.flow/config.yml`, which a PR can edit. Pass matrix values to steps through `env:` and never interpolate `${{ matrix.* }}` into `run:` text. Running a config-supplied command is not new (the gate already runs `commands.*`); breaking out of shell quoting through a matrix value would be. `denoland/setup-deno` must be pinned to a full commit SHA with a version comment, per flow-0031 and `.flow/bin/action-pins.test.mjs`."
---

## Context

`_flow-gates.yml` runs the build, lint, test and coverage commands from `.flow/config.yml`, all
in the consumer's one primary tree. `source_roots` already declares every other tree (`path`,
`check`), but nothing runs those checks: flow-doctor only proves each entry exists. So a repo
with more than one runtime drops out of the thin-caller model and hand-writes a job per tree.

Nudge has three such jobs:
- `edge-parse`: Deno, `supabase/functions/`, with a deliberate single retry for a remote-module
  loader race.
- `mcp-build`: Node, `mcp/`.
- `mobile-check`: Node, `mobile/`.

These cause three problems:
- **Near-identical jobs:** two of them differ on two lines.
- **A permission blocker:** adding a tree gate means editing `.github/workflows/`, which Nudge's
  worker credential cannot push (NUDGE-149 sat blocked on exactly that).
- **Sync deletes them:** the 2.0.0 sync overwrites the hybrid caller, including `edge-parse`, the
  CAN-32 guard.

After this task, gating a tree is a `.flow/config.yml` edit that any worker can push, and
Nudge's caller can become a plain thin caller.

## Scope

**Does:**

- New helper `project-template/.flow/bin/source-roots.mjs` (no new dependency). It holds the
  shared parser (see notes) and two subcommands:
  - `plan`: reads `.flow/config.yml` and prints a JSON matrix of the entries to run, plus their
    count. It excludes entries whose `path` or `check` is still `REPLACE-ME`, and entries whose
    `check` equals a primary command. It fails naming the entry on an unknown `runtime`, a
    non-integer or out-of-range `retry`, or an unknown field.
  - `run`: given one entry's check and retry count, runs the check from the repo root up to
    `1 + retry` times and exits with the last attempt's status, logging each attempt.
- Canonical adapter `.flow/bin/source-roots.mjs` over the template's exported logic, in the same
  style as the existing adapters (see root CLAUDE.md: never a copy or a symlink). Add it to
  `.flow/bin/adapters.test.mjs`.
- `_flow-gates.yml`: add a `source-roots-plan` job (runs `plan`, outputs matrix and count) and a
  `source-root` matrix job over it. The matrix job runs only when the count is non-zero, so an
  empty plan is a skipped job, never a failure. Its steps: checkout, runtime setup chosen by
  `runtime`, then `run`. If `.flow/bin/source-roots.mjs` is missing in the consumer (callers
  bumped without syncing `.flow/bin`), the plan job fails with an `::error` that names the
  missing file and says to run flow-sync.
- Move `parseSourceRoots` out of flow-doctor into the helper (notes).
- `project-template/.flow/config.yml`: document `runtime`, `version` and `retry` in the
  `source_roots` comment block, replacing the commented Deno example with one that uses
  `runtime: deno` and `retry: 1`. Say that entries matching a primary command are skipped.
- `docs/flow-reusable-workflows.md`: update the `_flow-gates.yml` row.
- Write the changelog fragment `changes/flow-0077.md`.

**Does not touch:**

- The `gate`, `flow-tooling` and `touches` jobs, and the `setup_node_version` input.
- flow-doctor's rules: moving the parser is the only change there.
- `_flow-sync.yml` (flow-0075, flow-0076).
- Nudge or any other consuming repo. Its migration is a consumer-side follow-up once this is
  tagged: move the three jobs into `source_roots`, delete them from the caller.

## Acceptance criteria

- [ ] Given a config with three `source_roots` whose checks differ from every `commands.*`, when
      `plan` runs, then the matrix has three entries carrying each entry's own `path`, `check`,
      `runtime`, `version` and `retry` (defaults filled in).
- [ ] Given an entry whose `check` equals `commands.lint`, when `plan` runs, then that entry is
      excluded. Given canonical's own `.flow/config.yml`, `plan` reports a count of 0.
- [ ] Given an entry whose `path` or `check` is `REPLACE-ME`, when `plan` runs, then it is
      excluded and `plan` exits 0.
- [ ] Given an entry with `runtime: python`, or `retry: 5`, or an unknown field, when `plan`
      runs, then it exits non-zero naming the entry and the field.
- [ ] Given `run` with a check that fails once then succeeds and `retry: 1`, then it exits 0 and
      logs that attempt 2 succeeded. Given `retry: 0` and the same check, then it exits non-zero.
- [ ] Given `_flow-gates.yml`, when parsed, then the matrix job depends on the plan job, is
      conditional on a non-zero count, uses `actions/setup-node` only for `runtime: node` and
      `denoland/setup-deno` only for `runtime: deno` (neither for `none`), and runs `run`.
- [ ] Given `_flow-gates.yml`, then no `run:` block in the new jobs contains `${{ matrix.` and
      every new third-party `uses:` is pinned to a 40-character SHA.
- [ ] Given flow-doctor's existing test suite, when run after the parser move, then it passes
      without any test being edited.
- [ ] Given `.flow/bin/source-roots.mjs`, then it is an adapter (imports the template's logic,
      is not a copy or symlink) and `adapters.test.mjs` covers it.
- [ ] Given `npm run build`, then every workflow still parses.
- [ ] Given `changes/flow-0077.md`, then it exists and describes the new job and schema.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Workflow-structure assertions go in `.flow/bin/source-roots-gate.test.mjs`, parsing with
  `yaml` behind the same skip guard `.flow/bin/sync-permissions.test.mjs` uses.
- The security review triggers on `.github/workflows/`, so expect it on this PR.
- PR body: list the consumer-side follow-up for Nudge (the three `source_roots` entries it will
  need, with `runtime: deno`, `retry: 1` on `supabase/functions/`), so the migration is
  mechanical once the tag lands.
