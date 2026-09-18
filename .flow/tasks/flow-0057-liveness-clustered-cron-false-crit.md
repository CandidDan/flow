---
id: "flow-0057"
title: "Liveness calls a clustered cron dead every night — the average interval hides the real gap"
status: "in_review"
priority: 1
project: "flow"
owner: "session_018H1cKZqBRNbZdkotje35W3"
created: "2026-09-16"
started: "2026-09-18T08:19:08Z"
branch: "claude/can-this-be-resolved-of6kjq"
pr: "https://github.com/CandidDan/flow/pull/85"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "flightdeck/bin/liveness.mjs"
  - "flightdeck/bin/liveness.test.mjs"
labels: [infra, watchdog, liveness, false-positive]
notes:
  - "2026-09-17 (orchestrator): SECOND CONSECUTIVE NIGHT CONFIRMED, and the auto-close cost is now bounded. (1) RECURRENCE: the 08:09 sweep filed CandidDan/Nudge#289 against `flow-queue-runner` again. The real gap was 2026-09-16T18:05:13Z (run 646, event schedule, conclusion success) to the 08:09 sweep \u2014 14.1h against a crit bound of ~6.7h, exactly the overnight shape this task predicts for `0 9-18 * * 1-5`. Two nights running, same workflow, same cause. (2) CITE THE RUN TIMESTAMPS, NOT THE ISSUE: #289 PRINTS 230.1h, which is wrong by nine days. That is a separate defect in the watchdog\u0027s last-success lookup, now flow-0065, and anyone using #289 as evidence for this task should quote the run history instead. (3) AUTO-CLOSE WORKS: Nudge#278, the first false positive, was closed at 2026-09-17T06:28:07Z by github-actions[bot] with state_reason completed \u2014 about 22 hours after it was filed. So the harm from this defect is bounded at roughly a day of an open `automation-down` issue per occurrence, not an indefinitely open one. That bounds the severity without excusing it: a label that cries wolf nightly is how the label stops being read."
  - "2026-09-16 (orchestrator): found by chasing a real report, not by reading. The watchdog's first real run (https://github.com/CandidDan/flow/actions/runs/35054806511, 04:14 UTC) flagged `CandidDan/Nudge`'s `.github/workflows/flow-queue-runner.yml` as `crit`, `last success 10.2h ago, cron interval ~3.4h`. The workflow is healthy. Its cron is `0 9-18 * * 1-5` — hourly between 09:00 and 18:00 UTC, weekdays only — and its last run at 2026-09-15T18:04:47Z was the last slot of the day. The next firing was 09:00 the following weekday, exactly as scheduled."
  - "2026-09-16 (orchestrator): the arithmetic, so the fix is not guessed at. `cronIntervalHours` counts distinct fire-minutes in a fixed 28-day window and divides. For `0 9-18 * * 1-5`: 10 fires/day x 5 weekdays x 4 weeks = 200 fires; 28 x 24 = 672 window hours; 672/200 = 3.36h, which is the ~3.4h the run printed. `scheduledLiveness` sets crit at `ageHours > intervalHours * 2` = 6.72h. The real overnight gap is 18:00 to 09:00 = 15h, and the weekend gap is Friday 18:00 to Monday 09:00 = 63h. So this workflow is crit from roughly 00:45 every weeknight until 09:00, and for the whole weekend. That is the majority of the week, not an edge."
  - "2026-09-16 (orchestrator): the average was a deliberate choice and the comment at liveness.mjs:118-124 says so — 'a weekday-morning cron has a ~60h weekend gap that would make every Monday read crit under a worst-case rule, which is exactly the false alarm an average interval avoids'. That reasoning is correct for a SPARSE cron and must not be thrown away: `0 7 * * 1-5` gives 5 fires/week, 168/5 = 33.6h average, crit at 67.2h, which survives the 63h weekend gap. The average fails only when firings are CLUSTERED — many per day inside a bounded window — because the fire count collapses the average while the longest gap stays long. Any fix has to keep the sparse case passing; a naive switch to worst-case gap re-creates the exact false alarm this code was written to prevent."
  - "2026-09-16 (orchestrator): severity is why this is priority 1 above flow-0055. flow-0055 is a message that names the wrong cause; this one FILES AN ISSUE AGAINST A HEALTHY WORKFLOW, in the affected repo, every night. The watchdog closes it again on recovery, so each individual instance self-clears — which makes it worse, not better: a nightly open-and-close cycle on a workflow that was never broken is precisely how an alarm gets ignored, and an ignored watchdog is indistinguishable from no watchdog. It was also actively misleading on first contact: this session spent a diagnostic cycle investigating a workflow that had nothing wrong with it."
  - "2026-09-16 (orchestrator): the honest shape of the fix is the longest gap the cron actually leaves, compared against a tolerance, rather than either pure average or pure worst case. Computing it needs no new machinery — the fire-minute set `cronIntervalHours` already builds is enough to take the maximum spacing between consecutive fires, wrapping the window end to its start so the boundary is not a phantom gap. Whether the threshold then becomes `maxGap + slack` or `maxGap * k` is the implementer's call; state the choice and why in the PR body, and prove BOTH shapes with tests rather than asserting the rule."
  - "2026-09-16 (orchestrator): do not reach for `now` to fix this. Both the comment at :123 and the function signature keep the interval derived from cron text against a fixed epoch anchor, deterministic and independent of when it is computed — that is what makes `cronIntervalHours` testable without freezing clocks. A fix that asks 'is it night-time right now' would work and would destroy that property."
  - "2026-09-16 (orchestrator): CONFIRMED on live data, and it has now filed a real issue against a healthy workflow. The scheduled watchdog run 19 (https://github.com/CandidDan/flow/actions/runs/35072271426, 08:09:40Z) reported `CandidDan/Nudge` `.github/workflows/flow-queue-runner.yml` as `crit`, reason `last success 14.1h ago, cron interval ~3.4h`, and filed **Nudge issue #278**. The workflow is fine. Its cron is `0 9-18 * * 1-5`; the last success was the final slot of the previous weekday and the next legitimate firing was 09:00, fifty minutes after the watchdog looked. The predicted arithmetic held exactly — 3.36h average against a real 15h overnight gap, crit at 6.72h. This is no longer a projection: the false positive is in a repo, with a number, and it will self-close after 09:00 and recur tonight."
  - "2026-09-16 (orchestrator): the false positive is now proven twice over, and it exposed a second-order cost worth designing against. Nudge's `flow-queue-runner` ran at 09:04:50Z with conclusion SUCCESS — run 637 — so the workflow the watchdog declared `crit` at 08:09 was never dead. Issue #278 was still OPEN at 09:49, forty-five minutes after that success. Its own body says the issue 'will be **closed automatically** when the workflow succeeds again', which reads as prompt; the mechanism is the watchdog's daily sweep, so the close does not land until 08:00 the next day. A nightly false positive is therefore open for most of a working day, under a message promising otherwise. Fixing the interval rule removes the cause; the promise-versus-mechanism gap in the issue text is worth a look at the same time, since a stale open issue that says it self-closes is exactly how an operator learns to ignore the label."
