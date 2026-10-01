// liveness.test.mjs — proving tests for flightdeck/bin/liveness.mjs (flow-0019).
//
// Every acceptance criterion this file is responsible for is proved by name in its test title,
// so `qa-verifier` can map criterion -> test without guessing.

import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWorkflowTrigger,
  cronCadence,
  cronIntervalHours,
  cronMaxGapHours,
  EVENT_FAILURE_STREAK,
  eventLiveness,
  isCompletedRun,
  PR_STREAK_DISTINCT_BRANCHES,
  extractCronExpressions,
  parseCronExpr,
  repoSeverity,
  scheduledLiveness,
  sortBySeverity,
  ungatedMergesLiveness,
} from "./liveness.mjs";

// ── extractCronExpressions / classifyWorkflowTrigger ───────────────────────────────────────

test("extractCronExpressions reads every cron under on.schedule, ignores everything else", () => {
  const yaml = `
on:
  schedule:
    - cron: "0 */3 * * *"
    - cron: "0 6 * * 1-5"
  workflow_dispatch:
`;
  assert.deepEqual(extractCronExpressions(yaml), ["0 */3 * * *", "0 6 * * 1-5"]);
  assert.deepEqual(extractCronExpressions("on:\n  workflow_dispatch:\n"), []);
});

test("classifyWorkflowTrigger: a cron makes it scheduled even if other triggers are also present", () => {
  const yaml = `on:\n  schedule:\n    - cron: "0 6 * * 1-5"\n  workflow_dispatch:\n`;
  assert.deepEqual(classifyWorkflowTrigger(yaml), { kind: "scheduled", crons: ["0 6 * * 1-5"] });
});

test("classifyWorkflowTrigger: pull_request/push/etc with no schedule is event-triggered", () => {
  assert.equal(classifyWorkflowTrigger("on:\n  pull_request:\n    branches: [main]\n").kind, "event");
  assert.equal(classifyWorkflowTrigger("on:\n  push:\n    branches: [main]\n").kind, "event");
});

test("classifyWorkflowTrigger: workflow_dispatch only is manual, not scheduled or event", () => {
  assert.equal(classifyWorkflowTrigger("on:\n  workflow_dispatch:\n").kind, "manual");
  assert.equal(classifyWorkflowTrigger("").kind, "manual");
});

test("classifyWorkflowTrigger: the array shorthand (on: [push, pull_request]) is still event, not manual", () => {
  assert.equal(classifyWorkflowTrigger("on: [push, pull_request]\n").kind, "event");
  assert.equal(classifyWorkflowTrigger("on: [workflow_dispatch]\n").kind, "manual");
});

// ── cron parsing / interval math ────────────────────────────────────────────────────────────

test("parseCronExpr rejects anything that isn't exactly 5 fields", () => {
  assert.equal(parseCronExpr("0 */3 * * *").minute, "0");
  assert.equal(parseCronExpr("* * * *"), null);       // 4 fields
  assert.equal(parseCronExpr("* * * * * *"), null);   // 6 fields
  assert.equal(parseCronExpr(""), null);
});

test("cronIntervalHours: a 6-hour cron reports exactly 6 — the interval comes from the cron, not a constant", () => {
  assert.equal(cronIntervalHours("0 */6 * * *"), 6);
});

test("cronIntervalHours: an unparseable cron is null, not a guessed number", () => {
  assert.equal(cronIntervalHours("not a cron"), null);
  assert.equal(cronIntervalHours("* * 99 13 *"), null); // parses as 5 fields but never fires
});

test("cronIntervalHours: multiple cron lines union their fire-minutes rather than double-counting overlaps", () => {
  // Same schedule listed twice must report the same interval as listed once.
  assert.equal(cronIntervalHours(["0 */6 * * *", "0 */6 * * *"]), 6);
});

// ── scheduledLiveness — the exact boundary the acceptance criteria name ────────────────────

test("scheduledLiveness: 6h cron, last success 13h ago -> crit (age > 2x interval)", () => {
  const now = Date.parse("2026-08-20T13:00:00Z");
  const r = scheduledLiveness({ crons: "0 */6 * * *", lastSuccessAt: "2026-08-20T00:00:00Z", now, disabled: false });
  assert.equal(r.state, "crit");
  assert.equal(r.intervalHours, 6);
});

