---
id: "flow-0205"
title: "Triage runs when an issue opens or gets a lane label, opt-in per repo, and filtered events never start a runner"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-11-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "The trigger is only safe once public issues are filtered (flow-0202) and sized (flow-0203); released when both are done."
cancelled_reason: ""
blocked_by: ["flow-0202", "flow-0203"]
serves: ["G11", "G9"]
intent: ""
touches:
  - "project-template/.github/workflows/flow-triage.yml"
  - ".github/workflows/_flow-triage.yml"
  - ".flow/bin/triage-issues-trigger.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0205.md"
labels: [intake, triage, ci, adr-0010]
model: "opus"
effort: "high"
model_reason: "Puts public issue titles and bodies into the event payload of a workflow with write permissions in every adopting repo, and its cost control rests on one job-level if: expression"
notes:
  - "2026-11-03 orchestrator: ADR-0010 task 5 of 6 (§5). Accepted when Dan merged CandidDan/flow#277 (b81de46); no canonical intent file, so `intent` is empty by design."
  - "2026-11-03 orchestrator: criterion from the #277 review note: a test proving a filtered `labeled` event never starts a runner — the filter is a job-level if:, not a step-level one."
asks: []
---

## Context

ADR-0010 §5. A form button saying "Send to an agent" cannot wait for a weekday cron. The thin
caller gains `issues: [opened, labeled]`, opt-in per repo through a repository variable so a repo
without intake spends nothing (G9). The daily sweep stays as the backstop.

## Scope

1. `project-template/.github/workflows/flow-triage.yml` adds `issues: types: [opened, labeled]`
   beside its `schedule` and `workflow_dispatch`.
2. The calling job gets a **job-level** `if:` that is true only for:
   - `schedule` and `workflow_dispatch` (unchanged behaviour), or
   - `issues` events when `vars.FLOW_INTAKE == 'true'` and either the action is `opened`, or the
     action is `labeled` and `github.event.label.name` is one of `approved`, `auto-ok`,
     `flow:trusted`.
   Any other `labeled` event, including `flow:size/*` (applied by the classifier), evaluates false
   at job level, so no runner starts.
3. `concurrency:` on that job: one group per issue for `issues` events
   (`flow-triage-issue-<number>`), and one shared group for the sweep, with
   `cancel-in-progress: false`.
4. In `_flow-triage.yml`, an `issues`-event run works only on the event's issue: the inbox step
   lists that one issue instead of the whole inbox, and every other rule (author filter, label
   verification, classifier on `opened` only) applies unchanged. The issue number reaches steps
   through `env:`.
5. `docs/flow-reusable-workflows.md`: one short section on opting in (`FLOW_INTAKE=true`) and its
   cost (one cheap-model call per opened issue).
6. Fragment `changes/flow-0205.md`: caller action — re-sync the `flow-triage.yml` caller; set the
   repository variable `FLOW_INTAKE=true` only to opt in.

**Does not:** change the cron, run the classifier on `labeled`, or enable anything for a repo that
has not set `FLOW_INTAKE`.

## Acceptance criteria

- [ ] `triage-issues-trigger.test.mjs`: the template caller's `on:` includes `issues` with exactly
      `opened` and `labeled`, plus the existing `schedule` and `workflow_dispatch`.
- [ ] `triage-issues-trigger.test.mjs`: the filter is the calling **job's** `if:` (not a step's), and
      evaluating it against fixture contexts gives: `schedule` → true; `issues/opened` with
      `FLOW_INTAKE=true` → true; `issues/opened` without it → false; `issues/labeled` with label
      `approved`, `auto-ok` or `flow:trusted` and `FLOW_INTAKE=true` → true; `issues/labeled` with
      `flow:size/trivial`, `bug` or `proposed` → false. A false job-level `if:` is what proves no
      runner starts.
- [ ] `triage-issues-trigger.test.mjs`: the job declares a `concurrency:` group that contains the
      issue number for `issues` events, with `cancel-in-progress: false`.
- [ ] `triage-issues-trigger.test.mjs`: for an `issues` event, the inbox step in `_flow-triage.yml`
      requests only that issue, taking the number from `env:`.
- [ ] `triage-issues-trigger.test.mjs`: no `run:` block in the caller or `_flow-triage.yml` contains
      `${{ github.event.issue.` or `${{ github.event.label.`.
- [ ] `triage-issues-trigger.test.mjs`: `docs/flow-reusable-workflows.md` names `FLOW_INTAKE`.
- [ ] `changes/flow-0205.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run coverage`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

Canonical's own `.github/workflows/flow-triage.yml` caller (if present) is out of scope: canonical
does not run intake. If a caller-pin or caller-shape test fails because the template caller changed,
that test file is a scope signal: set `blocked` and name it rather than editing it unlisted.
