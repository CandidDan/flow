---
id: "flow-0201"
title: "Triage honours `approved`, `auto-ok` and `flow:trusted` only when the issue's events show a permitted actor applied them"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-11-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G11"]
intent: ""
touches:
  - "project-template/.flow/bin/intake-trust.mjs"
  - "project-template/.flow/bin/intake-trust.test.mjs"
  - ".github/workflows/_flow-triage.yml"
  - ".flow/bin/triage-allocate-id.test.mjs"
  - ".flow/bin/triage-label-trust.test.mjs"
  - "changes/flow-0201.md"
labels: [intake, triage, security, adr-0010]
model: "opus"
effort: "high"
model_reason: "Closes a trust gap in a reusable workflow that runs a write-capable agent in every adopting repo; an off-by-one in event ordering or a missed Bot check honours an App's label as a human approval"
notes:
  - "2026-11-03 orchestrator: ADR-0010 task 1 of 6 (docs/adr/0010-intake-lanes.md §2). Accepted when Dan merged CandidDan/flow#277 (b81de46); no canonical intent file exists, so `intent` is empty by design."
  - "2026-11-03 orchestrator: criteria from the review note on #277 'For the session that writes ADR-0010's tasks': test the revoked-write case; log every label not honoured; permission and trusted_labelers are read when triage runs."
asks: []
---

## Context

Today `_flow-triage.yml` treats the `approved` and `auto-ok` labels as human decisions without
checking who applied them (ADR-0010, gap 2). That is safe only while every admitted issue's author
is already trusted. Once an intake App creates issues, the App can label them too, so an App-applied
`approved` would read as Dan's approval. ADR-0010 §2 also introduces `flow:trusted`, which a form
applies after checking an invite link; it is believable only when the right App applied it.

## Scope

1. New `project-template/.flow/bin/intake-trust.mjs` with pure functions plus a CLI:
   - `latestLabeledEvent(events, label)`: from an issue's events
     (`GET /repos/{o}/{r}/issues/{n}/events`, all pages), the most recent `labeled` event for that
     label **that comes after the label's last `unlabeled` event**. If the label was removed after
     its last `labeled` event, there is none.
   - `verifyLane(events, label, { trustedLabelers, permissionOf })` returning
     `{ honoured: boolean, actor, reason }`:
     - `approved` / `auto-ok`: honoured only if the latest `labeled` event's `actor.type` is
       `User` (never `Bot`) **and** `permissionOf(login)` is `write`, `maintain` or `admin`.
       `permissionOf` reads `GET /repos/{o}/{r}/collaborators/{login}/permission` — the events
       payload carries no association.
     - `flow:trusted`: honoured only if that event's `actor.login` is in `trustedLabelers`
       (from `readIntakeConfig`, flow-0200). An empty list honours nobody.
   - Both the permission and `trusted_labelers` are read **when triage runs**, not when the label
     was applied. A login since removed from config, or an approver whose write access was since
     revoked, no longer counts.
2. `_flow-triage.yml`: a step after the inbox filter and before the agent fetches each admitted
   issue's events and the approvers' permissions, runs `intake-trust.mjs` from `$FLOW_BIN`, and
   writes the verified lanes per issue. Add `intake-trust.mjs` and `intake-config.mjs` to the
   `for helper in` list (`.flow/bin/triage-allocate-id.test.mjs` pins that line; update it).
   The agent prompt's steps 2–3 use the verified lanes, not the raw labels: an issue whose
   `approved`/`auto-ok` is not honoured is treated as if the label were absent.
3. Every label that is present but not honoured prints one log line:
   `flow-triage: label-not-honoured issue=<n> label=<label> actor=<login> reason=<reason>`.
4. Fragment `changes/flow-0201.md`: a **behaviour change**, stated as the ADR's Consequences require:
   a repo where a bot applied `approved` or `auto-ok` stops having it honoured; a person with write
   access re-applies it. That is the caller action.

**Does not:** change which issues the inbox admits (that is the next task), classify size, add the
`issues` trigger, or read `flow:trusted` anywhere except to verify it.

## Acceptance criteria

- [ ] `intake-trust.test.mjs`: `approved` applied by a `User` with `write` permission is honoured.
- [ ] `intake-trust.test.mjs`: `approved` applied by an actor whose `type` is `Bot` is not honoured,
      even when that bot's login is in `trusted_labelers` and the permission lookup says `admin`.
- [ ] `intake-trust.test.mjs`: **revoked write** — `approved` applied by a `User` whose permission
      lookup now returns `read` (or 404) is not honoured, and the reason says the actor lacks write.
- [ ] `intake-trust.test.mjs`: with events `labeled(approved, by trusted user)`, `unlabeled(approved)`,
      `labeled(approved, by Bot)`, the label is not honoured (only the latest `labeled` after the
      last `unlabeled` counts). With the order `labeled(by Bot)`, `unlabeled`, `labeled(by trusted
      user)`, it is honoured.
- [ ] `intake-trust.test.mjs`: a label removed after its last `labeled` event is not honoured.
- [ ] `intake-trust.test.mjs`: `flow:trusted` applied by a login in `trusted_labelers` is honoured;
      by any other login (including a write-access `User`) it is not; with `trusted_labelers: []`
      it is never honoured.
- [ ] `intake-trust.test.mjs`: a login removed from `trusted_labelers` after it applied
      `flow:trusted` is no longer honoured on the next run.
- [ ] `triage-label-trust.test.mjs`: `_flow-triage.yml` runs `intake-trust.mjs` in a step that sits
      after the inbox step and before the agent step, passes issue data to it only through `env:`
      or files (no `${{ github.event.issue.* }}` inside any `run:` block), and the agent prompt
      tells it to use the verified lanes, not the raw labels.
- [ ] `intake-trust.test.mjs` or `triage-label-trust.test.mjs`: an unhonoured label produces exactly
      the `flow-triage: label-not-honoured …` log line, with issue, label, actor and reason.
- [ ] `.flow/bin/triage-allocate-id.test.mjs` passes with the widened `for helper in` line.
- [ ] `changes/flow-0201.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run coverage`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

The events endpoint is paginated; fetch every page (`--paginate --slurp`, as the inbox step does).
A permission lookup that errors is treated as "no write", never as "write".
