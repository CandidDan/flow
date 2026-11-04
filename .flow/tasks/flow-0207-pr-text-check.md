---
id: "flow-0207"
title: "A low-cost check fails a task PR whose summary is not in plain English, and editing the description re-runs only that check"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-11-04"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G10"]
intent: "pr-text-plain-english"
touches:
  - "project-template/.flow/bin/flow-pr-text.mjs"
  - "project-template/.flow/bin/flow-pr-text.test.mjs"
  - ".github/workflows/_flow-pr-text.yml"
  - ".github/workflows/flow-pr-text.yml"
  - "project-template/.github/workflows/flow-pr-text.yml"
  - "project-template/.flow/config.yml"
  - ".flow/bin/pr-text-workflow.test.mjs"
  - ".flow/bin/action-pins.test.mjs"
  - ".flow/bin/actions-write-scope.test.mjs"
  - ".flow/bin/caller-pins.test.mjs"
  - ".flow/bin/draft-pr-lifecycle.test.mjs"
  - ".flow/bin/idle-cost.test.mjs"
  - ".flow/bin/model-ids.test.mjs"
  - ".flow/bin/secrets-scope.test.mjs"
  - ".flow/bin/workflow-prompt-paths.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0207.md"
labels: [review, ci]
model: "opus"
effort: "high"
model_reason: "Adds a reusable CI workflow every adopter runs, with a model call on untrusted PR text"
notes: []
asks: []
---

## Context

flow-0206 makes the protocol require that a PR description's first paragraph (its TL;DR) states the
problem and its effect in words a person who has not read the code understands, with no
backticks, file paths, task ids or code names, in at most 60 words.

A rule nobody checks is the situation that produced CandidDan/flow PR #285: the plain-English
rule already existed, and the PR still opened with internal names. Nothing enforces it today. The
qa, security and code-review checks review the code, not the description, so the session that
wrote the code is the only judge of its own description. This task adds that judge, outside the
worker's session, in the same way flow-0007 moved code review out of it.

Dan's constraint: the judge runs on a low-cost model. Most of the rule can be checked without a
model at all, so the model is called only when the mechanical rules pass.

## Scope

1. **`project-template/.flow/bin/flow-pr-text.mjs`** (exported functions plus a CLI):
   - Extracts the TL;DR: the description's first paragraph (text up to the first blank line),
     with a leading `TL;DR`, `**TL;DR**` or `TL;DR —` marker removed.
   - Applies the mechanical rules and returns every reason that fails, not only the first: the
     TL;DR is missing or empty; it contains a backtick; it contains a task id in this repo's id
     format (the prefix from `.flow/config.yml` `project.name`); it contains a file path (a token
     with a `/` and a file extension, or one starting with `.`, `/` or `~/`); it is over 60 words.
   - The CLI reads the PR body from a file and writes a verdict file. It never takes the body on
     the command line, because the body is attacker-controlled text.
2. **The judge (a model call)**, only when the mechanical rules all pass:
   - Its input is the TL;DR text and the PR title, nothing else: no diff, no code, no tools, one
     turn. Its question: would a person who has not read the code understand from this text what
     problem the PR fixes and what changes, and for whom? It answers `PASS`, or `FAIL` with one
     sentence saying what a reader would not understand.
   - Its model is `review.pr_text_model` from the repo's `.flow/config.yml`, defaulting to the
     haiku entry of `TIERS` in `project-template/.flow/bin/task-model.mjs`. Import that value;
     do not type a model ID into this task's files. Add the key, commented out with its default,
     to `review:` in `project-template/.flow/config.yml`.
   - The model writes its verdict to a file. The step that decides pass or fail reads that file
     and nothing else from the model step, the same pattern flow-0186 uses for the review checks.
     A missing or unparseable verdict file fails the check, with a message that says the judge
     returned no verdict (not that the text failed).
3. **The workflow.** A new reusable `.github/workflows/_flow-pr-text.yml`, the template caller
   `project-template/.github/workflows/flow-pr-text.yml`, and canonical's own caller
   `.github/workflows/flow-pr-text.yml`. It posts one check run named `flow-pr-text`.
   - Runs on `pull_request` types `opened`, `reopened`, `edited`, `ready_for_review` and
     `synchronize` against `main`. `edited` is the point: fixing the description re-runs this
     check alone and never the three code reviewers.
   - Skips draft PRs (the flow-0136 pattern). Skips PRs that have no task id, using the same
     task-id resolution the review uses. Sync, release and intent PRs are not judged.
   - Least privilege. `contents: read` and `pull-requests: read`, plus only what posting the
     check and reaching the model need. It uses the same model credential secret the review
     workflow uses. Actions are pinned to SHAs. Node uses the same line as the other reusables
     at the time this lands.
   - A failing check's summary lists each reason and quotes the TL;DR it judged, so the fix is
     obvious without opening logs.
4. Update every existing store-wide workflow test that enumerates callers or reusables (the test
   files in `touches`) so it covers the new pair, and add `.flow/bin/pr-text-workflow.test.mjs`
   for the workflow's own properties.
5. Document the reusable in `docs/flow-reusable-workflows.md`, and the changelog fragment
   `changes/flow-0207.md`. Caller action: none beyond merging the next flow-sync PR, which
   delivers the new caller. Say whether the repo needs any secret it does not already have for
   the review.

**Does not touch:** `_flow-review.yml` or `flow-review.mjs` (this is a separate workflow on
purpose, so it does not queue behind the review tasks touching those files); the PR bodies that
flow-sync generates in code; the TL;DR rule's wording (flow-0206 owns it); whether the check is a
required status in branch protection (repo settings, the human's call).

## Acceptance criteria

- [ ] Given a body whose first paragraph contains a backtick, a task id, a file path, or more
      than 60 words, then `flow-pr-text.mjs` returns a failing reason for each, and makes no
      model call. Proved by `flow-pr-text.test.mjs`, one test per rule, and one test with a body
      that breaks two rules and gets both reasons.
- [ ] Given PR #285's actual opening paragraph (quoted in flow-0206's Context), then the mechanical
      rules fail it. Given flow-0206's "good" example, then they pass it. Proved by
      `flow-pr-text.test.mjs`.
- [ ] Given a body with no first paragraph, or an empty TL;DR after the marker is removed, then
      it fails with a reason saying the TL;DR is missing. Proved by `flow-pr-text.test.mjs`.
- [ ] Given a judge verdict file that says `FAIL`, is missing, or cannot be parsed, then the
      check fails, and the missing/unparseable case says the judge returned no verdict. Given
      `PASS`, it passes. Proved by `flow-pr-text.test.mjs` against fixture verdict files.
- [ ] Given no `review.pr_text_model` in config, then the judge model is `TIERS.haiku` from
      `task-model.mjs`, and given a value, that value is used. Proved by `flow-pr-text.test.mjs`.
- [ ] Given `_flow-pr-text.yml` and its callers, then: the trigger types include `edited`; draft
      PRs and PRs with no task id are skipped; the model step gets no tools and a single turn;
      the pass/fail step reads only the verdict file; no model ID is written in the workflow.
      Proved by `.flow/bin/pr-text-workflow.test.mjs`.
- [ ] The existing store-wide workflow tests (action pins, write scopes, secrets scope, caller
      pins, draft lifecycle, idle cost, model ids, prompt paths) pass with the new workflow
      included in what they scan, not excluded from it. Proved by those test files.
- [ ] `changes/flow-0207.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] This task's own PR description passes the new check.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
