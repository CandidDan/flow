# ADR-0006: Mission control moves to its own repository, and grows a backend

**Status:** Accepted
**Date:** 2026-09-03
**Deciders:** Dan (inspirator / sole maintainer)
**Supersedes:** the `flightdeck/` line in ADR-0005's private-authoring-repo inventory
**Reverses:** ADR-0002's rejection of Option C ("build a dashboard application")
**Answers:** the hosting question ADR-0005 recorded as an interaction and deliberately left open

## Context

Three decisions were taken separately, each defensible on its own, and together they did not hold.

1. **ADR-0002 Amendment 1** made the primary cross-repo view a *computed page* — `flightdeck/index.html`, three static files that fetch live from `api.github.com` in the viewer's browser with a read-only PAT the viewer pastes. Its claim is that it cannot go stale, because it does not exist until you look at it.

2. **ADR-0005** split canonical into a private authoring repo and a public release repo, and put `flightdeck/` in the private one. It also recorded, at §"Interaction with ADR-0002 and its Amendment 1", that hosting the page was *not* decided there.

3. **flow-0037** found the friction: opening mission control cost a clone, a static file server and a pasted token. The human's words, twice: *"a mission control you need 5 minutes to launch is not mission control."*

So the artefact had to be reachable, and the repository it lived in was becoming private. **The placement was the bug, not the hosting** — and `VISION.md` had already said so, in the goal that defines what a Flow repo owes:

> **G7 — A Flow repo reports its own state.** [...] **Cross-project aggregation is not this goal.** That is a consumer of it, and not Flow's job.

Mission control is that consumer, sitting inside the repository whose vision says it is not that repository's job. **NG6** points the same way: anything with a surface is a *support actor*. Keeping the surface out of the protocol repo is the structural form of that rule rather than a promise to behave.

### Two findings then changed what the thing has to be

An earlier draft of this ADR moved the page to a **public** repository served by **GitHub Pages**, on the reasoning that the page is static and needs no backend. Two findings, both from 2026-09-03, retired that.

**The page is not slow because it does too much. It does a reasonable amount of work in the worst possible order.** Every request in `mission-control.mjs` is serialised — there is not one `Promise.all` in the file. Task files are fetched one at a time (`for … await fetchTextFile`), workflow files likewise, run history likewise, and — the decisive one — **repositories are loaded strictly one after another** (`for (const c of candidates) rows.push(await loadRepoRow(...))`). The design review's own screenshot records **284 / 900 requests** for five projects; serialised at a realistic round trip, that is the better part of a minute of staring at nothing. The human's verdict: *"it's not actually usable with its current process."*

**And the read-only rule was not a principle.** The README states, as the page's "one absolute rule", that every call is a REST `GET`, asserted by a mechanical scan for write-capable methods. The human's correction: *"I didn't define this rule, we went with path of least resistance."* On the merits it is also weaker than it reads — the PAT is fine-grained and read-only **by scope**, which GitHub enforces server-side, so a `POST` could not write anyway. The scan protects against a viewer pasting an over-scoped classic token. That is a real risk, and a much smaller one than "absolute rule" implies.

Concurrency alone would have taken the page from roughly a minute to roughly six seconds, and for a while that looked like the whole answer. It is not, because of the requirement the human stated next: **"we should always build things to make them as accessible as possible."** That makes two things requirements rather than wishes — *it works on a phone*, and *it tells you rather than waiting to be looked at* — and **no client-only page reaches either at any speed.** A phone will not happily make 284 authenticated requests over mobile data with a PAT in its local storage, and a page that only exists while you are looking at it cannot notify you.

Speed was an ordering bug. Reachability is an architecture question, and it has a different answer.

## Decision

**Mission control moves out of canonical into its own repository, `CandidDan/inflight`, which is private, served by Vercel, with its data in Supabase.**

### The repository is private

The earlier draft made it public because GitHub Pages cannot serve a private repository without Enterprise. Vercel deploys from private repositories, so that constraint is gone — and with it the consequence the earlier draft had to accept, that `inflight/.flow/tasks/` would be publicly fetchable. Nothing about the planning record is published. This is strictly better than what Pages could offer and is the reason the Pages route is abandoned rather than merely not chosen.

The name was chosen over `flowinflight` and `flightdeck`. `inflight` is the vocabulary the task store already uses, it parses correctly as a lowercase URL segment, and it does not name the consumer after the protocol it is meant to be independent of.

### Vercel serves the app and runs the schedule; Supabase holds the data and the identity

- **Vercel** — the page, the API routes, and the cron that runs the scheduled fetch. The team is on the Pro plan, which takes minute-level schedules, so a ten-minute refresh is available and the scheduler does not need to move. The cron endpoint is a public HTTP route and is guarded with `CRON_SECRET` checked against the `Authorization` header.
- **Supabase** — Postgres for the snapshots, and auth, so opening mission control is a login rather than a pasted token.

