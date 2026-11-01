// idle-cost.test.mjs — proving test for flow-0185: an idle Flow repo bills at most 100 Actions
// minutes a month.
//
// "Idle" means nothing happens in the repo: no push, no PR, no issue, no merge. The only runs left
// are the ones a clock starts — every `schedule:` cron in the template callers — plus every run a
// `workflow_run` trigger chains onto one of those. GitHub bills each job at least one minute, so the
// count of runs is the floor of the bill. This test counts them the way GitHub would start them
// and asserts the total at one billed minute per run.
//
// What it does NOT count, on purpose: runs started by an event that an idle repo does not produce.
// flow-dispatch's `repository_dispatch` trigger fires only when flow-unblock or flow-recover PUSHED
// a task-file change, which an idle run never does (flow-dispatch-workflow.test.mjs proves that
// half). Before flow-0185 the chain was `workflow_run`, which fired after every run, changed or not
// — and this test counts `workflow_run` chains, so putting that trigger back is caught here.
//
// The counter is a pure function over file TEXT (`idleRunsPerMonth`), so each mutation below can be
// shown to fail it: a budget check that cannot fail checks nothing.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE — see check-workflows.test.mjs. Without `npm ci` there is no `yaml`; the parsing
// tests skip visibly in the no-install flow-tooling job and run for real in the gate job.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE_WF = join(REPO, "project-template", ".github", "workflows");

/** The idle budget, in billed minutes per 30-day month (flow-0185). */
export const IDLE_BUDGET_MINUTES = 100;
const DAYS = 30;

// ── cron ──────────────────────────────────────────────────────────────────────────────────────
// GitHub's `schedule` uses POSIX cron, five fields, in UTC. Supported here: `*`, a number, `a-b`,
// `*/n`, `a-b/n`, and comma lists of those. Anything else throws rather than being guessed at — an
// unparsed cron counted as zero runs would make the budget pass by not reading the file.

const FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 7 },
];

