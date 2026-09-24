---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0074"
title: "intent: on tasks — a ready task names the intent it derives from (warn-first, forward-only)"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-09-24"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waiting on flow-0063 (PR #105): this is slice 2 of the intent layer, and ADR-0007, which settles its rollout and grandfathering, is in that PR and not yet approved. Unblock when flow-0063 is done; if the ADR changed at approval, reconcile the notes below with it first."
blocked_by: ["flow-0063"]
serves: ["G11"]
touches:
  - "project-template/.flow/tasks/_TEMPLATE.md"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/README.md"
  - "project-template/.flow/config.yml"
  - ".flow/config.yml"
  - ".flow/bin/intent-derivation-docs.test.mjs"
  - "changes/flow-0074.md"
labels: [intent-layer, protocol, flow-doctor, task-writer]
notes:
  - "2026-09-24 (orchestrator): ORIGIN. Written from `_private/intent-layer-drafts/tasks-derive-from-intents.md` (2026-09-03), which predates flow-0063 and ADR-0007. The human asked for it on 2026-09-24. ADR-0007 says slices 2 and 4 are deliberately not written until the ADR settles their decisions. It now does (warn-first rollout, forward-only grandfathering, merge as the approval event), but it is unmerged, hence `blocked` rather than `ready`. The notes below record every place this task departs from the draft, so a worker does not reintroduce the draft's version."
  - "2026-09-24 (orchestrator): DECIDED: 'APPROVED' MEANS 'PRESENT ON main', NOT `status: approved`. The draft required the named intent to have `status: approved` and failed on `proposed`. Under ADR-0007 that cannot work. Intents live on the code plane and reach `main` only by a merged PR, and the merge IS the approval event. Nothing flips `status` to `approved` until slice 4 (CI stamping). The template ships `status: \"proposed\"`, and ADR-0007 says nothing reads that value yet. So an intent file that exists in `.flow/intents/` on `main` is approved by construction. Do not read `status` for approval; `approved_by`/`approved_at` stay slice 4's."
  - "2026-09-24 (orchestrator): DECIDED: WARN-FIRST, WITH ONE FAIL. ADR-0007 says slice 2 is 'warn-first, exactly as `serves` was rolled out', and ADR-0004's teeth budget forbids failing on judgment. So: (a) a missing `intent` on an in-scope ready task is a WARNING. Escalating it to a failure is a later task, once intent-derived tasks exist to justify it. (b) A NON-EMPTY `intent` that names no intent file is a FAILURE on a `ready` task and a warning otherwise. That is a fact check (a typo or a dangling id), it cannot redden any existing task (none carry `intent` today), and it mirrors `serves`' unresolvable-id rule in ADR-0004. (c) An intent whose `status` is `superseded` is a WARNING. If the human wants (b) to be a warning too at approval, the change is one line and one test; it is recorded here so the rejection is cheap."
  - "2026-09-24 (orchestrator): DECIDED: FORWARD-ONLY GRANDFATHERING IS A DATE IN CONFIG, NOT A LIST. ADR-0007 rejects a hand-maintained grandfather list because it rots. The draft's open question (date cutoff vs one-off backfill) is settled against backfill: backfilling means a session inventing the human's past reasons, which ADR-0007's Grandfathering section rules out. So: a new config key `intents.required_from: \"YYYY-MM-DD\"`. The missing-intent warning applies only to `ready` tasks whose `created` is on or after it. Each adopting repo sets its own date when it adopts intents. In `project-template/.flow/config.yml` ship the key commented out, with a comment explaining it. In canonical's `.flow/config.yml` set it to the date this PR is opened. With a store present and the key absent, emit ONE warning that the intent rule is inactive and name the key. With no `.flow/intents/`, add nothing beyond flow-0063's existing absent-store warning."
  - "2026-09-24 (orchestrator): DECIDED, dropped from the draft. (1) APPENDING THE TASK ID TO THE INTENT'S `tasks` LIST. The intent template has no such field (flow-0073 dropped it). Writing to an approved intent from the store plane would also revise an approved record outside a PR, which ADR-0007 forbids. The link is one-directional, task → intent. (2) Using `status: proposed` as a failure (see above)."
  - "2026-09-24 (orchestrator): NOT IN SCOPE, KNOWINGLY: the triage lane. ADR-0007 defers 'the triage collision'. Triage turns issues into tasks without an intent. Under this task, a triage-made task that serves a product goal on or after the cutoff will WARN. That is acceptable under warn-first, and it keeps the collision visible rather than hidden. Do not edit the task-writer SKILL's 'Triaging the inbox' section or `_flow-triage.yml`. Deciding triage's answer (produce an intent, or be exempt) is its own task."
  - "2026-09-24 (orchestrator): does NOT depend on flow-0073 (that adds intent-side `serves` and sections; this task only needs the file to exist and its `id`/`status`). Both edit `flow-doctor.mjs`, as does flow-0052, so flow-doctor will flag the overlap. Sequence them; do not run them in parallel."
---

## Context

G11 (VISION.md): *work traces to a stated intent*. VISION.md's 2026-09-07 amendment changed Flow's
first touchpoint from approve-the-task to approve-the-intent: "approve the intent, approve the
merge". flow-0063 gives intents a store (`.flow/intents/`, on the code plane, approved by merging
their PR) and ADR-0007 lays out four slices. flow-0072 (the interview skill) and flow-0073 (the
template additions) are queued.