---

## Context

The watchdog's first real run produced one wrong verdict, and it is the expensive kind — an alarm
on something healthy.

`CandidDan/Nudge`'s queue runner fires `0 9-18 * * 1-5`: hourly, but only inside a nine-hour
weekday window. `cronIntervalHours` reduces that to a single number by counting firings over 28
days and dividing:

```javascript
return (windowMinutes / fires.size) / 60;   // 672h / 200 fires = 3.36h
```

`scheduledLiveness` then reads `crit` at twice that — 6.72h. But the cron's real overnight gap is
fifteen hours. Every weeknight from roughly 00:45 until 09:00, and from Friday evening to Monday
morning, a working workflow reports dead.

The averaging was not an oversight; `liveness.mjs:118` explains it, and the reasoning holds for the
case it was written against. A sparse `0 7 * * 1-5` averages to 33.6h and tolerates its 63h weekend
gap comfortably. What the average cannot survive is *clustering*: pack the firings into a window
and the count rises while the longest gap does not move, so the threshold collapses underneath a
gap that was always there.

## Acceptance criteria

- [ ] Given `0 9-18 * * 1-5` and a last success at the final firing of a weekday, when liveness is
      evaluated at any point before the next scheduled firing, then the state is `good` — asserted
      at several points across the overnight gap, including one shortly before 09:00, not only at
      one convenient instant.
- [ ] Given that same cron and a last success at the final firing of a **Friday**, when liveness is
      evaluated through the weekend, then the state stays `good` until the Monday firing is
      genuinely missed — the 63h weekend gap and the 15h overnight gap must both be tolerated by
      one rule, not by two special cases.
- [ ] Given `0 7 * * 1-5` — the sparse weekday cron the current averaging was written to protect —
      when liveness is evaluated across a weekend, then it does not regress to `crit`. This is the
      test that stops the fix from being a naive switch to worst-case gap.
- [ ] Given a workflow whose firings are genuinely missed — no success for meaningfully longer than
      the cron's own longest gap — when liveness is evaluated, then it still reports `crit`, with a
      reason naming the observed age and the gap it exceeded. The fix must not buy quiet by
      widening the tolerance until nothing ever alarms.
- [ ] Given `*/5 * * * *` and `0 8 * * *` — an evenly spaced cron and a once-daily one — when
      liveness is evaluated, then their classification is unchanged from today's behaviour, proving
      the fix is confined to the clustered case.
- [ ] Given the gap computation, when it is read, then it derives from the same fixed-window
      fire-minute set already built, wraps the window end to its start so the boundary contributes
      no phantom gap, and takes no argument derived from the current time — the determinism
      property at `liveness.mjs:123` is preserved.
- [ ] Given a cron that parses but never fires, and a workflow with no successful run at all, when
      liveness is evaluated, then both still return `crit` with their existing reasons — these
      branches are untouched and a test pins them so a refactor cannot quietly drop them.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run, then
      all pass and coverage stays at or above 83.5.

## Scope

**Does not change `eventLiveness`**, the `off`/disabled branch, or the `warn` band's existence.
**Does not touch `watchdog.mjs`** — the classification bug there is flow-0055's, and the two must
stay separable so a reviewer can tell which change caused which behaviour. **Does not change issue
filing, commenting or auto-close.** **Does not introduce a per-workflow override, allowlist or
tuning knob** in `.flow/config.yml`: the rule derives from the cron text by design, and a knob
would let a genuinely dead workflow be silenced by configuration. **Does not** use the current time
to classify.
