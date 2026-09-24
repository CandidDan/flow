---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0063"
title: "Give G11 somewhere to live: an intent store, a template that records whose words it holds, and a flow-doctor check with no teeth yet"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-worker-flow-0063"
created: "2026-09-17"
started: "2026-09-24T06:43:20Z"
branch: "flow/flow-0063-intent-store-and-its-validation"
pr: "https://github.com/CandidDan/flow/pull/105"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G11"]
touches:
  - "docs/adr/0007-intent-layer.md"
  - ".flow/intents/_TEMPLATE.md"
  - "project-template/.flow/intents/_TEMPLATE.md"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "changes/flow-0063.md"
labels: [protocol, vision, intents]
notes:
  - "2026-09-17 (orchestrator): WHY THIS IS SLICE 1 OF 4, NOT THE WHOLE LAYER. G11 is declared in VISION.md and marked *Failing today*, and the same 2026-09-07 amendment rewrote the Purpose paragraph so Flow's headline description now reads `two touchpoints — approve the intent, approve the merge`. One of those two does not exist: there is no `.flow/intents/`, no template, no `intent:` field, no skill, and nothing in flow-doctor that could check one. The whole layer is too large for one task, so it is four: (1) THIS ONE — the store, the template and a warn-only validator; (2) `intent:` on tasks resolving against the store, warn-first exactly as `serves` was rolled out; (3) an `intent-writer` interview skill; (4) CI stamping the approval record on merge. Only (1) is written, deliberately — (2) and (4) depend on decisions this task's ADR settles, and writing them now would be speculation dressed as a queue."
  - "2026-09-17 (orchestrator): THE INTENTS THEMSELVES ARE NOT IN SCOPE AND MUST NOT BE MODEL-WRITTEN. VISION.md's own change log records why G1-G5 were retired: 'written by a model from the README and the ADRs rather than extracted from the human, and reached main inside a docs PR (#11) rather than reviewed as a vision.' An intent layer whose first intents are drafted by a session reproduces that failure exactly, one layer down. `vision-writer` exists as an INTERVIEW skill for this reason, and slice (3) above is its counterpart. This task delivers the empty store and its shape; the only intent file it may create is `_TEMPLATE.md`."
  - "2026-09-17 (orchestrator): THE PLANE QUESTION IS ALREADY ANSWERED BY EXISTING CODE, not by this task. `plane-guard.mjs:75` sets `STORE_PREFIX = \".flow/tasks/\"` and its comment is explicit that the prefix is deliberately not `.flow/`. So `.flow/intents/` is on the CODE plane: it travels on a branch and lands by PR. That is the correct home and needs no plane-guard change — an intent is an artefact a human approves, which is what a reviewed PR already is, and it makes intents behave exactly like VISION.md rather than like task state. A worker that finds itself editing plane-guard has left this task's scope."
  - "2026-09-17 (orchestrator): ON `approved_by` — the human asked whether there is scope for BOTH a frontmatter field and the PR merge as the approval record, and there is, provided one of them is the event and the other is a projection of it. Two independent sources of truth would drift the first time someone hand-edits the field. The design this task's ADR should record: THE MERGE IS THE EVENT, the frontmatter is the machine-readable record, and CI writes the field from the merge rather than trusting what an author typed. That is the same shape `flow-status` and `flow-done` already use for task state, so it is a pattern the repo has rather than a new one. The CI half is slice (4); this task only has to define the fields and leave them unvalidated, which is why the validator is warn-only."
  - "2026-09-17 (orchestrator): THE OPEN QUESTION IS CONVERTED TO DATA RATHER THAN ANSWERED. VISION.md's `## Open` section records 'Where a reader's feedback lands' as undecided, and says it 'decides whose words an intent's Problem section holds, which the intent template currently assumes is one person's.' That sentence describes a template that does not exist — the `vision/intent-layer` branch touched VISION.md and nothing else, which is worth knowing before anyone goes looking for the file it refers to. Rather than forcing the decision, the template gets a `source:` field naming whose words each intent holds (the operator, a named reader, a transcription). The global question stays open in VISION.md; each intent answers it locally. Amending that Open item is a vision PR and is NOT in this task's scope."
  - "2026-09-17 (orchestrator): PROPOSED ANSWERS THE HUMAN MAY REJECT AT APPROVAL, recorded here so the rejection is cheap. (a) GRANDFATHERING: forward-only. G11's test says 'pick any merged PR and read the intent it came from', which fails for all 40 done tasks and all 21 open ones today; retro-fitting would mean inventing the human's past reasons, which is the failure named two notes up. The ADR should state the test applies to work scoped after the layer lands, and say so rather than letting it look like an oversight. (b) TEETH: none in this slice. ADR-0004's 'teeth budget' section is the governing argument and its void condition is 'the check starts failing on judgment rather than fact'. A hard `intent:` requirement would redden all 11 ready tasks the day it merged. Warn-only here; slice (2) decides. (c) TRIAGE COLLISION: out of scope, named as follow-up. `_flow-triage.yml` turns issues into proposed tasks today, which is a path into the queue that bypasses intents entirely. If intents become the only door, triage either produces an intent or is explicitly exempt. Deciding that here would widen this task into the triage subsystem."
  - "2026-09-17 (orchestrator): ADJACENT SIGNAL, NOT THIS TASK'S WORK. flow-doctor currently reports nine tasks serving RETIRED goals (flow-0002, 0003, 0034, 0037 on G5; flow-0016, 0022, 0023, 0030, 0046, 0048 on G4). The vision was rewritten on 2026-09-01 and the queue never followed. It is warnings only, and it is most of the blocked chain. Mentioned because a worker touching the `serves` region of flow-doctor will see it and may reasonably think it is theirs to fix. It is not — it is a store-content problem, not a validator problem, and it wants its own task."
  - "2026-09-23 (orchestrator): AMENDED BEFORE CLAIM, from a Codex review of the Later project relayed by Dan. Two fixes that are cheap in the template now and expensive once intents exist: (a) an outcome written as a delivered artefact ('a dashboard exists') makes intents solution-shaped, so the template's success section becomes **Outcome**, defined as an external observable change; (b) results must never overwrite the approved intent, so the template gains an append-only `evidence: []` list of paths to separate evidence records. A fuller 'validation contract' section was also proposed and is DEFERRED — piloted in the Later repo first, promoted to canonical only if it earns it. The ADR records that; this task does not build it."
  - "2026-09-24 (worker): CLAIMED. `touches` corrected, NARROWED not widened — `CHANGELOG.md` replaced by `changes/flow-0063.md`. This task was written 2026-09-17; the `changes/` directory landed 2026-09-23 (flow-0069) and `.flow/PROTOCOL.md` now states the rule outright: a task's changelog entry goes in `changes/<task-id>.md`, a task never edits `CHANGELOG.md` directly, and `changes/<task-id>.md` is what goes in `touches` — never `CHANGELOG.md`. Same reasoning as flow-0048 recorded on 2026-09-24: the protocol and `changes/README.md` leave nothing to choose, the new path is strictly narrower (no other task can collide on a file named after this one), and `touches-guard` judges the diff against this list, so leaving the stale declaration would fail the gate on a correctly-placed fragment. The Scope bullet still reads `CHANGELOG.md`; it is satisfied by the fragment, which is what lands under `## Unreleased` at release time."
