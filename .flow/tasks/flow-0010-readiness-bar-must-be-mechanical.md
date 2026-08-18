---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0010"
title: "Make the task readiness bar mechanical, so a skipped task-writer can't ship an unready task"
status: "in_review"
priority: 2
project: "flow"
owner: "claude/flow-0010-readiness-bar-pward7"
created: "2026-08-17"
started: "2026-08-18T12:36:00Z"
branch: "claude/flow-0010-readiness-bar-pward7"
pr: "https://github.com/CandidDan/flow/pull/12"
issue: ""
blocked_reason: ""
serves: ["G1", "G2"]      # an approved spec that is really workable, proven mechanically
touches: ["project-template/.flow/bin/flow-doctor.mjs", "project-template/.flow/bin/flow-doctor.test.mjs"]
labels: [infra, integrity]
notes:
  - "2026-08-18: scope widened to fold in the vision layer's `vision-serves` doctor check (was a separate deliverable D3 in the vision-layer handoff, which would have collided on these exact two files). Same bar, same files, same adoption grace. Decisions recorded in docs/handoff-vision-layer-review.md §10.3."
  - "2026-08-17: sibling to flow-0008. Same failure class (a guard that fails open), different guard: flow-0008 hardens touches-guard, this one closes the readiness hole. Independent files, so they can run in parallel."
---

## Context

**The incident that argues for this.** A downstream repo's queue-runner burned three
consecutive worker runs on one task (~$13 each, no PR, `error_max_turns` every time). The
proximate cause was a separate bug in `flow-recover` — but the reason the failure was
*expensive* rather than merely annoying is that the task itself should never have reached a
worker. It bundled four deliverables into one file: scaffold a new Expo/RN app, port design
tokens, build a data layer, and add magic-link auth. No worker finishes that inside a turn
budget, and no gate can pass it, because most of its "criteria" were *"the thing exists"* —
not observable outcomes with proving tests.

**Why it got through.** `task-writer` already forbids exactly this:

> *"Decompose the direction into the smallest tasks that each deliver one observable
> outcome. Prefer several small ready tasks over one large vague one."*
> *"Don't bundle multiple outcomes into one task to 'save files.' Split them."*

So this is not a missing rule. It is an **unenforced** one, and it is unenforced in a
specific, structural way:

1. **The skill may not run.** There are two authoring paths and only one invokes it.
   `_flow-triage.yml` prompts the sweep to follow `.claude/skills/task-writer/SKILL.md`
   *"exactly"*, so the issue → task path is covered. The ad-hoc path — a human telling an
   orchestrator session "spec this out" — is not: `CLAUDE.md` states plainly that a
   Cowork/orchestrator session "does **not** auto-discover this repo's local skills, so
   asking it to 'create a task' will not trigger `task-writer` on its own", and then
   mitigates that by asking the *human* to go read the skill file. That is a workaround,
   not a mechanism.
2. **Nothing downstream re-checks it.** `flow-doctor`'s entire bar is
   `const REQUIRED = ["id", "title", "status", "priority"]` — four frontmatter fields. It
   never reads the task body. A task file with legal frontmatter and a **completely empty
   body** passes `flow-doctor` clean, passes the gate, and gets dispatched to a worker.

Every property that makes a task *ready* — observable criteria, a stated scope boundary, no
unresolved decisions — is therefore checked exactly once, by something that may not run, and
that leaves no trace either way. There is no way to look at a task file and tell whether the
bar was applied.

**This is `flow-0008`'s thesis, applied to a different guard.** That task states it directly:

> *A guard that can fail silently is not a guard; it is a guard-shaped hole.*

`task-writer` is a readiness guard that fails **open**. Same shape as the `touches-guard`
symlink incident: the check didn't run, exit 0, gate green, and nothing anywhere said so.
`flow-0008` hardens the scope guard; this hardens the readiness guard. They touch disjoint
files and can run in parallel.

**Why a structural check and not a size cap.** The obvious reading of the incident is "cap
task size." Rejected deliberately: nothing measurable correlates with difficulty (a 40-file
mechanical rename is broad and trivial; a one-file auth change is narrow and hard), and a
numeric cap gets *satisfied* rather than obeyed — capping at N criteria turns one honest
failure into several PRs that each pass their own gate and only fail on integration. The
property that actually matters is **shippability**: can this task merge alone, green, through
the full gate? A whole-app-scaffold task fails a structural check on its own terms — its
criteria are not observable outcomes — at any size.

