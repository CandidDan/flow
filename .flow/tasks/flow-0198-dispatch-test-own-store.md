---
id: "flow-0198"
title: "flow-dispatch's CLI test runs against its own fixture store, never the adopting repo's real tasks"
status: "done"
priority: 2
project: "flow"
owner: "claude-session_01NfrcU8dZ2b3fAeTsHPM8Ms"
created: "2026-11-03"
started: "2026-11-03T12:14:14Z"
branch: "flow/flow-0198-dispatch-cli-test-store"
pr: "https://github.com/CandidDan/flow/pull/284"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/flow-dispatch.mjs"
  - "project-template/.flow/bin/flow-dispatch.test.mjs"
  - "changes/flow-0198.md"
labels: [bug, test]
model: "sonnet"
effort: "medium"
model_reason: "Small, well-specified test isolation fix following the flow-0183 pattern"
asks: []
notes:
  - "2026-11-03 orchestrator: found on CandidDan/inflight#95 (4.1.0 sync). `flow-dispatch.test.mjs :: no routine configured at all exits 0 through the CLI shell too` spawns the CLI with no store argument, so in an adopting repo it reads that repo's real `.flow/tasks/`. One bad task there (inflight-0057 had model/effort with an empty model_reason) failed the test and turned the sync PR red. Same class as flow-0183 (a dispatch test asserting on an adopter's own config). The bad task was fixed on inflight's main (ccc3411)."
---

## Context

`project-template/.flow/bin/flow-dispatch.test.mjs` line ~133 builds a temp store with `store(t, …)` but
spawns `flow-dispatch.mjs` without pointing it at that store, so the CLI reads the tasks of whatever repo
the tests run in.

## Scope

1. Make the spawned CLI read the test's temp store: pass it the way the CLI already accepts (an env var or
   flag; add one to `flow-dispatch.mjs` if none exists, documented in its header).
2. Check every other spawn in `flow-dispatch.test.mjs` and point any that read a store at a fixture.
3. Fragment `changes/flow-0198.md`: **No caller action.**

**Does not:** change dispatch decisions or the CLI's default store when no override is given.

## Acceptance criteria

- [ ] `flow-dispatch.test.mjs`: the CLI test passes when the working repo's own store contains a task with
      `model: "sonnet"` and an empty `model_reason` (the test writes such a task into a throwaway repo
      copy and runs the suite's CLI case from there, or asserts the spawned CLI never reads outside the
      temp store).
- [ ] No spawn in `flow-dispatch.test.mjs` runs the CLI without an explicit store.
- [ ] `changes/flow-0198.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