These are layers, not alternatives. An earlier framing of this decision posed them as a choice; that was wrong.

### The client becomes dumb, and that is the point

Today the browser orchestrates ~284 requests against a 900-request ceiling. After this it makes **one authenticated GET** and renders. The concurrency work is not discarded — it moves server-side, where it belongs, and runs once every ten minutes for everyone rather than once per person per open. The request budget, the skipped-repo banner and the whole ceiling apparatus become properties of the scheduled job rather than of the page.

Mobile then works because there is nothing heavy left to do on a phone.

### A GitHub App, not a personal access token

The credential becomes a GitHub App installation rather than a PAT. This is the decision that is expensive to reverse: a read-only PAT can never write and is one person's, so it forecloses both writes and a second user with the same limitation. An App gives per-repo installation, scopes that can be widened without re-architecting, short-lived tokens rather than one at rest forever, and per-user installations when there is a second user. Swapping PAT → App later means redoing auth, the fetch layer's credential handling and notification identity.

### It adopts Flow

`CandidDan/inflight` runs Flow: its own `.flow/` store, its own gate, its own tasks. It is the first repository that adopts Flow *without being the repository that authors it*, which is the evidence **G8** ("holds at scale") wants and which canonical, adopting its own protocol, cannot supply.

### Four structural commitments

The features below are **not built now**. These are the decisions that are cheap today and expensive or impossible later, recorded so that "not yet" does not become "never, by accident".

1. **Append-only snapshots. Never overwrite.** Each scheduled run writes a new immutable row with a timestamp; "current" is the latest. This is the only item here that **cannot be retrofitted** — a run that replaces its predecessor destroys history no later feature can recover. It is not speculative either: the notification diff needs *previous run vs this run*, so append-only is required by the feature being built now, and historical analytics arrives as a side effect. Storage is negligible.

2. **A GitHub App rather than a PAT**, as above — it is what makes writes and multi-user reachable later.

3. **Every row retains the raw frontmatter and the file SHA.** Writing a task means read → mutate frontmatter → commit, and optimistic concurrency needs the SHA. A lossy parser — frontmatter in, tidy row out, original discarded — makes round-tripping a rewrite of the parse layer. Two extra fields today.

4. **A tenancy column from day one**, with an RLS policy that happens to match exactly one user. Adding `account_id` later is a migration plus every query rewritten; adding it now is a column with one value.

### What is deliberately not built, and the one thing that is actually bounded

Not built now, and reachable later on the commitments above: writes to GitHub, task editing from the page, multi-user, historical analytics. **Read, render, notify** is the whole of the first version.

One item is a boundary rather than a "not yet". **The merge stays human.** That is **NG7** in the rewritten vision — the human's own words from the interview, not model-authored — and it says a flag must never be the thing that decides it. Task-state writes and triage from the page are fine later. Auto-merging a PR from mission control is not.

## Consequences

### ADR-0002's Option C is reversed

Amendment 1 rejected "build a dashboard application" and set a tripwire that a hosted page growing a write affordance is still Option C. This ADR overturns that rejection deliberately and on stated grounds: the accessibility requirement makes a server necessary, and the read-only rule that the rejection leaned on was path of least resistance rather than a decision. Recorded here so the reversal is a decision rather than drift.

### flow-0037 is retired, not done

The publisher, the workflow, the publish-set computation and the "nothing crosses the boundary" assertions all disappear, and so does the Pages route they served. flow-0037 is `blocked` as superseded rather than deleted, on the flow-0002 precedent. Its subpath criterion is **moot**, not inherited: Vercel serves from a domain root, and in any case `index.html`'s single inline module imports `"./bin/mission-control.mjs"` whose only local import is `"./liveness.mjs"` — both relative, both prefix-safe.

### ADR-0005 is amended, and its test moves with it

ADR-0005 lists `flightdeck/` among the things that stay in the private authoring repo. That line is superseded here. **The amendment is owed by flow-0032**, which already claims `docs/adr/0005-split-authoring-from-release.md`; writing it here would have created a fifth link in the file-claim ring that already holds flow-0022, flow-0023, flow-0030 and flow-0034.

**Trap, recorded so the next worker does not discover it in CI:** `.flow/bin/adr-split-authoring.test.mjs` asserts at line 118 that *"the flightdeck stays with the authoring repo"*, and at line 265 that the hosting question is recorded as not decided. Both are true of ADR-0005 as written and stay green until it is amended. **The PR that amends ADR-0005 must update both assertions in the same diff**, or the gate goes red on a docs change.

### The watchdog moves, and the move has an ordering constraint

