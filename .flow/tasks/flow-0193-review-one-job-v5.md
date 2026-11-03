---
id: "flow-0193"
title: "Flow goes to v5: qa, code-review and security run in one review job that posts three check runs, and the auto-fix round reads those check runs instead of job names"
status: "cancelled"
priority: 1
project: "flow"
owner: "session_01NfrcU7yWZDFZdaHVPYRkVi"
created: "2026-11-02"
started: "2026-11-02T03:41:39Z"
branch: "flow/flow-0193-review-one-job-v5"
pr: "https://github.com/CandidDan/flow/pull/278"
issue: ""
blocked_reason: "The work is done on branch flow/flow-0193-review-one-job-v5, but the gate cannot go green from it. VERSION 5.0.0 makes release-stamp.test.mjs require a `## 5.0.0` section in CHANGELOG.md, and CHANGELOG.md is outside touches; the task also says it does not assemble the changelog. For v4 a release PR (#261) created `## 4.0.0` before the stamp task (flow-0179) bumped VERSION. Waiting on a human or orchestrator to choose how `## 5.0.0` comes to exist."
cancelled_reason: "Dan, 2026-11-02: one review job removes the isolation between qa, code-review and security. They would share one runner, one filesystem and a checks: write token, so a prompt-injected reviewer could forge another review's check run or overwrite its verdict file. That outweighs about 2 runner-minutes per PR. flow-0186 already delivered the vendor-neutral verdict file and the security skip; the three jobs stay."
blocked_by: []
serves: ["G9", "G10"]
intent: "model-work-off-github-actions"
touches:
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/_flow-kickback.yml"
  - ".github/workflows/_flow-sync.yml"
  - ".github/workflows/flow-review.yml"
  - ".github/workflows/flow-kickback.yml"
  - "project-template/.github/workflows/*.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-kickback.mjs"
  - "project-template/.flow/bin/flow-init.mjs"
  - "project-template/.flow/bin/*.test.mjs"
  - ".flow/bin/*.test.mjs"
  - "VERSION"
  - "project-template/.flow/VERSION"
  - "docs/repinning-a-consuming-repo.md"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0193.md"
