---
id: "review-runs-on-any-agent"
title: "Any review can be moved between Claude and Codex at any time, and every review stays as impartial and accurate as possible"
status: "approved"
created: "2026-11-01"
source: "Dan, Claude Code chat, 2026-11-01"
serves: ["G10", "G9"]
workstream: ""
supersedes: ""
approved_by: "CandidDan"
approved_at: "2026-11-01T02:05:43Z"
evidence: []
---

## Problem

On approving the three-part review cost plan:

> "Approve all 3 but we need to ensure this doesn't break our agent agnostic stance. We should be
> able to switch any review to codex and vice-versa at anytime"

On a proposal to run qa, code-review and security as one shared model session:

> "We just need to ensure every review is as impartial and accurate as possible, a shared session
> for 3 reviews feels like we're opening the door for slopiness to be introduced"

— Dan, Claude Code chat, 2026-11-01.

## Cost of inaction

Evidence (not Dan's words):

- Every reviewer in `.github/workflows/_flow-review.yml` (qa, code-review, security,
  intent-review, guide) runs `anthropics/claude-code-action`. Nothing under `.github/`,
  `project-template/` or `.flow/bin/` mentions Codex: no review in canonical, or in any adopting
  repo, can run on Codex today.
- The protocol already promises portability on the worker side only.
  `project-template/.flow/PROTOCOL.md` says:

  > And **the reviewer no longer has to be your vendor**: it is still a model call, but it is a
  > model call in CI, so an agent of any lineage can do the work and get the identical checks.
  > That is the portability this buys — not a vendor-neutral reviewer.

  So the agent-agnostic stance Dan names holds for who does the work, and stops at who reviews it.
- Task flow-0186 (on `main`) moves qa, code-review and security into one runner job, each keeping
  its own model invocation and PR check, with each verdict written to a vendor-neutral file
  (`$RUNNER_TEMP/flow-review/<check>.json`). Its notes record that Dan's condition rules out one
  shared session, and that it "only removes the Claude-specific coupling in how a verdict is
  read". It is a precondition for this intent, not a delivery of it: it does not add Codex.
- Task flow-0187 (on `main`) is a spike measuring off-runner review options for both Claude and
  Codex, including how Codex is billed (ChatGPT plan or API tokens).
- Dan earlier rejected moving reviews to direct API calls, because API tokens cost more than
  runner minutes and the reviews currently run on the Claude subscription.

[assumption] Without this, the cost work in flight (flow-0186, flow-0187) settles the review
onto one vendor by default, and switching later means undoing it rather than flipping a choice.

## Outcome

Dan can move any single review (qa, code-review or security) from Claude to Codex, or back, at
any time, and every review stays as impartial and accurate as it can be, whichever vendor runs it.

## Constraints

- "we need to ensure this doesn't break our agent agnostic stance" — Dan's own condition on the
  cost plan.
- "We should be able to switch any review to codex and vice-versa at anytime" — Dan's words.
  - [assumption] Read as: per review, not all-or-nothing; switching one review does not change
    the others.
  - [assumption] Read as: switching is a configuration change, not a code change to Flow.
- "every review is as impartial and accurate as possible" — Dan's words.
- "a shared session for 3 reviews feels like we're opening the door for slopiness to be
  introduced" — Dan's words.
  - [assumption] Read as: each review runs in its own model session, with no context shared
    between reviews, whichever vendor runs each one.
- [assumption] The PR check names stay the same whichever vendor runs a review, so branch
  protection and adopting repos do not change when a review switches.
- [assumption] The gate (G10) does not get weaker: a review on either vendor fails closed the
  same way, and a review that cannot run is red, not skipped.
- [assumption] The rejected-API-cost decision stands: making Codex available does not on its own
  move any review onto per-token API billing (G9).
- [assumption] Adopting repos get this through a canonical release, as published API, not a local
  patch.

## Open questions

- How Codex is billed when it runs a review in CI, and whether that conflicts with Dan's earlier
  rejection of API-token billing for reviews.
  - [assumption] Running Codex in CI may bill API tokens unless its ChatGPT-plan sign-in works
    without a person present. flow-0187 is measuring this; nothing here decides it.
- Whether a review run on Codex should be calibrated against the Claude reviewer (for example on
  the same PRs) before its verdict is trusted to block a merge.
- Who chooses the vendor for each review: each repo in its own `.flow/config.yml`, a canonical
  default, or both.
- Whether intent-review and the review guide are in scope, or only the three verdict-giving
  reviews Dan named.
