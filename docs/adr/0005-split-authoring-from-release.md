# ADR-0005: Split canonical into a private authoring repo and a public release repo

**Status:** Accepted — amended 2026-09-10 (Amendment 1: the release repo is named `CandidDan/flow-protocol`, the cutover is ordered, and the `flightdeck/` line is superseded by ADR-0006)
**Date:** 2026-08-31
**Deciders:** Dan (inspirator / sole maintainer)

## Context

`CandidDan/flow` — canonical — currently does three jobs out of one public repository:

1. **It authors Flow.** The protocol, the reusable workflows, the template and the helpers are
   written here.
2. **It is the artefact the fleet consumes.** Every adopting repo's thin caller resolves
   `CandidDan/flow/.github/workflows/_flow-*.yml@<ref>` by repository reference at run time.
3. **It runs Flow on itself.** Canonical adopted its own protocol in flow-0004, so its own task
   store, gate and automation live here too.

Job 3 is what forces the question. Running Flow on itself means the store — `.flow/tasks/` — lives
in the repository, and the store is not a build artefact. It is the planning record: every task's
context, its rejected approaches, its `blocked_reason`, its handoff notes, and by extension the
maintainer's reasoning about unshipped work, commercial intent and the mistakes already made. Job 2
requires that the repository be public, because a reusable workflow is resolved by reference and a
private repository's workflows are not callable by an outside adopter. So job 2's requirement
publishes job 3's record.

**The human's objection is to exactly that coupling, and it is legitimate.** A published artefact
and a planning record are different kinds of thing with different audiences. Only one of them has
to be readable by strangers, and today both are, for no reason anybody chose — it is a consequence
of the two jobs sharing a repository, not a decision.

This ADR records the decision to separate them, and is deliberately written **before** any
implementation, because the change alters what canonical *is*: the repository that authors Flow
stops being the repository the fleet points at. It also exists to state, prominently, the thing the
split does **not** do — because the split *feels* like it makes the automation safe, and it does
not.

## Decision

**Canonical splits into two repositories.**

### The private authoring repo — the source of truth

Everything is authored here, and this is the repository that runs Flow on itself. It holds:

- `.flow/tasks/` — the store, and the whole motivation for the split.
- `.flow/bin/` and `.flow/config.yml` — canonical's own adapters and gate configuration.
- `.github/workflows/` — both the reusable `_flow-*.yml` definitions and canonical's own callers.
- The repository secrets: the Anthropic credentials and the several PATs the automation holds.
- `flightdeck/`, `CHANGELOG.md`, `VISION.md`, `CLAUDE.md`, the ADRs, the runbooks — the whole
  working repository as it stands today.

Git history stays here in full. Nothing about day-to-day authoring changes.

### The public release repo — the artefact, and nothing else

A separate public repository holding only what an adopter actually consumes:

- `.github/workflows/_flow-*.yml` — the reusable workflow definitions. **This is the primary
  artefact**; it is the thing that must be public, because it is resolved by repository reference.
- `project-template/` — what a repo gets when it adopts Flow, including the protocol at
  `project-template/.flow/PROTOCOL.md`.
- The top-level licence and version files — `LICENSE`, `NOTICE`, `VERSION` — because a consumer
  needs the licence and the stamp it compares itself against.
- `docs/` — the adoption and versioning documentation an adopter reads.
- A short `README.md` of its own, marking it as a published mirror and pointing contributions at
  the issue tracker rather than at pull requests against generated content.

**What never crosses:** the task store, the repository secrets, canonical's own `.flow/bin/`
adapters and `flow-*` callers, `flightdeck/`, `VISION.md`, `CLAUDE.md`, the ADRs, the runbooks, and
every AI-invoking workflow. The boundary rule, stated once so flow-0029 does not have to re-derive
it: **a file crosses only if an adopting repo needs it at run time or at adoption time.** Anything
that exists to author, plan, or operate canonical stays private.

### Publication is a mechanical snapshot, on release

Publication copies the artefact paths into the public repository as a **single squashed commit per
release**, tagged to match `VERSION`. It is not a filtered history push, not a subtree split, and
not a mirror of `main`. It runs from the authoring repo on release, and it is mechanical — no
human curation step, because a curation step is a step that eventually gets skipped.

### Adopters pin the public repo

Every `uses:` reference in an adopting repo resolves against the release repo instead of
`CandidDan/flow`. Existing adopters must be re-pinned; that is flow-0030.

