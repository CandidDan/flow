---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0091"
title: "flow-sync opens a PR when the synced surface differs, not only when VERSION differs, so an edge repo can never be stranded without a helper its workflow calls"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-09-29"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # G10: the gate tells the truth. The gate said 'run flow-sync'; flow-sync said 'up to date'; both were wrong for three days.
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-sync.mjs"
  - "project-template/.flow/bin/flow-sync.test.mjs"
  - ".flow/bin/sync-surface.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0091.md"
labels: [flow-sync, release, flow-infra]
notes:
  - "2026-09-29 (orchestrator): EVIDENCE, twice in one week on progress (the canary, pinned @v2-edge). flow-0077 made `_flow-gates.yml` call `.flow/bin/source-roots.mjs`; flow-0050 made it call `check-claude-md.mjs`. `v2-edge` moves on every merge, but flow-sync only copies `.flow/bin/` when canonical's VERSION is ahead. Canonical's VERSION did not move, so flow-sync answered 'up to date, nothing to do' while every progress PR failed with an error telling the human to run flow-sync. Only a release unblocked it."
  - "2026-09-29 (orchestrator): PRIORITY LOWERED to 3. flow-0094 (reusables run canonical's own helpers) removes the breakage this task was written for. This task remains worth doing so repos' local copies do not go stale on the edge, but it is no longer what keeps PRs green."
  - "2026-09-29 (orchestrator): DECIDED: fix it in flow-sync, not with a per-workflow version check. Declaring a minimum helper version in each reusable would be one more number to forget to bump. Comparing the actual surface is exact: if canonical's copy of the synced files differs from the repo's, the repo is not current, whatever the stamps say. On `@v2` (stable) the surface only changes at a release, so the fleet sees no new noise; on `@v2-edge` the canary gets a sync PR per merge that changes the surface, which is what the canary is for."
---

## Context

`_flow-sync.yml` asks `flow-sync.mjs decide --local <ver> --canonical <ver>` and exits
"Up to date … nothing to do" on `current`. The copied surface (`.flow/bin/*`, the thin
`flow-*.yml` callers, `.flow/PROTOCOL.md`, `.flow/VERSION`) can differ at equal stamps whenever
canonical merges without a release, which `v2-edge` exposes immediately.

## Scope

**Does:**

- When the stamps compare `current`, the workflow still stages the copy into a scratch tree
  and compares it with the repo's files. If anything in the synced surface differs, the verdict
  is a new `drift` (not `current`), and the run proceeds exactly as for `behind`: branch,
  commit, PR. The PR title and body say "same version, surface differs" and list the files.
- `ahead` is unchanged (never downgrade). A customised caller (flow-0076) is still kept and
  reported, and does not count as drift on its own.
- The branch name for a drift sync is distinct from a version sync (e.g. `flow-sync/<ver>-<shortsha>`
  where `<shortsha>` is canonical's commit), so flow-0075's existing-branch logic keeps working.
- The missing-helper errors in the reusables stay as they are; after this task their advice
  ("run flow-sync") is true.
- Changelog fragment `changes/flow-0091.md`. **Caller action: none.**

**Does not touch:** `release-guard.mjs`, `release-tag.yml`, the VERSION stamp rules, what the
surface contains (flow-0092 adds a file to it; whichever lands second rebases).

## Acceptance criteria

- [ ] Given local and canonical stamps equal and one synced file different, when the decision
      runs, then the verdict is `drift` and the run opens a PR listing that file.
- [ ] Given equal stamps and an identical surface, then the verdict is `current` and nothing is
      opened.
- [ ] Given local ahead of canonical, then `ahead`, regardless of surface differences.
- [ ] Given equal stamps where the only difference is a customised caller that flow-0076 keeps,
      then `current` (the kept caller is reported, not synced).
- [ ] The drift branch name includes canonical's short SHA, and flow-0075's existing-branch
      decision handles it (a second run for the same SHA is a no-op; a new SHA rebuilds).
- [ ] `docs/flow-reusable-workflows.md` describes `drift` and why edge repos need it.
- [ ] `changes/flow-0091.md` exists and states "Caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
