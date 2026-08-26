---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0014"
title: "Record why the vision layer is shaped this way, including what was rejected"
status: "done"
priority: 3
project: "flow"
owner: "claude/next-task-protocol-s1cqaw"
created: "2026-08-18"
started: "2026-08-26T12:13:57Z"
branch: "claude/next-task-protocol-s1cqaw"
pr: "https://github.com/CandidDan/flow/pull/35"
issue: ""
blocked_reason: ""
serves: ["G3"]            # direction survives the work — an unrecorded reason gets relitigated
touches: ["docs/adr/0004-vision-layer.md"]
labels: [docs, vision]
notes:
  - "2026-08-26: scope note, raised rather than taken silently. `touches` declares only the ADR, but the inherited Definition of Done requires a proving test per acceptance criterion, and six of the seven criteria are `when it is read, then it contains` assertions about the file. Canonical's precedent for exactly this shape is to declare the test in `touches` — flow-0009 declared `.flow/bin/protocol-docs.test.mjs`, flow-0016 declared `.flow/bin/protocol-portability.test.mjs`. This task's `touches` did not. Resolved by writing `.flow/bin/adr-vision-layer.test.mjs` and isolating it in its own commit on the PR, so it can be dropped if the orchestrator would rather widen `touches` first. Note `touches-guard` ignores all of `.flow/**` by design, so the guard neither catches nor forbids this — which is why it is recorded here instead of being left to CI."
  - "2026-08-18: deliverable D6 of the vision-layer handoff. Number 0004 confirmed free. Single new file, disjoint from every ready task including flow-0003 (which touches ADR-0002)."
---

## Context

The vision layer makes a specific trade that will look arbitrary to anyone who arrives later:
mechanical checks hard-fail, semantic judgment stays advisory. Whether `serves` *resolves* is a
fact, so it gates; whether the work *genuinely advances* the goal is a judgement, so it goes to a
human on a cadence with evidence. Without the reasoning written down, the first person to find
compass noisy will propose turning it into a gate, and the first person to find the doctor check
annoying will propose making it a warning.

The rejected alternatives carry more weight here than the decision. An LLM-judged alignment gate
is the obvious idea, and the reason it loses — a flaky semantic gate teaches operators to override
gates, corroding the trust the mechanical ones depend on — is exactly the sort of second-order
argument that gets lost if it isn't recorded.

## Scope

**Does:**

- Add `docs/adr/0004-vision-layer.md`, matching the header, status and section conventions of
  ADR-0001..0003 (Status, Date, Deciders; Context; Decision; alternatives; Consequences).
- Record the decision in three parts: the root `VISION.md` anchor on the code plane with PR-only
  changes; `serves` validated mechanically by flow-doctor; and `flow-compass` as a scheduled,
  opt-in, read-only audit that files findings into the existing capture inbox.
- Record the teeth budget as the organising principle, with the reasoning above.
- Record the alternatives considered and rejected, each with its reason: an LLM-judged alignment
  gate in CI; the vision in `.flow/` rather than at the root; per-task human vision review (the
  status quo, and the control that observably failed); `serves` as an unenforced convention; and a
  separate drift dashboard that findings would land in instead of the inbox.
- Record the consequences honestly, including the ones that cost something: two new touchpoints
  when reality demands them (approving vision PRs, triaging compass findings); `serves` can be
  cited lazily, with compass as the only backstop; the vision itself can be written badly; and
  flow-doctor's findings are store-wide rather than per-PR, so an unanchored `ready` task reddens
  every open PR in the repo.
- Record as explicit future work, not silent omission: cross-checking `serves` against `touches`,
  and why it is not being done now — `maintenance` has no declared file surface, so the check
  could only be a heuristic, and heuristics do not belong in the tier that hard-fails.
- Note the interaction with `parse-task-id`: a `[vision]` PR title yields no task id, so
  `touches-guard` skips it, and that skip is legitimate and must stay legitimate.

**Deliberately does NOT:**

- **Restate ADR-0002 or its Amendment 1.** The visibility decision — a computed page rather than a
  Projects projection — is recorded there. Reference it; do not re-argue it.
- **Reopen ADR-0001.** Files on `main` remain the store, and the vision's root placement is
  precisely so that invariant is not touched.
- **Specify implementation.** The doctor rules belong to `flow-0010`, the skill to `flow-0011`
  and `flow-0013`, the field to `flow-0012`. An ADR that duplicates a spec drifts from it.

## Acceptance criteria

- [ ] Given `docs/adr/0004-vision-layer.md`, when its header is read, then it carries Status, Date
      and Deciders in the same format as ADR-0001..0003.
- [ ] Given the ADR's Decision section, when it is read, then all three parts are present — the
      root `VISION.md` on the code plane with PR-only changes, the mechanical `serves` check, and
      compass as advisory-only — and the teeth budget is stated as the reason they differ.
- [ ] Given the ADR's alternatives section, when it is read, then it contains at least the five
      named in Scope, each with the reason it lost rather than only the fact that it lost.
- [ ] Given the ADR's consequences section, when it is read, then it names the store-wide failure
      behaviour of flow-doctor, the lazy-citation limit of `serves`, and the added human
      touchpoints — a consequences section listing only benefits fails this criterion.
- [ ] Given the ADR, when it is searched for future work, then the `touches`-vs-`serves`
      cross-check appears with the heuristic reasoning, and the `[vision]`-PR skip is recorded as
      legitimate behaviour.
- [ ] Given `docs/adr/`, when it is listed after this change, then no two ADRs share the number
      0004.
- [ ] Given the repo after this change, when `npm run build`, `npm run lint` and `npm test` run,
      then all three pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- Draft content ships in the handoff package (`templates/docs/adr/0004-vision-layer.md`). It is a
  starting point, not a file to copy blind: it predates the decisions recorded in
  `docs/handoff-vision-layer-review.md` §10, and its consequences section does not yet know about
  the store-wide failure behaviour or the ADR-0002 amendment.
- Status: land it as `Accepted`, not `Proposed`. The decisions were taken on 2026-08-18 and the
  first deliverables are already `ready`; an ADR marked Proposed while its implementation is being
  built is a document lying about its own state.
