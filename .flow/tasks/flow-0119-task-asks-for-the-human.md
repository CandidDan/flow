---
id: "flow-0119"
title: "A task carries typed asks for the human, in a format flow-doctor validates and inflight can read"
status: "in_review"
priority: 2
project: "flow"
owner: "claude-worker-flow-0119"
created: "2026-10-02"
started: "2026-10-03T01:29:51Z"
branch: "flow/flow-0119-task-asks-for-the-human"
pr: "https://github.com/CandidDan/flow/pull/175"
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
  - ".flow/bin/protocol-portability.test.mjs"
  - ".flow/bin/serves-template.test.mjs"
  - "flightdeck/bin/flightdeck-state.test.mjs"
labels: [flow-infra, human-loop, inflight-contract]
notes:
  - "2026-10-04 orchestrator: two reds on #175, neither caused by v3. (1) touches: the worker correctly updated three tests that pin the frontmatter field order and the resolver's imports; I added them to touches. (2) code review found the frontmatter readers cut any quoted value at its first '#'. I fixed parseListField and scalarReader on the branch and added tests. The same split(\"#\") pattern remains in flow-recover, pick-task, source-roots and check-claude-md; that is a follow-up task, not this one."
  - "2026-10-03 worker: DONE and handed off. PR #175 open and marked ready for review on branch flow/flow-0119-task-asks-for-the-human (rebased onto main; its diff touches no .flow/tasks/ file). All 7 acceptance criteria have proving tests, named per-criterion in the PR body. Gate green on the rebased branch: build 34 workflows, lint 115 .mjs, npm test 1813 pass / 0 fail, coverage 97.01% vs floor 83.5, flow-doctor exit 0 over 127 tasks. The three previously-open guard updates are DONE on the branch and named in the PR: protocol-portability INTENTIONAL_DIVERGENCES (Status lifecycle d9bccf75, Session hygiene 65ee3fa7), serves-template key list gains `asks` after `notes`, flightdeck-state makeProject copies the resolver's whole bin dir (flow-state now imports ./asks.mjs). Also in-scope and fixed: flow-doctor.test.mjs cliFixture now copies asks.mjs, or every CLI exit-code assertion reads ERR_MODULE_NOT_FOUND as 'the problem was found'. Nothing left for a worker; the qa, security and code-review checks run on the PR. NEXT: human reviews/merges #175 — flow-done sets this task done. The two consumers this contract unblocks (the PR-comment task, inflight) are still blocked_by this one."
  - "2026-10-03 worker: BUILT and PUSHED on branch flow/flow-0119-task-asks-for-the-human. Genuinely done: project-template/.flow/bin/asks.mjs (grammar, browser-safe, no imports) + asks.test.mjs; flow-doctor asksFindings wired into runDoctor with tests; flow-state parseTask/resolveState report parsed asks with tests; PROTOCOL.md, project-template/CLAUDE.md and _TEMPLATE.md state the notes/asks split; changes/flow-0119.md. All 7 criteria have proving tests and those four test files are green. NOT done yet: three canonical-only GUARD tests OUTSIDE `touches` still fail because the declared edits trip them, and each is the guard whose own instructions say to update it — (1) .flow/bin/protocol-portability.test.mjs needs INTENTIONAL_DIVERGENCES entries for the Status lifecycle and Session hygiene sections (the file says to record the digest in the same commit as the edit); (2) .flow/bin/serves-template.test.mjs pins _TEMPLATE.md's exact frontmatter key list and needs `asks` added after `notes`; (3) flightdeck/bin/flightdeck-state.test.mjs makeProject cpSync's ONLY flow-state.mjs into its fixture, so the new ./asks.mjs import is ERR_MODULE_NOT_FOUND — the fixture must copy the resolver's whole bin dir, which is what rsync does in a real repo. Decision not to relitigate: flow-state MUST import the grammar (criterion 5), so a single-file fixture cannot stand; duplicating the grammar there is exactly what the task's decision 2 forbids. NEXT ACTION: make those three edits on the branch, re-run npm test + npm run coverage, then open the PR. touches-guard ignores .flow/** and flightdeck/ is undeclared-tree-exempt, so CI will not flag them, but they ARE outside touches — name them explicitly in the PR."
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
