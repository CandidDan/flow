---
id: "vision-stays-true"
title: "A VISION.md stays true for months and reads plainly to someone new to the project"
status: "proposed"
created: "2026-11-03"
source: "Dan, Claude Code chat, 2026-11-02 and 2026-11-03"
serves: ["G13"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

> "I'm getting the feeling more and more that the information encoded into a vision is wrong. if
> you look at tanplan-platforms vision.md it has things about specific dates and points that
> become stale almost immediately."

> "My view for the vision was what are we building e.g. a full os for running a salon it should
> be more of a method statement than a set of rules? Mainly to ensure we don't start building a
> calculator for tax, is what we're building 3 months down the line still true to the visision or
> has the vision changed as it does sometime"

> "the vision should always be writen in clear plain english as well so a human reader can just
> pick it up and think ah this makes sense"

— Dan, Claude Code chat, 2026-11-02 and 2026-11-03.

## Cost of inaction

Evidence (not Dan's words): on 2026-11-03, three of the eight goal and non-goal entries in
TanPlan's VISION.md (CandidDan/tanplan-platform) were out of date: G1 named a 15 October 2026
conference, G5 a 29 October 2026 cutover, and NG3's reason was "not needed by 16 October". The
same file refers to "Streams 0, A, B and D", "Q-001", "phases 4 to 11" and "0023", none of which a
reader can look up from the file.

[assumption] A vision full of expired milestones is the one a drift audit cannot use: flow-compass
reports work against goals that already ended, the noise teaches the reader to ignore it, and the
tax-calculator feature gets built without anything objecting.

## Outcome

Dan can open any adopting repo's VISION.md months after it was written and it still says what the
project is, for whom, and what it deliberately does not do, with nothing in it that has expired. A
person new to the project can read it cold, explain it back, and use it to turn down a plausible
feature that does not belong.

## Constraints

- [assumption] Time-bound work keeps a home: a milestone with an end date belongs in a workstream
  (`.flow/workstreams/`, ADR-0009), which already says "a purpose has an end, where a goal has
  none". This intent moves dated material there; it does not ban it from the repo.
- [assumption] Plain English does not mean no specialist terms. A term the project needs (TanPlan's
  Bookable, Allocated and Billable) stays, defined in the sentence where it first appears.
- [assumption] The checks are warnings, never failures. Whether a sentence will still be true in
  a year is a judgement; flow-doctor can flag the mechanical signs (a date, an internal id) and
  leave the call to the human. This keeps NG3's successor position: judgement reports, it does not
  block.
- `project-template/` is published API; the change reaches every adopting repo at the next tag.
- The goals in any repo's VISION.md stay the human's words. Nothing here rewrites an existing
  vision; adopting repos amend their own through `vision-writer` and a `[vision]` PR.

## Open questions

- Should the three-part test (still true in a year; readable cold; every refusal carries a
  reason) live in the VISION.md template, in `vision-writer`, or both?
- What exactly counts as an internal id for a flow-doctor warning: task ids, `Q-` numbers, stream
  and phase labels, file paths? Too wide a net warns on every vision and gets ignored.
- Should canonical's own VISION.md be brought into line in the same work? Its goals carry
  "*Failing today*" lines, which describe a moment rather than a direction.
- Does flow-compass need to change, or does it read a cleaner vision as-is?
