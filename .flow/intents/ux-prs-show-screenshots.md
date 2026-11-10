---
id: "ux-prs-show-screenshots"
title: "PRs that change UX favour screenshots"
status: "proposed"
created: "2026-11-10"
source: "Dan, TanPlan project chat 2026-11-10, reviewing CandidDan/tanplan-platform PR #344"
serves: ["G10"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

Reviewing CandidDan/tanplan-platform PR #344:

> "just reviewing #344 it's good and correct but this is exactly the sort of pr that should have
> screenshots"

And a few minutes later:

> "I think this is a rule for flow as well, favour adding screenshots for pr's that change UX"

— Dan, TanPlan project chat, 2026-11-10.

## Evidence

None of this section is Dan's words. It is what the writer found in the repo.

- The rule already exists, but weakly. `project-template/.flow/PROTOCOL.md`, "Response style",
  asks for captures only "when the change is something a person sees and the session can run
  it". `show-me/SKILL.md`, "Captures", adds "Not for backend, infra, docs or tooling-only diffs"
  and lets a PR skip with one `Not captured:` line.
- Both conditions are judged by the session that wrote the code. Nothing checks them. The qa,
  security, code-review and PR-text checks in `_flow-review.yml` never mention captures.
- PR #344 changed which branch's card reader a cancel reaches and which branch's clock a desk
  action uses. The diff was API-only, so under the current wording it falls outside the rule. Its
  "Captures" section says there is no screen to capture and gives a before/after table of real
  API responses instead.

## Cost of inaction

[assumption] Dan keeps reviewing changes to what staff and customers see from tables and test
names, and has to ask for screenshots PR by PR. The rule stays one the author can talk itself out
of, with no check that notices.

## Outcome

A PR that changes what a person sees or does reaches Dan with screenshots of the change, and he
can judge it by looking at them. A PR without screenshots never reaches him without a stated
reason he can disagree with.

- [assumption] The screenshots show before and after, and he does not need to check out the
  branch to see them.

## Constraints

- "Favour" is Dan's word: the default is to include screenshots.
- [assumption] A written reason is still allowed when a screenshot is genuinely impossible.
- [assumption] Screenshots use synthetic data only, never a real customer's data or a production
  screen. This is already in `show-me/SKILL.md`.
- [assumption] It must not make PRs materially more expensive in tokens or CI minutes (VISION.md G9).
- [assumption] For a change a person feels but no screen shows yet (PR #344's case), a before/after
  table of real responses, run against the base commit and the PR head, counts as the capture.
- [assumption] The check is the existing qa check on the PR, not a new job.
- [assumption] It applies to every repo that adopts Flow, not only TanPlan.

## Open questions

- What counts as "changes UX": only a screen, email or SMS a person sees, or also a change in what
  happens to them when they act (a different reader, a different clock), as in PR #344?
- Does a missing capture, or a weak reason for one, fail the qa check and block the merge, or show
  as a warning Dan can overrule?
- Is "before and after" required for every visible change, or only when an existing screen
  changed?
- When the worker's environment cannot run the app (no browser, no database), is that a valid
  reason, or should the task be blocked until it can?
