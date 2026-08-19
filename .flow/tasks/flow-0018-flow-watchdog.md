---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0018"
title: "Turn silent automation death into an issue that finds the human, because a dead scheduler emits no event"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-08-19"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G5"]            # whether the machinery is alive — the half a pane can't cover
touches: ["flightdeck/bin/watchdog.mjs", "flightdeck/bin/watchdog.test.mjs", ".github/workflows/flow-watchdog.yml"]
labels: [flightdeck, infra, integrity]
notes:
  - "2026-08-19: deliverable D13 of handoff addendum 2. Imports the liveness rules from flightdeck/bin/liveness.mjs, which flow-0017 creates — sequence 0017 -> 0018. Importing is not touching, so the touches stay disjoint, but this cannot start until 0017 lands."
  - "2026-08-19: canonical-only. NOT a reusable with a template caller — one watchdog, one schedule, one place. Recorded in Scope so nobody 'fixes' the missing pair."
---

## Context

`flow-0017` answers "is the machinery alive?" when the human looks at it. This covers when they
don't.

The asymmetry is the whole point. GitHub notifies on **failure**; it has no notion of **absence**.
A scheduled workflow that quietly stops running — disabled, or silently never firing — produces no
event, fails no check, and turns nothing red. It is discovered when someone eventually wonders why
nothing has moved. Every other part of Flow can be event-driven; this one thing cannot, so it
needs an active check. This is the single legitimate polling loop in the system, and confining it
here is what keeps that true.

The output deliberately reuses machinery that already reaches the human rather than inventing a
notification channel: an issue in the affected repo lands in the capture inbox, counts as queue
debt, appears in mission control's "what needs me" cell, and pushes a phone notification through
GitHub's own subscription. **The inbox is the pager.**

## Scope

**Does:**

- Add `flightdeck/bin/watchdog.mjs`, importing the liveness rules from
  `flightdeck/bin/liveness.mjs` (flow-0017) rather than restating them. One implementation, two
  consumers — a mirrored spec would drift, in the one component whose entire job is detecting
  drift.
- Add `.github/workflows/flow-watchdog.yml`, a scheduled workflow in **canonical only**, running
  the same rules across every `flow`-topic repo.
- On a **new** red, file an issue **in the affected repo**, labelled `automation-down`, naming the
  workflow, its last success, and which rule fired. Create the label idempotently first, so a
  first run on a fresh repo cannot fail on a missing label.
- **At most one open issue per workflow per repo.** Re-detection comments on the existing issue
  rather than filing again.
- When the workflow goes green again, **close the issue automatically** with a comment linking the
  recovery run. A stale "down" alert is its own staleness bug, which is the failure this whole
  layer exists to prevent.
- Permissions: `issues: write` on the target repos, read everywhere else. Nothing more, and the
  permission block is the mechanical proof of that boundary.

**This is canonical-only, and deliberately not a reusable.** There is exactly one watchdog with
one schedule watching the whole fleet; shipping a per-repo caller would give every repo its own
watchdog watching itself, which is both wasteful and circular. There is no
`_flow-watchdog.yml` and no `project-template/.github/workflows/flow-watchdog.yml`, and that
asymmetry with the other nine workflows is intentional — say so in a comment in the file.

**Deliberately does NOT:**

- **Restate the liveness rules.** If `liveness.mjs` does not export what is needed, extend it in a
  follow-up rather than forking the logic here.
- **Fix anything it finds.** It files, comments and closes. It does not re-run workflows, re-enable
  disabled ones, or open PRs.
- **Watch anything but workflow liveness.** Blocked tasks, compass findings and review queues
  already reach the human through their own paths; duplicating them here would make the
  `automation-down` label meaningless.

## Acceptance criteria

- [ ] Given a repo whose `queue-runner` has been disabled, when the watchdog runs, then an issue
      labelled `automation-down` exists in **that** repo naming the workflow, its last successful
      run, and the rule that fired.
- [ ] Given that same repo on a second and third watchdog run with the workflow still down, when
      each completes, then exactly **one** open `automation-down` issue exists for that workflow,
      and re-detection appears as a comment.
- [ ] Given a repo where the workflow has since run successfully, when the watchdog runs, then the
      open issue is closed with a comment linking the recovery run.
- [ ] Given a repo with no `automation-down` label, when the watchdog runs and needs to file, then
      the label is created first and the filing succeeds.
- [ ] Given two different workflows down in the same repo, when the watchdog runs, then two
      separate issues exist — one per workflow, not one aggregate.
- [ ] Given `.github/workflows/flow-watchdog.yml`, when its `permissions:` block is parsed, then
      it grants `issues: write` and no other write scope, and a test fails if `contents` is ever
      raised to `write`.
- [ ] Given `watchdog.mjs`, when a test scans its imports, then the liveness rules come from
      `liveness.mjs` and are not reimplemented locally.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Who watches the watchdog is minimised, not solved.** It is the one scheduled thing whose own
  death is silent. Two grounds for accepting that: it lives in canonical, the repo the operator
  touches most, and mission control renders canonical's own row — so the pane opened when lost is
  the pane that reveals a dead watchdog. Record this in the ADR consequences rather than leaving
  it as an unstated assumption.
- Cadence versus detection latency is a real trade-off: the rule is "older than ~2× its interval",
  so against a weekly compass a death is only red after a fortnight. Correct by the rule, and
  worth stating in the workflow's comments so it is not later read as a bug.
- Cross-repo issue filing needs a token with `issues: write` on the target repos, which the default
  `GITHUB_TOKEN` does not have — it is scoped to canonical. Resolve which credential this uses
  before building; if it needs a new secret, that is a human-only setup step and belongs in the PR
  description, not invented silently.
