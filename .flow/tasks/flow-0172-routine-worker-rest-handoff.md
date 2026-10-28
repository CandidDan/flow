---
id: "flow-0172"
title: "The worker loop runs from a Claude Code cloud routine: the PR is opened and handed off through REST, never GraphQL, and docs/flow-routines.md says how to set a routine up"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-10-28"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G9"]
intent: "model-work-off-github-actions"
touches:
  - "project-template/.flow/PROTOCOL.md"
  - "docs/flow-routines.md"
  - ".flow/bin/protocol-routine-handoff.test.mjs"
  - ".flow/bin/draft-pr-lifecycle.test.mjs"
  - "changes/flow-0172.md"
labels: [protocol, routines, cost]
model: "opus"
effort: "high"
model_reason: "Edits PROTOCOL.md, the published contract every adopting repo's worker reads, and writes the setup doc the fleet will follow"
notes: []
asks: []
---

## Context

The intent `.flow/intents/model-work-off-github-actions.md` (merged 2026-10-28, PR #250) records Dan's
call: "queue runner has to go, we need a better way to do this". October's Actions bill hit the
$250 budget, and `flow-queue-runner` was $74 of it, mostly a paid runner waiting on Claude.

A canary on 2026-10-28 ran the full worker loop as a **Claude Code cloud routine** (Max plan, zero
Actions minutes): CandidDan/tanplan-platform task tanplan-0178, PR #221, about 11 minutes. What it
proved, verbatim from its report:

| Step | Result |
|---|---|
| claim pushed to `main` | accepted (`e626702..140f7d3 main -> main`) |
| push of a `flow/` branch | accepted (`[new branch]`) |
| gate (build, lint, test, coverage) | all pass, inside the session |
| `gh pr create` | **HTTP 403** — GraphQL is blocked in Claude Code sessions |
| `gh api repos/{owner}/{repo}/pulls -f title=… -f head=… -f base=main -F body=@file` | **worked**, PR opened non-draft |

A read-only probe the same day captured the full 403 text. It names the replacement routes:

> For review threads, auto-merge, and draft/ready-for-review use the CCR routes on api.github.com:
> GET /repos/{owner}/{repo}/pulls/{n}/ccr/review_threads, POST /repos/{owner}/{repo}/pulls/{n}/ccr/comments/{comment_id}/resolve
> (or /unresolve), PUT or DELETE /repos/{owner}/{repo}/pulls/{n}/ccr/auto_merge,
> **POST /repos/{owner}/{repo}/pulls/{n}/ccr/ready_for_review**, POST /repos/{owner}/{repo}/pulls/{n}/ccr/convert_to_draft.

So the protocol's hand-off breaks in a routine. `PROTOCOL.md` step 8 is "**Hand off — `gh pr ready`**",
and `gh pr ready` is GraphQL. In normal operation `flow-open-pr` has already opened the PR **as a
draft** on the worker's first push (the canary skipped that only because Actions was blocked by
billing at the time), so a routine worker reaches step 8 holding a draft it cannot mark ready.

## Scope

- `project-template/.flow/PROTOCOL.md`, *The loop you run*, steps 7 and 8: keep `gh pr create` /
  `gh pr ready` as the instructions for a session that has GraphQL, and add, in the same steps,
  what a **Claude Code cloud session** does instead:
  - step 7 (only when no PR exists for the branch yet): `gh api repos/{owner}/{repo}/pulls` with
    `title`, `head`, `base=main` and the body, which opens it non-draft;
  - step 8: `gh api -X POST repos/{owner}/{repo}/pulls/{n}/ccr/ready_for_review`;
  - how the worker tells which case it is in: the 403 text above, "GitHub GraphQL is not available
    from Claude Code sessions", is the signal, so trying `gh pr ready` first and falling back on
    that exact message is acceptable; so is checking first. Pick one and write it down.
  - step 1 already says to pick the top `ready` task. Add one sentence: a worker started **without
    a task id** picks with `node .flow/bin/pick-task.mjs`, and an empty result means stop.
- New `docs/flow-routines.md`: how to set up the worker routine for a repo. It must contain:
  - the environment the canary used (Anthropic cloud, Ubuntu, Node + pnpm present; Postgres 16
    installed but stopped, started with `service postgresql start` when a repo's gate needs it);
  - **attach no connectors**: a routine created through the API attaches every claude.ai connector
    on the account by default (the canary's had 22, including Stripe and Gmail), and the worker
    needs only the repo;
  - one routine per model tier the repo uses, and the model it is created with;
  - the **saved prompt verbatim**, short, which points at `CLAUDE.md` / `.flow/PROTOCOL.md` and
    passes the task id from the trigger's text (empty means pick), so the instructions live in the
    synced protocol and not in each routine;
  - the limits that matter: schedules no more often than hourly, 30 runs an hour per routine,
    usage drawn from the Max plan;
  - the canary's evidence, as a short table.
- Update `.flow/bin/draft-pr-lifecycle.test.mjs`'s "PROTOCOL.md documents the draft hand-off" test
  only as far as the new wording needs. It must still require `` `gh pr ready` ``.
- Changelog fragment `changes/flow-0172.md`. **Caller action: run flow-sync** (it delivers
  `.flow/PROTOCOL.md`). No caller, secret or permission changes, so this is a MINOR release.

**Deliberately does NOT:**
- Touch `flow-queue-runner` or `flow-unblock` in any way. Retiring queue-runner and changing
  unblock's dispatch are separate tasks that follow this one.
- Create or configure any routine. A worker cannot, and that is the human's step from the doc.
- Change `flow-open-pr`, `flow-status` or the draft-first design.
- Move review, kickback, triage or compass. The intent leaves that open.

## Acceptance criteria

- [ ] Given `project-template/.flow/PROTOCOL.md`, when step 8 is read, then it names both `gh pr ready` and `POST /repos/{owner}/{repo}/pulls/{n}/ccr/ready_for_review`, and says which applies in a Claude Code cloud session (`.flow/bin/protocol-routine-handoff.test.mjs`).
- [ ] Given `PROTOCOL.md`, when step 7 is read, then it names the REST route `repos/{owner}/{repo}/pulls` for opening a PR from a session without GraphQL (same test file).
- [ ] Given `PROTOCOL.md`, when the loop is read, then it says a worker started with no task id runs `.flow/bin/pick-task.mjs` and stops on an empty result (same test file).
- [ ] Given `docs/flow-routines.md`, when it is read, then it contains the saved prompt in a fenced block, the instruction to attach no connectors, the hourly scheduling limit and the per-tier routine rule (same test file, one assertion each).
- [ ] Given `.flow/bin/draft-pr-lifecycle.test.mjs`, when it runs against the new `PROTOCOL.md`, then "PROTOCOL.md documents the draft hand-off" still passes and still requires `` `gh pr ready` ``.
- [ ] Given `changes/flow-0172.md`, then it states the caller action "run flow-sync" (`.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- The `ccr/ready_for_review` route is advertised by the 403 text but has **not yet been exercised**.
  Write it into the protocol as the instruction; the first routine-run task proves it. Do not try
  to verify it from this task's session.
- If wording elsewhere in `PROTOCOL.md` contradicts the new steps (for example the line in
  *Concurrency* saying "the queue runner can dispatch more than one"), leave it. Retiring
  queue-runner rewrites those lines; record any you notice as a `follow-up` ask.
