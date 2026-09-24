---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0069"
title: "Changelog fragments: each task writes changes/<task-id>.md, and the release assembles them"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-worker"
created: "2026-09-23"
started: "2026-09-24T00:17:25Z"
branch: "flow/flow-0069-changelog-fragments"
pr: "https://github.com/CandidDan/flow/pull/96"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # queue throughput on canonical; no live VISION goal names it (spec workstream A)
touches:
  - ".flow/bin/changelog-fragments.mjs"
  - ".flow/bin/changelog-fragments.test.mjs"
  - "project-template/.flow/bin/release-guard.mjs"
  - "project-template/.flow/bin/release-guard.test.mjs"
  - "project-template/.flow/bin/pick-task.test.mjs"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "project-template/.flow/PROTOCOL.md"
  - "docs/flow-versioning-policy.md"
  - "changes/README.md"
  - "changes/flow-0069.md"
labels: [release, changelog, concurrency]
notes:
  - "2026-09-24 (worker): branch flow/flow-0069-changelog-fragments pushed. DONE: changes/README.md, changes/flow-0069.md, .flow/bin/changelog-fragments.mjs (pure core + injected IO + CLI), and the release-guard fragment check (FRAGMENT_DIR/FRAGMENT_NAME/compareFragmentNames + check 6 + fragmentsAtRef wired into collectFacts). NOT YET: tests (changelog-fragments.test.mjs, release-guard.test.mjs, pick-task.test.mjs), PROTOCOL.md, task-writer SKILL, docs/flow-versioning-policy.md, gate run, PR. Next action: write those, run npm run build/lint/test/coverage, open the PR."
  - "2026-09-24 (worker): SCOPE FINDING for the orchestrator, handled in-scope rather than blocked. `.flow/bin/protocol-portability.test.mjs` pins a sha256 digest per `##` section of project-template/.flow/PROTOCOL.md and forbids adding or dropping sections, so ANY edit to a `##` section of the protocol requires recomputing that digest — and that test file is not in this task\'s `touches`. It is under `.flow/**`, which touches-guard ignores, so editing it would have been undetected scope creep rather than a CI failure. The fragment rule is therefore added to the protocol\'s PREAMBLE, which the digest test deliberately excludes (it is the part flow-0006 rewrote during the move), alongside the existing bolded `**Creating a task (orchestrator).**` paragraph. The criterion is met (the string is present and a test asserts it). FOLLOW-UP if you want it in `## Hard rules` instead: one task touching both project-template/.flow/PROTOCOL.md and .flow/bin/protocol-portability.test.mjs, recomputing the Hard rules digest in the same commit."
  - "2026-09-23 (orchestrator): written from _private/flow-operating-model-spec.md, workstream A item 2. The measured problem: CHANGELOG.md sits in the `touches` of 12 of the 23 open tasks, including 9 of the 13 `ready` ones (flow-0022, 0030, 0045, 0046, 0048, 0050, 0052, 0053, 0054, 0058, 0063, 0065 — measured on origin/main 2026-09-23). pick-task skips a ready task whose touches overlap an in_progress one, so any one claim serialises nearly the whole queue behind a file every task only appends to."
  - "2026-09-23 (orchestrator): FOLLOW-UP IS ORCHESTRATOR WORK, NOT THIS TASK'S. Once this merges, the open tasks above still list CHANGELOG.md in their touches, and a worker cannot fix that from a branch (the store is main-only). The orchestrator rewrites each open task's `CHANGELOG.md` touches entry to `changes/<its-id>.md` in one commit on main. Do not attempt it here, and do not list .flow/tasks/ in touches."
  - "2026-09-23 (orchestrator): decided, so the worker does not re-litigate: (1) the assembler lives in canonical's `.flow/bin/` as a real module, not an adapter, because CHANGELOG.md is canonical's own file and consuming repos have none; release-publish.mjs is the precedent. (2) Assembly inserts fragments into the existing `## Unreleased` section rather than writing a numbered section, so the existing manual fold (versioning policy) and release-stamp.test.mjs's `## Unreleased`-must-exist property are untouched. (3) The existing Unreleased entries stay where they are; no migration."
---

## Context

`CHANGELOG.md` is one file that nearly every Flow task appends to, so nearly every task lists it in
`touches`. `touches` overlap is how `pick-task` keeps two sessions out of the same files, which means
one shared append-only file serialises the queue: while any task is `in_progress`, almost every other
`ready` task is ineligible. Flow-0063's own notes say so. On 2026-09-23 canonical had 13
`ready` tasks, and 9 of them listed `CHANGELOG.md`, and this is the main throttle on draining them.

The fix is the one most projects with a busy changelog use: each change writes its own fragment file,
named after the task, and the release assembles the fragments into the changelog and deletes them. Two
tasks then touch two different files and never overlap on the changelog.

Today the release fold is manual. `docs/flow-versioning-policy.md` step 2 says to add a `CHANGELOG.md`
entry, and cutting a release folds `## Unreleased` into a numbered section by hand.
`.flow/bin/release-stamp.test.mjs` asserts that `## Unreleased` always exists, empty or not.
Leave that property alone.

