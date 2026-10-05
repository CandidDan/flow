// liveness.mjs — the liveness rules for one repo's automation, as pure tested functions.
//
// THE PROBLEM IT SOLVES. Everything else in Flow is event-driven: a failed gate posts a check, a
// merged PR fires a workflow. A scheduled workflow that stops running produces nothing to react
// to — GitHub notifies on failure, never on absence. So "is the machinery alive?" has to be
// *computed*: read what ran and when, compare it to what should have, and say so explicitly. That
// computation is this file. It takes no network, no filesystem, no clock of its own — every
// input (workflow YAML text, run history, "now") is passed in, so every branch is a table test
// and the same rules run identically in the browser page and in `npm test`.
//
// Two workflow shapes need two different tests. An EVENT-triggered workflow (fires on
// pull_request/push/etc.) has no expected cadence — it only has a pass/fail on its latest run,
// so its liveness question is "did the last run fail, or is it turned off?" A SCHEDULED workflow
// (fires on `on.schedule`) has an expected cadence derived from its own cron, so its liveness
// question is "is the last *successful* run recent enough for that cadence?" `classifyWorkflowTrigger`
// below answers "which shape is this?" by reading the workflow file itself — never a hardcoded
// list of workflow names, because a repo's workflow set is not canonical's to assume.
//
// Zero dependencies, browser- and Node-safe: no `node:*` imports anywhere in this file, because
// it is loaded as an ES module both by `npm test` (Node) and by `flightdeck/index.html` (a
// browser, via a plain `<script type="module">` import — no bundler, no build step).

// ── cron parsing (pure text -> structured, no Date.now() anywhere) ─────────────────────────

// Every `cron: "…"` value under an `on: schedule:` block, in file order. A tolerant regex scan
// (not a YAML parser) is deliberate here, matching the rest of `.flow/bin/`'s reading style —
// workflow YAML is small and fixed-shape, and a real YAML dependency is a cost canonical's own
// `security.focus` calls out as imposed on every downstream repo.
export function extractCronExpressions(workflowYamlText) {
  const text = String(workflowYamlText ?? "");
  const out = [];
  for (const m of text.matchAll(/-\s*cron:\s*["']([^"']+)["']/g)) out.push(m[1].trim());
  return out;
}

// Which shape a workflow file is: `scheduled` (has a cron), `event` (fires on something else —
// pull_request, push, issues, workflow_run, release), or `manual` (workflow_dispatch only, or a
// trigger this scan does not recognise). Manual workflows carry no liveness expectation and are
// left out of the matrix by the caller.
const EVENT_TRIGGER_KEYS = ["pull_request", "pull_request_target", "push", "issues", "issue_comment", "release", "workflow_run"];

export function classifyWorkflowTrigger(workflowYamlText) {
  const text = String(workflowYamlText ?? "");
  const crons = extractCronExpressions(text);
  if (crons.length > 0) return { kind: "scheduled", crons };

  // `on: [push, pull_request]` — the flow-shorthand array form. GitHub does not allow `schedule`
  // (it needs a nested cron object) in this form, so it only ever matters for event detection.
  const inlineOn = text.match(/^on:\s*\[([^\]]*)\]/m);
  if (inlineOn && EVENT_TRIGGER_KEYS.some((k) => new RegExp(`(^|,)\\s*${k}\\s*(,|$)`).test(inlineOn[1]))) {
    return { kind: "event", crons: [] };
  }

  const onBlock = text.match(/^on:\s*$/m);
  const scanFrom = onBlock ? text.slice(onBlock.index) : text;
  if (EVENT_TRIGGER_KEYS.some((k) => new RegExp(`^\\s*${k}:`, "m").test(scanFrom))) {
    return { kind: "event", crons: [] };
  }
  return { kind: "manual", crons: [] };
}

