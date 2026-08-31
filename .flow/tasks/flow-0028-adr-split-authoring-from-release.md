---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0028"
title: "Record the decision to split canonical into a private authoring repo and a public release repo"
status: "blocked"
priority: 2
project: "flow"
owner: "session_01WyRqgh77A3uKEFjFmNJhgd"
created: "2026-08-28"
started: "2026-08-31T02:15:02Z"
branch: ""
pr: ""
issue: ""
blocked_reason: "The declared deliverable path collides with an existing ADR number, and both places that name it are orchestrator-owned. `docs/adr/0003-flow-mcp-server.md` (2026-08-11) and `docs/adr/0004-vision-layer.md` (2026-08-18) both predate this task, so the next free number is 0005 — but `touches` and acceptance criterion 1 both name `docs/adr/0003-split-authoring-from-release.md`. Proven on both horns, not assumed: (a) writing it as 0003 makes the EXISTING, currently-green test `no two ADRs share a number` in `.flow/bin/adr-vision-layer.test.mjs` fail (verified: 'duplicate ADR numbers in docs/adr/: 0003'), which fails criterion 7 and the gate; (b) writing it as 0005 puts the task's only deliverable outside `touches`, so `touches-guard` exits 1 (verified via `checkTouches`) and the gate fails. There is no filename that satisfies both, so this is not a judgement call the worker can make by drifting. The ADR CONTENT is fully specified and needs no rework. UNBLOCK: on `main`, renumber to 0005 in exactly two places in this file — `touches` and acceptance criterion 1 — then flip to ready. Nothing else about the task changes. Note the proving test belongs in `.flow/bin/` (extending the ADR-shape convention, per this task's own notes); touches-guard ignores `.flow/**`, so the test file needs no `touches` entry. flow-0029 and flow-0030 remain blocked behind this."
serves: ["G4"]            # how the fleet consumes canonical is exactly what this changes
touches: ["docs/adr/0003-split-authoring-from-release.md"]
labels: [docs, adr, infra]
notes:
  - "2026-08-28: the human's decision, taken in session after two rounds of pushback. Recorded here as an ADR before any implementation, because it changes what canonical IS — the repo that authors Flow stops being the repo the fleet points at. The implementation is flow-0029 (publish mechanism) and flow-0030 (re-pin), both sequenced behind this."
  - "2026-08-28: the alternatives were argued and rejected in session; the ADR must carry them and WHY, not just the outcome. Rejected: keep one public repo (the store, with every task's context, is public — the human's objection, and it is legitimate); make Flow an npm package (reusable workflows resolve by repo ref, so npm cannot carry the primary artefact); take canonical private outright (kills adoption by anyone else — the reusables become uncallable). Also record what the split does NOT buy, which is the point most easily lost."
  - "2026-08-31: claimed by session_01WyRqgh77A3uKEFjFmNJhgd, then blocked WITHOUT writing the ADR — the spec is unsatisfiable as written, not merely awkward. ADR 0003 and 0004 are both already taken, so the declared filename cannot be used, and the correct filename (0005) is outside the declared `touches`. Both failure modes were reproduced rather than reasoned about; see blocked_reason. Deliberately did NOT: pick 0005 and let touches-guard go red, pick 0003 and knowingly break a green test, or edit `touches`/criteria myself — the worker hand-writes only the claim and `blocked`, and silently widening scope is the exact drift `touches-guard` exists to catch. The baseline gate was confirmed green first (`npm ci`, `npm test`: 674 pass / 0 fail), so nothing here is a pre-existing failure. Next session: after the renumber, this is a straight docs task — write the ADR per Scope, and extend the ADR-shape test convention in `.flow/bin/`."
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
