---
id: "flow-0221"
title: "Every PR description carries a Captures section, and a change a person sees or feels is captured by default"
status: "in_progress"
priority: 2
project: "flow"
owner: "session_01NfrcU8rLycGD6TeDk8SRtY"
created: "2026-11-13"
started: "2026-11-13T01:44:10Z"
branch: "flow/flow-0221-pr-captures-wording"
pr: "https://github.com/CandidDan/flow/pull/309"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G10"]
intent: "ux-prs-show-screenshots"
touches:
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.claude/skills/show-me/SKILL.md"
  - ".flow/bin/show-me.test.mjs"
  - ".flow/bin/protocol-portability.test.mjs"
  - "changes/flow-0221.md"
labels: [protocol, docs, pr-description]
model: ""
effort: ""
model_reason: ""
notes:
  - "2026-11-13 (task writer, at the build thread's request): touches widened to add .flow/bin/protocol-portability.test.mjs. Editing the PR-description sentence in PROTOCOL.md Response style changes that section's pinned digest in INTENTIONAL_DIVERGENCES, which must be updated in the same PR (flow-0141, flow-0168 and flow-0206 declared it for the same reason). No other live task touches it."
  - "2026-11-13 (Dan, decision card): YES. A change to what happens to a person when they act, with no screen change (TanPlan PR #344), needs a capture, and a before/after table of real responses from the base commit and the PR head counts as the capture. Criteria 2 and 4 stand as written; ignore the 'If Dan answers no' note. Released to ready."
  - "2026-11-13 (task writer, project thread 'Write Flow tasks for PR screenshots'): two of the intent's four open questions are already answered by show-me's Captures section, so they are not asked again. Before/after is required only when an existing screen changed (the 'What' row says so). An environment that cannot run the app is a valid stated reason (the skip line lists 'no browser in the environment'); this task only requires the reason to name what was missing."
asks: []
---

## Context

Intent `ux-prs-show-screenshots` (merged, flow#307). Dan, reviewing TanPlan PR #344 on
2026-11-10: "this is exactly the sort of pr that should have screenshots", then "I think this is a
rule for flow as well, favour adding screenshots for pr's that change UX".

Today the rule is easy to talk your way out of:

| Where | Current wording | Problem |
|---|---|---|
| `project-template/.flow/PROTOCOL.md`, Response style, PR description order | "captures (screenshots, a recording for motion) when the change is something a person sees and the session can run it" | The session that wrote the code decides both conditions, and nothing asks it to say which way it decided. |
| `project-template/.claude/skills/show-me/SKILL.md`, `## Captures`, **When** row | "...**and** the session can run it. Not for backend, infra, docs or tooling-only diffs." | PR #344 was API-only, so it fell outside the rule, although staff feel the change. |

This task changes the words only. The qa check that enforces them is flow-0222 (the one
written alongside this one: "qa check fails a task PR whose description has no Captures section").

## Scope

**Does:**

1. In `PROTOCOL.md`'s PR description order, replace the conditional captures clause with: every
   PR description has a captures part; it holds captures when the change alters what a person
   sees or what happens to them when they act, and otherwise one `Not captured: <reason>` line.
   Name `show-me`'s `## Captures` as the place the detail lives. Keep the order of the five parts
   unchanged.
2. In `show-me/SKILL.md` `## Captures`:
   - **When** row: the section is always present in a PR description. Captures are the default
     for any change to what a person sees (screen, rendered page, email, SMS, generated visual)
     or to what happens to them when they act (a different result, a different device, a
     different time, as in TanPlan PR #344). Remove "Not for backend, infra, docs or tooling-only
     diffs" and "and the session can run it" as conditions; those cases now use the skip line.
   - **What** row: add the form for a change no screen shows yet: a before/after table of real
     responses, produced by running the same request or test against the base commit and the PR
     head. Keep the existing before/after rule for a changed screen, and "after" only for a new one.
   - Skip line: the reason must name what is missing or why nothing is visible. Keep the existing
     examples. Add one sentence that a stated reason is what the reviewer can disagree with, so
     "n/a" or an empty reason is not a reason.
3. Update `.flow/bin/show-me.test.mjs` so its assertions match the new wording (the current
   tests pin "session can run it", which this task removes).
4. Changelog fragment `changes/<this task id>.md`. Caller action: none beyond merging the next
   flow-sync PR, which delivers the new protocol and skill text.

**Does not touch:** the qa check or any workflow (`_flow-review.yml`, `flow-review.mjs`); the
capture procedure itself (orphan `captures/<task-id>` branch, SHA links, synthetic data,
tooling); the order of the PR description parts; the TL;DR rules.

## Acceptance criteria

- [ ] 1. Given `PROTOCOL.md`'s PR description order, then the captures part is no longer
  conditional on "the session can run it", it says the part is always present, and it names the
  `Not captured: <reason>` line as the alternative to captures. Proved in `show-me.test.mjs`.
- [ ] 2. Given `PROTOCOL.md`, then the captures clause covers both a change to what a person sees
  and a change to what happens to them when they act. Proved in `show-me.test.mjs`.
- [ ] 3. Given show-me's `## Captures` **When** row, then it says the section is always present,
  and the strings "Not for backend, infra, docs or tooling-only diffs" and "the session can run
  it" no longer appear in that section. Proved in `show-me.test.mjs`.
- [ ] 4. Given show-me's `## Captures` **What** row, then it describes the before/after table of
  real responses from the base commit and the PR head as the capture for a change no screen
  shows. Proved in `show-me.test.mjs`.
- [ ] 5. Given show-me's skip line, then the text requires the reason to name what is missing or
  why nothing is visible, and says an empty reason or "n/a" is not a reason. Proved in
  `show-me.test.mjs`.
- [ ] 6. The existing show-me assertions still pass for what this task does not change: the
  orphan branch, SHA links, synthetic data only, the tooling rule, and the five-part order.
- [ ] 7. The changelog fragment exists and states its caller action. Proved by
  `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- If Dan answers "no" to the decision: drop "what happens to them when they act" from scope
  item 1 and 2, drop criterion 2, and change criterion 4 to say the response table is optional
  supporting evidence rather than a capture. Everything else stands.
- Blocked task flow-0147 also edits show-me's `## Captures` (a data-leak sentence). The two
  touch different rows; whichever lands second rebases.
