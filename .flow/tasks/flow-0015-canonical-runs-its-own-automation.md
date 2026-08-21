---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0015"
title: "Make canonical run the automation it ships, so the repo defining the protocol isn't the one exempt from it"
status: "in_review"
priority: 2
project: "flow"
owner: "flow/flow-0015-canonical-runs-its-own-automation"
created: "2026-08-18"
started: "2026-08-21T15:52:37Z"
branch: "flow/flow-0015-canonical-runs-its-own-automation"
pr: "https://github.com/CandidDan/flow/pull/24"
issue: ""
blocked_reason: ""
serves: ["G4"]            # what canonical says is what the fleet runs — starting with canonical
touches: [".github/workflows/flow-open-pr.yml", ".github/workflows/flow-recover.yml", ".github/workflows/flow-triage.yml", ".github/workflows/flow-review.yml", ".github/workflows/flow-queue-runner.yml", ".flow/bin/flow-state.mjs", ".flow/bin/adapters.test.mjs", "project-template/.flow/bin/flow-state.mjs", "project-template/.flow/bin/flow-state.test.mjs"]
labels: [infra, dogfood, integrity]
notes:
  - "2026-08-18: two independent findings, one root cause. Canonical publishes nine reusables and wires three. And PR #13 found canonical has no flow-state.mjs adapter, so the flightdeck cannot read the repo that authors it. Both trace to flow-0004 scoping adoption to what CI already invoked."
  - "2026-08-21: WORKER-INITIATED touches widening, NEEDS RATIFICATION. Added project-template/.flow/bin/flow-state.mjs and its test. The declared radius cannot deliver a thin adapter: unlike flow-doctor (runDoctor), touches-guard (runGuard) and release-guard (runReleaseGuard), the template's flow-state.mjs exports ONLY its pure core — readTasksFromOrigin, readPrs and the CLI render loop are module-private. Staying inside the declared touches would mean copying ~95 lines of git/gh plumbing into the adapter, which is the one thing CLAUDE.md forbids for this directory and the flow-0008 hazard in miniature (flightdeck's contract depends on the exact 'WORKING TREE' source string, so two implementations that drift break the aggregator silently). The widening is pure code motion plus new exports in the template; no template behaviour changes, and the template CLI keeps resolving its own repo root. Scope says 'does NOT change project-template/' on the grounds that the template already ships all nine WORKFLOWS — that reasoning is about .github/workflows/, not about .flow/bin/."
  - "2026-08-18: queue-runner is deliberately wired dispatch-only, no cron. Not a permissions argument — flow-triage holds the same contents: write. See Scope."
---

## Context

Canonical publishes nine reusable workflows and calls three of them: `flow-gates`, `flow-status`,
`flow-done`. It adopted the **enforcement** half and never wired the **automation** half. So the
repo that authors Flow cannot dispatch a worker at itself, cannot triage its own issue inbox,
cannot auto-open a PR when a worker stalls before opening one, has no recovery path, and runs no
out-of-session review. Every consuming repo gets all five.

This is not a cosmetic asymmetry. It means canonical's own workflows are exercised only in *other
people's repos*, which is precisely backwards for the repo that defines them — a bug in
`_flow-open-pr.yml` is discovered downstream, after the ref has been pinned. It also means the
protocol's own claims about itself are untested here: the `flow-open-pr` workflow exists because a
worker once did the whole job and ended its turn without opening the PR, and canonical currently
has no protection against that failure at all.

A second finding with the same root: PR #13 smoke-tested the flightdeck aggregator against
canonical and got `unavailable — no .flow/bin/flow-state.mjs`. `flow-0004` created the four
adapters the reusable workflows invoke; nothing in CI invokes `flow-state`, so it was never added.
The flightdeck cannot read the repo that authors the flightdeck.

Both are the same mistake: adoption scoped to "what CI already calls" rather than "what this repo
would need to actually run the protocol."

## Scope

**Does:**

- Add canonical's five missing thin callers under `.github/workflows/`, each modelled on the
  matching file in `project-template/.github/workflows/` and pinned to `@main` rather than `@v1`,
  consistent with canonical's existing three callers and for the reason recorded in
  `flow-gates.yml`'s header comment (canonical gates against the reusables as they are now, not as
  they were at the last release):
  - `flow-open-pr.yml`
  - `flow-recover.yml`
  - `flow-triage.yml`
  - `flow-review.yml`
  - `flow-queue-runner.yml` — **`workflow_dispatch` only; no `schedule:` block.**
