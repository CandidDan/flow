---
id: "flow-0041"
title: "Release blocked tasks whose dependency has landed and start the next worker, with no model in the loop"
status: "in_progress"
priority: 1
project: "flow"
owner: "queue-runner-38854909716"
created: "2026-09-03"
started: "2026-10-16T05:17:15Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G7", "G8", "G9"]
touches:
  - "project-template/.flow/bin/flow-unblock.mjs"
  - "project-template/.flow/bin/flow-unblock.test.mjs"
  - "project-template/.flow/bin/apply-board-edits.mjs"
  - "project-template/.flow/bin/apply-board-edits.test.mjs"
  - ".flow/bin/flow-unblock.mjs"
  - ".flow/bin/adapters.test.mjs"
  - ".github/workflows/_flow-unblock.yml"
  - ".github/workflows/flow-unblock.yml"
  - "project-template/.github/workflows/flow-unblock.yml"
  - "docs/flow-reusable-workflows.md"
  - "project-template/.flow/PROTOCOL.md"
  - "changes/flow-0041.md"
labels: [infra, protocol, cost, urgent]
model: "opus"
effort: "high"
model_reason: "Reusable CI workflow plus a shared writer (apply-board-edits) that flow-recover depends on; a fleet-wide blast radius per the task-writer rubric."
notes:
  - "2026-10-16 (orchestrator): URGENT, Dan 2026-10-16, so it bypasses queue_cap; unparked p3 -> p1. ORIGIN: Write ran an hourly Opus scheduled task ('Write queue auto-advance', 17 connectors attached) whose only job was 'when X merges, unblock Y and dispatch the queue runner'. Dan killed it for cost and asked for this in canonical with no model. Scope WIDENED by two pieces, see the new Scope bullets: (a) the sweep also fires on flow-done completion, not only on a schedule; (b) after releasing, it dispatches the queue runner. Prior art with tests: CandidDan/write branch wip/queue-chain, scripts/queue-chain.mjs (chain-file version; the decision logic and the unblock text edit carry over, the chain file does not: order is expressed through blocked_by)."
  - "2026-10-13 (orchestrator): PARKED: p3 held out of the ready queue so p1/p2 work runs first (Dan's decision)."
  - "2026-10-02 (orchestrator): unblocked on the human's say-so. Every blocked_by entry had landed (checked against main), and inflight listed it as UNBLOCK."
---

## Context

`blocked` is the one status with no automated exit. `flow-status` owns `in_review` and the
return to `ready`, `flow-done` owns `done`, `flow-recover` heals a stranded `in_progress` — and
a blocked task waits for a human to notice its dependency landed. Every other transition in the
lifecycle is owned by a workflow; this one is owned by someone remembering.

The failure mode is quiet, which is what makes it worth automating. A task stuck `in_progress`
is loud — it holds a claim and blocks its `touches`. A task left `blocked` after its dependency
merged simply never gets picked up: the queue looks healthy, the board looks fine, and the work
just does not happen. Nothing turns red.

`flow-0040` makes the dependency machine-readable by adding `blocked_by`. This task is the half
that acts on it, and it is deliberately shaped as a **sweep** rather than an event hook — see
the notes for why the `flow-done` alternative was considered and set aside.

Live example from a consuming repo: `write-0043` is blocked solely on `write-0033`'s PR #51.
When #51 merges, `write-0033` goes `done` automatically and `write-0043` stays blocked
indefinitely. That repo now carries a task whose own `blocked_reason` has to explain that
unblocking is manual — a workaround written into the store because the protocol has no answer.

## Scope

- **A pure classifier** in `project-template/.flow/bin/flow-unblock.mjs`, following the shape
  `flow-recover.mjs` established: the module decides, the workflow does the git/gh I/O. Given a
  task's status and the resolved state of each `blocked_by` entry, it returns whether the task
  should be released. Same CLI-plus-exported-function shape, same zero dependencies.
- **Resolution rules.** A `blocked_by` entry naming a task id is satisfied when that task is
  `done` on `main`. An entry naming a PR url is satisfied when that PR is **merged** — a PR
  closed unmerged does NOT satisfy it, because the premise of the block did not happen. A task
  is released only when **every** entry is satisfied; one unresolved entry keeps it blocked.
