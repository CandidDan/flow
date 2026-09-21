---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0067"
title: "Nothing reports a dead watchdog — its liveness is self-attested, and a watchdog that stops running cannot file the issue saying so"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-09-21"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Needs one human decision before it is workable, and it is an architectural one rather than an implementation detail: whether Flow accepts an EXTERNAL dependency (an off-GitHub dead-man's-switch the watchdog pings on each completed sweep, alerting when the pings stop) in order to terminate the regress, or instead accepts a bounded in-GitHub check and DOCUMENTS the residual blind spot. Every in-GitHub mechanism is itself a scheduled workflow in the same account, failing by the same modes, so it moves the blind spot rather than closing it — which is a legitimate choice, but it is the human's to make and it wants an ADR either way. Not machine-checkable."
blocked_by: []
serves: ["maintenance"]
touches:
  - "docs/adr/**"
  - "flightdeck/bin/watchdog.mjs"
  - "flightdeck/bin/watchdog.test.mjs"
labels: [infra, watchdog, liveness, detection, adr]
notes:
  - "2026-09-21 (orchestrator): THE OBVIOUS READING OF TODAY'S EVIDENCE IS THE WRONG ONE, and recording that is half the value of this task. Run 35576492079 (2026-09-21T08:10Z) shows canonical's own `down` list containing exactly one entry — `.github/workflows/flow-watchdog.yml`, `state: crit`, `reason: \"no successful run recorded\"` — and an `automation-down` issue filed against itself at CandidDan/flow#84. That looks like a self-alarm loop worth breaking. It is NOT. The alarm is TRUE: `watchdog.mjs:498` exits 1 whenever any repo is `unavailable`, `CandidDan/inflight` and `CandidDan/borders` are misclassified as unavailable (flow-0055), so the workflow genuinely has no successful run in 24 attempts. Once flow-0055 lands the process exits 0, a success is recorded, and the watchdog closes its own issue automatically. DO NOT write a fix for the self-alarm; there is nothing wrong with it."
  - "2026-09-21 (orchestrator): the real gap is the one that hides behind that, and it is the inverse. The self-report works ONLY WHILE THE WATCHDOG STILL RUNS. Every liveness signal the watchdog produces — including the one about itself — is a product of a sweep executing. If no sweep executes, no issue is filed, nothing turns red, and the silence is indistinguishable from health. A dead watchdog cannot report its own death. That is precisely the failure mode flow-0020 built this component to end ('GitHub notifies on failure, never on absence'), reappearing one level up at the single component that has nothing above it."
  - "2026-09-21 (orchestrator): the ways it goes silent are concrete, not hypothetical, and at least one is automatic. (1) GITHUB DISABLES SCHEDULED WORKFLOWS AFTER 60 DAYS OF REPOSITORY INACTIVITY — no commit needed, no notification that matters, and canonical is exactly the kind of repo that can go quiet for two months. (2) The repo variable `FLOW_WATCHDOG` is flipped off `true` and the job's `if:` skips it — a skipped job records no failure. (3) `FLOW_WATCHDOG_PAT` expires or is revoked, and the credentialled preflight exits 1 BEFORE the sweep runs, so no repo is ever read. (4) The repo is archived. In (1), (2) and (4) there is no red tick at all; in (3) there is one, but it is the same daily red the watchdog already shows today, which is how a real failure hides inside a familiar one."
  - "2026-09-21 (orchestrator): NOTHING ELSE IN THE REPO COVERS IT — checked, not assumed. `flow-compass.yml` is a weekly vision-drift audit on `0 7 * * 1` whose entire output surface is a filed issue about VISION.md; it does not read run history. The flightdeck is a rollup renderer over state it is given, not a scheduled prober. `flow-recover` sweeps stranded TASKS, not workflows. There is no second scheduled job anywhere in the fleet that reads `flow-watchdog.yml`'s run history."
  - "2026-09-21 (orchestrator): flow-0053 RELOCATES THIS, IT DOES NOT SOLVE IT, and whoever works either task should know that. Moving the watchdog to `CandidDan/inflight` means canonical is watched from outside, which is a genuine improvement for canonical — but inflight's watchdog then has nothing above IT, and the gap is wherever the last watchdog lives. Sequencing does not matter: this task is about the terminal node of the chain, not about which repo that node is in."
  - "2026-09-21 (orchestrator): why this is blocked rather than ready. The regress is real — any in-GitHub checker is a scheduled workflow in the same account, disabled by the same 60-day rule, gated on the same kind of variable, and dead in the same outage. It therefore moves the blind spot one hop rather than closing it. An external dead-man's-switch closes it properly by leaving GitHub entirely, at the cost of a dependency this repo has so far avoided. Both are defensible, the choice determines the entire scope, and it wants an ADR with the rejected alternative recorded — which is the house pattern in `docs/adr/`. Picking one myself would be inventing direction rather than decomposing it."