function expandField(text, { name, min, max }) {
  const out = new Set();
  for (const part of text.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`cron ${name}: cannot read "${part}"`);
    let lo = min, hi = max;
    if (m[1] !== "*") {
      const [a, b] = m[1].split("-").map(Number);
      lo = a; hi = b ?? (m[2] ? max : a);
    }
    const step = m[2] ? Number(m[2]) : 1;
    if (lo < min || hi > max || lo > hi || step < 1) throw new Error(`cron ${name}: "${part}" is out of range`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Runs one cron expression starts in the `days` days from `startUtc` (a Date at 00:00Z). */
export function countCronRuns(expr, startUtc, days = DAYS) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron "${expr}": expected 5 fields, got ${parts.length}`);
  const [mins, hours, doms, months, dowsRaw] = parts.map((p, i) => expandField(p, FIELDS[i]));
  const dows = new Set([...dowsRaw].map((d) => d % 7)); // 7 is Sunday too
  const domStar = parts[2] === "*", dowStar = parts[4] === "*";
  let runs = 0;
  for (let d = 0; d < days; d++) {
    const day = new Date(startUtc.getTime() + d * 86_400_000);
    if (!months.has(day.getUTCMonth() + 1)) continue;
    const domHit = doms.has(day.getUTCDate()), dowHit = dows.has(day.getUTCDay());
    // POSIX: when both day fields are restricted, a day matching EITHER runs.
    const dayRuns = domStar && dowStar ? true : domStar ? dowHit : dowStar ? domHit : domHit || dowHit;
    if (dayRuns) runs += mins.size * hours.size;
  }
  return runs;
}

// A 30-day month holds four or five of each weekday depending on where it starts, so every
// starting weekday is tried and the WORST is the answer. 2026-11-01 is a Sunday.
const STARTS = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)));

// ── the idle bill ─────────────────────────────────────────────────────────────────────────────

/**
 * Billed runs per 30-day month in a repo where nothing happens, from the workflow files' text.
 * `files` maps file name to YAML text. Returns { total, lines } — lines name each contributor.
 */
export function idleRunsPerMonth(files, yaml) {
  const wfs = Object.entries(files).map(([file, text]) => {
    const wf = yaml.parse(text);
    const on = wf.on ?? wf[true] ?? {};
    return { file, name: wf.name ?? file, on, jobs: Object.keys(wf.jobs ?? {}).length };
  });

  let worst = { total: -1, lines: [] };
  for (const start of STARTS) {
    const runs = new Map(); // workflow name → runs this month
    const lines = [];
    for (const w of wfs) {
      const crons = (w.on.schedule ?? []).map((s) => s.cron);
      const n = crons.reduce((sum, c) => sum + countCronRuns(c, start), 0);
      if (n > 0) { runs.set(w.name, n); lines.push(`${w.file}: ${n} scheduled run(s) [${crons.join(" | ")}]`); }
    }
    // workflow_run chains: each RUN of a named workflow starts one run of every workflow listening
    // for it, and every job in that chained run starts a runner. Runs and billed jobs are kept apart:
    // a chain of chains propagates runs (one per upstream run, whatever its job count), and only the
    // bill multiplies by jobs. Followed to a fixed point so a chain of chains is counted too; a cycle
    // would never settle, so it is cut off and reported.
    let changed = true, rounds = 0;
    const chainedRuns = new Map();
    while (changed) {
      changed = false;
      if (++rounds > wfs.length + 1) throw new Error("workflow_run chain does not settle — a cycle");
      for (const w of wfs) {
        const listens = w.on.workflow_run?.workflows ?? [];
        const n = listens.reduce((sum, src) => sum + (runs.get(src) ?? 0) + (chainedRuns.get(src) ?? 0), 0);
        if (n !== (chainedRuns.get(w.name) ?? 0)) { chainedRuns.set(w.name, n); changed = true; }
      }
    }
    let chainedBilled = 0;
    for (const w of wfs) {
      const n = chainedRuns.get(w.name) ?? 0;
      if (n === 0) continue;
      const billed = n * Math.max(w.jobs, 1);
      chainedBilled += billed;
      lines.push(`${w.file}: ${n} run(s) × ${Math.max(w.jobs, 1)} job(s) = ${billed}, chained by workflow_run on [${w.on.workflow_run.workflows.join(", ")}]`);
    }
    const total = [...runs.values()].reduce((a, b) => a + b, 0) + chainedBilled;
    if (total > worst.total) worst = { total, lines, start: start.toISOString().slice(0, 10) };
  }
  return worst;
}

const templateFiles = () => Object.fromEntries(
  readdirSync(TEMPLATE_WF).filter((f) => /^flow-.*\.ya?ml$/.test(f)).sort()
    .map((f) => [f, readFileSync(join(TEMPLATE_WF, f), "utf8")]),
);

// ── the cron counter, proved on its own ───────────────────────────────────────────────────────

test("countCronRuns counts hourly, 3-hourly, daily, weekday and weekly crons over 30 days", () => {
  const nov1 = STARTS[0]; // Sunday
  assert.equal(countCronRuns("17 * * * *", nov1), 720);
  assert.equal(countCronRuns("0 */3 * * *", nov1), 240);
  assert.equal(countCronRuns("41 6 * * *", nov1), 30);
  assert.equal(countCronRuns("0 6 * * 1-5", nov1), 21);   // Nov 2026: 21 weekdays in days 1–30
  assert.equal(countCronRuns("27 6 * * 1", nov1), 5);     // Mondays 2, 9, 16, 23, 30
  assert.equal(countCronRuns("0 7 * * 0", nov1), 5);      // Sundays 1, 8, 15, 22, 29
  assert.equal(countCronRuns("0 7 * * 7", nov1), 5, "7 is Sunday too");
  assert.equal(countCronRuns("0,30 9 1,15 * *", nov1), 4);
  assert.equal(countCronRuns("0 0 1 * 1", nov1), 6, "both day fields restricted: day 1 OR any Monday");
  assert.equal(countCronRuns("0 0 * 12 *", nov1), 0, "December never falls in a November window");
});

test("countCronRuns refuses what it cannot read rather than counting it as zero", () => {
  assert.throws(() => countCronRuns("@hourly", STARTS[0]), /expected 5 fields/);
  assert.throws(() => countCronRuns("0 6 * * MON", STARTS[0]), /cannot read "MON"/);
  assert.throws(() => countCronRuns("61 * * * *", STARTS[0]), /out of range/);
});

// ── the budget ────────────────────────────────────────────────────────────────────────────────

test(`an idle repo on the template callers bills at most ${IDLE_BUDGET_MINUTES} Actions minutes a month`, { skip }, () => {
  const files = templateFiles();
  assert.ok(Object.keys(files).length > 5, "no template callers found — a budget over nothing proves nothing");
  const { total, lines, start } = idleRunsPerMonth(files, yamlMod);
  assert.ok(total > 0, "no scheduled run found at all — the reader is broken, not the repo idle");
  assert.ok(total <= IDLE_BUDGET_MINUTES,
    `idle repo: ${total} billed runs/month (worst 30 days from ${start}), budget ${IDLE_BUDGET_MINUTES}:\n  ${lines.join("\n  ")}`);
});

test("the budget fails if a bookkeeping schedule or a workflow_run chain comes back", { skip }, () => {
  const base = templateFiles();
  const mutations = [
    // The criterion's own mutation: the hourly unblock backstop, re-added.
    ["flow-unblock.yml", "  workflow_dispatch:\n", '  schedule:\n    - cron: "17 * * * *"\n  workflow_dispatch:\n'],
    // recover back to every 3 hours.
    ["flow-recover.yml", /cron: "[^"]+"/, 'cron: "0 */3 * * *"'],
    // dispatch chained after every recover run again — the chained half of the count.
    ["flow-dispatch.yml", "  repository_dispatch:\n", "  workflow_run:\n    workflows: [flow-recover]\n    types: [completed]\n  repository_dispatch:\n"],
  ];
  for (const [file, from, to] of mutations) {
    const mutated = base[file].replace(from, to);
    assert.notEqual(mutated, base[file], `${file}: mutation did not apply (${from})`);
    const { total, lines } = idleRunsPerMonth({ ...base, [file]: mutated }, yamlMod);
    assert.ok(total > IDLE_BUDGET_MINUTES, `${file} mutated, yet ${total} ≤ ${IDLE_BUDGET_MINUTES}:\n  ${lines.join("\n  ")}`);
  }
});

test("a workflow_run chain starts one run per upstream run, and bills each of its jobs", { skip }, () => {
  const files = {
    "a.yml": 'name: a\non:\n  schedule:\n    - cron: "0 0 * * *"\njobs:\n  x: {}\n',
    "b.yml": "name: b\non:\n  workflow_run:\n    workflows: [a]\n    types: [completed]\njobs:\n  x: {}\n  y: {}\n",
    "c.yml": "name: c\non:\n  workflow_run:\n    workflows: [b]\n    types: [completed]\njobs:\n  x: {}\n",
  };
  // a: 30 runs. b: 30 runs (one per run of a) × 2 jobs = 60 billed. c: 30 runs (one per RUN of b,
  // not per job) × 1 job = 30. Total 120.
  assert.equal(idleRunsPerMonth(files, yamlMod).total, 120);
  const cycle = { ...files, "a.yml": files["a.yml"].replace("  schedule:", "  workflow_run:\n    workflows: [c]\n  schedule:") };
  assert.throws(() => idleRunsPerMonth(cycle, yamlMod), /does not settle/);
});

// ── the page that explains the bill ───────────────────────────────────────────────────────────

test("docs/running-flow-cheaply.md exists, covers idle, PR, public repos and FLOW_RUNNER, and is linked from flow-reusable-workflows.md", () => {
  const page = readFileSync(join(REPO, "docs", "running-flow-cheaply.md"), "utf8");
  assert.match(page, /^## An idle repo$/m);
  assert.match(page, /^## One PR$/m);
  assert.match(page, /\*\*Public repos are not billed\*\*/);
  assert.match(page, /^## Pointing `FLOW_RUNNER` at a cheaper runner$/m);
  assert.match(page, new RegExp(`at most ${IDLE_BUDGET_MINUTES}|≤ ${IDLE_BUDGET_MINUTES}|fails the gate above ${IDLE_BUDGET_MINUTES}`));
  const index = readFileSync(join(REPO, "docs", "flow-reusable-workflows.md"), "utf8");
  assert.match(index, /\]\(running-flow-cheaply\.md\)/, "flow-reusable-workflows.md must link the page");
});
