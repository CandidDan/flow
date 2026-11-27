# ADR-0012: Task state lives in a database, behind a storage contract

**Status:** Proposed — accepted when this PR merges
**Date:** 2026-11-26
**Deciders:** Dan (sole maintainer)
**Supersedes:** ADR-0001 (task store is repo files on `main`) and ADR-0011 (where task state is
committed, which never recorded a chosen option)
**Intent:** `.flow/intents/task-store-not-a-pain-point.md` (approved 2026-11-26)

## Context

Every change to a task is a commit to `main`: claim, block, status sync, done, recover. ADR-0001
chose this because git gives a safe claim. ADR-0011 listed what it costs and left the choice open.
The costs have not gone away:

- Task commits start CI, e2e runs, deploys and releases in every adopting repo. Between
  2026-11-12 and 2026-11-13, 53 of tanplan's 73 `e2e.yml` runs were task commits.
- Reading tasks through the GitHub API used about 1,600 calls an hour per open inflight tab. Dan's
  account was at about 4,500 of 5,000 calls an hour on 2026-11-13.
- Flow carries code that exists only because state lives in git: the store-guard, the rule that a
  branch never edits `.flow/tasks/`, `only-flow-changed.mjs`, `flow-unblock`, and the minimal-CI
  rules for task-only PRs.
- There is no way to ask "what is ready to build" across repos, and a task that waits on another
  task needs a commit and a workflow run each time it is blocked and again when it is released.

Dan's decision (2026-11-26): task state is a database problem. VISION.md was amended in PR #322 so
that a task is a Markdown record in a store, and the store may be git files or database rows. This
ADR records which store Flow's own fleet uses, and how.

## Decision

### 1. The protocol describes operations, not files

`project-template/.flow/PROTOCOL.md` is rewritten so that every step that edits a task says what it does, not which file
it edits. The operations are the **storage contract**:

| Operation | Meaning |
|---|---|
| `get(id)` / `list(filter)` | Read one task or a filtered list. |
| `claim(id, owner)` | Move `ready` to `in_progress` if no task with overlapping `touches` is `in_progress` or `in_review`. Exactly one concurrent claimant succeeds. |
| `transition(id, to, by)` | The existing status lifecycle. Only the writers the protocol already names may call each transition. |
| `block(id, reason, blocked_by)` | Move to `blocked`, with the fields the protocol requires. |
| `note(id, text)` / `ask(id, ask)` | Append a note, or an ask of kind `decision`, `follow-up` or `fyi`. |
| `create(task)` | Add a task. It always lands as `proposed`. |
| `ready()` | Tasks that are `ready`, whose `depends_on` entries are all `done`, and which overlap nothing in flight, ordered by priority. |
| `history(id)` | The ordered events for a task. |

A task is still one Markdown document. The frontmatter fields stay the same names with the same
meaning, and the body stays Markdown. Intents, workstreams and VISION.md stay in git and are
approved by merging a PR, as today.

Two stores implement the contract:

- **git store**: the current behaviour, moved behind the contract with no change in behaviour.
- **database store**: described below.

Each repo picks one with `store.kind: git | database` in `.flow/config.yml`. Canonical's tests run
the same contract tests against both, so the git store stays correct for anyone outside Dan's fleet
who adopts Flow. Features that only a database can provide (the event table, a query across repos)
are not part of the contract and are not built for the git store.

### 2. The database store

- **Host:** a new Supabase project used only for Flow task state, separate from the TanPlan
  projects. Postgres.
- **Schema:** one `tasks` row per task. The frontmatter fields are columns (status, priority,
  owner, started, model, effort, touches, intent, blocked_by, depends_on, and so on). The Markdown
  body is a `body` text column. Notes and asks are columns on the row too, as they are in the file.
  A `task_events` table records every change: who, when, from, to, and the new field values. Task
  rows are never deleted.
- **Task IDs:** unchanged. A per-repo counter in Postgres replaces `allocate-task-id.mjs`'s
  commit-and-retry. A hash ID is not needed, because hash IDs exist to avoid collisions between
  clones that cannot see each other, and one database removes that problem. Keeping `flow-0240`
  style IDs also keeps every PR title, branch name and existing reference valid.
- **Claim:** one database transaction that takes a lock for the repo, checks the status and the
  `touches` overlap, and writes the claim. Two concurrent claims serialise; the second one sees
  `in_progress` and is refused. This is the same guarantee as first-push-wins.
- **`depends_on`:** a list of task IDs in the same repo. `ready()` only returns a task whose
  entries are all `done`. This replaces `flow-unblock` for the case where a task waits on another
  task. A dependency on a task in another repo is not supported in the first version.

### 3. Workers never hold a database key

Workers, the reusable workflows and inflight call a small HTTP API that exposes exactly the
contract operations. The API is Postgres functions behind one Supabase Edge Function. The
database's own keys live only in that function.

