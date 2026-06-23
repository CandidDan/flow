---
name: task-writer
description: Turn a human's direction into well-formed, ready-to-work task files in .flow/tasks/. Use this whenever the orchestrator (a Cowork session) is decomposing a goal, feature, or piece of direction into work for Claude Code — i.e. any time you're about to create or edit a task, write a backlog, "break this down", "spec this out", or plan what Code should build next. A task is only `ready` when it could be handed to a fresh session with zero further questions; this skill enforces that bar.
---

# task-writer

The orchestrator's single most important output is not "a task" — it's a task that is
**ready**: one a fresh Claude Code session can complete without coming back to ask a
question. Under-specified tasks are exactly where autonomous work stalls and bounces back
to the human. This skill is the discipline that prevents that.

## Where authority sits
The human decides *what matters* (priority, direction) — never invent priorities. You
decide *decomposition* — how a goal becomes a sequence of ready tasks. If a goal is
ambiguous about intent, ask the human one sharp question; if it's only ambiguous about
implementation, that's yours to specify.

## Procedure
1. Read `.flow/tasks/_TEMPLATE.md` (the canonical shape) and `.flow/config.yml` (the project's
   id prefix lives in `project.name`).
2. Decompose the direction into the smallest tasks that each deliver one observable outcome.
   Prefer several small ready tasks over one large vague one. A task a session can finish in a
   focused sitting is the right grain.
3. For each task, write a file `NNNN-slug.md` with full frontmatter and body. Allocate the next
   id number; set `status: ready`, `priority` (from the human's signal, default 3), `created`.
4. **Acceptance criteria are the work.** Each must be observable and testable, phrased
   given/when/then where it helps. If you can't write a test for a criterion, it's not a
   criterion yet — sharpen it. The worker writes one test per criterion, so vague criteria
   produce vague tests and a failed gate.
5. State scope boundaries explicitly — what the task does NOT touch. This is what stops scope creep.
6. Sequence: if task B depends on A, note it and leave B at lower priority or a `blocked` note
   until A lands. Keep a queue of `ready` tasks so the worker never runs dry.

## Triaging the inbox (GitHub Issues -> ready tasks)
GitHub Issues are the **capture inbox**: zero-friction logging of bugs and ideas from anywhere,
with whatever context existed at the moment of capture. They are never worked directly, and
nothing enters `.flow/tasks/` un-approved — that's what keeps "ready means ready" trustworthy.
The sweep (run by the `flow-triage` routine, or you on demand) processes each open issue through
three lanes:

- **Propose** (default): draft a complete ready-task spec — full template shape, readiness bar
  applied, the issue is raw material not a spec — and post it **as a comment on the issue**,
  labelling the issue `proposed`. Do not create a task file. The human approves by flipping the
  label to `approved` (a one-tap act, from anywhere); the next sweep converts.
- **Convert**: for issues labelled `approved`, create the ready task file (next id, `issue:` set
  to the issue url, commit to `main`), and swap the label to `triaged`. Close the issue when the
  task's PR merges.
- **Auto-ok**: issues the human has labelled `auto-ok` (a pre-authorised policy lane for the
  genuinely mechanical — typos, dep bumps) skip the proposal wait: convert directly. The human's
  authority is exercised per-lane here, not per-item — never apply `auto-ok` yourself.

Not worth doing? Close it with one line saying why. Unclear intent? Ask the question in an issue
comment rather than proposing a guess. Untouched issues are counted by the flightdeck as queue
debt, so capture never silently rots. Never copy an issue into a task verbatim — "3 trust-busting
bugs in checkout" is capture; a ready task names the behaviour, the boundary, and the criteria
that prove the fix.

## The readiness test (apply to every task before saving)
Ask: *could I hand this to a brand-new session, with no other context, and would it produce
the right thing without asking me anything?* If no — what would it ask? Answer that in the
task. Repeat until the answer is yes. Only then is `status: ready` honest.

## Pre-flight (run before you save a batch)
These are the misses that *read* fine but bounce a task downstream — they're mechanical, so check
them mechanically rather than trusting a plausible-sounding narrative:

1. **`touches` is complete.** List every file the *scope* says this task will change, and confirm
   each is matched by a `touches` glob. A file named in the scope but absent from `touches` trips
   `touches-guard` and blocks the PR — it is the single most common cause of a bounced/blocked task.
2. **"Parallel-safe" is proven, not asserted.** Before calling two tasks parallel, actually
   intersect their `touches` lists. If they share *any* path — a classic one is two tasks both
   editing the same page/router to mount into it — they are NOT parallel: sequence them, or
   restructure so each owns a distinct file. Never write "no overlap" you haven't checked. ("Different
   component directory" is not the same as "disjoint touches" — the shared mount file is the trap.)
3. **Stays on the store plane.** A task only commits to `main` (the store). Code and content
   changes — *including* docs like a synopsis or README — are the worker's branch+PR, never a direct
   orchestrator edit to `main`. If something needs a doc changed, that's a task, not a side-edit.

Then run `node .flow/bin/flow-doctor.mjs`: it computes `touches` overlap across the live set, so a
false "parallel-safe" surfaces as a warning before any worker claims — but the checklist above is
how you avoid writing it in the first place.

## Don't
- Don't bundle multiple outcomes into one task to "save files." Split them.
- Don't write implementation steps as if you're the worker — specify the *what* and the
  *acceptance*, leave the *how* to the worker unless a specific approach is genuinely required.
- Don't set `done`/`in_review` — those are the worker's and the merge's transitions.
- Don't leave a real open decision inside a `ready` task. Decide it (or ask the human), then write it.

After writing or changing tasks, regenerate the board with the **board-builder** skill so the
human's view reflects the new state.
