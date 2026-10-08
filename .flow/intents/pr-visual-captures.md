---
id: "pr-visual-captures"
title: "Where it helps and is possible, PRs carry key screenshots and recordings"
status: "proposed"
created: "2026-10-09"
source: "Dan, orchestrator chat 2026-10-09"
serves: ["G10"]
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

> "Also in Presence pr #2 codex added screenshots and and a screen recording to the pr this was a
> massive help. Can we add this as guidance as well where it would benefit and is possble key
> screenshots and recordings are added"

— Dan, orchestrator chat, 2026-10-09.

Evidence (not Dan's words): CandidDan/presence PR #2 ("Settle connections while scrolling the
split-layout concept") carried a "Review captures" section — a linked `.webm` scroll recording and
two inline PNG screenshots (desktop, mobile), pinned to a commit SHA. VISION.md G10 records that the
approve-the-merge touchpoint is weaker than a green check makes it look, because PR text is long
and often not plain English.

## Cost of inaction

Dan keeps approving visible changes by reading long PR text instead of looking at them, so the
merge touchpoint stays as weak as G10 records it.

[assumption] Without guidance, captures appear only when a given agent (here, Codex) chooses to add
them, not consistently across Flow workers.

## Outcome

On a PR whose change can be seen, Dan can check that it looks and behaves right by looking at key
screenshots and recordings on the PR itself, without checking out the branch or running it.

## Constraints

- "Where it would benefit and is possible" — Dan's own scope. Captures are expected where they help
  a reviewer and can be produced, not on every PR.
- [assumption] Lives within the protocol's existing PR-description order and response-style rule
  (show, don't tell); it adds to them, it does not replace them.
- [assumption] Captures must show the exact change under review (Presence PR #2 pinned them to a
  commit SHA), so a reviewer is not looking at a stale build.

## Open questions

- Which changes count as "would benefit" — UI only, or also things like CLI output, generated
  boards, or charts?
- What makes a capture "not possible", and should the PR then say so explicitly rather than stay
  silent?
- Is this guidance only, or should a missing capture on a visible change ever be flagged by a check?
- Where should captures be stored so they stay viewable after the branch is deleted?
- Does this land in canonical's `project-template/` for every adopting repo, or start in one repo?
