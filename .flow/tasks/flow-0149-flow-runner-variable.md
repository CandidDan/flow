---
id: "flow-0149"
title: "Every Flow job runs on a runner the repo chooses with one variable (FLOW_RUNNER), defaulting to ubuntu-latest"
status: "done"
priority: 1
project: "flow"
owner: "claude"
created: "2026-10-13"
started: "2026-10-21T00:59:41Z"
branch: "flow/flow-0149-runner-variable"
pr: "https://github.com/CandidDan/flow/pull/215"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G9"]
intent: ""
touches:
  - ".github/workflows/_flow-*.yml"
  - "project-template/.github/workflows/flow-*.yml"
  - ".flow/bin/flow-runner.test.mjs"
  - ".flow/bin/sync-customised-caller.test.mjs"
  - ".flow/bin/caller-pins.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0149.md"
labels: [ci, cost, urgent]
notes:
  - "2026-10-13 (orchestrator): URGENT, labelled by Dan 2026-10-13, so it bypasses queue_cap. Unparked to ready."
  - "2026-10-13 (orchestrator): ORIGIN — Dan, 2026-10-13 (Actions cost review). October is on track for ~$285 against a $200 budget at GitHub's $0.006/min. Hosted alternatives (Ubicloud, Namespace, Blacksmith, Depot) list roughly $0.0015–0.004/min and are mostly a `runs-on:` label change, but all 27 jobs in the 11 `_flow-*.yml` reusables hard-code `runs-on: ubuntu-latest`, so no adopter can switch without forking. Provider choice is Dan's and per repo; this task only makes it possible."
  - "2026-10-13 (orchestrator): DESIGN, decided; mirrors flow-0080's 'timing lives in repo variables'. (1) Each reusable declares `workflow_call.inputs.runner` (string, default `ubuntu-latest`) and every job uses `runs-on: ${{ inputs.runner }}`. (2) Each TEMPLATE caller passes `runner: ${{ vars.FLOW_RUNNER || 'ubuntu-latest' }}`, so a repo switches with `gh variable set FLOW_RUNNER -b <label>`, no file edit, survives sync. (3) Canonical's OWN callers do NOT pass it: canonical is public, and a third-party or self-hosted runner on a public repo runs fork-PR code on someone else's box. A test pins that."
  - "2026-10-13 (orchestrator): SECURITY, state it in the docs, do not try to solve it here: a non-GitHub runner sees every secret its jobs hold (FLOW_PAT in kickback's push job and the queue runner, CLAUDE_CODE_OAUTH_TOKEN). Choosing FLOW_RUNNER is choosing to trust that provider with them. Private repos only."
---

## Context

Flow's reusable workflows hard-code `runs-on: ubuntu-latest` in all 27 jobs. Cheaper hosted
runners are a label change, but an adopter cannot make it without forking every reusable, which
is the drift the governance model exists to prevent.

## Scope

**Does:** add the `runner` input to every `_flow-*.yml` reusable and use it in every job; pass it
from every template caller from `vars.FLOW_RUNNER` with the `ubuntu-latest` fallback; leave
canonical's own callers without it. Add `.flow/bin/flow-runner.test.mjs` pinning all three rules,
with a mutation check each (a hard-coded `runs-on: ubuntu-latest` in a reusable fails naming file
and job; a template caller without the `runner:` line fails; a canonical caller passing it fails).
Document `FLOW_RUNNER` and the security note in `docs/flow-reusable-workflows.md`. Update
`sync-customised-caller.test.mjs` / `caller-pins.test.mjs` only if they actually fail. Changelog
fragment: caller action none (default unchanged), plus the one-line opt-in command.

**Does not touch:** any job's steps, permissions or secrets; canonical's callers; any adopter.

## Acceptance criteria

- [ ] Given every `_flow-*.yml`, then each declares `inputs.runner` defaulting to `ubuntu-latest` and no job's `runs-on` is a literal. Proved by `flow-runner.test.mjs`.
- [ ] Given every template `flow-*.yml` caller that calls a reusable, then it passes `runner: ${{ vars.FLOW_RUNNER || 'ubuntu-latest' }}`. Proved by `flow-runner.test.mjs`.
- [ ] Given canonical's own callers in `.github/workflows/`, then none passes `runner`. Proved by `flow-runner.test.mjs`.
- [ ] Given each rule, a mutated copy that breaks it fails the test naming the file. Proved by `flow-runner.test.mjs`.
- [ ] Given `docs/flow-reusable-workflows.md`, then it documents FLOW_RUNNER, the private-repos-only rule and the secrets note. Proved by `flow-runner.test.mjs` (stable phrase).
- [ ] Given `changes/flow-0149.md`, then it exists and states the caller action. Proved by `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
