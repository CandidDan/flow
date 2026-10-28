---
id: "reviewer-matches-the-change"
title: "A PR is reviewed by the kind of reviewer its change needs, with effort matched to its risk"
status: "proposed"
created: "2026-10-28"
source: "Dan, Claude Code chat, 2026-10-28"
serves: ["G10", "G9"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

> "Can we see the prompts, what types to we have research, (should there be one for intent), qa,
> security, code?"

— Dan, Claude Code chat, 2026-10-28.

## Cost of inaction

Evidence (not Dan's words): `_flow-review.yml` has exactly three verdict-giving reviewers, qa,
code-review and security (conditional), plus a prose-only review guide. Every PR that is not a
release or sync PR gets the same three, whatever it changes:

- An intent PR (one Markdown file in `.flow/intents/`) is checked for proving tests and code
  quality. Nothing checks what an intent needs: the Problem is in the human's own words, writer
  detail is marked `[assumption]`, and the Outcome does not prescribe a solution.
- A research PR, if research runs as a task (see the intent `research-before-scoping`, proposed in PR #248), would get the same
  code-shaped reviewers.
- Each check always gets its own fixed model and `--max-turns 60`, whatever the change, so a one-line docs change and an auth
  change get the same budget.

## Outcome

Each PR gets the reviewers its kind of change needs (code, intent, research, and design where
`usability-review`, proposed in PR #249, applies), each judging what matters for that kind, and how much effort review
spends scales with the size and risk of the change.

## Constraints

- [assumption] Which kind a PR is gets decided in code from the paths it changes, read from the
  base branch and failing closed: a PR that cannot be classified gets the full code review.
- [assumption] The security check's trigger, including the security floor over `.flow/**`,
  `.github/**`, `.claude/**`, `CLAUDE.md` and `AGENTS.md`, is unchanged by the classification.
- [assumption] An intent reviewer advises; merging the intent's PR stays the human's approval
  (ADR-0007). It never approves an intent.
- [assumption] Cost stays visible (G9): the run summary names which reviewers ran and at what
  effort.

## Open questions

- Whether intent review is a blocking check or advisory only.
- How "risk" is measured for effort: diff size, `security_paths` hits, files touched, or the
  task's own `effort` field.
- Whether a PR mixing kinds (code plus an intent) gets both sets of reviewers, or counts as
  unclassified and gets the full code review.