---

## Context

`VISION.md` declares **G11 — Work traces to a stated intent**, and marks it *Failing today*:
"planned work enters as `status: ready` with no record of who asked for it or why." The same
amendment changed the Purpose paragraph's first touchpoint from approve-the-task to
**approve-the-intent**, so the protocol's headline sentence now advertises a control that has no
implementation anywhere in the repo.

This is the same class of problem as G10 (a green gate on wrong work): the artefact claims a
property the mechanism does not provide. It is arguably worse, because `VISION.md` is the drift
anchor — when the anchor describes something that does not exist, every task that resolves
`serves` against it is anchored to a document that is partly aspirational.

The vision layer is the working precedent for the fix. ADR-0004 established: a root-level anchor
on the code plane, changed only by PR; a mechanical resolution check in `flow-doctor`; and an
explicit *teeth budget* limiting how hard that check may bite. An intent store is the same shape
one level down, and this task builds the first slice of it.

**What this task is not.** It does not write any intent, does not add `intent:` to tasks, does not
build the interview skill, and does not make anything fail. It gives G11 somewhere to live and a
check that can see it. See the notes for why the other three slices are deliberately unwritten.

## Scope

**Does:**

- Adds `docs/adr/0007-intent-layer.md` recording the decision, the alternatives rejected, and
  the four-slice sequence — including the three proposed answers (forward-only grandfathering,
  no teeth in slice 1, triage collision deferred) so a reader can see what was decided versus
  what was postponed. It also states, each as a decision with its reason: that evidence lives in
  separate records linked through `evidence`, and an approved intent's body is never revised
  after the fact; and that a validation-contract section is deferred to a pilot in the Later
  repo, with promotion to canonical only if it earns it.
