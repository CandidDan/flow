# Mission control rebuild — decomposition

**Status:** Proposed · **Date:** 2026-09-15 · **Decider:** Dan
**Decided by:** [ADR-0006](adr/0006-mission-control-own-repo.md) · **Supersedes:** the phasing agreed in conversation on 2026-09-03, which predates the backend decision

## Problem (one line)

ADR-0006 merged on 2026-09-08 and decided *where mission control lives and how it is served*; it
deliberately did not decide how the work is broken up — so twelve days on there is no task, no
branch, and the plan exists only in a chat transcript, which is the one place this protocol exists
to stop things living.

## Principle

**The server fetches; the client renders. Truth before beauty. Every structural commitment lands in
the first piece of work that touches it, not later.**

The current page is not slow because it does too much — it does a reasonable amount of work in the
worst possible order, serialised end to end, and the browser is the wrong place for any of it. Once
the fetch moves to a schedule, the client's job shrinks to one authenticated read, and *that* is what
makes mobile and notification reachable. The redesign is the last phase, not the first, because
three of its ten findings are data problems wearing a visual costume.

## What changes, and where each piece lives

| Piece | Today | Target | Repo |
|---|---|---|---|
| The fetch (`mission-control.mjs`) | ~284 **serialised** requests in the viewer's browser, 900-request ceiling | A scheduled Vercel function, bounded concurrency, GitHub App credential | inflight |
| The credential | a read-only PAT the viewer pastes, `localStorage` | a GitHub App installation, server-side | inflight |
| State | none — recomputed per open, discarded | append-only snapshots in Supabase, tenancy column, RLS | inflight |
| The page | orchestrates everything, renders once at the end | one authenticated `GET`, renders the latest snapshot | inflight |
| Liveness + watchdog | `flightdeck/bin/`, invoked by canonical's `flow-watchdog.yml` | moves with its workflow and its `FLOW_WATCHDOG_PAT` | canonical → inflight |
| Notification | does not exist | diff of consecutive snapshots → what newly entered *needs you* | inflight |
| `flightdeck/` | in canonical, in the gate and the coverage corpus | deleted; floor re-measured; `CLAUDE.md` gate table updated | canonical |

## Phases

### Phase 0 — Human-only setup *(prerequisite; nothing below is claimable without it)*

Named in ADR-0006 as human-only so no worker mistakes them for work:

- Make `CandidDan/inflight` **private**, and turn off its GitHub Pages site.
- Create the Vercel project against it (Pro plan — minute-level crons available) and the Supabase project.
- Register the GitHub App and install it across the fleet.
- Run `flow-init` in `inflight` so it has a store and a gate.

