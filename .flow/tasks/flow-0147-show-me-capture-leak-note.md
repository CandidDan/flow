---
id: "flow-0147"
title: "show-me says a capture pushed by mistake stays reachable by its SHA link after the branch is deleted"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-10-13"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Parked by queue cap at creation (Dan, 2026-10-13: p1/p2 first). Not machine-checkable: flip to ready when the ready count drops below the cap."
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.claude/skills/show-me/SKILL.md"
  - "project-template/.flow/bin/show-me.test.mjs"
  - "changes/flow-0147.md"
labels: [skills, security, docs]
notes:
  - "2026-10-13 (orchestrator): ORIGIN. Low-severity note from flow-0141's security review (PR #200): captures are linked by commit SHA on an orphan `captures/<task-id>` branch, so deleting the branch does not unpublish a capture that leaked real data; the blob stays reachable by SHA until GitHub garbage-collects it, and forks or caches may keep it. Dan approved writing it 2026-10-13."
---

## Context

show-me's PR-captures section tells a worker to push screenshots to an orphan branch and link by SHA.
It already says "synthetic data only", but not what happens if that rule is broken: deleting the
branch does not remove the commit from GitHub's reach.

## Scope

**Does:** add one or two sentences to the **Data** row or the **Where** paragraph of show-me's
captures section: a capture containing real data is a leak; deleting `captures/<task-id>` does not
unpublish it, because the SHA link keeps resolving; the fix is to tell the human, who rotates
anything exposed and asks GitHub Support to purge the commit. Add or extend an assertion in
`show-me.test.mjs` that the sentence is present (by a stable phrase, e.g. "does not unpublish").
Changelog fragment, caller action none.

**Does not touch:** any workflow, the capture procedure itself, the PR description order.

## Acceptance criteria

- [ ] Given show-me's SKILL.md, then the captures section states that deleting the captures branch does not unpublish a pushed capture and names the human-escalation step. Proved by `show-me.test.mjs`.
- [ ] Given `changes/flow-0147.md`, then it exists and states the caller action (none). Proved by `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