- Add `.flow/bin/flow-state.mjs` as a thin adapter over
  `project-template/.flow/bin/flow-state.mjs`, in the same shape as the four adapters already in
  that directory: import the template's exported logic, supply only the CLI shell and canonical's
  own store location resolved from *this* file's realpath. Not a copy, not a symlink — a symlink
  resolves to the template's fixture store and every command still exits 0.
- Extend `.flow/bin/adapters.test.mjs` to cover the new adapter alongside the existing ones.

**Why queue-runner ships without a cron.** Not a permissions argument — `flow-triage` holds the
same `contents: write` on `main`, and both are bounded by the same human merge touchpoint. The
reason is cadence: canonical's store is being actively restructured by hand right now (the vision
layer, the ADR-0002 amendment, tasks being blocked and rescoped), and an unattended dispatcher
claiming tasks against a queue that is moving under it produces exactly the wasted-worker-run
failure `flow-0010` was written about. Adding the cron later is one line, and it should be a
deliberate act once the queue is stable.

**Deliberately does NOT:**

- **Add `flow-sync.yml`.** Canonical is the source. `flow-sync.mjs` refuses to sync backwards and
  returns `ahead` for a repo newer than canonical, so a self-sync is meaningless. Record that as a
  one-line comment where a reader would otherwise wonder why eight of nine are wired.
- **Change any reusable.** `_flow-review.yml` is claimed by `flow-0007` and `_flow-gates.yml` by
  `flow-0008`. This task adds *callers* only. A caller and its reusable are separate files by
  design — that is what makes this parallel-safe with both.
- **Enable anything.** All five reusables gate their job on `vars.FLOW_AI == 'true'` where they
  use an agent; wiring the caller does not turn anything on. Setting the variable and adding
  `CLAUDE_CODE_OAUTH_TOKEN` stays a human-only step.
- **Change `project-template/`.** The template already ships all nine.

## Acceptance criteria

- [ ] Given `.github/workflows/`, when it is listed after this change, then a caller exists for
      every reusable except `_flow-sync.yml`, and a comment in the directory or in one caller
      records why `flow-sync` is deliberately absent.
- [ ] Given each new caller, when it is parsed, then it references
      `CandidDan/flow/.github/workflows/_flow-<name>.yml@main`, declares job-level permissions
      matching what its reusable requires (including `id-token: write` wherever the reusable runs
      `claude-code-action`), and passes `secrets: inherit`.
- [ ] Given `.github/workflows/flow-queue-runner.yml`, when it is parsed, then it declares
      `workflow_dispatch` and **no** `schedule` key — the absence is asserted, not merely omitted.
- [ ] Given the repo after this change, when `npm run build` runs, then it passes — canonical's
      build parses every workflow file, and five new ones must not break the fleet's authority on
      what a valid workflow looks like.
- [ ] Given `node .flow/bin/flow-state.mjs --json` run in canonical, when it completes, then it
      emits canonical's own tasks resolved from `origin/main`, and the ids it reports match the
      files in canonical's `.flow/tasks/` — not the template's fixture store.
- [ ] Given `flightdeck/bin/flightdeck-state.mjs` run against a registry containing canonical,
      when it completes, then canonical resolves with `status: "ok"` rather than `unavailable` —
      the finding from PR #13 is closed by a test that would have caught it.
- [ ] Given `.flow/bin/adapters.test.mjs`, when it runs, then it asserts the new adapter resolves
      canonical's store and not the template's, matching how it covers the existing four.
- [ ] Given the repo after this change, when `npm test`, `npm run lint` and `npm run coverage`
      run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **The `@main` pin is not an oversight to fix.** Canonical's existing callers use `@main`
  deliberately — `flow-gates.yml`'s header explains it: pinning canonical to the last release
  would gate its PRs against a version of itself it has already moved past. Match that, and do not
  "correct" it to `@v1`.
- **Security review should look at this specifically:** wiring `flow-triage` and `flow-review` in
  canonical means an agent session with `contents: write` and `issues: write` on the repo whose
  reusables every other repo executes. The mitigations are the gate and the human merge, the same
  as anywhere — but this is the one repo where a bad merge reaches the whole fleet at whatever ref
  they pinned, so it deserves a look rather than an assumption.
- Once this lands, canonical stops being the exception to `G4` and the mission-control page's
  drift cell has something honest to report about canonical itself.