- **A canonical adapter** at `.flow/bin/flow-unblock.mjs` — CLI shell and canonical's store
  location only, never a copy of the logic (canonical's `CLAUDE.md` is explicit; do not
  symlink it either).
- **The transition writes through `apply-board-edits.mjs`**, as `flow-recover` does — a commit
  to `main`, never a hand-edit. That script currently patches only `status` and `priority`, so
  extend it to clear `blocked_reason` (and `blocked_by`) when a task leaves `blocked`. A
  released task carrying the prose of a block that no longer applies is stale data of exactly
  the kind `flow-0040`'s own criteria reject.
- **A reusable `_flow-unblock.yml`** plus canonical's thin caller and the template caller
  downstream repos get, documented in `docs/flow-reusable-workflows.md` alongside the others.
- **When it runs — three triggers, one job.** `workflow_run` on `flow-done` completing (so a
  dependent is released within about a minute of its dependency merging), a schedule (the
  self-correcting backstop the notes below argue for; hourly is fine, it costs seconds and no
  model), and `workflow_dispatch`. All three live in the callers; the reusable is trigger-agnostic.
- **Then start the next worker.** After the release step, if the repo has at least one `ready`
  task, no `flow-queue-runner` run is `queued`, `waiting` or `in_progress`, and
  `vars.FLOW_QUEUE_RUNNER` is not `paused`, dispatch `flow-queue-runner.yml` with **no**
  `task_id` so `pick-task` chooses (priority and `touches` overlap stay its rules, not this
  workflow's). This also covers a merge that released nothing but left a `ready` task waiting for
  tomorrow's scheduled tick. The dispatch needs `actions: write`; grant it in the callers only. A
  repo whose caller lacks it (not yet synced) must get a `::warning::` and a green run, never a
  red one. The runner's workflow file name is a reusable input defaulting to
  `flow-queue-runner.yml`. Dispatching uses `GITHUB_TOKEN` (workflow_dispatch is the documented
  exception to GITHUB_TOKEN not triggering workflows) — never `FLOW_PAT`.
- **Protocol text.** `project-template/.flow/PROTOCOL.md` says `blocked` is "the only status with
  no automatic way out". Update that paragraph to say `flow-unblock` releases a task once every
  `blocked_by` entry resolves, and that a block with no machine-readable entry still needs a human.
- **Changelog fragment** `changes/flow-0041.md`. Caller action: run `flow-sync` to get the new
  `flow-unblock.yml` caller; nothing else.
- **Not gated on `FLOW_AI`.** `flow-recover` is dormant without autonomous workers because
  there is nothing to strand. That reasoning does not carry over: a repo driven entirely by
  humans still has blocked tasks with dependencies that land, so gating this the same way would
  switch it off exactly where it is most useful.

**Deliberately not touched.** No change to `flow-done`, `flow-status`, `flow-recover` or their
reusables — this is a new concern, not a widening of an existing one. No change to `_TEMPLATE.md`
or the `blocked_by` contract; `flow-0040` owns that and this task consumes it as given. No
flightdeck or mission-control rendering. No `flow-watchdog` change. The sweep never *sets*
`blocked` and never touches a task whose `blocked_by` it cannot fully resolve.

## Acceptance criteria

- [ ] Given a blocked task whose only `blocked_by` names a task that is `done`, when the
      classifier runs, then it reports the task should be released.
- [ ] Given a blocked task whose only `blocked_by` names a task that is not `done`, when the
      classifier runs, then it reports the task stays blocked.
- [ ] Given a blocked task with two `blocked_by` entries of which one is satisfied, when the
      classifier runs, then it reports the task stays blocked.
- [ ] Given a blocked task whose `blocked_by` names a PR that merged, when the classifier runs,
      then it reports the task should be released.
- [ ] Given a blocked task whose `blocked_by` names a PR that was closed without merging, when
      the classifier runs, then it reports the task stays blocked, distinguishably from the
      not-yet-resolved case so the caller can surface it.
- [ ] Given a blocked task with an empty or absent `blocked_by`, when the classifier runs, then
      it reports the task stays blocked and is never released — a block a machine cannot read is
      a block only a human may lift.
- [ ] Given a task that is not blocked, when the classifier runs, then it is never released,
      whatever its `blocked_by` holds.
- [ ] Given a released task, when the edit is applied, then on `main` its status is `ready`, its
      `blocked_reason` is empty and its `blocked_by` is empty, and no other field changed.
- [ ] Given the reusable workflow and both callers, when `npm run build` runs, then every
      workflow file parses.
- [ ] Given both callers, then each triggers on `workflow_run` of `flow-done` (types
      `[completed]`), on a `schedule`, and on `workflow_dispatch`, and grants exactly
      `contents: write` and `actions: write`. (a test reading the caller YAML)
- [ ] Given at least one `ready` task, no queue-runner run queued/waiting/in progress, and
      `FLOW_QUEUE_RUNNER` unset, when the dispatch decision runs, then it dispatches with no
      `task_id`; given any one of those three conditions false, then it does not. (pure decision
      function, tested per condition)
- [ ] Given the dispatch is refused with HTTP 403, when the step runs, then it emits a
      `::warning::` naming the missing `actions: write` and the job still succeeds. (test on the
      step's shell, or the decision helper's handling of the status)
- [ ] Given the changelog fragment, then
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`
      passes.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

No open decisions. Four were settled when this task was written:

- **Superseded in part (2026-10-16):** the sweep now ALSO fires on `flow-done` completion via
  `workflow_run`, in its own workflow. That keeps every reason below (self-correcting, catches
  blocks written after the dependency landed, `flow-done` unchanged) and adds the speed of the
  event. It is still a sweep: each run re-reads the whole store, so a missed run loses nothing.
- **A sweep, not a hook in `flow-done`.** Releasing dependents at merge time, inside the
  workflow that already fires on merge, is tempting and cheaper. It was set aside because it
  only catches tasks blocked *before* the dependency merged: a task written blocked on something
  already `done` would never be released, and a missed or failed `flow-done` run loses the
  release permanently with nothing to retry it. A periodic sweep is self-correcting and does not
  care when the block was written. An event hook remains a reasonable *addition* later, on the
  prevention-plus-recovery pattern `flow-open-pr` and `flow-recover` already use — but the sweep
  is the half that has to exist first, and this task is only the sweep.
- **A separate workflow, not a second classifier inside `flow-recover`.** Two reasons, either
  sufficient: `flow-recover` is dormant until `FLOW_AI=true` and this must not be, and its
  staleness threshold is meaningless here — a dependency that has landed has landed, and making
  a release wait 75 minutes to look stale enough would be inventing a delay.
- **Release to `ready`, never straight to `in_progress`.** The sweep restores eligibility; it
  does not claim. Claiming stays first-push-wins among workers.
- **Never release a block it cannot read** (criterion 6). A human who blocks a task for a reason
  no field captures must be able to trust it stays blocked. This is the safety property that
  makes the rest of the automation acceptable, and it is why `flow-0040` validates that a
  blocked task either declares `blocked_by` or says why it cannot.

**Flag rather than guess:**

- If a pairing check asserts every `_flow-*.yml` has a template caller (see the comment in
  `flow-watchdog.yml`, which documents itself as the deliberate exception), this task ships all
  three files and should satisfy it — but if it needs an allowlist entry, widen `touches` on
  `main` per the guard's instruction rather than dropping a file.
- If extending `apply-board-edits.mjs` to clear fields turns out to change how it patches
  `status`/`priority` for existing callers, stop and say so. `flow-recover` writes through that
  script and must keep working unchanged; a shared writer that changes behaviour under an
  existing caller is a bigger decision than this task.
- If resolving a PR url requires a token scope the thin caller does not already have, note it
  rather than widening `permissions:` speculatively — canonical's security focus names
  least-privilege in these reusables as a first-class concern.

Related: `flow-0040` (the `blocked_by` field this consumes, and the reason this task is
blocked), `flow-recover` / `_flow-recover.yml` (the sweep whose shape this follows).
