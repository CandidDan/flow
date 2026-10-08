---
id: "flow-0140"
title: "Workers and reviewers run the 5.5 models: action pin to v1.0.245, full model IDs, code-review on Opus"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-10-08"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G9", "G10"]
touches:
  - ".github/workflows/_flow-queue-runner.yml"
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/_flow-compass.yml"
  - ".github/workflows/_flow-triage.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "project-template/.flow/bin/review-guide.test.mjs"
  - "project-template/.flow/config.yml"
  - "project-template/README.md"
  - ".flow/bin/action-pins.test.mjs"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/workflow-prompt-paths.test.mjs"
  - ".flow/bin/model-ids.test.mjs"
  - "changes/flow-0140.md"
labels: [cost, review, queue-runner, urgent]
notes:
  - "2026-10-08 (orchestrator): URGENT, approved by Dan 2026-10-08. FINDING (verified by downloading both CLI builds and listing their model IDs): every claude-code-action step is pinned to 5ccc3a35 (v1.0.219), which installs Claude Code 2.1.266. That CLI knows `claude-opus-5` and `claude-sonnet-5` but no 5.5 model, so the `--model opus` / `--model sonnet` aliases have been running Opus 5 and Sonnet 5, a generation behind, silently. v1.0.245 (6fed3ca145920b639991cb756090506e1bcaf515, 2026-10-07) installs 2.1.293, which knows claude-opus-5-5, claude-sonnet-5-5 and claude-fable-5-1."
  - "2026-10-08 (orchestrator): DECIDED with Dan, do not re-litigate. (1) Full model IDs, not aliases: an alias resolves through whatever CLI the pin installs, which is exactly how this drifted with nothing reporting it. A new model is then a one-line, reviewed change. (2) Review split: qa and the review guide stay on Sonnet (criterion-to-test mapping is mostly mechanical, and qa has been catching real issues); code-review moves to Opus, because builds move to Sonnet in flow-0083 and a Sonnet reviewer grading Sonnet work shares its blind spots; security stays Opus. Never Fable for security work."
  - "2026-10-08 (orchestrator): `_flow-kickback.yml` is deliberately NOT in touches: flow-0135 (urgent, ready) rewrites it, and its model jobs are off (`auto_fix_rounds: 0`). Its pin and `--model` values stay as they are; flow-0135 or a follow-up moves them. The model-ID test below must therefore exempt `_flow-kickback.yml` by name, with a comment pointing here, and flow-0135's worker should drop that exemption if it lands second. flow-0083 (per-task model) is blocked on this task: both edit `_flow-queue-runner.yml`."
  - "2026-10-08 (orchestrator): touches lists the existing tests that pin the old SHA, the old version comment, `--model opus|sonnet` or `DEFAULT_MODEL = \"sonnet\"` (found by grep). Edit them only where they actually fail; do not widen further without a note."
---

## Context

Every Claude step in Flow's reusable workflows uses an action pin whose bundled CLI predates the
5.5 models, and passes a bare alias (`opus`, `sonnet`) that resolves through that CLI. Workers have
been running Opus 5 and reviewers Sonnet 5 without anything saying so. Separately, once builds move
to Sonnet (flow-0083), the code-review check should be the stronger model.

## Scope

**Does:**

- Repin `anthropics/claude-code-action` to `6fed3ca145920b639991cb756090506e1bcaf515 # v1.0.245`
  in `_flow-queue-runner.yml`, `_flow-review.yml`, `_flow-compass.yml` and `_flow-triage.yml`.
- Replace every bare alias passed to `--model` in those files with a full ID. The queue runner's
  worker: `claude-opus-5-5` (flow-0083 then makes it per-task).
- `flow-review.mjs`: `DEFAULT_MODEL` becomes `claude-sonnet-5-5`. Add an optional
  `review.code_review_model`, resolved like `security_model` (falls back to `model`), validated by
  the same `checkModel`, and emitted by `plan` as a new output the code-review job reads.
- `project-template/.flow/config.yml` `review:` sets `model: "claude-sonnet-5-5"`,
  `code_review_model: "claude-opus-5-5"`, `security_model: "claude-opus-5-5"`, with a comment
  saying why each, and that IDs are full on purpose.
- Every Claude step's run summary states the model that actually answered, read from the action's
  execution output (verify the field at implementation time; do not guess). If the action exposes
  no such field, state the requested ID and say "not reported by the action" in the summary.
- A test, `.flow/bin/model-ids.test.mjs`: no `--model` value in `.github/workflows/_flow-*.yml`
  (except `_flow-kickback.yml`, see notes) and no `review.*model` in the template config is a bare
  alias (`opus`, `sonnet`, `haiku`, `fable`, `mythos`); each matches `^claude-[a-z]+-\d+(-\d+)*$`.
  Mutation: an alias reintroduced into a copy of a workflow fails, naming file and line.
- README's review-model paragraph and the changelog fragment. **Caller action:** none for a repo
  that does not set `review.*model`; a repo that sets an alias there keeps working but should move
  to a full ID (say so).

**Does not touch:** `_flow-kickback.yml` (see notes), per-task model selection (flow-0083), the
review prompts, the gate.

## Acceptance criteria

- [ ] Given the four named reusables, then every `claude-code-action` ref is
      `6fed3ca145920b639991cb756090506e1bcaf515` with a `v1.0.245` comment.
- [ ] Given those reusables and the template config, then no model value is a bare alias, and
      reintroducing `--model opus` into a copy fails the test naming file and line.
- [ ] Given a config with no `review.code_review_model`, then code-review runs on `review.model`;
      given one, code-review runs on it while qa and the guide stay on `review.model`.
- [ ] Given an unusable `code_review_model` (e.g. `"opus; rm -rf"`), then `plan` fails naming
      the key, as `security_model` does today.
- [ ] Given a run of any Claude step, then the step summary names the model that answered, or
      states that the action does not report it.
- [ ] Given `changes/flow-0140.md`, then it exists and states the caller action.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
