---
id: "flow-0166"
title: "Every setup-node step resolves the latest patch of its line, so a Node security release reaches the fleet the day it ships, not when the runner image refreshes"
status: "blocked"
priority: 1
project: "flow"
owner: "claude"
created: "2026-10-27"
started: "2026-10-27T04:29:06Z"
branch: "flow/flow-0166-setup-node-check-latest"
pr: ""
issue: ""
blocked_reason: "flow-0166 test fails on flow-watchdog.yml (unfixed setup-node, outside touches; flow-0165 deletes it). Decision: land after flow-0165, or add flow-watchdog.yml to touches. Branch flow/flow-0166-setup-node-check-latest is pushed with all else done; next: rebase after 0165 merges, rerun gate, open PR."
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
model: "sonnet"
effort: "low"
model_reason: "One mechanical line across reusable workflows, plus one parse test"
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
  - ".flow/bin/setup-node-check-latest.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0166.md"
labels: [security, workflows]
notes:
  - "2026-10-27 (orchestrator): Node's 2026-10-21 security release (10 CVEs; headline CVE-2026-111497, an out-of-bounds write in the bundled Brotli decoder, rated high; also TLS hostname-check bypasses CVE-2026-106069 / CVE-2026-105483) is fixed in 22.23.4 / 24.22.1 / 26.12.1. Six days later, flow-gates run on 2026-10-27T03:14Z logged 'Found in cache @ /opt/hostedtoolcache/node/22.23.3' — the vulnerable build. Cause: setup-node with `node-version: 22` and the default `check-latest: false` takes the runner image's cached 22.x."
---

## Context

Every Flow workflow installs Node with `actions/setup-node`, asking for a major line
(`node-version: 22`, or the `setup_node_version` / `node_version` inputs, default `"22"`). With
setup-node's default `check-latest: false`, a cached version on the runner image that satisfies the
range wins, so the fleet runs whatever patch GitHub last baked into the image. On 2026-10-27 that was
**22.23.3**, six days after **22.23.4** fixed a Brotli out-of-bounds write and two TLS
hostname-check bypasses.

Flow's own helpers do not call `fetch()` or `node:zlib`. Exposure comes from what else runs on that
Node: adopter test suites in the gate, `npm ci`, and anything a worker or reviewer session fetches.
That is low but real, and the fix is one line per step.

## Scope

- Add `check-latest: true` to the `with:` block of **every** `actions/setup-node` step in the files in
  `touches` (28 steps in canonical today, `flow-watchdog.yml` excluded: flow-0165 deletes it). Each
  file gets **one** comment at its first setup-node step: why (the cached-patch problem, naming this
  task), not a comment per step.
- Do **not** change any `node-version` value or input default. `"22"` stays `"22"`; adopters who pass
  an exact version still get exactly that.
- New `.flow/bin/setup-node-check-latest.test.mjs`: parse every file in `.github/workflows/` and fail,
  naming file and step, on any `actions/setup-node` step without `check-latest: true`. The test must
  fail on an empty set (no setup-node steps found means the parse broke, not a pass).
- One sentence in `docs/flow-reusable-workflows.md` where Node setup is described.
- Changelog fragment `changes/flow-0166.md`: **PATCH**, **no caller action** (callers are unchanged;
  the reusables they pin pick it up at the next release), and name CVE-2026-111497 as the reason.

**Deliberately does NOT:**
- Touch `flow-watchdog.yml` (deleted by flow-0165) or anything under `project-template/`
  (no template caller runs setup-node).
- Raise the default line from 22 to 24. Separate decision.
- Bump `VERSION` or cut the release. That is the release PR after this merges; it should follow
  promptly, since nothing reaches adopters until it does.

## Acceptance criteria

- [ ] Given every file in `.github/workflows/`, when `setup-node-check-latest.test.mjs` parses them, then every `actions/setup-node` step has `check-latest: true`, and the test names any step that does not.
- [ ] Given a workflow copy with `check-latest` removed from one setup-node step, when the check runs on it, then it fails naming that file and step.
- [ ] Given a directory with no setup-node steps, when the check runs on it, then it fails rather than passing empty.
- [ ] Given the existing workflow tests (`action-pins.test.mjs`, `release-guard.test.mjs`, `source-roots-gate.test.mjs`), when they run, then they pass unchanged.
- [ ] Given `changes/flow-0166.md`, when `.flow/bin/changelog-fragments.test.mjs` runs, then it passes.
- [ ] `npm run build`, `lint`, `test` and `coverage` (floor 83.5) all pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

Overlap check against live tasks: flow-0164 touches `_flow-sync.yml`, `_flow-done.yml` and
`_flow-gates.yml` too (comment and retired-paths edits, different lines). Not parallel-safe by the
`touches` rule. This task is p1 and small: it goes first, and flow-0164 rebases onto it.

PR evidence: paste the `Found in cache` / `Attempting to download` line from this PR's own gate run,
showing it resolved 22.23.4 or later.