---

## Context

The watchdog exists because "GitHub notifies on failure, never on absence" — a scheduled workflow
that quietly stops running produces no event, fails no check, and turns nothing red. It closes
that gap for every workflow in the fleet.

It does not close it for itself.

Every signal the watchdog emits, including the entry it writes about its own workflow, is produced
*by a sweep running*. If the sweep stops happening — and the third note lists four concrete ways
it can, one of them automatic and silent after 60 days of repository inactivity — then no issue is
filed, nothing goes red, and the fleet's only liveness monitor is indistinguishable from a healthy
one.

The first note matters as much as the rest: today's self-filed issue (CandidDan/flow#84) looks
like the bug and is not. It is a *correct* report of a real condition that flow-0055 will clear.
A session that "fixes" it will have removed a working alarm and left the actual gap untouched.

## Scope

Not final — the blocking decision determines it. What is settled:

- An ADR in `docs/adr/` recording the decision, the regress argument, and the rejected
  alternative. This is owed whichever way the decision goes, and is the deliverable that survives
  either choice.

What follows the decision:

- **If external:** emit a heartbeat from `watchdog.mjs` on each *completed* sweep — completed, not
  successful, since a sweep that finishes and reports problems is the watchdog working correctly
  and must still count as alive. Plus the setup documentation, treated as a human-only step in the
  manner of `FLOW_WATCHDOG_PAT`.
- **If in-GitHub:** the bounded checker, plus explicit documentation in `flow-watchdog.yml`'s
  header of the blind spot that remains, so the next reader is not misled into thinking the chain
  terminates.

Deliberately **not** touched in either case:

- The self-filed `automation-down` issue behaviour, and the exit-1-on-unavailable rule at
  `watchdog.mjs:498`. Both are correct. The 404 misclassification that currently triggers the
  latter is flow-0055's, and this task must not pre-empt it.
- `liveness.mjs`. The threshold maths is flow-0057's and flow-0066's; this task is about whether a
  sweep happens at all, which is a different predicate.
- The watchdog's `permissions:` block, which `watchdog.test.mjs` parses and fails on any widening.

## Acceptance criteria

Cannot be finalised until the block clears — the observable outcome differs per mechanism. The
criterion that holds either way, and that the ADR must satisfy:

- [ ] Given the watchdog has produced no completed sweep for longer than its own schedule allows,
      when the chosen mechanism next evaluates, then a human is alerted through a channel that
      does **not** depend on a sweep having run.
- [ ] Given a sweep that completes and reports problems (exit 1, repos unreadable), when the
      mechanism evaluates, then the watchdog is treated as **alive** — a working watchdog
      reporting bad news must never read as a dead one.
- [ ] The ADR records the regress argument and the rejected alternative, per the house pattern in
      `docs/adr/`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

The one question, for the human, stated as narrowly as it can be:

> Does Flow accept an external (off-GitHub) dead-man's-switch in order to close this, or does it
> accept a bounded in-GitHub check and document the residual blind spot?

Answer that and this becomes `ready` with a finishable scope. Until then it should not be picked
up — a worker choosing the mechanism itself would be setting direction, not implementing it.
