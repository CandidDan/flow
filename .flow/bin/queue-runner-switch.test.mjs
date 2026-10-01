// queue-runner-switch.test.mjs — proving tests for the queue runner's SWITCH and its WIRING (flow-0080).
//
// `project-template/.flow/bin/queue-runner-schedule.test.mjs` proves the decision: which tick is
// the day's run, in which zone, once per local day. This file proves the other half — that
// `_flow-queue-runner.yml` wires that decision to the job which actually spends money, and that
// the three properties nobody can observe from a passing unit test hold:
//
//   · FLOW_QUEUE_RUNNER=paused stops a SCHEDULED tick and nothing else;
//   · `workflow_dispatch` is never gated by the schedule, pause included;
//   · FLOW_AI=false still turns everything off, exactly as before.
//
// HOW IT ASSERTS THEM. GitHub's `if:` conditions are the mechanism here, so the test evaluates
// them rather than reading them. It implements the small subset of the expression language these
// conditions use, plus the rule that actually decides whether a job with `needs:` runs at all:
// an `if` with no status function carries an implicit "all needs succeeded", which is precisely
// why `!cancelled()` appears in the dispatch condition. Evaluating is what makes the test
// falsifiable — `mutations` below re-runs the scenarios against the condition this file
// replaced, and fails if the old one would have passed them.
//
// DEPENDENCY NOTE — same shape as check-workflows.test.mjs. The `flow-tooling` job in
// `_flow-gates.yml` runs `node --test .flow/bin/*.test.mjs` with no install step, so `yaml` is
// absent there; these tests skip visibly ("# SKIP") in that job and run for real in the
// per-stack gate job, which does `npm ci` first.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { changelogEntry } from "./changelog-entry.mjs";
import { scheduleDecision } from "./queue-runner-schedule.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const REUSABLE = join(REPO, ".github/workflows/_flow-queue-runner.yml");
const CALLER = join(TEMPLATE, ".github/workflows/flow-queue-runner.yml");
const REVIEW = join(REPO, ".github/workflows/_flow-review.yml");

const reusableSrc = readFileSync(REUSABLE, "utf8");
const callerSrc = readFileSync(CALLER, "utf8");
const wf = yamlMod ? yamlMod.parse(reusableSrc) : { jobs: {} };
const caller = yamlMod ? yamlMod.parse(callerSrc) : { on: {}, jobs: {} };

// ── the expression model ─────────────────────────────────────────────────────────────────
//
// Enough of GitHub's expression language for these conditions: context lookups, string
// equality, `&&`/`||`/`!`, parentheses and `cancelled()`. Anything it does not recognise is left
// in place, where it becomes a JavaScript syntax error rather than a silent `false` — a
// condition this model cannot read must break the test, not quietly pass it.
const STATUS_FN = /\b(?:always|cancelled|failure|success)\s*\(/;

function lookup(path, ctx) {
  let node = ctx;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object" || !(key in node)) return "";
    node = node[key];
  }
  return node ?? "";
}

export function evaluate(expression, ctx = {}) {
  const inner = String(expression).trim().replace(/^\$\{\{/, "").replace(/\}\}$/, "").trim();
  const js = inner
    .replace(/\bcancelled\s*\(\s*\)/g, () => JSON.stringify(!!ctx.cancelled))
    .replace(/\b(?:vars|github|needs|inputs)(?:\.[A-Za-z0-9_-]+)+/g, (path) => JSON.stringify(lookup(path, ctx)))
    .replace(/[!=]=/g, (op) => (op === "==" ? "===" : "!=="));
  // eslint-disable-next-line no-new-func -- the input is this repo's own workflow file
  return Boolean(new Function(`"use strict"; return (${js});`)());
}

// Does `jobId` run, in this context? This is the rule that trips people up: a job whose `if`
// names no status function is skipped when any job it `needs` was skipped or failed, however the
// condition itself evaluates.
export function jobRuns(workflow, jobId, ctx = {}) {
  const job = workflow.jobs?.[jobId];
  assert.ok(job, `no job '${jobId}' in the workflow — if it was renamed, update this test`);
  const needs = [].concat(job.needs ?? []);
  const results = needs.map((n) => lookup(`needs.${n}.result`, ctx) || "success");
  if (!job.if) return results.every((r) => r === "success");
  if (!STATUS_FN.test(job.if) && !results.every((r) => r === "success")) return false;
  return evaluate(job.if, ctx);
}

