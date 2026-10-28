---
id: "research-before-scoping"
title: "A question can be researched as Flow work before anything is scoped, with the findings reviewed and decided in inflight"
status: "proposed"
created: "2026-10-28"
source: "Dan, Claude Code chat, 2026-10-28"
serves: ["G11", "G12"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

> "I was discussing with Jaime the other day about supporting windows machines as TanPlan link host
> rather than them having to use a PI. I'd like to conduct research into this before scoping and
> planning any work. Does this fit in flow?"

> "Do they become pr's though or are they special type of task for humans and agents to review in
> tool rather than in CI?"

— Dan, Claude Code chat, 2026-10-28.

## Cost of inaction

Evidence (not Dan's words): Flow has no research stage. An intent records an outcome someone
wants, so it comes after research. A task is done when its PR passes the gate and the qa,
code-review and security reviewers. TanPlan works around this with a `spike` label
(tanplan-0122) and a loose `research/` folder, but a spike PR still runs the build and test gate
and three code reviewers over a Markdown file, and what it actually produces, a decision, has
nowhere to go.

[assumption] Without a research stage, an open question either turns into build work before
anyone knows the answer, or stays in chat where it is lost.

## Outcome

Dan (or Jaime) can hand Flow a question, get back findings that answer it with a recommendation,
and review and decide on them in inflight, without reading a code review. Accepting the findings
is what lets intents and tasks be written from them.

## Constraints

- [assumption] Findings live in the repo, versioned, like everything else Flow produces, and the
  task store's two-planes rule holds: findings are not committed straight to `main`.
- [assumption] The decision on findings is a decision ask, one card with a recommendation (G12),
  answerable in inflight. This builds on inflight-0050 (CandidDan/inflight, `.flow/tasks/inflight-0050-act-from-screen.md`).
- [assumption] Findings are checked by a reviewer suited to research (every question answered,
  sources cited, a recommendation stated), not by the build and test gate. See the intent
  `reviewer-matches-the-change`, proposed in PR #247.
- [assumption] Research never writes intents or tasks itself. It informs them.

## Open questions

- Whether research is a new task kind or a label on an ordinary task.
- Whether findings reach `main` through a PR that inflight merges when the decision is accepted,
  or some other way.
- Whether Jaime, who may not use GitHub, can review and decide in inflight.
- Which repo the findings live in when a question spans repos.
