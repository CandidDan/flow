---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0094"
title: "The reusable workflows run canonical's own helpers from their own commit, so moving an alias can never strand a repo without a helper"
status: "in_review"
priority: 1
project: "flow"
owner: "claude-worker"
created: "2026-09-29"
started: "2026-09-29T06:08:17Z"
branch: "flow/flow-0094-reusables-run-canonical-helpers"
pr: "https://github.com/CandidDan/flow/pull/126"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # G10: the gate tells the truth. On 28-29 Sep every @v2 repo went red between the alias move and its sync PR, for a reason unrelated to its own code.
touches:
  - ".github/workflows/_flow-gates.yml"
  - ".github/workflows/_flow-done.yml"
  - ".github/workflows/_flow-open-pr.yml"
  - ".github/workflows/_flow-queue-runner.yml"
  - ".github/workflows/_flow-recover.yml"
  - ".github/workflows/_flow-status.yml"
  - "project-template/.flow/bin/source-roots.mjs"
  - "project-template/.flow/bin/check-claude-md.mjs"
  - "project-template/.flow/bin/touches-guard.mjs"
  - "project-template/.flow/bin/*.test.mjs"
  - ".flow/bin/canonical-helpers-workflow.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "docs/adr/0008-helpers-from-canonical.md"
  - "changes/flow-0094.md"
labels: [flow-infra, release, reusable-workflows]
notes:
  - "2026-09-29 (orchestrator): EVIDENCE. Moving `v2` changes every repo's reusable workflows instantly; the `.flow/bin/` helpers they call arrive only when that repo's sync PR merges. 2.1.0 made `_flow-gates.yml` call `source-roots.mjs` and 2.1.1 `check-claude-md.mjs`, so every @v2 repo (progress, inflight, ...) failed every PR until synced. flow-0091 (sync on drift) shortens that window on the edge; this task closes it for everyone."
  - "2026-09-29 (orchestrator): DECIDED WITH THE HUMAN: the reusable fetches canonical's `project-template/.flow/bin/` at the SAME commit as the running workflow and runs the helper from there. Precedent: flow-0079 runs `flow-review.mjs` from a base-branch worktree with `REVIEW_REPO_DIR` pointing back at the checkout. The repo's synced copy remains for local runs and for its own `flow-tooling` tests."
  - "2026-09-29 (orchestrator): THE TRAP. Many helpers resolve the store as `dirname(realpath(import.meta.url))/..` (canonical CLAUDE.md, 'adapters, not copies'). Run from a canonical checkout under RUNNER_TEMP, such a helper would read canonical's template fixtures, not the repo, and still exit 0. Every helper moved to the canonical path must take the repo root from an explicit env var (the `REVIEW_REPO_DIR` pattern) and fail loudly if it is unset. A test must prove a helper run from a foreign directory reads the target repo."
  - "2026-09-29 (orchestrator): STEP ONE IS A PROOF, not code. Establish how a reusable learns its own commit: `job_workflow_sha` is an OIDC claim; whether an expression exposes it directly is unverified. If no reliable source exists, fall back to an explicit `flow_ref` input defaulting to the alias the caller pins, and record the race (alias moves mid-run -> helper one release ahead for that run) in the ADR. Write the ADR before converting workflows."
  - "2026-09-29 (orchestrator): SLICE IF NEEDED. If the whole set is too large for one PR, the gate's three helpers (`source-roots`, `check-claude-md`, `touches-guard`) are slice one; they are what broke the fleet. File the rest as a follow-up with the same mechanism. `flow-doctor` and the `flow-tooling` tests stay on the repo's copy on purpose: they validate the repo's synced state."
  - "2026-09-29 (orchestrator): NOT parallel-safe with flow-0080, 0083, 0093 (queue runner), 0085, 0089, 0084 (review), 0091, 0092 (sync). pick-task sequences them; this one is priority 1."
  - "2026-09-29 (worker): STEP ONE DONE. `docs/adr/0008-helpers-from-canonical.md` is written and pushed on branch `flow/flow-0094-reusables-run-canonical-helpers`. PROVED: `job.workflow_sha` + `job.workflow_repository` (job context, GitHub Contexts reference, fetched 2026-09-29) are the documented purpose-built properties; `github.job_workflow_sha` is NOT exposed as an expression (actions/runner#2417); `github.workflow_sha` is the CALLER's. Fallback input `flow_ref` for GHES only, default empty, moving branches refused. Repo-root contract named: `FLOW_REPO_DIR` (+ `FLOW_CI` as the CI-mode opt-in, chosen over `GITHUB_ACTIONS` so a repo on an OLDER workflow tag with newer helpers keeps working). SLICE ONE taken: `_flow-gates.yml` only (source-roots, check-claude-md, touches-guard). NEXT: convert the three template helpers + `_flow-gates.yml`, then tests, docs, changelog fragment."
  - "2026-09-29 (worker): SLICE ONE COMPLETE, gate green (build/lint/test 1398 pass/coverage 95.76%). `_flow-gates.yml` fetches canonical's `project-template/.flow/bin/` at `job.workflow_sha` into `$RUNNER_TEMP` and runs source-roots, check-claude-md and touches-guard from there; `FLOW_REPO_DIR` + `FLOW_CI` point them back at `github.workspace`; the four fetch-step copies are pinned byte-identical. FOR THE ORCHESTRATOR, two things: (1) OUT OF DECLARED `touches`, unavoidably — `.flow/bin/adapters.test.mjs` and `.flow/bin/source-roots-gate.test.mjs` pinned the old `node .flow/bin/<helper>` invocation and had to be updated with it; touches-guard ignores all of `.flow/**` so CI does not flag them, and the declaration listed only the new `.flow/bin/canonical-helpers-workflow.test.mjs`. Widen `touches` on main if you want the record exact. (2) FOLLOW-UP NEEDED for the unconverted reusables (`_flow-done`, `_flow-open-pr`, `_flow-queue-runner`, `_flow-recover`, `_flow-status` -> apply-board-edits, parse-task-id, flow-open-pr, pick-task, queue-runner-verify, flow-recover): same mechanism, no new decisions, ADR-0008 already covers it. NOTE also that `docs/adr/0008` deliberately says `owner/repo` rather than the bare canonical slug, because `adr-split-authoring.test.mjs` counts files naming it and asserts that count against ADR-0005's amendment, which is outside this task's `touches`."
