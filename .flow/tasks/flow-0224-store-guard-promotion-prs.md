---
id: "flow-0224"
title: "Let the store-guard pass a PR that promotes the default branch into a declared deploy branch"
status: "ready"
priority: 2
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
model_reason: "Adds an exemption to a guard in the reusable gate every adopter runs; a loose condition would let a feature branch skip the store-guard."
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
touches:
  - ".github/workflows/_flow-gates.yml"
  - "project-template/.flow/config.yml"
  - ".flow/bin/store-guard-deploy-branches.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0224.md"
labels: [ci, gate, store-guard]
notes: []
asks: []
---

## Context

Some adopters deploy by merging `main` into another branch. tanplan opens a PR from `main` into
`production` (PR #396 is one) to release. The store-guard in `_flow-gates.yml` (step "Guard — store
is main-only") lists every path in `git diff origin/<base>...HEAD` and fails the PR if any is under
`.flow/tasks/`. On a `main` → `production` PR that diff is every commit on `main` since the last
release, and those always include task-state commits. So every release PR fails the store-guard,
and Dan had to switch off tanplan's Production ruleset to merge one.

The guard exists to stop a feature branch carrying a stale copy of a task file and overwriting
newer state on `main` when it merges. A PR whose head IS `main` cannot do that: its task files are
`main`'s own current state. The guard is right for every other PR and wrong for this one.

Words used below:

- **Deploy branch**: a branch named in `git.deploy_branches` in `.flow/config.yml`. The key is new.
  It is not called `release_branches` because Flow already uses "release PR" for a different thing:
  a `release/*` PR that bumps Flow's own version (`RELEASE_PR_PATHS` in
  `project-template/.flow/bin/flow-review.mjs`).
- **Promotion PR**: a pull request whose head branch is the repository's default branch, whose head
  repository is this repository (not a fork), and whose base branch is a deploy branch.

## Scope

1. **Config.** Add to the `git:` block of `project-template/.flow/config.yml`, commented out, with a
   short comment saying what it does and that the store-guard reads it from the default branch:
   ```yaml
   # deploy_branches: ["production"]
   ```
   Absent or empty means no deploy branches, which is today's behaviour. Canonical's own
   `.flow/config.yml` does not get the key: canonical has no deploy branch.
2. **Store-guard.** In the "Guard — store is main-only" step of `.github/workflows/_flow-gates.yml`,
   before the diff, decide whether the PR is a promotion PR. If it is, write the decision line
   `store-guard: decision=skipped reason=promotion-pr base=<base> head=<head>` to `$DECISION_LOG`
   and exit 0. Otherwise run exactly as now. Rules for the decision:
   - Read `git.deploy_branches` from `.flow/config.yml` **as it is on the default branch**
     (`git show origin/<default>:.flow/config.yml`), never from the PR's head or base. A PR must not
     be able to exempt itself by adding the key, and the base (`production`) may not have the key
     yet on the first release after adoption. Fetch the default branch first if the checkout lacks it.
   - Pass the default branch, head ref, head repository and this repository to the script through
     `env:` (`github.event.repository.default_branch`, `github.head_ref`,
     `github.event.pull_request.head.repo.full_name`, `github.repository`), never through `${{ }}`
     inside `run:`. This is the existing rule in the step's comment.
   - Fail closed. If the config cannot be read or the key cannot be parsed, the PR is not a
     promotion PR and the guard runs as now. A parse problem prints a `::warning::` naming the file.
   - The step runs before yq is installed. Use something already on the runner (`node`, or a line
     scan in shell); do not add a dependency or move the step.
3. **Assertion step.** "Assert — the store-guard proved it ran" must accept the new decision line
   unchanged (it matches the `store-guard: decision=` prefix). Do not edit it; the test proves it.
4. **Docs.** In `docs/flow-reusable-workflows.md`, a short section: what a promotion PR is, the
   `git.deploy_branches` key, that it is read from the default branch, and that the rest of the gate
   still runs on a promotion PR.
5. Changelog fragment `changes/flow-0224.md` stating the caller action: a repo that releases by a PR
   from its default branch into another branch adds that branch to `git.deploy_branches` on its
   default branch; nothing else changes.

Not in scope:

- Whether the gate, the touches-guard or the three review checks should run on a promotion PR.
  They all still run. (The review checks on a large promotion diff cost money; that is a separate
  question for Dan, not this task.)
- tanplan. Its gate is a forked copy (`.github/workflows/flow-gates.yml`, around line 41, adds
  `production` as a PR target) and will not pick this up by sync. Porting it there is a tanplan
  task. Check tanplan-0397 first; it may already cover this.
- Any change to what the guard checks on a non-promotion PR.

## Acceptance criteria

All in `.flow/bin/store-guard-deploy-branches.test.mjs`, which runs the real `run:` text of the
store-guard step from `_flow-gates.yml` against a real git repository under `bash -e`, as
`.flow/bin/store-guard-renames.test.mjs` does.

- [ ] Given the default branch `main` whose config sets `git.deploy_branches: ["production"]`, when
      a PR from `main` (same repository) into `production` has a diff that includes
      `.flow/tasks/x.md`, then the step exits 0 and the decision log holds
      `store-guard: decision=skipped reason=promotion-pr base=production head=main`.
- [ ] Given the same config, when a PR from `feature/x` into `production` changes `.flow/tasks/x.md`,
      then the step exits non-zero with `reason=store-modified`.
- [ ] Given the same config, when a PR from a fork whose branch is also named `main` targets
      `production` and changes `.flow/tasks/x.md`, then the step exits non-zero with
      `reason=store-modified`.
- [ ] Given `deploy_branches` is set only in the PR head's or in `production`'s config, not in
      `main`'s, when a PR from `main` into `production` changes `.flow/tasks/x.md`, then the step
      exits non-zero with `reason=store-modified`.
- [ ] Given no `deploy_branches` key, or a value the step cannot parse, when a PR from `main` into
      `production` changes `.flow/tasks/x.md`, then the step exits non-zero with
      `reason=store-modified` (and for the unparseable case prints a `::warning::` naming
      `.flow/config.yml`).
- [ ] Given a PR from `feature/x` into `main` that changes `.flow/tasks/x.md`, with
      `deploy_branches: ["production"]` set, then the step still exits non-zero, as today.
- [ ] Given the decision log from the first criterion, when the "Assert — the store-guard proved it
      ran" step's `run:` text runs, then it exits 0.
- [ ] The step reads none of `github.head_ref`, `github.event.pull_request.head.repo.full_name` or
      `github.event.repository.default_branch` through `${{ }}` inside its `run:` text; all three
      arrive through `env:`.
- [ ] `changes/flow-0224.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- `touches` overlaps flow-0167, flow-0207 and flow-0223 (`_flow-gates.yml`, `project-template/.flow/config.yml`,
  `docs/flow-reusable-workflows.md`) and flow-0225 (gate step timings). The queue serialises them.
  If flow-0223 has landed, the store-guard still runs on a store-only PR; keep it that way.
- Expected version bump: MINOR (new optional key, no check renamed). The worker confirms under
  `docs/flow-versioning-policy.md`.
