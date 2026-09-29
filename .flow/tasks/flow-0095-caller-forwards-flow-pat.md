---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0095"
title: "The template queue-runner caller forwards FLOW_PAT, so flow-0093's fix reaches adopting repos"
status: "in_review"
priority: 1
project: "flow"
owner: ""
created: "2026-09-29"
started: "2026-09-29T06:28:32Z"
branch: "flow/flow-0095-caller-forwards-flow-pat"
pr: "https://github.com/CandidDan/flow/pull/127"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - "project-template/.github/workflows/flow-queue-runner.yml"
  - ".flow/bin/flow-pat-forwarding.test.mjs"
  - ".flow/bin/secrets-scope.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0095.md"
labels: [queue-runner, credentials, flow-infra]
notes:
  - "2026-09-29 (orchestrator): UNBLOCKED, touches widened with `.flow/bin/secrets-scope.test.mjs` as the worker asked. Resume on the existing branch and draft PR 127. DECIDED on the design question: `secrets-scope.test.mjs` is the SINGLE owner of the rule 'each caller forwards exactly its reusable's secrets'. Update its template table to [CLAUDE_CODE_OAUTH_TOKEN, FLOW_PAT], refresh its stale v1-era header and test names, and REMOVE the duplicate tests for criteria 1 to 3 from `flow-pat-forwarding.test.mjs`. Name the secrets-scope tests as the proving tests for those criteria in the PR checklist. One fact, one owning test. The frontmatter-hash finding is filed as flow-0096."
  - "2026-09-29 (worker claude-worker-flow-0095): FINDING FOR THE ORCHESTRATOR, outside this task's touches so surfaced rather than patched. `parseTask` in `project-template/.flow/bin/flow-state.mjs` (line ~62) strips a whitespace-preceded hash as a YAML comment from EVERY frontmatter scalar it reads, so any `blocked_reason` containing a GitHub reference like -- PR then hash then number -- is silently truncated from that point on. Hit live here: the original blocked_reason ended with the words not machine-checkable, and flow-doctor kept warning because everything after PR-hash-127 had been cut. The header comment only anticipated a value that STARTS with a hash (issue: quote-hash-157), which does survive. Cost: flow-doctor and the flightdeck can silently read a truncated reason, and a blocked task that did declare itself non-mechanical still nags. This note works around it by writing PR 127 with no hash; the fix belongs in canonical as its own task -- strip the comment only when the value is unquoted, since a double-quoted YAML scalar cannot contain a comment at all."
  - "2026-09-29 (worker claude-worker-flow-0095): BLOCKED ONE EDIT SHORT. GENUINELY DONE and pushed on `flow/flow-0095-caller-forwards-flow-pat` (draft PR 127, two commits): (1) `project-template/.github/workflows/flow-queue-runner.yml` forwards FLOW_PAT alongside CLAUDE_CODE_OAUTH_TOKEN, still by name, and its header is rewritten -- what each secret buys, FLOW_PAT OPTIONAL, the two holes without it (no push under .github/workflows/; a GITHUB_TOKEN-created PR or issue triggers no downstream checks), and a pointer to the permission list in docs rather than a third copy of it. (2) Five new proving tests appended to `.flow/bin/flow-pat-forwarding.test.mjs`, one per acceptance criterion, all passing. (3) `changes/flow-0095.md` with the flow-sync caller action. (4) `docs/flow-reusable-workflows.md`: the queue-runner table cell no longer says FLOW_PAT is unreleased, and the Secrets bullet now explains that a reusable receives only what its caller names. VERIFIED, not assumed: tag `v2` (which the template caller pins) already declares FLOW_PAT `required: false`, so this is additive and cannot fail GitHub validation in an adopting repo -- the secrets-scope header comment claiming the pinned tag declares only one secret is v1-era and now wrong. WHAT ONLY LOOKS DONE: nothing on the branch, but the gate is NOT green -- `npm test` fails 1 of 1381 in `.flow/bin/secrets-scope.test.mjs`, which is not in `touches`. build, lint and coverage (96.07%, floor 83.5) all pass. NEXT ACTION, exactly: add `.flow/bin/secrets-scope.test.mjs` to this task's `touches` on `main`, set status back to `ready` (or kick PR 127 back), and answer the duplication question in `blocked_reason`; then a worker changes one table entry, refreshes that file's stale header and test names, re-runs the gate and marks PR 127 ready. Do NOT re-do the four touched files."
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