**Until this lands the inflight half cannot be written as tasks at all**, because there is nowhere
to put them. The canonical half (Phase 1b, Phase 5's floor re-measure) can be written today.

### Phase 1 — The move, in the order that does not break the watchdog

ADR-0006's ordering constraint, restated because it is the one that silently breaks something:
`.github/workflows/flow-watchdog.yml` in canonical runs `flightdeck/bin/watchdog.mjs` on a schedule.
Deleting `flightdeck/` before its replacement runs kills the job built to make silent automation
death loud — the exact failure flow-0020 exists to catch, caused by the cleanup.

**1a — inflight receives (first).** `index.html`, `mission-control.mjs`, `liveness.mjs`,
`watchdog.mjs` and their tests; the `flow-watchdog` caller stood up and green at least once; the
`FLOW_WATCHDOG_PAT` secret moved.

**1b — canonical releases (only after 1a is green).** Delete `flightdeck/`; re-run `npm run coverage`
and set `.flow/config.yml` and `c8.lines` from the measurement, never by inference
(`config.test.mjs` fails if the two disagree); drop the flightdeck line from `CLAUDE.md`'s gate table.

Between 1a and 1b, `liveness.mjs` exists in both repositories. That duplication is the price of not
breaking the watchdog mid-move, and it is bounded by 1b rather than left to fade.

### Phase 2 — The spine: schema, scheduled fetch, one authenticated read

The largest phase and the one everything else stands on.

- **Supabase schema.** Append-only snapshot rows with a timestamp; `account_id` on every table with
  an RLS policy that happens to match one user; auth so opening mission control is a login.
- **The scheduled fetch.** Port `mission-control.mjs` to a Vercel function on a ~10-minute cron.
  Bounded concurrency pool (8–10 in flight) rather than the current serial loop; reserve budget
  before firing rather than counting after; GitHub App credential; the endpoint guarded by
  `CRON_SECRET` checked against the `Authorization` header, because a Vercel cron path is public HTTP.
- **The page becomes dumb.** One authenticated `GET` of the latest snapshot, then render. No token
  paste, no request ceiling, no orchestration in the browser.
- **Version skew is reported, not rendered through.** Read each repo's `VERSION`; a repo whose store
  shape is not recognised shows *"pinned to 0.4, this page reads 0.6"* in the card, the way the
  request-ceiling banner already names skipped repos. A confidently wrong card is the failure this
  replaces.

**Acceptance bars worth making mechanical:** cold open under 1s from the stored snapshot; a
completed run's rows are never updated or deleted (assert it, do not intend it); two consecutive
runs leave two rows; a test that fails on `await` inside a request loop, in the same spirit as the
existing REST-GET-only source scan.

### Phase 3 — Truth in the data

No visual change. Each item independently testable, and each one currently fetched-then-discarded:

- `blocked_reason` carried through to render. `deriveNeeds` has it; `renderRepoRow` renders only
  `title` and `url`. Every UNBLOCK instruction written into a task is fetched and thrown away.
- `needs[].type` carried through — today a blocked task, a PR awaiting review and a triage
  suggestion render as the same bullet.
- `repoSeverity` inverted: dead machinery is `critical` but a PR unreviewed for three weeks never
  passes amber. People outrank workflows.
- An empty ready queue stops being a *needs-you* item. It is a planning gap and belongs in the Ready
  column; today it pins a project amber permanently on that one line.
- `deriveNext` — the ready head plus a count.
- The dependency chain. **Sequencing note:** flow-0040 ("give a blocked task a machine-checkable
  dependency") is `ready` in canonical right now. If it lands first, this stops being a regex over
  `blocked_reason` prose and becomes a read. Prefer that. If it is built as inference anyway, it must
  degrade visibly — show the raw reason when the parse finds nothing, never a confidently wrong graph.
- **Ages come from snapshot history, not from commit dates.** This is the piece the old phasing got
  wrong. There is no `blocked_at` in Flow's frontmatter, and a task file's last-commit date measures
  "last edited", not "blocked since". Once Phase 2's snapshots exist, the date a task *first appeared
  as blocked* is in inflight's own data, exactly and for free.

### Phase 4 — Notification

Diff the previous snapshot against the current one; what newly entered *needs you* becomes one
message. That is the whole feature and it should not be more.

**Deliberately ahead of the redesign.** Being told rather than having to look is half of what
justified the backend, it is small once snapshots exist, and it delivers without any UI work. The
old phasing had nothing here at all.

### Phase 5 — Tokens, then render

- **Tokens first.** The measured palette from the design's token board as the single source: light
  default, warm off-white, three-channel severity (fill, bar, word), and **no green**. A board whose
  job is rationing attention should not spend a quarter of its surface glowing about things that are
  fine. Includes the live contrast failure — `--crit`, `--warn` and `--good` are never overridden in
  the `prefers-color-scheme: light` block, so GitHub's dark-mode signal colours land on white at
  2.5–3.3:1, which makes the warning banner the least readable thing on the page in daylight.
- **Then render, in dependency order:** desktop (cross-project needs-you lane, waiting-on-work chain,
  projects table, inbox) → project panel → exploded view → mobile at 390px.

## Decisions locked (ADR-0006, restated so this doc stands alone)

1. `CandidDan/inflight`, **private**. Vercel deploys from private repos; the store is never published.
2. **Vercel and Supabase are layers, not alternatives** — Vercel serves the app and runs the cron,
   Supabase holds the data and the identity.
3. **A GitHub App, not a PAT.** Expensive to reverse: a read-only personal token forecloses both
   writes and a second user.
4. **Append-only snapshots. Never overwrite.** The only commitment here that cannot be retrofitted.
5. **Every row retains raw frontmatter and the file SHA** — writes need the SHA for optimistic
   concurrency, and a lossy parser cannot round-trip.
6. **A tenancy column from day one**, RLS matching one user.
7. **Writes, task editing, multi-user and analytics are deferred, not forbidden** — the commitments
   above are what keep them reachable.
8. **The merge stays human (NG7).** The one real boundary rather than a "not yet".
9. **GraphQL is moot, not rejected.** A ten-minute cron does not care whether it takes six seconds or
   three.

## What changed from the 2026-09-03 phasing

Recorded because that phasing is still in circulation and is partly wrong:

- *"Fix the concurrency in the browser"* is gone. The browser stops fetching. The work moves
  server-side rather than being discarded, but it is a different task with different criteria.
- *"Phase 0 — get Pages live"* is dead. There is no Pages site.
- *The blocked-age task disappears* — Phase 2's snapshots answer it.
- *New, and absent from the old plan entirely:* the Supabase schema, the GitHub App, auth, the
  notification diff, the cron endpoint and its secret.
- *Notification moved ahead of the redesign*, on the grounds that it justified the architecture.

## Non-goals and risks

- **Not a dashboard application.** Read, render, notify. The moment it grows a write affordance it is
  a different product and needs a different conversation.
- **A token now lives at rest.** The real cost of the decision, unmitigated: an App credential sits in
  infrastructure permanently and is a far more attractive target than a PAT in one browser. Short-lived
  tokens and per-repo scoping reduce the blast radius; they do not remove the fact. Widening the App's
  scopes is a decision, not a config change.
- **Phase 2 is the risk concentration.** Schema, auth, credential and scheduler all land together, and
  three of the four structural commitments are in it. If any single phase deserves splitting into
  several tasks, it is this one.
- **`flow-0022` has been blocked on nothing since 2026-09-03** and gates three further tasks. It is the
  design review's headline finding, and the reason it has not moved is that mission control does not
  work yet. Break the circle by hand rather than waiting for the tool that would have surfaced it.

## Recommended first move

Phase 0, today, in one sitting — it is an hour of clicking and it is the hard blocker on every task
below it. Then Phase 1a, which is a file move and a workflow, and gets the fleet's liveness check
running in its new home before anything is deleted anywhere.

## Where this document may and may not go

`docs/` crosses to the **public** release repo, but by an allow list — `release-publish.mjs`
enumerates the four adopter-facing files by name, so a new doc is private unless somebody adds it to
`MANIFEST.files` by hand. The belt-and-braces half is `NEVER_PUBLISH`, the deliberately independent
second opinion that catches a widened manifest rather than restating it; `flow-infra-propagation-plan.md`
— the nearest sibling to this document — is named there. **This plan is named there too.** It is
operating material: it describes private infrastructure, names a standing credential risk, and
records which of the maintainer's tasks have been stuck and for how long.

Plan documents do **not** carry a per-document proving test. That rule is specific to ADRs
(`adr-vision-layer.test.mjs`, `adr-split-authoring.test.mjs`, `adr-mission-control.test.mjs`), and
`adopting-flow-cutover.md` has no owning task at all. The deny-list entry is asserted, because that
is a mechanical claim; the prose is not.
