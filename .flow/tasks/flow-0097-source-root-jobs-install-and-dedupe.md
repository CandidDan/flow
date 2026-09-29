---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0097"
title: "source-root jobs install the repo's dependencies before a node check, and a check the primary gate already runs is not run twice"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-worker-flow-0097"
created: "2026-09-29"
started: "2026-09-29T07:22:38Z"
branch: "flow/flow-0097-source-root-install-and-dedupe"
pr: "https://github.com/CandidDan/flow/pull/128"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - ".github/workflows/_flow-gates.yml"
  - "project-template/.flow/bin/source-roots.mjs"
  - "project-template/.flow/bin/source-roots.test.mjs"
  - ".flow/bin/source-roots-gate.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0097.md"
labels: [flow-gates, source-roots, flow-infra]
notes:
  - "2026-09-29 (orchestrator): EVIDENCE, two repos. progress: `source-root (app/)` failed with missing type declarations and `source-root (supabase/)` with exit 127 (deno not found); worked around per repo in progress PR 106 by putting installs into each check. write (sync PR 102): `source-root (src/ | scripts/ | e2e/)` all exit 127 running `npm run lint`, because the job sets up Node but never runs `npm ci`, so eslint is not on the path. Any Node repo with an extra source_root now fails every PR. Fix it once in canonical instead of in every repo's config."
  - "2026-09-29 (orchestrator): SECOND HALF, same evidence: write's `commands.lint` is `npm run lint && npm run typecheck`, and each source_root check is `npm run lint`. The planner only excludes a check that EXACTLY equals a primary command, so three jobs re-run a command the gate job already ran over the whole repo. Treat a check as covered when it equals one `&&`-separated segment of a primary command. Conservative on purpose: exact segment match only, no parsing of `;`, `||`, pipes or subshells."
---

## Context

flow-0077 added `source-roots-plan` + a `source-root` matrix to `_flow-gates.yml`. For `runtime:
node` a matrix job runs `actions/setup-node` and then the declared `check`, with no install step.
The schema's comment says a check provisions its own toolchain, which is true for `runtime: none`
but surprising for `node`, where the repo has already declared `commands.install`. flow-0094 now
runs `source-roots.mjs` from canonical at the workflow's commit (ADR-0008); build on that.

## Scope

**Does:**

- In the `source-root` job, for `runtime: node` only, run the repo's `commands.install` (read by the
  helper from `.flow/config.yml`, passed to the shell through `env:`, never `${{ }}`-interpolated)
  in the repo root before the check. Skip it when `commands.install` is absent or a placeholder.
  `runtime: deno` and `runtime: none` are unchanged.
- In `planSourceRoots`, exclude an entry as "covered by the primary gate" when its `check` equals
  a whole primary command (today) OR equals one segment of a primary command split on `&&`
  (trimmed). Nothing else counts as a match.
- Docs: `runtime: node` installs with `commands.install`; `none` still means "the check provisions
  itself"; the segment rule, with write's config as the example.
- Changelog fragment `changes/flow-0097.md`. **Caller action:** none required. Repos that worked
  around this by putting installs into their checks (progress) may simplify them.

**Does not touch:** the deno path, retry semantics, flow-doctor's source-tree rule.

## Acceptance criteria

- [ ] Given primary lint `npm run lint && npm run typecheck` and a root whose check is
      `npm run lint`, then the planner excludes it as covered by the primary gate.
- [ ] Given a root whose check is `npm run lint:e2e` against the same primary, then it is NOT
      excluded (no substring or prefix matching).
- [ ] Given a primary `a; b` or `a || b`, then neither `a` nor `b` alone counts as covered.
- [ ] Structure test: in the `source-root` job, a step guarded by `matrix.runtime == 'node'` runs
      the install command before "Run the declared check", and the command reaches the shell via
      `env:`.
- [ ] Given `commands.install` absent or `REPLACE-ME`, then the install step is skipped and the
      check still runs.
- [ ] Given a scratch repo like write (lint via eslint from devDependencies), the node install
      path makes `npm run lint` resolvable (test the helper/plan output that feeds the step; a full
      workflow run is not required).
- [ ] `docs/flow-reusable-workflows.md` documents both rules; `changes/flow-0097.md` exists.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
