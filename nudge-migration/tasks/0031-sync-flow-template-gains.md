---
id: "CAN-31"
title: "Sync Flow template hardening into Nudge (touches-guard, Node-22 pins, lockfile note)"
status: "ready"
priority: 3
project: "nudge"
owner: ""
created: "2026-06-09"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
touches: [".flow/bin/touches-guard.mjs", ".flow/bin/touches-guard.test.mjs", ".github/workflows/flow-gates.yml", ".flow/config.yml"]
labels: [chore, flow-infra, flow-dogfood]
notes:
  - "2026-06-09 Nudge was retrofitted before this session hardened the Flow template. CAN-30's run surfaced gaps the template has since fixed; this back-syncs them. Flow improving Flow."
---

## Context

Nudge was retrofitted from the Flow template, then CAN-30 (the first real task) flushed out
several rough edges that were fixed **in the template afterwards** — so Nudge is now running a
slightly older Flow than the canonical template. The canonical, validated versions live in the
sibling repo at `~/Projects/flow/project-template/`. This task brings Nudge level. The most
important addition is the **touches-guard**, which would have caught CAN-30's own scope drift
(it modified `app/scripts/generate-state.mjs` while the task hadn't declared it).

## Scope

Bring these specific improvements over from `~/Projects/flow/project-template/`:

- **touches-guard** — copy `.flow/bin/touches-guard.mjs` and `.flow/bin/touches-guard.test.mjs`
  in verbatim, and add the `touches` job to `.github/workflows/flow-gates.yml` (the job that runs
  `node .flow/bin/touches-guard.mjs` on a `flow/<id>` PR and fails if the diff strays outside the
  task's declared `touches`). Copy the job definition from the template's `flow-gates.yml`.
- **Node-22 pins** — ensure every `actions/setup-node@v4` in `.github/workflows/flow-*.yml` pins
  `node-version: 22` (the coverage flags require it; confirm none are still on 20).
- **config lockfile note** — add the template's `.flow/config.yml` comment about generating the
  lockfile on the CI platform / running the strict install once before committing (so the
  `@emnapi` cross-platform drift that cost CAN-30 a detour is documented for next time).

Does **not** change any application code, the existing gate commands, or `.flow/tasks/`. This is
Flow-tooling sync only.

## Acceptance criteria

- [ ] Given the repo, when `.flow/bin/` is listed, then `touches-guard.mjs` and `touches-guard.test.mjs` are present and identical to the template's versions.
- [ ] Given `node --test .flow/bin/*.test.mjs`, when run, then all tooling tests pass (touches-guard + apply-board-edits + flow-doctor).
- [ ] Given `.github/workflows/flow-gates.yml`, when inspected, then it contains a `touches` job invoking `node .flow/bin/touches-guard.mjs`, and every `setup-node` pins `node-version: 22`.
- [ ] Given this PR (which touches `app/scripts/...`? no — only the declared paths), when the gate runs, then the new touches-guard job passes against this task's own `touches` (a live self-test of the guard it installs).
- [ ] Given `.flow/config.yml`, when inspected, then the lockfile-platform note is present.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

The touches-guard tests are the proving tests for the guard itself (this task is tooling, so the
"proving test per criterion" is the committed `node --test` suite, not app unit tests — flag that
in the PR so qa-verifier reads it correctly). The canonical source is
`~/Projects/flow/project-template/`; if that path isn't available in the worker's environment,
block and surface rather than reconstructing the files from memory.
