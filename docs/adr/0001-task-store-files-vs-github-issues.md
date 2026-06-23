# ADR-0001: Backing store for the Flow work queue — repo files vs GitHub Issues

**Status:** Proposed
**Date:** 2026-06-11
**Deciders:** Dan (inspirator / sole maintainer)

## Context

Flow's work queue is currently a set of Markdown files in `.flow/tasks/` (one file per
task: YAML frontmatter + human-written body), committed to `main`. GitHub Issues are used
for a *different* purpose — a zero-friction **capture inbox** that the triage sweep converts
into `ready` task files. The two are deliberately separate: Issues are raw material; task
files are the curated, spec'd, `ready` queue the worker pulls from.

This ADR exists because an incident exposed the central weakness of the files-as-store
choice, and we want to decide deliberately — three projects in (Nudge, Roost, Meadow), before
backfilling more — whether to keep it or move the store into GitHub Issues.

**The triggering incident.** Six task files (CAN-35 … CAN-40) were authored into a local
working tree but never committed or pushed to `main` — and that working tree was checked out
on a feature branch (`flow/CAN-32`), the one place task files must never be authored. A
**cloud** Claude Code worker, cloning `origin/main`, correctly reported that those tasks did
not exist (the store on `main` tops out at CAN-34) and refused to invent them. The worker did
exactly the right thing; the failure was upstream: *a task is only real once committed and
pushed to `main`, and that push is a separate, invisible, forgettable step.*

### Forces at play
- **Single maintainer**, running several projects, increasingly via **cloud** worker sessions
  (fresh clones that see only `origin/main`).
- **GitHub-centric** already: PRs, Actions (gates, status, done, triage, review), Issues.
- **Auth friction is real and current**: the GitHub connector could not complete OAuth in
  Cowork this session (no dynamic client registration); CI auth has been repeatedly fiddly.
- A meaningful amount of **custom machinery** has been built around the files store:
  `board.html` + `apply-board-edits.mjs`, `flow-doctor` drift detection, the snapshot/live
  board, the cross-project flightdeck artifact.

## Decision

**Keep the repo-file store on `main`, and close the incident's gap with a guardrail rather
than a re-platform.** Add a `flow-doctor` check that fails when a task file exists on disk but
is not committed to `main` (or is sitting on a feature branch), and make "creating a task *is*
a commit to `main`" an enforced step rather than an assumed one. Revisit this decision if the
collaboration model shifts toward heavy non-git, human-in-the-UI queue editing.

This is a *Proposed* recommendation; the alternatives are laid out below so the choice is
explicit.

## Options Considered

### Option A: Repo files on `main` (status quo + guardrail)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Med — git-native, but needs discipline + a drift guard |
| Cost | Low — already built and working |
| Consistency across clones | **Weak by default** — working tree vs `main` vs `origin` vs cloud can diverge until pushed |
| Gate coupling | **None** — spec is in the checkout; CI/worker read it with no API, no auth |
| Concurrency / claim | **Strong** — atomic first-push-wins via git; loser's push is rejected |
| Self-contained / offline | **Strong** — clone = whole system |
| Board / UI | Custom-built (board.html, flightdeck) — maintenance burden |

**Pros:** gate stays auth-free and git-native (decisive given current auth pain); clean atomic
claim for parallel workers; spec travels with the branch snapshot; repo is the entire system.
**Cons:** the "exists only when pushed" gap (this incident); cross-clone/cloud consistency
needs sync discipline; reduplicates issue-tracker/Projects features; capture and queue live in
two different technologies.

### Option B: GitHub Issues as the store (Projects as the board)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Med/High — re-architect gate + claim around the Issues API |
| Cost | High one-off migration; lower ongoing (less custom machinery) |
| Consistency across clones | **Strong** — one server-side source, instantly seen everywhere |
| Gate coupling | **API-coupled** — CI/worker must fetch the spec via GitHub API (needs auth in CI) |
| Concurrency / claim | Weaker — assignee/label claims race; needs optimistic-concurrency convention |
| Self-contained / offline | Weak — depends on the GitHub API |
| Board / UI | **Free** — GitHub Projects (board, views, API) |

