---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0065"
title: "The watchdog's \"last successful run\" is simply wrong — a one-item filtered page is trusted as the newest, and it is not"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-17"
started: ""
branch: ""
pr: ""
issue: "https://github.com/CandidDan/Nudge/issues/289"
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - "flightdeck/bin/watchdog.mjs"
  - "flightdeck/bin/watchdog.test.mjs"
  - "CHANGELOG.md"
labels: [flightdeck, watchdog, reporting]
notes:
  - "2026-09-19 (orchestrator): CORRECTING MY OWN 2026-09-18 NOTE \u2014 #289 DID close, and the \u0027declines to close\u0027 framing above overstated it. It was open at 07:49Z on 2026-09-19 and gone by 19:50Z; Nudge#291 was filed at 08:08:19Z, so the ~08:08 Saturday sweep is what closed it. That is roughly 48h after filing, with successes available from about 24h in. So the auto-close is DELAYED AND INTERMITTENT, not absent. The shared-lookup hypothesis survives in weakened form \u2014 it would explain a sweep that reads stale and skips the close, and a later sweep that reads correctly and performs it \u2014 but it is no longer supported by a permanently stuck issue, because there is not one. Treat the hypothesis as unproven; the fix criteria are unchanged, since a lookup that is right only sometimes is the thing being fixed either way."
  - "2026-09-19 (orchestrator): AN OBSERVATION I CANNOT EXPLAIN, recorded because it cuts against flow-0057 rather than for it. The Saturday sweep closed #289 and did NOT file a replacement for `flow-queue-runner`. The newest successful run at that moment was run 666, 2026-09-18T18:05:09Z \u2014 14.1h before the 08:08 sweep, against the ~6.7h crit bound flow-0057 derives from `0 9-18 * * 1-5`. By that model a fresh false positive was due and none appeared. Possible readings, none verified: the interval calculation behaves differently across a weekend boundary; the close and the file interact within a single sweep; or the staleness read differed from the one that drove the close. Whoever works flow-0057 or this task should resolve it with the code rather than assume \u2014 and should NOT cite the 2026-09-19 sweep as recurrence evidence, because it is evidence of the opposite."
  - "2026-09-19 (orchestrator): NOT THIS TASK, and not Flow \u2014 Nudge#291 (`Automation down: Deploy Supabase edge functions`, filed 2026-09-19T08:08:19Z) names `.github/workflows/deploy-edge-functions.yml`, trigger type event, rule `latest run failed`, last success 2026-09-19T03:35:17Z. That is a real failure in Nudge\u0027s own deploy workflow and the watchdog reported it correctly. Recorded only so it is not mistaken for a re-filed flow-queue-runner issue: the number is new but the subject is different."
  - "2026-09-18 (orchestrator): THE STUCK ISSUE AND THE WRONG FIGURE ARE ONE DEFECT, NOT TWO \u2014 strongest evidence yet, and it changes the fix. Nudge#289 promises in its own body that it \u0027will be closed automatically when the workflow succeeds again\u0027. `flow-queue-runner` has succeeded REPEATEDLY since: runs 654 (2026-09-17T16:05:10Z), 655 (17:03:32Z) and 656 (18:05:23Z) all `conclusion: success`, and the run counter advanced 646 -> 656 between the two sweeps. #289 is still OPEN 24h later. UNIFYING HYPOTHESIS: the close path and the staleness path share the `status=success&per_page=1` lookup at :290. Handed the stale 2026-09-07 run, the sweep concludes no success has occurred since the issue was filed \u2014 so it prints 230.1h AND declines to close, from one wrong datum. That also explains why Nudge#278 DID auto-close on 2026-09-17T06:28: that sweep\u0027s lookup happened to return the correct newest run. One cause, two visible symptoms, and fixing the lookup should fix both \u2014 which is worth verifying rather than assuming, hence the criterion about the two paths agreeing."
  - "2026-09-18 (orchestrator): AND THE MASKING EFFECT, which matters for flow-0057. No new `automation-down` issue was filed for `flow-queue-runner` by the 2026-09-18 sweep, because #289 is still open and the watchdog correctly dedupes against an open issue. So the THIRD consecutive nightly false positive flow-0057 predicts cannot appear as a new issue while this defect holds it open. Anyone looking for flow-0057 recurrence in the issue list after 2026-09-17 will find nothing and may wrongly conclude it stopped. The dedup itself is correct behaviour; it is the stuck issue that hides the signal."
  - "2026-09-18 (orchestrator): NOT A DEFECT, checked and cleared \u2014 Nudge#288 (`flow-gates`) and #290 (`flow-review`) are still open and that is CORRECT. `flow-gates`\u0027 latest run is still the failed sync-PR run 217 at 2026-09-17T06:30:17Z; the workflow is event-triggered and has not run since, so there has been no success to close on. They will close when a PR next exercises them. Recorded so a reader seeing four stuck issues does not count all four as this bug."
  - "2026-09-17 (orchestrator): OBSERVED, WITH BOTH NUMBERS. The 08:09 sweep filed CandidDan/Nudge#289 against `flow-queue-runner` stating `**Last successful run:** 2026-09-07T18:04:59.000Z` and `last success 230.1h ago, cron interval ~3.4h`. The actual newest successful run at that moment was run 646, id 35132188127, `created_at: 2026-09-16T18:05:13Z`, `event: schedule`, `conclusion: success` — 14.1h before the sweep, not 230.1h. The reported figure is wrong by NINE DAYS. Verified against the runs API directly, not inferred from the issue text."
  - "2026-09-17 (orchestrator): THE CAUSE IS AT `flightdeck/bin/watchdog.mjs:290`. `const ok = await io.rest(`/repos/${fullName}/actions/workflows/${registered.id}/runs?status=success&per_page=1`)`. It asks GitHub for ONE run and trusts that it is the newest. The list-runs endpoint documents a `created_at` descending default, but with a `status` filter applied over a large run history (this workflow has 646) the single item returned was not the newest success. Whatever the API's reason, the defect is the code's: `per_page=1` leaves NOTHING TO COMPARE AGAINST, so a wrong answer is structurally undetectable — there is no second element whose timestamp would contradict the first. The same shape is at :297 for the latest-run check and should be reviewed with it."
  - "2026-09-17 (orchestrator): WHY THIS IS WORSE THAN flow-0057 AND NOT THE SAME BUG. flow-0057 is a THRESHOLD defect: `cronIntervalHours` averages fire-minutes over 28 days, so a clustered cron like `0 9-18 * * 1-5` gets a crit bound of ~6.7h against a real overnight gap of ~15h, and the alarm is a false positive. This is a DATA defect: the number the alarm prints is not the number it measured against reality. A human reading #289 is told the queue runner has been dead for 9.6 days and will go looking for a week-long outage that never happened; reading the correct 14.1h they would recognise the overnight gap immediately. Fixing flow-0057 alone would not fix this — a correct threshold applied to a wrong datum still lies. Fixing this alone would not fix flow-0057 — 14.1h still trips a 6.7h bound. They are independent and both are live."
  - "2026-09-17 (orchestrator): THE PRIOR SWEEP GOT IT RIGHT, WHICH IS THE PART THAT MAKES IT DANGEROUS. Nudge#278, filed 2026-09-16T08:09 against the same workflow, reported `2026-09-15T18:04:47` — correct for that moment, and internally consistent at 14.1h. So the bug is intermittent, not a constant offset, and a reader who has seen one correct issue has no reason to distrust the next. An always-wrong number gets noticed; an occasionally-wrong one gets believed."
  - "2026-09-17 (orchestrator): A SECOND CONTRADICTION FROM THE SAME SWEEP, worth reproducing because it may share the cause or may be separate. The watchdog CLOSED Nudge#278 at 2026-09-17T06:28:07Z (`closed_by: github-actions[bot]`, `state_reason: completed`) — an act that asserts the workflow had succeeded. It then filed #289 at 08:09, 101 minutes later, asserting the same workflow had not succeeded in 230 hours. The close is right and the file is wrong, on the same underlying run history. If the close path and the staleness path read runs differently, that divergence is the thing to find; if they share :290, then the close proves the API can answer correctly moments before answering incorrectly. Either way, a test should pin that the two agree."
  - "2026-09-17 (orchestrator): WHAT flow-0057's RECURRENCE CLAIM IS AND IS NOT CONFIRMED BY. The recurrence IS confirmed: the real gap on the night of the 16th-17th was 2026-09-16T18:05:13 to the 08:09 sweep — 14.1h, against a 6.7h crit bound, the second consecutive night, exactly as flow-0057 predicted. But it is NOT confirmed by #289's printed figure, which says 230.1h. Anyone citing #289 as evidence for flow-0057 should cite the run timestamps instead. This distinction is recorded here rather than left implicit because the two tasks will be read together."
  - "2026-09-17 (orchestrator): NOT IN SCOPE, though found in the same sweep. Nudge#287 (`Claude Code`), #288 (`flow-gates`) and #290 (`flow-review`) are NOT false positives and not this task's concern. Their rule is `latest run failed`, and it is true — `flow-gates` and `flow-review` genuinely failed on Nudge#286, the flow-sync PR. The watchdog behaved correctly on all three. They are named here only so a worker does not sweep them in as evidence: four issues filed at once looks like a malfunction and was not."
