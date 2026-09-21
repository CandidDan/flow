---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0066"
title: "Liveness has no minimum crit bound — a sub-hourly cron is judged inside GitHub's own scheduler jitter"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-21"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "flightdeck/bin/liveness.mjs"
  - "flightdeck/bin/liveness.test.mjs"
labels: [infra, watchdog, liveness, false-positive]
notes:
  - "2026-09-21 (orchestrator): HONESTY FIRST — THIS HAS NOT YET FIRED A FALSE POSITIVE, and the task is written on the margin rather than on an incident. On 2026-09-21 the 08:10 sweep flagged `flow-recover` crit in BOTH CandidDan/Nudge and CandidDan/TanPlan at `last success 1.1h ago` / `1.2h ago`, and it was RIGHT both times: GitHub had stopped allocating runners to private repos at ~07:46Z when the account's Actions spending limit was reached, and every run since had failed in 3-4s with no runner assigned. So today's data shows the tight bound DETECTING FAST, not crying wolf. What follows is an argument about headroom, and it should not be written up as though an alarm had already misfired."
  - "2026-09-21 (orchestrator): the arithmetic, measured rather than assumed. `liveness.mjs:230` is `critAfterHours = maxGapHours + intervalHours` with no lower bound. For Nudge's `flow-recover` cron `*/30 * * * *` that is 0.5 + 0.5 = 1.0h. The observed gaps between consecutive SUCCESSFUL runs that morning, while the workflow was entirely healthy, were 31m, 27m, 29m, 42m and 42m (runs 3256-3261: ids 35560008535, 35561947409, 35563506355, 35565239435, 35567979793, 35571005650). The largest healthy gap was 42m — 70% of the crit bound. GitHub documents that scheduled workflows may be delayed or dropped entirely during periods of high load, and a single dropped firing on a 30-minute cron yields a ~60-72m gap. That crosses the bound with nothing wrong."
  - "2026-09-21 (orchestrator): THE DETECTION-LATENCY OBJECTION DOES NOT SURVIVE CONTACT WITH THE WATCHDOG'S OWN CADENCE, and this is the argument that makes the floor clearly right rather than a judgement call. `flow-watchdog.yml` runs `0 8 * * *` — ONCE A DAY. Detection granularity is therefore already ~24h, so any floor below about 12h costs no practical detection latency at all: what the bound actually decides is whether a healthy-but-jittery workflow happens to LOOK dead at the single moment the daily sweep reads it. A 1.0h bound against 42m of observed jitter is a coin-flip at sweep time; a 2h bound is not. Raising the floor buys real false-positive headroom for approximately zero detection cost. On today's outage a 2h floor would have alarmed on the same daily sweep it did alarm on."
  - "2026-09-21 (orchestrator): this is the residue of flow-0057, not a re-run of it. flow-0057 fixed the CLUSTERED case, where the average interval collapses under a long scheduled gap, by changing the bound to `maxGap + interval`. That is correct and must not be disturbed. It does nothing for the EVENLY-SPACED SHORT case, where maxGap and interval are both small and genuinely equal, so the bound is simply `interval * 2` and shrinks without limit as the cron gets more frequent. A floor is orthogonal to flow-0057's fix and composes with it: take the larger of the two."
  - "2026-09-21 (orchestrator): DO NOT ADD A TUNING KNOB. `liveness.mjs:196-202` refuses one explicitly — 'no tuning knob and no allowlist (a knob would let a genuinely dead workflow be silenced by configuration, which is the one thing a watchdog must not permit)'. That reasoning stands and this task must not weaken it. A single constant in the module is not a knob: it cannot be set per-repo, it is visible in canonical's diff, and changing it is a reviewed edit rather than a configuration act."
---

## Context

The watchdog's `crit` bound is derived entirely from a workflow's own cron text, which is the
right instinct — it means no tuning knob and no per-repo allowlist. But the derivation has no
lower limit, so the more frequently a workflow is scheduled the *less* slack it is granted, until
the bound falls inside the range of GitHub's own scheduler jitter.

Nudge's `flow-recover` runs `*/30 * * * *`, giving a 1.0h bound. Its measured healthy gaps that
morning reached 42m. GitHub delays and sometimes drops scheduled firings under load; one dropped
firing puts a perfectly healthy workflow over the line.

The reason this is worth fixing rather than tolerating is in the third note: the watchdog itself
only runs once a day, so the bound is not buying detection speed. It is only deciding whether a
healthy workflow looks dead at the instant of the daily sweep — and at 1.0h against 42m of
observed jitter, that is close to a coin flip.

A false `automation-down` issue is not a cosmetic cost. flow-0057 recorded the reason: a label
that cries wolf is how the alarm stops being read, and an ignored watchdog is indistinguishable
from no watchdog.

## Scope

- Introduce a minimum crit bound in `scheduledLiveness`, as a **named exported constant**, and
  take the larger of it and the existing `maxGapHours + intervalHours`.
- Set it to **2 hours**, for the reason recorded in the notes: the watchdog's own cadence is
  daily, so a 2h floor costs no meaningful detection latency while clearing the observed jitter
  envelope by a comfortable margin.
- Extend `liveness.test.mjs` to cover the criteria below.

Deliberately **not** touched:

- `cronCadence`, `cronIntervalHours`, `cronMaxGapHours` — the cadence maths is correct and
  flow-0057 just settled it.
- The `warn` band. Only the `crit` bound gains a floor; `warn` continues to trigger at
  `maxGapHours`.
- Any per-repo or per-workflow configuration. See the fifth note — a knob is explicitly refused.
- `watchdog.mjs` and `watchdog.test.mjs`. The last-success *lookup* is flow-0065's, the 404
  *classification* is flow-0055's, and neither is this task.
- The `crit` reason-string prefix, which `watchdog.test.mjs` matches verbatim and which is
  outside this task's `touches`.

## Acceptance criteria

- [ ] Given a cron of `*/30 * * * *` and a last success 1.1h ago, when `scheduledLiveness` runs,
      then `state` is not `crit` — the floor holds the bound above the observed jitter envelope.
- [ ] Given a cron of `*/30 * * * *` and a last success 2.1h ago, when `scheduledLiveness` runs,
      then `state` is `crit` — the floor delays the alarm, it never removes it.
- [ ] Given a cron of `0 */3 * * *` (bound 6h, already above the floor) and a last success 6.1h
      ago, then `state` is `crit` — the floor never *lowers* a bound, and never raises one that
      is already above it.
- [ ] Given a cron of `0 9-18 * * 1-5` and a last success 14h ago, then `state` is not `crit` —
      flow-0057's clustered-cron behaviour is unchanged by this task.
- [ ] The floor is a named export, and a test asserts its exact value, so any future change to it
      is a deliberate, reviewed edit rather than a silently drifting number.
- [ ] Given any `crit` result, the reason string still begins `last success Xh ago, cron interval
      ~Yh` verbatim, so `watchdog.test.mjs` continues to pass unmodified.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

The 2h value is specified rather than left open, so this task is workable without a further
decision. If the worker finds evidence that the jitter envelope is materially wider than the 42m
measured here, raise it in the PR rather than silently choosing a different number — the constant
is meant to be argued about in review, which is why the fifth criterion pins it with a test.