`.github/workflows/flow-watchdog.yml` in canonical invokes `node flightdeck/bin/watchdog.mjs` on a schedule (flow-0020), and it searches `topic:flow` across the fleet. It is a cross-project consumer by exactly the G7 argument that moves mission control, so it moves too — which means deleting canonical's caller, recreating it in `inflight`, and moving the `FLOW_WATCHDOG_PAT` secret with it.

**Correction to an earlier draft, recorded rather than quietly fixed.** That draft asserted nothing depends on the flightdeck, on the strength of `flightdeck/CLAUDE.md` saying "remove it and nothing breaks". That sentence is true of *projects* and false of *canonical*. Deleting `flightdeck/` without relocating that job would silently kill the thing built to make silent automation death loud — the exact failure flow-0020 exists to catch, caused by the cleanup.

So: `inflight` exists and its watchdog runs **before** canonical's `flightdeck/` is deleted. Between those points `liveness.mjs` exists in both repositories. That duplication is the price of not breaking the watchdog mid-move, and is bounded by the move task rather than left to fade.

### Blocked ages stop being a problem

The design review needs an age on every needs-you item, and Flow's frontmatter has `created` but no `blocked_at`. The options were a per-task commit lookup that measures "last edited" rather than "blocked since", a protocol change across the fleet, or honest-but-vaguer labelling. **Append-only snapshots retire the question**: once there is a run history, the date a task *first appeared as blocked* is in inflight's own data, exactly and for free.

### Canonical's coverage floor must be re-measured, not assumed

`flightdeck/bin/` is inside `npm test` and inside the coverage corpus. The floor of **83.5** was measured at 85.31% with 1.81 points of margin; the current measurement is 95.47%. Removing four well-tested modules moves numerator and denominator by different amounts. The move is not complete until `npm run coverage` has been re-run and `.flow/config.yml` and `c8.lines` in `package.json` agree with it — `.flow/bin/config.test.mjs` fails if they disagree, which is the safety net, not the plan. `CLAUDE.md` names the flightdeck bin directory in its gate table; that reference goes too.

### A token now lives at rest, which it did not before

This is the real cost of the decision and is not mitigated away. Previously the only credential was a read-only PAT in the viewer's own browser. Now an App installation credential lives in infrastructure, permanently, and is a considerably more attractive target. The App's short-lived tokens and per-repo scoping reduce the blast radius; they do not remove the fact. Anything that widens the App's scopes is a decision, not a config change.

## Alternatives

### Fix the ordering and stay client-only — rejected because it answers the wrong question

Genuinely attractive, and it was the recommendation until the requirement changed. A bounded concurrency pool, progressive rendering and a cache-then-revalidate load would take the page from roughly a minute to first-paint-under-a-second, in about a day, with no infrastructure and no token at rest. It is rejected because "as accessible as possible" makes mobile and notification requirements, and neither is reachable from a page that only exists while someone is looking at it. None of that work is wasted; it moves server-side.

### A GitHub Action that commits `state.json` into a public Pages repo — rejected because it publishes the planning record

The cheapest possible backend: cron, fetch, commit, and the page loads one static file from a CDN. No infrastructure, no token beyond a repository secret alongside the ones already there, instant on mobile, no paste. It fails on one thing: Pages requires the repository to be public and serves the whole tree, so that file would publish task titles, blocked reasons and PR states across every project including private ones. That is the rock ADR-0005 was built on, hit again from the other side.

### Keep it in canonical and build flow-0037's publisher — rejected because it defends a boundary drawn in the wrong place

The publisher exists only to move files out of a private repo into a public one so they can be served — which is the split, done by workflow on every push instead of once. flow-0037's own notes predicted its retirement.

### Move it to the release repo `CandidDan/flow-protocol` — rejected on ADR-0005's own boundary rule

*A file crosses only if an adopting repo needs it at run time or at adoption time.* Mission control fails that cleanly. The release repo is also a mechanical squashed snapshot per release, so it cannot be developed in.

### GraphQL as the answer to the slowness — moot rather than rejected

GraphQL would collapse ~40 per-repo file fetches into one or two calls, at the cost of the mechanical read-only assertion. With the fetch moving to a scheduled server-side job, a ten-minute cron does not care whether it takes six seconds or three. Available if the job ever needs it; not a reason to decide anything now.

## What this ADR does not do

It decides; it does not implement. No repository is made private, no Vercel project is created, no Supabase schema is written, no GitHub App is registered, no file is moved, no coverage floor is changed and no runbook is updated. `README.md`, `CLAUDE.md` and `flightdeck/README.md` still describe the single-repo, paste-a-PAT world and are correct to until the move lands.

Human-only, and named here so they are not mistaken for work a worker can claim:

- Make `CandidDan/inflight` private, and disable its GitHub Pages site.
- Create the Vercel project against it, and the Supabase project.
- Register the GitHub App and install it on the fleet.
- Run adoption (`flow-init`) in `inflight`.
