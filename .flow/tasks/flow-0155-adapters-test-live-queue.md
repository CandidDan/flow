---
id: "flow-0155"
title: "The adapters test stops depending on canonical's live queue, so every PR's gate is not red whenever nothing is pickable"
status: "in_review"
priority: 1
project: "flow"
owner: "claude-session_015SJbzZrb7RuJ87bd7n3mC2"
created: "2026-10-22"
started: "2026-10-22T03:19:55Z"
branch: "flow/flow-0155-adapters-test-live-queue"
pr: "https://github.com/CandidDan/flow/pull/221"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".flow/bin/adapters.test.mjs"
  - "changes/flow-0155.md"
labels: [gate, bug]
notes:
  - "2026-10-22 (orchestrator): FOUND while checking why the queue stalled. adapters.test.mjs 'the three autonomous-loop adapters…' runs pick-task against canonical's LIVE store and asserts it prints an id. When every ready task overlaps an in-flight one (today: 0113 and 0122 vs 0108/0153/0154), pick-task correctly prints nothing and the test fails, and release-assemble.test.mjs re-runs it and fails too. Every open PR's gate goes red (#216, #220) for a reason no PR caused."
model: "sonnet"
model_reason: "one assertion rewritten"
asks: []
---

## Context

The assertion exists to catch the symlink failure mode (the adapter reading the template's fixture
store). It does that by requiring a canonical id, which ties it to whatever the live queue holds.

## Scope

**Does:** in `.flow/bin/adapters.test.mjs`, compare the CLI's output with `pickTask(readTasks(...))`
run on canonical's store (empty when nothing is eligible), and separately prove the CLI did not read
the fixture store: the fixture store's pick is a non-empty fixture id, which the CLI must not print.

## Acceptance criteria

- [ ] Given canonical's store with no eligible task, when the test runs, then it passes, with the CLI
      printing nothing and the module agreeing.
- [ ] Given canonical's store with an eligible task, when the test runs, then the CLI prints exactly
      the module's pick, a canonical id.
- [ ] Given the fixture store's pick (non-empty), when compared with the CLI's output, then they
      differ; the test asserts the fixture pick is non-empty so that check cannot pass vacuously.
- [ ] `changes/flow-0155.md` exists and states caller action: none.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
