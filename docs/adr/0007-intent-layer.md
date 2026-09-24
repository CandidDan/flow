# ADR-0007: The intent layer — a store on the code plane, a template that says whose words it holds, and a checker with no teeth

**Status:** Accepted
**Date:** 2026-09-24
**Deciders:** Dan (inspirator / sole maintainer)

## Context

`VISION.md` declares **G11 — Work traces to a stated intent**, and marks it *Failing today*:
"planned work enters as `status: ready` with no record of who asked for it or why." The same
2026-09-07 amendment rewrote the Purpose paragraph so Flow's headline description now reads
**two touchpoints — approve the intent, approve the merge**.

One of those two touchpoints does not exist. There is no `.flow/intents/`, no template, no
`intent:` field on a task, no skill that produces one, and nothing in `flow-doctor` that could
see one if it did. The protocol advertises a control with no implementation anywhere in the repo.

This is the same class of failure as G10 — a green gate on wrong work — and arguably worse.
`VISION.md` is the drift anchor. When the anchor describes a mechanism that does not exist, every
task that resolves `serves` against it is anchored to a document that is partly aspirational, and
the artefact claims a property it does not provide.

**ADR-0004 is the working precedent, and this ADR is deliberately its shape one level down.** The
vision layer settled three things that transfer without re-argument: a root-level anchor on the
**code plane**, changed only by PR; a **mechanical** resolution check in `flow-doctor`; and an
explicit **teeth budget** limiting how hard that check may bite. Where this ADR says "the same
posture as the vision layer", that is the reference.

**What this ADR does not reopen.** ADR-0001 stands: `.flow/tasks/` on `main` remains the store for
task state, and the intent store's placement is chosen precisely so that invariant is untouched.
ADR-0004 stands in full; `serves` and `intent` answer different questions (which goal, whose ask)
and neither replaces the other.

## Decision

Adopt an intent layer in **four slices**, and build only the first.

### The four slices, and why only one is written

1. **This one.** The store `.flow/intents/`, a `_TEMPLATE.md` that fixes its shape, and a
   warn-only validator in `flow-doctor`. It makes nothing fail that did not fail before.
2. **`intent:` on tasks**, resolving against the store — warn-first, exactly as `serves` was
   rolled out.
3. **An `intent-writer` interview skill**, the counterpart to `vision-writer`.
4. **CI stamping the approval record on merge** — writing `approved_by` and `approved_at` from
   the merge event.

Slices 2 and 4 are *not written as tasks*, deliberately. Both depend on decisions this ADR
settles, and queuing them now would be speculation dressed as a plan. Slice 3 exists as
`flow-0072` and is explicitly blocked on this one's template shape.

### 1. `.flow/intents/` is on the CODE plane, and that is already true without changing anything

`plane-guard.mjs` sets `STORE_PREFIX = ".flow/tasks/"`, and its comment is explicit that the
prefix is deliberately not `.flow/`. So `.flow/intents/` travels on a branch and lands by PR,
with no guard change required.

That is the correct home, and the reason is the same one ADR-0004 gives for putting `VISION.md`
at the root. An intent is an artefact a human **approves**, and a reviewed PR is already exactly
that. Task state is different in kind: it is metadata that every concurrent session must see
immediately, which is why it is committed straight to `main` and why a branch that edits it fails
the gate. Intents behave like the vision, not like task state.

A worker who finds themselves editing `plane-guard` has left the layer's scope.

### 2. The merge is the event; `approved_by` / `approved_at` are its projection

The question raised at spec time was whether there is room for **both** a frontmatter field and
the PR merge as the approval record. There is — provided one of them is the event and the other
is a projection of it. Two independent sources of truth drift the first time someone hand-edits
the field, and the drift is silent because both look authoritative.

So: **the merge is the event.** `approved_by` and `approved_at` are the machine-readable record,
and CI writes them from the merge rather than trusting what an author typed. That is the shape
`flow-status` and `flow-done` already use for task state — a pattern the repo has, not a new one.

The consequence for *this* slice is that both fields ship **unvalidated**. An intent is unapproved
by definition for as long as its PR is open, which is the one moment anyone looks at it; a checker
that demanded them today would fail the layer's entire happy path. The CI half is slice 4.

### 3. `source:` converts an open question into data rather than answering it

