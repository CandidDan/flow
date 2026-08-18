---
id: "flow-0002"
title: "Show the flightdeck's freshness and its disagreements instead of hiding them"
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
serves: ["G5"]            # provenance and disagreement — knowing how much to trust it
touches: ["flightdeck/bin/render-flightdeck.mjs", "flightdeck/bin/render-flightdeck.test.mjs", "flightdeck/.claude/agents/portfolio-manager.md"]
labels: [flightdeck, ux]
notes: []
---

## Context

**Depends on flow-0001** (the aggregator and its JSON shape). If flow-0001 is not merged when you
claim this, set this task `blocked` with that reason rather than inventing the schema — Flow has no
dependency field yet, so the ordering is enforced by you reading this line.

The flightdeck is stale by construction and does not say so. Three lags compound: source lag (the
local clone refreshes when a `flow-fetch` launchd agent runs), render lag (`flightdeck.html` is a
snapshot written when the digest is run, and is stale one second later, permanently), and writeback
lag (task state updates on PR events, so there is a real window where the store and the PR disagree).

None of that is visible in the output. The human therefore treats every number as *possibly* stale,
which costs exactly as much attention as having no flightdeck at all.

The insight this task encodes: **trust comes from calibrated uncertainty, not from being right most
of the time.** An unmarked snapshot that is usually correct is more corrosive than a view that says
"as of 14 minutes ago, 2 disagreements". The first makes you check everything; the second makes you
check two things.

## Scope

- Add `flightdeck/bin/render-flightdeck.mjs`: consumes flow-0001's JSON on stdin and writes
  `flightdeck.html`. Rendering becomes a deterministic, tested transform; the agent's remaining job
  is judgement and prose, not layout or arithmetic.
- **Per-project provenance line**, always rendered, never omitted: the short commit SHA the state was
  read from, the age of that commit in human terms, and whether PR reconciliation ran.
- **A disagreement lane** as a first-class section: any task where the store and PR reality differ
  (store says `in_review`, PR is merged; store says `ready`, a PR is open; store says `in_progress`
  with no branch). Each row states both readings and which one is more likely current. The renderer
  **never silently picks a winner**.
- **An `unavailable` lane** for projects flow-0001 could not read, showing the reason. A project that
  cannot be read is a louder signal than a project with no work, and must not look like the latter.
- Rewrite `portfolio-manager.md` to consume the rendered data rather than re-deriving it: it runs
  flow-0001, pipes to the renderer, and spends its remaining effort on the tiering and judgement it
  already specifies well (the blocked classifier, the stuck-worker and stalled-review smells).
- Add `flightdeck/bin/render-flightdeck.test.mjs`.

Deliberately **not** in scope: changing the existing three-tier blocked classifier or the digest's
prose format — those are working. This task changes *what the view admits about itself*, not how it
prioritises.

## Acceptance criteria

- [ ] Given aggregator JSON for a project, when the page renders, then that project's column shows its provenance commit SHA, the commit age, and the PR-reconciliation state.
- [ ] Given a project whose provenance commit is older than 60 minutes, when the page renders, then that project's freshness indicator is visually marked as stale and the age is stated in the markup.
- [ ] Given a task whose store status is `in_review` and whose PR is merged, when the page renders, then it appears in the disagreement lane showing both readings, and does not appear as a plain `in_review` item elsewhere.
- [ ] Given no disagreements across all projects, when the page renders, then the disagreement lane renders in an explicit empty state (confirming it was checked) rather than being omitted.
- [ ] Given a project reported `unavailable`, when the page renders, then it appears in the unavailable lane with its reason and is excluded from all task counts.
- [ ] Given input JSON with no provenance block for a project, when the renderer runs, then it exits non-zero with a message naming the project — an unstamped render is a failure, not a silent default.
- [ ] Given the same input JSON twice, when the renderer runs both times, then the output HTML is byte-identical apart from the render timestamp.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- Keep the existing self-contained single-file HTML pattern (no external assets, `localStorage` for
  tab and collapse state) — the board and flightdeck should stay openable from disk.
- "Which reading is more likely current" is a heuristic, not a truth claim. PR state comes from the
  GitHub API and the store comes from a commit, so the PR is usually fresher — but say "PR is likely
  current" in the copy, never "store is wrong".
- Do **not** attempt to auto-correct a disagreement by writing to the store. Writing task state is
  owned by `flow-status`/`flow-done`; a renderer that writes would break the store's single-writer
  guarantee. Surfacing is the whole job.