// Standard 5-field cron matcher: minute hour day-of-month month day-of-week. Supports `*`,
// `*/N`, `a-b`, `a-b/N` and comma lists — the vocabulary Flow's own workflows use (see
// `.github/workflows/flow-recover.yml`, `flow-triage.yml`). Anything else fails closed (matches
// nothing), which surfaces as "never fires" rather than a silent wrong answer.
function fieldMatches(fieldStr, value, min, max) {
  return String(fieldStr).split(",").some((part) => {
    let range = part, step = 1;
    if (part.includes("/")) {
      const [r, s] = part.split("/");
      range = r;
      step = Number(s);
      if (!Number.isFinite(step) || step <= 0) return false;
    }
    let lo, hi;
    if (range === "*") { lo = min; hi = max; }
    else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      lo = a; hi = b;
    } else {
      const v = Number(range);
      if (!Number.isFinite(v)) return false;
      lo = hi = v;
    }
    if (value < lo || value > hi) return false;
    return (value - lo) % step === 0;
  });
}

// Parse one 5-field cron string into its fields, or null if it isn't 5 fields.
export function parseCronExpr(cron) {
  const fields = String(cron ?? "").trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dom, month, dow] = fields;
  return { minute, hour, dom, month, dow };
}

// Does this cron fire in the minute at `epochMinutes` (minutes since the Unix epoch, UTC)? Cron's
// day-of-month/day-of-week rule: when BOTH are restricted (neither is `*`), a day matches if
// EITHER matches (OR), not AND — the standard (if surprising) cron semantics.
function cronMatchesMinute(fields, epochMinutes) {
  const d = new Date(epochMinutes * 60000);
  const minute = d.getUTCMinutes(), hour = d.getUTCHours();
  const dom = d.getUTCDate(), month = d.getUTCMonth() + 1, dow = d.getUTCDay();
  if (!fieldMatches(fields.minute, minute, 0, 59)) return false;
  if (!fieldMatches(fields.hour, hour, 0, 23)) return false;
  if (!fieldMatches(fields.month, month, 1, 12)) return false;
  const domRestricted = fields.dom !== "*";
  const dowRestricted = fields.dow !== "*";
  if (!domRestricted && !dowRestricted) return true;
  const domHit = domRestricted && fieldMatches(fields.dom, dom, 1, 31);
  const dowHit = dowRestricted && fieldMatches(fields.dow, dow, 0, 6);
  if (domRestricted && dowRestricted) return domHit || dowHit;
  return domRestricted ? domHit : dowHit;
}

// ── cadence from cron text: the average interval, and the longest gap ──────────────────────
//
// Two numbers come out of the same fire-minute set, and the difference between them is the whole
// of flow-0057. The AVERAGE divides the window by the number of firings. The LONGEST GAP asks how
// far apart two consecutive firings actually get. For an evenly spaced cron they are the same
// number; for a CLUSTERED one — many firings packed into a bounded daily window — the count rises
// while the longest gap does not move, so the average collapses underneath a gap that was always
// there and a healthy workflow reads `crit` for most of the week.
//
// Both derive from a fixed window anchored at the Unix epoch, never from "now", so every result is
// deterministic and testable without freezing a clock. The window is a multiple of 7 days so a
// weekly cron's pattern tiles it exactly, which is what makes the wrap below sound.
const WINDOW_DAYS_DEFAULT = 28; // four weeks — long enough to average out a weekly cron cleanly

// Brute-forces every minute in the window (40,320 at the default 28 days) per distinct cron set —
// simple and exactly correct for any cron expression, rather than special-casing the common
// `*/N` shape. Called once per scheduled workflow classified, so a page load's total cost is
// bounded by workflow count, not repo count squared; fine at fleet sizes Flow actually reaches.
// Worth revisiting only if a single repo's scheduled-workflow count grows far past today's ~3-4.
//
// Returns fire-minutes in ascending order, or null when the crons parse but never fire. Shared by
// both cadence functions below so they can never disagree about when a cron fires.
function cronFireMinutes(crons, windowMinutes) {
  const list = Array.isArray(crons) ? crons : [crons];
  const parsed = list.map(parseCronExpr).filter(Boolean);
  if (parsed.length === 0) return null;

  const fires = [];
  for (let m = 0; m < windowMinutes; m++) {
    if (parsed.some((fields) => cronMatchesMinute(fields, m))) fires.push(m);
  }
  return fires.length === 0 ? null : fires; // syntactically parsed but never actually fires
}

