---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "PROJ-0000"            # <project slug>-<zero-padded number>
title: ""                 # one line, imperative: "Persist discount code across PLP navigation"
status: "ready"           # ready | in_progress | in_review | done | blocked
priority: 3               # 1 = drop everything … 5 = whenever
project: ""               # project slug, lets the flightdeck aggregate across repos
owner: ""                 # session id once claimed; empty while ready
created: ""               # YYYY-MM-DD
started: ""               # YYYY-MM-DD, set on claim
branch: ""                # flow/<id>-<slug>, recorded by flow-status when the PR opens
pr: ""                    # PR url, recorded by flow-status when the PR opens
issue: ""                 # origin GitHub issue url, if this task was triaged from the inbox
blocked_reason: ""        # required iff status is blocked
touches: []               # path globs this task expects to modify, e.g. ["src/signup/**", "api/subscribe.*"]
                          # concurrency: a ready task is skipped while its touches overlap an in_progress one
labels: []                # optional, e.g. [frontend, infra, spike]
notes: []                 # append-only log; kickbacks land here
---

## Context

Why this exists. The problem in the human's words. Link any exploration HTML, prior
task ids, or design files. Enough that a fresh session understands without asking.

## Scope

What this task *does*. Bullet the concrete changes. Be explicit about the boundary —
what it deliberately does **not** touch. Out-of-scope discoveries become new tasks.

## Acceptance criteria

The contract for "done." Each line must be **observable and testable** — the worker
writes at least one test per criterion, and the qa-verifier checks the mapping.

- [ ] Given <situation>, when <action>, then <observable outcome>.
- [ ] …

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

Anything the worker should flag rather than guess. If a real decision is needed that
isn't captured above, the task isn't `ready` yet — send it back to the orchestrator.
