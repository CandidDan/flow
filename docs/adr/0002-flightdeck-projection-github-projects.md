# ADR-0002: The flightdeck view — rendered artifact vs GitHub Projects projection

**Status:** Accepted — amended 2026-08-18 (Amendment 1: the primary view becomes a computed page; the Projects projection is deferred)
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

> **Superseded in part by Amendment 1 (2026-08-18).** The primary view is now a computed
> static page and the Project v2 projection is deferred. What survives unchanged: the store's
> primacy, the strictly one-directional rule, and the reasoning below for why a second
> writable surface is forbidden. Read this as the 2026-08-11 decision, then read the amendment.

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

- [x] flow-0004 — canonical adopts Flow on itself. **Blocks the other three**: there is no gate here
      to run them through, and infra currently ships ungated in the repo that defines the gate.
- [ ] flow-0001 — aggregate portfolio state in tested code, sourced only from `flow-state`.
- [ ] flow-0002 — render provenance and disagreement as first-class output.
- [ ] flow-0003 — the Project v2 projection. Auth decided: a separate `FLOW_PROJECT_PAT` scoped to
      `project` only, rather than widening `FLOW_PAT`. Expiry, not compromise, is the failure mode to
      design against; a GitHub App is the deferred long-term answer.
- [ ] Revisit if Flow is ever productised, or if the read-only rule comes under pressure.

*(Amendment 1 revises the four items above — see its own action list.)*

---

# Amendment 1 — the primary view is computed, not projected

**Status:** Accepted
**Date:** 2026-08-18
**Deciders:** Dan (inspirator / sole maintainer)
**Amends:** the Decision, Consequences, and Action Items above. ADR-0001 is still not reopened:
`.flow/tasks/` on `main` remains the store, and the one-directional rule is strengthened, not relaxed.

## What changed since 2026-08-11

Two things the original decision did not have.

**A fourth option exists that the Options section did not consider.** Option C was framed as "build a
dashboard application" — a hosted web app — and rejected on maintenance cost and auth complexity, both
consequences of *hosting*, not of computing the view live. A single self-contained HTML file that
fetches from `api.github.com` in the browser at open time, authenticated by a read-only fine-grained
PAT held client-side, has Option C's freshness with none of its costs: no server, no deployment, no
app to maintain, nothing to keep running. Call it **Option D**. Its rejection reasons do not reach it,
and the productisation clause is not being invoked — this is not Flow becoming a product, it is one
file replacing a render step.

**A requirement arrived that none of A, B or C addresses: automation liveness.** Everything else in
Flow is event-driven, but a scheduled workflow that silently stops running emits no event — GitHub
notifies on failure, never on absence. A Project board is a projection of the *task store*; it has no
way to represent "queue-runner last succeeded nine days ago" or "three PRs merged with no gate run."
That is the question behind *"I'm still lost as to where each project is up to"*, and it is not a
task-board question at all. Option D can answer it because it reads the Actions API alongside the
store. This is the capability that decides the amendment.

Set against that, the case for Option B has weakened on inspection:

- **Its distinguishing advantage is switched off by its own rule.** What a Project offers over a
  rendered view is direct manipulation. The one-directional rule — correctly, and non-negotiably —
  overwrites any human edit on the next sync. What remains is a filterable read-only mirror, bought
  with a GraphQL sync, a second PAT, idempotent reconciliation, archive-on-delete, field-option
  syncing, and a new doctor WARN for when the projection falls behind the store.
- **It trades staleness for synchronisation.** Render lag is removed by adding a sync that can itself
  drift — which is why the projection needs its own drift check. Option D removes render lag by
  construction: there is no second store, so there is nothing to fall behind. The view cannot be
  stale because it does not exist until it is opened.
- **The original text says B beats A only on the second-person requirement** — "it loses only because
  it still produces a rendered view rather than a hosted one, which is the requirement that arrives
  with the second person." That day has not arrived. Option D is not a rendered view either, so it
  wins on the same axis A lost on, without B's machinery.

## Decision

1. **The primary cross-repo view is a computed static page** (`flightdeck/index.html`): one
   self-contained file, fetching live from the GitHub API at open time with a **read-only**
   fine-grained PAT held in memory by default, discovering repos by topic. It replaces
   `flightdeck.html` as the flightdeck. It carries the four per-repo questions — what's moving,
   what's next, what needs me, is the machinery alive — and the automation-liveness matrix.
2. **The page makes no write calls, ever.** The one-directional rule of the original decision applies
   to it in a stronger form: not "writes are overwritten" but "no write scope is held." Acting happens
   in GitHub — label flips, PR reviews — never in the pane.