// Both cadence numbers from ONE scan of the window. `scheduledLiveness` needs the pair, and the
// scan is the expensive part (40,320 minutes, each building a Date); computing them separately
// would double the cost of every workflow the flightdeck page classifies, for numbers that come
// from the same set. The two exported functions below are thin views on this, so they can never
// disagree, and callers that want only one still pay for only one scan.
export function cronCadence(crons, { windowDays = WINDOW_DAYS_DEFAULT } = {}) {
  const windowMinutes = windowDays * 24 * 60;
  const fires = cronFireMinutes(crons, windowMinutes);
  if (fires === null) return null;

  let maxGapMinutes = (fires[0] + windowMinutes) - fires[fires.length - 1]; // tail joined to head
  for (let i = 1; i < fires.length; i++) {
    const gap = fires[i] - fires[i - 1];
    if (gap > maxGapMinutes) maxGapMinutes = gap;
  }
  return { intervalHours: (windowMinutes / fires.length) / 60, maxGapHours: maxGapMinutes / 60 };
}

// The average interval (in hours) between firings: the window divided by the number of firings.
// Retained as the published shape it has always had — it is still the right number for the `warn`
// band's slack and for describing a cadence in prose — but it is no longer what decides `crit`.
export function cronIntervalHours(crons, opts) {
  return cronCadence(crons, opts)?.intervalHours ?? null;
}

// The LONGEST gap (in hours) between two consecutive firings — the number a liveness threshold
// actually needs, because a workflow is only late once it has passed the longest quiet stretch its
// own schedule builds in.
//
// THE WRAP IS NOT AN EDGE CASE, IT IS THE POINT. The window is a slice of an infinite schedule, so
// the stretch from the last firing inside it to the first firing of the next window is a real gap
// that no pair of in-window neighbours represents. Measuring only in-window pairs would miss it
// entirely and, worse, the slice boundary would look like a firing that never happens. Joining the
// tail to the head — `(first + windowMinutes) - last` — measures that stretch once and exactly,
// and because the window is a whole number of weeks it is the same gap the schedule really leaves.
export function cronMaxGapHours(crons, opts) {
  return cronCadence(crons, opts)?.maxGapHours ?? null;
}

// ── liveness states ─────────────────────────────────────────────────────────────────────────
// Every rule below returns `{ state, reason?, ...detail }`. `state` is always one of
// "good" | "warn" | "crit" | "off" — never a blank cell, per the task's acceptance criteria.

