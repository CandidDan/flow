---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0047"
title: "Stop the release-stamp test forbidding the thing `## Unreleased` exists for"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-worker-flow-0047"
created: "2026-09-15"
started: "2026-09-15T07:54:25Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # canonical's own gate; see the note on why this is not claimed as G10
touches: [".flow/bin/release-stamp.test.mjs", "CHANGELOG.md"]
labels: [infra, gate, release]
notes:
  - "2026-09-15 (orchestrator): my defect, found by flow-0045's worker within hours of the test shipping. flow-0044's criterion read '`## Unreleased` survives the release, empty, for the next change'. That is true at the instant of a release and false every moment after, and it was implemented as an unconditional assertion — so the section is now empty-or-red, and the first task that needed a changelog entry (flow-0045) could not have one. qa, code-review and security all passed it, which is worth noting rather than hiding: three reviewers agreed with a spec that was wrong, because the assertion faithfully implemented what the task asked for. The spec was the defect, not the implementation."
  - "2026-09-15 (orchestrator): `serves` is `maintenance`, not G10. G10 is 'the gate tells the truth', and a gate that goes red on correct work is arguably in that family — but G10's stated failure mode is a green gate on wrong work, and stretching it to cover false-red is exactly the reach task-writer warns about. Canonical's own gate health is maintenance."
---

## Context

`.flow/bin/release-stamp.test.mjs` (flow-0044, merged in PR #71) carries a case named
"`## Unreleased` survives the release, empty, for the next change". It asserts, unconditionally,
that the section holds **zero** entries.

`## Unreleased` exists to hold the entries of changes made since the last release. So the
assertion forbids the section's only purpose: on `main` it passes because 1.3.0 has just shipped
and the section is genuinely empty, and it goes red the moment anybody adds the entry the
changelog's own header asks for ("Note any **caller action** required").

This is not theoretical and it is not narrow. flow-0045's worker hit it immediately — its
changelog entry is a criterion of its task, `## 1.3.0` is shipped history it must not edit, and
that left it with a red gate and no in-scope fix. Every future PR in this repo that records a
change is on the same trap, which is most of them.

The other two halves of that test are correct and must survive untouched: the section named by the
root stamp must exist and be non-empty, and every entry in it must state a caller action. Those
are properties of a *released* section. The `Unreleased` case wanted the weaker, permanent
property — that the section is still there for the next change — and asserted emptiness instead.

## Scope

**Does:**

- Change that one case so it expresses the section's purpose: `## Unreleased` **exists**. Whether
  it currently holds entries is not the test's business — empty right after a release and
  populated as work lands are both correct states.
- Keep an assertion that catches the failure the case was written for: the section being *lost*
  when a release folds its entries into the numbered section. That is the real regression, and it
  is what "survives the release" was reaching for.
- Add this change's own entry under `## Unreleased`, which is both the required changelog record
  and the most direct proof the fix works: the PR's gate is green *with* an entry present.

**Deliberately does NOT:**

- **Touch the other six cases** in that file, or the two tombstone cases. They are flow-0044's
  proof and they are right. Only the `Unreleased` case changes.
- **Bump `VERSION` or open a `## 1.4.0` section.** That was the other way out of flow-0045's bind
  and it is wrong: it would mean every change that needs a changelog entry opens a release stamp,
  and it would leave the stamp leading the tag for reasons unrelated to a release being in flight.
- **Relax the released-section assertions** (section named by the stamp exists, is non-empty,
  every entry states a caller action). Nothing here weakens those.

## Acceptance criteria

- [ ] Given a `CHANGELOG.md` whose `## Unreleased` section holds one or more entries, when the
      suite runs, then it passes — proved by this PR's own entry being present while the gate is
      green, and by a fixture case asserting the populated state directly.
- [ ] Given a `CHANGELOG.md` whose `## Unreleased` section holds no entries, when the suite runs,
      then it still passes: both states are legal and a test that swapped one prohibition for the
      opposite one would be the same mistake mirrored.
- [ ] Given a `CHANGELOG.md` with no `## Unreleased` section at all, when the suite runs, then it
      fails and names the loss — verified by mutation against a fixture, not asserted.
- [ ] Given the released-section cases, when the file is diffed, then they are byte-for-byte
      unchanged except where the shared helpers required it, and the diff shows why if so.
- [ ] Given the repo after this change, when `build`, `lint`, `test` and `coverage` run, then all
      pass with coverage at or above the floor of 83.5.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **This unblocks flow-0045's second blocker and nothing else.** flow-0045 remains blocked on a
  credential only a human can widen (`FLOW_PAT` needs Contents *and* Workflows write), so do not
  expect it to go green the moment this merges.
- The case's *name* is half the fix. "survives the release, empty" is how the wrong property got
  written down; name it for what it now checks, so the next reader does not restore the old
  assertion to match a stale name.
