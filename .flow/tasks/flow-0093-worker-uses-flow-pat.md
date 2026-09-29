---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0093"
title: "The queue-runner worker pushes and opens PRs with FLOW_PAT, so it can land tasks that touch workflow files"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-worker-flow-0093"
created: "2026-09-29"
started: "2026-09-29T05:46:00Z"
branch: "flow/flow-0093-worker-uses-flow-pat"
pr: "https://github.com/CandidDan/flow/pull/125"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - ".github/workflows/_flow-queue-runner.yml"
  - ".flow/bin/flow-pat-forwarding.test.mjs"
  - ".github/workflows/_flow-open-pr.yml"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0093.md"
labels: [queue-runner, credentials, flow-infra]
notes:
  - "2026-09-29 (orchestrator): EVIDENCE, from an adopting repo's worker: it could not push a change to a workflow file, and could not open a PR or file an issue. CONFIRMED IN CANONICAL: `_flow-queue-runner.yml`'s `actions/checkout` passes no `token`, so the persisted git credential is GITHUB_TOKEN. GitHub refuses any GITHUB_TOKEN push that changes `.github/workflows/`, whatever `permissions:` says, so setting FLOW_PAT alone cannot fix it. `github_token: FLOW_PAT || GITHUB_TOKEN` only reaches the action's API calls, not `git push`. Canonical's own queue hits this too: flow-0082/0084/0085/0089 all touch workflow files."
  - "2026-09-29 (orchestrator): DECIDED: do NOT recommend the repo setting 'Allow GitHub Actions to create and approve pull requests'. It only widens GITHUB_TOKEN, and a PR created by GITHUB_TOKEN triggers no downstream workflows, so flow-gates and the three reviewers would never run on it. That is the exact failure `_flow-open-pr.yml` exists to avoid. The fix is one credential, FLOW_PAT, used consistently, with its required permissions written down in one place."
  - "2026-09-29 (orchestrator): RISK, stated: a worker holding a token with Workflows: write can edit CI. The fences stay: touches-guard (a task must declare the workflow file), the review gate planned from base (flow-0079), and human merge. The docs must say to use a short-expiry, single-repo fine-grained PAT."
  - "2026-09-29 (orchestrator): NOT parallel-safe with flow-0080 or flow-0083 (both edit `_flow-queue-runner.yml`). pick-task sequences them."
  - "2026-09-29 (worker): Branch `flow/flow-0093-worker-uses-flow-pat` pushed. DONE: checkout `token:` + step-level `GH_TOKEN` on `_flow-queue-runner.yml`; the four-permission list written once in `_flow-open-pr.yml`'s header and once in `docs/flow-reusable-workflows.md`, plus the docs note on why the Actions PR-creation setting is not the fix. NOT YET: the tests in `.flow/bin/flow-pat-forwarding.test.mjs` (the file already exists for flow-0026 and is being extended, not created), `changes/flow-0093.md`, and the gate. NEXT: add the structure tests + the list-parity test that normalises both copies (strip `#`/`-`/backticks, join wrapped lines, collapse whitespace) and compares them, then run all five gate commands and open the PR."
  - "2026-09-29 (worker): DONE — PR #125 marked ready for review, branch `flow/flow-0093-worker-uses-flow-pat`. All six acceptance criteria have a named proving test in `.flow/bin/flow-pat-forwarding.test.mjs` (7 new tests; criterion 3 is proved by the pre-existing `required: false` test). Gate green after rebase: build 34 workflows, lint 98 .mjs, 1376 tests 0 fail, coverage 96.07% vs floor 83.5. Diff is exactly the five declared `touches` paths. NOT done and deliberately out of scope: `_flow-sync.yml` still carries its own inline three-permission wording (it is not in `touches`, and its wording is not wrong — just not the shared list); a follow-up task could fold it into the parity test. HUMAN ACTION beyond merge: regenerate FLOW_PAT with all four permissions — a token issued before this change lacks Workflows and Issues write, and the worker still cannot push a workflow-file change until it is rotated."
---

## Context

The worker runs inside `anthropics/claude-code-action` after an `actions/checkout` of `main`.
The action receives `github_token: FLOW_PAT || GITHUB_TOKEN` for its own API calls, but git
authenticates with whatever the checkout persisted, which is GITHUB_TOKEN. GitHub never lets
GITHUB_TOKEN push a change under `.github/workflows/`. `_flow-open-pr.yml` already opens PRs with
FLOW_PAT so that the gate runs on them; the worker should use the same credential for the same
reason.

## Scope

**Does:**

- In `_flow-queue-runner.yml`, the worker's checkout uses `token: ${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}`,
  so the worker's `git push` authenticates as FLOW_PAT when it is set. Behaviour without the
  secret is unchanged.
- The worker's `gh` calls use the same token (`GH_TOKEN` from the same expression), so opening a
  PR or an issue from the worker goes through FLOW_PAT.
- One documented permission list for FLOW_PAT, in `docs/flow-reusable-workflows.md` and the
  header of `_flow-open-pr.yml` (which today documents a narrower set): fine-grained, this repo
  only, short expiry; Contents: Read and write; Pull requests: Read and write; Issues: Read and
  write; Workflows: Read and write. State which workflow needs which permission.
- State in the docs that the "Allow GitHub Actions to create and approve pull requests" setting
  is not needed and why (PRs created by GITHUB_TOKEN skip the gate).
- Changelog fragment `changes/flow-0093.md`. **Caller action:** if FLOW_PAT lacks Workflows or
  Issues write, regenerate it with the documented permissions.

**Does not touch:** `_flow-open-pr.yml`'s logic (header comment only), the review workflow,
the worker prompt.

## Acceptance criteria

- [ ] Structure test: the worker job's `actions/checkout` step sets
      `token: ${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}`.
- [ ] Structure test: the worker step exposes `GH_TOKEN` from the same expression.
- [ ] Structure test: FLOW_PAT is still declared `required: false` in `on.workflow_call.secrets`
      (a repo without it keeps today's behaviour).
- [ ] `docs/flow-reusable-workflows.md` and `_flow-open-pr.yml`'s header carry the same
      four-permission list; a test asserts the two lists match.
- [ ] The docs state the Actions PR-creation setting is not needed, with the reason.
- [ ] `changes/flow-0093.md` exists and states the caller action.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
