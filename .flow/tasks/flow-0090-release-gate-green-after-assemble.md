---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0090"
title: "A release's own gate is green: no test requires a changelog fragment file that --assemble deletes"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-worker-flow-0090"
created: "2026-09-28"
started: "2026-10-01T13:47:29Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # G10: the gate tells the truth. A gate that goes red on every release for a reason unrelated to the change teaches people to override it.
touches:
  - ".flow/bin/release-assemble.test.mjs"
  - "project-template/.flow/PROTOCOL.md"
  - ".flow/bin/protocol-docs.test.mjs"
  - "changes/flow-0090.md"
labels: [release, testing, flow-infra]
notes:
  - "2026-09-28 (orchestrator): EVIDENCE. Three times in two releases a task's 'my changelog entry exists' test read `changes/<id>.md` directly: flow-0069 and flow-0073 broke the 2.1.0 release PR, flow-0050 broke 2.1.1. `--assemble` deletes fragments by design, so each release PR had to patch tests to go green. All three are patched (fragment OR assembled entry); nothing stops the fourth."
  - "2026-09-28 (orchestrator): THE GATE, NOT A LINT. A grep for `changes/flow-` in test files would be a heuristic with false negatives. The real property is 'after --assemble, the suite passes', so test that directly. Keep the run bounded: only the test files that mention `changes` or `CHANGELOG`, not the whole suite twice."
---

## Context

Workers prove a changelog criterion by reading their fragment. That is right while the task is
open and wrong forever after the next release. The fix is a gate that runs the relevant tests in
the state a release leaves the tree in, plus one sentence in the protocol so workers write the
test right the first time.

## Scope

**Does:**

- New canonical-only `.flow/bin/release-assemble.test.mjs`:
  - copy canonical's tracked tree into a scratch git repo (`git ls-files` + copy is enough);
  - if `changes/` holds any fragment besides `README.md`, run
    `node .flow/bin/changelog-fragments.mjs --assemble` there; if it holds none, add one
    synthetic fragment first so the path is always exercised;
  - run `node --test` over exactly the test files (in `.flow/bin/` and
    `project-template/.flow/bin/`) whose source mentions `changes` or `CHANGELOG`, with
    `NODE_TEST_CONTEXT` removed from the child env (see `adopter-layout.test.mjs` for why);
  - assert exit 0, and name every failing test in the message.
- `project-template/.flow/PROTOCOL.md`, in the existing fragment rule: a test that proves a
  changelog entry reads the fragment if it exists, otherwise the assembled entry in
  `CHANGELOG.md` (the entry whose file list ends `, <task-id>)`). Stated conditionally, like the
  rule around it, because adopting repos have no `changes/`.
- Changelog fragment `changes/flow-0090.md`. **Caller action: none.**

**Does not touch:** the three already-patched tests, `changelog-fragments.mjs`, `release-guard.mjs`.

## Acceptance criteria

- [ ] Given canonical as it is, when `release-assemble.test.mjs` runs, then it passes.
- [ ] Given a scratch copy where one test asserts `existsSync("changes/flow-XXXX.md")` for a
      pending fragment, when the check runs, then it fails and names that test. (Build the
      failing case inside the test; do not leave a broken test in the tree.)
- [ ] Given `changes/` with no pending fragment, then the check still assembles a synthetic one,
      so the path is exercised on every run.
- [ ] The child run removes `NODE_TEST_CONTEXT` and only runs test files mentioning `changes` or
      `CHANGELOG` (structure assertions on the test's own source are acceptable).
- [ ] `project-template/.flow/PROTOCOL.md` carries the fragment-or-assembled rule, conditionally;
      `protocol-docs.test.mjs` asserts it.
- [ ] `changes/flow-0090.md` exists and states "Caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