test("scheduledLiveness: 6h cron, last success 7h ago -> warn (interval < age <= 2x interval)", () => {
  const now = Date.parse("2026-08-20T07:00:00Z");
  const r = scheduledLiveness({ crons: "0 */6 * * *", lastSuccessAt: "2026-08-20T00:00:00Z", now, disabled: false });
  assert.equal(r.state, "warn");
});

test("scheduledLiveness: 6h cron, last success 3h ago -> good (age <= interval)", () => {
  const now = Date.parse("2026-08-20T03:00:00Z");
  const r = scheduledLiveness({ crons: "0 */6 * * *", lastSuccessAt: "2026-08-20T00:00:00Z", now, disabled: false });
  assert.equal(r.state, "good");
});

test("scheduledLiveness: disabled workflow reports off with a reason, never a blank cell", () => {
  const r = scheduledLiveness({ crons: "0 */6 * * *", lastSuccessAt: null, now: Date.now(), disabled: true });
  assert.equal(r.state, "off");
  assert.ok(r.reason && r.reason.length > 0);
});

test("scheduledLiveness: no successful run ever recorded is crit, not a blank", () => {
  const r = scheduledLiveness({ crons: "0 */6 * * *", lastSuccessAt: null, now: Date.now(), disabled: false });
  assert.equal(r.state, "crit");
  assert.match(r.reason, /no successful run/);
});

test("scheduledLiveness: unparseable cron is crit rather than silently 'good'", () => {
  const r = scheduledLiveness({ crons: "garbage", lastSuccessAt: new Date().toISOString(), now: Date.now(), disabled: false });
  assert.equal(r.state, "crit");
});

// ── flow-0057: the longest scheduled gap, not twice the average ────────────────────────────
//
// `0 9-18 * * 1-5` is Nudge's queue runner: hourly, but only inside a nine-hour weekday window.
// Averaging gives ~3.36h and a `crit` bound of ~6.72h, against a real overnight gap of 15h and a
// weekend gap of 63h — so a healthy workflow read `crit` for most of the week. Weekday anchors
// below are real: 2026-09-16 is a Wednesday, 09-18 a Friday, 09-21 the following Monday.

const CLUSTERED = "0 9-18 * * 1-5";   // maxGap 63h (Fri 18:00 -> Mon 09:00), avg 3.36h
const SPARSE = "0 7 * * 1-5";         // maxGap 72h (Fri 07:00 -> Mon 07:00), avg 33.6h

const at = (iso, crons, lastSuccessAt) =>
  scheduledLiveness({ crons, lastSuccessAt, now: Date.parse(iso), disabled: false });

test("flow-0057 criterion 1: clustered cron stays good across the WHOLE overnight gap, not just one convenient instant", () => {
  const lastSuccess = "2026-09-16T18:00:00Z"; // Wednesday's final firing
  // Sampled across the gap, including one 10 minutes before the next legitimate 09:00 firing —
  // the 08:09 sweep that filed Nudge#278 and #289 sat right inside this stretch.
  for (const instant of [
    "2026-09-16T19:00:00Z", "2026-09-16T23:59:00Z", "2026-09-17T00:45:00Z",
    "2026-09-17T03:00:00Z", "2026-09-17T08:09:00Z", "2026-09-17T08:50:00Z",
  ]) {
    const r = at(instant, CLUSTERED, lastSuccess);
    assert.equal(r.state, "good", `expected good at ${instant}, got ${r.state} (${r.reason})`);
  }
});

test("flow-0057 criterion 2: ONE rule tolerates both the 15h overnight gap and the 63h weekend gap for a clustered cron", () => {
  const fridayFinal = "2026-09-18T18:00:00Z"; // Friday's last firing
  for (const instant of [
    "2026-09-18T23:00:00Z", "2026-09-19T12:00:00Z", "2026-09-20T12:00:00Z",
    "2026-09-21T08:00:00Z", "2026-09-21T08:59:00Z",
  ]) {
    const r = at(instant, CLUSTERED, fridayFinal);
    assert.equal(r.state, "good", `expected good at ${instant}, got ${r.state} (${r.reason})`);
  }
  // Monday's 09:00 firing genuinely missed: the gap is exceeded and the state leaves `good`.
  assert.notEqual(at("2026-09-21T10:00:00Z", CLUSTERED, fridayFinal).state, "good");
});

