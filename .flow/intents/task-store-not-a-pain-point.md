---
id: "task-store-not-a-pain-point"
title: "Flow's task storage stops being a pain point, so every project builds faster without losing quality"
status: "proposed"
created: "2026-11-26"
source: "Dan, project thread on Beads and Gas Town, 2026-11-25 to 2026-11-26"
serves: ["G8", "G9"]       # [assumption] chosen by the writer, not Dan
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

After reviewing Beads and Gas Town (Steve Yegge's agent task tracker and orchestrator) against Flow:

> "I feel like sometimes using Github is a bit like forcing a circle into a square hole."

> "I do think our storage system in Flow is already proving to be a pain point."

> "Ultimately I want to improve efficiences in building and throughput in all projects that use
> flow without every comprimisng quality of whjat is being built"

> "I think we're avoiding something that is clearly better solved by moving to a database
> structure of some kind"

— Dan, project thread, 2026-11-26.

And earlier, on CI running for task commits:

> "tasks should not be running e2e tests that is ridiculous. maybe flow committing to main in
> github is wrong"

— Dan, 2026-11-13, recorded in ADR-0011.

## Cost of inaction

In Dan's words, the storage stays "a pain point", and the throughput he wants across all projects
does not arrive.

Evidence (not Dan's words):

- Every change to a task is a commit to `main`. Between 2026-11-12 and 2026-11-13, 53 of tanplan's
  73 `e2e.yml` runs were task commits, and they made up most of a 76-job backlog on the Hetzner
  runners (ADR-0011).
- On 2026-11-13 Dan's GitHub API use was about 4,500 of 5,000 calls an hour, about 1,600 of them
  from inflight reading task files.
- Flow carries code whose only job is to work around task state living in git: the store-guard,
  the rule that a branch never edits `.flow/tasks/`, `only-flow-changed.mjs`, `flow-unblock`, and
  flow-0223 (minimal CI for task-only PRs).
- On 2026-11-26, 7 of canonical's 21 blocked tasks were blocked only because they wait on other
  tasks. Each block and each release is a commit and a workflow run.
- There is no single answer to "what is ready to build, in any repo". Each repo has to be read
  separately.

## Outcome

Changing a task (claiming it, blocking it, finishing it) no longer starts CI, a deploy or a commit
in any repo. Dan can see in one place what is ready, blocked or waiting on him across every
project. A task that waits on another task starts on its own once that task is done. And the
quality bar is exactly what it was: the same CI, the same review checks, the same accept step
before anything is built.

## Constraints

- "without every comprimisng quality of whjat is being built". The gate, the review checks and
  the accept step do not change.
- "I do like that tasks files are markdown it suits it but I like the power that a db add's on
  top". A task stays readable and writable as Markdown.
- "Flow as the protocol still exists ... the implementation of the protocol is not specified,
  someone could choose to use the git backed storage, we are now choosing a database backed
  storage". The protocol is written so that more than one store can meet it, and the git store
  stays valid for anyone adopting Flow.
- "I don't want to build Flow off Beads". Beads' ideas may be borrowed; Beads and Dolt are not
  dependencies.
- Spend: GitHub Actions has a hard cap of $85 a month, and Hetzner CI spend has a cap of €50 a
  month. Any new hosting cost is Dan's decision before it is incurred.
- Builds keep running overnight and while Dan is away. Nothing may depend on his Mac being on.
- Intents and VISION.md stay in the repo, approved by merging a PR.

## Open questions

- Where the database-backed store is hosted, and what it costs.
  [assumption] Postgres on Supabase, which Dan already uses.
- Whether a task may depend on a task in another repo. If so, G7's line "Cross-project
  aggregation is not this goal… and not Flow's job" needs amending first.
- Whether canonical keeps building and testing the git store, or only documents it.
  [assumption] Both stores pass the same shared tests, so the contract stays real.
- How a worker writes to the store without holding a raw database key.
  [assumption] A small API with a few actions: claim, block, hand off, file a proposed task.
- What happens to the history of finished tasks already in git: imported, or left where it is.
- What happens when the database is unreachable: every queue stops, or workers fall back.
- Which of Beads' ideas come with this work and which come later: `depends_on` with a computed
  ready list, priority definitions, an optional `type`, `defer_until`, `discovered_from`, and
  replacement links on cancelled tasks.
- Whether this replaces ADR-0001 (task store is repo files on `main`) and ADR-0011 (where task
  state is committed) in one new decision record, or each separately.
