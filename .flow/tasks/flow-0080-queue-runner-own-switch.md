---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0080"
title: "Queue runner timing lives in repo variables: a pause switch that leaves review running, and a local-time schedule that follows the operator"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-24"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10", "maintenance"]   # G10: today the only way to pause the runner also stops review. maintenance: the schedule follows the operator's timezone.
touches:
  - ".github/workflows/_flow-queue-runner.yml"
  - "project-template/.github/workflows/flow-queue-runner.yml"
  - "project-template/.flow/bin/queue-runner-schedule.mjs"
  - "project-template/.flow/bin/queue-runner-schedule.test.mjs"
  - ".flow/bin/queue-runner-schedule.mjs"
  - ".flow/bin/queue-runner-switch.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0080.md"
labels: [infra, queue-runner]
notes:
  - "2026-09-24 (orchestrator): Found during the 1.x → 2.0.0 migrations. The advice was 'disable the queue runner', and the obvious way to do that (FLOW_AI=false) also disabled review, compass and triage, so migrated repos briefly had no review at all. Interim workaround in use: FLOW_AI=true plus `gh workflow disable flow-queue-runner`."
  - "2026-09-25 (orchestrator): Extended with the local-time schedule. The operator travels (currently Australia), and the template's `0 7 * * 1-5` UTC cron fires late afternoon there. GitHub Actions has supported an IANA `timezone:` on `schedule` since March 2026, but `on:` is parsed statically: it cannot read `vars.*`, so a native timezone is a literal in the caller file. flow-sync overwrites callers, and a move would mean editing every repo. The time therefore lives in repo variables, checked by the reusable. The operator is a personal account (CandidDan), which has no account-level Actions variables, so these are per-repo variables, set once per repo with `gh variable set`. That needs no file edit and survives sync."
  - "2026-09-25 (orchestrator): GitHub's scheduler is known to fire 15 minutes to 2+ hours late at peak (community discussion #191400). An exact-hour match would silently skip a day whenever a tick is late, so the gate is 'first tick at or after the hour, once per local day', never 'hour equals'."
  - "2026-09-24 (orchestrator): Overlaps flow-0049 on _flow-queue-runner.yml; pick-task will sequence them. Whichever lands second rebases."
---

## Context

Two problems, one file, one principle: **queue-runner timing is set by repo variables, never by
editing the caller.** Callers are overwritten by `flow-sync`, and the operator shouldn't be
editing workflow files across six repos to pause work or change time zone.

**1. There is no pause that leaves review running.** `vars.FLOW_AI` gates review, the queue
runner, triage and compass together. To pause autonomous work (a migration, a delicate release,
a trip), the operator can:

- set `FLOW_AI=false`, which also switches off the three PR review checks, so the gate goes green
  on build/lint/test alone;
- disable the workflow in GitHub, which also blocks `workflow_dispatch`, the one way to work a
  single task on purpose.

**2. The schedule is pinned to UTC.** The template caller runs `0 7 * * 1-5` UTC. The operator
travels. In Australia that is late afternoon, so the day's task lands after the working day is
over. GitHub's native `timezone:` (March 2026) can't help here on its own: `on:` can't read
variables, so it would be a literal in each caller, overwritten by sync and edited per repo on
every move.

## Scope

**Does:**

- **Pause switch.** A repo variable `FLOW_QUEUE_RUNNER`. When it is `paused`, **scheduled** runs
  do nothing. `workflow_dispatch` still works. Unset or any other value: not paused. `FLOW_AI`
  remains the master switch, and `false` still turns everything off, exactly as today.
- **Local-time schedule.** Two optional repo variables:
  - `FLOW_TZ`: an IANA zone, e.g. `Australia/Sydney`;
  - `FLOW_RUN_HOUR`: 0–23, the local hour the day's run should start.

  When **both** are set, the template caller's cron becomes hourly on weekdays-in-any-zone
  (`0 * * * *`), and the reusable decides whether this tick is the run. A scheduled tick
  **proceeds** only when all of these hold:
  - the local weekday in `FLOW_TZ` is Monday–Friday;
  - the local hour is at or after `FLOW_RUN_HOUR`;
  - no scheduled run of this workflow has already dispatched a worker today, with "today" meaning
    the local date in `FLOW_TZ`.

  So a late tick still runs, and nothing runs twice in a local day. Daylight saving is handled by
  the zone database, not by anyone editing a cron.
