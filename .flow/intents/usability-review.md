---
id: "usability-review"
title: "A change people will use is reviewed for whether it is actually usable, not only whether it is correct"
status: "proposed"
created: "2026-10-28"
source: "Dan, Claude Code chat, 2026-10-28"
serves: ["G10"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

> "SHould there be one for design we know this is gap. Is what is built actuall usuable"

— Dan, Claude Code chat, 2026-10-28.

## Cost of inaction

Evidence (not Dan's words): none of Flow's reviewers looks at a running change. qa maps acceptance
criteria to tests, code-review reads the diff, and security reads the diff for risk. A screen can
pass all three while being confusing, inaccessible or broken at phone width. The intent
`pr-visual-captures` (2026-10-09) asks for screenshots and recordings on PRs so Dan can see a
change, but nothing judges what they show.

[assumption] Today usability is only checked when Dan happens to try the change, after it
has merged.

## Outcome

On a PR that changes something a person sees or uses, a reviewer judges whether it is usable
(clear, accessible, works at the sizes it will be used at, consistent with the product) and says
so on the PR before Dan merges.

## Constraints

- [assumption] It judges the running change, or captures of it pinned to the PR's commit, not
  only the code. It builds on `pr-visual-captures`.
- [assumption] The standard it judges against is the project's own (for example Dan's Design
  Standards), not generic taste.
- [assumption] It runs only on PRs whose change can be seen or used, decided from the paths
  changed. See the intent `reviewer-matches-the-change`, proposed in PR #247.
- [assumption] Cost stays visible (G9).

## Open questions

- Whether a usability finding can block the PR, or only advise.
- How the reviewer sees the change: a preview deployment, a browser run in CI, or the PR's captures.
- Which repos it applies to first (inflight, TanPlan apps, nudge).
- Whether it also covers non-visual usability, such as CLI output and error messages.
