# `changes/` — one changelog fragment per task

A task's changelog entry lives here, in its own file, named after the task: `changes/flow-0069.md`.
Cutting a release assembles every fragment into `CHANGELOG.md` and deletes the fragments.

## Why one file per task and not one shared changelog

`CHANGELOG.md` is append-only, so every task that changed anything listed it in `touches`. But
`touches` is not documentation — `pick-task` skips a `ready` task whose `touches` overlaps an
`in_progress` one, which is how two sessions are kept out of the same files. A path in every
task's `touches` therefore makes almost every task ineligible the moment any one of them is
claimed. Measured on 2026-09-23: 12 of canonical's 23 open tasks listed `CHANGELOG.md`, including
9 of the 13 `ready` ones. One shared file was the main throttle on draining the queue.

Two tasks writing `changes/flow-0069.md` and `changes/flow-0070.md` touch two different files and
never overlap. That is the whole point of the directory.

## Writing a fragment

- **Name it after your task id**: `changes/<task-id>.md`, e.g. `changes/flow-0069.md`. Only files
  matching `flow-*.md` are treated as fragments — this README is not one, and is never assembled
  or deleted.
- **Declare it in `touches`** as `changes/<task-id>.md`. Never declare `CHANGELOG.md`.
- **Write exactly what would have gone under `## Unreleased`** — no heading of your own, no
  version number, no date. Assembly drops the file's contents under that heading verbatim, so the
  fragment is a top-level bullet in the changelog's existing style:

  ```markdown
  - **One-line summary of the change** (`path/to/file.mjs`, flow-0069). **No caller action** —
    or, if a caller must act, say exactly what.

    Any further paragraphs, indented to sit under the bullet.
  ```

- **One fragment per task.** If your task genuinely ships two unrelated user-visible changes,
  that is two bullets in one fragment, not two files.

## Assembling at release time

`docs/flow-versioning-policy.md` owns the release procedure; the fragment step is:

```sh
node .flow/bin/changelog-fragments.mjs --check      # list what is pending; writes nothing
node .flow/bin/changelog-fragments.mjs --assemble   # fold into CHANGELOG.md, delete the fragments
```

`--assemble` inserts the fragments directly under `## Unreleased`, in ascending task-id order,
above whatever is already there. It edits a doc, so it runs on a release branch and merges through
a PR like any other code change — never as a direct commit to `main`.

`project-template/.flow/bin/release-guard.mjs` reports a **problem** when a release tag points at a
tree that still contains fragments: that is a release being cut without its notes. Consuming repos
have no `changes/` directory at all, and that is not a problem.
