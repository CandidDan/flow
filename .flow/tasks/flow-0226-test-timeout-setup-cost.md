---
id: "flow-0226"
title: "Require a task that raises a test timeout to measure the setup cost it hides, or name a follow-up"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-11-13"
started: ""
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: "Parked by queue cap (canonical's ready queue is at 8; Dan, 2026-10-13: p1/p2 first, p3s wait). Not machine-checkable: flip to ready when the ready count drops below the cap."
cancelled_reason: ""
blocked_by: []
touches:
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - ".flow/bin/test-timeout-rule.test.mjs"
  - "changes/flow-0226.md"
labels: [protocol, task-writer, gate]
notes: []
asks: []
---

## Context

mapd-0058 raised mapd's test timeouts to 60 seconds and added a test that locks them there. The
tests were timing out because each one spent about 4 seconds setting up PGlite (an in-process
Postgres). Raising the timeout made the gate green and hid that cost: every test still pays it, the
suite stays slow, and the new test makes lowering the timeout look like a regression. The real fix
is mapd-0059. Nothing in Flow asked mapd-0058 to measure what it was hiding or to point at mapd-0059.

A raised timeout is the test-suite version of a gate that passes because it stopped checking
(VISION G10). This task adds one rule, in two places: the task-writer skill (for whoever writes the
task) and the protocol (for the worker who ends up raising a timeout mid-task).

Words used below:

- **Raising a test timeout**: any change that makes a test, a test file or the test runner wait
  longer before failing: a per-test timeout argument, a runner config value (`testTimeout`,
  `--test-timeout`, `hookTimeout`), or a retry count.

## Scope

1. **task-writer skill** (`project-template/.claude/skills/task-writer/SKILL.md`). Add a pre-flight
   item: a task whose scope raises a test timeout must have an acceptance criterion that records
   the measured setup time per test (or per file) that the timeout absorbs, before and after, OR
   must name, in Scope or Notes, the follow-up task that removes that cost (by id if it exists, or
   as a `follow-up:` ask if it does not). Cite mapd-0058 / mapd-0059 in one sentence as the example.
2. **Protocol** (`project-template/.flow/PROTOCOL.md`), in "The gate — Definition of Done". Add one
   short paragraph: a worker who raises a test timeout, even when the task did not mention it, states
   in the PR description the measured time the timeout now absorbs, and either fixes the cause in the
   same task (if it is within `touches`) or adds a `follow-up:` ask naming the task that should. A
   timeout raised with neither fails the qa check like an unproved criterion. Keep it under 600
   bytes; the protocol counts toward every adopter's `claude_md_max`.
3. Changelog fragment `changes/flow-0226.md`: no caller action beyond merging the next flow-sync PR.

Not in scope:

- Any automated detection of raised timeouts in CI or in the reviewers' prompts.
- mapd. mapd-0059 is mapd's own task.

## Acceptance criteria

All in `.flow/bin/test-timeout-rule.test.mjs`, reading the shipped text the way
`.flow/bin/draft-push-rule.test.mjs` does (by section, not the whole file, so a sentence that drifts
into another section fails).

- [ ] The task-writer skill's "Pre-flight" section contains an item that names raising a test
      timeout and requires either a criterion that records measured setup time or a named follow-up
      task.
- [ ] The protocol's "The gate — Definition of Done" section contains a paragraph that names raising
      a test timeout, requires the measured time in the PR description, and requires either the fix
      or a `follow-up:` ask.
- [ ] The paragraph added to the protocol is at most 600 bytes (the test measures the paragraph
      that matches criterion 2).
- [ ] `changes/flow-0226.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- No `touches` overlap with any live task as written (checked against flow-0223, flow-0224,
  flow-0225 on 2026-11-13). If another task is editing `PROTOCOL.md` or the task-writer skill when
  this is picked, the queue holds it.
- Expected version bump: MINOR (protocol text only).
