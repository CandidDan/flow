---
id: "flow-0185"
title: "An idle Flow repo bills at most 100 Actions minutes a month, because bookkeeping workflows run on events instead of hourly and 3-hourly schedules"
status: "in_review"
priority: 1
project: "flow"
owner: "session_01NfrcUAVxgG4o48Hb15rz8U"
created: "2026-11-01"
started: "2026-11-01T07:53:45Z"
branch: "flow/flow-0185-bookkeeping-on-events"
pr: "https://github.com/CandidDan/flow/pull/274"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G9"]
intent: "model-work-off-github-actions"
touches:
  - "project-template/.github/workflows/flow-unblock.yml"
  - "project-template/.github/workflows/flow-dispatch.yml"
  - "project-template/.github/workflows/flow-recover.yml"
  - ".github/workflows/flow-unblock.yml"
  - ".github/workflows/flow-dispatch.yml"
  - ".github/workflows/flow-recover.yml"
  - ".github/workflows/_flow-unblock.yml"
  - ".github/workflows/_flow-dispatch.yml"
  - ".github/workflows/_flow-recover.yml"
  - ".flow/bin/idle-cost.test.mjs"
  - ".flow/bin/flow-dispatch-workflow.test.mjs"
  - ".flow/bin/unblock-no-dispatch.test.mjs"
  - "docs/running-flow-cheaply.md"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0185.md"
labels: [cost, workflows, "4.0.3"]
model: "opus"
effort: "high"
model_reason: "Changes the triggers of fleet-wide reusable workflows; a missed event strands tasks in every adopting repo"
asks:
  - "fyi: PR #274 also edits .flow/bin/adapters.test.mjs, which is outside touches — a 2-line inversion of the assertion that pinned the hourly unblock schedule this task removes; no in-flight task declares it"
  - "follow-up: docs/flow-routines.md:97 still says flow-dispatch runs on workflow_run of flow-unblock/flow-recover; it is outside touches and needs a one-line task"
notes:
  - "2026-11-01 orchestrator: phase 1 of the cost plan Dan approved on 2026-11-01 (options doc 'Flow Infra Options', https://claude.ai/artifact/KbQCQhjz2cMcPwXhxrCzXo). Measured: an idle repo bills about 1,800 minutes a month, almost all from the hourly flow-unblock cron, the flow-dispatch run chained after every unblock and recover, and recover every 3 hours."
  - "2026-11-01 orchestrator: the gate already cancels superseded runs and skips drafts (flow-0136), so that part of the options doc's phase 1 is done and is not in this task."
  - "2026-11-01 worker: done, PR #274 (branch flow/flow-0185-bookkeeping-on-events) marked ready; gate green after rebase (2119 pass, coverage 97.8%). Decision a fresh session should not re-litigate: the spec's fallback (keep workflow_run on unblock/recover, skip the dispatch job without a runner) cannot be built — a job if: sees only the workflow_run payload, whose conclusion is success whether or not anything was pushed. So _flow-unblock.yml and _flow-recover.yml write changed=true to their sweep step output after a successful push and a last step, gated on it, sends repository_dispatch flow-task-state with GITHUB_TOKEN (contents: write already granted; GITHUB_TOKEN repository_dispatch does start workflows). flow-dispatch callers listen on repository_dispatch types [flow-task-state] and no longer on workflow_run. Idle total on template callers: 92 runs/month (35 with FLOW_AI off). Next action: none until review — address any kickback on the same branch."
---

## Context

Today, in `project-template/.github/workflows/` (and canonical's own callers in `.github/workflows/`):

| Caller | Triggers today |
|---|---|
| `flow-unblock.yml` | `workflow_run` of `flow-done`; `schedule` `17 * * * *` (hourly) |
| `flow-dispatch.yml` | `push` to `.flow/tasks/**` on main; `workflow_run` of `flow-unblock` and `flow-recover`; `schedule` `41 6 * * *` |
| `flow-recover.yml` | `schedule` `0 */3 * * *` |

GitHub bills every job at least one minute, so each scheduled run costs one minute or more even
when it finds nothing to do. The hourly unblock plus the dispatch run chained after it is about
1,440 runs a month on its own.

## Scope

- `flow-unblock` runs only when something can have resolved a `blocked_by` entry: when `flow-done`
  completes (already a trigger) and on `workflow_dispatch`. Remove its hourly `schedule`.
- `flow-dispatch` no longer runs after every `flow-unblock` and `flow-recover` run. It runs when a
  task file changes on `main` (the existing `push` trigger), on its daily `schedule`, and on
  `workflow_dispatch`. If a task-state commit made by unblock or recover does **not** trigger the
  `push` event (a commit pushed with `GITHUB_TOKEN` does not start workflows), keep the
  `workflow_run` trigger but make the dispatch job skip, without starting a runner, when the
  triggering run changed no task file. Either way, a task that unblock or recover returns to
  `ready` must still be dispatched within one run, not at the next daily sweep.
- `flow-recover` runs once a day. Keep its stranded-claim threshold unchanged.
- Apply the same trigger changes to canonical's own callers in `.github/workflows/`.
- New page `docs/running-flow-cheaply.md`: what each Flow workflow costs per run and per month
  for an idle repo and for one PR; that public repos are not billed; how to point `FLOW_RUNNER`
  at a cheaper or self-hosted runner. Link it from `docs/flow-reusable-workflows.md`.
- Fragment `changes/flow-0185.md`: a top-level bullet stating the caller action — adopting repos
  get the new triggers through `flow-sync`; a repo with a customised caller must remove the
  hourly unblock cron and the 3-hourly recover cron itself.

**Does not:** change `_flow-review.yml` or `_flow-gates.yml` (flow-0186 owns review); change what
unblock, recover or dispatch do once they run; add any service outside GitHub Actions.

## Acceptance criteria

- [ ] `.flow/bin/idle-cost.test.mjs` parses every `schedule` cron in
      `project-template/.github/workflows/flow-*.yml`, counts the runs each makes in a 30-day
      month, adds one run per `workflow_run`-chained job that starts on each of those scheduled
      runs, and asserts the total at one billed minute per run is **≤ 100**. A mutation check
      in the same test proves that re-adding `17 * * * *` to `flow-unblock.yml` fails it.
- [ ] `flow-unblock.yml` (template and canonical caller) has no `schedule` trigger and still has
      `workflow_run` on `flow-done` and `workflow_dispatch`.
- [ ] `flow-recover.yml` (template and canonical caller) runs at most once a day.
- [ ] Given unblock releases a task to `ready` in a run triggered by `flow-done`, the dispatch
      path still starts for that change in the same chain (a test pins the trigger or the
      skip condition, whichever the implementation uses).
- [ ] Given an unblock or recover run that changed no task file, no dispatch job starts a runner.
- [ ] `docs/running-flow-cheaply.md` exists and is linked from `docs/flow-reusable-workflows.md`.
- [ ] `changes/flow-0185.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
