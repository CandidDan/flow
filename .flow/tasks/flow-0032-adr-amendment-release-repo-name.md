---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0032"
title: "Amend ADR-0005 with the chosen release repo name and the operational constraints found after it was written"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-08-31"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G4"]            # the fleet's reference target, and the traps in changing it
touches: ["docs/adr/0005-split-authoring-from-release.md"]
labels: [docs, adr, infra]
notes:
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