test("flow-0057 criterion 3: the sparse weekday cron does not regress to crit across a weekend", () => {
  const fridayFire = "2026-09-18T07:00:00Z";
  for (const instant of ["2026-09-19T12:00:00Z", "2026-09-20T12:00:00Z", "2026-09-21T06:59:00Z"]) {
    assert.equal(at(instant, SPARSE, fridayFire).state, "good", `regressed at ${instant}`);
  }
  // Recorded because the task notes had this wrong: the sparse cron's weekend gap is 72h, not
  // 63h, so twice its 33.6h average (67.2h) did NOT clear it. The old rule called this healthy
  // workflow crit every Sunday too; the longest-gap rule is what actually fixes the sparse case.
  assert.equal(cronMaxGapHours(SPARSE), 72);
  assert.ok(72 > cronIntervalHours(SPARSE) * 2, "the old bound was already below the real gap");
});

test("flow-0057 criterion 4: a genuinely dead clustered workflow still goes crit, naming the age and the gap it exceeded", () => {
  // Nine days of silence on a cron whose longest legitimate gap is 63h.
  const r = at("2026-09-25T12:00:00Z", CLUSTERED, "2026-09-16T18:00:00Z");
  assert.equal(r.state, "crit");
  assert.match(r.reason, /210\.0h ago/);        // the observed age, stated
  assert.match(r.reason, /longest scheduled gap ~63\.0h/);    // and what it was judged against
  // The `cron interval ~Xh` prefix is load-bearing for watchdog.test.mjs, which is outside this
  // task's `touches` — pinned here so a future reword of the reason cannot silently break it.
  assert.match(r.reason, /^last success 210\.0h ago, cron interval ~3\.4h,/);
});

test("flow-0057 criterion 5: evenly spaced crons classify IDENTICALLY to the old 2x-average rule", () => {
  // For an evenly spaced cron the longest gap IS the average, so maxGap + interval === interval * 2
  // to the digit. This is what confines the change to the clustered case.
  for (const cron of ["*/5 * * * *", "0 8 * * *", "0 */6 * * *", "0 */4 * * *"]) {
    assert.equal(cronMaxGapHours(cron), cronIntervalHours(cron), `${cron}: gap should equal average`);
  }
  // `*/5 * * * *` — crit was, and remains, past 10 minutes.
  assert.equal(at("2026-09-16T12:09:00Z", "*/5 * * * *", "2026-09-16T12:00:00Z").state, "warn");
  assert.equal(at("2026-09-16T12:11:00Z", "*/5 * * * *", "2026-09-16T12:00:00Z").state, "crit");
  // `0 8 * * *` — crit was, and remains, past 48h.
  assert.equal(at("2026-09-18T07:00:00Z", "0 8 * * *", "2026-09-16T08:00:00Z").state, "warn");
  assert.equal(at("2026-09-18T09:00:00Z", "0 8 * * *", "2026-09-16T08:00:00Z").state, "crit");
});

test("flow-0057 criterion 6: the gap is deterministic — fixed window, wrapped boundary, no dependence on now", () => {
  // Takes no clock: repeated calls agree, and it accepts no `now` argument at all.
  assert.equal(cronMaxGapHours(CLUSTERED), cronMaxGapHours(CLUSTERED));
  assert.equal(cronMaxGapHours(CLUSTERED), 63);
  // The wrap contributes a real gap, never a phantom one. A once-daily cron's longest gap is 24h
  // — if the window boundary were treated as a missing firing it would read 28 days instead.
  assert.equal(cronMaxGapHours("0 8 * * *"), 24);
  // And the wrap is what lets a weekly cron be measured at all: its only gap spans the boundary.
  assert.equal(cronMaxGapHours("0 8 * * 1"), 168);
  // Listing the same schedule twice unions the fire-minutes rather than fabricating zero gaps.
  assert.equal(cronMaxGapHours([CLUSTERED, CLUSTERED]), 63);
});

