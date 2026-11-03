---
id: "flow-0202"
title: "The triage inbox admits a public issue only when a verified `flow:trusted` or human `approved` label vouches for it"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-11-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Uses the label verification that flow-0201 adds; released when flow-0201 is done."
cancelled_reason: ""
blocked_by: ["flow-0201"]
serves: ["G11"]
intent: ""
touches:
  - ".github/workflows/_flow-triage.yml"
  - ".flow/bin/triage-author-trust.test.mjs"
  - "project-template/.flow/bin/intake-trust.mjs"
  - "project-template/.flow/bin/intake-trust.test.mjs"
  - "changes/flow-0202.md"
labels: [intake, triage, security, adr-0010]
model: "opus"
effort: "high"
model_reason: "Widens the trust boundary in front of a write-capable agent in every adopting repo; one wrong condition hands arbitrary public text to an agent that commits to main"
notes:
  - "2026-11-03 orchestrator: ADR-0010 task 2 of 6 (§4, 'Public text never reaches the write-capable agent un-vouched'). Accepted when Dan merged CandidDan/flow#277 (b81de46); no canonical intent file, so `intent` is empty by design."
asks: []
---

## Context

The inbox step of `_flow-triage.yml` admits an issue only if its author's `author_association` is
in the trusted set, and deliberately ignores labels. Issues created by an intake App (inflight's
form) always have the App as author, so they are all excluded. ADR-0010 §4 widens the filter by
exactly two cases, using the verification from flow-0201:

- an issue carrying a **verified `flow:trusted`** label (only an App in `intake.trusted_labelers`
  can apply one that verifies), or
- an issue carrying a **verified human `approved`** label (Dan decided it).

Everything else from outside the trusted set stays excluded. A step that never hands over the text
is the boundary (flow-0027, flow-0036), not prompt wording.

## Scope

1. The inbox step keeps admitting trusted-author issues exactly as today. For each issue it would
   exclude, it fetches that issue's events (and approver permission when needed) and admits it if
   `verifyLane` from flow-0201 honours `flow:trusted` or `approved` on it.
2. Each admitted public issue is recorded in the step's outputs with its provenance:
   `trusted` (author association, or verified `flow:trusted`) or `public` (admitted only by a
   verified `approved`). Later steps and tasks read this; this task only records it.
3. The run log's existing `excluded:` lines stay, and an issue admitted by a label prints
   `admitted: issue <n> (provenance=<value>, by=<label>)`.
4. Content assembly (step 1a files) is unchanged: comments from untrusted authors are still
   withheld, including on an issue admitted by a label.
5. Fragment `changes/flow-0202.md`: **No caller action** for repos without an intake App; repos with
   one set `intake.trusted_labelers`.

**Does not:** classify size, create tasks differently, add the automatic lane, or admit an issue
on `auto-ok` alone (an `auto-ok` on a public issue does not admit it).

## Acceptance criteria

- [ ] `triage-author-trust.test.mjs`: an issue by an `OWNER` is admitted with `provenance=trusted`,
      unchanged from today.
- [ ] `triage-author-trust.test.mjs`: an App-authored issue (`author_association: NONE`) with a
      `flow:trusted` label applied by a login in `trusted_labelers` is admitted, `provenance=trusted`.
- [ ] `triage-author-trust.test.mjs`: the same issue with `flow:trusted` applied by any other login,
      or with `trusted_labelers` empty, is excluded.
- [ ] `triage-author-trust.test.mjs`: a `NONE`-author issue with `approved` applied by a write-access
      `User` is admitted, `provenance=public`; with `approved` applied by a `Bot` it is excluded.
- [ ] `triage-author-trust.test.mjs`: a `NONE`-author issue with only `auto-ok` (from anyone) is
      excluded.
- [ ] `triage-author-trust.test.mjs`: a `NONE`-author issue with no lane label is excluded, and the
      agent's issue-number list does not contain it.
- [ ] `triage-author-trust.test.mjs`: on an admitted public issue, a comment by an untrusted author is
      still absent from the assembled content file.
- [ ] `changes/flow-0202.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run coverage`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

Only issues the author filter would exclude need an events fetch, so the extra API calls scale with
public issues, not the whole inbox (G9).
