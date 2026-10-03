---
id: "flow-0119"
title: "A task carries typed asks for the human, in a format flow-doctor validates and inflight can read"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-worker-flow-0119"
created: "2026-10-02"
started: "2026-10-03T01:29:51Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G12"]    # G12: anything Flow needs from me is one decision, answerable from my phone. Today human-facing items are buried in task notes nobody opens.
touches:
  - "project-template/.flow/bin/asks.mjs"
  - "project-template/.flow/bin/asks.test.mjs"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/bin/flow-state.mjs"
  - "project-template/.flow/bin/flow-state.test.mjs"
  - "project-template/.flow/tasks/_TEMPLATE.md"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/CLAUDE.md"
  - "changes/flow-0119.md"
labels: [flow-infra, human-loop, inflight-contract]
notes:
  - "2026-10-02 orchestrator: written at Dan's request after reviewing tanplan PR #36. Its task notes held 'a follow-up task is worth writing' (session-review minutes column), and tanplan-0024's held an a/b/c owner ruling. Neither reached Dan except through the orchestrator relaying it. This task is the CONTRACT: the field, its validation and its machine-readable report. The consumers are the PR-comment task (blocked_by this one) and inflight, which Dan wants to flag these items (his single control surface). DECISIONS, do not relitigate: (1) `asks` is a list of STRINGS with a kind prefix, not a list of maps, so every existing frontmatter reader (flow-state, pick-task, mission-control's browser-safe parser) reads it unchanged. (2) asks.mjs imports nothing from node:* and uses only Web-standard globals, like flightdeck/bin/mission-control.mjs, so inflight can reuse it in the browser instead of re-implementing the grammar (NG5). (3) The id is a short stable hash of the normalised text, so the same ask is recognised across runs and repos without a counter. (4) Touches overlap PR #155 (PROTOCOL.md) and PR #162 (flow-state.mjs): dispatch after both merge."
---

## Context

Workers end a task by writing `notes` on main: a machine handoff for the next session. They also
put things only the human can act on in those same notes ("FOR THE HUMAN OR ORCHESTRATOR",
"a follow-up task is worth writing", "owner ruling between (a), (b), (c)"). The human never opens
task frontmatter, so those items reach nobody unless an orchestrator session reads and relays
them. Prose in `notes` cannot be routed: nothing can tell "for the next worker" from "for you".

## Scope

**A new task field `asks: []`**, a list of strings, each one open item for the human:

```yaml
asks:
  - "decision: <the question>. Recommend: <the option and why, one sentence>"
  - "follow-up: <the task that should exist, one sentence>"
  - "fyi: <what the reviewer should know before merging>"
```

- The kinds are `decision`, `follow-up` and `fyi`. A `decision` must carry `Recommend:` (G12: a
  decision arrives with a recommendation).
- Resolving an ask removes it from `asks` and appends a `notes` line recording the answer.

**`asks.mjs`** is pure and browser-safe, with no `node:*` imports. It exports:

```ts
parseAsk(s: string): { id: string; kind: "decision"|"follow-up"|"fyi"; text: string; recommend: string|null } | { error: string }
parseAsks(list: unknown): { asks: Ask[]; errors: string[] }
askId(s: string): string   // short stable hash of the normalised text
```

**flow-doctor** fails a malformed ask (unknown kind, empty text, a `decision` without
`Recommend:`), naming the task and the ask.

**`flow-state --json`** adds `asks: Ask[]` to every task row (an empty array when there are
none). This is the machine-readable report inflight and the workflows read.

**Protocol and worker instructions** (`PROTOCOL.md`, `project-template/CLAUDE.md`,
`_TEMPLATE.md`): `notes` is for the next session and `asks` is for the human. An item a person
must act on goes in `asks`, never only in `notes`. A blocked task's decision goes in `asks` as
well as in `blocked_reason`.

**Does not:** post anything to GitHub (that is the PR-comment task), touch workflows, or touch
`flightdeck/` (it is moving to inflight under ADR 0006).

## Acceptance criteria

- [ ] `parseAsk("decision: v2 or v3? Recommend: v3, the schema id says the shape")` returns kind
      `decision`, the question, the recommendation and a stable id; the same string returns the
      same id on every call.
- [ ] `parseAsk` returns an error for `"decision: pick one"` (no `Recommend:`), `"todo: x"`
      (unknown kind) and `"fyi:"` (empty).
- [ ] flow-doctor fails a task carrying any of those three, naming the task and the ask, and
      passes a task carrying one valid ask of each kind.
- [ ] Given a task with no `asks` field (every existing task), flow-doctor passes and
      `flow-state --json` reports `asks: []`.
- [ ] `flow-state --json` reports a task's asks parsed, each with `id`, `kind`, `text` and
      `recommend`.
- [ ] asks.mjs has no `node:` import (a test reads the source and asserts it).
- [ ] PROTOCOL.md, project-template/CLAUDE.md and _TEMPLATE.md state the notes/asks split and
      the three kinds, with one example of each.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