- Each repo has its own token. Its operations are limited to that repo's tasks, and each
  transition is limited to the writer the protocol names for it (a worker token cannot mark a task
  `done`; only the merge workflow's token can).
- A separate read-only token serves inflight.
- Tokens are stored hashed, can be revoked one at a time, and appear in the event table as the
  actor.

The contract does not depend on Edge Functions. If they prove a poor fit (cold starts, limits), the
same operations can be served by a small server without changing any caller. The Phase 2 task
checks this before building on it.

### 4. When the database is down

A claim, a hand-off or a status sync fails with a clear message, and nothing falls back to git: two
stores for one repo means two versions of the truth.

- A worker already building keeps building. It cannot claim new work or hand off until the
  database is back, and it reports that rather than guessing.
- Status syncs from PR events are retried with backoff, and every call carries a key made from the
  PR and event, so a retry never applies a transition twice.
- Daily, the whole store is exported as Markdown files to storage outside the database, so a lost
  database is a restore and not a rebuild. The location is chosen in the Phase 2 task.

### 5. Existing tasks

Canonical's 240 task files are imported once, by a script that can be run again safely. It copies
each task's current state, notes and asks, and records an `imported` event naming the git commit
it came from. It does not replay git history into events: that history stays in git, where it
already is. After canary week the task files are deleted from `main`.

### 6. What this does not change

The gate. The review checks, the accept step before `proposed` becomes `ready`, `touches`
enforcement, the rule that a task's named model builds it, and the rule that a PR never changes
task state do not change. The store-guard becomes unnecessary for repos on the database store,
because a PR cannot edit a row.

VISION G7 stays as written. The API answers questions about one repo at a time. A view across all
repos (what is ready, blocked, or waiting on Dan) is built by inflight, which is a consumer of the
API. Flow does not build it.

## Options considered

| Option | Why not |
|---|---|
| Keep git files on `main`, add path filters (ADR-0011 A) | A deploy hook, a third-party app or a release script cannot be filtered by Flow. Every new integration has to learn about task commits again. |
| Keep git files on `main`, mark state commits `[skip ci]` (ADR-0011 B) | Stops GitHub Actions runs only. It relies on every writer adding the marker. It leaves the API read load, the missing ready query and the store-guard code in place. |
| A `flow-state` branch (ADR-0011 C) | Stops CI, but needs a breaking migration in every repo and still reads and writes through git and the GitHub API. It fixes one cost and keeps the rest. |
| GitHub Issues as the store (ADR-0001 B) | Claims are not atomic, and the gate would need API auth. Nothing has changed since ADR-0001 rejected it. |
| Beads, on Dolt | Dan decided not to build on it: too heavy (Dolt, schema migrations, a server direction). The ideas are borrowed instead: `depends_on` with a ready list now; hash IDs, compaction of closed work and `defer_until` are not taken. |
| Linear as the store | Claims are not atomic and Flow's fields have no typed place. Not a requirement. The contract keeps a Linear adapter possible later, and no part of this design is shaped for it. |

## Consequences

**Good**

- A task change is one API call. It starts no CI, no deploy and no release in any repo.
  `only-flow-changed.mjs`, the release step-overs and the store-guard can be deleted from repos on
  the database store.
- inflight reads from one place instead of polling GitHub, which removes its share of the API
  rate limit.
- `ready()` and `depends_on` give Dan one answer to "what can be built now", and a task that waits
  on another starts on its own.

**Bad**

- A new service the fleet depends on. If it is down, no repo can claim new work. Section 4 limits
  the damage but does not remove it.
- Tasks are no longer in the repo: not visible when browsing it, not in `git log`, not editable
  with a text editor. The daily export covers reading them. It does not cover editing them.
- A hosting cost, which Dan has not yet approved. The free tier has no daily backups and may pause
  a project after a period of inactivity; both must be checked against Supabase's current terms
  before the first repo moves. A paid project is the expected choice, and Dan sets the number
  before Phase 5.
- Flow now has two stores to keep correct. The shared contract tests are what keep this honest.

## Rollout

Each phase is one or more tasks, written after this ADR merges. Every task lands as `proposed` and
needs Dan's accept.

| Phase | Work | Model |
|---|---|---|
| 1 | Rewrite `PROTOCOL.md` as the storage contract. Put the store interface in `project-template/.flow/bin/` and move the git code behind it with no behaviour change. | sonnet |
| 2 | Database store: schema, API, tokens, atomic claim, events, daily export. **First step, before any schema work:** check Supabase's current terms (backups, pausing when idle) and get Dan's approval of the monthly cost. Security review runs on the PR. | opus |
| 3 | `depends_on`, `ready()`, and the read API inflight uses. | sonnet |
| 4 | Import canonical's tasks and run canonical on the database store for about a week. Then delete the task files and the git-only workarounds there. | opus |
| 5 | Move each adopting repo, one at a time, lowest-traffic first and tanplan-platform last. `store.kind: git` is the rollback for each, but only after a fresh export is written back to `.flow/tasks/`, because the old files are stale once a repo has written to the database. | sonnet |

A repo that syncs helpers expecting the database store without having moved must fail loudly, not
read an empty store.
