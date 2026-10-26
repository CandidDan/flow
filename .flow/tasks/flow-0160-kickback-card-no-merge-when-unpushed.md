---
id: "flow-0160"
title: "Never let a kickback card recommend merging a round whose change was thrown away"
status: "in_review"
priority: 2
project: "flow"
owner: "claude-worker-flow-0160"
created: "2026-10-26"
started: "2026-10-26T03:39:23Z"
branch: "flow/flow-0160-no-merge-on-unpushed-round"
pr: "https://github.com/CandidDan/flow/pull/234"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
model: "opus"
effort: "high"
model_reason: "Edits a reusable workflow every repo runs and the card logic a human acts on from their phone"
touches: ["project-template/.flow/bin/flow-kickback.mjs", "project-template/.flow/bin/flow-kickback.test.mjs", ".github/workflows/_flow-kickback.yml", ".flow/bin/flow-kickback-workflow.test.mjs", "changes/flow-0160.md"]
labels: [kickback, bug, workflows]
notes:
  - "2026-10-26 (orchestrator): from Dan, after CandidDan/write#183. maintenance: fixes a defect in flow-0082/flow-0159's shipped card, the same precedent as flow-0157 and flow-0159."
  - "2026-10-26 (worker): code, tests and fragment pushed on flow/flow-0160-no-merge-on-unpushed-round. Logic is recommendationFor/roundNotPushed in the template helper; escalate-round passes KICKBACK_ROUND_PUSHED/OUTCOME, push gains an `outcome` output (fixed|disputed|none) because round-card writes outcome: disputed into every dead-round hand-back. Only merge is rewritten; an existing kickback is left alone. Next: full gate, then open the PR."
---

## Context

On 2026-10-26 the auto-fix round on CandidDan/write#183 (write-0090) did the right fix, and the
test-weakening guard (`Check 3`, `steps.check-weakens` in `_flow-kickback.yml`) threw it away, so
**nothing was pushed**. The decision card posted to the PR then said:

> **Tried / disputed:** The round WEAKENED THE TESTS … The change was thrown away, not pushed. …
> **Recommendation:** merge as is

"Merge as is" came from the fixer's hand-back (`outcome.json`), which was written *before* the guard
ran and assumed its commit would be pushed. `cardFromOutcome` in
`project-template/.flow/bin/flow-kickback.mjs` prepends the guard's `amend` sentence to `tried`, but
passes the hand-back's `recommendation` through untouched. So the card tells the human to merge a PR
whose head still carries the bug the round was dispatched to fix. A human acting on the card from
their phone (G12) would ship it.

The same hole applies to every `amend` the `push` job can produce that means "nothing was pushed":
the remote head moved, the bundle base was wrong, the tests were weakened, or the round committed
nothing (`check-remote-head`, `check-bundle`, `check-weakens`, `check-commits`).

## Scope

- When the round's change was **not pushed** (any `push`-job `amend` is set, or `push` did not
  succeed), the card's recommendation must not be `merge`. It becomes a `kickback` whose change says,
  in one sentence, that the PR head is unchanged and the round's fix must be re-applied or re-run.
  The fixer's own `change` text may follow it, but never as a merge.
- The fixer's `alternative` is kept. If it reads as the merge path, that is still fine, because it
  is labelled as the alternative and the card says nothing was pushed.
- A round that **was** pushed keeps today's behaviour exactly.
- Where the logic lives: in `flow-kickback.mjs` as tested pure code (`cardFromOutcome` or
  `decisionCard`), with the workflow passing whatever it needs to know whether the push happened.
  No decision may be added as a YAML `if:` expression (the header's "decision logic is CODE" rule).

**Deliberately does NOT:**
- Change the guard itself or what it trips on (that is flow-0161).
- Change the dispute path (`outcome: disputed`), which pushes nothing by design and whose
  recommendation is the fixer's judgement about the finding.
- Change the card's layout or length budget (`fitFields`).

## Acceptance criteria

- [ ] Given a hand-back with `recommendation.action: "merge"` and a non-empty push `amend` (the weakened-tests sentence), when the card is built, then its recommendation action is `kickback` and its text says the PR head is unchanged (a `flow-kickback.test.mjs` test, one case for each of the four push-side `amend` sentences).
- [ ] Given the same hand-back with an empty `amend` and a successful push, when the card is built, then the recommendation is `merge`, byte-for-byte what it is today.
- [ ] Given a `disputed` hand-back, when the card is built, then its recommendation is unchanged from today.
- [ ] Given `_flow-kickback.yml`, when `escalate-round` renders a card for a round whose `push` job set an `amend`, then the input it hands the card renderer marks the round as not pushed (a `.flow/bin/flow-kickback-workflow.test.mjs` test over the workflow file).
- [ ] Given this task's fragment `changes/flow-0160.md`, when the store-wide test runs, then it passes: `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

`touches` overlaps flow-0161 (same helper and workflow). The two are serialised on purpose: this one
first, because the misleading card is the more dangerous defect.