### The release repo's name is chosen at implementation time

This ADR deliberately does not name it. The constraint that matters, recorded so whoever picks it
knows the cost: **the name becomes a public, permanent `uses:` reference in every adopting repo's
workflows.** Changing it later means re-pinning the entire fleet a second time. Choose it as if it
cannot be changed.

## Consequences

### Dogfooding survives, and actually improves

The obvious fear is that the authoring repo stops eating its own dog food, because the artefact now
lives elsewhere. The opposite happens.

Today canonical's callers pin a reference **to itself** — `.github/workflows/flow-gates.yml` says
`uses: CandidDan/flow/.github/workflows/_flow-gates.yml@main`. That is a genuine indirection: the
workflow that runs is the one resolved from the ref, which is not necessarily the working tree the
PR is proposing to change.

After the split, the authoring repo calls its reusables **by local path** (`./.github/workflows/…`).
It therefore runs the exact files it is about to publish, in the same commit that changes them. A
break in a reusable workflow surfaces in canonical's own CI **before** publication rather than in
the fleet's CI afterwards. Dogfooding gets stricter, not looser — and this is a reason to do the
split independent of the privacy motivation.

### The public attack surface gets materially smaller

This is a benefit beyond privacy and worth naming explicitly, because it is not what motivated the
split. The public repository ends up holding **no task store, no repository secrets, and no
AI-invoking workflows** — the reusable definitions are published as files, but the release repo
runs none of them, holds no credentials to run them with, and has no queue runner, triage sweep,
compass or review job of its own. The public surface stops being an execution environment and
becomes what it should always have been: a pile of text.

### The split does **not** filter content — `flow-0027` is still required

**This is the belief this ADR exists to prevent.** Making the authoring repo private does not
sanitise anything that comes into it.

Issues are still logged publicly — that is the point of keeping a public face — and are fed back
for triage. The triage sweep therefore delivers **the same outsider-authored text to the same
agent**, now running against the private repo with the private repo's credentials. If anything, the
consequence of a prompt-injection succeeding is worse after the split, not better, because the
agent it reaches is the one holding the secrets.

The input-trust boundary is `flow-0027` — restricting the triage sweep to issues from people who
can already direct the repo — and it is **required independently of this ADR**. Nothing here
substitutes for it. "We made it private" is not an input-validation control, and any future reader
tempted to relax `flow-0027` on the grounds that the repo is now private should read this paragraph
as the direct answer to that argument.

### Publication must not carry history

The snapshot rule above is a **security requirement, not a convenience**. A history-preserving
publish — a filtered push, a subtree split, a mirror — exports the commits it is meant to withhold.
Every task-state commit, every `blocked_reason`, every handoff note is in that history, and once a
single publish carries it, the export is permanent and public regardless of what the working tree
looks like afterwards. Removing it later means rewriting published history, which cannot be relied
upon once anyone has cloned or forked.

So: **one squashed commit per release, containing only the artefact paths, with no parent lineage
from the authoring repo.** A publish mechanism that "preserves history for traceability" has
defeated the entire ADR. Traceability lives in the changelog and the version stamp, which are
published deliberately.

### Every `CandidDan/flow` reference becomes a reference to the release repo

At the time of writing, 40 files outside the task store name `CandidDan/flow`: the template's
workflow callers, canonical's own callers, `project-template/.flow/bin/flow-init.mjs` and
`project-template/.flow/bin/flow-sync.mjs`, `project-template/INIT.md`, `project-template/README.md`,
the versioning and re-pinning runbooks, and the tests that assert on them. All of them must change,
and adopting repos must be re-pinned. That is a real, non-trivial migration cost, accepted here
rather than discovered later — it is the substance of flow-0030.

### The two-repo shape must not be "simplified" back into one

Recorded for the future maintainer who sees two repositories where one would do. Merging them back
re-publishes the store. The seam is the point; it is not accidental complexity.

### Interaction with ADR-0002 and its Amendment 1 — the flightdeck's hosting question

ADR-0002's Amendment 1 made the flightdeck a computed page (`flightdeck/index.html`) that fetches
live from the GitHub API with a read-only PAT. It is opened today as a local file, which carries a
known friction: Chromium blocks ES module imports over `file://`, so the page's own README has to
explain a workaround.

Hosting it would remove that friction, and the release repo is a **candidate host precisely because
it holds no store** — it is public, and there is nothing private in it to leak by serving pages from
it. The page holds no secrets of its own (the PAT is supplied by the viewer at open time and is
read-only), so hosting it does not create the auth surface ADR-0002's Option C was rejected for.