test("flow-0057: cronCadence yields both numbers from one window scan, and the two views agree with it", () => {
  // The scan is the expensive part (40,320 minutes, each building a Date). Deriving the interval
  // and the gap from separate scans would double the cost of every workflow the flightdeck page
  // classifies. This pins that the pair comes from one call and that neither view can drift.
  for (const cron of [CLUSTERED, SPARSE, "0 */6 * * *", "0 8 * * 1"]) {
    const cadence = cronCadence(cron);
    assert.equal(cadence.intervalHours, cronIntervalHours(cron), `${cron}: interval view disagrees`);
    assert.equal(cadence.maxGapHours, cronMaxGapHours(cron), `${cron}: gap view disagrees`);
  }
  assert.equal(cronCadence("not a cron"), null);
  assert.equal(cronCadence("* * 99 13 *"), null); // parses as 5 fields but never fires
});

test("flow-0057 criterion 7: a never-firing cron and a no-success workflow are still crit after the refactor", () => {
  assert.equal(cronMaxGapHours("not a cron"), null);
  assert.equal(cronMaxGapHours("* * 99 13 *"), null); // parses as 5 fields but never fires
  const never = scheduledLiveness({ crons: "* * 99 13 *", lastSuccessAt: "2026-09-16T18:00:00Z", now: Date.now(), disabled: false });
  assert.equal(never.state, "crit");
  assert.match(never.reason, /never scheduled/);
  const noSuccess = scheduledLiveness({ crons: CLUSTERED, lastSuccessAt: null, now: Date.now(), disabled: false });
  assert.equal(noSuccess.state, "crit");
  assert.match(noSuccess.reason, /no successful run/);
  // An unparseable timestamp is reported as such, not silently treated as epoch.
  const bad = scheduledLiveness({ crons: CLUSTERED, lastSuccessAt: "not a date", now: Date.now(), disabled: false });
  assert.equal(bad.state, "crit");
  assert.match(bad.reason, /unparseable/);
});

test("flow-0057: the Nudge#289 sweep instant reads good, where the old rule read crit", () => {
  // The exact shape that filed the issue: last success 2026-09-16T18:05:13Z, sweep at 08:09.
  const r = at("2026-09-17T08:09:00Z", CLUSTERED, "2026-09-16T18:05:13Z");
  assert.equal(r.state, "good");
  assert.ok(r.ageHours > 13 && r.ageHours < 15, `age should be ~14.1h, got ${r.ageHours}`);
  assert.ok(r.ageHours > cronIntervalHours(CLUSTERED) * 2, "and the old rule would have called this crit");
});

// ── eventLiveness ────────────────────────────────────────────────────────────────────────────

test("eventLiveness: latest run failed -> crit", () => {
  assert.equal(eventLiveness({ disabled: false, latestRun: { conclusion: "failure" } }).state, "crit");
});

test("eventLiveness: latest run succeeded -> good", () => {
  assert.equal(eventLiveness({ disabled: false, latestRun: { conclusion: "success" } }).state, "good");
});

test("eventLiveness: disabled -> off with a reason", () => {
  const r = eventLiveness({ disabled: true, latestRun: { conclusion: "failure" } });
  assert.equal(r.state, "off");
  assert.ok(r.reason);
});

test("eventLiveness: never run is good (nothing has failed), not a blank", () => {
  const r = eventLiveness({ disabled: false, latestRun: null });
  assert.equal(r.state, "good");
  assert.ok(r.reason);
});

// ── flow-0106: a failing pull-request check is a verdict, not "automation down" ──────────────
//
// Every test below hands `eventLiveness` a run history and asks one question: does a failing
// EVENT workflow spread across pull requests (machinery) or sit on one (a verdict)? The fixture
// shape is the summary `collectRepoEntries` builds — `{ conclusion, event, head_branch, head_sha,
// created_at }`, newest first — so these tests and the IO layer cannot disagree about the input.

// Newest first, one minute apart, so a reader can see the order the rule walks.
const runPage = (specs) => specs.map((s, i) => ({
  conclusion: s.conclusion ?? "failure",
  event: s.event ?? "pull_request",
  head_branch: s.branch ?? "flow/one",
  head_sha: s.sha ?? `sha${i}`,
  created_at: new Date(Date.parse("2026-09-29T12:00:00Z") - i * 60000).toISOString(),
  ...(s.status ? { status: s.status } : {}),
}));

test("flow-0106 criterion 1: no recentRuns and a failed latest run -> crit, unchanged for existing callers", () => {
  // mission-control.mjs asks only for the latest run and must keep the answer it always had.
  const r = eventLiveness({ disabled: false, latestRun: { conclusion: "failure" } });
  assert.equal(r.state, "crit");
  assert.equal(r.reason, "latest run failed");
  assert.equal(eventLiveness({ disabled: false, latestRun: { conclusion: "failure" }, recentRuns: null }).state, "crit",
    "an explicit null is absence too, not an empty history");
});

