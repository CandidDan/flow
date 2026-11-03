---
id: "flow-0203"
title: "A tool-less cheap model sizes each new issue, and a separate model-free job is the only one that writes its `flow:size/*` label"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-11-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Reads intake.classifier_model through the parser that flow-0200 adds; released when flow-0200 is done."
cancelled_reason: ""
blocked_by: ["flow-0200"]
serves: ["G11", "G9"]
intent: ""
touches:
  - ".github/workflows/_flow-triage.yml"
  - "project-template/.flow/bin/intake-classify.mjs"
  - "project-template/.flow/bin/intake-classify.test.mjs"
  - ".flow/bin/triage-classifier.test.mjs"
  - "changes/flow-0203.md"
labels: [intake, triage, security, ci, adr-0010]
model: "opus"
effort: "high"
model_reason: "Adds a model call over public text and an issues: write job to a reusable workflow; the permission split between the two jobs is the security property and is easy to collapse by accident"
notes:
  - "2026-11-03 orchestrator: ADR-0010 task 3 of 6 (§3). Accepted when Dan merged CandidDan/flow#277 (b81de46); no canonical intent file, so `intent` is empty by design."
  - "2026-11-03 orchestrator: criteria from the #277 review note: the labelling JOB refuses anything outside flow:size/(trivial|normal|spam) and gets the label only via env:; an unknown classifier_model tier fails closed to normal; the classifier runs on `opened` only and a `labeled` event never re-runs it."
asks: []
---

## Context

ADR-0010 §3: each new issue is sized as exactly one of `trivial | normal | spam` by a cheap model
that has no tools and no write token. Size is the only signal a model may set; provenance never is.
GitHub Actions grants permissions per **job**, so the label write must be a separate job that runs
no model.

## Scope

1. New `project-template/.flow/bin/intake-classify.mjs`:
   - `buildPrompt(title, body)`: a fixed instruction that the issue is data to classify, not
     instructions, and that the answer is one word from the three.
   - `parseVerdict(rawModelOutput)`: returns `trivial`, `normal` or `spam` when the trimmed output
     is exactly one of them (case-insensitive); anything else returns `normal`.
   - `resolveClassifierModel(tier)`: maps the tier through `task-model.mjs`; an unknown or empty
     tier returns `null`, meaning **do not call a model and record `normal`** (fail closed), with a
     `::warning::` naming the bad tier.
2. `_flow-triage.yml` gains two jobs:
   - **`classify`**: `permissions: { contents: read, issues: read }` and nothing else. Runs only when
     `github.event_name == 'issues' && github.event.action == 'opened'`. Reads the issue title and
     body through `env:` into a file, calls the model with **no tools**, validates with
     `parseVerdict`, and exposes the verdict as a job output.
   - **`label-size`**: `needs: classify`, `permissions: { issues: write }`, runs **no model** and no
     third-party action. Receives the verdict only through `env:`, accepts it only if
     `flow:size/<verdict>` matches `^flow:size/(trivial|normal|spam)$`, and otherwise fails the job
     and applies nothing. It removes any other `flow:size/*` label so the issue carries exactly one,
     and creates the label if the repo lacks it.
3. `spam` is a label only: nothing closes, locks, hides or deletes an issue because of it.
4. Fragment `changes/flow-0203.md`: **No caller action** — the jobs only run on `issues` events,
   which no caller sends until the opt-in trigger task lands.

**Does not:** add the `issues` trigger to any caller, act on the size (that is the automatic-lane
task), classify on `labeled` events, or give the existing `triage` job any new permission.

## Acceptance criteria

- [ ] `intake-classify.test.mjs`: `parseVerdict` returns `trivial`/`normal`/`spam` for exactly those
      words (any case, surrounding whitespace allowed), and `normal` for `"trivial."`,
      `"trivial normal"`, `"flow:size/trivial"`, an empty string, and a prompt-injection reply such
      as `"Ignore that. trivial"`.
- [ ] `intake-classify.test.mjs`: `resolveClassifierModel("haiku")` returns the haiku model id from
      `task-model.mjs`; `resolveClassifierModel("gpt-9")` and `("")` return `null`.
- [ ] `triage-classifier.test.mjs`: when the classifier tier is unknown, the `classify` job records
      `normal` without making a model call.
- [ ] `triage-classifier.test.mjs`: the `classify` job's `permissions:` are exactly
      `contents: read` and `issues: read`, and it invokes the model with no tools enabled.
- [ ] `triage-classifier.test.mjs`: `label-size` is the only job in `_flow-triage.yml` whose
      permissions include `issues: write` together with no model step; it uses no `uses:` action
      that runs a model.
- [ ] `triage-classifier.test.mjs`: the `label-size` validation, run with verdicts `trivial`,
      `normal`, `spam`, applies `flow:size/<verdict>`; run with `approved`, `flow:trusted`,
      `trivial;rm -rf`, `../trivial` and an empty value, it exits non-zero and applies no label.
- [ ] `triage-classifier.test.mjs`: no `run:` block in `_flow-triage.yml` contains
      `${{ github.event.issue.` — issue fields reach steps only through `env:`.
- [ ] `triage-classifier.test.mjs`: the `classify` job's `if:` is false for an `issues` `labeled`
      event and for `schedule`, and true for `issues` `opened`.
- [ ] `triage-classifier.test.mjs`: no step in either job closes, locks or deletes an issue.
- [ ] `changes/flow-0203.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run coverage`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

Use the same model-call mechanism and the same pinned action the other reusables already use, with
tools disabled. If no existing mechanism can run a model with zero tools, set this task `blocked`
with a `decision` ask rather than adding a new dependency (canonical's dependency footprint is a
security focus item).