// The scenarios, as data. `gate` is what the schedule-gate job reported, and is derived from the
// real decision function rather than asserted by hand wherever a tick was scheduled.
const gateFor = (args) => {
  const d = scheduleDecision({ event: "schedule", ...args });
  return { result: "success", outputs: { proceed: String(d.proceed) } };
};
const SCHEDULED_RUN_HOUR = { now: "2026-10-01T07:00:00Z" };   // Thursday 07:00 UTC, no variables set

const ctx = ({ event = "schedule", vars = {}, needs = {}, cancelled = false }) =>
  ({ github: { event_name: event }, vars, needs, cancelled });

test("the model reads the subset it claims to, and breaks rather than guessing", { skip }, () => {
  assert.equal(evaluate("${{ vars.FLOW_AI == 'true' }}", ctx({ vars: { FLOW_AI: "true" } })), true);
  assert.equal(evaluate("${{ vars.FLOW_AI == 'true' }}", ctx({ vars: {} })), false,
    "an unset variable is the empty string, never a match");
  assert.equal(evaluate("${{ vars.FLOW_QUEUE_RUNNER != 'paused' }}", ctx({ vars: {} })), true);
  assert.equal(evaluate("${{ !cancelled() }}", ctx({ cancelled: true })), false);
  assert.equal(evaluate("${{ (false || true) && true }}", ctx({})), true);
  assert.throws(() => evaluate("${{ contains(github.ref, 'main') }}", ctx({})),
    "a function this model does not implement must fail loudly, not evaluate to false");
});

// ── criterion: FLOW_AI=true, FLOW_QUEUE_RUNNER unset, gate passed -> the worker is dispatched ──

test("a scheduled tick that passes the schedule gate dispatches a worker", { skip }, () => {
  const scenario = ctx({
    vars: { FLOW_AI: "true" },
    needs: { "schedule-gate": gateFor(SCHEDULED_RUN_HOUR) },
  });
  assert.equal(scenario.needs["schedule-gate"].outputs.proceed, "true",
    "fixture check: the decision function must actually pass this tick");
  assert.equal(jobRuns(wf, "schedule-gate", scenario), true, "the gate itself runs on a scheduled tick");
  assert.equal(jobRuns(wf, "dispatch", scenario), true);
});

test("the gate's own answer is what dispatch reads — a skip stops the worker", { skip }, () => {
  for (const [label, args] of [
    ["before the run hour", { now: "2026-10-01T06:00:00Z" }],
    ["the weekend", { now: "2026-10-03T07:00:00Z" }],
    ["already ran today", { now: "2026-10-01T09:00:00Z", earlierRuns: [{ at: "2026-10-01T07:01:00Z", dispatched: true }] }],
    ["unreadable run history", { now: "2026-10-01T07:00:00Z", earlierRuns: null }],
  ]) {
    const scenario = ctx({ vars: { FLOW_AI: "true" }, needs: { "schedule-gate": gateFor(args) } });
    assert.equal(scenario.needs["schedule-gate"].outputs.proceed, "false", `fixture check: ${label}`);
    assert.equal(jobRuns(wf, "dispatch", scenario), false, `${label} must dispatch no worker`);
  }
});

// ── criterion: FLOW_QUEUE_RUNNER=paused stops a SCHEDULED tick, and says how to resume ──

test("a paused repo dispatches nothing on a scheduled tick", { skip }, () => {
  const paused = { FLOW_AI: "true", FLOW_QUEUE_RUNNER: "paused" };
  const gate = gateFor({ ...SCHEDULED_RUN_HOUR, paused: true });
  assert.equal(gate.outputs.proceed, "false", "fixture check: the decision pauses");

  const scenario = ctx({ vars: paused, needs: { "schedule-gate": gate } });
  assert.equal(jobRuns(wf, "schedule-gate", scenario), true,
    "the gate still runs while paused — that is what writes the summary line saying so");
  assert.equal(jobRuns(wf, "dispatch", scenario), false);

  // And the pause is read from the variable by the helper, not re-implemented in YAML: the step
  // hands the raw value over, so `paused` is the only value that pauses, in one place.
  const decide = step("schedule-gate", "Decide whether this tick is the run");
  assert.equal(decide.env.FLOW_QUEUE_RUNNER, "${{ vars.FLOW_QUEUE_RUNNER }}");
  assert.match(decide.run, /--queue-runner "\$FLOW_QUEUE_RUNNER"/);
});

