---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0087"
title: "Stop the skipped source-root check showing a raw ${{ matrix.path }} name"
status: "in_review"
priority: 3
project: "flow"
owner: "claude-worker-flow-0087"
created: "2026-09-28"
started: "2026-09-28T04:28:17Z"
branch: "flow/flow-0087-source-root-check-name"
pr: "https://github.com/CandidDan/flow/pull/119"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-gates.yml"
  - ".flow/bin/source-roots-gate.test.mjs"
  - "changes/flow-0087.md"
labels: [infra, gate, ci]
notes: []
---

## Context

`_flow-gates.yml`'s `source-root` matrix job is named `source-root (${{ matrix.path }})`. When
`source-roots-plan` reports `count=0`, the job is skipped by its `if:`. GitHub never evaluates the
name of a skipped matrix job, so the PR shows a check literally titled
`flow-gates / source-root (${{ matrix.path }})`. It looks like broken templating and has been
reported as "flow-gates didn't run" (PR #112), when the skip is correct behaviour.

The skip is the **common** case, not an edge case. Canonical always skips it, because all its
`source_roots` are covered by the primary gate. So does every single-tree adopting repo. So the
misleading name is on nearly every PR in the fleet.

**The fix is decided: drop the matrix expression from the job name and use a static
`name: source-root`.** GitHub appends matrix values in parentheses to a static job name for jobs
that run, so a running job still shows which root it is, and a skipped one reads as a plain
`source-root`. The trade-off is accepted: a running job's name will list every matrix field (`path`,
`check`, `runtime`, `version`, `retry`, `cache`, `cache_dependency_path`), not just the path. That
verbosity only appears in repos that actually have extra roots. Do not try to shorten it by
changing the matrix shape, because the plan's output is the contract `source-roots.mjs` and its
tests pin.

Keeping the job always-running (for example, emitting a placeholder entry) to get an evaluated
name was considered and rejected: it spends a billed runner minute on every PR in every repo to
fix a label (G9).

## Acceptance criteria

- [ ] Given `.github/workflows/_flow-gates.yml`, when the `source-root` job is parsed, then its
      `name` contains no `${{` expression. A test in `.flow/bin/source-roots-gate.test.mjs` asserts
      this against the real file, and asserts it FAILS against a mutated copy whose name is
      `source-root (${{ matrix.path }})`.
- [ ] Given the same job, when it is parsed, then its `name` is exactly `source-root`, so the
      skipped check reads `flow-gates / source-root`.
- [ ] Given the same job, when it is parsed, then its `needs`, `if` and `strategy` (including
      `fail-fast: false` and the `fromJSON` matrix) are unchanged. The existing tests in
      `source-roots-gate.test.mjs` still pass unmodified.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run on
      this branch, then all pass and coverage is at or above 83.5.
- [ ] Given `changes/flow-0087.md`, when it is read, then it says the check's display name changed
      from `source-root (<path>)` to `source-root`, with matrix values appended when it runs. It
      states the caller action: **no action**, unless the repo made the old check name a required
      status check, in which case it must update that rule to the new name.

## Scope boundaries

**Does not** change `source-roots.mjs`, the plan output, the matrix shape, or the job's `if:`. The
skip is correct; only its label is wrong.

**Does not** rename any other job or touch `project-template/`'s thin `flow-gates.yml` caller. The
job name lives only in the reusable.
