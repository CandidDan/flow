---
id: "flow-0223"
title: "Run only flow-doctor and the store-guard on PRs that change only tasks, intents, workstreams or research"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-11-13"
started: ""
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
model: "opus"
effort: "high"
model_reason: "Changes both reusable gate workflows every adopter runs, plus a fail-closed classifier whose mistake would let a code PR skip its gate."
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
touches:
  - ".github/workflows/_flow-gates.yml"
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/ci.yml"
  - ".github/workflows/release-tag.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/config.yml"
  - ".flow/config.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/intent-pr-kind.test.mjs"
  - ".flow/bin/store-only-pr.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0223.md"
labels: [ci, cost, gate, review]
notes: []
asks: []
---

## Context

Dan, 2026-11-13: "tasks, intents, research should have minimal ci". He called a task commit
starting the full browser suite in tanplan "ridiculous".

flow-0178 already does this for one case: a PR whose every changed path is `.flow/intents/*.md`
is an **intent PR**. `_flow-gates.yml` then runs only flow-doctor in the `gate` job (step
"Classify — is this an intent-only PR?", `node "$FLOW_BIN"/flow-review.mjs classify`), and
`_flow-review.yml` has qa and code-review write a fixed pass line with no model call, plus one
advisory intent reviewer. The classifier is `classifyIntentPr` in
`project-template/.flow/bin/flow-review.mjs`, run from canonical's copy at the workflow's commit,
so a PR cannot widen the list that exempts it.

Everything else that is not code still pays for the full gate and three model reviewers: a PR that
adds a research doc, edits a workstream file, or mixes an intent with a research note.

Separately, on push to `main`: every task-state commit (`flow: ...`) is a push to `main`. A
push-to-`main` workflow with no path filter runs on every one of them. This has been missed three
times: canonical's own bookkeeping callers (`ci.yml`, `release-tag.yml`), tanplan's
`brand-ratchet.yml` (fixed in tanplan-0320), and tanplan's `e2e.yml` (53 of 73 runs since 12 Nov
were task commits; tanplan-0395 fixes it). Nothing tells a repo it has the problem.

Words used below:

- **Store-only path**: a path matched by the `minimal_ci.paths` globs in the BASE branch's
  `.flow/config.yml`. Default, when the key is absent: `.flow/tasks/**`, `.flow/intents/**`,
  `.flow/workstreams/**`, `docs/research/**`.
- **Store-only PR**: a non-empty diff in which every changed path is a store-only path.

## Scope

1. **Config.** Add to `project-template/.flow/config.yml` and canonical's `.flow/config.yml`:
   ```yaml
   minimal_ci:
     paths: [".flow/tasks/**", ".flow/intents/**", ".flow/workstreams/**", "docs/research/**"]
     push_workflows_exempt: []   # workflow file names that may run on every push to main, each with a reason comment
   ```
   with a comment block in the template saying what each key does. Canonical lists
   `plane-guard.yml` and `flow-dispatch.yml` in `push_workflows_exempt` (both exist to react to
   state commits; `flow-dispatch.yml` already filters with `paths:` and would pass anyway, so list
   only what is needed — the worker decides after item 4 works).
2. **Classifier.** In `project-template/.flow/bin/flow-review.mjs`, add `classifyStoreOnlyPr`
   beside `classifyIntentPr`, with the same shape (`classified`, `files`, `outside`) and the same
   fail-closed rules: an empty diff is not store-only; a git error throws. The globs come from the
   BASE branch's config, the way `security_paths` already does. A path matching
   `SECURITY_FLOOR_PATHS` is never store-only, whatever the config says, unless it is under
   `.flow/tasks/`, `.flow/intents/` or `.flow/workstreams/`. So `.flow/config.yml`, `.flow/bin/**`,
   `.github/**` and `CLAUDE.md` always get the full gate, even if a glob in `minimal_ci.paths` matches them.
   The `classify` CLI command also writes `store_only=true|false`
   to `$GITHUB_OUTPUT`. `intent_pr` is unchanged: an intent-only PR is both.
3. **`_flow-gates.yml`.** When `store_only == 'true'`, the `gate` job runs checkout, the
   store-guard (and its assertion step), the classify step and flow-doctor, and skips install,
   build, lint, test and coverage. The `source-root` matrix job skips its steps but still reports.
   The store-guard still fails a PR that touches `.flow/tasks/`: being store-only never excuses
   that. Every job keeps its name and still reports, so no required check goes missing. The
   existing intent-only behaviour is the special case of this and must not change for an intent PR.
