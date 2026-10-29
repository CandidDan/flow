---
id: "flow-0180"
title: "flow-doctor reports touches overlap only where two globs can match the same file, so a wildcard in a file name no longer collides with every file in its folder"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-code-clever-wiles-97b799"
created: "2026-10-29"
started: "2026-10-29T02:00:30Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "changes/flow-0180.md"
labels: [doctor, concurrency]
model: "sonnet"
effort: "medium"
model_reason: "One heuristic function with a clear table of cases; the risk is a missed real overlap, which the criteria pin"
asks: []
notes:
  - "2026-10-29 orchestrator: found on PRs #242 and #259. Both gates failed with 'BOTH in_progress with overlapping touches' between flow-0165 (`.flow/bin/plane-guard.mjs`) and flow-0176 (`.flow/bin/status-transition*.mjs`), which share no file. Re-running once two of the three tasks were in_review made both green, so the false positive cost a round trip and briefly blocked three parallel workers."
---

## Context

`flow-doctor.mjs` decides whether two tasks' `touches` overlap with `globsOverlap(a, b)` (around
line 1016). It compares each glob's `staticPrefix`, the path up to the first wildcard trimmed to a
whole segment. A wildcard inside the **file name** therefore throws the file name away:
`.flow/bin/status-transition*.mjs` becomes `.flow/bin`, which contains every file in `.flow/bin/`.
So `.flow/bin/status-transition*.mjs` "overlaps" `.flow/bin/plane-guard.mjs`.

This matters for two reasons:
- As a WARN, it makes `ready` tasks look unsafe to run in parallel when they are safe.
- As a FAIL (two `in_progress` tasks), it fails the gate of every open PR through the
  "flow-doctor reports no consistency failures against this repo" test, whatever the PR changes.

## Scope

Make the overlap test precise for a wildcard in the last path segment, and keep it conservative
everywhere else. Two globs overlap when some real path could match both.

- A literal path and a glob overlap only if the glob matches the literal path.
- Two globs that differ only in their last segment, in the same folder, overlap only if their
  last-segment patterns can match a common name. Being conservative is fine here: for example,
  treat `a*.mjs` and `b*.mjs` as disjoint when their literal prefixes differ, and as overlapping
  when you cannot tell.
- `**`, and a wildcard in a folder segment, keep today's prefix behaviour (conservative).
- Segment-aware containment stays: `app/foo` and `app/foobar` still do not match.

**Does not:** change which statuses are compared, the WARN/FAIL split, or the message text beyond
naming the pair.

## Acceptance criteria

- [ ] `.flow/bin/status-transition*.mjs` and `.flow/bin/plane-guard.mjs` do **not** overlap.
- [ ] `project-template/.flow/bin/status-transition*.mjs` and `project-template/.flow/bin/flow-review.mjs` do **not** overlap.
- [ ] `.flow/bin/status-transition*.mjs` and `.flow/bin/status-transition.test.mjs` **do** overlap.
- [ ] `changes/flow-*.md` and `changes/flow-0177.md` **do** overlap.
- [ ] `a/**` and `a/b/c.mjs` **do** overlap. `a/*/x.mjs` and `a/b/x.mjs` **do** overlap.
- [ ] `app/foo` and `app/foobar` do **not** overlap (existing behaviour, still covered).
- [ ] Two identical globs overlap.
- [ ] Given two `in_progress` task fixtures whose only shared folder is `.flow/bin/` and whose
      file names cannot collide, when flow-doctor runs, then it reports no FAIL for them.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