**This task is slice 2, and it is the one that moves the touchpoint.** Without it, intents are
optional. A task can still be written with no intent, nothing notices, and the human keeps
approving task specs. G11's test ("pick any merged PR and read the intent it came from") cannot
start passing until a task records which intent it came from.

Why the touchpoint can safely leave the task: a badly scoped task derived from a well-approved
intent is caught by `touches-guard`, the review checks and the merge, which exist for exactly that.
Work nobody asked for was never caught anywhere, and that is what this task makes visible.

## Scope

**Does:**

- **Task template** (`project-template/.flow/tasks/_TEMPLATE.md`): add `intent: ""` next to
  `serves`, documented in the same style. It holds the id of the intent this task derives from,
  that intent must exist in `.flow/intents/` on `main`, and it is empty only for `maintenance`
  work or for tasks created before the repo's `intents.required_from` date.
- **flow-doctor** (all rules active only when `.flow/intents/` exists):
  - A `ready` task with empty `intent`, a `serves` naming anything other than `maintenance`,
    and `created` on or after `intents.required_from` → **WARNING** naming the task id.
  - `serves: ["maintenance"]` (only `maintenance`) with empty `intent` → nothing reported.
  - A non-empty `intent` that matches no intent file's `id` → **PROBLEM** on a `ready` task,
    **WARNING** on any other status, naming the task and the id.
  - A non-empty `intent` resolving to an intent with `status: superseded` → **WARNING**.
  - `.flow/intents/` present but `intents.required_from` unset → exactly **one** warning that
    the missing-intent rule is inactive, naming the key.
- **Config**: `intents.required_from` in both config files, as the notes specify.
- **task-writer/SKILL.md** (Procedure section only): a task that serves a product goal starts
  from an intent already on `main`. Set `intent` to its id. If no such intent exists, say so to
  the human and stop. The skill must not write the intent itself, because that would put
  authoring and approval in one session; point at the `intent-writer` skill. `maintenance`
  work needs no intent. Add `intent` resolution to the Pre-flight list.
- **PROTOCOL.md**: rewrite the touchpoint paragraph at the top so the human approves the
  **intent** up front and the PR at the end, and add the matching rule to "Hard rules". Leave
  "The loop you run" alone unless a sentence there contradicts the new wording.
- **README.md**: correct the "Nothing enters `.flow/tasks/` un-approved, so touchpoint 1 survives
  automation" passage so it doesn't contradict the new touchpoint 1. Keep the triage description.
- Write the changelog fragment `changes/flow-0074.md`.

**Does not touch:**

- Any existing task file: no backfill (forward-only; see notes).
- The intent template or any intent file; intent-side rules (flow-0063, flow-0073).
- `approved_by` / `approved_at` or any CI stamping (slice 4).
- The triage lane: `_flow-triage.yml`, and task-writer's "Triaging the inbox" section.
- `pick-task.mjs`: a missing intent never stops a task being picked.
- Any failure for a missing `intent`. It is a warning in this slice.

## Acceptance criteria

- [ ] Given a repo with `.flow/intents/`, `intents.required_from: "2026-10-01"` and a `ready`
      task created `2026-10-02` with empty `intent` and `serves: ["G1"]`, when `flow-doctor`
      runs, then it emits a warning naming the task id and exits 0.
- [ ] Given the same repo and a `ready` task created `2026-09-30` with empty `intent`, when
      `flow-doctor` runs, then nothing is reported for that task's `intent`.
- [ ] Given a `ready` task with `serves: ["maintenance"]` and empty `intent`, when `flow-doctor`
      runs, then nothing is reported for its `intent`.
- [ ] Given a `ready` task whose `intent` names an id no intent file declares, when
      `flow-doctor` runs, then it reports a problem naming the task and the id and exits
      non-zero. Given the same on an `in_progress` task, then it is a warning and exits 0.
- [ ] Given a `ready` task whose `intent` names an existing intent with `status: proposed`, when
      `flow-doctor` runs, then nothing is reported (presence on `main` is approval).
- [ ] Given a task whose `intent` names an intent with `status: superseded`, when `flow-doctor`
      runs, then it emits a warning naming both.
- [ ] Given a repo with `.flow/intents/` and no `intents.required_from`, when `flow-doctor` runs,
      then it emits exactly one warning naming the key, and no per-task missing-intent warnings.
- [ ] Given a repo with no `.flow/intents/`, when `flow-doctor` runs, then no intent rule adds
      anything beyond flow-0063's existing absent-store warning.
- [ ] Given the shipped task `_TEMPLATE.md`, when its frontmatter is parsed, then it contains
      `intent` as an empty string, and flow-doctor reports nothing for the template.
- [ ] Given `task-writer/SKILL.md`, then its Procedure requires an existing intent for
      product-goal work, forbids writing the intent in the same session, names `intent-writer`,
      and exempts `maintenance`.
- [ ] Given `PROTOCOL.md` and `README.md`, then the first touchpoint is stated as approving the
      intent, and neither still says the human approves the task spec up front.
- [ ] Given canonical's `.flow/config.yml`, then `intents.required_from` is set, and
      `flow-doctor` on canonical reports no problem from the new rules.
- [ ] Given `changes/flow-0074.md`, then it exists and describes the change.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- The SKILL/PROTOCOL/README criteria are doc assertions. Prove them in
  `.flow/bin/intent-derivation-docs.test.mjs`, following `.flow/bin/protocol-docs.test.mjs`.
  It is a new `.mjs` file, so `git add` it before trusting `npm run lint`.
