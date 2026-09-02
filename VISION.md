# Vision — Flow

**This file is the drift anchor.** Every task's `serves:` resolves against a goal id declared here.
Changes are PRs only — never a direct commit to `main`, and never bundled into a feature PR where
the diff goes unread. The human approves the merge; that approval is what makes this the vision.

## Purpose

Flow came out of how Dan actually works with Claude: discuss an idea in Cowork, write a PRD or a
task, make a handoff, paste it into a Claude Code session. It worked, but it was lengthy and had
too much of him in it. Flow is the protocol built to fix that — **agent delegation with the trust
moved out of prompts and into CI.** Tasks are Markdown files on `main`; a worker claims one and
opens a PR; CI, not a prompt, enforces scope, tests and coverage; there are two touchpoints —
approve the task, approve the merge.

**Flow is a protocol, not a tool.** Dan runs several projects at once, so what Flow has to earn is
a smooth workflow across all of them — and *easy* is the bar, not merely possible.

**Audience: a solo tool today.** A product is a **live possibility, deliberately not built for
yet** — not ruled out, and not a thing to design against. A second user is **preserved, not built
for**: the design should not foreclose one, and nothing is built to serve one. Teams are a shape of
multi-user and are covered by that same word.

**Git-native is how Flow works today, not a commitment.** If state ever needs to live outside the
repo, that is open rather than settled.

**An AI judgement may turn the gate green, but it sits on top.** Tests, coverage and scope must
still pass on their own; no AI verdict can make a red build green, and where something genuinely
needs human eyes it tags the repo owner. That is what keeps the sentence above true.

## Goals

### G6 — Sessions are identifiable and resumable
You can tell which agent session is working which task, and pick one up without rebuilding its
context from scratch.
**Progress looks like:** every in-flight task names the session working it; after a gap you read
the task and know where you were. *Failing today* — several sessions per project, all named
"Next open task".

### G7 — A Flow repo reports its own state
A repo running Flow can answer, on demand, what is in flight in it and where the build has got to —
completely enough that something else can render it without asking the repo's owner.
**Progress looks like:** ask a Flow repo what is in flight and get a straight answer. *Failing
today* — "I couldn't tell you what is in flight in a project and build-wise where it is up to."
**Cross-project aggregation is not this goal.** That is a consumer of it, and not Flow's job.

### G8 — Holds at scale
Flow keeps working as projects get bigger and structurally more complex, including ones not yet
conceived.
**Progress looks like:** a repo with several build surfaces — an admin app and a customer app in
one repo — runs Flow without special-casing, and the gate can stand up whatever the work actually
needs to be verified (Postgres today, Docker next) rather than passing because it could not check.

### G9 — Not materially expensive to run
Running Flow on a project does not burn tokens badly enough to say something has gone wrong.
**Progress looks like:** you look at what a task cost and do not wince. No threshold is set
deliberately; if one is ever set, it belongs here.

### G10 — The gate tells the truth
When CI says green, the work is actually right: correct scope, real tests, coverage that means
something. A green gate on wrong work is the protocol failing.
**Progress looks like:** *nothing reliable yet, and that is the finding.* Detection today is by
hand — noticing something off in the acceptance criteria, or reading the code. PR text is long and
often not plain English, so the approve-the-merge touchpoint is weaker than a green check makes it
look. No mechanism currently exists that would catch a gate that lied.

## Non-goals

### NG6 — Flow becomes a tool
Flow is a protocol and stays one. Anything with a surface is a **support actor** that serves the
protocol — never the place work is managed.
**Reason:** the protocol stays the protocol. When the support-actor version is not enough, the
answer is to adopt something that already exists (Linear), not to grow Flow into it. Every single
feature looks small; this is what stops the slide.
**Test:** does this make Flow where work lives, or does it serve the protocol? And does it still
leave you opening the repos?

### NG7 — The merge is automated
The merge stays human. A flag may exist, but a flag must never be the thing that decides it —
flipping it for real is an amendment to this file, not a config change.
**Reason:** an AI verdict can now turn the gate green (see Purpose), which makes the merge the only
place left where a human decides anything. Removing it removes the last touchpoint.

## Retired

### G1 — Two touchpoints hold under load
### G2 — A green gate is worth believing
### G3 — Direction survives the work
### G4 — What canonical says is what the fleet runs
### G5 — You always know where the work is, and whether the machinery is alive
### NG1 — A platform
### NG2 — A second writable store
### NG3 — Semantic judgment with teeth in CI
### NG4 — A product
### NG5 — A second implementation of the protocol's logic

**Retired 2026-09-01.** All ten were written by a model from the README and the ADRs rather than
extracted from the human, and reached `main` inside a docs PR (#11) rather than reviewed as a
vision. Three are explicitly reversed by the interview that replaced them: **NG4** (a product is a
live possibility), **NG2** (git-native is not a commitment), and **NG3** (an AI judgement may turn
the gate green, on top of the mechanical checks). Ids are kept reserved forever; tasks still
pointing at them surface as warnings, which is the intended signal.

## Open — recorded, not decided

- **The shape of the cross-project view.** Wanted, genuinely unexplored. Deliberately not written
  as a prohibition: "we might one day" is not a non-goal, and a fake one rejects nothing.
- **Touchpoint 1 does not fire on the direct-authoring path.** The issue-inbox path proposes a
  spec and waits for approval; `task-writer` writes `status: ready` straight into `.flow/tasks/`.
  Drift against the Purpose paragraph above, and a task rather than a goal.

## Change log

| Date | Change | Why |
|---|---|---|
| 2026-09-01 | Vision rewritten from a `vision-writer` interview. G1–G5 and NG1–NG5 retired; G6–G10 and NG6–NG7 declared. | The previous vision was model-written from the repo's own documents, never extracted from the human, and merged inside a docs PR. It stated that "the audience is a decision, not an assumption" while being exactly the assumption it warned against. Goals here are the human's words; NG4, NG2 and NG3 are reversed on his instruction. |
