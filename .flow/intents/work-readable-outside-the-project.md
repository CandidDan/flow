---
id: "work-readable-outside-the-project"
title: "Dan can share tasks with people outside the project, and developers can read and understand them"
status: "approved"
created: "2026-11-04"
source: "Dan, orchestrator chat 2026-11-04"
serves: ["G7"]             # [assumption] G7 was chosen by the writer, not Dan; see the last open question
workstream: ""
supersedes: ""
approved_by: "CandidDan"
approved_at: "2026-11-05T08:18:03Z"
evidence: []
---

## Problem

> "From a Flow perspective how do we ensure there is a layer the is consumable by all is it the
> intent layer? I realised I could not share the tasks easily with external as they would not
> know what they are about. But also for tasks so a dev can actually read them and understand?"

— Dan, orchestrator chat, 2026-11-04.

## Cost of inaction

[assumption] Dan keeps rewriting work by hand, or explaining it on a call, every time someone
outside the repo needs to know what is being built. Developers joining a project read task files
that only make sense to the session that wrote them, and ask questions the store should have
answered.

[assumption] Why the cost above is likely, from what the writer found in the repo (not Dan's words):

- [assumption] A task file is written for a worker session. The task-writer skill asks for
  given/when/then criteria, `touches` globs and a model tier, and for no summary a person outside
  the project could read.
- [assumption] The task template's `## Context` section says it holds "the problem in the human's
  words", but nothing checks that it does, so a task can open straight on mechanism.
- [assumption] An intent already holds the problem, the cost of inaction and the outcome in plain
  words, but it lives as a Markdown file in git, so a person without repo access cannot read it,
  and it does not show the state of the work derived from it.
- [assumption] Intents are optional. A repo that has not adopted them has no plain-words layer
  above its tasks at all.

## Outcome

[assumption] Dan can show someone outside the project what is planned, and that person can say what is being
built, why, and how far along it is, without opening the repo or asking him.

[assumption] A developer who has never seen the project can open any task and say in one sentence what it is
for, before reading its criteria.

[assumption] Stated so it can fail: if Dan still has to translate a task or an intent before sharing it, the
intent was not met.

## Constraints

- [assumption] Flow stays a protocol (VISION.md NG6), so any page a person views is a support
  actor outside canonical. Canonical's part is that `flow-state --json` carries enough for
  something else to render it (G7).
- [assumption] The worker spec must not get vaguer. Task criteria stay precise and testable; a plain summary is
  added alongside them, not traded for them.
- [assumption] It must not make writing or reviewing a task materially more expensive (G9).
- [assumption] The plain summary follows the same rules as a PR's TL;DR in the protocol: no
  backticks, no file paths, no task ids, no code names, at most 60 words.
- [assumption] It applies to new tasks only. Existing tasks are not backfilled, for the same reason
  `serves` and `intent` are not.

## Open questions

- Who counts as "external"? The answer decides whether what they see includes tasks at all, or
  only intents and how far along they are.
- How should someone outside the project receive what they are shown?
- Does anything need to check that a task's plain summary is actually plain?
- In a repo that has not adopted intents, what is the layer a person outside the project reads?
- No VISION.md goal names "the work is readable by people outside it". Is that part of G7, or a
  goal the vision is missing?