test("the paused notice names the pause, how to resume, and what it leaves running", { skip }, () => {
  const { reason } = scheduleDecision({ event: "schedule", paused: true, ...SCHEDULED_RUN_HOUR });
  assert.match(reason, /FLOW_QUEUE_RUNNER/);
  assert.match(reason, /gh variable delete FLOW_QUEUE_RUNNER/);
  assert.match(reason, /Review, triage and compass are untouched/);

  // The helper writes that line to $GITHUB_STEP_SUMMARY itself, so the one place it is worded is
  // the one place it is tested. The bootstrap branch — a repo that pinned this reusable before
  // `flow-sync` delivered the helper — is the only copy in YAML, and must say the same things.
  const bootstrap = step("schedule-gate", "Decide whether this tick is the run").run;
  assert.match(bootstrap, /GITHUB_STEP_SUMMARY/, "every tick writes one line, whichever branch it takes");
  const branch = bootstrap.slice(bootstrap.indexOf("if [ ! -f"), bootstrap.indexOf("exit 0"));
  assert.match(branch, /FLOW_QUEUE_RUNNER/);
  assert.match(branch, /gh variable delete FLOW_QUEUE_RUNNER/);
  assert.match(branch, /review, triage and compass are untouched/i);
});

// ── criterion: workflow_dispatch is never gated by the schedule ──

test("a workflow_dispatch run dispatches a worker even while paused", { skip }, () => {
  // The gate job excludes the event, so it is SKIPPED — the case a `needs:` would normally take
  // the dependent job down with.
  const scenario = ctx({
    event: "workflow_dispatch",
    vars: { FLOW_AI: "true", FLOW_QUEUE_RUNNER: "paused", FLOW_TZ: "Australia/Sydney", FLOW_RUN_HOUR: "7" },
    needs: { "schedule-gate": { result: "skipped", outputs: {} } },
  });
  assert.equal(jobRuns(wf, "schedule-gate", scenario), false, "the schedule gate does not apply to dispatch");
  assert.equal(jobRuns(wf, "dispatch", scenario), true,
    "working a single task on purpose is the one way in that a pause must never close");
});

test("a FAILED gate dispatches nothing — `!cancelled()` must not become a free pass", { skip }, () => {
  const scenario = ctx({
    vars: { FLOW_AI: "true" },
    needs: { "schedule-gate": { result: "failure", outputs: {} } },
  });
  assert.equal(jobRuns(wf, "dispatch", scenario), false);
  assert.equal(jobRuns(wf, "dispatch", ctx({ vars: { FLOW_AI: "true" }, cancelled: true,
    needs: { "schedule-gate": gateFor(SCHEDULED_RUN_HOUR) } })), false, "a cancelled run dispatches nothing");
});

// ── criterion: FLOW_AI=false turns everything off, exactly as before ──

test("FLOW_AI=false runs no job that could dispatch a worker", { skip }, () => {
  for (const event of ["schedule", "workflow_dispatch"]) {
    for (const queueRunner of ["", "paused"]) {
      const scenario = ctx({
        event,
        vars: { FLOW_AI: "false", FLOW_QUEUE_RUNNER: queueRunner },
        needs: { "schedule-gate": { result: "skipped", outputs: {} } },
      });
      for (const job of Object.keys(wf.jobs)) {
        assert.equal(jobRuns(wf, job, scenario), false,
          `FLOW_AI=false must stop '${job}' on a ${event} run`);
      }
    }
  }
});