test("flow-0106 criterion 2: newest run is a failed pull_request run and the one before it succeeded -> good", () => {
  const r = eventLiveness({
    disabled: false,
    latestRun: { conclusion: "failure" },
    recentRuns: runPage([{ branch: "flow/a" }, { conclusion: "success", branch: "main", event: "push" }]),
  });
  assert.equal(r.state, "good", "one rejected PR is not automation down");
  assert.equal(r.streak, 1);
});

test("flow-0106 criterion 3: five consecutive failed pull_request runs on ONE head_branch -> good (one PR rejected repeatedly is a verdict)", () => {
  const r = eventLiveness({
    disabled: false,
    latestRun: { conclusion: "failure" },
    recentRuns: runPage(Array.from({ length: 5 }, () => ({ branch: "flow/flow-0106-x" }))),
  });
  assert.equal(r.state, "good");
  assert.equal(r.streak, 5, "the streak is seen in full — it is the SPREAD that is one");
  assert.equal(r.pullRequests, 1);
  assert.match(r.reason, /verdict, not a breakage/);
});

test("flow-0106 criterion 4: three consecutive failed pull_request runs on three head_branches -> crit naming 3 runs across 3 pull requests", () => {
  const r = eventLiveness({
    disabled: false,
    latestRun: { conclusion: "failure" },
    recentRuns: runPage([{ branch: "flow/a" }, { branch: "flow/b" }, { branch: "flow/c" }]),
  });
  assert.equal(r.state, "crit");
  assert.equal(r.reason, "last 3 runs failed across 3 pull requests");
  assert.equal(r.streak, 3);
  assert.equal(r.pullRequests, 3);

  // Two PRs is not three, however long the streak: a rebase loop on two branches still is not a
  // repo-wide breakage, and the threshold is the named constant, not a literal repeated here.
  const two = eventLiveness({
    disabled: false,
    latestRun: { conclusion: "failure" },
    recentRuns: runPage([{ branch: "flow/a" }, { branch: "flow/b" }, { branch: "flow/a" }, { branch: "flow/b" }]),
  });
  assert.equal(two.state, "good");
  assert.equal(PR_STREAK_DISTINCT_BRANCHES, 3);
});

test("flow-0106 criterion 5: three consecutive failed push runs -> crit; two -> good", () => {
  const three = eventLiveness({
    disabled: false,
    latestRun: { conclusion: "failure" },
    recentRuns: runPage([{ event: "push", branch: "main" }, { event: "push", branch: "main" }, { event: "push", branch: "main" }]),
  });
  assert.equal(three.state, "crit", "a push run verdicts on nobody's PR — length alone decides");
  assert.equal(three.reason, "last 3 runs failed (push)");

  const two = eventLiveness({
    disabled: false,
    latestRun: { conclusion: "failure" },
    recentRuns: runPage([{ event: "push", branch: "main" }, { event: "push", branch: "main" }]),
  });
  assert.equal(two.state, "good");
  assert.equal(two.streak, 2);
  assert.equal(EVENT_FAILURE_STREAK, 3);

  // A streak that is not ALL pull-request runs is judged by length too, even when most of it is:
  // one workflow_run failure next to two PR failures is machinery failing on its own trigger.
  const mixed = eventLiveness({
    disabled: false,
    latestRun: { conclusion: "failure" },
    recentRuns: runPage([{ branch: "flow/a" }, { branch: "flow/a" }, { event: "workflow_run", branch: "main" }]),
  });
  assert.equal(mixed.state, "crit");
  assert.match(mixed.reason, /^last 3 runs failed \(pull_request, workflow_run\)$/);
});