4. **`_flow-review.yml`.** On a store-only PR, qa, code-review and security each write a fixed pass
   line (pin it as `STORE_ONLY_PR_PASS_LINE` in `flow-review.mjs`, held in step with the workflow
   by `.flow/bin/flow-review-workflow.test.mjs`, as the intent and release lines are) and call no
   model. An intent-only PR keeps its advisory intent reviewer exactly as now.
5. **flow-doctor warns about unfiltered push-to-main workflows.** For each
   `.github/workflows/*.yml` whose `on.push` can fire on `main` (no `branches` filter, or `main` in
   it) and is not listed in `minimal_ci.push_workflows_exempt`, WARN unless its push trigger has
   `paths` (a positive filter) or `paths-ignore` that covers `.flow/tasks/**`. The warning names
   the file and says what to add. Reusable workflows (`on: workflow_call` only) are not checked.
   A file the doctor cannot read or parse gives a WARNING naming it, never a PROBLEM and never
   silence. Zero dependencies, like the rest of flow-doctor.
6. **Canonical's own callers.** Add `paths-ignore` for the store-only globs to the `push` trigger of
   `.github/workflows/ci.yml` and `.github/workflows/release-tag.yml`, so flow-doctor is clean on
   canonical. Check first that neither needs to run on a state commit; if one does, list it in
   `push_workflows_exempt` with the reason instead.
7. `docs/flow-reusable-workflows.md`: one short section on `minimal_ci`, the store-only PR, and the
   doctor warning.
8. Changelog fragment `changes/flow-0223.md` stating the caller action: adopters get the PR
   behaviour at the next sync with no edit; repos with research outside `docs/research/` add their
   path to `minimal_ci.paths`; act on any new doctor warning by adding a path filter.

Not in scope:

- Moving task state off `main`. That is ADR-0011's question (written in parallel, undecided).
- Which runner bookkeeping workflows use (`FLOW_RUNNER`). Separate decision for Dan.
- Changing any adopter repo. tanplan's own e2e change is tanplan-0395.

## Acceptance criteria

- [ ] `project-template/.flow/bin/flow-review.test.mjs`: `classifyStoreOnlyPr` is classified for
      `[".flow/intents/a.md"]`, `["docs/research/x.md", ".flow/workstreams/w.md"]`; not classified
      for `[]`, for a list adding `src/a.js`, for `.flow/config.yml`, `.flow/bin/x.mjs` or
      `.github/workflows/x.yml` even when the configured globs are `["**"]`.
- [ ] `project-template/.flow/bin/flow-review.test.mjs`: with no `minimal_ci` key in the base
      config, the four default globs apply; a glob added only in the PR's own config (not in base)
      does not classify the PR.
- [ ] `project-template/.flow/bin/flow-review.test.mjs`: `classify` writes `store_only=` and
      `intent_pr=` to `$GITHUB_OUTPUT`, and throws on a git failure.
- [ ] `.flow/bin/store-only-pr.test.mjs`: in `_flow-gates.yml`, install, build, lint, test and
      coverage are skipped when `store_only == 'true'`; the store-guard, its assertion, classify and
      flow-doctor are not; no job gains a job-level `if` on `store_only`; `source-root` steps skip on it.
- [ ] `.flow/bin/flow-review-workflow.test.mjs`: on `store_only == 'true'` each of qa, code-review
      and security writes `STORE_ONLY_PR_PASS_LINE` and no step that calls a model runs; the line in
      the workflow equals the exported constant.
- [ ] `.flow/bin/intent-pr-kind.test.mjs` still passes unchanged in what it asserts about an
      intent-only PR (advisory reviewer still runs).
- [ ] `project-template/.flow/bin/flow-doctor.test.mjs`: given a fixture repo with workflows
      (a) `push: branches: [main]` and no filter → WARN naming the file; (b) the same with
      `paths-ignore: [".flow/tasks/**"]` → no warning; (c) `paths: ["src/**"]` → no warning;
      (d) listed in `push_workflows_exempt` → no warning; (e) `on: workflow_call` only → no
      warning; (f) unparseable YAML → WARN naming the file; and the doctor's exit code is 0 in all six.
- [ ] Running `node .flow/bin/flow-doctor.mjs` on canonical after this change prints no
      push-to-main warning (proved in `.flow/bin/store-only-pr.test.mjs` by running the doctor
      against the repo).
- [ ] `changes/flow-0223.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- `touches` overlaps flow-0196 (in progress: `_flow-review.yml`, `flow-review.mjs` and its tests).
  The queue will hold this task until flow-0196 lands; do not start it on top of an open flow-0196 PR.
- Whether this is a MINOR or MAJOR bump is the worker's call under `docs/flow-versioning-policy.md`.
  No check names change, so MINOR is expected.
