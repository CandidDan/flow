---
id: "work-readable-outside-the-project"
title: "Dan can share planned work with someone outside the project, and a developer can read a task cold"
status: "proposed"
created: "2026-11-04"
source: "Dan, orchestrator chat 2026-11-04"
serves: ["G7"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

> "From a Flow perspective how do we ensure there is a layer the is consumable by all is it the
> intent layer? I realised I could not share the tasks easily with external as they would not
> know what they are about. But also for tasks so a dev can actually read them and understand?"

— Dan, orchestrator chat, 2026-11-04.

Evidence (not Dan's words):

- A task file is written for a worker session. `.claude/skills/task-writer/SKILL.md` asks for
  given/when/then criteria, `touches` globs and a model tier. Nothing in it asks for a summary a
  person outside the project could read.
- The task template's `## Context` section says it holds "the problem in the human's words", but
  nothing checks that it does, so a task can open straight on mechanism.
- An intent already holds the problem, the cost of inaction and the outcome in plain words. It is
  the closest thing Flow has to a shareable layer. But it lives as a Markdown file in git, so a
  person without repo access cannot read it, and it does not show the state of the work derived
  from it.
- Intents are optional. A repo that has not adopted them has no plain-words layer above its tasks
  at all.

## Cost of inaction

[assumption] Dan keeps rewriting work by hand, or explaining it on a call, every time someone
outside the repo needs to know what is being built. Developers joining a project read task files
that only make sense to the session that wrote them, and ask questions the store should have
answered.

## Outcome

Dan can send someone outside the project a link or a page, and that person can say what is being
built, why, and how far along it is, without opening the repo or asking him.

A developer who has never seen the project can open any task and say in one sentence what it is
for, before reading its criteria.

Stated so it can fail: if Dan still has to translate a task or an intent before sharing it, the
intent was not met.

## Constraints

- Flow stays a protocol (VISION.md NG6). Any page a person views is a support actor, which today
  means inflight, not canonical. Canonical's part is that `flow-state --json` carries enough for
  something else to render it (G7).
- The worker spec must not get vaguer. Task criteria stay precise and testable; a plain summary is
  added alongside them, not traded for them.
- It must not make writing or reviewing a task materially more expensive (G9).
- [assumption] The plain summary follows the same rules as a PR's TL;DR in the protocol: no
  backticks, no file paths, no task ids, no code names, at most 60 words.
- [assumption] It applies to new tasks only. Existing tasks are not backfilled, for the same reason
  `serves` and `intent` are not.

## Open questions

- Who is "external": a client, a contractor, a new developer, or all three? The answer decides
  whether the shared page shows tasks at all, or only intents and their progress.
- Is the shared view of an intent a page in inflight, an export Dan sends, or both?
- Should the plain summary on a task be checked mechanically by `flow-doctor`, by the PR-text judge
  from `pr-text-plain-english`, or not checked at all?
- In a repo that has not adopted intents, what is the shareable layer? Is this a reason to make
  intents the default for every adopting repo?
- No VISION.md goal names "the work is readable by people outside it". Is that part of G7, or a
  goal the vision is missing?