3. **`flow-0003` (the Project v2 projection) is deferred, not cancelled.** Its trigger is the
   condition its own Context names: the day a non-operator — an employee or a client — needs a board.
   Until then it is infrastructure for a user who does not exist. Its auth decision stands for
   whenever it is built: a separate `FLOW_PROJECT_PAT` scoped to `project` only, never widening
   `FLOW_PAT`.
4. **`flow-0001` is rescoped, not cancelled.** Its thesis — aggregation belongs in tested code, not in
   a prompt — is the reason this amendment is safe. The page's fetch, frontmatter parsing, row
   derivation and liveness rules live in `flightdeck/bin/*.mjs` with proving tests; the HTML file is a
   thin render shell over them. Logic inside a `<script>` block is the original complaint wearing a
   new medium.
5. **`flow-0002` is superseded, and its principle is inherited.** There is no render step left to
   disclose provenance for, but the page has its own uncertainty — a repo whose fetch failed, a
   truncated result, an unreachable API, the writeback lag that survives untouched. Every one of those
   is shown explicitly. A repo that cannot be read is rendered as `unavailable` with the reason and is
   **never silently omitted**. "Trust is a function of calibrated uncertainty" is the load-bearing
   sentence of the original ADR and it transfers intact.
6. **`board.html` is untouched.** It was never in this ADR's scope and is not migrating anywhere; it
   remains the per-repo glance surface. (Recorded because a downstream planning document assumed the
   opposite and derived work from it.)

## Consequences

- **The offline view is lost.** The original decision kept `flightdeck.html` because it works with no
  network and no GitHub; a computed page does neither. Accepted: the store is local files, so
  `flow-state.mjs --json` remains a working offline read at the CLI, which is the honest floor. If an
  offline *portfolio* view is ever wanted back, that is Option A, still on the shelf.
- **The three lags resolve differently.** Source lag: gone — the page reads `origin` through the API,
  never a local clone. Render lag: gone by construction. Writeback lag: unchanged, and therefore must
  be disclosed rather than smoothed over.
- **A human-held PAT is now on the critical path of the primary view.** Option B's token lived in
  Actions; this one lives with a person, per device, and expires. That is a real cost B did not have,
  and the mitigation is only that the token is read-only, so its worst failure is a blank pane rather
  than a corrupted store. "Remember on this device" is opt-in with the trade-off stated; memory-only
  is the default.
- **Rate limits become a view-quality concern** rather than a non-issue. The load budget is documented
  and batched; exceeding it must truncate visibly, per the disclosure rule above.
- **The vision layer's visibility moves with it.** The proposed `Serves` field, goal-as-Project-items,
  the per-goal `Reading` field and the projection sync that would have kept their options aligned with
  `VISION.md` are not built. The page's vision drawer carries them instead — purpose, per-goal
  compass reading and activity line, non-goals, change log — and it preserves the property the goal
  items existed for: because the drawer iterates `VISION.md` rather than the task list, a goal nothing
  serves still gets a row and shows its silence. Absence stays visible without items to maintain.
- **Reversibility is retained on both sides.** `flow-0003` is fully specified and parked; the page is
  one file that can be deleted. Neither forecloses the other.

### Tripwires

- **If the page grows a write affordance** — approving, editing, dragging, anything with a token that
  can mutate — it has become Option C proper, with the maintenance commitment and the auth surface
  this ADR rejected. Amendment void; reopen the choice.
- **If its logic migrates back inline**, untested, `flow-0001`'s original finding has recurred and the
  view becomes untrustworthy for exactly the reason the flightdeck was untrustworthy before.
- **If a second person needs a board**, the deferral in decision 3 has expired. Build `flow-0003`;
  do not stretch the page to serve people who should not need a PAT.
- The original tripwire stands unchanged: **if the one-directional rule ever comes under pressure**,
  Option A is the answer, not a writable board.

## Action Items

- [x] flow-0004 — canonical adopts Flow on itself.
- [ ] flow-0001 — **rescoped**: the tested state/derivation/liveness module the page renders from.
- [ ] flow-0002 — **superseded**; its disclosure principle folded into the page (decision 5).
- [ ] flow-0003 — **deferred** pending the second-person trigger; auth decision preserved.
- [ ] New: the mission-control page and the liveness watchdog, sharing one implementation of the
      liveness rules — not a mirrored spec, which would drift in the one component whose job is
      detecting drift.
- [ ] Revisit if Flow is ever productised, if the one-directional rule comes under pressure, or on
      any tripwire above.
