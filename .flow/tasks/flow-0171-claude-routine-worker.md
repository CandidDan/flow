---
id: "flow-0171"
title: "Runbook and prompt for working Flow tasks from a Claude Code routine"
status: "in_review"
priority: 2
project: "flow"
owner: "claude-worker"
created: "2026-10-28"
started: "2026-10-28T02:28:45Z"
branch: "flow/flow-0171-claude-routine-runbook"
pr: "https://github.com/CandidDan/flow/pull/252"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
model: "sonnet"
effort: "medium"
model_reason: "Documentation and a prompt; no code paths change"
touches:
  - "docs/claude-routine-worker.md"
  - "changes/flow-0171.md"
labels: [docs, cost, routines]
notes:
  - "2026-10-28 (orchestrator): from Dan. Replaces queue-runner's GitHub-hosted worker with a Claude Code routine (cloud session on the Max plan, no Actions minutes). Pairs with the worker.host task, which adds host: claude-routine; this task does not depend on it landing."
---

## Context

Claude Code routines (https://code.claude.com/docs/en/routines.md) are cloud sessions that can run on
a cron (at most hourly) and be fired on demand with
`POST https://api.anthropic.com/v1/claude_code/routines/<trigger-id>/fire`, which takes an optional
`{"text": ...}` body. They use the subscription's usage, not API credits, and run on an Ubuntu VM
with Node, pnpm, Docker and PostgreSQL 16 (Postgres is installed but must be started). This is a
research preview.

Three things are **unconfirmed** and must be tested on a canary before any repo relies on routines:
1. Pushes default to `claude/`-prefixed branches, but Flow expects `flow/<id>-<slug>`.
2. Opening a PR unattended: `gh pr create` may fail because the session proxy rejects GraphQL. The REST API `POST /repos/{owner}/{repo}/pulls` probably works.
3. Auto mode can stop an unattended run to wait for a human.

## Scope

Write `docs/claude-routine-worker.md`, containing:
- **The routine prompt**, ready to paste. It tells the session to read `.flow/PROTOCOL.md` and run one
  task through the normal loop (claim → branch → build → gate → PR, stopping at the PR). It works the
  task id given in the fire `text` if there is one; otherwise it picks the top ready task with
  `node .flow/bin/pick-task.mjs`. Each run handles **one** task.
- **Setup steps:** create the routine at claude.ai/code/routines; select the repo; network access
  must allow the package registry; a setup script that installs dependencies and runs
  `service postgresql start` where a repo's gate needs Postgres; add a schedule trigger and an API
  trigger; and set `worker.host: claude-routine` in the repo's config.
- **How a mission-control app fires it:** the endpoint, headers and body shape, and a note that the
  token is shown once and must be stored as a secret.
- **A canary checklist** with one line per unknown above, each with how to check it and where to
  record the result.
- **Limits and costs:** 30 runs an hour per routine, 100 an hour per account, usage shared with
  interactive sessions, research-preview status.

**Deliberately does NOT:**
- Create or run a routine. That is done by Dan in the claude.ai UI; this task only writes the doc.
- Change any workflow, helper or config.

## Acceptance criteria

- [ ] `docs/claude-routine-worker.md` exists, with sections for: prompt, setup, firing from an app, canary checklist, limits.
- [ ] The prompt names `.flow/PROTOCOL.md`, handles both a given task id and no id, and says to stop at the PR.
- [ ] The canary checklist lists all three unknowns, each with a concrete check.
- [ ] The doc marks routines as a research preview and links the routines doc.
- [ ] All five gate commands pass.
