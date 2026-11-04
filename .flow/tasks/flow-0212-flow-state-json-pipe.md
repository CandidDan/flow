---
id: "flow-0212"
title: "flow-state --json writes its whole output when piped, instead of stopping at 64 KB"
status: "in_review"
priority: 1
project: "flow"
owner: "session_01NfrcU7vAPGkRmeRvQc1Fu3"
created: "2026-11-04"
started: "2026-11-04T23:00:32Z"
branch: "claude/sweet-pascal-9v30x7"
pr: "https://github.com/CandidDan/flow/pull/293"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - ".flow/bin/flow-state.mjs"
  - "project-template/.flow/bin/flow-state.mjs"
  - "project-template/.flow/bin/flow-state-pipe.test.mjs"
  - "changes/flow-0212.md"
labels: [urgent, bug]
model: ""
effort: ""
model_reason: ""
notes: []
asks: []
---

## Summary

When another program reads Flow's state report through a pipe, it gets only the first 64 KB and
cannot parse the rest. Canonical's report is now about 143 KB, so every reader gets broken data,
and the gate fails on every new pull request. After this fix, the whole report arrives.

## Context

`flow-state --json` is the supported way for anything outside a repo to read its state (protocol,
"Intent status is derived and never stored"; VISION.md G7). Inflight reads it.

Both CLI entry points end with `process.exit(runStateCli(...))`:

- `.flow/bin/flow-state.mjs:73` (canonical's adapter)
- `project-template/.flow/bin/flow-state.mjs:506` (the template, which every repo gets)

When stdout is a pipe, Node writes to it asynchronously. `process.exit()` ends the process before
the pending writes finish, so the output stops at the pipe buffer: 65,536 bytes. Measured on
`main` at `1c25fb6`: `node .flow/bin/flow-state.mjs --json | wc -c` prints `65536`, while the
full output is 143,602 bytes.

How it surfaced: [CandidDan/flow#292](https://github.com/CandidDan/flow/pull/292) adds one intent
file. That was enough for `adapters.test.mjs` → "node .flow/bin/flow-state.mjs --json emits
canonical's own task ids, resolved from origin/main" to fail with `JSON.parse` "Unterminated
string", reported through `release-assemble.test.mjs`. The PR did not cause the bug. Any further
growth of the store will turn the same check red on every PR.

The fix, checked locally on the adapter: replace `process.exit(runStateCli(...))` with
`process.exitCode = runStateCli(...)`. Node then exits with that code once stdout has drained.
With that change the piped output was 143,602 bytes and parsed as JSON.

## Scope

- In both files above, the CLI's main block sets `process.exitCode` from `runStateCli(...)`
  instead of calling `process.exit(...)`. The exit code a caller sees does not change.
- A new test, `project-template/.flow/bin/flow-state-pipe.test.mjs`, proves a piped run delivers
  output larger than 64 KB in full.
- A changelog fragment, `changes/flow-0212.md`.

Not in scope:

- The other helpers that end with `process.exit(run...)` (`flow-recover`, `flow-review`,
  `flow-unblock`, `review-guide`, `task-model`, `touches-guard`, `flow-kickback`,
  `allocate-task-id`, `flow-init`). None is known to print 64 KB. Changing them belongs to a
  follow-up task, if one is wanted.
- Any change to what `runStateCli` prints, or to the JSON schema.
- `adapters.test.mjs` and `release-assemble.test.mjs`. They are correct, and they pass once the
  output arrives whole.

## Acceptance criteria

- [ ] Given a store whose `flow-state --json` output is larger than 64 KB, when the template CLI is
      run with its stdout piped to another process, then that process receives the whole output
      and it parses as JSON. The test builds its own fixture store large enough to exceed 64 KB,
      so it does not depend on the size of canonical's store.
- [ ] Given the same piped run through canonical's adapter (`.flow/bin/flow-state.mjs --json
      --no-pr`), when it finishes, then the output parses as JSON and its `tasks` ids match
      canonical's store. This is the existing test in `.flow/bin/adapters.test.mjs`, which must
      pass with no change to that file.
- [ ] Given a run that fails (for example an unknown flag), when it exits, then the exit code is
      the same non-zero code as before this change.
- [ ] `changes/flow-0212.md` exists and states the caller action: none. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- `serves: ["maintenance"]`: this restores a contract `flow-state --json` already claims to keep.
  It does not advance G7 further, so it needs no intent.
- `urgent`: Dan approved this in the orchestrator chat on 2026-11-04 ("yes, write the flow-state
  fix task", in reply to a recommendation that it skip the queue cap). The queue held 9 ready
  tasks against a cap of 8, and the bug turns the gate red on every new PR.
- Possible follow-up for the orchestrator: the same `process.exit` pattern in the other helpers
  listed under Scope.
