---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0071"
title: "Decompose the mission control rebuild against ADR-0006, and keep the decomposition out of the public artefact"
status: "done"
priority: 2
project: "flow"
owner: "cf40449c-6558-4504-a62d-d0708b948240"
created: "2026-09-15"
started: "2026-09-23T07:21:34Z"
branch: "flow/flow-0071-mission-control-rebuild-plan"
pr: "https://github.com/CandidDan/flow/pull/95"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G7"]            # same boundary ADR-0006 acts on: the cross-project view is a consumer, not Flow's job
touches: ["docs/mission-control-rebuild-plan.md", ".flow/bin/release-publish.mjs", ".flow/bin/release-publish.test.mjs"]
labels: [docs, flightdeck, infra, planning]
notes:
  - "2026-09-23 (orchestrator): RE-NUMBERED from a duplicate flow-0043. The original allocation (local commit f06fc09, 2026-09-15) was never pushed, and flow-0043 had already been allocated on main to flow-0043-doctor-retired-goal-done-tasks, which is done. The work itself was finished on a local-only branch, docs/mission-control-rebuild-plan (commit c7d8f77), and never pushed. That branch also committed this task file, which the store-guard would fail. The human asked for the work to be recovered, so it is re-allocated here unchanged apart from the id, and the branch is rebuilt without the store file."
  - "2026-09-15: ADR-0006 merged 2026-09-08 and decided the architecture; nothing has been built since, because the decomposition existed only in a Cowork transcript. This task moves it into the record. It does NOT implement anything the plan describes."
  - "2026-09-15: the plan is re-derived rather than transcribed. The phasing agreed on 2026-09-03 predates the backend decision taken later the same day and is wrong in three places — browser-side concurrency (the browser stops fetching entirely), the blocked-age task (append-only snapshots answer it from inflight's own data), and four whole workstreams that did not exist in it (Supabase schema, GitHub App, auth, notification diff). Notification is deliberately sequenced AHEAD of the redesign: being told rather than having to look is half of what justified a backend at all."
  - "2026-09-15: docs/ crosses to the public release repo by an ALLOW list, so a new plan doc is private without any change. The NEVER_PUBLISH entry added here is the independent second opinion described in release-publish.mjs's own comment — it catches a MANIFEST widened by hand, which the allow list structurally cannot catch. flow-infra-propagation-plan.md is the precedent."
  - "2026-09-15: plan documents do NOT get a per-document proving test — that rule is specific to ADRs (adr-vision-layer, adr-split-authoring, adr-mission-control), and adopting-flow-cutover.md has no owning task at all. Checked rather than assumed, because the qa gate blocked PR #59 on exactly this distinction."
---

## Context

[ADR-0006](../../docs/adr/0006-mission-control-own-repo.md) decided where mission control lives and
how it is served — `CandidDan/inflight`, private, Vercel and Supabase, a GitHub App rather than a
pasted PAT — and closes, as its siblings do, with "it decides; it does not implement."

Nothing has implemented it. Twelve days after the merge there is no move task, no build task,
`flightdeck/` is still in canonical, and none of the human-only setup has happened. The reason is
that the decomposition was agreed in conversation and never written down, so there was nothing for a
worker to claim and nothing for the queue to surface.

This task writes the decomposition. It is planning, not building.

## Scope

**Does:**

- Add `docs/mission-control-rebuild-plan.md`: six phases re-derived against the merged ADR, each
  piece attributed to the repository that owns it, with the acceptance bars that are worth making
  mechanical and an explicit record of what changed from the superseded 2026-09-03 phasing.
- Name the plan in `NEVER_PUBLISH`, beside `flow-infra-propagation-plan.md`, and assert both that it
  is denied and that the manifest does not admit it.

**Deliberately does NOT:**

- **Implement any phase.** No repository is created or made private, no Vercel or Supabase project
  exists, no GitHub App is registered, `flightdeck/` is not moved or deleted, and the coverage floor
  is untouched.
- **Write the per-phase tasks.** Phase 0 is human-only setup and the inflight half has nowhere to
  live until `flow-init` has run there. The canonical half — the `flightdeck/` deletion and the floor
  re-measure — is the natural next task and is not written here, because it is blocked behind
  inflight's watchdog running.
- **Touch `flightdeck/`, `CLAUDE.md`, or `.flow/config.yml`.**

## Acceptance criteria

- [x] Given `docs/mission-control-rebuild-plan.md`, when read, then every phase names the repository
      that owns it, and Phase 0 is marked as the prerequisite that blocks the rest.
      *(prose — no proving test; see the notes on why plan docs differ from ADRs)*
- [x] Given the plan, when compared with the 2026-09-03 phasing, then it states explicitly which
      parts of that phasing are superseded and why.
      *(prose — the "What changed" section)*
- [x] Given the plan, when the watchdog ordering constraint is checked, then it requires inflight's
      watchdog to be running before canonical's `flightdeck/` is deleted.
      *(prose — Phase 1a/1b; the constraint itself is asserted in adr-mission-control.test.mjs)*
- [x] Given `NEVER_PUBLISH`, when asserted, then `docs/mission-control-rebuild-plan.md` is denied.
      *(release-publish.test.mjs — "planning documents … must never cross")*
- [x] Given the release manifest, when asserted, then it does not admit the plan either — so the
      document is kept out by both the allow list and the deny list independently.
      *(release-publish.test.mjs — same block, `manifestAdmits` half)*
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Phase 0 is the whole blocker** and is an hour of clicking: make `inflight` private, disable its
  Pages site, create the Vercel and Supabase projects, register the GitHub App, run `flow-init`.
  Every other task in the plan is unwritable until it lands.
- **flow-0040 should probably land before Phase 3.** "Give a blocked task a machine-checkable
  dependency" is `ready` at p3 today. If it lands first, mission control's dependency chain stops
  being a regex over `blocked_reason` prose and becomes a read. Worth sequencing deliberately rather
  than discovering the overlap mid-build.
- **flow-0022 has been blocked on nothing since 2026-09-03** and gates three further tasks. It is the
  design review's headline finding, and the reason it has not moved is that mission control does not
  work yet. That circle wants breaking by hand.