// THE THRESHOLD, AND WHY IT IS THE LONGEST GAP RATHER THAN TWICE THE AVERAGE.
//
// A scheduled workflow is not late because time has passed; it is late because a firing it was
// supposed to make did not happen. So the bound has to be the longest quiet stretch the cron
// itself builds in — `cronMaxGapHours` — plus slack for the firing that would end that stretch.
// The slack is the average interval, which keeps the rule deriving entirely from the cron text
// with no tuning knob and no allowlist (a knob would let a genuinely dead workflow be silenced by
// configuration, which is the one thing a watchdog must not permit).
//
// THIS IS A STRICT GENERALISATION, NOT A NEW RULE. For an evenly spaced cron the longest gap IS
// the average interval, so `maxGap + interval` is `interval * 2` — exactly the bound this function
// has always used, to the digit. `0 */6 * * *`, `*/5 * * * *` and `0 8 * * *` therefore classify
// identically before and after this change, and tests pin that. Only a CLUSTERED cron, where the
// two numbers diverge, moves at all — which is the defect and nothing else.
//
// WHAT IT COSTS. A clustered cron alarms later in absolute terms: `0 9-18 * * 1-5` goes crit at
// ~66h rather than ~6.7h. That is the honest price of not crying wolf every night, and it is not
// unbounded — a workflow that has genuinely stopped still alarms, roughly one weekend late at the
// worst, because the bound tracks the schedule's own shape instead of a constant.
// THE FLOOR, AND WHY THE BOUND NEEDS ONE (flow-0066).
//
// The bound above derives entirely from the cron text, which is what keeps the rule free of a
// tuning knob — but it also means the bound SHRINKS as the schedule gets more frequent, with no
// lower limit. For an evenly spaced cron `maxGap + interval` is `interval * 2`, so `*/30 * * * *`
// is judged at 1.0h and `*/5 * * * *` at ten minutes. GitHub documents that scheduled workflows
// may be delayed, and dropped entirely, during periods of high load, so at that scale the bound
// has fallen inside the scheduler's own jitter: Nudge's `flow-recover` (`*/30 * * * *`) was
// measured on 2026-09-21 producing healthy gaps of 31, 27, 29, 42 and 42 minutes between
// consecutive SUCCESSFUL runs — the largest 70% of its own crit bound. One dropped firing on a
// 30-minute cron is a ~60-72m gap, which crosses the bound with nothing wrong.
//
// WHY A FLOOR COSTS NO DETECTION LATENCY HERE. `flow-watchdog.yml` runs `0 8 * * *` — once a day.
// Detection granularity is therefore already ~24h, so any floor well under that changes nothing
// about WHEN a dead workflow is reported; it only decides whether a healthy-but-jittery workflow
// happens to LOOK dead at the single instant the daily sweep reads it. A 1.0h bound against 42m of
// observed jitter is close to a coin flip at sweep time; 2h is not. On the real 2026-09-21 outage
// (runners stopped being allocated at ~07:46Z) a 2h floor would have alarmed on the same sweep.
//
// IT IS NOT A KNOB, AND THIS IS THE DISTINCTION THAT MATTERS. A knob would let a genuinely dead
// workflow be silenced by configuration, which is the one thing a watchdog must not permit. This
// is a single module constant: it cannot be set per repo or per workflow, it is visible in
// canonical's own diff, and a test pins its exact value — so changing it is a reviewed edit rather
// than a configuration act.
//
// IT COMPOSES WITH flow-0057 RATHER THAN REPLACING IT. flow-0057 fixed the CLUSTERED case, where
// the average interval collapses under a long scheduled gap; the floor fixes the EVENLY-SPACED
// SHORT case, where both numbers are small and genuinely equal. The bound takes the LARGER of the
// two, so the floor never lowers a bound that is already above it — `0 9-18 * * 1-5` keeps its
// ~66h and `0 */6 * * *` its 12h, untouched.
export const MIN_CRIT_HOURS = 2;

export function scheduledLiveness({ crons, lastSuccessAt, now, disabled }) {
  if (disabled) return { state: "off", reason: "workflow disabled" };

  const cadence = cronCadence(crons); // one scan, both numbers
  if (cadence == null) {
    return { state: "crit", reason: "cron does not parse to any firing — treated as never scheduled" };
  }
  const { intervalHours, maxGapHours } = cadence;
  if (!lastSuccessAt) {
    return { state: "crit", intervalHours, maxGapHours, reason: "no successful run recorded" };
  }
  const lastSuccessMs = new Date(lastSuccessAt).getTime();
  if (!Number.isFinite(lastSuccessMs)) {
    return { state: "crit", intervalHours, maxGapHours, reason: `unparseable lastSuccessAt: ${lastSuccessAt}` };
  }
  const ageHours = (now - lastSuccessMs) / 3600000;
  // The larger of the schedule-derived bound and the floor — see MIN_CRIT_HOURS above.
  const derivedCritAfterHours = maxGapHours + intervalHours;
  const critAfterHours = Math.max(derivedCritAfterHours, MIN_CRIT_HOURS);
  // The reason names the age AND the gap it is being judged against, because "14.1h ago" alone
  // sent a reader looking for an outage that the schedule fully explains (see flow-0057's notes).
  // The `last success Xh ago, cron interval ~Yh` prefix is KEPT VERBATIM: watchdog.test.mjs
  // matches it when asserting the issue body carries the maths, and that file is outside this
  // task's `touches`. The gap is added to the reason, never substituted for the interval.
  //
  // The trailing clause names WHICH of the two bounds actually fired. When the floor governs, the
  // schedule-derived number is no longer the thing that was crossed, and saying it was would send
  // the reader to the same kind of wrong conclusion flow-0057's wording fixed.
  if (ageHours > critAfterHours) {
    const bound = critAfterHours > derivedCritAfterHours
      ? `the ${MIN_CRIT_HOURS}h minimum bound (that gap plus one interval of slack is only ~${derivedCritAfterHours.toFixed(1)}h, inside GitHub's scheduler jitter)`
      : "that gap plus one interval of slack";
    return {
      state: "crit", intervalHours, maxGapHours, ageHours,
      reason: `last success ${ageHours.toFixed(1)}h ago, cron interval ~${intervalHours.toFixed(1)}h, longest scheduled gap ~${maxGapHours.toFixed(1)}h — past ${bound}`,
    };
  }
  if (ageHours > maxGapHours) {
    return {
      state: "warn", intervalHours, maxGapHours, ageHours,
      reason: `last success ${ageHours.toFixed(1)}h ago, cron interval ~${intervalHours.toFixed(1)}h, longest scheduled gap ~${maxGapHours.toFixed(1)}h — just past that gap`,
    };
  }
  return { state: "good", intervalHours, maxGapHours, ageHours };
}