---

## Context

Reusable workflows are resolved from canonical at the caller's pinned ref; the helpers they
invoke with `node .flow/bin/<x>.mjs` are resolved from the calling repo's checkout, which only
changes when flow-sync's PR merges. Any release that makes a reusable depend on a new or changed
helper therefore breaks every pinned repo until it syncs. The helpers today, per workflow:
gates (`source-roots`, `check-claude-md`, `touches-guard`, `flow-doctor`), done/status
(`apply-board-edits`, `parse-task-id`), open-pr (`flow-open-pr`), queue-runner (`pick-task`,
`queue-runner-verify`), recover (`flow-recover`, `flow-open-pr`, `apply-board-edits`). review
already runs its helper from base (flow-0079).

## Scope

**Does:**

- An ADR, `docs/adr/0008-helpers-from-canonical.md`: how a reusable finds its own commit (proved,
  with the evidence), the fallback if it cannot, the env-var contract for the repo root, and why
  `flow-doctor` and `flow-tooling` stay on the repo's copy.
- In each converted reusable: fetch canonical's `project-template/.flow/bin/` at that commit into
  `$RUNNER_TEMP`, run the helper from there, with the repo root passed explicitly.
- Each converted helper accepts the repo root from one env var (name it once, in the ADR), and
  exits non-zero naming the variable when it is unset in CI mode. No helper silently falls back to
  its own directory when invoked from the canonical path.
- Remove the "`.flow/bin/<x>.mjs` is missing, run flow-sync" branches from converted steps; they
  can no longer happen.
- Docs and changelog fragment `changes/flow-0094.md`. **Caller action: none.**

**Does not touch:** `flow-doctor`'s or `flow-tooling`'s use of the repo's copy; `_flow-review.yml`
(already done by flow-0079); flow-sync's surface.

## Acceptance criteria

- [ ] The ADR exists and records how the commit is obtained, with the evidence (a run log or
      documented context), and the fallback's race if the fallback is used.
- [ ] For each converted helper: given it is run from a directory outside the target repo with the
      repo-root variable set, then it reads the target repo's config/store (test with two distinct
      fixture repos, asserting on a value only the target has).
- [ ] For each converted helper: given the repo-root variable is unset in CI mode, then it exits
      non-zero and names the variable.
- [ ] Structure test: no converted reusable step invokes `node .flow/bin/<converted helper>`
      against the caller's checkout; each invokes it from the fetched canonical path.
- [ ] Structure test: the canonical fetch pins the same commit/ref the ADR specifies, never a
      moving branch like `main`.
- [ ] Given a scratch adopter whose `.flow/bin/` LACKS `source-roots.mjs` and `check-claude-md.mjs`
      (built as in `adopter-layout.test.mjs`), then the converted gate steps still succeed. This
      is the 2.1.0 break, proved closed.
- [ ] `flow-doctor` and the `flow-tooling` test step still run the repo's own copy (structure test).
- [ ] `docs/flow-reusable-workflows.md` explains the split: CI runs canonical's helpers; the repo's
      copy serves local runs and its own tests.
- [ ] `changes/flow-0094.md` exists and states "Caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