- Adds `.flow/intents/_TEMPLATE.md` (canonical's own store) and
  `project-template/.flow/intents/_TEMPLATE.md` (what an adopting repo receives), carrying at
  minimum: `id`, `title`, `status`, `created`, `source` (whose words the Problem section holds),
  `approved_by` and `approved_at` (both empty and unvalidated in this slice), and
  `evidence: []` — an append-only list of repo paths to evidence records gathered after the work
  ships. It starts empty, and is only ever appended to; it is never used to rewrite the intent
  body. Prose sections: the problem, and an **Outcome** section whose guidance in the template
  itself defines outcome as "the observable change in the user's situation, behaviour, or
  operating environment that makes this intent worth pursuing — not a delivered artefact", with
  "a dashboard exists" given as a non-example.
- Extends `flow-doctor` to read `.flow/intents/*.md`, excluding `_TEMPLATE.md`, and report:
  malformed frontmatter, missing required fields, and duplicate ids.
- Emits exactly one warning and stops when `.flow/intents/` is absent, so every adopting repo
  without an intent store stays green — the same posture flow-doctor already takes toward a
  missing `VISION.md`.
- Records the change in `CHANGELOG.md` under `## Unreleased`.

**Does not touch:**

- `plane-guard.mjs` — `STORE_PREFIX` is already correct (see notes).
- `VISION.md` — amending the `## Open` item is a vision PR with its own review.
- `.github/workflows/**` — no CI change in this slice; the approval stamp is slice (4).
- `_flow-triage.yml` and the triage lane generally.
- The task template, `pick-task.mjs`, or anything that would introduce `intent:` on a task.
- Any actual intent file other than the template.
- A validation-contract section in the template — deferred to the Later pilot (see notes).

## Acceptance criteria

- [ ] Given a repo with no `.flow/intents/` directory, when `flow-doctor` runs, then it emits
      exactly one warning naming the absent store and exits 0.
- [ ] Given an intent file whose frontmatter does not parse, when `flow-doctor` runs, then it
      reports a PROBLEM naming that file's path and exits non-zero.
- [ ] Given an intent file missing a required field, when `flow-doctor` runs, then it reports a
      PROBLEM naming both the file and the missing field.
- [ ] Given two intent files declaring the same `id`, when `flow-doctor` runs, then it reports a
      PROBLEM naming the duplicated id and both paths.
- [ ] Given an intent file with `approved_by` and `approved_at` both empty, when `flow-doctor`
      runs, then it reports neither a problem nor a warning for those fields — the approval
      record is unvalidated in this slice by design.
- [ ] Given `.flow/intents/` containing only `_TEMPLATE.md`, when `flow-doctor` runs, then the
      template is excluded from validation and no problem is reported.
- [ ] Given the shipped `_TEMPLATE.md`, when its frontmatter is parsed, then every field the
      validator requires is present in it — the template cannot describe a shape the checker
      rejects.
- [ ] Given `docs/adr/0007-intent-layer.md`, then it states the grandfathering decision, the
      teeth decision and the deferred triage collision explicitly, each as a decision with its
      reason, not as an omission.
- [ ] Given the shipped intent `_TEMPLATE.md`, when its frontmatter is parsed, then it contains
      `evidence` as an empty list.
- [ ] Given an intent whose `evidence` is absent or an empty list, when `flow-doctor` runs, then
      it reports nothing for that field.
- [ ] Given an intent whose `evidence` is present but not a list of strings, when `flow-doctor`
      runs, then it emits a WARNING (not a problem) naming the file — this slice's no-teeth
      budget holds for `evidence` too.
- [ ] Given the shipped intent `_TEMPLATE.md`, then its Outcome guidance defines outcome as an
      external observable change and includes the "a dashboard exists" non-example.
- [ ] Given `docs/adr/0007-intent-layer.md`, then it states the evidence-linkage decision and the
      validation-contract deferral, each with its reason.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- The validator is warn-only on the approval fields *on purpose*. If writing the check makes it
  obvious that some stricter rule is free, flag it rather than adding it — the teeth budget is
  the one thing ADR-0004 spends its whole argument defending.
- `CHANGELOG.md` overlaps `touches` with several other ready tasks (flow-0045, 0048, 0050, 0052,
  0053, 0054, 0058). They cannot run in parallel; flow-doctor will say so.
- **flow-0052 is the overlap that matters, and it is not just a file collision.** It also touches
  `project-template/.flow/bin/flow-doctor.mjs`, and its subject is *duplicate task ids failing the
  gate* — the same detection this task adds for intents. Whichever lands second should reuse the
  first one's helper rather than writing a parallel implementation, and if flow-0052 lands first,
  the duplicate-id criterion here should be satisfied by extending its code. Sequence them
  deliberately; do not run them together.
- Canonical's `.flow/bin/` are adapters over `project-template/.flow/bin/`. Shared validator
  logic belongs in the template; only the CLI shell belongs in the adapter.