// ── event-workflow liveness: a verdict is not a breakage ────────────────────────────────────
//
// THE DEFECT (flow-0106). A failed latest run used to be enough to call an event workflow down,
// and for a workflow whose whole job is to VERDICT on a pull request — flow-review, flow-gates,
// plane-guard, an adopter's own CI — the latest run fails every time a PR is rejected. So every
// rejected PR filed an `automation-down` issue (canonical's #130, 2026-09-29, and #115 before it,
// both closed by the next passing PR) in the one channel that must not cry wolf.
//
// WHY THE RULE IS A STREAK AND NOT "IGNORE pull_request". flow-status, flow-done and flow-open-pr
// also run on `pull_request`, and a failure there IS broken machinery; keying on the event type
// would blind the watchdog to exactly those. What separates a verdict from a breakage is SPREAD: a
// broken workflow fails every run, on every PR; a verdict fails one PR. So the rule reads the
// streak of consecutive failures from the newest run, and asks how far it spreads.
//
// WHAT IT COSTS. An event workflow that genuinely breaks is reported on its third failure instead
// of its first — one or two runs later, not never. The startup-failure check (flow-0061) still
// fires on the FIRST failed run, so the one shape that can never self-correct is unaffected.

// Consecutive failures before a non-pull-request event workflow counts as down. Three, not two: a
// flake next to one real failure is two, and that pair is the commonest honest red.
export const EVENT_FAILURE_STREAK = 3;
// Distinct `head_branch` values a pull-request-only failing streak must span to count as down —
// three different PRs failing in a row is machinery; one PR failing repeatedly is a verdict.
export const PR_STREAK_DISTINCT_BRANCHES = 3;

const PULL_REQUEST_EVENTS = new Set(["pull_request", "pull_request_target"]);

// A run that has concluded. GitHub's list-runs payload carries `status` ("completed",
// "in_progress", "queued") and a run still executing has `conclusion: null`; either tell is
// enough, and both are read because the FALLBACK direction matters. If a payload omits `status`,
// requiring it would make every run look unfinished, empty every streak, and leave this watchdog
// permanently silent on event workflows — a missed alarm is the one failure worse than a false one
// here. A present `conclusion` is a run that voted, whatever the shape of the payload around it.
export function isCompletedRun(run) {
  if (!run) return false;
  if (run.status != null && run.status !== "completed") return false;
  return run.conclusion != null;
}

// The run of consecutive `failure` runs from the newest, in `recentRuns` order (newest first).
// In-progress runs are SKIPPED rather than breaking the streak — a run that has not concluded has
// not voted either way, and letting a queued run split a failing streak in two would hand the
// watchdog a different answer depending on when in the minute it swept.
function failureStreak(recentRuns) {
  const out = [];
  for (const run of Array.isArray(recentRuns) ? recentRuns : []) {
    if (!isCompletedRun(run)) continue;
    if (run.conclusion !== "failure") break;
    out.push(run);
  }
  return out;
}