## Scope

Add readiness validation to the task-store doctor, and prove it with tests.

**Does:**

- Extend `project-template/.flow/bin/flow-doctor.mjs` to parse the task *body* (it currently
  reads frontmatter only) and validate its shape for `status: ready` tasks.
- Add the checks listed in the acceptance criteria, each classified as PROBLEM or WARNING per
  the existing convention (PROBLEM exits 1, WARNING reports and exits 0).
- Add the **`vision-serves`** check: when a `VISION.md` exists at the repo root, a `ready`
  task's `serves:` frontmatter must resolve against it. This is the same bar from the same
  angle — a task is not ready if a fresh session couldn't say which goal the work serves —
  and it belongs here rather than in a task of its own, which would collide on these exact
  two files. Goal ids are extracted by line regex over `### G<n> — ` / `### NG<n> — `
  headings, never a Markdown parser; `maintenance` is a reserved id that always resolves and
  is never declared in `VISION.md`.
- Cover every new check in `project-template/.flow/bin/flow-doctor.test.mjs`, using the
  existing temp-fixture pattern in that file.

**Deliberately does NOT:**

- **Touch canonical's own `.flow/bin/flow-doctor.mjs`.** It is a thin *adapter* over the
  template's implementation (it exists only to resolve `flowDir` to canonical's real store
  rather than the template fixture). It inherits these checks with no edit. Confirm this
  holds before finishing; if the adapter turns out to duplicate logic, that is a `blocked`
  note for the orchestrator, not a silent widening of `touches`.
- **Change `CLAUDE.md`, `_TEMPLATE.md` or the `task-writer` skill.** `project-template/CLAUDE.md`
  is already claimed by `flow-0006` and editing it here would break the parallel-safety of both.
  Documenting the new checks in the protocol is a follow-up task.
- **Add `serves` to `_TEMPLATE.md`, or teach `task-writer` to fill it.** Those are the
  vision layer's other deliverable and they are a separate task; this one adds the *check*
  only. The check is graceful without them — no `VISION.md` warns rather than fails — so the
  two can land in either order.
- **Judge whether a task genuinely advances the goal it cites.** Mechanical resolution is the
  whole scope: does the id exist, is it active, is it a non-goal. Whether the work really
  serves the goal is `flow-compass`'s job, advisory and out of the gate, by design.
- **Fix the ad-hoc invocation gap itself.** Making an orchestrator session reliably load
  `task-writer` is a different surface (skill discovery, not store validation) and a separate
  task. This task makes the gap survivable, not absent — which is the point: the check must
  hold whether or not the skill ever runs.
- **Promote the existing `ready with empty touches` warning to a problem.** It is arguably a
  readiness failure, but it is a pre-existing deliberate call and changing it would break
  adopting repos for a reason unrelated to this task. Leave it a warning.
- **Judge whether criteria are *good*.** A dependency-free checker cannot assess whether a
  criterion is genuinely observable. It catches a task written freehand that skipped the
  shape entirely — which is what a skipped `task-writer` produces — and nothing more. Do not
  add an LLM call, a heuristic score, or a criteria-count threshold.

## Acceptance criteria

Each applies to `status: ready` tasks unless stated otherwise.

- [ ] Given a ready task whose body has no `## Acceptance criteria` section, when
      `flow-doctor` runs, then it reports a PROBLEM naming the task id and the missing
      section, and exits non-zero.
- [ ] Given a ready task with an `## Acceptance criteria` section containing no `- [ ]`
      items, when `flow-doctor` runs, then it reports a PROBLEM and exits non-zero.
- [ ] Given a ready task whose only criteria are `_TEMPLATE.md`'s unedited placeholders
      (the `- [ ] Given <situation>, when <action>, then <observable outcome>.` line and the
      bare `- [ ] …` line), when `flow-doctor` runs, then it reports a PROBLEM — an
      uncustomised template is not a specified task.
- [ ] Given a ready task whose body is missing `## Context` or `## Scope`, when `flow-doctor`
      runs, then it reports a PROBLEM naming which section is absent.
- [ ] Given a ready task that has all required sections and at least one non-placeholder
      `- [ ]` criterion, when `flow-doctor` runs, then it reports no new PROBLEM or WARNING
      for that task.
