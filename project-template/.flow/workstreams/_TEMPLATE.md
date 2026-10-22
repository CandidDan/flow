---
# ── machine fields (flow-doctor and flow-state read these; a human writes them) ──
id: ""                    # kebab-case slug, identical to the filename without `.md`.
                          # Cited by name from an intent's `workstream:` field, so it is a word
                          # a reader can open, not a number. flow-doctor warns when it differs
                          # from the filename (ADR-0009 §9).
title: ""                 # one line, in the human's words. The name a stakeholder would use.
created: ""               # YYYY-MM-DD
serves: []                # the VISION.md goal ids this workstream serves, e.g. ["G1"].
                          # Same ids and the same resolution rules as an intent's `serves`.
                          # Usually ONE: a workstream serving three or more goals is probably
                          # two workstreams, and flow-doctor warns at three. `[]` is allowed
                          # for exploration and is flagged ("not tied to a goal"), never failed.
                          # A workstream no goal covers adds the goal to VISION.md in the same
                          # PR as this file — case (b) of the three-way test (ADR-0009 §3).
status: "active"          # active | done | retired — those three values and no others.
                          # SET BY HAND. Whether a workstream is finished or abandoned is a
                          # human call: "every intent is done" is not "this is delivered"
                          # (more intents may be coming), and retiring one is a decision, not
                          # an observation. Progress (intents done, in progress, blocked) is
                          # DERIVED by flow-state and never stored here (ADR-0009 §5).
owner: ""                 # optional. Who answers for this workstream, if anyone does.
---

> **Membership lives on the intent, not here.** An intent joins this workstream by naming this
> file's `id` in its own `workstream:` field. This file never lists its intents: one source of
> truth for membership (ADR-0009 §1). Tasks never name a workstream; they name the intent they
> derive from, and the intent names the workstream. Merging the PR that adds this file is its
> approval. A repo with no `.flow/workstreams/` at all is valid, and a `workstream:` left empty
> on an intent is never a finding (ADR-0009 §7).

## Purpose

What this workstream delivers and when it is done, in the human's words. One paragraph: a
*purpose* has an end ("Launch AU. Done when the first AU salon is live."), where a goal has none.
The why lives in VISION.md, under the goals named in `serves`, and is not repeated here.

## Constraints

The boundaries every intent in this workstream lives within, one bullet each, each citing the
decision it comes from (an ADR, a dated conversation, a contract). Written once, here, so no
intent repeats them. A constraint true of only one intent belongs on that intent, not here.

## Dependencies

Gates outside this workstream, one bullet each, with a date and what slips if the date is missed.
A dependency on another workstream is a bullet starting `workstream: <id>` — workstreams run in
parallel and sometimes wait on each other, and flow-doctor warns when the id names no workstream.

## Open questions

What is genuinely undecided, written as questions. Surfaced here, never resolved here: an answer
is a decision for the human to make in a PR, not for a session to fill in.