This is recorded as an *interaction*, not a decision: hosting the flightdeck is not decided here and
is not in this ADR's scope. Amendment 1's tripwires stand unchanged — in particular, a hosted page
that grows a write affordance is still Option C, and hosting does not license one.

## Alternatives

### Keep one public repo, and accept the store being public — rejected because the objection is legitimate and has no mitigation

This is the status quo and it is genuinely the cheapest option: no migration, no publish mechanism,
no second reference to maintain. It was rejected because there is no way to hold it while addressing
the actual complaint. The store cannot be selectively hidden inside a public repository, and the
alternative of writing thinner task files — omitting the context, the rejected approaches and the
blocked reasons — destroys the artefact that makes the store worth having. Flow's whole claim is
that the reasoning survives in the store; a store written for an audience of strangers is a store
with the reasoning removed.

### Distribute Flow as an npm package — rejected because npm cannot carry the primary artefact

Superficially attractive: versioning, a registry, a familiar `npm install`, and the helpers under
`project-template/.flow/bin/` are already zero-dependency Node modules that would package cleanly.

It was rejected on a hard mechanical constraint. **GitHub resolves reusable workflows by repository
reference** — `uses: owner/repo/.github/workflows/file.yml@ref` — and there is no form of that
reference that resolves into an npm package. The reusable workflows are the primary artefact, not a
secondary convenience, so a distribution channel that structurally cannot carry them does not
address the problem. It would leave a public repository required for the workflows *anyway*, which
is the thing being solved, plus a second distribution channel to keep in sync.

### Take canonical private outright, with no public release repo — rejected because it kills adoption

The simplest way to make the store private. Rejected because it makes the reusable workflows
uncallable by anyone outside the account: a private repository's reusables cannot be resolved by an
outside adopter, so Flow would stop being adoptable by anyone who is not the maintainer. That
forecloses the project's stated direction — Flow is meant to be portable across agents *and* across
users — in exchange for a privacy property the split achieves without the cost.

## What this ADR does not do

It decides; it does not implement. No publish workflow is written here, no reference is re-pinned,
no repository is created, and no runbook is updated. `VISION.md`, `README.md`, `CLAUDE.md` and the
adoption runbooks still describe the single-repo world, and are correct to until the implementation
lands.

- **flow-0029** builds the publish mechanism against the boundary defined above.
- **flow-0030** re-pins the fleet once there is something to pin to.

Both were blocked on this ADR precisely so that the boundary would be decided once, in the open,
rather than assumed three times.

---

# Amendment 1 — the release repo is named, and the cutover is ordered

**Status:** Accepted
**Date:** 2026-09-10
**Deciders:** Dan (inspirator / sole maintainer)
**Amends:** the deferred name above ("The release repo's name is chosen at implementation time"),
and the `flightdeck/` line in the private-authoring-repo inventory. The Decision's boundary rule,
the Consequences and the Alternatives stand unchanged — this amendment records what was deferred
and what was learned setting the repository up. It reopens nothing.

## What changed since 2026-08-31

The original ADR deliberately left the release repo unnamed, and was written before anything had
been built. The name has since been chosen and the repository created, and three operational
constraints surfaced in the same session — each a live trap rather than a nicety, and none of them
derivable from the ADR as written. They are recorded here because this is the document a future
maintainer opens; until now they lived only in task notes on flow-0029 and flow-0030, which are
read by the worker of those tasks and by nobody else.

## The name: `CandidDan/flow-protocol`

The release repo is **`CandidDan/flow-protocol`**, **public**, created 2026-08-31.

It was chosen over **`flow-agent-protocol`**. `agent` was dropped because the protocol is
deliberately vendor- and agent-neutral — flow-0006 made it so, and this ADR's own Consequences
record that the reviewer "no longer has to be your vendor". Naming the artefact after the class of
consumer that happens to dominate today bakes 2026's vocabulary into the one thing the Decision
above calls expensive to undo: a permanent public `uses:` reference in every adopting repo. If the
protocol outlives the word "agent", the reference should not have to be re-pinned a second time to
say so.

The rejected form is recorded rather than discarded, per this ADR family's habit of keeping the
alternatives: a future maintainer who wonders why the obvious, more descriptive name was passed
over should find the reason here rather than re-litigate it.

## The release repo must not carry the `flow` GitHub topic

