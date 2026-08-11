# ADR-0002: The flightdeck view — rendered artifact vs GitHub Projects projection

**Status:** Accepted
**Date:** 2026-08-11
**Deciders:** Dan (inspirator / sole maintainer)

## Context

The flightdeck is not trusted. Its owner sanity-checks each project directly before acting on
anything it reports, which costs the attention the flightdeck exists to save. This ADR decides what
the *view* should be. It does **not** reopen ADR-0001: `.flow/tasks/` files on `main` remain the
store, for all the reasons recorded there.

The distrust is not caused by missing features. It is caused by three lags that compound and are
never disclosed in the output:

- **Source lag.** The digest reads a mounted local clone, refreshed when a `flow-fetch` launchd agent
  runs on the human's machine. Cloud workers merge to `origin`; the clone learns later.
- **Render lag.** `flightdeck.html` is a snapshot an agent writes when asked. It is stale one second
  later, permanently, by construction.
- **Writeback lag.** Task state is updated by PR events, so there is a genuine window in which the
  store and the PR disagree.

The decisive property is not the size of any lag but that **none of them are visible**. An unmarked
snapshot that is usually correct is more corrosive to trust than a view that says "as of 14 minutes
ago, 2 disagreements": the first makes you verify everything, the second makes you verify two things.
Trust is a function of calibrated uncertainty, not of accuracy.

### Forces at play

- **Aggregation currently lives in a prompt.** `portfolio-manager.md` instructs an agent to parse
  frontmatter and roll it up. Deterministic data transforms expressed as prose cannot be unit-tested,
  so errors in them are invisible until a human notices a wrong number.
- **`flow-state.mjs` already exists** (v1.1.0) and solves the per-project half correctly — reading
  `origin/main` and reconciling against PR reality. It was written five weeks before this ADR and sat
  uncommitted, which is itself evidence that the loop was not being closed.
- **Other humans are coming.** A files-only store rendered by an agent will not survive employees or
  clients. They will not run a digest to learn what is happening; they want a URL that is right.
- **Drift is Flow's known failure mode.** The infra-propagation work exists because copies drift.
  Any second surface must be structurally prevented from drifting, not asked nicely.

## Decision

**Adopt Option B: a GitHub Project v2 board as a projection of the store, written only by CI, with
files remaining the source of truth.** Alongside it, move flightdeck aggregation and rendering out of
the agent prompt into tested code (`flightdeck-state.mjs`, `render-flightdeck.mjs`), and make
provenance and store-vs-PR disagreement first-class in the output.

The projection is **strictly one-directional**. Human edits in the Project UI are overwritten by the
next sync. This is enforced structurally — the sync is a full reconciliation against the store, not a
diff — because a convention here would rot, and a bidirectional board would recreate exactly the
drift problem ADR-0001 and the propagation plan were written to eliminate.

## Options Considered

### Option A: Central push-based state repo

Each repo's existing `flow-status`/`flow-done` workflows append a state record to one shared
`flow-state` repo; the flightdeck reads that single source. Latency drops to seconds. No new tool, no
new surface, nothing that can disagree.

Rejected as the primary answer, not on merit — it is the *correct* choice for a permanently solo
operator, and remains the fallback if the read-only rule below cannot be held. It loses only because
it still produces a rendered view rather than a hosted one, which is the requirement that arrives
with the second person.

### Option B: GitHub Project v2 as a CI-written projection  ← chosen

Hosted, live, free, filterable, mobile app, no render step, no maintenance. Files stay the store, so
ADR-0001 is untouched. The board is a mirror with a stated rule.

Costs: a second surface that *can* disagree (mitigated structurally, above); Project v2 is
GraphQL-only, so the sync is more code than a REST equivalent would be; and writes need a token with
`project` scope, which `FLOW_PAT` deliberately does not have — an unresolved auth decision that
flow-0003 is instructed to block on rather than guess.

### Option C: Build a dashboard application

A small web app reading the GitHub API live. Total control of the view, genuinely realtime.

Rejected. It is a permanent maintenance commitment that competes directly with the product work it
exists to make visible, and it solves a presentation problem that a hosted board already solves for
free. It would only be justified if Flow itself were being productised — and if that day comes, this
ADR should be revisited rather than assumed.

## Trade-off Analysis

| | A: central state repo | B: Projects projection | C: build a dashboard |
|---|---|---|---|
| Latency | seconds | seconds | seconds |
| New surface that can drift | none | one (mitigated) | one |
| Maintenance cost | near zero | low (one sync workflow) | ongoing, forever |
| Usable by a non-operator | no (still rendered) | yes (URL + mobile) | yes |
| Auth complexity | none (existing tokens) | needs `project` scope | needs a hosted app |
| Reversible | yes | yes — stop syncing, delete the board | no, sunk cost |

## Consequences

- The rendered `flightdeck.html` becomes the **offline** view rather than the primary one. Worth
  keeping — it works with no network and no GitHub — but features are not built into both.
- Anyone joining gets a board that is live and correct without learning Flow's internals. The store's
  discipline is preserved because they cannot write to it through the board.
- **The read-only rule is load-bearing.** If it is ever relaxed to "let people drag cards", this ADR
  is void and Option A should be adopted instead. That is the tripwire to watch for.
- Flow gains a dependency on GitHub Projects availability for its primary view. Acceptable: the store
  is still local files in git, so an outage degrades visibility, never the work itself.
- **A gap this surfaced:** Flow tasks have no dependency field, so flow-0002's dependency on
  flow-0001 is expressed as a sentence a human must read. That is fine at three tasks and will not be
  at thirty. Worth its own ADR before it bites.

## Action Items

- [ ] flow-0004 — canonical adopts Flow on itself. **Blocks the other three**: there is no gate here
      to run them through, and infra currently ships ungated in the repo that defines the gate.
- [ ] flow-0001 — aggregate portfolio state in tested code, sourced only from `flow-state`.
- [ ] flow-0002 — render provenance and disagreement as first-class output.
- [ ] flow-0003 — the Project v2 projection. Auth decided: a separate `FLOW_PROJECT_PAT` scoped to
      `project` only, rather than widening `FLOW_PAT`. Expiry, not compromise, is the failure mode to
      design against; a GitHub App is the deferred long-term answer.
- [ ] Revisit if Flow is ever productised, or if the read-only rule comes under pressure.
