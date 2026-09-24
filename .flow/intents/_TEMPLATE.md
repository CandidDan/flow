---
# ── machine fields (the intent-writer skill and flow-doctor read/write these) ──
id: ""                    # kebab-case slug, identical to the filename without `.md`.
                          # Not a number: intents get cited by name in prose, and a number tells
                          # a reader nothing about what they are opening. flow-doctor checks the
                          # field is present and that no two intents share it — it does NOT yet
                          # check it matches the filename (ADR-0007, "what was left unchecked").
title: ""                 # one line, in the human's words. What they want, not how to build it.
status: "proposed"        # proposed | approved | superseded
                          # Vocabulary only. flow-doctor checks this field is PRESENT and nothing
                          # more; nothing reads the value yet (ADR-0007, slice 4).
created: ""               # YYYY-MM-DD
source: ""                # whose words the Problem section holds, and how they were captured:
                          #   "Dan, interviewed 2026-09-17"
                          #   "Sam (reader), issue #42"
                          #   "transcription of the 2026-09-12 call"
                          # VISION.md's `## Open` records "where a reader's feedback lands" as
                          # undecided for the project as a whole. This field answers it per
                          # intent, so the global question can stay open without any single
                          # intent being ambiguous about whose words it holds.
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

## Problem

The problem in the human's words, captured as `source` above says they were captured. What is
wrong or missing today, for whom, and what it costs them.

No solution here. An intent that names its implementation has skipped the only question it
exists to ask.

## Outcome

The **observable change in the user's situation, behaviour, or operating environment** that makes
this intent worth pursuing — **not a delivered artefact**.

"A dashboard exists" is not an outcome. It is a thing that was built, and it is true the moment
the work merges whether or not anything improved. "I can see, without asking, which repos need a
decision from me, and I stop losing a day a week to finding out" is an outcome: it is about the
person, it is observable from outside the repo, and it can turn out to be false.

Write it so that someone who never reads the diff can tell whether it happened.
