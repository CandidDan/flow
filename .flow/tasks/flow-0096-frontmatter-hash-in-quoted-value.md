---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0096"
title: "A hash inside a double-quoted frontmatter value is data, not a comment, so blocked_reason is never silently truncated"
status: "in_progress"
priority: 3
project: "flow"
owner: "claude-worker-flow-0096"
created: "2026-09-29"
started: "2026-10-01T20:09:57Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - "project-template/.flow/bin/flow-state.mjs"
  - "project-template/.flow/bin/flow-state.test.mjs"
  - "changes/flow-0096.md"
labels: [flow-state, parsing]
notes:
  - "2026-09-29 (orchestrator): Found by the flow-0095 worker. `parseTask` in `project-template/.flow/bin/flow-state.mjs` (around line 62) strips a whitespace-preceded hash as a YAML comment from every frontmatter scalar, including double-quoted ones. A blocked_reason mentioning a PR reference (PR, space, hash, number) is cut at that point, so flow-doctor and the flightdeck read a truncated reason, and a task that ends its reason with 'not machine-checkable' still gets the empty-blocked_by warning."
---

## Context

In YAML a `#` starts a comment only outside quotes. The helper applies comment stripping to every
scalar. The header comment only anticipated a value that starts with a hash (e.g. an issue
number), which survives; a hash mid-value inside quotes does not.

## Scope

**Does:** strip a trailing `# comment` only from unquoted scalars; a double-quoted value is taken
whole up to its closing quote, and single-quoted likewise. Changelog fragment
`changes/flow-0096.md` (**Caller action: none**).

**Does not touch:** any other frontmatter semantics; the task template.

## Acceptance criteria

- [ ] Given `blocked_reason: "waits on PR #127, not machine-checkable"`, then parseTask returns the
      whole string.
- [ ] Given `serves: ["G10"]    # a comment`, then the trailing comment is still stripped.
- [ ] Given an unquoted `priority: 2  # note`, then the value is `2`.
- [ ] Given `issue: "#157"`, then the value is `#157` (existing behaviour kept).
- [ ] Given a task whose quoted blocked_reason contains a hash and ends 'not machine-checkable',
      then flow-doctor does not warn about an empty blocked_by.
- [ ] `changes/flow-0096.md` exists and states "Caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
