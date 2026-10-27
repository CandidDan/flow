---
id: "flow-0161"
title: "Let an auto-fix round replace an assertion its task's amended criterion made wrong, and disclose it instead of discarding the round"
status: "done"
priority: 2
project: "flow"
owner: "claude-worker"
created: "2026-10-26"
started: "2026-10-27T02:50:04Z"
branch: "flow/flow-0161-kickback-guard-amended-criteria"
pr: "https://github.com/CandidDan/flow/pull/240"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
model: "opus"
effort: "high"
model_reason: "Relaxes a safety guard in a reusable workflow every repo runs; the trigger condition is the whole design"
touches: ["project-template/.flow/bin/flow-kickback.mjs", "project-template/.flow/bin/flow-kickback.test.mjs", ".github/workflows/_flow-kickback.yml", ".flow/bin/flow-kickback-workflow.test.mjs", "docs/flow-reusable-workflows.md", "changes/flow-0161.md"]
labels: [kickback, bug, workflows]
notes:
  - "2026-10-26 (orchestrator): from Dan, after CandidDan/write#183. maintenance: the auto-fix round (flow-0082, flow-0159) cannot complete in a case Flow's own protocol creates, the same precedent as flow-0157 and flow-0159."
  - "2026-10-27 (worker): branch flow/flow-0161-kickback-guard-amended-criteria pushed. DONE: flow-kickback.mjs has criteriaSection/criteriaAmended/testLineBalance/guardDecision/disclosureComment and CLI `amended` + amended-aware `weakens` (KICKBACK_CRITERIA_AMENDED, KICKBACK_DISCLOSURE_FILE). NOT DONE: unit tests for them, _flow-kickback.yml wiring (plan computes criteria_amended via compare API merge base + contents API; push Check 3 passes it; new no-model `disclose` job posts the comment; fixer rule 3 sentence), workflow tests, docs, changes/flow-0161.md. NEXT: write the tests in flow-kickback.test.mjs."
  - "2026-10-27 (worker): all code, tests, docs and changes/flow-0161.md are committed and pushed on flow/flow-0161-kickback-guard-amended-criteria. Design: plan computes criteria_amended (compare API merge base + contents API, both outside the PR head), push Check 3 keeps a replacement-only round and base64s the disclosure, new no-model `disclose` job (pull-requests: write) posts it. Per-file balance also forbids a net loss of assertions (stricter than the spec, deliberately). NEXT: run the full gate, rebase on main, open the PR."
  - "2026-10-27 (worker): gate green locally (build, lint, test 2257/0, coverage 97.47%); rebased on main; PR #240 marked ready. NEXT: the qa/security/code-review checks on #240, then human merge."
---

## Context

On CandidDan/write#183 (write-0090), review found that at 8 tool rounds the route declared no tools,
which the Messages API rejects. Dan ruled on the fix, and the orchestrator **amended criterion 8 on
`main`** (2026-10-26) to say the opposite of what it had said: keep the tools declared and send
`tool_choice: none`. That is how the protocol routes a human ruling to the reviewers, because the
review reads the task from the base branch (flow-0085).

The auto-fix round then did exactly the right thing: it changed the code and replaced the test that
asserted the *old* criterion (`tools` undefined) with one asserting the new one. The test-weakening
guard (`weakensTests`, run as `Check 3` in `_flow-kickback.yml`) saw a removed test declaration and
a removed assertion, and **threw the whole round away**. A human had to re-apply the same change by
hand.

So whenever a criterion is amended after its PR opened, an auto-fix round can never succeed: the
amended criterion requires replacing an assertion, and replacing an assertion trips the guard.

The guard's purpose stays right: a fixer must not loosen tests to turn qa green. The safe signal
that separates the two cases is that **the fixer cannot edit the task store** (rule 6 of its prompt,
and the store-guard). So if the task's acceptance criteria on the default branch differ from the
criteria at the PR's merge base, a human or the orchestrator changed the contract, and the fixer
did not.

## Scope

- **Detect the amendment.** Determine whether the task's `## Acceptance criteria` section on the
  default branch differs from the same section at the merge base of the PR head and the default
  branch. This is a pure, tested function in `flow-kickback.mjs` that compares two task-file texts;
  the workflow only fetches the two texts.
- **When the criteria were amended:** the guard's trips no longer discard the round. The round is
  pushed, and every trip is listed, file, line and reason, in a PR comment posted with the push
  (or in the step summary and a comment), headed so a reviewer sees it before the re-run reviews.
  The qa re-run, judging against the amended criteria, stays the backstop.
- **When the criteria were not amended:** the guard behaves exactly as today.
- **Prompt:** the fixer's rule 3 ("NEVER WEAKEN A TEST") gains one sentence: when the task's
  criteria were amended after the PR opened, it may replace an assertion the amendment made wrong,
  and must name each one in its hand-back's `tried`. The workflow tells the fixer whether the
  criteria were amended.
- Document the rule in `docs/flow-reusable-workflows.md` next to the existing guard description.

**Deliberately does NOT:**
- Allow deleting a test **file**, or a net loss of test declarations, even when the criteria were
  amended. Replacing a test (one removed, one added) is allowed; a net removal still trips.
- Read the criteria from the PR branch. The comparison uses the default branch and the merge base
  only, both outside the fixer's reach.
- Change the card's recommendation logic (that is flow-0160).

## Acceptance criteria

- [ ] Given two task-file texts whose `## Acceptance criteria` sections differ (one criterion reworded), when the amendment check runs, then it reports amended; given texts that differ only outside that section (e.g. `notes`, `status`), then it reports not amended (`flow-kickback.test.mjs`).
- [ ] Given a round diff that replaces one test declaration and its assertion, with the criteria amended, when the guard decision runs, then the round is **not** discarded, and the trips are returned for disclosure (`flow-kickback.test.mjs`).
- [ ] Given the same diff with the criteria **not** amended, when the guard decision runs, then the round is discarded exactly as today.
- [ ] Given a diff that deletes a test file, or removes more test declarations than it adds, with the criteria amended, when the guard decision runs, then the round is still discarded.
- [ ] Given `_flow-kickback.yml`, when it is parsed, then the amendment check reads the task file from the default branch and from the merge base, never from the PR head, and a pushed round whose guard tripped posts the trips as a PR comment (`.flow/bin/flow-kickback-workflow.test.mjs`).
- [ ] Given the fixer prompt in `_flow-kickback.yml`, when it is read, then rule 3 permits replacing an assertion made wrong by an amended criterion and requires naming it in `tried` (`.flow/bin/flow-kickback-workflow.test.mjs`).
- [ ] Given this task's fragment `changes/flow-0161.md`, when the store-wide test runs, then it passes: `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

Security-reviewer focus: this relaxes a guard, so check that the amendment signal cannot be produced
by anything the fixer controls (the PR branch, PR comments, the hand-back) and that a net test
removal still trips.

`touches` overlaps flow-0160 (same helper and workflow), so the two are serialised; flow-0160 goes
first.