`VISION.md`'s `## Open` section records "Where a reader's feedback lands" as undecided, and says
it "decides whose words an intent's Problem section holds, which the intent template currently
assumes is one person's." That sentence describes a template that did not exist — the
`vision/intent-layer` branch touched `VISION.md` and nothing else.

Rather than forcing the project-level decision, the template carries a **`source:`** field naming
whose words each intent holds: the operator, a named reader, a transcription of a call. The global
question stays open in `VISION.md`; **each intent answers it locally**. Amending that `## Open`
item is a vision PR with its own review, and is not this layer's to make.

### 4. The Outcome section is about the person, not the artefact

The template's success section is **Outcome**, and the template's own guidance defines it as *the
observable change in the user's situation, behaviour, or operating environment that makes this
intent worth pursuing — not a delivered artefact*. "A dashboard exists" is given as the
non-example, because it is true the moment the work merges whether or not anything improved.

This is a wording choice with teeth of its own kind: an outcome written as a delivered artefact
makes intents solution-shaped, and a solution-shaped intent has skipped the only question it
exists to ask. Fixing it in the template costs nothing today and is expensive once intents exist.

### Evidence lives in separate records, linked through `evidence`

An approved intent's body is **never revised after the fact.** Results must not overwrite the
thing that was approved — that is precisely the property G11 asks for ("an approved intent
survives contact with the tasks derived from it, rather than being rewritten once the work
starts"). An intent whose Problem section has been quietly edited to match what shipped is no
longer a record of what was asked for; it is a record of what happened, which the git history
already holds.

So the template carries **`evidence: []`** — an append-only list of repo paths to *separate*
evidence records, written after the work ships. It starts empty, it is only ever appended to, and
nothing in this slice reads it. Two records, one immutable and one growing, beat one record that
is edited.

A malformed `evidence` is a **warning**, not a problem, for the reason in the next section.

### The validation contract: deferred to a pilot in the Later repo

A fuller "validation contract" section for the template — stating up front how an intent's outcome
would be *measured* — was proposed in the same review that produced the `evidence` list. It is
**deferred**, not rejected.

The reason is that canonical is the wrong place to discover whether a template section earns its
keep. Every section added here is imposed on every adopting repo at the next tag, and a section
that turns out to be ceremony is much harder to remove than to add. So it is piloted in the Later
repo first, against real intents written by the operator, and promoted to canonical only if it
earns it. That is the same "measure it here, then ship it" posture `.flow/config.yml` already
records for the coverage floor.

### Grandfathering: forward-only

**Decision: the layer applies to work scoped after it lands, and to nothing before it.**

G11's test is "pick any merged PR and read, in the repo, the intent it came from". That test fails
for all 40 `done` tasks and all 21 open ones on the day this merges. Retro-fitting would mean a
session inventing the human's past reasons — which is exactly the failure `VISION.md`'s own change
log records for G1–G5: "written by a model from the README and the ADRs rather than extracted from
the human, and reached `main` inside a docs PR (#11) rather than reviewed as a vision." An intent
layer whose first intents are model-written reproduces that failure one level down.

This is stated as a decision rather than left as an omission, so that a reader who runs G11's test
against history and finds it failing knows they have found the rule, not a bug.

### Teeth: none in this slice

**Decision: nothing this slice adds can fail a gate that was passing.**

ADR-0004's teeth budget is the governing argument, and its void condition is "the check starts
failing on judgment rather than fact". A hard `intent:` requirement on tasks would redden all 11
`ready` tasks the day it merged — every one of them written before intents existed.

What `flow-doctor` checks is therefore shape, and only shape:

| Situation | Verdict |
|---|---|
| No `.flow/intents/` directory | **WARN** once, and check nothing else (the layer is inactive) |
| `.flow/intents/_TEMPLATE.md` | Excluded — the published shape is not an instance of itself |
| Frontmatter does not parse | **FAIL**, naming the file |
| A required field (`id`, `title`, `status`, `created`, `source`) missing or empty | **FAIL**, naming the file and the field |
| Two intents declaring one `id` | **FAIL**, naming the id and both paths |
| `approved_by` / `approved_at` empty | **Nothing** — unvalidated by design (see decision 2) |
| `evidence` absent, or an empty list | **Nothing** — both mean "no evidence gathered yet" |
| `evidence` declared but not a list of paths | **WARN**, naming the file |

Whether an intent is a *good* intent is judgment, and nothing here reads a word of the prose.
Slice 2 decides how hard `intent:` bites; this slice deliberately does not pre-empt it.

**What was left unchecked, and would have been free.** `flow-doctor` does not check that an
intent's `id` matches its filename, and does not check `status` against the vocabulary the
template documents (`proposed` / `approved` / `superseded`). Both are mechanical, both are two
lines, and both are teeth this slice has no budget for — a rule added because it was cheap is the
exact mechanism by which a teeth budget is overspent. They are recorded here so that adding them
later is a decision someone takes, not a gap someone patches.

### The triage collision: deferred, not overlooked

**Decision: `_flow-triage.yml` is out of scope here, and named as follow-up.**

Triage turns GitHub issues into proposed tasks today. That is a path into the queue that bypasses
intents entirely. If intents ever become the only door into the queue, triage must either produce
an intent or be explicitly exempt — and which of those is right is a question about the triage
subsystem, not about the intent store.

Deciding it in this slice would widen a store-and-template task into the triage lane. It is
recorded here because the path looks like a hole, and a reader who finds it should see that it was
seen.

## Alternatives rejected

- **`.flow/intents/` on the task plane, committed straight to `main`.** Symmetric with
  `.flow/tasks/`, and wrong for the same reason `VISION.md` is not in `.flow/`: it would let any
  session change an intent mid-task with no review, which destroys the approval touchpoint the
  store exists to create. The plane split already gives intents the review they need for free.
- **Intents as GitHub issues, or as a label on them.** ADR-0001 settled the store question for
  tasks; the argument transfers. More importantly, issues are the *capture inbox* — things that
  are wrong. An intent is a thing we want, and G11 says intents live in the repo "because that is
  what makes the accountability visible." A GitHub label is not visible in a checkout.
- **Writing the first intents in this task, so the store ships non-empty.** Rejected outright.
  Model-written intents are the G1–G5 failure repeated one level down (see *Grandfathering*). The
  only intent file this slice creates is `_TEMPLATE.md`; the interview skill is slice 3.
- **Shipping all four slices as one task.** The layer is too large for one review, and slices 2
  and 4 depend on decisions this ADR settles. A four-deliverable task is the shape the readiness
  bar exists to catch.
- **A hard `intent:` requirement now, with a grandfather list.** Tempting because it delivers G11
  immediately, but a check whose correctness depends on a hand-maintained exemption list rots the
  first time someone forgets to add to it — and it spends the whole teeth budget on the slice with
  the least evidence behind it.
- **One record that is updated with results, instead of an intent plus separate evidence.**
  Simpler, and it loses the property G11 names: an intent that is rewritten once the work starts
  no longer records what was asked for. See *Evidence lives in separate records*.

## Consequences

- G11 has somewhere to live, and a checker that can see it. The goal is not yet *met* — slices 2,
  3 and 4 are what meet it — but the protocol's headline sentence is no longer describing a
  directory that does not exist.
- Every adopting repo stays green on adoption. A repo with no `.flow/intents/` gets one warning
  and nothing else, and `flow-init` carries the template into new repos automatically because it
  copies the whole `.flow/` tree.
- The approval record has one source of truth from the start, so slice 4 has nothing to undo.
- `flow-0072` (the `intent-writer` skill) can now resolve its declared dependency: the template
  fixes the frontmatter it must write.
- The deferred items are findable. Anyone who wonders why history has no intents, why the checker
  does not bite, or why triage is untouched, reads this file rather than guessing.

## What would void this decision

- **The store fills with model-written intents.** The layer would then be recording the model's
  reasons rather than the human's, which is worse than recording nothing — it looks like
  accountability and is not. Stop, and delete them.
- **Approved intents start being edited after their merge.** The immutability of the approved body
  is the property G11 is actually asking for; `evidence` exists so that nobody needs to. If the
  edits happen anyway, either the template is wrong about what belongs in the body, or the layer
  is not being used as designed.
- **The shape checks start failing on judgment rather than fact** — ADR-0004's void condition,
  inherited verbatim. If a rule lands here that two honest readers could resolve differently, the
  budget has been overspent; roll it back to advisory.
- **Intents become a second queue.** If people start working straight from `.flow/intents/` rather
  than from `ready` tasks, the layer has grown a lane it was not meant to have, and the one-queue
  invariant in ADR-0001 is the thing being lost.
- **A second person joins.** ADR-0004's caveat applies unchanged: every trade here assumes a
  single operator who approves their own intent PRs. Multi-user changes who approves what, and
  this ADR is not written for it — see **NG4**.
