# Adopting Flow in a consuming repo (the cutover runbook)

**Status:** Phase 1 cutover of `flow-infra-propagation-plan.md` — the step it lists as deferred
("cut the consuming repos over, Nudge first"). Canonical is done through Phase 4; this is the
per-repo procedure to move a repo off **copied** Flow infra onto the **referenced** reusable
workflows + the version stamp + `flow-sync`. Worked example: **`CandidDan/Nudge`** (dogfood first),
then Roost/Meadow.

> Run this **from a session scoped to the consuming repo** (e.g. Nudge). It can't be done from the
> canonical (`CandidDan/flow`) session — that session's GitHub access is restricted to the flow
> repo. Do the work on a branch and open a PR; the gate validates the cutover before it lands.

## Prerequisites (one-time, per repo)

1. **`v1` is tagged in canonical** — ✅ done (`git ls-remote --tags https://github.com/CandidDan/flow`
   shows `refs/tags/v1`). The thin callers pin `@v1`, so they only resolve once this exists.
2. **`FLOW_PAT` secret** on the consuming repo (CAN-58) — a fine-grained PAT scoped to *this repo*,
   Contents: Read and Pull requests: Read/Write. Without it the auto-PR paths fall back to
   `GITHUB_TOKEN` and the opened PR is **ungated** (the `pull_request` event won't trigger
   `flow-gates`). Adding it later is a no-break enablement.
3. **Default workflow permissions = read + write** (repo → Settings → Actions → General). The
   status/done/recover/sync workflows push state to `main`; the effective token is the intersection
   of the repo setting and the reusable workflow's `permissions:`, so the repo must allow write.
4. **Private-repo reusable-workflow access**: both repos are under the same owner, so `uses:
   CandidDan/flow/...@v1` resolves. (If that owner setting is ever locked down, allow the flow repo
   under Settings → Actions → General → "Access".)

## The cutover (on a branch, e.g. `flow/adopt-reusable-workflows`)

The consuming repo keeps three things per-repo and intentionally divergent — **do not overwrite
them**: `.flow/config.yml`, `.flow/tasks/`, and the project-specific notes in `CLAUDE.md`.

1. **Replace the copied workflows with the thin callers.** For each file in
   `project-template/.github/workflows/flow-*.yml` (9 of them: `flow-gates`, `flow-status`,
   `flow-done`, `flow-open-pr`, `flow-recover`, `flow-triage`, `flow-review`, `flow-queue-runner`,
   `flow-sync`), replace the repo's full `.github/workflows/<same-name>.yml` with the thin caller.
   Each becomes the trigger + a `uses: CandidDan/flow/.github/workflows/_flow-*.yml@v1`. Delete any
   repo `flow-*.yml` that no longer has a canonical counterpart.
2. **Sync `.flow/bin/`** to canonical's `project-template/.flow/bin/` (8 helpers + their tests):
   `flow-doctor`, `apply-board-edits`, `touches-guard`, `pick-task`, `parse-task-id`, `flow-open-pr`,
   `flow-recover`, `flow-sync`. Mirror exactly (drop any local helper canonical doesn't have) — Nudge
   carried diverged copies of `pick-task`/`touches-guard` that the reconciliation already corrected
   in canonical, so this is the step that retires the drift.
3. **Add the version stamp.** Write `.flow/VERSION` = canonical's `VERSION` (currently `1.0.0`),
   coherent with the `@v1` pins.
4. **Protocol block (manual, deliberate).** Reconcile the Flow-protocol section of the repo's
   `CLAUDE.md` against `project-template/CLAUDE.md` by hand — including the new governance Hard rule
   ("Flow infra is authored in canonical; repos adopt — never patch it as a project task"). This one
   stays manual because it's interleaved with project-specific notes; `flow-sync` never rewrites it.
5. **Wire the drift check (optional but recommended).** In the repo's CI, export
   `FLOW_CANONICAL_VERSION` (derive it from `git ls-remote --tags https://github.com/CandidDan/flow`
   or canonical's `VERSION`) before `flow-doctor` runs, so the repo *warns* when it falls behind.
   `flow-sync` is the matching *fix*.

## Verify (the dogfood)

1. **Tooling green locally:** `node --test .flow/bin/*.test.mjs` and `node .flow/bin/flow-doctor.mjs`
   both clean against the synced bins.
2. **Gate fires end-to-end on a real PR (the whole point).** Open the cutover PR and confirm
   `flow-gates` actually runs and enforces build/lint/test/coverage + the store-guard + touches-guard
   from *Nudge's* `.flow/config.yml`. A green required check on a real PR is the proof the plan asks
   for — the reusable workflow reads the consuming repo's store because checkout pulls Nudge's repo.
3. **Status transitions:** open/close a throwaway `flow/<id>-…` PR and confirm `flow-status` flips
   the task `in_review` ↔ `ready`, and `flow-done` flips it `done` on merge (CAN-52 branch/title id).
4. **flow-sync dry-run:** trigger `flow-sync` via `workflow_dispatch`. With `.flow/VERSION` level at
   `1.0.0` it should report "up to date" and open nothing. (When canonical later tags a newer
   version, it opens the reviewed adopt-PR.)

## Rollback

The cutover is one PR; revert it. The reusable workflows are pinned `@v1`, so canonical can't move
under the repo without a deliberate tag bump or a `flow-sync` PR — there's no silent-change exposure.

## After Nudge

Repeat for Roost and Meadow. Once all three are on the thin callers, the `flow-*.yml` copy surface
is gone owner-wide; what remains is governed by the stamp + drift check + `flow-sync`.
