---
# ── machine fields (the intent-writer skill and flow-doctor read/write these) ──
id: ""                    # kebab-case slug, identical to the filename without `.md`.
                          # Not a number: intents get cited by name in prose, and a number tells
                          # a reader nothing about what they are opening. flow-doctor checks the
                          # field is present and that no two intents share it — it does NOT yet
                          # check it matches the filename (ADR-0007, "what was left unchecked").
title: ""                 # one line, in the human's words. What they want, not how to build it.
status: "proposed"        # proposed | approved | superseded — those three values and no others.
                          # `proposed` is what every intent ships as. Merging its PR is the
                          # approval event (it stamps the two fields below; ADR-0007, slice 4).
                          # `superseded` is what an intent becomes when a later one replaces it
                          # and names it in that intent's `supersedes`.
                          # A value outside the three is a WARNING. Nothing reads the value for
                          # meaning yet — no transition here is automated (ADR-0007, slice 4).
created: ""               # YYYY-MM-DD
source: ""                # whose words the Problem section holds, and how they were captured:
                          #   "Dan, interviewed 2026-09-17"
                          #   "Sam (reader), issue #42"
                          #   "transcription of the 2026-09-12 call"
                          # VISION.md's `## Open` records "where a reader's feedback lands" as
                          # undecided for the project as a whole. This field answers it per
                          # intent, so the global question can stay open without any single
                          # intent being ambiguous about whose words it holds.
serves: []                # the VISION.md goal ids this intent advances, e.g. ["G1", "G3"].
                          # Same ids, same resolution rules and the same reserved `maintenance`
                          # id as a task's `serves` — including the three-way test in
                          # `.flow/tasks/_TEMPLATE.md` for when no goal fits: (a) maintenance,
                          # (b) the vision is missing a goal, amend it first, (c) drift being
                          # born. Never reach for the nearest plausible id.
                          # An id VISION.md does not declare is a WARNING, never a failure. With
                          # no VISION.md the vision layer is inactive and nothing is reported
                          # per intent — one repo-level warning covers it.
supersedes: ""            # the id of the intent this one replaces, empty if none.
                          # An approved intent's body is never revised (ADR-0007), so a changed
                          # mind is a NEW intent naming the old one here. The old one's `status`
                          # becomes `superseded` and its text stays exactly as it was written —
                          # that is what keeps the record of what was asked for, and when.
                          # An id no intent in the store declares is a WARNING.
approved_by: ""           # WRITTEN BY CI, NOT BY HAND. Merging the PR that adds this file is the
approved_at: ""           # approval EVENT; these two are its machine-readable projection.
                          # Both are UNVALIDATED today — flow-doctor reports nothing about them
                          # either way, because an intent is unapproved by definition for as long
                          # as its PR is open. One source of truth, projected; never two.
evidence: []              # APPEND-ONLY list of repo paths to evidence records written AFTER the
                          # work ships, e.g. ["docs/evidence/2026-10-01-signup.md"].
                          # It starts empty and is only ever appended to. An approved intent's
                          # body is never rewritten to match what happened — that is what makes
                          # the record of what was asked for survive contact with what was built.
                          # A malformed value is a WARNING here, never a failure.
---

> **The `[assumption]` marker.** A line beginning `[assumption]` — a list item counts, its text is
> the start of its line — is detail the *writer* supplied that the human never said. Marking it is
> what lets the human strike it or keep it; an unmarked guess reads exactly like something they
> told you, which is the failure this whole layer exists to prevent. Mark every one, in any
> section below **except `## Problem`**, which holds only the human's words and therefore never
> contains an assumption — a problem that needs a guess to make sense is an interview that is not
> finished. flow-doctor never reports these lines at any status, because an intent can be approved
> with assumptions still standing in it. That is the point of marking them, not a gap in the check.

## Problem

The problem in the human's words, captured as `source` above says they were captured. What is
wrong or missing today, for whom, and what it costs them.

No solution here. An intent that names its implementation has skipped the only question it
exists to ask.

## Cost of inaction

What happens if this is never built: who keeps paying, and what it keeps costing them. A sentence
is enough.

This is the first thing to ask and the first thing to lose. "It would be nice to have" and "we
lose a customer a month to this" both read as motivation in a paragraph of prose, and only one of
them is a reason to spend a week. Write the one you were actually told. If the honest answer is
that nothing much happens, that is a finding — record it and let the human decide what it means.

## Outcome

The **observable change in the user's situation, behaviour, or operating environment** that makes
this intent worth pursuing — **not a delivered artefact**.

"A dashboard exists" is not an outcome. It is a thing that was built, and it is true the moment
the work merges whether or not anything improved. "I can see, without asking, which repos need a
decision from me, and I stop losing a day a week to finding out" is an outcome: it is about the
person, it is observable from outside the repo, and it can turn out to be false.

Write it so that someone who never reads the diff can tell whether it happened.

## Constraints

What any solution has to live within, whether or not anyone would have thought to say it: a
deadline, a budget, a platform, an existing system it must not disturb, a rule it must not break,
a person whose sign-off it needs.

Constraints are not scope. Scope is what gets built and belongs to the task; a constraint is a
boundary that stays true however the work is designed, and it is the thing most often discovered
only after the design is finished.

## Open questions

What is genuinely undecided, written as questions.

**Surface them; never resolve them.** A model answering its own open question converts an
unknown into a decision nobody made — and the answer will be fluent, which is what makes it hard
to spot afterwards. If a question has an obvious-looking answer, the answer goes on an
`[assumption]` line for the human to strike or keep, and the question stays open until they do.

An empty section here is not a blank to be tidied away: it is the claim that nothing about this
intent is uncertain. Make that claim only when it is true.