- **Backward compatible.** With `FLOW_TZ` / `FLOW_RUN_HOUR` unset, today's behaviour holds: one
  run per UTC weekday at 07:00. The hourly cron with no variables set must therefore behave
  identically: proceed only on the 07:00 UTC weekday tick, with the same once-per-day rule.
- **Decision logic is code, not YAML.** The "should this tick run?" decision lives in
  `project-template/.flow/bin/queue-runner-schedule.mjs` as a pure, dependency-free function.
  Inputs: now, zone, hour, the list of today's earlier scheduled runs and whether each
  dispatched. Output: run or skip, plus a one-line reason. The workflow gathers the inputs
  (`gh run list` / `gh api` for earlier runs) and acts on the output. Canonical's
  `.flow/bin/queue-runner-schedule.mjs` is a thin adapter, per the adapter convention in
  canonical's CLAUDE.md.
- **Visible skips.** Every skipped tick writes one line to its step summary: paused, not this
  hour yet, already ran today, or weekend. An hourly workflow that is mostly skips must say *why*
  on every run, or a dead runner looks identical to a quiet one.
- **Docs.** Document all three variables in `docs/flow-reusable-workflows.md` and in the template
  caller's header, including the one-line command to set them per repo:
  `gh variable set FLOW_TZ -R <owner>/<repo> -b Australia/Sydney`.
- Changelog fragment `changes/flow-0080.md`. **Caller action:** re-sync `flow-queue-runner.yml`
  to get the hourly cron, which flow-sync delivers. Until then, the pause switch works but the
  local-time schedule doesn't take effect.

**Does not touch:**

- `_flow-review.yml`, `_flow-triage.yml`, `_flow-compass.yml` or `_flow-recover.yml`.
- Trigger-on-merge (a separate, later task).
- The worker prompt, turn cap, or model.

## Acceptance criteria

- [ ] Given `FLOW_AI=true` and `FLOW_QUEUE_RUNNER` unset, when a scheduled tick passes the
      schedule gate, then the dispatch job runs. This is a static assertion on job conditions in
      `.flow/bin/queue-runner-switch.test.mjs`.
- [ ] Given `FLOW_QUEUE_RUNNER=paused`, when a **scheduled** tick fires, then no worker is
      dispatched and the step summary names the pause and how to resume.
- [ ] Given `FLOW_QUEUE_RUNNER=paused`, when a **workflow_dispatch** run fires, then the dispatch
      job runs. The schedule gate does not apply to dispatch at all.
- [ ] Given `FLOW_AI=false`, when any run fires, then no job that dispatches a worker runs.
- [ ] Given `_flow-review.yml`, then it references neither `FLOW_QUEUE_RUNNER`, `FLOW_TZ` nor
      `FLOW_RUN_HOUR`.
- [ ] Schedule decision (unit tests in `queue-runner-schedule.test.mjs`):
  - [ ] Given `FLOW_TZ=Australia/Sydney` and `FLOW_RUN_HOUR=7`, when the tick is at 06:00 local on
        a weekday, then the result is skip, "before run hour".
  - [ ] Given the same config and a tick at 07:00 local on a weekday with no earlier dispatch
        today, then the result is run.
  - [ ] Given the same config and a **late** tick at 09:40 local with no earlier dispatch today,
        then the result is run.
  - [ ] Given the same config and a tick at 10:00 local after a dispatch at 07:05 local today,
        then the result is skip, "already ran today".
  - [ ] Given the same config and a tick on a local Saturday, then the result is skip, "weekend",
        even if it is a UTC weekday.
  - [ ] Given a tick whose local date differs from its UTC date, then "today" is the local date.
  - [ ] Given a zone crossing a daylight-saving boundary, when ticks run on either side of it,
        then the run hour stays at the same local hour.
  - [ ] Given `FLOW_TZ` and `FLOW_RUN_HOUR` unset, then only the 07:00 UTC weekday tick runs,
        once per UTC day. This matches today's behaviour.
  - [ ] Given an invalid `FLOW_TZ` or a `FLOW_RUN_HOUR` outside 0–23, then the result is skip,
        with a reason naming the bad variable. It never falls back silently.
- [ ] Given the template caller, then its cron is hourly and its header documents the three
      variables and the `gh variable set` command.
- [ ] Given `changes/flow-0080.md`, then it exists and states the caller action (re-sync
      `flow-queue-runner.yml`).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- The value `paused` (rather than a boolean) is deliberate, so an unset variable can never be
  misread as "off".
- An hourly cron costs a few seconds of runner time for each skipped tick. That is accepted, and
  it is why the gate job must stay small: checkout is not needed to decide.
