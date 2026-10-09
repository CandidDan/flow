---
id: "flow-0144"
title: "Reviewer models come from canonical: unset is the norm, a set key is the warning"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-session-012CTneThg94vo5drhs7QSEY-w0144"
created: "2026-10-09"
started: "2026-10-09T09:03:15Z"
branch: "flow/flow-0144-review-models-from-canonical"
pr: "https://github.com/CandidDan/flow/pull/203"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "project-template/.flow/config.yml"
  - "project-template/README.md"
  - ".flow/config.yml"
  - ".flow/bin/model-ids.test.mjs"
  - "changes/flow-0144.md"
labels: [review, urgent]
notes:
  - "2026-10-09 (orchestrator): ORIGIN. Dan, 2026-10-09, after the 3.3.1 rollout: 'Inflight shouldn't be using defined models only the canonical spec', and yes to removing every adopter's pins. The rule is that adopting repos never set reviewer models, and canonical's DEFAULT_MODELS decide. In flight in the adopters: a PR in each of progress#129, write#155, later#45, Nudge#342 and tanplan-platform#96 drops its `sonnet`/`opus` pins. inflight's pins and its review-config test were changed on its sync PR (#59). Canonical still points the other way. flow-0142 made every UNSET key warn ('not set — falling back'), and the template and canonical's own config SET all three, so a new repo copies pins. This task flips both."
  - "2026-10-09 (orchestrator): DECIDED, do not re-litigate. (1) An unset model key is silent: it is the intended path, and a warning on it trains people to set pins. (2) A SET model key warns, naming the key, its value and canonical's default: 'review.<key> is set to \"<v>\"; reviewer models come from canonical (default \"<d>\"); remove it unless this repo deliberately overrides'. A warning, not a failure: an override stays possible for a deliberate experiment, but it is visible on every PR's plan summary. (3) The keys stay parseable and validated (checkModel) exactly as now, so an override still works and a malformed value still fails `plan`. (4) The template's and canonical's own `review:` blocks drop the three keys and say, in a comment, where the defaults live and that repos do not set them. (5) model-ids.test.mjs keeps guarding the template and canonical configs: its no-alias check must still pass when the keys are absent, and it gains an assertion that neither config sets any of the three keys."
---

## Context

Reviewer models should be one decision, made in canonical and shipped to every repo. Per-repo pins
drift silently: inflight sat on `claude-sonnet-5` / `claude-opus-5` after the move to 5.5. Today
canonical encourages pins. It warns when a key is unset, and the template config sets all three,
so new repos copy them.

## Scope

**Does:**

- `flow-review.mjs` `parseReviewConfig`: drop the "is not set — falling back" warnings. Add one
  warning per model key that IS set, worded per the notes. Resolution, validation and
  `DEFAULT_MODELS` are unchanged.
- `flow-review.test.mjs`: tests for both behaviours. Update the existing tests that pinned the
  unset-key warnings (flow-0142 added them); don't delete their coverage, invert it.
- `project-template/.flow/config.yml` and canonical's `.flow/config.yml`: remove `model`,
  `code_review_model` and `security_model` from `review:`. Replace the comments with a short note:
  models come from `DEFAULT_MODELS` in `.flow/bin/flow-review.mjs` (qa and the guide on Sonnet,
  code-review and security on Opus), repos do not set them, and setting one is a visible override.
- `.flow/bin/model-ids.test.mjs`: keep AC2 passing with absent keys, and add the assertion that
  neither config sets any of the three keys.
- README review-model paragraph: say the same in two or three sentences, replacing the "set all
  three for one model everywhere" advice.
- `changes/flow-0144.md`. **Caller action:** remove `review.model`, `review.code_review_model` and
  `review.security_model` from `.flow/config.yml`. Until you do, each plan summary warns once per
  key.

**Does not touch:** `DEFAULT_MODELS` values, the review workflow, the kickback or queue-runner
models, any adopter repo.

## Acceptance criteria

- [ ] Given a `review:` block with none of the three model keys (and given no `review:` block),
      when parsed, then there are no model-related warnings, and the three checks resolve to
      `DEFAULT_MODELS`. Proved by a test in `flow-review.test.mjs`.
- [ ] Given a block that sets one or more model keys, when parsed, then there is exactly one
      warning per set key, naming the key, its value and the canonical default, and the set value
      is still the one used. Proved by a test.
- [ ] Given an unusable value in any model key (e.g. `"opus; rm -rf"`), when `plan` runs, then it
      still fails naming the key. The existing tests pass unchanged.
- [ ] Given the template config and canonical's `.flow/config.yml`, then neither sets `model`,
      `code_review_model` or `security_model` under `review:`. Proved in `model-ids.test.mjs`, and
      AC2 still passes.
- [ ] Given `changes/flow-0144.md`, then it exists and states the caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