test("flow-0106 criterion 6: in-progress runs in recentRuns are ignored when finding the streak", () => {
  // A queued run between two failures must not split the streak, and must not count toward it.
  const r = eventLiveness({
    disabled: false,
    latestRun: { conclusion: "failure" },
    recentRuns: runPage([
      { event: "push", branch: "main", conclusion: null, status: "in_progress" },
      { event: "push", branch: "main" },
      { event: "push", branch: "main", conclusion: null, status: "queued" },
      { event: "push", branch: "main" },
      { event: "push", branch: "main" },
    ]),
  });
  assert.equal(r.state, "crit");
  assert.equal(r.streak, 3, "three completed failures, the two unfinished runs neither counted nor breaking it");

  // And the predicate on its own, including the fallback that keeps a payload without `status`
  // readable — requiring `status` would empty every streak and silence the watchdog.
  assert.equal(isCompletedRun({ status: "completed", conclusion: "failure" }), true);
  assert.equal(isCompletedRun({ status: "in_progress", conclusion: null }), false);
  assert.equal(isCompletedRun({ conclusion: null }), false);
  assert.equal(isCompletedRun({ conclusion: "failure" }), true, "no status, but it concluded");
  assert.equal(isCompletedRun(null), false);
});

test("flow-0106: a pull-request streak with no head_branch at all collapses to one PR, never three", () => {
  // Missing data must not manufacture the spread that triggers the alarm.
  const r = eventLiveness({
    disabled: false,
    latestRun: { conclusion: "failure" },
    recentRuns: [
      { conclusion: "failure", event: "pull_request", head_branch: null, head_sha: "a" },
      { conclusion: "failure", event: "pull_request", head_branch: null, head_sha: "b" },
      { conclusion: "failure", event: "pull_request", head_branch: null, head_sha: "c" },
    ],
  });
  assert.equal(r.state, "good");
  assert.equal(r.pullRequests, 1);
});

test("flow-0106: disabled and never-run still answer first, whatever recentRuns holds", () => {
  const streak = runPage([{ branch: "flow/a" }, { branch: "flow/b" }, { branch: "flow/c" }]);
  assert.equal(eventLiveness({ disabled: true, latestRun: { conclusion: "failure" }, recentRuns: streak }).state, "off");
  assert.equal(eventLiveness({ disabled: false, latestRun: null, recentRuns: streak }).state, "good");
  assert.equal(eventLiveness({ disabled: false, latestRun: { conclusion: "success" }, recentRuns: [] }).state, "good");
});

// ── ungatedMergesLiveness — the named silent killer ────────────────────────────────────────

test("ungatedMergesLiveness: every merged SHA has a gate run -> good", () => {
  const r = ungatedMergesLiveness({ mergedShas: ["a", "b"], gateRunShas: ["a", "b", "c"] });
  assert.equal(r.state, "good");
  assert.equal(r.count, 0);
});

test("ungatedMergesLiveness: a merge with no gate run -> crit, naming the count", () => {
  const r = ungatedMergesLiveness({ mergedShas: ["a", "b", "c"], gateRunShas: ["a"] });
  assert.equal(r.state, "crit");
  assert.equal(r.count, 2);
  assert.match(r.reason, /2 merged with no gate run/);
});

test("ungatedMergesLiveness: no merges in the window -> good, not crit on an empty set", () => {
  assert.equal(ungatedMergesLiveness({ mergedShas: [], gateRunShas: [] }).state, "good");
});

// ── repoSeverity / sortBySeverity — "the sort order IS the triage order" ──────────────────

test("repoSeverity: any crit machinery -> critical, regardless of needsAttention", () => {
  assert.equal(repoSeverity({ machineryStates: ["good", "crit"], needsAttention: false }), "critical");
});

test("repoSeverity: no crit, but something needs a human -> attention", () => {
  assert.equal(repoSeverity({ machineryStates: ["good", "warn", "off"], needsAttention: true }), "attention");
});

test("repoSeverity: no crit and nothing needs a human -> quiet", () => {
  assert.equal(repoSeverity({ machineryStates: ["good", "off"], needsAttention: false }), "quiet");
});

test("sortBySeverity: critical sorts above attention, which sorts above quiet", () => {
  const rows = [{ id: "c", severity: "quiet" }, { id: "a", severity: "critical" }, { id: "b", severity: "attention" }];
  const sorted = sortBySeverity(rows).map((r) => r.id);
  assert.deepEqual(sorted, ["a", "b", "c"]);
});

test("sortBySeverity: is stable — equal-severity rows keep their relative order", () => {
  const rows = [
    { id: "first", severity: "attention" },
    { id: "second", severity: "attention" },
    { id: "third", severity: "critical" },
  ];
  const sorted = sortBySeverity(rows).map((r) => r.id);
  assert.deepEqual(sorted, ["third", "first", "second"]);
});
