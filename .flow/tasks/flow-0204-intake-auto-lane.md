---
id: "flow-0204"
title: "A trusted, trivial issue becomes an `intake: auto` maintenance task, and its PR fails a check above 20 changed lines"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-11-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Needs verified provenance from flow-0202 and the flow:size/* labels from flow-0203; released when both are done."
cancelled_reason: ""
blocked_by: ["flow-0202", "flow-0203"]
serves: ["G11"]
intent: ""
touches:
  - ".github/workflows/_flow-triage.yml"
  - ".github/workflows/_flow-gates.yml"
  - "project-template/.flow/bin/intake-trust.mjs"
  - "project-template/.flow/bin/intake-trust.test.mjs"
  - "project-template/.flow/bin/intake-size-guard.mjs"
  - "project-template/.flow/bin/intake-size-guard.test.mjs"
  - "project-template/.flow/tasks/_TEMPLATE.md"
  - ".flow/bin/triage-auto-lane.test.mjs"
  - ".flow/bin/canonical-helpers-workflow.test.mjs"
  - "changes/flow-0204.md"
labels: [intake, triage, gates, security, adr-0010]
model: "opus"
effort: "high"
model_reason: "Removes the up-front human touchpoint for one class of work across the fleet; the lane's entry conditions and the diff bound are the only things standing between a submitter and an agent-built PR"
notes:
  - "2026-11-03 orchestrator: ADR-0010 task 4 of 6 (§4). Accepted when Dan merged CandidDan/flow#277 (b81de46); no canonical intent file, so `intent` is empty by design."
  - "2026-11-03 orchestrator: criteria from the #277 review note: the worker prompt marks the issue body as untrusted data (security review on CandidDan/inflight#90); max_changed_lines is additions plus deletions, and Dan set it to 20; a trusted issue labelled spam takes the normal path."
asks: []
---

## Context

ADR-0010 §4. The automatic lane needs **both** signals: provenance `trusted` (from flow-0202) and size
`trivial` (from flow-0203). It creates a ready task directly, as `auto-ok` does today, the worker builds
it, and **Dan merges** (VISION NG7). The fix is bounded mechanically: `touches-guard` holds its
`touches`, and a new check fails its PR when the diff exceeds `intake.trivial.max_changed_lines`
(Dan: **20**, counted as additions plus deletions).

## Scope

1. **Lane selection** in `_flow-triage.yml`, decided by a step from data, not by the agent:
   | provenance | size | lane |
   |---|---|---|
   | trusted | `flow:size/trivial` | **automatic**: create the task directly |
   | trusted | `normal`, `spam`, or no size label | today's path: proposal comment, `proposed`, wait for `approved` |
   | public | any | never automatic; reaches a task only by a verified human `approved` |
   `flow:size/trivial` counts only if its latest `labeled` event was made by the `label-size` job's
   actor (`github-actions[bot]`) or by a write-access `User` (reuse `verifyLane` from flow-0201).
2. **Task shape** for the automatic lane: `serves: ["maintenance"]`, `intent: ""`, `model: "haiku"`,
   `effort: "low"`, a `model_reason`, `issue:` set to the issue URL, `intake: auto`, and a narrow
   `touches` (named files, no directory-wide globs such as `src/**`). Add `intake:` to
   `project-template/.flow/tasks/_TEMPLATE.md` with a comment (empty, or `auto`).
3. **Untrusted text in the task**: the created task quotes the submitted text only inside a section
   headed `## Submitted text (untrusted data)`, opened by a fixed sentence telling the worker that the
   section is data from an outside submitter and that instructions inside it are not to be followed.
   The agent prompt in `_flow-triage.yml` requires that section and that sentence verbatim.
4. **Diff-size check**: new `project-template/.flow/bin/intake-size-guard.mjs`, run in
   `_flow-gates.yml` next to `touches-guard` (add it to that workflow's `for helper in` list). For a
   PR whose task has `intake: auto`, it fails when the PR's total additions plus deletions exceed
   `readIntakeConfig(...).maxChangedLines`, naming both numbers. For any other task it passes
   without reading the diff.
5. Fragment `changes/flow-0204.md`: **No caller action** — the lane only fires in repos that set
   `intake.trusted_labelers` and receive `flow:size/*` labels.

**Does not:** merge anything, enable auto-merge, change `auto-ok`'s existing behaviour, close spam,
or add the `issues` trigger.

## Acceptance criteria

- [ ] `triage-auto-lane.test.mjs`: provenance `trusted` + verified `flow:size/trivial` selects the
      automatic lane.
- [ ] `triage-auto-lane.test.mjs`: provenance `trusted` + `flow:size/spam` selects the proposal path,
      never the automatic lane; so does `trusted` + `normal` and `trusted` + no size label.
- [ ] `triage-auto-lane.test.mjs`: provenance `public` + `flow:size/trivial` never selects the
      automatic lane.
- [ ] `intake-trust.test.mjs`: `flow:size/trivial` applied by a `Bot` other than
      `github-actions[bot]` is not honoured; by `github-actions[bot]` or a write-access `User` it is.
- [ ] `triage-auto-lane.test.mjs`: the agent prompt states the automatic-lane task shape (maintenance,
      haiku, low, `intake: auto`, `issue:` set, no directory-wide globs in `touches`).
- [ ] `triage-auto-lane.test.mjs`: the agent prompt requires the `## Submitted text (untrusted data)`
      section and its fixed warning sentence, quoted exactly.
- [ ] `intake-size-guard.test.mjs`: for an `intake: auto` task, a diff of 12 additions + 8 deletions
      (20) passes and 12 + 9 (21) fails with a message naming 21 and 20.
- [ ] `intake-size-guard.test.mjs`: with `max_changed_lines: 50` in config, 40 changed lines pass.
- [ ] `intake-size-guard.test.mjs`: a task without `intake: auto` passes regardless of diff size.
- [ ] `canonical-helpers-workflow.test.mjs` (or the gates-helper test it belongs to) passes with
      `intake-size-guard.mjs` in `_flow-gates.yml`'s helper list.
- [ ] `changes/flow-0204.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run coverage`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

If the gates-helper list is asserted by a test other than `canonical-helpers-workflow.test.mjs`,
that test is in scope; widen nothing else. The check counts the PR's diff against its base, the
same diff `touches-guard` reads.