test("every job in the reusable is gated on FLOW_AI, so a job added later cannot escape it", { skip }, () => {
  for (const [name, job] of Object.entries(wf.jobs)) {
    assert.match(String(job.if ?? ""), /vars\.FLOW_AI == 'true'/,
      `'${name}' must carry the master switch — FLOW_AI=false is the one off switch for the fleet`);
  }
  const agentJobs = Object.entries(wf.jobs)
    .filter(([, job]) => (job.steps ?? []).some((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action")));
  assert.deepEqual(agentJobs.map(([n]) => n), ["dispatch"],
    "exactly one job spends an agent; the gate job must stay cheap and agent-free");
});

// ── criterion: the review gate is untouched by all three variables ──

test("_flow-review.yml references none of FLOW_QUEUE_RUNNER, FLOW_TZ or FLOW_RUN_HOUR", { skip }, () => {
  const review = readFileSync(REVIEW, "utf8");
  for (const name of ["FLOW_QUEUE_RUNNER", "FLOW_TZ", "FLOW_RUN_HOUR"]) {
    assert.doesNotMatch(review, new RegExp(name),
      `pausing the queue runner must not touch the review checks — that is the whole point of ` +
      `a switch separate from FLOW_AI, and a mention of ${name} here would be the regression`);
  }
  assert.match(review, /vars\.FLOW_AI == 'true'/, "fixture check: review is still gated on FLOW_AI alone");
});

// ── criterion: the caller ticks hourly and documents the three variables ──

test("the template caller's cron is hourly, and it still owns workflow_dispatch", { skip }, () => {
  assert.deepEqual(caller.on.schedule, [{ cron: "0 * * * *" }],
    "the hour cannot live here — `on:` cannot read vars.*, so the caller ticks hourly and the " +
    "reusable decides which tick is the run");
  assert.ok("workflow_dispatch" in caller.on, "dispatch is the way to work a single task on purpose");
  assert.equal(caller.jobs["flow-queue-runner"].permissions.actions, "read",
    "the gate reads this workflow's earlier runs; a caller permissions block is exhaustive, so " +
    "without this the gate fails closed every hour");
});

test("the caller's header documents all three variables and the command that sets them", { skip }, () => {
  const header = callerSrc.slice(0, callerSrc.indexOf("\non:"));
  for (const name of ["FLOW_QUEUE_RUNNER", "FLOW_TZ", "FLOW_RUN_HOUR"]) {
    assert.match(header, new RegExp(name), `the header must document ${name}`);
  }
  assert.match(header, /gh variable set FLOW_TZ -R <owner>\/<repo> -b Australia\/Sydney/,
    "the one-line command is the whole adoption step; a variable nobody knows how to set is not a switch");
  assert.match(header, /gh variable set FLOW_RUN_HOUR/);
  assert.match(header, /gh variable set FLOW_QUEUE_RUNNER -R <owner>\/<repo> -b paused/);
  assert.match(header, /gh variable delete FLOW_QUEUE_RUNNER/, "and how to undo it");
});

test("the gate job stays small: a sparse, shallow checkout and no agent", { skip }, () => {
  const checkout = (wf.jobs["schedule-gate"].steps ?? [])
    .find((s) => String(s.uses ?? "").startsWith("actions/checkout"));
  assert.ok(checkout, "the gate needs the helper, so it does check out — sparsely");
  assert.equal(checkout.with["sparse-checkout"], ".flow/bin");
  assert.equal(checkout.with["fetch-depth"], 1, "no history: the gate reads a file, it pushes nothing");
  assert.equal(checkout.with["persist-credentials"], false);
  assert.equal(wf.jobs["schedule-gate"].permissions.actions, "read");
  assert.equal(wf.jobs["schedule-gate"].permissions.contents, "read",
    "the gate must never hold write on a repo it only reads");
  assert.equal(wf.permissions.actions, undefined,
    "`actions: read` is the gate job's alone — a top-level entry would demand the scope from " +
    "every caller, including dispatch-only ones that never reach this job");
});

test("the decide step hands the helper the event and both schedule variables", { skip }, () => {
  const decide = step("schedule-gate", "Decide whether this tick is the run");
  assert.equal(decide.env.FLOW_TZ, "${{ vars.FLOW_TZ }}");
  assert.equal(decide.env.FLOW_RUN_HOUR, "${{ vars.FLOW_RUN_HOUR }}");
  assert.match(decide.run, /node \.flow\/bin\/queue-runner-schedule\.mjs/);
  for (const flag of ["--event \"\\$GITHUB_EVENT_NAME\"", "--tz \"\\$FLOW_TZ\"",
                      "--run-hour \"\\$FLOW_RUN_HOUR\"", "--runs-file"]) {
    assert.match(decide.run, new RegExp(flag), `the helper must be given ${flag}`);
  }
  assert.equal(wf.jobs["schedule-gate"].outputs.proceed, "${{ steps.decide.outputs.proceed }}",
    "the job output dispatch reads must come from this step");
});

test("the run-history step gathers EVIDENCE: a dry tick does not consume the day", { skip }, () => {
  const gather = step("schedule-gate", "Gather this workflow's earlier scheduled runs");
  assert.equal(gather.if, "${{ vars.FLOW_QUEUE_RUNNER != 'paused' }}",
    "a paused repo answers from the variable alone and spends no API calls");
  assert.match(gather.run, /gh run list --workflow "\$file" --event schedule/,
    "only SCHEDULED runs count towards the once-per-day rule");
  assert.match(gather.run, /select\(\.name \| startswith\("Work the task"\)\)/,
    "the evidence is the worker step having run, not the job having been created — a tick that " +
    "found the queue dry must leave the day's run still available");
  assert.match(gather.run, /select\(\.conclusion != "skipped"\)/);
  assert.match(gather.run, /counting it as a dispatch/, "an unreadable run fails closed");
  assert.match(gather.run, /earlier-runs\.json/);
});

// ── criterion: the changelog fragment states the caller action ──

test("before the repo has synced the helper, the run-history step never calls the Actions API", { skip }, () => {
  // Code review on #161: the reusable can move ahead of the caller's sync, and until then the
  // caller grants no `actions` scope. `gh run list` would 403 and fail the gate before the Decide
  // step's bootstrap branch ran, stopping dispatch in the default (not paused) case.
  const run = String(step("schedule-gate", "Gather this workflow's earlier scheduled runs").run);
  const guard = run.indexOf("if [ ! -f .flow/bin/queue-runner-schedule.mjs ]");
  assert.ok(guard >= 0, "the step has the same bootstrap check as the Decide step");
  assert.ok(guard < run.indexOf("gh run list"), "and it comes before the first API call");
  assert.match(run.slice(guard, run.indexOf("gh run list")), /earlier-runs\.json[\s\S]*exit 0/,
    "the bootstrap path writes an empty history and succeeds");
});

test("the changelog entry exists and names the re-sync the caller needs", { skip }, () => {
  const entry = changelogEntry(REPO, "flow-0080");
  assert.ok(entry.trim(), "changes/flow-0080.md must exist (or be assembled into CHANGELOG.md)");
  assert.match(entry, /Caller action:/);
  assert.match(entry, /flow-queue-runner\.yml/, "the action is re-syncing the caller, by name");
  assert.match(entry, /FLOW_QUEUE_RUNNER/);
  assert.match(entry, /FLOW_TZ/);
  assert.match(entry, /FLOW_RUN_HOUR/);
});

// ── falsifiability: the conditions this file replaced must fail these scenarios ──

test("mutations: the pre-flow-0080 condition would have failed the scenarios above", { skip }, () => {
  // `if: ${{ vars.FLOW_AI == 'true' }}` with no gate is what the dispatch job carried before.
  // A paused scheduled tick would have dispatched a worker, which is the bug, so a test that
  // cannot tell the two conditions apart is decoration.
  const old = { jobs: { dispatch: { if: "${{ vars.FLOW_AI == 'true' }}" } } };
  const pausedTick = ctx({
    vars: { FLOW_AI: "true", FLOW_QUEUE_RUNNER: "paused" },
    needs: { "schedule-gate": gateFor({ ...SCHEDULED_RUN_HOUR, paused: true }) },
  });
  assert.equal(jobRuns(old, "dispatch", pausedTick), true, "the old condition ignores the pause");
  assert.equal(jobRuns(wf, "dispatch", pausedTick), false, "the new one does not");

  // And a condition without `!cancelled()` would take the dispatch job down with the SKIPPED
  // gate job on every manual run — the failure mode that makes `needs:` subtle.
  const naive = { jobs: { dispatch: { needs: "schedule-gate", if: "${{ vars.FLOW_AI == 'true' }}" } } };
  const manual = ctx({
    event: "workflow_dispatch", vars: { FLOW_AI: "true" },
    needs: { "schedule-gate": { result: "skipped", outputs: {} } },
  });
  assert.equal(jobRuns(naive, "dispatch", manual), false, "a skipped dependency skips the job");
  assert.equal(jobRuns(wf, "dispatch", manual), true, "which is why the real condition drops that rule");
});

// The uniquely-named step `name` in `job`. Fails loudly rather than returning undefined: a
// renamed step must break this file, not quietly stop testing anything.
function step(job, name) {
  const found = (wf.jobs?.[job]?.steps ?? []).filter((s) => s.name === name);
  assert.equal(found.length, 1,
    `expected exactly one step named ${JSON.stringify(name)} in '${job}', found ${found.length}`);
  return found[0];
}

test("this file is wired to the repo it checks, not to a fixture", { skip }, () => {
  assert.ok(existsSync(REUSABLE) && existsSync(CALLER) && existsSync(REVIEW));
  assert.ok(Object.keys(wf.jobs).length >= 2, "an empty parse would pass every assertion above");
});
