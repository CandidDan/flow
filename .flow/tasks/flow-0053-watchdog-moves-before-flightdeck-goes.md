---
id: "flow-0053"
title: "Move the watchdog off canonical before the flightdeck is deleted, and prove it runs where it lands"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-16"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/flow-watchdog.yml"
  - "docs/adr/0006-mission-control-own-repo.md"
  - "CHANGELOG.md"
labels: [infra, watchdog, flightdeck, fleet]
notes:
  - "2026-09-16 (orchestrator): ADR-0006 already states this ordering constraint in prose — 'inflight exists and its watchdog runs BEFORE canonical's flightdeck is deleted', with liveness.mjs duplicated in both repositories in between as the price of not breaking the watchdog mid-move. This task exists because that constraint is recorded nowhere a machine can read it. flow-0022 (retire board machinery) carries NO `blocked_by` field at all — only a `blocked_reason` paragraph naming flow-0019 and flow-0017, which never mentions the watchdog. flow-0040 made `blocked_by` machine-checkable and is done; the mechanism exists and is unused on the one dependency the ADR went out of its way to write down."
  - "2026-09-16 (orchestrator): the move must NOT assume a working baseline, and this is the finding that shapes the criteria. canonical's watchdog has never run. All 17 scheduled runs of `.github/workflows/flow-watchdog.yml` carry `conclusion: skipped`, back to run 1, because the job is gated on `if: vars.FLOW_WATCHDOG == 'true'` and the repo variable was never set. A skipped job is not a failing job, so nothing ever went red. flow-0020 is `done`, its PR merged, its workflow firing daily — and the component built to make silent automation death loud has been silently dead for its entire life. Relocating it without proving it actually executes in the new home would carry that exact defect across."
  - "2026-09-16 (orchestrator): scope is canonical's HALF only. Creating the caller in `CandidDan/inflight`, moving the `FLOW_WATCHDOG_PAT` secret and landing `liveness.mjs` there cannot be done from this repo and needs its own task in inflight's store. This task's job is the canonical-side sequencing: prove inflight's watchdog has actually run, then remove canonical's caller, and leave the retirement mechanically blocked until both are true."
  - "2026-09-16 (orchestrator): ADR-0006 also records that canonical's coverage floor must be RE-MEASURED after `flightdeck/bin/` leaves the corpus, not assumed — that belongs to flow-0022, not here, because this task does not delete `flightdeck/`. Removing only the caller leaves the modules in the corpus and the floor untouched."
---

## Context

`ADR-0006` moves mission control to `CandidDan/inflight`, and the watchdog with it: it is a
cross-project consumer by exactly the G7 argument that moves the page, so canonical's caller is
deleted and recreated there, with `FLOW_WATCHDOG_PAT` following.

The ADR then records a correction worth repeating, because it is the whole reason this task is
sequenced rather than convenient:

> Deleting `flightdeck/` without relocating that job would silently kill the thing built to make
> silent automation death loud — the exact failure flow-0020 exists to catch, caused by the cleanup.

That constraint is prose. Nothing enforces it. And canonical's watchdog is not merely at risk of
being killed by the cleanup — it has never executed at all (see the notes). So "don't create a gap"
understates the position: there is no coverage to preserve, and the move is the opportunity to
establish some.

## Acceptance criteria

- [ ] Given `flow-0022`'s task file, when it is read, then it carries a populated `blocked_by`
      naming this task — so the retirement is mechanically incapable of landing first, rather than
      relying on a reader noticing a paragraph.
- [ ] Given `inflight`'s watchdog has NOT yet produced a non-skipped run, when this task's own
      criteria are evaluated, then it cannot be marked done — the proof is a run, not a merged
      workflow file. State the run id and its conclusion in the PR body.
- [ ] Given inflight's watchdog has produced a real run, when canonical's
      `.github/workflows/flow-watchdog.yml` is removed, then `npm run build` still passes and the
      count it reports drops by exactly one — an empty or unchanged count means the file was not
      the thing removed.
- [ ] Given canonical after this change, when `.github/workflows/` is searched, then no workflow
      invokes `flightdeck/bin/watchdog.mjs`, and `flightdeck/bin/watchdog.mjs` itself is still
      present and still covered by `npm test` — the caller goes, the module stays until flow-0022.
- [ ] Given `docs/adr/0006-mission-control-own-repo.md`, when it is read after this change, then
      the ordering constraint records that it is now carried by `flow-0022`'s `blocked_by`, and
      names the run that proved inflight's watchdog live.
- [ ] Given a reader who wants to know whether the watchdog is running anywhere, when they read
      the ADR section, then it says which repository owns it and how to confirm it fired — the
      failure this task exists to end is a component everyone believes is running.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run,
      then all pass and coverage stays at or above the floor.

## Scope

**Does not delete `flightdeck/`** — that is flow-0022, which this task blocks. **Does not touch
`liveness.mjs`, `watchdog.mjs` or their tests**: the duplication ADR-0006 accepts is deliberate and
bounded, and removing canonical's copy here would re-create the gap in the opposite direction.
**Does not create anything in `CandidDan/inflight`** — that is a task in that repo's store, and
this one only consumes its result. **Does not** switch `vars.FLOW_WATCHDOG` on in canonical; that
is an operational step for the human, and doing it is worth doing now regardless of this task.
