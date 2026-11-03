---
id: "pr-text-plain-english"
title: "Dan can read the top of a PR and know what problem it fixes and what changes for whom"
status: "proposed"
created: "2026-11-04"
source: "Dan, orchestrator chat 2026-11-04"
serves: ["G10"]
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

On reading the description of PR #285 in this repo (flow-0197):

> "What is this in plain english"

After being given a plain-English rewrite:

> "OK that is good, why didn't we just write it in plain english. Ithought we had that as a rule?"

On adding a model-based reviewer for PR text:

> "the reviewer judge can be a low cost model though right?"

— Dan, orchestrator chat, 2026-11-04.

Evidence (not Dan's words):

- The plain-English rule already exists. `project-template/.flow/PROTOCOL.md`, "Response style",
  was added by flow-0168 and covers PR descriptions.
- PR #285's TL;DR opened with internal names (carry-inputs, $PREV, pin-callers, flow-0076) and
  with the mechanism, not the problem it fixed. The problem was that a sync was deleting a repo's
  own Node security pin.
- Nothing checks PR text. The qa, security and code-review checks review code only, so the
  session that wrote the code is the only judge of its description.
- VISION.md G10 records that PR text is long and often not plain English, so the
  approve-the-merge touchpoint is weaker than a green check makes it look.

## Cost of inaction

[assumption] Dan keeps approving merges on text he cannot read without asking for a rewrite, so the
approve-the-merge touchpoint stays as weak as G10 records it. The plain-English rule stays a rule
that nothing enforces.

## Outcome

Dan can read the top of any Flow PR and know, without reading code, what problem it fixes and what
changes for whom. A PR whose summary does not do that is flagged before he reaches it, at low model
cost.

## Constraints

- The judge uses a low-cost model (Dan's words above).
- It must not make PR review materially more expensive (G9: tokens and CI minutes).
- Out of scope: a product's own user-facing text. This matches the existing carve-out in the
  protocol's "Response style".
- [assumption] It judges the PR description only, not code comments, commit messages or task specs,
  although the existing rule also covers those.
- [assumption] It sits beside the qa, security and code-review checks on the PR and does not replace
  or change them.

## Open questions

- What does "flagged" mean: a failing check that blocks the merge, or a visible warning Dan can
  overrule?
- What exactly makes a summary pass: no internal names, the problem stated before the mechanism, or
  something else?
- Which part of the PR description is judged: the TL;DR only, or the whole text?
- Who is the reader the judge imagines, Dan only or any reader who has not seen the repo?
- When a PR is flagged, does the author session rewrite it automatically, or is it left to a human?
- Does this apply to every repo that adopts Flow, or start in canonical only?