- [ ] Given a task whose `touches` contains a glob rooted at a top-level directory that does
      not exist in the repo (e.g. `mobile/**` in a repo with no `mobile/`), when `flow-doctor`
      runs, then it reports a WARNING that the task appears to create a new subsystem and is
      likely more than one task, and still exits 0. Directories in the existing `ROOT_IGNORE`
      set are exempt, as are globs with no directory component.
- [ ] Given tasks with status `in_progress`, `in_review`, `done` or `blocked`, when
      `flow-doctor` runs, then **none** of the body-shape checks above fire for them — the
      bar applies at the point a task is offered to a worker, and must not retroactively fail
      history or break a repo mid-flight.
- [ ] Given a task file whose body is absent entirely (frontmatter only) and whose status is
      `ready`, when `flow-doctor` runs, then it reports a PROBLEM rather than throwing — the
      body parser tolerates malformed input and reports it.
- [ ] Given no `VISION.md` at the repo root, when `flow-doctor` runs, then it reports exactly
      one WARNING that the vision layer is inactive, no per-task `serves` finding fires, and it
      exits 0 — an adopting repo without a vision stays green.
- [ ] Given a `VISION.md` and a `ready` task whose `serves` is missing or empty, when
      `flow-doctor` runs, then it reports a PROBLEM naming the task.
- [ ] Given a `ready` task whose `serves` names an id absent from `VISION.md`, or names a
      non-goal (`NG<n>`) id, when `flow-doctor` runs, then it reports a PROBLEM in each case —
      a task advancing a declared non-goal is drift with a paper trail.
- [ ] Given a `ready` task whose `serves` names a goal listed under `## Retired`, when
      `flow-doctor` runs, then it reports a WARNING and exits 0.
- [ ] Given a `ready` task with `serves: ["maintenance"]`, when `flow-doctor` runs, then it
      reports nothing for that task and performs no `VISION.md` lookup for the entry.
- [ ] Given tasks with status `in_progress`, `in_review`, `done` or `blocked`, when
      `flow-doctor` runs, then the empty-`serves` rule does not fire for them and unknown or
      non-goal ids report as WARNING rather than PROBLEM — the same adoption grace as the
      body-shape checks above.
- [ ] Given a `VISION.md` from which zero `### G<n>` headings can be extracted, when
      `flow-doctor` runs, then it reports a repo-level PROBLEM naming the expected heading
      format — a format change must not silently make every `serves` check vacuous.
- [ ] Given a goal heading written with a hyphen or en-dash instead of an em dash, when
      `flow-doctor` runs, then the goal is still extracted, and given a line matching
      `^### G\d+` that does not match the accepted forms, then it reports a WARNING naming
      that line — one mistyped heading must not vanish silently while the repo-level check
      stays quiet.
- [ ] Given canonical's own task store, when `node .flow/bin/flow-doctor.mjs` runs after this
      change, then every existing `ready` task in `.flow/tasks/` passes the new checks (proving
      the bar is calibrated to real well-formed tasks, not to an idealised one).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- The final criterion is a genuine risk surface: if an existing canonical task fails the new
  checks, that is information, not necessarily a bug in the checker. Report which task and
  which check in the PR description rather than loosening the check to make it pass.
- **The final criterion now enforces an ordering, mechanically.** `serves` was backfilled onto
  every `ready` task in canonical on 2026-08-18, before this check exists, precisely so that
  criterion can pass. On any *other* repo the same rule applies in the same order: backfill
  `serves` first, adopt the check second. `RETROFIT-VISION.md` states it as a runbook step;
  here it is simply a test that fails otherwise.
- **`flow-doctor` fails store-wide, not per-PR.** It runs against the whole store in the
  `flow-tooling` job on every PR, so one unanchored `ready` task reddens every open PR in the
  repo — including PRs whose authors cannot fix it, since the store is `main`-only. That is
  the existing behaviour of every doctor rule and is not changed here, but it is the reason
  the grace and the ordering above are load-bearing rather than polish.
- Rollout tightness is a real trade-off and the human has the call. Land it as specified
  (PROBLEM for body shape, WARNING for the new-subsystem tell). If adopting repos turn out to
  fail widely on first sync, softening to WARNING for a release before promoting is the
  fallback — raise it as a `notes` entry rather than deciding unilaterally.
