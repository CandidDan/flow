# ADR-0004: The vision layer — a root anchor, a mechanical `serves` check, and an advisory compass

**Status:** Accepted
**Date:** 2026-08-18
**Deciders:** Dan (inspirator / sole maintainer)

## Context

Every gate Flow has answers a question about *one* task: does this diff do what its spec said, is it
tested, does it stay inside its declared blast radius. None of them answers the question that
actually loses projects — **does the sum of the work still match what the project is for?** A
sequence of individually reasonable, individually green tasks can walk a repo somewhere nobody
chose, and because each step passed, nothing goes red on the way.

The control for that today is the human approving each spec. It has observably failed: approval
happens one task at a time, weeks apart, against no written anchor, and the drift is only visible
in aggregate — which is the one view a per-task touchpoint never gets. The failure mode is not
someone approving a bad task; it is thirty good ones adding up to a different product, discovered
at the point of disillusionment rather than at the point of divergence.

This ADR records the layer built to answer it, and — more importantly — **why it is shaped the way
it is**, because the shape looks arbitrary from outside. It makes a specific trade: *mechanical
facts hard-fail; semantic judgment stays advisory.* Whether a task's `serves` **resolves** to a
declared goal is a fact, so it gates. Whether the work **genuinely advances** that goal is a
judgment, so it goes to a human on a cadence, with evidence, and blocks nothing.

Without the reasoning written down, both halves get "fixed" in predictable directions: the first
person to find compass noisy proposes making it a gate, and the first person to find the doctor
check annoying proposes downgrading it to a warning. Each is locally reasonable. Together they
collapse the layer into either a flaky semantic gate or a convention nobody enforces.

**What this ADR does not reopen.** ADR-0001 stands: `.flow/tasks/` files on `main` remain the
store, and the vision's root placement is chosen precisely so that invariant is untouched.
ADR-0002 and its Amendment 1 stand: the primary cross-repo view is a computed page, not a Projects
projection. Both are referenced here, neither is re-argued. Implementation belongs to the tasks
that carry it — the doctor rules to `flow-0010`, the artifact and its skill to `flow-0011`, the
compass audit to `flow-0013`, the `serves` field to `flow-0012` — and an ADR that duplicates a
spec drifts from it.

## Decision

Adopt a vision layer in three parts, each with deliberately different teeth.

### 1. `VISION.md` at the repository root, on the code plane, changed only by PR

One page. Purpose, numbered goals (`G<n>`), numbered non-goals (`NG<n>`), a `## Retired` section,
and a change log. Goal ids are **append-only**: never renumbered, never reused, because every task
in the store's history cites them.

It lives at the **repo root**, not in `.flow/`, and that puts it on the *code plane* rather than
the *task plane*. The consequence is the point: `.flow/tasks/` is `main`-only and edited by direct
commit, so a store-plane vision could be changed by any session mid-task with no review. On the
code plane the two-planes rule already forbids direct commits to `main`, so **every vision change
is a branch and a PR** — which means every vision change is reviewed by the human, and the change
log row is the history. Nothing new had to be built to make that true; it falls out of an
invariant the repo already enforces.

That is also what makes drift distinguishable from evolution. A project that has genuinely changed
direction has a merged vision PR to show for it; a project that has drifted does not.

### 2. `serves:` on every task, validated mechanically by `flow-doctor`

Every task's frontmatter names the goal id it advances — or the reserved value `maintenance`, for
work that keeps the machine running rather than advancing a goal. `flow-doctor` checks that the
citation **resolves**, and nothing more:

| Situation | Verdict |
|---|---|
| No `VISION.md` at the repo root | **WARN** once, and skip every per-task check (the layer is inactive) |
| `VISION.md` present but no goal heading parses | **FAIL** once, and skip the per-task pass entirely |
| A goal-ish heading that doesn't parse | **WARN**, naming the line |
| `ready` task with no `serves` | **FAIL** |
| `serves` names an id `VISION.md` doesn't declare | **FAIL** if `ready`, **WARN** otherwise |
| `serves` names a declared **non-goal** | **FAIL** if `ready`, **WARN** otherwise |
| `serves` names a goal under `## Retired` | **WARN** |
| `serves: maintenance` | Always resolves; never declared in `VISION.md` |

Two graces are deliberate. **No vision means no check** — an adopting repo stays green until it
writes one, so the rule can ship before the artifact. And **only `ready` tasks can fail** — a task
already in flight or long done gets a warning, so adopting the check cannot retroactively redden
history. The vacuous-check guard matters as much as either: zero parseable goals reports the format
problem *once* rather than failing every task for the same reason, because a check that fires on
everything teaches people to ignore it.

Note what is *not* checked: nothing asks whether the task really advances G2. The rule is
resolution, not alignment.

### 3. `flow-compass` — a scheduled, opt-in, read-only audit that files into the existing inbox

