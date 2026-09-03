---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0039"
title: "Open the auto-PR as a draft, so a pushed branch stops claiming to be ready for review"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G7", "G9"]
touches:
  - ".github/workflows/_flow-open-pr.yml"
  - ".github/workflows/_flow-recover.yml"
  - ".github/workflows/_flow-status.yml"
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/flow-status.yml"
  - ".github/workflows/flow-review.yml"
  - "project-template/.github/workflows/flow-status.yml"
  - "project-template/.github/workflows/flow-review.yml"
  - "project-template/.flow/PROTOCOL.md"
  - "docs/flow-reusable-workflows.md"
  - ".flow/bin/draft-pr-lifecycle.test.mjs"
labels: [infra, protocol]
notes: []
---

## Context

`flow-open-pr` fires on `push` to `flow/**` (`.github/workflows/flow-open-pr.yml`), and opens a PR
as soon as the branch is ahead of base with no PR yet. That is CAN-50 working exactly as designed:
autonomous workers reliably did claim → branch → build → gate → push and then ended their turn
*without* `gh pr create`, stranding the task, so PR creation was deliberately taken off the model's
critical path. Nothing below argues with that. The PR should keep opening on the first push.

The defect is what the PR **claims**. `_flow-open-pr.yml` calls `gh pr create` with no `--draft`,
so a branch one commit in announces itself as ready for review, and three things downstream believe it:

- `_flow-status.yml` transitions the task to `in_review` on `pull_request: opened` — so the store,
  and the flightdeck reading it, report a task as finished and awaiting a human while the worker is
  still mid-build. That is the repo misreporting its own in-flight state (G7).
- `_flow-review.yml` runs the three Definition-of-Done reviewers (`qa`, `code-review`, `security`)
  on `opened` — and again on every `synchronize`, i.e. **on every subsequent work-in-progress push**.
  Three agent invocations per push, against code the worker has not finished writing (G9).
- `_flow-recover.yml` opens its recovery PRs the same way, for branches that are stranded by
  definition.

Reported independently by multiple worker sessions: "when I push my branch, flow-open-pr opens a PR
before I'm ready." They are describing this, correctly.

The fix is not to gate PR *creation* on a readiness signal — that reintroduces precisely the failure
CAN-50 exists to prevent, because a worker that forgets `gh pr create` is the same worker that
forgets to signal ready. The fix is to keep opening the PR unconditionally and open it as a **draft**,
and to make the two workflows that act on "this work is finished" key off the PR leaving draft state
instead of off it existing.

## Scope

**Does:**
- `_flow-open-pr.yml` and `_flow-recover.yml`: open with `gh pr create --draft`. On a repository
  where drafts are unavailable (they need a paid plan on private repos), warn and retry once
  without `--draft` — a branch with no PR at all is the worse outcome and the one CAN-50 forbids.
- `_flow-status.yml`: a draft `opened`/`reopened` sets `in_progress` (still recording `branch` and
  `pr`, which is new information the store did not have this early); a non-draft `opened`/`reopened`
  keeps today's `in_review`; a new `ready_for_review` action sets `in_review`. Add an explicit
  no-op default for any action the reusable does not model, so a caller pinned to a newer tag than
  the reusable degrades to silence instead of running `apply-board-edits.mjs` with no edits file.
- `_flow-review.yml`: gate the `plan` job on the PR not being a draft. `qa`, `code-review` and
  `security` all declare `needs: plan`, so one condition suppresses all four jobs.
- The `flow-status.yml` and `flow-review.yml` thin callers, in canonical's `.github/workflows/`
  **and** in `project-template/.github/workflows/`: add `ready_for_review` to `pull_request.types`.
- `project-template/.flow/PROTOCOL.md`: correct the lifecycle description — `in_review` is now set
  when the PR is marked ready, not when it opens — and name `gh pr ready` as the worker's hand-off
  step.
- `docs/flow-reusable-workflows.md`: correct the `_flow-status.yml`, `_flow-open-pr.yml` and
  `_flow-recover.yml` rows.

**Does not:**
- Touch `flow-gates`. It should keep running on drafts: a worker wants the gate red *early*, and the
  anxiety a red check causes is fixed by the PR visibly being a draft, not by muting the gate.
- Touch `project-template/.flow/bin/flow-open-pr.mjs`. It is a pure decision helper with no PR-state
  concept, and idempotency is unaffected — `gh pr list --state open` already counts draft PRs, so a
  re-push still finds the existing PR and no second one is opened.
- Bump `VERSION` or `project-template/.flow/VERSION`, or move the `v1` alias. Publishing is
  `release-tag.yml` / `flow-release-publish.yml`'s deliberate step, and the template's callers pin
  `@v1`, so caller and reusable move together at release rather than skewing here.
- Change any consuming repo. They pick this up through `flow-sync` at the next tag.

## Acceptance criteria

- [ ] Given a `flow/<id>-…` branch ahead of base with no open PR, when `_flow-open-pr.yml` opens
      the PR, then the `gh pr create` invocation passes `--draft`.
- [ ] Given that `gh pr create --draft` fails, when the step handles it, then it emits a warning and
      retries `gh pr create` once without `--draft`, so the branch is never left with no PR.
- [ ] Given `_flow-recover.yml` opens a PR for a stranded branch, then that invocation also passes
      `--draft`.
- [ ] Given a `pull_request` `opened` (or `reopened`) event whose `pull_request.draft` is true, when
      `_flow-status.yml` runs, then the task is set to `in_progress`, and `branch` and `pr` are still
      recorded.
- [ ] Given a `pull_request` `opened` (or `reopened`) event whose `pull_request.draft` is false, when
      `_flow-status.yml` runs, then the task is set to `in_review` as it is today.
- [ ] Given a `pull_request` `ready_for_review` event, when `_flow-status.yml` runs, then the task is
      set to `in_review`.
- [ ] Given a `pull_request` action `_flow-status.yml` does not model, when the step runs, then it
      exits 0 without writing `.flow/board-edits.json` and without invoking `apply-board-edits.mjs`.
- [ ] Given a draft PR, when `_flow-review.yml` is called, then its `plan` job does not run — and
      because `qa`, `code-review` and `security` each declare `needs: plan`, neither do they.
- [ ] Given the `flow-status.yml` and `flow-review.yml` callers in both `.github/workflows/` and
      `project-template/.github/workflows/`, then each lists `ready_for_review` in
      `on.pull_request.types`.
- [ ] Given the `flow-gates.yml` callers in both directories, then neither gained a draft condition —
      the gate still runs on draft PRs.
- [ ] Given `project-template/.flow/PROTOCOL.md`, then its lifecycle section states that `in_review`
      is set when the PR is marked ready for review, and its worker hand-off step names `gh pr ready`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Draft pull requests require a paid plan on **private** repositories. The fleet spans both public
  (`flow`, `later`) and private repos, which is why the fallback in criterion 2 is a criterion and
  not a nicety — it must degrade to a non-draft PR rather than fail the workflow.
- `github.event.pull_request.draft` is present on every `pull_request` event, so no extra API call
  is needed to read draft state in either `_flow-status.yml` or `_flow-review.yml`.
- After this lands, the worker's final act is `gh pr ready`. If the worker forgets, the PR still
  exists as a draft and the task honestly reads `in_progress` — strictly better than today, where
  forgetting produces a task that falsely reads `in_review`.
