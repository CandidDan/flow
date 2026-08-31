---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0028"
title: "Record the decision to split canonical into a private authoring repo and a public release repo"
status: "in_progress"
priority: 2
project: "flow"
owner: "session_01WyRqgh77A3uKEFjFmNJhgd"
created: "2026-08-28"
started: "2026-08-31T02:15:02Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G4"]            # how the fleet consumes canonical is exactly what this changes
touches: ["docs/adr/0003-split-authoring-from-release.md"]
labels: [docs, adr, infra]
notes:
  - "2026-08-28: the human's decision, taken in session after two rounds of pushback. Recorded here as an ADR before any implementation, because it changes what canonical IS — the repo that authors Flow stops being the repo the fleet points at. The implementation is flow-0029 (publish mechanism) and flow-0030 (re-pin), both sequenced behind this."
  - "2026-08-28: the alternatives were argued and rejected in session; the ADR must carry them and WHY, not just the outcome. Rejected: keep one public repo (the store, with every task's context, is public — the human's objection, and it is legitimate); make Flow an npm package (reusable workflows resolve by repo ref, so npm cannot carry the primary artefact); take canonical private outright (kills adoption by anyone else — the reusables become uncallable). Also record what the split does NOT buy, which is the point most easily lost."
---

## Context

Canonical is currently one public repository that does three jobs at once: it authors Flow, it is
the artefact the fleet consumes by reference, and it runs Flow on itself. The task store lives in
it, so every task — its context, its blocked reasons, its handoff notes — is public.

The human's objection is to the third consequence, and it is a reasonable one: the planning record
of the work is a different kind of thing from the published artefact, and only one of them needs
to be readable by strangers.

The decision taken is to separate the two: a **private authoring repo** that holds the store, the
history and the automation, and a **public release repo** holding only the artefact the fleet
consumes. Issues logged publicly are fed back for triage.

This ADR exists because the decision changes something structural that later readers will
otherwise have to reverse-engineer — including the reason a future maintainer should not "simplify"
the two repos back into one. It also needs to state, prominently, the thing the split does not do,
because the split *feels* like it makes the automation safe and it does not.

## Scope

**Does:**

- Add `docs/adr/0003-split-authoring-from-release.md` in the existing ADR shape, recording:
  - **Context** — one public repo doing three jobs; the store being public as the objection.
  - **Decision** — private authoring repo as source of truth; public release repo holding the
    artefact only (`.github/workflows/_flow-*.yml`, `project-template/`, the top-level licence and
    version files, `docs/`); publication by mechanical snapshot on release; adopters pin the
    public repo.
  - **Consequences**, including the ones that are not obvious:
    - Dogfooding survives and improves: the authoring repo calls its reusables by local path, so
      it runs the exact files it publishes, rather than pinning a ref to itself as it does today.
    - The public surface ends up holding no task store, no secrets and no AI workflows — a
      materially smaller attack surface than today, which is a benefit of the split beyond the
      privacy motivation.
    - **The split does not filter content.** Feeding public issues back for triage delivers the
      same outsider-authored text to the same agent, now running against the private repo. The
      input-trust boundary is `flow-0027` and it is required independently. State this in the
      Consequences explicitly, because "we made it private" is the belief this ADR must prevent.
    - Publication must not carry history: an artefact snapshot per release, not a
      history-preserving push, or the commits being withheld are exported anyway.
    - Every `CandidDan/flow` reference in the template, the helpers and the runbooks becomes a
      reference to the release repo, and adopting repos need re-pinning.
  - **Alternatives rejected**, with the reason each was rejected — see this file's notes. An ADR
    that records only the chosen option is a decision log with the reasoning removed.
- Cross-reference ADR-0002 and its Amendment 1 where the flightdeck's hosting question is affected:
  the release repo is a candidate host precisely because it holds no store.

**Deliberately does NOT:**

- **Implement any of it.** No publish workflow, no re-pinning, no repo creation. Those are
  flow-0029 and flow-0030, sequenced behind this.
- **Edit `VISION.md`, `README.md`, `CLAUDE.md` or any runbook.** They describe a world this ADR
  only decides to change; they are updated by the task that changes it.
- **Decide the release repo's name.** Record that the name is chosen at implementation time and
  note the constraint that matters — it becomes a public, permanent `uses:` reference for every
  adopter, so it is expensive to change later.

## Acceptance criteria

- [ ] Given `docs/adr/`, when this task is done, then `0003-split-authoring-from-release.md` exists
      and follows the same section shape as the existing ADRs in that directory.
- [ ] Given the ADR, when its Decision section is read, then it states which artefacts live in the
      public release repo and which stay private, specifically enough that flow-0029 can be
      implemented from it without re-deciding the boundary.
- [ ] Given the ADR, when its Consequences section is read, then it states explicitly that the
      split does not filter untrusted issue content and that `flow-0027` is required
      independently — named, not implied.
- [ ] Given the ADR, when its Consequences section is read, then it records that publication must
      be a snapshot without history, and why.
- [ ] Given the ADR, when its Alternatives section is read, then it names the three rejected
      options (single public repo, npm package, canonical private outright) each with the reason
      it was rejected.
- [ ] Given the ADR, when a reader looks for the dogfooding consequence, then it records that the
      authoring repo calls its reusables locally and therefore runs what it publishes.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- This is a docs-only task, so the criteria are assertions about the document's content. If the
  repo has an existing ADR-shape test, extend it rather than inventing a second convention; if it
  does not, a test that reads the file and asserts the required sections are present and
  non-empty is enough. Do not invent a prose-quality check.
- The decision is the human's and is settled — do not reopen it in the ADR. Record the reasoning
  faithfully, including the arguments against, but write it as a decision taken, not as an open
  question.
