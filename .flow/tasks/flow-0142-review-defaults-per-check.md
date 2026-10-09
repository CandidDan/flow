---
id: "flow-0142"
title: "code-review and security default to Opus in every repo, not only where config says so"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-session-012CTneThg94vo5drhs7QSEY-w0142"
created: "2026-10-09"
started: "2026-10-09T00:56:03Z"
branch: "flow/flow-0142-review-defaults-per-check"
pr: "https://github.com/CandidDan/flow/pull/197"
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
  - "changes/flow-0142.md"
labels: [cost, review, urgent]
notes:
  - "2026-10-09 (orchestrator): ORIGIN. Gap found after flow-0140 merged (3.3.0). flow-0140's decision, made with Dan on 2026-10-08, was: qa and the guide on Sonnet, code-review and security on Opus. It shipped as config, but an adopter's `.flow/config.yml` is repo-owned and never synced, so the template's three keys reach only new repos. In an adopter with no review models set, flow-sync delivers `DEFAULT_MODEL = claude-sonnet-5-5` to all three checks. Dan approved writing this follow-up ('Let's gooo', 2026-10-09, in reply to the plan that named it); the `urgent` label carries flow-0140's own urgency, because this task completes that decision fleet-wide."
  - "2026-10-09 (orchestrator): DECIDED, do not re-litigate. Each check gets its own default and stops falling back to `review.model`: qa + guide `claude-sonnet-5-5`, code-review `claude-opus-5-5`, security `claude-opus-5-5`. Rejected: keeping the fallback to `model` and changing only the no-config case. That would leave any repo that set `model` alone (most likely, to pin qa) with code-review and security on that model. That is the drift flow-0140 removed, and it would hide inside an innocent-looking key. The cost of the change (G9) is two Opus calls per PR where a repo had set only `model`. Dan already decided that cost; the changelog must say so plainly."
---

## Context

flow-0140 gave code-review its own model key and set the split in the template config. Config is
repo-owned, so the split never reaches an existing adopter: there, every check resolves to
`review.model`, else `DEFAULT_MODEL` (Sonnet). The defaults live in `flow-review.mjs`, which *is*
synced, so that is where the split has to live for the fleet to get it.

## Scope

**Does:**

- `flow-review.mjs`: replace the single `DEFAULT_MODEL` fallback chain with per-check defaults,
  exported so tests and the README can cite them, e.g. `DEFAULT_MODELS = { model:
  "claude-sonnet-5-5", code_review_model: "claude-opus-5-5", security_model: "claude-opus-5-5" }`
  (names are yours). Each key resolves `explicit value || its own default`, never another key.
  Keep `DEFAULT_MODEL` exported if anything outside this file imports it (grep first); otherwise
  remove it.
- Warnings: an unset key warns naming the key and the default it fell to (today only `model`
  warns). The `plan` summary already prints each resolved model; it must still name all three.
- `checkModel` validation unchanged; every default passes it.
- Template `config.yml` `review:` comments: say the three keys are independent and what each
  defaults to, so a repo that wants one model everywhere knows it must set all three.
- README review-model paragraph: the same, one or two sentences.
- `changes/flow-0142.md`. **Caller action:** none for a repo with no review models set (it gains
  Opus on code-review and security). A repo that set only `review.model` sees code-review and
  security move to Opus; to keep them on its model, set `code_review_model` and `security_model`
  to the same value. State the cost plainly: two Opus review calls per PR.

**Does not touch:** `_flow-review.yml` (its `code_review_model || model` fallback becomes inert
but is harmless; leave it, since a base-branch helper that predates this task still needs it),
the review prompts, `max_diff_bytes`, canonical's own `.flow/config.yml` (it already sets all
three).

## Acceptance criteria

- [ ] Given a `review:` block with no model keys (and given no `review:` block at all), then
      `plan` resolves qa/guide to `claude-sonnet-5-5`, code-review to `claude-opus-5-5` and
      security to `claude-opus-5-5`. Proved by tests in `flow-review.test.mjs`.
- [ ] Given only `review.model: "claude-haiku-5-5"`, then qa/guide use it while code-review and
      security stay on their Opus defaults. Proved by a test.
- [ ] Given all three keys set, then each check uses its own key. Proved by a test (the existing
      override tests may already cover this; extend rather than duplicate).
- [ ] Given an unset key, then a warning names that key and the default it fell to. Proved by a
      test per key.
- [ ] Given an unusable value in any key (e.g. `"opus; rm -rf"`), then `plan` still fails naming
      the key. Existing tests must still pass unchanged.
- [ ] Given `changes/flow-0142.md`, then it exists and states the caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
