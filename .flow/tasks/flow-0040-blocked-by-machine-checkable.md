---
id: "flow-0040"
title: "Give a blocked task a machine-checkable dependency, so something other than a human can tell when it is free"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-09-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G7"]
touches:
  - "project-template/.flow/tasks/_TEMPLATE.md"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/PROTOCOL.md"
labels: [protocol, template]
notes: []
---

## Context

`blocked` is the only status in the lifecycle with no automated way out. `flow-status` owns
`in_review` and the return to `ready`; `flow-done` owns `done`; `flow-recover` heals a stranded
`in_progress`. A task that goes `blocked` stays blocked until a human notices the thing it was
waiting for has landed and edits the file by hand.

Almost every real block is a dependency on something the machine can already see — a PR merging,
another task reaching `done`. But that dependency is recorded only in `blocked_reason`, which is
prose written for a person. Nothing can act on it without parsing English, and a guard that
parses English is exactly the kind of imprecision canonical refuses elsewhere (`flow-recover`'s
docblock: *"A stranded task is a precisely detectable state, so it can be precisely healed"*).

A live example, in a consuming repo: `write-0043` is blocked purely on `write-0033`'s PR #51
merging. The task file spells that out in three places in prose, and every one of them is
invisible to automation. When #51 merges, `write-0033` will go `done` on its own and
`write-0043` will sit blocked until someone remembers.

This task adds the field. It deliberately does **not** add the sweep that acts on it — that is
the task this one unblocks, and splitting them is on purpose: `_TEMPLATE.md` is published API
(canonical's `CLAUDE.md`: *"Editing it changes every downstream repo at the next tag"*), so a
field addition earns its own reviewed PR rather than riding along inside a workflow change.
`flow-0012` set that precedent when it added `serves`.

## Scope

- Add `blocked_by` to `project-template/.flow/tasks/_TEMPLATE.md`: a list, empty by default,
  holding the things this task waits on. Each entry is either a task id in this repo
  (`"flow-0039"`) or a PR url. Document it in the template's own comment style, at the density
  the neighbouring fields use — including that it is the machine-readable half of
  `blocked_reason`, never a replacement for it, because a person still needs the sentence.
- Validate it in `flow-doctor`: a `blocked` task should carry at least one `blocked_by` entry or
  say in `blocked_reason` why the block is not machine-checkable; a non-blocked task should not
  carry a populated `blocked_by`; entries must be shaped like a task id or a url. Choose warn
  vs fail per case and justify it in the PR — a repo full of existing blocked tasks written
  before this field must not turn red on adoption.
- Document the field in `project-template/.flow/PROTOCOL.md` where the lifecycle describes
  `blocked`, so the protocol and the template agree.

**Deliberately not touched.** No sweep, no workflow, no `.github/workflows/` change of any kind —
acting on this field is the follow-on task. Nothing in `.flow/bin/` at canonical's root: the
change belongs in the template's helper, and canonical's adapter is a thin CLI shell that gains
nothing. No change to `apply-board-edits.mjs`. No migration of existing blocked tasks in any
repo — the field is additive and absent means "not declared", which is the current behaviour.

## Acceptance criteria

- [ ] Given the template file, when it is read as YAML frontmatter, then `blocked_by` is present
      as an empty list and the file still parses.
- [ ] Given a task with `status: blocked` and a `blocked_by` naming a task id, when flow-doctor
      runs, then it reports no problem for that task.
- [ ] Given a task with `status: blocked` and an empty `blocked_by`, when flow-doctor runs, then
      it reports that task, and the message says how to make the block machine-checkable.
- [ ] Given a task with `status: ready` and a populated `blocked_by`, when flow-doctor runs, then
      it reports that task — a dependency that outlived its block is stale data.
- [ ] Given a `blocked_by` entry that is neither a task-id shape nor a url, when flow-doctor runs,
      then it reports that entry as malformed.
- [ ] Given a store of tasks that predate this field entirely, when flow-doctor runs, then it
      exits with the same pass/fail verdict it gave before this change — adopting the field must
      not turn an existing repo red.
- [ ] Given the protocol document, when the `blocked` status is described, then `blocked_by` is
      described alongside it.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

No open decisions. Two settled here so the worker does not re-derive them:

- **A field, not prose parsing.** The alternative — having the sweep regex a PR number out of
  `blocked_reason` — was rejected. `blocked_reason` is written for a human and its shape is not
  a contract; a guard built on it would be silently wrong the first time someone phrased a block
  differently. Canonical's own standard is a precisely detectable state.
- **A list, not a single value.** A task can wait on two things, and a scalar would force the
  second into prose, which is the problem this field exists to remove.

**Flag rather than guess:**

- The warn-vs-fail choice in flow-doctor is genuinely a judgement, and criterion 6 is the
  constraint that bounds it: adoption must not turn an existing repo red. If you find no
  setting that satisfies both that and a useful check, say so on the task rather than relaxing
  criterion 6 — it is the one protecting every already-adopted repo.
- If `blocked_by` turns out to need a shape the flightdeck cannot render (`flow-0001`,
  `flow-0019`), note it rather than designing for the flightdeck here. This field's contract is
  the store's, and a renderer is a consumer of it.

Related: `flow-0012` (the `serves` field, same shape of change), and the follow-on sweep task
that consumes this field.
