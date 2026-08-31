---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0028"
title: "Record the decision to split canonical into a private authoring repo and a public release repo"
status: "done"
priority: 2
project: "flow"
owner: "session_01WyRqgh77A3uKEFjFmNJhgd"
created: "2026-08-28"
started: "2026-08-31T04:45:19Z"
branch: "flow/flow-0028-adr-split-authoring-from-release"
pr: "https://github.com/CandidDan/flow/pull/44"
issue: ""
blocked_reason: ""
serves: ["G4"]            # how the fleet consumes canonical is exactly what this changes
touches: ["docs/adr/0005-split-authoring-from-release.md"]
labels: [docs, adr, infra]
notes:
  - "2026-08-31: UNBLOCKED by orchestrator. Renumbered the deliverable 0003 -> 0005 in all three places that named it — `touches`, the Scope bullet and acceptance criterion 1 (the blocked_reason named two; the Scope bullet was the third, and leaving it would have been exactly the doc drift flow-0016 exists to clear). 0005 is the next free number: docs/adr/ holds 0001-0004. Nothing else about the task changed — the ADR content, scope and remaining criteria stand as written. Returned to `ready`, unclaimed. flow-0029 and flow-0030 unblock once this merges."
  - "2026-08-28: the human's decision, taken in session after two rounds of pushback. Recorded here as an ADR before any implementation, because it changes what canonical IS — the repo that authors Flow stops being the repo the fleet points at. The implementation is flow-0029 (publish mechanism) and flow-0030 (re-pin), both sequenced behind this."
  - "2026-08-28: the alternatives were argued and rejected in session; the ADR must carry them and WHY, not just the outcome. Rejected: keep one public repo (the store, with every task's context, is public — the human's objection, and it is legitimate); make Flow an npm package (reusable workflows resolve by repo ref, so npm cannot carry the primary artefact); take canonical private outright (kills adoption by anyone else — the reusables become uncallable). Also record what the split does NOT buy, which is the point most easily lost."
  - "2026-08-31: claimed by session_01WyRqgh77A3uKEFjFmNJhgd, then blocked WITHOUT writing the ADR — the spec is unsatisfiable as written, not merely awkward. ADR 0003 and 0004 are both already taken, so the declared filename cannot be used, and the correct filename (0005) is outside the declared `touches`. Both failure modes were reproduced rather than reasoned about; see blocked_reason. Deliberately did NOT: pick 0005 and let touches-guard go red, pick 0003 and knowingly break a green test, or edit `touches`/criteria myself — the worker hand-writes only the claim and `blocked`, and silently widening scope is the exact drift `touches-guard` exists to catch. The baseline gate was confirmed green first (`npm ci`, `npm test`: 674 pass / 0 fail), so nothing here is a pre-existing failure. Next session: after the renumber, this is a straight docs task — write the ADR per Scope, and extend the ADR-shape test convention in `.flow/bin/`."
  - "2026-08-31: DONE pending merge. ADR written as `docs/adr/0005-split-authoring-from-release.md` on branch flow/flow-0028-adr-split-authoring-from-release, PR #44 (draft). Gate green locally and in CI: build 22 workflows, lint 67 .mjs, test 697 (696 pass / 0 fail / 1 skip, up from 675 on main), coverage 95.3% lines vs floor 83.5; touches-guard decision=enforced reason=in-scope. All three PR review checks PASS (qa, security, code-review) — code-review independently reproduced the gate and spot-checked two factual claims in the prose (the 40-file CandidDan/flow count, and that flow-gates.yml still self-pins). Only non-blocking note: that 40-file count is point-in-time; code-review confirmed no action needed as the ADR already says 'at the time of writing'. Proving tests are `.flow/bin/adr-split-authoring.test.mjs` (22 tests), following the adr-vision-layer.test.mjs per-ADR convention rather than inventing a second one. Design decision a future session should not re-litigate: the Decision section states a boundary RULE (published only if an adopter needs it at run time or adoption time) as well as the two file lists, because two enumerations go stale the moment a file is added and flow-0029 needs to resolve files that did not exist when this was written. NEXT ACTION: human reviews, marks ready-for-review and merges #44; flow-done then flips this to done, which unblocks flow-0029 and then flow-0030."
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

- Add `docs/adr/0005-split-authoring-from-release.md` in the existing ADR shape, recording:
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

- [ ] Given `docs/adr/`, when this task is done, then `0005-split-authoring-from-release.md` exists
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
