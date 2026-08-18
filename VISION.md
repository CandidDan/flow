# Vision — Flow

<!-- One page, always. This file is the drift anchor: the orchestrator reads it before writing
     any task, every task's `serves:` field must name a goal below, and the flow-compass audit
     measures the repo against it. Changes are PRs only — never a direct commit to main. The PR
     review IS the touchpoint; the change-log row IS the history. Goal ids are append-only:
     never renumber, never reuse. -->

Flow is a protocol and an enforcement layer for shipping software with coding agents: an agent
can write the code, but you shouldn't have to watch it to trust what it ships. It exists for
**one operator running several projects at once** — Dan — and what changes for them is that
delegating stops meaning supervising: you approve the spec going in and the pull request coming
out, and between those two moments the work runs without you, because the checks that matter live
in CI where they fail loudly rather than in a prompt that asks nicely or a review you have to
remember. **The audience is a decision, not an assumption: Flow is solo-first, with the
multi-user option preserved and not exercised.** Preserved means the repo stays public and
Apache-licensed, the protocol stays vendor-neutral, and nothing in the design forecloses a second
person. Not exercised means no feature is built for an employee or a client until one actually
exists — and when that day comes it is a vision amendment, not an inference some session made on
its own.

## Goals

### G1 — Two touchpoints hold under load

The human's involvement in a shipped task is approving the spec and approving the merge. The two
honest escape hatches — a kickback, and a task that blocks rather than guesses — are the only
additions, and each one has to be a real decision the spec didn't settle. *Progress looks like:*
tasks that ship without an unplanned interruption, and blocked tasks that turn out to have been
worth blocking.

### G2 — A green gate is worth believing

Passing CI means done, without re-reading the diff to check. That holds only if no check can pass
on silence: a guard that fails open, a skip that's indistinguishable from a success, a criterion
with no proving test. Every incident becomes a permanent mechanical check rather than a resolution
to be more careful. *Progress looks like:* each new failure class ends as a check that would have
caught it, and guards that state their decision instead of implying it by staying quiet.

### G3 — Direction survives the work

A sequence of individually reasonable, individually green tasks can still walk a project away from
what it was for. Flow should catch that mechanically and early, not at the moment the operator
becomes disillusioned weeks later — while keeping semantic judgment advisory, because a flaky
gate teaches people to override gates. *Progress looks like:* divergence surfaced as a decision
with evidence, and evolution distinguishable from drift by whether a reviewed vision change
exists.

### G4 — What canonical says is what the fleet runs

A repo joins the protocol by following a runbook a session can execute, and stays current by
reference rather than by copy. Where a copy is unavoidable, the divergence is detected and
proposed — never silently self-updated, and never left to be discovered by someone wondering why
two repos behave differently. *Progress looks like:* no enrolled repo running infra canonical
can't name, and every drift surfaced by a check rather than by a surprise.

### G5 — You always know where the work is, and whether the machinery is alive

Across every enrolled project: what's moving, what's next, what needs a decision, and whether the
automation that runs it is still running. Answered without asking anyone, without trusting a
snapshot, and without a scheduled job's silent death going unnoticed — absence emits no event, so
it has to be actively checked. *Progress looks like:* the question "where is everything up to?"
answered in one place, computed rather than remembered.

## Non-goals

### NG1 — A platform

No service, no database, no dashboard to log into, no daemon, no orchestration server. Tasks are
files in the repo, coordination is git, enforcement is GitHub Actions. The reason is durability:
a platform is a thing to operate, and anything that has to be operated eventually isn't.

### NG2 — A second writable store

Views are one-directional projections of `.flow/tasks/` on `main`. Nothing reads a view back as
truth, and no surface accepts edits that the store then has to reconcile. Two stores is the drift
failure mode Flow exists to prevent, wearing a friendlier interface.

### NG3 — Semantic judgment with teeth in CI

No LLM-judged pass/fail gate. Mechanical facts can hard-fail; whether work *really* advances an
intent is a judgment, and it goes to a human on a cadence with evidence. A gate that is wrong
often enough to argue with trains people to override gates, which costs more than the check gains.

### NG4 — A product

Others are welcome to use Flow and the repo is public so they can — but adoption by strangers is
not a goal, and their ergonomics do not get built for speculatively. If Flow is ever productised,
that is an amendment here first, not a drift discovered in the backlog.

### NG5 — A second implementation of the protocol's logic

One implementation, callable from wherever it's needed. Wrappers are fine; a wrapper that starts
accumulating its own logic has become a fork of the protocol, and the two will disagree exactly
when it matters.

## Retired

*None yet.*

## Change log

| Date | Change | Why |
|---|---|---|
| 2026-08-18 | Initial vision. | Canonical had no anchor of its own while adding the vision layer to the protocol — the layer's credibility rests on canonical running it. Audience decided explicitly (solo-first, option preserved) rather than left for sessions to infer. |
