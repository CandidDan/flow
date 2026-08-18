---
id: "flow-0001"
title: "Aggregate portfolio state in tested code, sourced only from flow-state"
status: "in_review"
priority: 2
project: "flow"
owner: "claude/next-tasks-ahnx30"
created: "2026-08-11"
started: "2026-08-18"
branch: "claude/next-tasks-ahnx30"
pr: "https://github.com/CandidDan/flow/pull/13"
issue: ""
blocked_reason: ""
serves: ["G5"]            # the flightdeck data layer — knowing where the work is
touches: ["flightdeck/bin/flightdeck-state.mjs", "flightdeck/bin/flightdeck-state.test.mjs", "flightdeck/README.md"]
labels: [flightdeck, infra]
notes: []
---

## Context

The flightdeck is not trusted. The human sanity-checks each project directly before acting on it,
which defeats the point of having a portfolio view at all.

The cause is not missing features — it is that **aggregation lives in a prompt and reads the wrong
source**. `portfolio-manager.md` instructs an agent to walk `flightdeck/projects.yml`, read each
project's `.flow/tasks/`, parse frontmatter, and roll it up. Two consequences:

1. **Wrong source.** A Cowork session's view of a repo is a mounted local clone that lags `origin`.
   Cloud workers merge to `origin/main`; the clone only updates when the human's machine fetches.
   The agent spec was recently corrected to say "read `origin/main`, never the working tree" — but
   an instruction is not an enforcement, and nothing fails if it drifts back.
2. **Untestable.** Frontmatter parsing, status classification, and cross-project rollup are
   deterministic data transforms currently expressed as prose. They cannot be unit-tested, so they
   cannot be trusted, and every Flow bug in this area is invisible until the human spots a wrong
   number.

`flow-state.mjs` (shipped in `.flow/bin/`, v1.1.0) already solves the per-project half correctly: it
reads every task from `origin/main` and reconciles each against its PR via `gh`. This task lifts the
cross-project half into tested code alongside it, so the agent is left doing what it is actually good
at — judgement and prose — and none of what it is bad at.

## Scope

- Add `flightdeck/bin/flightdeck-state.mjs`: reads `flightdeck/projects.yml`, and for each `enabled`
  project invokes that project's `.flow/bin/flow-state.mjs --json`, merging the results into one
  document on stdout.
- The output document carries, per project: the task list with its resolved status, plus a
  **provenance block** — the `origin/main` commit SHA the state was read from, the commit's
  timestamp, and whether PR reconciliation ran (`gh` available) or was skipped.
- A project that cannot be read (path missing, no `flow-state.mjs`, `origin/main` unreadable) is
  reported as an explicit `unavailable` entry with the reason. It is **never** silently omitted, and
  the aggregator **never** falls back to reading the working tree.
- Add `flightdeck/bin/flightdeck-state.test.mjs` covering the criteria below (`node --test`).
- Update `flightdeck/README.md` to document the command and the output shape.

Deliberately **not** in scope: the HTML rendering, the provenance/disagreement UI, and the
`portfolio-manager.md` rewrite — those are flow-0002. This task ships the data layer only.

## Acceptance criteria

- [ ] Given a registry with two enabled projects, when the aggregator runs, then stdout is a single JSON document containing both projects' tasks tagged by project name.
- [ ] Given a registry entry with `enabled: false`, when the aggregator runs, then that project appears nowhere in the output.
- [ ] Given a project whose path does not exist, when the aggregator runs, then that project appears with `status: "unavailable"` and a `reason`, the process still exits 0, and no other project is affected.
- [ ] Given a project that resolves successfully, when the aggregator runs, then its entry includes a `provenance` object with a non-empty `commit`, an ISO-8601 `committed_at`, and a boolean `pr_reconciled`.
- [ ] Given `gh` is unavailable, when the aggregator runs, then every project reports `pr_reconciled: false` and the run still succeeds.
- [ ] Given a project directory that exists but has no `.flow/bin/flow-state.mjs`, when the aggregator runs, then it is reported `unavailable` with a reason naming the missing resolver — and the aggregator does not read `.flow/tasks/` from the working tree as a fallback.
- [ ] Given the aggregator source, when it is inspected, then it contains no code path that reads task files from a working tree — `origin/main` via `flow-state` is the only source.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- Registry parsing: `projects.yml` is small and fixed-shape. Prefer a minimal hand-rolled parser
  consistent with the existing `.flow/bin` readers over adding a YAML dependency — but note that
  those readers have already produced one frontmatter bug (a `#` inside a value being truncated as a
  comment, fixed in flow-state v1.1.0). If a hand-rolled parser starts growing cases, say so in the
  PR rather than accreting them silently.
- `flow-state.mjs` is invoked per project via its own copy in that repo, so projects on older Flow
  versions may not have it. That is exactly the `unavailable` path above — do not special-case it.
- This is a Flow infra change, so per the protocol's governance rule it is authored here in
  canonical and adopted downstream; do not patch it into a consuming repo.