Once a week, an agent session reads `VISION.md`, surveys the record (recent `done` tasks, the
`ready` queue, merged PR titles in the window, the codebase's top-level shape) and classifies
material divergence: unanchored work, starved goals, non-goal encroachment, the `maintenance`
share, vision staleness. Each material finding becomes **one GitHub issue**, labelled `compass`,
carrying evidence a human can check from the issue alone and a proposed lane — *fix*, *amend*, or
*accept*.

Three properties are load-bearing:

- **Read-only, enforced by `permissions:` and not by the prompt.** The job is granted
  `contents: read` and `issues: write`. It cannot commit, cannot open a PR, cannot edit a task,
  cannot edit `VISION.md` — the boundary is a token scope, not an instruction it might ignore, and
  `.flow/bin/check-workflows.test.mjs` fails if that block ever drifts.
- **Findings land in the capture inbox**, not a new surface. Issues are already where raw
  observations go and where triage already runs; a compass finding is exactly that shape.
- **Opt-in and dormant by default.** The job is gated on `vars.FLOW_AI == 'true'` with an optional
  `CLAUDE_CODE_OAUTH_TOKEN`, so shipping the caller turns nothing on.

Compass **blocks nothing**. Its output is a decision request with evidence attached.

### The organising principle: the teeth budget

The three parts differ because **enforcement is a budget, and overriding is contagious.**

A gate's value is not that it fires; it is that a red gate reliably means "stop." That property is
shared across every gate in the repo, and it is spent by any single check that is wrong often
enough to argue with. The first time someone merges past a red check because "it's just the
alignment one being weird," they have learned that red checks are negotiable — and they have
learned it about *all* of them, including the store-guard, the touches-guard and the test suite.
A semantic gate cannot avoid being wrong sometimes: judging whether work advances an intent is
exactly the class of question that has no stable ground truth.

So the budget is spent only on facts. `serves` resolving is decidable by string comparison against
a file in the tree — it is either true or false, it is the same answer for every reader, and a
failure is always the author's to fix. That earns teeth. Whether the work *really* advances the
goal it cites is a judgment, so it gets a cadence, a human and an issue, and it costs the budget
nothing when it is wrong.

Stated as a rule for anyone extending this layer: **a new check may hard-fail only if a second
reader, given the same tree, would reach the same verdict every time.** Everything else is advisory.

## Alternatives considered

### An LLM-judged alignment gate in CI — rejected

The obvious idea: have the reviewer decide, per PR, whether the change advances the goal it cites,
and fail the check when it doesn't. It is attractive because it enforces the thing we actually
care about rather than a proxy for it.

**Rejected because a flaky semantic gate corrodes the mechanical ones.** It would be wrong often
enough to be argued with — the same diff can plausibly serve or not serve a goal depending on how
the goal is read — and every override teaches the operator that a red check is an opinion. That
cost is not paid by this gate; it is paid by the store-guard, the touches-guard and the test
suite, whose entire value is that red means stop. Buying imperfect alignment enforcement with the
credibility of every other check is a bad trade, and it is recorded in `VISION.md` as **NG3** so
the trade cannot be quietly reversed by a task.

### The vision in `.flow/` rather than at the repository root — rejected

Superficially tidier: Flow's other artefacts live under `.flow/`, so the vision could too.

**Rejected because it would put the anchor on the task plane, where anything can edit it.**
`.flow/tasks/` is `main`-only by design and written by direct commit, and the store-guard actively
fails a PR that touches it — so a vision under `.flow/` would be changed *without review*, by any
session, mid-task. An anchor a drifting session can silently move is not an anchor; it is a mirror.
Root placement inherits the PR-only rule from the code plane at no cost and changes nothing about
ADR-0001.

### Per-task human vision review — rejected (the status quo, and the control that failed)

Keep the two touchpoints and rely on the human to notice drift while approving each spec. No new
field, no new check, no new workflow.

**Rejected because it is the control that observably failed.** Spec approval is per-task, spread
over weeks, and made against whatever the reviewer happens to remember — while drift is only
visible in aggregate. Asking the same touchpoint to work better is the "resolve to be more
careful" fix that G2 exists to reject: every incident should end as a mechanical check, not as an
intention.

### `serves` as an unenforced convention — rejected

Ship the field and the vision, document that tasks should cite a goal, and leave it at that. Cheap,
zero blast radius, no adoption ordering to get right.

**Rejected because an unenforced field decays to noise, and a decayed field is worse than none.**
Once some tasks cite goals and some don't, no reading of the store is trustworthy: compass cannot
tell a starved goal from an uncited one, and a human seeing `serves` populated assumes it means
something. Resolution is cheap to check and never a matter of taste, so it is precisely the kind of
rule that should be mechanical — leaving it to discipline spends nothing and buys nothing.

### A separate drift dashboard for compass findings — rejected

Give compass its own surface: a generated page, or a section of the mission-control view, that
lists open divergences.

**Rejected because it is a second inbox, and a second inbox is a place for things to be
un-triaged.** Issues already are the capture inbox (ADR-0001), triage already runs over them, and
they already carry assignment, labels, closure and a comment trail — the whole apparatus of "a
human decided this." A dashboard would need all of that rebuilt to be useful, and until it was,
findings would accumulate somewhere nobody has a habit of looking. It also violates NG1: a
dashboard is a thing to operate, and anything that has to be operated eventually isn't.

## Consequences

**The costs, stated plainly:**

- **Two new human touchpoints, when reality demands them.** Approving a `VISION.md` PR, and
  triaging compass findings. Both are deliberate — the vision PR *is* the review that makes
  evolution distinguishable from drift, and a compass finding is a decision request, which is the
  one thing this system is supposed to escalate. But they are touchpoints, and G1 is about
  touchpoints holding, so they are named here rather than filed under "benefits".
- **`serves` can be cited lazily.** Nothing stops a task citing G1 because G1 is first in the file.
  The mechanical check cannot detect it — by construction, since detecting it is the judgment the
  teeth budget refuses to gate — so **compass is the only backstop**, which means lazy citation is
  caught weekly at best, and only when it has grown to something material.
- **The vision itself can be written badly.** A vague page makes every `serves` trivially true and
  every compass finding arguable. The layer's whole value rests on one human-written page nothing
  can validate; the `vision-writer` skill exists to raise the floor, not to guarantee it.
- **`flow-doctor` fails store-wide, not per-PR.** It runs over the whole store in the gate job on
  *every* PR, so **one unanchored `ready` task reddens every open PR in the repo** — including PRs
  whose authors cannot fix it, because the store is `main`-only and a PR that edited it would fail
  the store-guard. This is consistent with how every other store-integrity rule behaves, and it is
  a real cost, not a rough edge.

**What follows mechanically from that last one:**

- The ordering is fixed and narrower than it first looks. The check fires only when *both* the rule
  and the anchor exist, so `serves` must be backfilled on every `ready` task **before the doctor
  check merges** — not before `VISION.md` merges.
- **That backfill cannot ride a PR.** The store-guard fails any PR touching `.flow/tasks/`, so it
  is a direct commit to `main`, the same path claims and triage already use.
- `flow-0010`'s final acceptance criterion — every existing `ready` task passes the new checks —
  enforces that ordering as a test rather than as a runbook step, which is the right place for it.

**What it buys:**

- Adoption is graceful in both directions: a repo with no vision stays green, and a repo that
  writes one does not have its history retroactively failed.
- Canonical's own adapter inherits the check for free — `.flow/bin/flow-doctor.mjs` imports the
  template's `runDoctor` and points it at canonical's store — so the repo that authors the rule is
  the first repo governed by it.
- Drift and evolution become distinguishable by an artefact rather than by argument: a merged
  vision PR, or its absence.

## Future work — recorded, not silently omitted

- **Cross-checking `serves` against `touches`.** The obvious next mechanical rule: does the file
  surface a task declares match the goal it claims to serve? **Not being built, and the reason is
  the teeth budget.** `maintenance` has no declared file surface at all, and goals do not map onto
  paths in general, so the check could only ever be a heuristic — and a heuristic that hard-fails
  is exactly what this ADR spends its argument rejecting. If it is ever built, it belongs in
  compass's advisory tier, not in `flow-doctor`.
- **A `[vision]` PR title yields no task id, and that skip is legitimate.** `parse-task-id` matches
  `[A-Za-z][A-Za-z0-9]*-\d{1,4}`, so `[vision] …` resolves to nothing and `touches-guard` skips the
  scope check — which is correct: a vision PR has no task, and demanding one would make the anchor
  unchangeable. This is recorded because the path looks like a hole. `flow-0008` hardens the guard
  against *silent* skips while explicitly preserving "a legitimate skip stays a pass"; anyone
  tightening that guard further must keep this path open, or vision changes become unmergeable.
- **Compass calibration is unproven.** Weekly cadence and the materiality bar are first guesses.
  Too noisy and it gets ignored; too quiet and it misses the drift it exists to catch. Adjust from
  observed findings, not from theory.

## What would void this decision

- **The `serves` check starts failing on judgment rather than fact** — a rule lands that two honest
  readers could resolve differently. The budget has been overspent; roll it back to advisory.
- **Compass findings are routinely closed without a decision.** Either the bar is wrong or nobody
  is reading; both are worth knowing, and neither is fixed by making it block.
- **A second person joins.** Every trade here assumes a single operator who reviews their own
  vision PRs. Multi-user changes who approves what, and this ADR is not written for it — see
  **NG4**.
