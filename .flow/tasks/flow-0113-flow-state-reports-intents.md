---
id: "flow-0113"
title: "flow-state reports intents and streams, each intent with a status derived from the tasks that name it"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-10-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits on flow-0112 (the stream store this reports on) and flow-0074 (the `intent:` field on tasks that statuses are derived from). Both are ready, neither is merged."
blocked_by: ["flow-0112", "flow-0074"]
serves: ["G7", "G11"]
touches:
  - "project-template/.flow/bin/flow-state.mjs"
  - "project-template/.flow/bin/flow-state.test.mjs"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/README.md"
  - "changes/flow-0113.md"
labels: [flow-state, intent-layer, streams]
notes:
  - "2026-10-01 (orchestrator): ORIGIN. Split from the 2026-09-07 'intents projection' draft. That draft had Flow render and publish an HTML page. Dan agreed 2026-10-01 that the page is a surface, and surfaces belong to inflight (VISION G7: 'something else can render it'; ADR-0006; NG6). What stays in Flow is the part G7 says a Flow repo owes: reporting its own intent and stream state, completely enough that inflight renders it without asking. The page is now an inflight intent (CandidDan/inflight, `.flow/intents/client-reads-the-plan.md`)."
  - "2026-10-01 (orchestrator): intents carry no `tasks` list (flow-0073 dropped it) and flow-0074 makes the TASK name its intent, so status is computed by scanning tasks for `intent: <id>`. Never read from, or written to, the intent."
---

## Context

`flow-state.mjs` is the repo's trusted, read-only resolver. It reads task state from `origin/main`,
reconciles each task against its PR when `gh` is available, and has a `--json` mode. That makes it
the one place a consumer can ask "what is in flight here?" and get a straight answer, which is
VISION's G7.

It knows nothing about intents or streams. So the question a client or the operator actually asks
(which outcomes are done, which are in progress, which have not started, and why each was wanted)
cannot be answered without a consumer re-implementing the store's rules. That would put the
protocol's logic in two places, and the second copy would drift.

This task teaches `flow-state` to report intents and streams, with each intent's status derived
from the tasks that name it. It renders nothing and publishes nothing. inflight, or anything else,
renders from its JSON.

## Scope

- Read `.flow/streams/*.md` and `.flow/intents/*.md` from `origin/main`, exactly as tasks are read
  today (never the working tree). Skip `_TEMPLATE.md`.
- **Derive each intent's status** from the tasks whose `intent:` names it, using the task's
  PR-reconciled status where `flow-state` already has it:
  - `superseded`: the intent's own `status` is `superseded` (wins over everything below);
  - `not_started`: no task names it;
  - `blocked`: any naming task is `blocked`;
  - `in_progress`: any naming task is `ready`, `in_progress` or `in_review`;
  - `done`: at least one naming task, and every naming task is `done`.
  Export the derivation as a pure function (`deriveIntentStatus(intent, tasks)`) so it is
  tested directly and a consumer can reuse it rather than restate it.
- **Export a pure core that builds the whole intents report from file contents**, with no git,
  `gh` or filesystem access: `buildIntentReport({ streams, intents, tasks, vision })`, each argument
  being raw file text keyed by path, returning exactly the `streams[]` / `intents[]` / `schema`
  shape that `--json` prints. The CLI reads `origin/main` and calls it. inflight imports it from the
  pinned Flow release and calls it on files it fetched through the GitHub API (decided 2026-10-01:
  import, not per-repo workflow artefacts).
- **`--json` gains three things** and keeps everything it has today:
  - `schema`: an integer, starting at `1`, bumped on any breaking change to the JSON shape.
    inflight consumes this across repos pinned to different versions, so the shape is published
    API from now on.
  - `streams[]`: `id`, `title`, `serves` (ids plus resolved goal titles from `VISION.md`, with
    unresolved ids marked), `purpose`, `constraints`, `dependencies` and `open_questions` as text,
    and `counts` per derived status across its intents.
  - `intents[]`: `id`, `title`, `source`, `stream` (id, or null; an unresolved id is reported with
    `stream_resolved: false`), `serves` (as for streams), the derived `status`, the first line of
    `blocked_reason` when blocked, `tasks[]` (id, status, PR URL), `supersedes` and `superseded_by`,
    and the body sections as text with `[assumption]` lines flagged in a separate `assumptions[]`.
- Human-readable mode gets a short intents summary: one line per stream with its counts, and one
  line per ungrouped intent.
- `flow-state <intent-id>` prints that intent with its derived status, its tasks and their PRs.
- With no `.flow/intents/`, the JSON carries `intent_layer: "inactive"` and empty arrays, and the
  command still exits 0. With no `.flow/streams/`, `streams` is empty and every intent is ungrouped.
- `PROTOCOL.md`: one paragraph saying intent status is derived and never stored, and that
  `flow-state --json` is the supported way for anything outside the repo to read it.

**Deliberately not in scope:**
- **Any HTML, page or publishing workflow.** That is inflight's (see the origin note).
- Operator planning data such as merge surface or migration ranges. If inflight wants them, they
  are computed from task `touches` there, or in a later task.
- Writing anything. `flow-state` stays read-only.

## Acceptance criteria

- [ ] Given an intent no task names, then `deriveIntentStatus` returns `not_started`.
- [ ] Given an intent named by one `done` task and one `in_review` task, then it returns
      `in_progress`; given both `done`, then `done`.
- [ ] Given an intent named by a `blocked` task and a `done` task, then it returns `blocked`.
- [ ] Given a `superseded` intent whose tasks are all `done`, then it returns `superseded`.
- [ ] Given a store on `origin/main` with two streams, three intents (one ungrouped) and tasks
      naming them, when `flow-state --json` runs, then the output carries `schema: 1`, both streams
      with correct per-status counts, and all three intents with their derived statuses and tasks.
- [ ] Given an intent whose `stream` names no declared stream, then the JSON reports that id with
      `stream_resolved: false`, and the intent is counted under no stream.
- [ ] Given an intent with an `[assumption]` line, then that line appears in its `assumptions[]`.
- [ ] Given a `serves` id `VISION.md` does not declare, then it is reported with its bare id and
      marked unresolved.
- [ ] Given a working-tree intent that differs from `origin/main`, then the output reflects
      `origin/main`, matching how tasks are read.
- [ ] Given a repo with no `.flow/intents/`, then `--json` reports `intent_layer: "inactive"` with
      empty `streams` and `intents`, and the command exits 0.
- [ ] Given `flow-state <intent-id>`, then it prints that intent's derived status and each naming
      task with its PR.
- [ ] Given the same store passed as raw file text to `buildIntentReport`, then its result equals
      the `streams`, `intents` and `schema` fields of `flow-state --json` for that store, and the
      function touches no filesystem, git or network (asserted by running it with those
      unavailable).
- [ ] `changes/flow-0113.md` exists and states the caller action (none: the new JSON fields are additive and `schema` is new) — proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Decided (Dan, 2026-10-01)

- **inflight imports `buildIntentReport` from the pinned Flow release** and runs it on files it
  fetched. Rejected: each repo publishing `flow-state --json` as a workflow artefact. That puts a
  new caller in every repo, spends CI minutes whether or not anyone looks (G9), and makes the page
  only as fresh as each repo's last run. `schema` is what keeps the import safe across repos
  pinned to different versions.
- **Intents are ordered by `created` date** within a stream. No ordering field.
- **Stream constraints are reported once, on the stream.**
