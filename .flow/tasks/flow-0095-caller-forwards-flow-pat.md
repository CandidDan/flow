---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0095"
title: "The template queue-runner caller forwards FLOW_PAT, so flow-0093's fix reaches adopting repos"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-09-29"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - "project-template/.github/workflows/flow-queue-runner.yml"
  - ".flow/bin/flow-pat-forwarding.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0095.md"
labels: [queue-runner, credentials, flow-infra]
notes:
  - "2026-09-29 (orchestrator): GAP LEFT BY flow-0093 (orchestrator's scoping miss, not the worker's). flow-0093 made `_flow-queue-runner.yml` check out and run `gh` with `secrets.FLOW_PAT || secrets.GITHUB_TOKEN`. Canonical's own caller forwards FLOW_PAT; `project-template/.github/workflows/flow-queue-runner.yml` passes only CLAUDE_CODE_OAUTH_TOKEN, with a header saying the reusable 'never uses' FLOW_PAT. So in every adopting repo the secret is empty inside the reusable and the worker still pushes with GITHUB_TOKEN. tanplan-platform is the repo waiting on this."
  - "2026-09-29 (orchestrator): VERSIONING: additive. The reusable declares FLOW_PAT `required: false`, so a caller that does not forward it keeps today's behaviour. flow-sync delivers the updated thin caller (it is on the synced surface unless customised with extra jobs, flow-0076). Treat as MINOR with a caller action, not MAJOR."
---

## Context

A reusable workflow only receives the secrets its caller passes. The template caller passes
secrets by name, deliberately not `secrets: inherit`, to avoid handing the job credentials it does
not use. Since flow-0093 the queue runner does use FLOW_PAT, for checkout/push and `gh`.

## Scope

**Does:**

- `project-template/.github/workflows/flow-queue-runner.yml` forwards
  `FLOW_PAT: ${{ secrets.FLOW_PAT }}` alongside CLAUDE_CODE_OAUTH_TOKEN, still by name (no
  `secrets: inherit`).
- Rewrite its header: which secrets it forwards and why, that FLOW_PAT is optional and what the
  worker cannot do without it (push workflow changes; create PRs/issues whose checks run), and a
  pointer to the permission list flow-0093 documented.
- Changelog fragment `changes/flow-0095.md`. **Caller action:** adopt the updated caller via
  flow-sync (or add the one `FLOW_PAT` line by hand), and set FLOW_PAT with the documented
  permissions.

**Does not touch:** `_flow-queue-runner.yml`, canonical's own caller (already forwards it), other
callers.

## Acceptance criteria

- [ ] Structure test: the template caller's `secrets:` block forwards `FLOW_PAT` by name and does
      not use `secrets: inherit`.
- [ ] Structure test: every secret the template caller forwards is declared by
      `_flow-queue-runner.yml`'s `on.workflow_call.secrets` (no forwarding into nothing).
- [ ] Structure test: canonical's caller and the template caller forward the same secret names.
- [ ] The template caller's header no longer says the reusable never uses FLOW_PAT, and points to
      the permission list.
- [ ] `changes/flow-0095.md` exists and states the caller action.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
