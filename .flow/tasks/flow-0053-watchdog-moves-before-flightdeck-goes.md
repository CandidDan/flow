---
id: "flow-0053"
title: "Move the watchdog off canonical before the flightdeck is deleted, and prove it runs where it lands"
status: "blocked"
priority: 2
project: "flow"
owner: "session_01Flow0053Worker"
created: "2026-09-16"
started: "2026-09-28T04:05:54Z"
branch: ""
pr: ""
issue: ""
blocked_reason: "Blocked on inflight's half, which does not exist yet: `CandidDan/inflight` has NO `.github/workflows/flow-watchdog.yml` (its workflows directory holds flow-compass, flow-done, flow-gates, flow-open-pr, flow-queue-runner, flow-recover, flow-review, flow-status, flow-sync, flow-triage and nothing else), no `flightdeck/bin/` directory at all (404, so no liveness.mjs or watchdog.mjs to invoke), and no task in its store (inflight-0001..0011) that creates any of them. Criterion 2 of this task is explicit that the proof is a non-skipped RUN, not a merged workflow file, so with zero runs possible the remaining criteria (3, 5, 6) cannot be met and canonical's caller must not be removed. UNBLOCK: (1) a task in inflight's store lands the watchdog caller + liveness.mjs/watchdog.mjs there, (2) the human moves FLOW_WATCHDOG_PAT and sets FLOW_WATCHDOG=true in inflight, (3) inflight's watchdog produces a non-skipped run and its id/conclusion are recorded here; then flip to ready. This block is not machine-checkable from canonical: there is no id in any store for a sweep to watch (the inflight-side task has not been written), and this repo's token is refused Actions: read on inflight (HTTP 403 on repos/CandidDan/inflight/actions/runs), so nothing here can observe that run even once it happens."
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
  - "2026-09-16 (orchestrator): the note above is superseded in part — canonical's watchdog HAS now executed. Run 18 of `.github/workflows/flow-watchdog.yml` (workflow_dispatch, `--dry-run`, 2026-09-16 04:14, https://github.com/CandidDan/flow/actions/runs/35054806511) ran with FLOW_WATCHDOG=true and FLOW_WATCHDOG_PAT set, discovered 6 repos and classified 47 workflows across 4 of them. It exited 1 — two repos carrying the `flow` topic have not adopted Flow, see flow-0055 — so there is still no SUCCESSFUL run, and the criterion below that proof-is-a-run stands unchanged for inflight. What changes is the premise: the module is no longer unexercised, so the move can be measured against a known-good baseline rather than a blank one. Run 18's output is the baseline."
  - "2026-09-28 (worker, session_01Flow0053Worker): claimed, investigated, BLOCKED — no code written, no branch cut, no PR. The premise in the notes above has moved twice and here is the state as of today. (a) CANONICAL's watchdog is now fully live: FLOW_WATCHDOG is 'true' and FLOW_WATCHDOG_PAT is set, and it has fired on SCHEDULE daily — runs 36305270075 (2026-09-27), 36228906144, 36111393634, 35973627455, 35835520300 — so 'has never run' is dead as a premise. Every one of those is `conclusion: failure`, and the reason is entirely flow-0055's: `flow-watchdog: CandidDan/borders enrolled but not adopted - carries the flow topic but has no .github/workflows`, then `0 repo(s) unreadable, 1 enrolled but not adopted, 0 with failed writes`, exit 1. Discovery itself works (`query: user:CandidDan topic:flow`, `discoveredNothing: false`) and it does reach inflight, which carries the topic. So the module is exercised daily against the real fleet; the red is the enrolment condition firing correctly, not a defect in the watchdog. (b) INFLIGHT's half does not exist — see blocked_reason for the exact evidence. That is the block."
  - "2026-09-28 (worker): criterion 1 IS ALREADY SATISFIED and needs no work from this task. flow-0022 carries `blocked_by: [\"flow-0053\"]` on main, written by the orchestrator in d6ffdf7 ('flow: block flow-0022 on flow-0053'). The next worker should verify it is still there and tick it, not re-do it. Note it is task state, so it belongs on main and can never be part of this task's PR anyway — consistent with `touches`, which lists only the workflow, the ADR and CHANGELOG.md."
  - "2026-09-28 (worker): baseline for criterion 3, measured today on main so the next worker does not have to re-derive it. `npm run build` reports `check-workflows: 34 workflow file(s) parsed in .github/workflows, project-template/.github/workflows`. After `.github/workflows/flow-watchdog.yml` is deleted the count must read exactly 33 — a 34 means the delete did not land, and anything else means something outside this task's scope moved too."
  - "2026-09-28 (worker): EXACT NEXT ACTION for whoever picks this up after the unblock. Do not start until inflight has a non-skipped watchdog run id in hand. Then: (1) `git rm .github/workflows/flow-watchdog.yml`; (2) confirm `npm run build` prints 33, and read criterion 4 carefully before grepping: after the delete, `grep -rn watchdog.mjs .github/workflows/` still hits plane-guard.yml (line 74, a COMMENT) and flow-release-publish.yml's precedent comment (lines 20, 145). Neither is a watchdog caller. Separately, `.flow/bin/plane-guard.mjs` and `.flow/bin/release-publish.mjs` both IMPORT flightdeck/bin/watchdog.mjs (plane-guard for `codeSpan`), and their workflows invoke those helpers — that is a module import by two other canonical-only workflows, not the scheduled watchdog job, and criterion 4 is about the scheduled job. Touch none of them; those live imports are also part of why the module stays until flow-0022; (3) confirm `flightdeck/bin/watchdog.mjs` and its test are untouched and still run under `npm test`; (4) update `docs/adr/0006-mission-control-own-repo.md` to say inflight owns the watchdog, name the proving run id + conclusion, say how a reader confirms it fired, and record that the ordering constraint is now carried by flow-0022's `blocked_by` rather than by that section's prose; (5) CHANGELOG.md is in `touches` and there is no `changes/` directory in canonical, so the entry goes in CHANGELOG.md directly. Scope reminder: flightdeck/ is NOT deleted here (that is flow-0022) and the coverage floor is NOT re-measured here."
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
