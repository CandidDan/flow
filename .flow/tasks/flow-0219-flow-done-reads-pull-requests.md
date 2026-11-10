---
id: "flow-0219"
title: "flow-done can read pull requests, so the intent approval repair works in a private repo"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude/project-thread-8x6fo7"
created: "2026-11-10"
started: "2026-11-10T10:50:44Z"
branch: "claude/project-thread-8x6fo7"
pr: "https://github.com/CandidDan/flow/pull/304"
issue: "https://github.com/CandidDan/flow/issues/296"
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - ".github/workflows/_flow-done.yml"
  - ".github/workflows/flow-done.yml"
  - "project-template/.github/workflows/flow-done.yml"
  - ".flow/bin/stamp-intents-workflow.test.mjs"
  - "changes/flow-0219.md"
labels: [intents, ci, permissions]
model: "opus"
effort: "high"
model_reason: "Changes the token permissions of a reusable workflow every adopting repo calls on every merge; a wrong grant fails flow-done fleet-wide before any step runs"
notes:
  - "2026-11-10 (Inflight project thread on marking merged intents approved, at Dan's request): written from flow-0209's open follow-up ask. Inflight (private) hit it: the repair step cannot look up the PR that added an intent, because the job's token has no pull-requests scope."
  - "2026-11-10: block lifted by hand and claimed, at Dan's request in the project thread (land it before the 5.0.0 cut)."
asks: []
---

## Context

flow-0209 (PR #291, released in 4.2.0) made `.github/workflows/_flow-done.yml` stamp intents. Its
second pass, the repair, stamps any intent that is still unstamped. It asks the GitHub API which
pull request added the file (`GET /repos/{repo}/commits/{sha}/pulls`, then `GET /pulls/{n}`). In a
private repo those calls need `pull-requests: read`, and the job does not have it. Each lookup then
answers 403 or 404, and the log names the intent as left unstamped. Canonical is public, so it
never showed there.

Two things stop the job having that scope today:

1. Both callers grant only `contents: write` on the `flow-done` job:
   `project-template/.github/workflows/flow-done.yml` (what every adopting repo gets through
   flow-sync) and canonical's own `.github/workflows/flow-done.yml`.
2. `_flow-done.yml` has a top-level `permissions:` block with only `contents: write`. A called
   workflow's `permissions:` can only lower what the caller passes, so this block sets
   `pull-requests` to none **even when the caller grants it**. Granting it in the callers alone
   changes nothing. The comment above the "Stamp intents this merge approved" step says the
   opposite ("On a private repo whose caller does not grant `pull-requests: read` …"), which
   implies a caller grant would be enough. That comment is wrong.

flow-0211 settled the pattern for this case in `_flow-dispatch.yml`: **callers grant, the reusable
inherits.** The reusable declares no `permissions:` block, so a repo whose caller has not been
synced keeps working with what it already grants. Read the "Permissions (flow-0211)" comment at
the top of `.github/workflows/_flow-dispatch.yml` before starting; this task applies the same
pattern to flow-done.

## Scope

1. In both flow-done callers, the `flow-done` job grants exactly `contents: write` and
   `pull-requests: read`.
2. `_flow-done.yml` declares no `permissions:` block, at the top level or on its jobs, so it
   inherits what the caller grants. It must not **request** `pull-requests: read` itself: a called
   workflow that asks for more than its caller grants fails before any step runs, and every repo on
   `@v4` whose caller is not yet synced would lose its `done` transition at the next tag move.
3. Replace the top-level `permissions:` block in `_flow-done.yml` with a comment in the style of
   `_flow-dispatch.yml`'s flow-0211 comment: what the caller grants and why each scope is needed,
   why the reusable does not request it, and what an un-synced repo sees (the transition works,
   the repair names each intent it could not look up). Correct the step comment described in
   Context point 2 so it matches.
4. Changelog fragment `changes/flow-0219.md`. Caller action: none for a repo that syncs, because
   flow-sync copies the caller. A repo that keeps a hand-edited `flow-done.yml` adds
   `pull-requests: read` next to `contents: write` on the `flow-done` job.

**Does not touch:** `stamp-intents.mjs` or its logic; any other caller or reusable workflow; the
release itself (no version bump, no tag).

## Acceptance criteria

- [ ] Given `project-template/.github/workflows/flow-done.yml` and `.github/workflows/flow-done.yml`,
      when parsed as YAML, then the `flow-done` job's `permissions` is exactly
      `{ contents: write, pull-requests: read }`. Proved by `.flow/bin/stamp-intents-workflow.test.mjs`.
- [ ] Given `.github/workflows/_flow-done.yml`, when parsed as YAML, then it has no top-level
      `permissions` key and no job has a `permissions` key. Proved by
      `.flow/bin/stamp-intents-workflow.test.mjs`.
- [ ] `npm run build` passes (it runs `check-workflows.mjs` over every workflow file).
- [ ] `changes/flow-0219.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