## Scope

- **Fragment convention.** A task's changelog entry is `changes/<task-id>.md`, one file per task,
  holding exactly the Markdown that would otherwise have gone under `## Unreleased`. The format is
  documented in a new `changes/README.md`.
- **Assembler:** a new `.flow/bin/changelog-fragments.mjs`, with a pure core and a thin CLI in the
  style of the other helpers (injected IO, realpath main-module detection).
  - `--check` lists the pending fragments and exits 0. It never writes.
  - `--assemble` inserts every `changes/flow-*.md` fragment into `CHANGELOG.md` directly under the
    `## Unreleased` heading, above any entries already there. Fragments go in ascending task-id
    order. It then deletes those fragment files and leaves `changes/README.md` alone.
  - Given no fragments, `--assemble` changes nothing and says so.
  - If `CHANGELOG.md` has no `## Unreleased` heading, the assembler fails loudly and writes nothing.
- **Release guard:** `checkRelease` in `project-template/.flow/bin/release-guard.mjs` reports a
  **problem** (not a warning) when the tree a release tag points at still contains `changes/flow-*.md`
  fragments. That means a release is being cut without its notes. A tree with no `changes/`
  directory at all, which is what every consuming repo has, is not a problem.
- **Release procedure:** in `docs/flow-versioning-policy.md`, step 2 becomes "write
  `changes/<task-id>.md`". A new step before the tag is cut runs
  `node .flow/bin/changelog-fragments.mjs --assemble` on a release branch and merges it through a PR.
  Assembly edits docs, so it goes on a branch and never to `main` directly.
- **PROTOCOL.md:** add one line. Where a repo keeps a `changes/` directory, a task writes its
  changelog entry to `changes/<task-id>.md` and never edits `CHANGELOG.md` directly. Phrase it
  conditionally, because consuming repos have no `changes/` directory.
- **task-writer SKILL:** in the pre-flight `touches` check, tell the orchestrator to list
  `changes/<id>.md` for a task's changelog entry and never `CHANGELOG.md`.
- **Dogfood:** this task's own entry goes in `changes/flow-0069.md`, not `CHANGELOG.md`.

Deliberately **not** touched:

- `CHANGELOG.md`. This task records its entry as a fragment, like every task after it.
- `.flow/tasks/**`, which is the orchestrator's follow-up (see notes).
- `release-publish.mjs`. Its manifest admits named paths only, so `changes/` is never published and
  needs no deny entry.
- `.flow/bin/release-stamp.test.mjs`. The `## Unreleased` property it pins is preserved as-is.
- `release-tag.yml`. It already calls the guard, and the new check rides that call.

## Acceptance criteria

- [ ] Given two `ready` tasks whose `touches` differ only in `changes/flow-A.md` versus
      `changes/flow-B.md`, with one of them `in_progress`, when `pick-task` runs, then the other is
      eligible. Given the same two tasks where both list `CHANGELOG.md`, then it is not eligible. A
      `pick-task.test.mjs` case shows the before and after.
- [ ] Given a `CHANGELOG.md` with an `## Unreleased` section holding one existing entry, and fragments
      `changes/flow-0102.md` and `changes/flow-0101.md`, when `--assemble` runs, then both fragments
      appear under `## Unreleased` in the order 0101, 0102, above the existing entry. The existing
      entry and every numbered section are byte-identical to before, both fragment files are gone,
      and `changes/README.md` still exists.
- [ ] Given no fragment files, when `--assemble` runs, then `CHANGELOG.md` is byte-identical and the
      output says nothing was assembled.
- [ ] Given a `CHANGELOG.md` with no `## Unreleased` heading, when `--assemble` runs, then it exits
      non-zero and neither `CHANGELOG.md` nor any fragment is modified or deleted.
- [ ] Given pending fragments, when `--check` runs, then it lists each fragment path and modifies no
      file.
- [ ] Given release facts where the tagged tree contains `changes/flow-0101.md`, when `checkRelease`
      runs, then it reports a problem that names the fragment. Given a tagged tree with no `changes/`
      directory, then no problem is reported for fragments.
- [ ] `docs/flow-versioning-policy.md`'s release procedure names `changes/<task-id>.md` and the
      `--assemble` step. `project-template/.flow/PROTOCOL.md` and the task-writer SKILL each carry
      the fragment rule. A test asserts each of these three strings is present, so the rule cannot be
      silently edited out.
- [ ] This PR's diff adds `changes/flow-0069.md` and does not modify `CHANGELOG.md`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

The last criterion is verified by the PR's diff, which the qa check reads, rather than by a unit
test. That is deliberate: it is a property of this change, not of the code.

If `npm test`'s globs do not pick up a test in `.flow/bin/` named `changelog-fragments.test.mjs`,
look at `package.json`'s test script before renaming anything. The other `.flow/bin/*.test.mjs`
files run, so the name should work. `package.json` is outside `touches`. If it really does need
changing, block on it and do not widen scope yourself.
