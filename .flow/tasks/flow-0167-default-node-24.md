---
id: "flow-0167"
title: "Move Flow's default Node line from 22 to 24 before 22 reaches end of life, with a one-line way for an adopter to stay on 22"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-10-27"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Runs after flow-0166 (same setup-node lines) and flow-0164 (shares _flow-sync/_flow-done/_flow-gates and project-template/INIT.md). Released by flow-unblock when both are done."
cancelled_reason: ""
blocked_by: ["flow-0166", "flow-0164"]
serves: ["maintenance"]
intent: ""
model: "sonnet"
effort: "medium"
model_reason: "Mechanical edits, but the default changes the runtime of every adopter's gate"
touches:
  - ".github/workflows/_flow-done.yml"
  - ".github/workflows/_flow-gates.yml"
  - ".github/workflows/_flow-kickback.yml"
  - ".github/workflows/_flow-open-pr.yml"
  - ".github/workflows/_flow-queue-runner.yml"
  - ".github/workflows/_flow-recover.yml"
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/_flow-status.yml"
  - ".github/workflows/_flow-sync.yml"
  - ".github/workflows/_flow-unblock.yml"
  - ".github/workflows/ci.yml"
  - ".github/workflows/flow-release-publish.yml"
  - ".github/workflows/plane-guard.yml"
  - ".github/workflows/release-tag.yml"
  - "project-template/.github/workflows/flow-gates.yml"
  - "project-template/INIT.md"
  - "docs/flow-reusable-workflows.md"
  - ".flow/bin/node-line.test.mjs"
  - "changes/flow-0167.md"
labels: [workflows, runtime]
notes:
  - "2026-10-27 (orchestrator): Dan's call, 2026-10-27: move to 24 now, after flow-0166. Node 22 is maintenance-only and reaches end of life 2027-04-30. 24 is LTS to 2028-04; 26 only just entered LTS, so 24 is the settled choice."
---

## Context

Every Flow workflow runs on Node 22: hard-coded `node-version: 22` in the bookkeeping workflows, and
`default: "22"` on the inputs adopters can override (`_flow-gates.yml` `setup_node_version`,
`_flow-review.yml` and `_flow-kickback.yml` `node_version`). No template caller passes a version, so
every adopter's gate, review and kickback run on the default.

Node 22 is maintenance-only and reaches end of life on **2027-04-30**. Node 24 is LTS until April 2028.
flow-0166 adds `check-latest: true` to every setup-node step; this task changes only the line.

## Scope

- Change every `node-version: 22` to `node-version: 24`, and every `default: "22"` to `default: "24"`,
  in the files in `touches`. `flow-watchdog.yml` is excluded because flow-0165 deletes it; if it still
  exists when this runs, leave it alone.
- Keep `check-latest: true` (from flow-0166) on every step.
- `project-template/.github/workflows/flow-gates.yml`'s comment and `project-template/INIT.md` line ~170
  say **Node 24**, and say how to stay on 22: pass `setup_node_version: "22"` (gates) or
  `node_version: "22"` (review, kickback) in the caller.
- `docs/flow-reusable-workflows.md`: the default is 24, plus the same opt-out sentence.
- New `.flow/bin/node-line.test.mjs` (criteria below).
- Changelog fragment `changes/flow-0167.md`: **MINOR**. No caller has to change, so per
  `docs/flow-versioning-policy.md` it is not MAJOR, but every adopter's gate now runs on 24. Caller
  action: **"none required; if your tests fail on Node 24, pass `setup_node_version: \"22\"` in
  flow-gates.yml until fixed (22 is EOL 2027-04-30)"**.

**Deliberately does NOT:**
- Touch `node_version: "22"` inside test fixtures (`sync-customised-caller.test.mjs`,
  `project-template/.flow/bin/flow-sync.test.mjs`). Those are fixture text about a customised caller,
  not Flow's runtime.
- Touch adopter-declared `source_roots` versions (`matrix.version` in `_flow-gates.yml`).
- Add `engines` to `package.json`, or bump `VERSION`/cut the release.

## Acceptance criteria

- [ ] Given every file in `.github/workflows/`, when `node-line.test.mjs` parses them, then every `actions/setup-node` step whose `node-version` is a literal uses `24`, and the test names any that does not.
- [ ] Given `_flow-gates.yml`, `_flow-review.yml` and `_flow-kickback.yml`, when their `workflow_call` inputs are parsed, then `setup_node_version` / `node_version` default to `"24"` (same test).
- [ ] Given `project-template/INIT.md` and `project-template/.github/workflows/flow-gates.yml`, when read, then each names Node 24 as the default and shows how to pin `"22"` (same test).
- [ ] Given the existing tests (`setup-node-check-latest.test.mjs` from flow-0166, `action-pins.test.mjs`, `source-roots-gate.test.mjs`, `flow-sync.test.mjs`, `sync-customised-caller.test.mjs`), when they run, then they pass unchanged.
- [ ] Given `changes/flow-0167.md`, when `.flow/bin/changelog-fragments.test.mjs` runs, then it passes.
- [ ] `npm run build`, `lint`, `test` and `coverage` (floor 83.5) all pass, and this PR's own gate log shows a `node: v24.` line.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

If a canonical test fails only on Node 24 (a real incompatibility, not a pinned "22"), fix it if the
fix is inside `touches`; otherwise block and name the file. Do not stay on 22 to get green.

If another test outside `touches` pins the literal `22`, block rather than widen; the orchestrator
widens `touches` on `main`.