---

## Context

The watchdog exists so that a scheduled workflow which stops running produces an issue, because
GitHub notifies on failure and never on absence. Every such issue leads with one fact:

```
**Last successful run:** 2026-09-07T18:04:59.000Z
**Rule that fired:** last success 230.1h ago, cron interval ~3.4h
```

For [Nudge#289](https://github.com/CandidDan/Nudge/issues/289), filed by the 08:09 sweep on
2026-09-17, that fact is **wrong by nine days**. The newest successful run at that moment was
`2026-09-16T18:05:13Z` (run 646, `event: schedule`, `conclusion: success`) — 14.1 hours earlier,
not 230.1.

The issue would have been filed either way, because 14.1h still exceeds the crit bound. That is
what makes this worth fixing separately from the threshold: the alarm fires for a defensible
reason and then **states an indefensible one**, sending the reader to look for a week-long outage
that never happened.

`flightdeck/bin/watchdog.mjs:290` asks GitHub for exactly one run and trusts it:

```js
const ok = await io.rest(`/repos/${fullName}/actions/workflows/${registered.id}/runs?status=success&per_page=1`);
```

With a single item there is nothing to compare against, so a wrong answer cannot be detected by
the code that receives it. See the notes for why the previous sweep got the same workflow right,
why this is independent of flow-0057, and for a second contradiction in the same sweep — the
watchdog closed #278 for this workflow succeeding, then 101 minutes later filed #289 saying it had
not succeeded in 230 hours.

## Scope

**Does:**

- Replaces the one-item trust at `watchdog.mjs:290` with a read that can be checked: fetch a page
  of runs and select the newest success by `created_at`, rather than accepting position 1 of a
  filtered query as authoritative.
- Reviews `:297`'s latest-run lookup, which has the same `per_page=1` shape, and applies the same
  treatment if it shares the exposure.
- Adds tests over a fixture whose run list is returned **out of `created_at` order**, asserting the
  newest success is selected regardless of position — the property that failed here.
- Adds a test asserting the close path and the staleness path agree about whether a workflow has
  succeeded, so the #278-closed/#289-filed contradiction cannot recur silently.
- Records the change in `CHANGELOG.md` under `## Unreleased`.

**Does not touch:**

- `cronIntervalHours` or `scheduledLiveness` in `flightdeck/bin/liveness.mjs` — that is flow-0057's
  threshold defect, independent of this one, and both are live.
- The unadopted-repo 404 message (flow-0055) or startup-failure blindness (flow-0061).
- The issue body's wording or the auto-close mechanism itself, which demonstrably works: #278 was
  closed automatically, ~22 hours after it was filed.

## Acceptance criteria

- [ ] Given a workflow whose run list contains a successful run newer than the first item returned
      by a `status=success` query, when the watchdog computes `lastSuccessAt`, then it reports the
      newest success by `created_at`, not the first item returned.
- [ ] Given a fixture run list deliberately returned out of `created_at` order, when
      `lastSuccessAt` is computed, then it equals the maximum `created_at` among successful runs.
- [ ] Given the Nudge#289 case reproduced as a fixture (newest success `2026-09-16T18:05:13Z`,
      an older success at `2026-09-07T18:04:59Z` returned first), when the watchdog runs, then the
      reported age is ~14.1h and not ~230.1h.
- [ ] Given a workflow the watchdog would close an open issue for, when the same sweep evaluates
      that workflow for staleness, then the two paths agree on whether it has succeeded — a sweep
      cannot both close an issue for a success and file one asserting no success.
- [ ] Given a workflow with no successful run at all, when `lastSuccessAt` is computed, then the
      absence is reported as absence and not as a zero or an epoch date.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Paging cost is a real constraint: the watchdog sweeps every registered repo, and fetching a full
  run history per workflow would be expensive. A bounded page (the API's default 30, or 100) that
  selects the maximum is almost certainly enough, since a workflow with no success in its most
  recent 100 runs is dead by any definition. State the bound and why it is safe, rather than
  paging without limit.
- `flow-0053` moves the watchdog off canonical. This task touches the same file; sequence them
  deliberately rather than running both at once.
- If the investigation shows GitHub returns correctly-ordered results and the fault is elsewhere,
  that is a finding, not a failure — record it and fix what is actually wrong. The observed facts
  in the notes are the fixed points; the mechanism in them is the best reading available, not a
  verified one.