// `recentRuns` is OPTIONAL and its absence is not a default — it is a different question.
// Absent (as from `mission-control.mjs`, which asks only for the latest run): the latest run is
// the only fact available, so the answer is exactly what it has always been. Present: the streak
// rule above decides, and `{ streak }` is returned alongside so a caller can show the count.
export function eventLiveness({ disabled, latestRun, recentRuns }) {
  if (disabled) return { state: "off", reason: "workflow disabled" };
  if (!latestRun) return { state: "good", reason: "no runs recorded yet" };

  if (recentRuns == null) {
    if (latestRun.conclusion === "failure") return { state: "crit", reason: "latest run failed" };
    return { state: "good" };
  }

  const streak = failureStreak(recentRuns);
  if (streak.length === 0) return { state: "good", streak: 0 };

  const runs = `last ${streak.length} run${streak.length === 1 ? "" : "s"} failed`;

  // All pull-request runs: spread across PRs decides. `head_branch` is the PR identity available
  // on a run payload; a null branch collapses into one bucket rather than counting as its own PR,
  // so missing data can never manufacture the spread that triggers the alarm.
  if (streak.every((r) => PULL_REQUEST_EVENTS.has(r?.event))) {
    const pullRequests = new Set(streak.map((r) => String(r?.head_branch ?? ""))).size;
    const spread = `across ${pullRequests} pull request${pullRequests === 1 ? "" : "s"}`;
    if (pullRequests >= PR_STREAK_DISTINCT_BRANCHES) {
      return { state: "crit", streak: streak.length, pullRequests, reason: `${runs} ${spread}` };
    }
    return {
      state: "good", streak: streak.length, pullRequests,
      reason: `${runs} ${spread} — a rejected pull request is a verdict, not a breakage`,
    };
  }

  // Anything else in the streak (push, workflow_run, a mix): length alone decides, because such a
  // run is not a verdict on anyone's branch.
  const events = [...new Set(streak.map((r) => r?.event ?? "unknown"))].join(", ");
  if (streak.length >= EVENT_FAILURE_STREAK) {
    return { state: "crit", streak: streak.length, reason: `${runs} (${events})` };
  }
  return {
    state: "good", streak: streak.length,
    reason: `${runs} (${events}) — under the ${EVENT_FAILURE_STREAK}-failure streak that means down`,
  };
}

// The known silent killer: a PR merges to main but the gate workflow never ran against its head
// SHA (the `FLOW_PAT` failure mode — a token expiry or permission change that makes CI silently
// not fire, rather than fail loudly). `mergedShas` and `gateRunShas` are both plain arrays of
// full commit SHAs; order doesn't matter.
export function ungatedMergesLiveness({ mergedShas, gateRunShas }) {
  const gated = new Set(gateRunShas ?? []);
  const ungated = (mergedShas ?? []).filter((sha) => !gated.has(sha));
  if (ungated.length > 0) {
    return { state: "crit", count: ungated.length, reason: `${ungated.length} merged with no gate run` };
  }
  return { state: "good", count: 0 };
}

// ── repo-level rollup ────────────────────────────────────────────────────────────────────────
// "critical if any machinery is crit; attention if anything needs a human; quiet otherwise. The
// sort order IS the triage order." `needsAttention` is supplied by the caller (mission-control.mjs
// decides what counts — blocked tasks, proposed issues, an empty ready queue, PRs awaiting
// review) so this function stays a pure three-way rollup, testable without deriving all of that.
export function repoSeverity({ machineryStates, needsAttention }) {
  if ((machineryStates ?? []).some((s) => s === "crit")) return "critical";
  if (needsAttention) return "attention";
  return "quiet";
}

const SEVERITY_RANK = { critical: 0, attention: 1, quiet: 2 };

// Stable sort, most urgent first. Ties keep their relative order (Array.prototype.sort is stable
// in every engine this runs on), so a caller that pre-sorts by name gets alphabetical-within-tier.
export function sortBySeverity(rows, severityOf = (r) => r.severity) {
  return [...rows].sort((a, b) => (SEVERITY_RANK[severityOf(a)] ?? 3) - (SEVERITY_RANK[severityOf(b)] ?? 3));
}
