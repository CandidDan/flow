---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0099"
title: "The review gate finds a task by its frontmatter id when no filename matches, as touches-guard already does"
status: "done"
priority: 2
project: "flow"
owner: "claude-code-e6eba4e8"
created: "2026-09-30"
started: "2026-09-30T02:52:05Z"
branch: "flow/flow-0099-review-finds-task-by-frontmatter-id"
pr: "https://github.com/CandidDan/flow/pull/132"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "changes/flow-0099.md"
labels: [flow-review, review-gate]
notes:
  - "2026-09-30 (orchestrator): Reported from the tanplan repo, whose QA check fails on every task PR (tanplan#12 first). tanplan names task files `0021-<slug>.md` with the id `tanplan-0021` only in frontmatter. `findTaskFile` in `project-template/.flow/bin/flow-review.mjs` (around line 377) matches by filename prefix only, so task.md carries NO TASK FILE RESOLVED and qa fails. `findTaskFile` in `touches-guard.mjs` (around line 140) scans frontmatter `id:` and resolves the same task, so the two gates disagree about one store. Renaming tanplan's files was rejected: its release-gate record pins task file paths and hashes."
---

## Context

The task id arrives from the branch or the PR title. The review gate turns it into a file by
filename prefix (`<id>-<slug>.md` or `<id>.md`). That is a convention of canonical's own store, not
a rule of the protocol: `_TEMPLATE.md` and task-writer's `NNNN-slug.md` both allow a store whose
filenames do not carry the project prefix. `touches-guard` already resolves by frontmatter `id`, so
in such a repo the scope check passes and the review gate reports no task, which is a red gate on
correct work (G10).

## Scope

**Does:** when no filename matches, `findTaskFile` in `flow-review.mjs` falls back to reading each
`.md` in the store (skipping `_TEMPLATE.md`) and matching its frontmatter `id:` value against the
id, case-insensitively, the same way the filename match is. The filename match stays first and
unchanged, so canonical's store resolves exactly as before. The fallback must stay injectable
(`ls`/`read`) like the rest of the function, and a file that cannot be read is skipped, not a throw.
Changelog fragment `changes/flow-0099.md` (**No caller action** beyond picking up the release).

**Does not touch:** `touches-guard.mjs` (already correct); the reviewer prompts; the workflows; any
repo's task filenames.

## Acceptance criteria

- [ ] Given a store with `0021-some-slug.md` whose frontmatter is `id: "tanplan-0021"`, when
      `findTaskFile("tanplan-0021")` runs, then it returns that file's path.
- [ ] Given the same store, when `taskContext` runs with `PR_TITLE` `[tanplan-0021] …`, then
      `found` is true and `text` contains the file's body, not the NO TASK FILE RESOLVED sentinel.
- [ ] Given a store holding both `flow-0068-a-slug.md` and another file whose frontmatter id is
      `flow-0068`, then the filename match wins (existing behaviour kept).
- [ ] Given a frontmatter id `tanplan-00211`, then `findTaskFile("tanplan-0021")` does not match it
      (an id prefix is not an id).
- [ ] Given `_TEMPLATE.md` whose id equals the requested id, then it is never returned.
- [ ] Given an id no file carries in name or frontmatter, then the result is still a miss
      (`path: null`), and an unreadable file in the store does not throw.
- [ ] `changes/flow-0099.md` exists and says no caller action is needed.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