**Pros:** the incident's bug class cannot occur (creating the issue *is* persistence); single
truth across every clone/cloud session; capture + queue unified (triage = a label/column move);
Projects replaces board.html + flightdeck machinery.
**Cons:** the core gate now depends on the exact GitHub auth that has been failing all session;
weaker atomic-claim semantics for parallel workers; less self-contained; the spec no longer
travels frozen in the branch snapshot (loses the merge-clobber protection the two-plane model
gives for free).

### Option C: Issues are the source of truth, mirrored to a read-only file cache

| Dimension | Assessment |
|-----------|------------|
| Complexity | **High** — adds a continuous sync layer between Issues and `.flow/` |
| Cost | High — most of both systems, plus the bridge |
| Consistency | Good if the sync is reliable; the sync itself becomes the new failure surface |

**Pros:** single source of truth (Issues) **and** a git-native, auth-free spec for the gate.
**Cons:** the sync layer is exactly the class of thing that just bit us — a place where two
representations drift. Trades one sync gap for a more complex one.

## Trade-off Analysis

The incident reads at first as "wrong foundation," but on inspection it's a **missing guardrail
on a known-sharp edge**, not a structural flaw. Every git-backed store has an
"uncommitted/unpushed" gap; the fix is to detect it, which `flow-doctor` is already shaped to do.

The decisive factor for *this* operator is **where auth lives**. Option B moves the project's
core correctness gate (criteria→test mapping, touches enforcement, spec retrieval) onto the
GitHub API, requiring working auth in CI and in every worker. We have spent this entire session
demonstrating that that auth is currently the least reliable part of the stack. Option A keeps
the gate as plain file reads in the checkout — no API, no token, no connector. Trading a
*fixable* footgun for a *permanent* auth dependency in the gate is a bad trade right now.

Secondary, but real: Option A's atomic first-push-wins claim is genuinely cleaner than
label/assignee claims for parallel (including cloud) workers.

The honest case *for* Option B is the consistency story and the elimination of custom board
machinery. If the collaboration model were heavy on non-engineers editing the queue in a UI, or
if cross-clone divergence became a frequent operational pain rather than a one-off discipline
miss, the balance would flip toward Issues+Projects.

## Consequences

**Easier:** the gate stays auth-free and git-native; parallel workers keep a clean atomic
claim; the repo stays self-contained; no migration.

**Harder / unchanged:** the store still requires the discipline of committing tasks to `main`;
cross-clone consistency is still a property you maintain rather than get for free; the custom
board/flightdeck machinery remains ours to maintain.

**To revisit:** if non-git, human-in-the-UI queue editing becomes important, or if push-gap /
divergence incidents recur *despite* the guardrail, re-open this ADR and re-evaluate Option B.

## Action Items

1. [ ] Add a `flow-doctor` check: **fail** when a `.flow/tasks/*.md` file exists on disk but is
   not committed on `main` (or is present on a feature branch). This would have caught the
   incident instantly. (Same ratchet pattern as `source_roots` / `coverage_min`.)
2. [ ] Make "creating a task **is** a commit to `main`" explicit in `task-writer` and the
   `CLAUDE.md` protocol — the store write is the completion step, not an afterthought.
3. [ ] Resolve the triggering incident: get CAN-35 … CAN-40 onto `main` (checkout `main`, add
   the six files, commit, push) so the cloud worker can see them.
4. [ ] Optional: have the flightdeck / `flow-doctor` surface "tasks ahead of `main`" so the
   human sees divergence before a worker trips on it.
5. [ ] Re-evaluate against Option B if the collaboration model changes (trigger noted above).
