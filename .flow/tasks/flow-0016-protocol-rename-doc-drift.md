---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0016"
title: "Clear the doc drift left by the protocol rename, and add the check that would have caught it"
status: "ready"
priority: 4
project: "flow"
owner: ""
created: "2026-08-19"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G4"]            # drift surfaced by a check rather than by a surprise
touches: ["project-template/README.md", "project-template/.flow/bin/flow-sync.mjs", "project-template/.flow/bin/pick-task.mjs", "project-template/.flow/PROTOCOL.md", ".flow/bin/protocol-portability.test.mjs"]
labels: [docs, infra]
notes:
  - "2026-08-19: created at the human's request after flow-0006 (PR #15, merged). All three sites were found while building flow-0006 and deliberately NOT fixed there — each is outside that task's touches and would have failed touches-guard. This task exists because the human asked for one, not because anything is broken: nothing here changes behaviour, and criterion 5 is the part with lasting value."
  - "2026-08-19: sequencing — depends on flow-0006, which is merged, so project-template/.flow/PROTOCOL.md exists on main and this is genuinely ready. touches verified disjoint against every other ready task on 2026-08-19: flow-0005 owns flow-init.mjs/.test.mjs + INIT.md, flow-0008 owns touches-guard.mjs + main-module.test.mjs, neither of which appears here; flow-0002/0003/0007/0012/0013/0014 share no path at all. Renumbered from 0015 to 0016 — flow-0015 (canonical runs its own automation) landed on main while this was being written, caught by flow-doctor's duplicate-id check rather than by a collision later; its touches are disjoint from these (it owns .flow/bin/flow-state.mjs and .flow/bin/adapters.test.mjs, this owns .flow/bin/protocol-portability.test.mjs)."
---

## Context

flow-0006 moved the protocol out of `project-template/CLAUDE.md` and into
`project-template/.flow/PROTOCOL.md`, leaving `CLAUDE.md` and `AGENTS.md` as thin pointers. The
move itself is proved lossless by `.flow/bin/protocol-portability.test.mjs`, and the gate was green.

Three references to the old arrangement survived, all of them outside that task's declared
`touches` and so correctly left alone rather than silently swept up:

1. `project-template/README.md:14` still describes `CLAUDE.md` as *"The protocol. The contract Code
   reads every session."* It is now neither — it is a pointer, and what it points at is what gets
   read. This is the one a human is most likely to trust, because the README is where someone looks
   to find out what the files are.
2. `project-template/.flow/bin/flow-sync.mjs:14` and `project-template/.flow/bin/pick-task.mjs:4`
   cite `CLAUDE.md` in header **comments** (`CLAUDE.md "Hard rules"`, `the Flow loop (CLAUDE.md)`).
   Harmless to the machine — flow-0006's criterion 5 is about code, and its test is comment-aware —
   but they send a reader to a file that no longer contains what they were promised.
3. The *Response style* section inside `.flow/PROTOCOL.md` still says Claude Code worker sessions
   *"auto-load this file"*. Since flow-0006 that is one hop out of date: the host file auto-loads,
   and imports this one. It was left verbatim on purpose — flow-0006's criterion 1 required every
   `##` section to be byte-identical to the pre-move original, so correcting it there would have
   failed that task's own gate.

The reason this is worth a task rather than a tidy-up is criterion 5. Three sites drifted from one
rename and none of them was caught by anything — they were found by hand, while building something
else. G4 asks for drift surfaced *by a check rather than by a surprise*, so the durable deliverable
here is the check; the three fixes are what proves it works.

## Scope

- Correct the `CLAUDE.md` entry in `project-template/README.md`, and add a `.flow/PROTOCOL.md`
  entry, so the file listing describes the arrangement flow-0006 actually shipped.
- Repoint the two header comments in `flow-sync.mjs` and `pick-task.mjs` at `.flow/PROTOCOL.md`.
  Comments only — **no behaviour changes in either helper.**
- Correct the one stale sentence in the *Response style* section of `.flow/PROTOCOL.md`.
- Record that correction honestly in `.flow/bin/protocol-portability.test.mjs` (see *Notes* for the
  required approach — this is specified, not left open).
- Add a drift check to the same test file: no shipped Markdown in `project-template/` may describe
  `CLAUDE.md` as the protocol.

Deliberately **not** in scope: rewording any other part of the protocol (flow-0006 moved it
verbatim and it should stay that way — a general edit pass is its own task, with its own review);
`project-template/CLAUDE.md` and `AGENTS.md`, which flow-0006 wrote and which are already correct;
and anything in canonical's own root `CLAUDE.md` or `.flow/bin/` adapters.

## Acceptance criteria

- [ ] Given `project-template/README.md`, when its file-listing entry for `CLAUDE.md` is read, then it describes `CLAUDE.md` as a pointer and does not call it the protocol, and a separate entry names `.flow/PROTOCOL.md` as the protocol.
- [ ] Given `project-template/.flow/bin/flow-sync.mjs` and `project-template/.flow/bin/pick-task.mjs`, when their comments are read, then neither cites `CLAUDE.md` as the location of a protocol rule, and each cites `.flow/PROTOCOL.md` instead.
- [ ] Given the two helpers above, when the existing suite runs, then their behaviour is unchanged — every test that passed before this task still passes, and the diff for both files touches comment lines only.
- [ ] Given the *Response style* section of `project-template/.flow/PROTOCOL.md`, when it is read, then it states that the host file auto-loads and imports the protocol, and no longer claims that worker sessions auto-load this file.
- [ ] Given any Markdown file shipped under `project-template/`, when it is scanned for a description of `CLAUDE.md` as the protocol, then none matches — and the check fails loudly if one is reintroduced.
- [ ] Given the full gate, when it runs, then all five commands pass and coverage stays at or above `coverage_min`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **How to record the PROTOCOL.md edit — decided, do not re-litigate.** `PRE_MOVE_SECTION_DIGESTS`
  in `.flow/bin/protocol-portability.test.mjs` pins that flow-0006's move was byte-for-byte
  lossless, and criterion 4 deliberately breaks the *Response style* digest. Do **not** simply
  overwrite that digest: that would erase the record of what the section originally said, which is
  the only thing making the pin worth having. Instead add a second, separately documented map —
  `INTENTIONAL_DIVERGENCES`: section heading → `{ digest, why, task }` — and have the assertion
  prefer it when an entry exists, falling back to the pre-move digest otherwise. Both facts then
  stay visible: what the section was at the move, and what it is now plus why it changed.
- **Criterion 5 needs a pattern, not a literal string.** Match the *claim*, not one phrasing —
  e.g. `CLAUDE.md` within a short span of "the protocol" / "the contract". Aim it at prose only:
  `project-template/CLAUDE.md` legitimately mentions its own name, and `INIT.md` / `RETROFIT.md`
  legitimately instruct the reader to edit `CLAUDE.md`. A check that fires on those is a check
  someone switches off, so exclude by construction and state the exclusions in the failure message.
- The comment fixes are one line each. If either helper needs a behaviour change to make its
  comment true, stop — that is a different task, and this one's third criterion forbids it.
- Nothing here is urgent: priority 4 keeps it below the vision-layer work (flow-0012/0013/0014 at
  P3) rather than jumping the queue. Raise it if the README line starts misleading adopters.
