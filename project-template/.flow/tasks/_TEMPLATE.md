---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "PROJ-0000"            # <project slug>-<zero-padded number>
title: ""                 # one line, imperative: "Persist discount code across PLP navigation"
status: "ready"           # ready | in_progress | in_review | done | blocked
priority: 3               # 1 = drop everything … 5 = whenever
project: ""               # project slug, lets the flightdeck aggregate across repos
owner: ""                 # session id once claimed; empty while ready
created: ""               # YYYY-MM-DD
started: ""               # full UTC ISO-8601 datetime (2026-08-14T09:23:00Z), set on claim.
                          # NOT a bare date: flow-recover ages the claim off this field and
                          # reads a date-only value as that day's midnight.
branch: ""                # flow/<id>-<slug>, recorded by flow-status when the PR opens
pr: ""                    # PR url, recorded by flow-status when the PR opens
issue: ""                 # origin GitHub issue url, if this task was triaged from the inbox
blocked_reason: ""        # required iff status is blocked
blocked_by: []            # the machine-readable half of `blocked_reason`, never a replacement
                          # for it — a person still needs the sentence. Each entry is either a
                          # task id in this repo ("PROJ-0007") or a PR url, so something other
                          # than a human can tell when the block has cleared.
                          # A `blocked` task should carry at least one entry; if the block
                          # genuinely isn't machine-checkable (waiting on a phone call), say so
                          # in `blocked_reason` using the words "not machine-checkable" and
                          # flow-doctor stops asking.
                          # Clear it when the block clears: flow-doctor reports a populated
                          # `blocked_by` on a live non-blocked task as stale data. On a `done`
                          # task it is history, and is left alone.
serves: []                # the VISION.md goal ids this task advances, e.g. ["G1", "G3"].
                          # Ids come from the repo's own VISION.md — never invented here.
                          # `maintenance` is a reserved id (it is never declared in VISION.md
                          # and always resolves): repo, infra and protocol health that no
                          # product goal names.
                          # Once the repo has a VISION.md, a `ready` task needs at least one
                          # entry — flow-doctor fails a ready task that names none.
                          # Can't name a goal? It is exactly one of three things, and saying
                          # WHICH is the work: (a) maintenance — use the reserved id; (b) the
                          # vision is missing a goal — amend VISION.md first (branch + PR);
                          # (c) drift being born — don't write the task. Surface which one.
                          # Never reach for the nearest plausible id to fill the field.
intent: ""                # the id of the intent this task derives from — a file in
                          # .flow/intents/ that is already on `main` (merged by PR, which is
                          # what approved it; its `status` is not consulted). The link runs
                          # one way: never edit the intent to point back here.
                          # Empty only for `serves: ["maintenance"]` work, or for a task
                          # created before the repo's `intents.required_from` date.
                          # No intent for product work? Stop and say so: the human approves the
                          # intent first (intent-writer skill), in its own PR — never write it
                          # in the session that writes this task.
                          # flow-doctor: a ready task naming an id no intent declares FAILS; a
                          # missing one on new product work WARNS.
touches: []               # path globs this task expects to modify, e.g. ["src/signup/**", "api/subscribe.*"]
                          # concurrency: a ready task is skipped while its touches overlap an in_progress one
labels: []                # optional, e.g. [frontend, infra, spike]
notes: []                 # append-only log; kickbacks land here. For the next SESSION, not the
                          # human: what is done, what only looks done, the exact next action.
asks: []                  # the open items for the HUMAN — the other half of the `notes` split.
                          # A person never opens frontmatter prose, so an item only a person can
                          # act on reaches nobody when it is written as a note. Each entry is ONE
                          # string, prefixed with its kind. Exactly three kinds:
                          #   - "decision: <the question>. Recommend: <the option and why>"
                          #   - "follow-up: <the task that should exist, one sentence>"
                          #   - "fyi: <what the reviewer should know before merging>"
                          # A `decision` MUST carry `Recommend:` — it arrives with the
                          # recommendation the worker already holds, or it hands back thinking
                          # that was already done. flow-doctor fails a malformed ask.
                          # Resolving an ask REMOVES it from here and appends a `notes` line
                          # recording the answer. A blocked task's decision goes here as well as
                          # in `blocked_reason`.
---

## Context

Why this exists. The problem in the human's words. Link any exploration HTML, prior
task ids, or design files. Enough that a fresh session understands without asking.

## Scope

What this task *does*. Bullet the concrete changes. Be explicit about the boundary —
what it deliberately does **not** touch. Out-of-scope discoveries become new tasks.

## Acceptance criteria

The contract for "done." Each line must be **observable and testable** — the worker
writes at least one test per criterion, and the qa check on the PR verifies the mapping.

- [ ] Given <situation>, when <action>, then <observable outcome>.
- [ ] …

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

Anything the worker should flag rather than guess. If a real decision is needed that
isn't captured above, the task isn't `ready` yet — send it back to the orchestrator.
