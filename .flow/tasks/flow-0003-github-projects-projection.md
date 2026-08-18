---
id: "flow-0003"
title: "Project the task store into a GitHub Project v2 board, written only by CI"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-08-11"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G5"]            # the projection; deferred per ADR-0002 Amendment 1, goal unchanged
touches: [".github/workflows/_flow-project-sync.yml", "project-template/.github/workflows/flow-project-sync.yml", "project-template/.flow/bin/project-sync.mjs", "project-template/.flow/bin/project-sync.test.mjs", "docs/adr/0002-flightdeck-projection-github-projects.md"]
labels: [flightdeck, infra, integration]
notes: []
---

## Context

Decision recorded in `docs/adr/0002-flightdeck-projection-github-projects.md`: the flightdeck gains a
**projection** into a GitHub Project v2 board. Files under `.flow/tasks/` remain the single source of
truth — ADR-0001 settled that and is not reopened here. What changes is that the *view* stops being
an HTML snapshot a human has to ask an agent to regenerate.

Why this and not the alternatives: a rendered artifact is stale the moment it is written (flow-0002
makes that honest, but cannot make it live), and building a bespoke dashboard is a maintenance
commitment that competes directly with the product work it exists to make visible. A GitHub Project
is hosted, live, free, filterable, has a mobile app, and requires no rendering step. The cost is a
second surface that can disagree with the store — which is precisely the drift Flow exists to
prevent, and is why the read-only rule below is a hard constraint rather than a convention.

The trigger for needing this at all: a files-only store rendered by an agent does not survive contact
with other people. Employees and clients will not run a digest agent to find out what is happening;
they want a URL that is always right. That requirement arrives the day someone else joins.

## Scope

- Add `project-template/.flow/bin/project-sync.mjs`: reads the task store from `origin/main` and
  upserts one Project v2 item per task, mapping `status` to the board's Status field and carrying
  `id`, `title`, `priority`, `owner`, `branch`, `pr` as fields.
- Add the reusable `_flow-project-sync.yml` and its thin caller, triggered on the same PR events that
  already drive `flow-status`/`flow-done`, plus a scheduled reconciliation pass to repair drift.
- **The projection is write-only from CI.** Human edits made in the Project UI are overwritten by the
  next sync, by design. This must be enforced structurally, not documented and hoped for: the sync is
  a full reconciliation against the store, not a diff of what changed.
- The board's own description states the rule in one line, so anyone who finds it knows they are
  looking at a mirror and where the real store is.
- A task deleted or renamed in the store has its Project item archived, not orphaned.
- Add `project-sync.test.mjs`. Tests must not require network: exercise the store→item mapping and
  the reconciliation decisions (create / update / archive / no-op) against a faked API surface.

Deliberately **not** in scope: reading anything *back* from the Project into the store, and moving
issue triage into the Project. Both would make the projection bidirectional, which is the exact
failure mode the ADR rejects.

## Acceptance criteria

- [ ] Given a store with three tasks and an empty Project, when sync runs, then three items exist with Status matching each task's `status`.
- [ ] Given a task whose status changed from `ready` to `in_review` since the last sync, when sync runs, then its existing item is updated in place and no duplicate item is created.
- [ ] Given a Project item whose Status was manually changed in the UI to something that disagrees with the store, when sync runs, then the item is reset to the store's value.
- [ ] Given a task file removed from the store, when sync runs, then its Project item is archived and not left in an active column.
- [ ] Given an unchanged store, when sync runs twice, then the second run makes zero write calls (idempotent reconciliation).
- [ ] Given the API returns a rate-limit or transient error mid-sync, when sync runs, then it exits non-zero with the failing task id named, and the store is left untouched.
- [ ] Given the sync source, when it is inspected, then it contains no code path that writes to `.flow/tasks/` — the projection can never mutate the store.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Auth is decided: a separate `FLOW_PROJECT_PAT`.** Project v2 writes need `project` scope, which
  the repo-scoped `FLOW_PAT` does not have. `FLOW_PAT` is **not** widened — that would grant every
  workflow in the repo more than it needs, and the whole point of a second token is that the blast
  radius of the board is the board. Grant it `project: read/write` and nothing else; it does not need
  Contents or Pull requests.
- **The failure mode to design for is expiry, not compromise.** A fine-grained PAT expires, and when
  it does the sync fails silently in a scheduled workflow nobody is watching — the board quietly
  freezes while looking authoritative, which is worse than it being obviously down. Two mitigations,
  both required: the sync must **fail loudly** (non-zero exit, and the run's failure is visible on the
  board's description or a pinned issue rather than only in Actions logs), and the token's expiry date
  goes in the calendar the day it is created.
- A GitHub App installation token is the better long-term answer — it does not expire and is owned by
  the org rather than a person. Deliberately deferred: it is more setup than a PAT for the same
  outcome today. Revisit when canonical and the projects move to a business org, which is also when
  the personal-credentials problem has to be solved for `CLAUDE_CODE_OAUTH_TOKEN` anyway.
- Project v2 is GraphQL-only; there is no REST equivalent. Field updates need the field and option
  node IDs, so resolve them once per run and cache in-process rather than per item.
- For a personal account the Project is user-scoped; under an org it is org-scoped and gets proper
  permissions. If canonical and the projects are moving to a business org, prefer an org-level
  Project so the board outlives any one account.
- Once this is live, flow-0002's rendered flightdeck becomes the *offline* view rather than the
  primary one. That is fine and worth keeping — it works with no network and no GitHub — but do not
  build new features into both.