**Constraint: `CandidDan/flow-protocol` must never be tagged with the `flow` topic.**

`topic:flow` is not a label. It is the **enrolment mechanism** for the fleet views:
`flightdeck/bin/mission-control.mjs` and `flightdeck/bin/watchdog.mjs` both discover every
repository carrying that topic under the account and then read its task store. The release repo has
no store, by design — `.flow/tasks/` is the first thing the Decision above lists as never crossing.

So tagging it enrols a **phantom, store-less project** into the operator's own rollup: mission
control gains a project it can say nothing about, and the watchdog gains a repository whose
automation liveness is undefined because it has no automation. The failure is quiet — nothing
errors, the views simply start lying — which is why it is written down rather than left to be
noticed.

This is a general rule, not a fact about one repository: **a repository that carries the `flow`
topic is asserting that it has a task store.** Publication targets do not.

## The cutover is ordered, and the order is the whole safety property

**Canonical must stay public until the re-pin has landed and been verified green.**

The order is:

1. **Publish** the artefact to `CandidDan/flow-protocol` (flow-0029).
2. **Re-pin** the fleet's `uses:` references to the new repository (flow-0030).
3. **Verify** a green run against the new reference — an actual CI run, not a reading of the diff.
4. **Only then** flip canonical private.

The reason, in counts rather than vaguely. As of 2026-09-10, **49 files outside the task store name
`CandidDan/flow`**; the original Consequences recorded 40 on 2026-08-31, and the number has grown,
not shrunk. **28 of those carry a real `uses:` reference** resolved by GitHub at run time, and
**11 of them are the workflow callers in `project-template/`** — the files every adopting repo
ships a copy of.

That last number is the one that matters. Flipping canonical private before step 3 does not degrade
gradually: a private repository's reusable workflows cannot be resolved by an outside adopter at
all, so **all 11 callers fail to resolve in every adopting repo at once**, in *their* CI, with no
local change on their side to explain it. The blast radius is the entire fleet, simultaneously, and
the symptom appears furthest from the cause.

Steps 1 and 2 are individually reversible; step 4 is what makes the failure fleet-wide, so it is
last and it is gated on evidence rather than on confidence.

## The publisher owns the release repo's tree

Publication is a **history-free orphan snapshot** (see "Publication must not carry history" above),
which means it **replaces** whatever is in the release repo rather than merging with it.

The consequence, stated because the instinct on seeing a bare public repository is to fix it by
hand: **anything hand-added to `CandidDan/flow-protocol` does not survive.** Adding a `LICENSE`, a
`README.md`, a topic list or a contributing guide there is at best silently discarded on the next
publish, and at worst confuses flow-0029's own out-of-manifest check, which exists to detect
exactly the case of content in the release repo that the manifest did not put there.

Everything the release repo should contain is published *from canonical*, by the manifest. If
something is missing there, the fix belongs in the publish set — never in the release repo.

## What ADR-0006 supersedes here

The private-authoring-repo inventory above lists `flightdeck/` among the things that stay in the
authoring repo. **That line is superseded by
`docs/adr/0006-mission-control-own-repo.md`.**

Mission control moves out of canonical entirely, into its own repository, `CandidDan/inflight` —
**private**, served by Vercel, with its data in Supabase. It does **not** move to the release repo:
ADR-0006 rejected that on this ADR's own boundary rule, since a cross-project rollup is neither
needed by an adopter at run time nor at adoption time.

ADR-0006 also **answers the hosting question** that the "Interaction with ADR-0002 and its
Amendment 1" section above deliberately left open as an interaction rather than a decision. That
section is now historical: it correctly records that hosting was not decided *here*, and ADR-0006
is where it was decided. The release repo is no longer a candidate host.

Nothing else in the inventory changes. The store, the secrets, canonical's own `.flow/bin/`
adapters and `flow-*` callers, `VISION.md`, `CLAUDE.md`, the ADRs and the runbooks all stay
private, for the reasons given above.

## What this amendment does not do

It records; it does not implement. No repository is published, no reference is re-pinned, no
visibility is flipped, no topic is set or unset, and `flightdeck/` is not moved. flow-0029,
flow-0030 and the ADR-0006 move task own that work.

`CandidDan/flow-protocol`'s settings were confirmed public and untagged by the maintainer on
2026-08-31 and are recorded here as given: the repository is outside canonical's session scope, so
a worker cannot re-verify them and should not pretend to.
