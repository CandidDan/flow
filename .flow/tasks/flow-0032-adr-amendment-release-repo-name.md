---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0032"
title: "Amend ADR-0005 with the chosen release repo name and the operational constraints found after it was written"
status: "in_review"
priority: 3
project: "flow"
owner: "session_01Fo8Wc8oxHhe8rkbuLpshzR"
created: "2026-08-31"
started: "2026-09-10T07:38:39Z"
branch: "claude/next-flow-task-pickup-yy0j85"
pr: "https://github.com/CandidDan/flow/pull/65"
issue: ""
blocked_reason: ""
serves: ["G4"]            # the fleet's reference target, and the traps in changing it
touches: ["docs/adr/0005-split-authoring-from-release.md", ".flow/bin/adr-split-authoring.test.mjs"]
labels: [docs, adr, infra]
notes:
  - "2026-09-10: ADR-0006's recorded trap is WRONG, and the correction matters more than the trap did. ADR-0006 line 101 says both assertions in .flow/bin/adr-split-authoring.test.mjs 'go red the moment ADR-0005 is amended'. They do not: all 22 passed against the amended document before either was touched. Both match text the amendment ADDS TO rather than removes -- the Decision's inventory line still reads `flightdeck/`, and 'not decided' still appears in the original body. The real defect was quieter and had no reporter: their assertion MESSAGES had been certifying facts that stopped being true on 2026-09-03, under a green tick. Fixed in PR #65 -- the flightdeck assertion now records the supersession, and the hosting assertion is scoped to the pre-amendment body so it cannot be satisfied by the amendment's own discussion of the question. Do not trust a documented 'this will go red' without running it; a stale assertion message is the failure mode that survives a green gate."
  - "2026-09-10: counts drift, so the amendment is pinned to the tree rather than to a number. ADR-0005 recorded 40 files on 2026-08-31, this task's note below said 43, the tree on 2026-09-10 says 49 (28 with a real `uses:`, 11 of them the project-template/ callers every adopting repo ships). A fourth hand-written number would have started ageing on commit, so the new test re-runs the git count in CI and fails when it drifts. Verified it bites by perturbing the number. The count GROWING strengthens the cutover-ordering argument rather than weakening it."
  - "2026-09-10: two findings outside this task's touches, surfaced rather than patched (Flow infra is fixed in canonical as its own task). (1) flow-0042 is STRANDED at in_progress on main: PR #59 merged 2026-09-08 but its branch was `adr/mission-control-own-repo` with no [flow-0042] title prefix, so flow-done had nothing to resolve the id from. Needs a human -- `done` is a PR-event transition a worker must not hand-write. (2) .github/workflows/flow-open-pr.yml triggers only on `push: branches: [flow/**]`, but PROTOCOL step 3 tells a cloud/web worker to STAY on the `claude/...` branch its harness assigned. So the auto-draft-PR safety net is off for exactly the sessions most likely to need it; PR #65 had to be opened by hand. Same root cause as (1), seen from the other end: the `flow/` branch convention is load-bearing in more places than the protocol admits. The [<id>] title prefix DID work -- flow-status flipped this task to in_review on a claude/ branch."
  - "2026-09-03: scope grows by one item. ADR-0006 supersedes the `flightdeck/` line in ADR-0005's private-authoring-repo inventory -- mission control moves to CandidDan/inflight, public, Pages-served -- and answers the hosting question ADR-0005 recorded as an open interaction. ADR-0006 deliberately did not edit ADR-0005, because this task claims that file and a fifth link in the flow-0022/0023/0030/0034 file-claim ring helps nobody. TRAP: .flow/bin/adr-split-authoring.test.mjs asserts at line 118 that the flightdeck stays with the authoring repo, and at line 265 that the hosting question is not decided there. Both go red the moment ADR-0005 is amended, so both must be updated in the SAME diff -- which is why that file is now in touches."
  - "2026-08-31: ADR-0005 deliberately left the release repo's name to be chosen at implementation time. It has now been chosen — `CandidDan/flow-protocol` — and three operational constraints surfaced in the same session that the ADR does not carry. All four currently live only in task notes on flow-0029 and flow-0030, which is the wrong home: a task note is read by the worker of that task and nobody else, while the ADR is what a future maintainer reads. This task moves them into the record."
  - "2026-08-31: the human chose the name over `flow-agent-protocol`, dropping `agent` because the protocol is deliberately vendor- and agent-neutral (flow-0006) and ADR-0005 records that the reviewer 'no longer has to be your vendor' — baking today's vocabulary into a permanent public `uses:` reference is the one thing the ADR calls expensive to undo. Record the rejected form and that reason, per this ADR family's habit of keeping the alternatives."
---

## Context

ADR-0005 (`docs/adr/0005-split-authoring-from-release.md`, merged in flow-0028) decided the split
of canonical into a private authoring repo and a public release repo. It deliberately did **not**
name the release repo, recording only the constraint that the name becomes a permanent public
`uses:` reference for every adopter.