labels: [cost, review, release, major]
model: "opus"
effort: "high"
model_reason: "A major release that changes the fleet's required check names, caller permissions and the auto-fix trigger at once; a mistake turns every adopting repo's PRs red, or lets a failed security review be auto-fixed"
asks: []
notes:
  - "2026-11-02 orchestrator: written on Dan's instruction ('yes write both tasks'). This is the one-job consolidation that flow-0186 was narrowed away from on 2026-11-01. flow-0187 (PR #272, merged) then recommended staying on one runner job, because a routine session gets HTTP 403 on both the commit-status and check-run endpoints, so reviews cannot move off runners and this breaking change happens once, here."
  - "2026-11-02 orchestrator: the v5 bump is IN this task on purpose, not a separate go-to-v5 task as flow-0179 was for v4. The change needs new caller permissions, which is MAJOR under docs/flow-versioning-policy.md. Landing it with VERSION still 4.x would put a breaking change on the v4-edge alias, and on v4 the next time a human moves it. One PR keeps the change and the major together."
  - "2026-11-02 orchestrator: the design below is the one the flow-0186 worker (session_01NfrcU8NxwWt137Ds3Lw2Ai) worked out when it blocked on 2026-11-01; see flow-0186's notes. Dan's rule still holds: qa, code-review and security never share a model session. One job, three separate model invocations."
  - "2026-11-02 orchestrator: ordering. flow-0188 (verifier) now waits on this task too, so it is written against one job; flow-0191 (Codex) already waits on flow-0188."
  - "2026-11-02 worker session_01NfrcU7yWZDFZdaHVPYRkVi: BLOCKED with the work done. Branch flow/flow-0193-review-one-job-v5, commit 0c2f157, pushed; no PR opened by me (flow-open-pr may have opened a draft; do not mark it ready). Every scope item is built and every acceptance criterion has its test: review-one-job.test.mjs (one job, delete before / check run after each model step, only plan/review/guide/intent-review, no check run in guide or intent-review, caller permissions, v5 pins and _flow-sync fallback derived from VERSION, the repin doc section); flow-review.test.mjs (checkRunPayload: success / failure / failure on missing or invalid / skipped with reason / name always one of the three, plus the check-run CLI); flow-kickback.test.mjs (only qa failed -> round on qa; security failed -> escalate; only the review job failed -> no round); changes/flow-0193.md. Both ride-along notes from PR #275 are in (emit spacing; skip reason in a code span). Existing tests that addressed jobs.qa / jobs.security now read each review as a section of the review job (from 'Clear the <check> verdict file' to the <check>_check step). Gate on 0c2f157: npm ci, build, lint exit 0; test and coverage exit 1 on exactly 3 tests, all the missing `## 5.0.0` CHANGELOG.md section (release-stamp.test.mjs x2, release-assemble.test.mjs re-running them); 2161 pass; coverage 97.84% lines. Needs rsync installed, or 15 sync-skills tests fail (unrelated). Decisions made here, so a fresh session does not re-argue them: check-run steps use `if: !cancelled()` and `continue-on-error`, and the last step fails the job on any step outcome or conclusion other than success (security: success or skipped); security is skipped only on the plan's exact `false`; guide reads the three conclusions as review-job outputs, falling back to the job result; kickback filters check runs to the github-actions app and takes the highest id per name. NEXT, once `## 5.0.0` exists on main: check out the branch, rebase on main (or merge main if force-push is refused), re-run the five gate commands, open the PR titled `[flow-0193] <title>` (REST fallback if GraphQL is blocked), and hand off."
  - "2026-11-02 orchestrator: CANCELLED by Dan. The worker's decision ask (how `## 5.0.0` gets into CHANGELOG.md) is moot. Its security fyi decided it: one job puts all three model sessions on one runner with a checks: write GITHUB_TOKEN, so a later reviewer can post a check run under an earlier review's name or edit the verdict files and helper copy in $RUNNER_TEMP. Separate jobs are the boundary that stops that. No v5. Draft PR #278 closed unmerged; branch flow/flow-0193-review-one-job-v5 left in place as the record. Any future consolidation must keep each review unable to write another review's check result, which on GitHub Actions means separate jobs."
---

## Context

After flow-0186, `.github/workflows/_flow-review.yml` runs qa, code-review and security as three
jobs. Each job starts its own runner and its model step writes
`$RUNNER_TEMP/flow-review/<check>.json`, which a non-model step validates. The PR checks are the
job names: `flow-review / qa`, `flow-review / code-review`, `flow-review / security`. Branch
protection in every adopting repo requires those three names.

`_flow-kickback.yml` (with `project-template/.flow/bin/flow-kickback.mjs`) decides the auto-fix
round from the names of the failed JOBS in the review run. It never auto-fixes `security`.

Both callers grant only `contents`, `pull-requests`, `issues` and `id-token` (`flow-review`), and
`contents`, `pull-requests`, `issues`, `actions: read` and `id-token` (`flow-kickback`). A reusable
workflow cannot raise a permission above its caller's grant.

## Scope

1. **One review job.** In `_flow-review.yml`, one job (name it `review`) runs after `plan` and runs
   qa, code-review and security one after another. Each review keeps its own model step, prompt,
   model and turn limit; no two share a session or conversation. Before each model step, delete
   that check's verdict file; straight after it, a non-model step validates the file with the
   flow-0186 validator and creates that check's check run, so a later model call cannot change an
   earlier verdict. When `plan` skips security, no security model call is made and the `security`
   check run is created with conclusion `skipped` and the skip reason in its summary.
