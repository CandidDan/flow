---
id: "flow-0170"
title: "A repo chooses where its worker runs, and new adopters get no automatic worker"
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
serves: ["maintenance"]
intent: ""
model: "opus"
effort: "medium"
model_reason: "Changes the reusable queue-runner every repo runs, and a new adopter default"
touches:
  - ".github/workflows/_flow-queue-runner.yml"
  - "project-template/.flow/bin/worker-host.mjs"
  - "project-template/.flow/bin/worker-host.test.mjs"
  - "project-template/.flow/config.yml"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0170.md"
labels: [workflows, cost, config]
notes:
  - "2026-10-28 (orchestrator): from Dan. October Actions bill hit the $250 budget; queue-runner was ~$60 of it across private repos, billed per minute while the runner waits on Claude. Dan: 'queue runner has to go' and 'right now we're forcing them into using Claude'. Private repos set FLOW_QUEUE_RUNNER=paused by hand on 2026-10-28 as a stopgap."
---

## Context

Today every adopting repo gets `flow-queue-runner`, which starts a Claude Code worker
(`anthropics/claude-code-action`) on a GitHub-hosted runner. That ties adopters to Claude and to
per-minute Actions billing. In October it cost about $60 across private repos.

Where the worker runs should be a per-repo choice, read from `.flow/config.yml`:

```yaml
worker:
  host: manual   # manual | claude-routine | github-actions
```

- `manual`: nothing starts a worker automatically. A person (or any agent) works ready tasks in a session.
- `claude-routine`: a Claude Code cloud routine does the work (set up outside GitHub; see the companion routine task). queue-runner does nothing.
- `github-actions`: today's queue-runner behaviour.

**Decided defaults:** a repo whose config has **no** `worker` key behaves as `github-actions`, so
existing adopters are unchanged until they opt out. The **template** config ships `host: manual`,
so new adopters get no automatic worker and no surprise bill.

## Scope

- Add a pure helper `worker-host.mjs` that reads `.flow/config.yml` and returns the host, applying
  the default above and rejecting unknown values with a clear message.
- In `_flow-queue-runner.yml`, before any worker job starts (and before any paid step beyond the
  decision), run the helper. Unless the host is `github-actions`, the run ends successfully with a
  one-line reason in the step summary, for both scheduled and `workflow_dispatch` runs.
- Add the `worker` block, with a comment explaining the three values, to `project-template/.flow/config.yml`.
- Document the setting in `docs/flow-reusable-workflows.md`.

**Deliberately does NOT:**
- Touch `FLOW_QUEUE_RUNNER=paused` or `FLOW_AI`; both keep working as today.
- Change kickback, review, triage or any other Claude-using workflow.
- Build the routine itself.
- Change canonical's own `.flow/config.yml`.

## Acceptance criteria

- [ ] Given a config with no `worker` key, the helper returns `github-actions`.
- [ ] Given `worker.host` of `manual`, `claude-routine` or `github-actions`, the helper returns that value.
- [ ] Given an unknown value (e.g. `jenkins`), the helper fails with a message naming the three allowed values.
- [ ] Given host `manual` or `claude-routine`, queue-runner (scheduled or dispatched) starts no worker job and reports the reason in the step summary. Prove it with a test over the workflow's decision step, not a grep of the YAML alone.
- [ ] Given host `github-actions`, queue-runner behaves exactly as before (existing queue-runner tests stay green).
- [ ] `project-template/.flow/config.yml` contains `worker.host: manual` with an explanatory comment.
- [ ] All five gate commands pass, and coverage stays at or above the floor.