The name is now settled: **`CandidDan/flow-protocol`**, public, created 2026-08-31.

Three further constraints emerged while setting it up, none of which the ADR carries, and each of
which is a live trap rather than a nicety:

1. **The release repo must not carry the `flow` GitHub topic.** `topic:flow` is the *enrolment*
   mechanism for the flightdeck and the watchdog (`flightdeck/bin/mission-control.mjs`,
   `flightdeck/bin/watchdog.mjs`), which discover every repo carrying it under the account and then
   read its task store. The release repo has no store by design, so tagging it enrols a phantom
   store-less project into the operator's own rollup.
2. **Canonical must stay public until the re-pin has landed.** 43 non-store files still resolve
   `CandidDan/flow` by reference. Flipping canonical private before flow-0030 has merged and a run
   is green on the new reference breaks every adopting repo's CI simultaneously — in *their* CI,
   with no local change to explain it.
3. **The release repo's tree is owned by the publisher.** Publication is a history-free orphan
   snapshot of the manifest, so it replaces whatever is in the repo. Hand-adding a `LICENSE`,
   `README.md` or anything else there is at best discarded on first publish and at worst confuses
   flow-0029's own out-of-manifest check.

These belong in the ADR because that is the document a future maintainer opens. A task note is read
by the worker of that task and by nobody else.

## Scope

**Does:**

- Add an `# Amendment 1` section to `docs/adr/0005-split-authoring-from-release.md`, following the
  convention ADR-0002 already established for amendments: an `# Amendment 1 — <title>` H1 after a
  `---` rule, carrying `**Status:**`, `**Date:**`, `**Deciders:**` and `**Amends:**` lines, and
  update the ADR's own top `**Status:**` line to note the amendment as ADR-0002's does.
- Record in it:
  - **The name** — `CandidDan/flow-protocol`, public — and that it was chosen over
    `flow-agent-protocol`, with the reason `agent` was dropped (see this file's notes).
  - **The `flow`-topic exclusion**, with the reason: `topic:flow` is flightdeck/watchdog enrolment,
    so tagging a store-less repo creates a phantom project.
  - **The cutover ordering** — publish, then re-pin, then verify green on the new reference, and
    only then flip canonical private — with the reason stated in counts, not vaguely.
  - **The publisher owns the release repo's tree**, so hand-added files are replaced.
- Extend the proving tests in `.flow/bin/adr-split-authoring.test.mjs` to cover the amendment.

**Deliberately does NOT:**

- **Reopen the decision.** ADR-0005's Decision, Consequences and Alternatives stand unchanged. This
  amendment adds what was deferred and what was learned; it revises nothing.
- **Implement any of it.** No publish workflow (flow-0029), no re-pinning (flow-0030), no repo
  settings changes, no visibility flip.
- **Edit `VISION.md`, `README.md`, `CLAUDE.md` or any runbook.**
- **Renumber or restructure the existing ADR body.**

## Acceptance criteria

- [ ] Given `docs/adr/0005-split-authoring-from-release.md`, when it is read, then it contains an
      `# Amendment 1 — <title>` heading carrying `Status`, `Date`, `Deciders` and `Amends` lines in
      the same format as ADR-0002's Amendment 1, and the ADR's top `**Status:**` line notes the
      amendment.
- [ ] Given the amendment, when it is read, then it names the release repo as
      `CandidDan/flow-protocol` and states that it is public.
- [ ] Given the amendment, when it is read, then it records that the release repo must not carry the
      `flow` GitHub topic, and gives the reason — that `topic:flow` is how the flightdeck and
      watchdog enrol a repo, so a store-less repo tagged with it becomes a phantom project.
- [ ] Given the amendment, when it is read, then it records the cutover ordering (publish → re-pin →
      verify green on the new reference → only then flip canonical private) and states the
      consequence of flipping early, that every adopting repo's CI breaks at once.
- [ ] Given the amendment, when it is read, then it records that publication replaces the release
      repo's tree, so files added there by hand do not survive.
- [ ] Given the amendment, when it is read, then it names `flow-agent-protocol` as the rejected
      form and the reason `agent` was dropped.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- The proving tests belong in the existing `.flow/bin/adr-split-authoring.test.mjs` — extend it
  rather than adding a second file for the same document. Note that `touches-guard` ignores all of
  `.flow/**`, so that test file needs no `touches` entry; this mirrors flow-0028 and flow-0014 and
  is established precedent, not an oversight.
- That test file's final case asserts every repo-relative path the ADR names actually exists. It
  deliberately skips two-segment owner/repo slugs, so `CandidDan/flow-protocol` in backticks will
  not be mistaken for a local path — do not weaken that skip to make something pass.
- Do not re-verify the repo's settings from the worker session: `CandidDan/flow-protocol` is
  outside canonical's session scope and an `add_repo` for it fails. The human confirmed it is
  public and untagged on 2026-08-31; record that as given.