2. **Three check runs.** The job creates check runs named exactly `qa`, `code-review` and
   `security` on the PR head SHA, with conclusion `success`, `failure` or `skipped` and the
   review's summary as output. A missing or invalid verdict file gives `failure`. The `review`
   job itself fails when any of the three is `failure`, so a failed review is also visible on the
   run. `guide` and `intent-review` keep their own jobs and stay advisory: no step in either
   creates a check run.
3. **Permissions.** Both review callers (`.github/workflows/flow-review.yml` and
   `project-template/.github/workflows/flow-review.yml`) add `checks: write`. Both kickback
   callers add `checks: read`. Only the `review` job's steps that create check runs use
   `checks: write`; set job-level `permissions:` so no model step's job holds more than it does
   today plus that one scope.
4. **Auto-fix reads check runs.** `_flow-kickback.yml` and `flow-kickback.mjs` decide which
   reviews failed from the head SHA's check runs named `qa`, `code-review` and `security`, never
   from job names. `security` failing still escalates to a human and is never auto-fixed. The
   `review` job's own failure is ignored as a signal: only the three named check runs count.
5. **v5.** `VERSION` and `project-template/.flow/VERSION` read `5.0.0`. Every
   `project-template/.github/workflows/flow-*.yml` caller pins `@v5`; `_flow-sync.yml`'s
   `canonical_ref` default, its description and its `FALLBACK_REF` become `v5`; `flow-init.mjs`
   writes `@v5` callers (prove it with the existing flow-init test). Tests that hard-code `v4` as
   the current major derive it from `VERSION` instead.
6. **Docs.** Add `## Moving from \`@v4\` to \`@v5\`` to `docs/repinning-a-consuming-repo.md`,
   in the style of the v3→v4 section: repin, run flow-sync (which adds the two permissions), then
   change branch protection's required checks from `flow-review / qa`,
   `flow-review / code-review`, `flow-review / security` to `qa`, `code-review`, `security`.
   Update `docs/flow-reusable-workflows.md` where it describes the review jobs and the auto-fix
   trigger.
7. Fragment `changes/flow-0193.md`: a top-level bullet whose caller action is the three steps in
   item 6, and that says canonical's own branch protection needs the same required-check change.

**Does not:** move or create any tag or alias (a human does that after merge); assemble the
changelog; change any review prompt beyond its output lines; change `DEFAULT_MODELS`; add Codex
(flow-0191); add the verifier (flow-0188); change `guide` or `intent-review` beyond keeping them
advisory.

## Acceptance criteria

- [ ] `.flow/bin/review-one-job.test.mjs` parses `_flow-review.yml` and asserts qa, code-review and
      security run in one job, each with exactly one model step, each preceded by a step deleting
      its verdict file and followed (before the next model step) by a step that validates it and
      creates its check run.
- [ ] The same test asserts that on a non-intent PR no job other than `plan`, `review`, `guide`
      and `intent-review` starts a runner, and that no step in `guide` or `intent-review` creates a
      check run.
- [ ] `flow-review.test.mjs`: the function that turns a verdict file into a check-run payload
      gives `success` for a valid `pass`, `failure` for a valid `fail`, `failure` for a missing or
      invalid file, and `skipped` with the reason when security is skipped; the name is always one
      of `qa`, `code-review`, `security`.
- [ ] `flow-kickback.test.mjs`: given check runs where only `qa` failed, the round addresses qa;
      where `security` failed, it escalates and does not auto-fix; where only the `review` job
      failed and all three check runs passed, it starts no round.
- [ ] A workflow test asserts both review callers grant `checks: write`, both kickback callers grant
      `checks: read`, and no other permission was added to any caller.
- [ ] `VERSION` and `project-template/.flow/VERSION` read `5.0.0`, every template caller pins `@v5`,
      and `_flow-sync.yml`'s default and fallback are `v5` (asserted by tests deriving the major
      from `VERSION`).
- [ ] `docs/repinning-a-consuming-repo.md` has the `Moving from \`@v4\` to \`@v5\`` heading and
      names the three new required check names (asserted by a doc test).
- [ ] `changes/flow-0193.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
