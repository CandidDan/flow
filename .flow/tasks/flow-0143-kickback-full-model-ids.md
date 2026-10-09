---
id: "flow-0143"
title: "Kickback's Claude steps use full model IDs and report the model that answered"
status: "in_review"
priority: 2
project: "flow"
owner: "claude-session-012CTneThg94vo5drhs7QSEY-w0143"
created: "2026-10-09"
started: "2026-10-09T03:40:08Z"
branch: "flow/flow-0143-kickback-full-model-ids"
pr: "https://github.com/CandidDan/flow/pull/201"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - ".github/workflows/_flow-kickback.yml"
  - ".flow/bin/model-ids.test.mjs"
  - ".flow/bin/flow-kickback-workflow.test.mjs"
  - "changes/flow-0143.md"
labels: [cost, review, kickback]
notes:
  - "2026-10-09 (orchestrator): ORIGIN. flow-0140's follow-up ask (kickback was exempted, `MODEL_EXEMPT` in model-ids.test.mjs) and #198's blocking code-review finding: the flow-0135 worker did this work inside the security fix, which was out of its scope, and was told to revert it. The reverted work is in commit 61762df on `flow/flow-0135-kickback-push-in-own-job` (fixer `--model claude-opus-5-5`, both card writers `claude-sonnet-5-5`, three byte-identical 'Report the model that answered' steps, and a test in flow-kickback-workflow.test.mjs). Reuse it, rebased onto flow-0135's merged layout."
  - "2026-10-09 (orchestrator): DECIDED. Model choice mirrors flow-0140/0142: the fixer writes code, so Opus; the two card writers summarise, so Sonnet. The model stays a literal in the workflow and is not read from `review:` config; per-task model selection is flow-0083's job."
  - "2026-10-09 (orchestrator): UNBLOCKED. flow-0135 merged (PR #198, 402944a); blocked_by cleared, status ready."
---

## Context

flow-0140 moved every Claude step to full model IDs and added a step after each that reports which
model answered. It exempted `_flow-kickback.yml` because flow-0135 was rewriting that file. With
flow-0135 merged, the exemption and the bare aliases (`opus`, `sonnet`) are the last of the drift.

## Scope

**Does:** in `_flow-kickback.yml`, replace each bare `--model` alias with a full ID (fixer
`claude-opus-5-5`, both card writers `claude-sonnet-5-5`). Add, after each of the three Claude steps,
the "Report the model that answered" step, byte-identical to `_flow-review.yml`'s. In
`model-ids.test.mjs`, remove `_flow-kickback.yml` from `MODEL_EXEMPT`; with nothing left, delete
the exemption mechanism unless a test needs it. Raise the Claude-step and report-step counts from
7 to 10, and name the three new steps in the assertion message. Add or keep a test in
`flow-kickback-workflow.test.mjs` only if `model-ids.test.mjs` does not already prove the
kickback steps. Write `changes/flow-0143.md`.

**Does not touch:** the kickback job layout or the FLOW_PAT boundary (flow-0135), review config,
callers.

## Acceptance criteria

- [ ] Given `_flow-kickback.yml`, then no `--model` value is a bare alias and each of its three
      Claude steps uses the ID named in Scope. Proved by `model-ids.test.mjs` with no exemption.
- [ ] Given `MODEL_EXEMPT` (or its removal), then no reusable workflow is exempt, and reintroducing
      `--model opus` into a copy of `_flow-kickback.yml` fails naming the file and line. Proved by
      the existing mutation test, now run over kickback too.
- [ ] Given the reusables, then there are 10 Claude steps and 10 report steps, every report step
      byte-identical and reading its own step's `execution_file`. Proved by `model-ids.test.mjs`.
- [ ] Given `changes/flow-0143.md`, then it exists and states the caller action (none). Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
