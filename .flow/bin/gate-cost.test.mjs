// gate-cost.test.mjs — proving tests for flow-0136: PR gates skip drafts, and a newer push cancels
// the gate and review runs it supersedes.
//
// Measured 1–8 Oct 2026 across the six private adopters: ~15,300 billed Actions minutes, about
// $30 a day. The PR gate was ~39% of it and the review ~23%, because the gate ran in full on every
// push to a DRAFT (a Flow worker pushes several before marking the PR ready, having already run
// the whole gate locally) and no caller cancelled a superseded run. These tests pin the four rules
// that stop that, each with a mutation check, so the saving cannot quietly regress.
//
// Canonical-only by placement (it reads canonical's own callers and the reusable), and it needs
// `yaml`, so it skips in the flow-tooling step (no `npm ci`) and runs in full in the per-stack gate
// job.
//
// flow-0137 adds the other half of the same bill: GitHub bills every job at least one minute, and
// the gate ran three bookkeeping jobs of a few seconds each. The last section pins them as one.
//
// flow-0217 is the review's half: the review checks started at the same moment as the gate and
// were billed even when the gate failed or was cancelled. They now run as a job of the gate's
// caller that `needs:` the gate, and in three jobs instead of five. Its section is at the end.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF = (p) => readFileSync(join(REPO, p), "utf8");
const parse = (text) => yamlMod.parse(text);

const REUSABLE_GATES = ".github/workflows/_flow-gates.yml";
const REUSABLE_KICKBACK = ".github/workflows/_flow-kickback.yml";
const GATE_CALLERS = [".github/workflows/flow-gates.yml", "project-template/.github/workflows/flow-gates.yml"];
// flow-0217: the review's own callers are retired; the review is the `flow-review` job of the gate
// callers above, so it shares their concurrency group and is cancelled with them.
const RETIRED_REVIEW_CALLERS = [".github/workflows/flow-review.yml", "project-template/.github/workflows/flow-review.yml"];
const REUSABLE_REVIEW = ".github/workflows/_flow-review.yml";

const NOT_DRAFT = "(github.event_name != 'pull_request' || github.event.pull_request.draft == false)";
const PR_NOT_DRAFT = "github.event.pull_request.draft == false";

// A tiny evaluator for exactly the `if:` shapes these jobs use, so "skips on a draft" is checked
// by EVALUATING each condition against a draft event, not by matching its text. Unknown terms
// (e.g. a `needs.*` output) evaluate to true, so they can only make a job MORE likely to run —
// a draft clause that is missing therefore shows up as a job that runs.
function evaluate(cond, { event, draft }) {
  if (cond == null) return true;
  let expr = String(cond).replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  expr = expr
    .replaceAll("github.event.pull_request.draft", draft === undefined ? "null" : String(draft))
    .replaceAll("github.event_name", JSON.stringify(event))
    .replace(/needs\.[\w-]+\.outputs\.[\w-]+\s*!=\s*'0'/g, "true")
    .replace(/'([^']*)'/g, (_, s) => JSON.stringify(s))
    .replace(/(?<![=!])==(?!=)/g, "===").replace(/!=(?!=)/g, "!==");
  assert.match(expr, /^[\s()&|!=a-z"_0-9.-]+$/, `unexpected token in job condition: ${cond}`);
  return Function(`"use strict"; return (${expr});`)();
}

const jobsOf = (text) => parse(text).jobs;
const triggersOf = (text) => { const d = parse(text); return d.on ?? d[true]; };

test("flow-0136 criterion 1: both gate callers fire on opened, reopened, synchronize and ready_for_review", { skip }, () => {
  for (const f of GATE_CALLERS) {
    assert.deepEqual(triggersOf(WF(f)).pull_request.types, ["opened", "reopened", "synchronize", "ready_for_review"], f);
  }
});

// The rule checked by criterion 2, as a function, so the mutation test below can run it against a
// deliberately broken copy of the workflow.
function jobsThatRunOnADraft(text) {
  return Object.entries(jobsOf(text))
    .filter(([, job]) => evaluate(job.if, { event: "pull_request", draft: true }))
    .map(([name]) => name);
}

test("flow-0136 criterion 2: every gate job skips on a draft, and runs on a ready PR and on workflow_dispatch", { skip }, () => {
  const text = WF(REUSABLE_GATES);
  const jobs = jobsOf(text);
  assert.ok(Object.keys(jobs).length >= 3, "the reusable gate's jobs were not found");
  assert.deepEqual(jobsThatRunOnADraft(text), [], "these jobs still run on a draft PR");
  for (const [name, job] of Object.entries(jobs)) {
    assert.equal(evaluate(job.if, { event: "pull_request", draft: false }), true, `${name} must run on a ready PR`);
    assert.equal(evaluate(job.if, { event: "workflow_dispatch" }), true, `${name} must run on workflow_dispatch`);
  }
});

test("flow-0136 criterion 2 (mutation): dropping the draft clause from any one job is caught, naming the job", { skip }, () => {
  const text = WF(REUSABLE_GATES);
  for (const name of Object.keys(jobsOf(text))) {
    const doc = parse(text);
    const cond = doc.jobs[name].if;
    doc.jobs[name].if = String(cond).replace(` && ${NOT_DRAFT}`, "").replace(` && ${PR_NOT_DRAFT}`, "");
    if (doc.jobs[name].if === NOT_DRAFT) delete doc.jobs[name].if;
    assert.deepEqual(jobsThatRunOnADraft(yamlMod.stringify(doc)), [name], `mutating ${name} must be detected`);
  }
});

function concurrencyProblems(text, prefix) {
  const c = parse(text).concurrency;
  if (!c) return ["no top-level concurrency block"];
  const out = [];
  if (c.group !== `${prefix}-\${{ github.event.pull_request.number || github.ref }}`) out.push(`group is ${c.group}`);
  if (c["cancel-in-progress"] !== "${{ github.event_name == 'pull_request' }}") out.push(`cancel-in-progress is ${c["cancel-in-progress"]}`);
  return out;
}

test("flow-0136 criterion 3: gate and review callers cancel a superseded PR run, and never a manual one", { skip }, () => {
  for (const f of GATE_CALLERS) {
    assert.deepEqual(concurrencyProblems(WF(f), "flow-gates"), [], f);
    // The review runs inside this workflow (flow-0217), so the gate's group cancels it too.
    assert.ok(jobsOf(WF(f))["flow-review"], `${f}: the review must be a job of the gate's caller`);
  }
  for (const f of RETIRED_REVIEW_CALLERS) assert.ok(!existsSync(join(REPO, f)), `${f} was retired by flow-0217`);
});

test("flow-0136 criterion 3 (mutation): a caller that cancels unconditionally, or has no group, is caught", { skip }, () => {
  const text = WF(GATE_CALLERS[1]);
  const always = text.replace("cancel-in-progress: ${{ github.event_name == 'pull_request' }}", "cancel-in-progress: true");
  assert.notDeepEqual(concurrencyProblems(always, "flow-gates"), []);
  const doc = parse(text); delete doc.concurrency;
  assert.deepEqual(concurrencyProblems(yamlMod.stringify(doc), "flow-gates"), ["no top-level concurrency block"]);
});

test("flow-0136 criterion 4: a cancelled review run never dispatches a kickback round", { skip }, () => {
  const plan = jobsOf(WF(REUSABLE_KICKBACK)).plan;
  assert.ok(plan, "_flow-kickback.yml has no plan job");
  assert.match(String(plan.if), /github\.event\.workflow_run\.conclusion == 'failure'/,
    "the kickback must act only on a FAILED review; a cancelled one (this task's concurrency) is not a failure");
  assert.doesNotMatch(String(plan.if), /cancelled/);
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// flow-0137: the bookkeeping is one job, so a gate run bills ~1 minute for it instead of ~3
// ─────────────────────────────────────────────────────────────────────────────────────────

const PLAN_JOB = "source-roots-plan";
// The jobs that do real work and are deliberately separate: `gate` is the 5–8 minute per-stack
// run, and `source-root` is the matrix that cannot be computed by the job that uses it.
const WORK_JOBS = ["gate", "source-root"];

const bookkeepingJobs = (text) =>
  Object.entries(jobsOf(text))
    .filter(([name, job]) => !WORK_JOBS.includes(name) && evaluate(job.if, { event: "pull_request", draft: false }))
    .map(([name]) => name);

const stepsOf = (job) => job.steps ?? [];
const findStep = (job, pred, what) => {
  const found = stepsOf(job).filter(pred);
  assert.equal(found.length, 1, `expected exactly one ${what} step, found ${found.length}`);
  return found[0];
};
const runs = (needle) => (s) => String(s.run ?? "").includes(needle);

// Each check the three jobs used to run, and how to recognise its step. The failure messages are
// the steps' own `run:` text, so finding the step by its command and comparing it with the text on
// main is what proves the message survived the move.
const PRESERVED = [
  { what: "touches-guard", pred: runs('node "$FLOW_BIN"/touches-guard.mjs'), helper: true, prOnly: true },
  { what: "touches-guard assertion", pred: (s) => s.name === "Assert — the touches-guard proved it ran", helper: true, prOnly: true },
  { what: "source-roots plan", pred: runs('node "$FLOW_BIN"/source-roots.mjs plan'), helper: true },
  { what: "flow-tooling tests", pred: runs("node --test .flow/bin/*.test.mjs") },
  { what: "flow-doctor", pred: runs("node .flow/bin/flow-doctor.mjs") },
];

test("flow-0137 criterion 2: at most one job besides gate and source-root runs on a non-draft PR", { skip }, () => {
  assert.deepEqual(bookkeepingJobs(WF(REUSABLE_GATES)), [PLAN_JOB],
    "each extra job bills at least one minute for a few seconds of work — fold it into the plan job as a step");
});

test("flow-0137 criterion 2 (mutation): splitting a check back out into its own job is caught", { skip }, () => {
  const doc = parse(WF(REUSABLE_GATES));
  doc.jobs.touches = { if: NOT_DRAFT, "runs-on": "ubuntu-latest", steps: [{ run: "echo touches" }] };
  assert.deepEqual(bookkeepingJobs(yamlMod.stringify(doc)), [PLAN_JOB, "touches"]);
});

test("flow-0137 criterion 1: store-guard, touches-guard, flow-tooling tests and plan each still run as a step", { skip }, () => {
  const jobs = jobsOf(WF(REUSABLE_GATES));
  findStep(jobs.gate, (s) => s.name === "Guard — store is main-only", "store-guard");
  findStep(jobs.gate, (s) => s.name === "Assert — the store-guard proved it ran", "store-guard assertion");
  for (const { what, pred } of PRESERVED) findStep(jobs[PLAN_JOB], pred, what);
});

// "Fails the run on its own failure": no step may swallow its exit code, and no check may be
// skipped just because a DIFFERENT check before it failed — that was free with three jobs.
function independenceProblems(text) {
  const job = jobsOf(text)[PLAN_JOB];
  const out = [];
  for (const { what, pred, helper, prOnly } of PRESERVED) {
    const step = stepsOf(job).find(pred);
    if (!step) { out.push(`${what}: missing`); continue; }
    if (step["continue-on-error"]) out.push(`${what}: continue-on-error swallows its failure`);
    const cond = String(step.if ?? "");
    if (!cond.includes("!cancelled()")) out.push(`${what}: an earlier check's failure would skip it`);
    if (helper && !cond.includes("env.FLOW_BIN != ''")) out.push(`${what}: runs even when canonical's helpers were not materialised`);
    if (prOnly && !cond.includes("github.event_name == 'pull_request'")) out.push(`${what}: runs without a PR diff to check`);
    if (!prOnly && cond.includes("pull_request")) out.push(`${what}: must also run on workflow_dispatch`);
  }
  return out;
}

test("flow-0137 criterion 1: each check fails the job on its own and does not hide the others", { skip }, () => {
  assert.deepEqual(independenceProblems(WF(REUSABLE_GATES)), []);
  const job = jobsOf(WF(REUSABLE_GATES))[PLAN_JOB];
  assert.equal(job.steps[0].with?.["fetch-depth"], 0, "the touches-guard diffs against the base: a shallow clone has none");
  assert.match(String(job.if), /draft == false/, "and the merged job keeps flow-0136's draft clause");
});

test("flow-0137 criterion 1 (mutation): a check that would be skipped or swallowed is caught, naming it", { skip }, () => {
  const text = WF(REUSABLE_GATES);
  for (const { what, pred } of PRESERVED) {
    const doc = parse(text);
    const step = doc.jobs[PLAN_JOB].steps.find(pred);
    delete step.if;
    assert.ok(independenceProblems(yamlMod.stringify(doc)).some((p) => p.startsWith(`${what}:`)), `dropping ${what}'s if`);
    const doc2 = parse(text);
    doc2.jobs[PLAN_JOB].steps.find(pred)["continue-on-error"] = true;
    assert.ok(independenceProblems(yamlMod.stringify(doc2)).includes(`${what}: continue-on-error swallows its failure`));
  }
});

test("flow-0137 criterion 3: source-root still reads its matrix from a job output, and never waits on gate", { skip }, () => {
  const jobs = jobsOf(WF(REUSABLE_GATES));
  const needs = [].concat(jobs["source-root"].needs ?? []);
  assert.deepEqual(needs, [PLAN_JOB], "source-root must need the plan job and nothing else — above all not `gate`");
  assert.match(String(jobs["source-root"].strategy.matrix), new RegExp(`needs\\.${PLAN_JOB}\\.outputs\\.matrix`));
  assert.equal(jobs[PLAN_JOB].outputs.matrix, "${{ steps.plan.outputs.matrix }}");
  assert.equal(jobs[PLAN_JOB].needs, undefined, "the plan job must not wait on anything, gate included");
  findStep(jobs[PLAN_JOB], (s) => s.id === "plan", "id: plan");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// flow-0178: an intent-only PR runs flow-doctor in the gate job instead of the five config commands
// ─────────────────────────────────────────────────────────────────────────────────────────

const CONFIG_COMMANDS = ["install", "build", "lint", "test", "coverage"];
const configStep = (cmd) => (s) => s.run === `\${{ steps.cfg.outputs.${cmd} }}`;
const DOCTOR = (s) => String(s.run ?? "").trim() === "node .flow/bin/flow-doctor.mjs";
const CLASSIFY = (s) => s.id === "kind";

// Evaluate a STEP condition for one value of the classification. Only the shapes these steps use
// are understood; anything else fails the assertion inside, rather than guessing.
function stepRuns(cond, { intentPr, event = "pull_request", coverageRunsTests = "false" }) {
  if (cond == null) return true;
  let expr = String(cond).replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  expr = expr
    .replaceAll("steps.kind.outputs.intent_pr", JSON.stringify(intentPr))
    .replaceAll("steps.cfg.outputs.coverage_runs_tests", JSON.stringify(coverageRunsTests))
    .replaceAll("github.event_name", JSON.stringify(event))
    .replace(/'([^']*)'/g, (_, s) => JSON.stringify(s))
    .replace(/(?<![=!])==(?!=)/g, "===").replace(/!=(?!=)/g, "!==");
  assert.match(expr, /^[\s()&|!=a-z"_0-9.-]+$/, `unexpected token in step condition: ${cond}`);
  return Function(`"use strict"; return (${expr});`)();
}

// What the gate job runs for one classification: which of the five config commands, and flow-doctor.
function gateRuns(text, ctx) {
  const gate = jobsOf(text).gate;
  const ran = CONFIG_COMMANDS.filter((cmd) => stepsOf(gate).filter(configStep(cmd)).some((s) => stepRuns(s.if, ctx)));
  const doctor = stepsOf(gate).filter(DOCTOR).some((s) => stepRuns(s.if, ctx));
  return { ran, doctor };
}

test("flow-0178 criterion 2: for an intent-only PR the gate job runs flow-doctor and skips install, build, lint, test and coverage", { skip }, () => {
  assert.deepEqual(gateRuns(WF(REUSABLE_GATES), { intentPr: "true" }), { ran: [], doctor: true });
});

test("flow-0178 criterion 2: a non-intent PR, and a manual run, still run all five", { skip }, () => {
  for (const ctx of [{ intentPr: "false" }, { intentPr: "", event: "workflow_dispatch" }]) {
    assert.deepEqual(gateRuns(WF(REUSABLE_GATES), ctx), { ran: CONFIG_COMMANDS, doctor: false }, JSON.stringify(ctx));
  }
});

test("flow-0178 criterion 2 (mutation): a config command that loses its condition, or a doctor step that runs always, is caught", { skip }, () => {
  const text = WF(REUSABLE_GATES);
  for (const cmd of CONFIG_COMMANDS) {
    const doc = parse(text);
    delete doc.jobs.gate.steps.find(configStep(cmd)).if;
    assert.deepEqual(gateRuns(yamlMod.stringify(doc), { intentPr: "true" }).ran, [cmd], cmd);
  }
  const doc = parse(text);
  delete doc.jobs.gate.steps.find(DOCTOR).if;
  assert.equal(gateRuns(yamlMod.stringify(doc), { intentPr: "false" }).doctor, true);
});

test("flow-0178 criterion 2: the classification comes from canonical's helper, before the commands, and the gate job still reports", { skip }, () => {
  const jobs = jobsOf(WF(REUSABLE_GATES));
  for (const name of ["gate", PLAN_JOB]) {
    const steps = stepsOf(jobs[name]);
    const kind = findStep(jobs[name], CLASSIFY, `${name} classify`);
    assert.equal(String(kind.run).trim().split("\n").pop(), 'node "$FLOW_BIN"/flow-review.mjs classify',
      `${name}: canonical's copy at this workflow's commit, never the PR's .flow/bin/`);
    assert.match(String(kind.if), /github\.event_name == 'pull_request'/);
    const materialise = steps.findIndex((s) => s.name === "Materialise canonical's helpers at this workflow's commit");
    assert.ok(materialise >= 0 && steps.indexOf(kind) > materialise, `${name}: classify must follow the helper fetch`);
  }
  const gate = stepsOf(jobs.gate);
  assert.ok(gate.indexOf(findStep(jobs.gate, CLASSIFY, "classify")) < gate.findIndex(configStep("install")));
  // The job itself is not skipped for an intent PR: it keeps flow-0136's condition and nothing more.
  assert.equal(jobs.gate.if, NOT_DRAFT);
});

test("flow-0178: an intent-only PR runs no source-root matrix", { skip }, () => {
  const jobs = jobsOf(WF(REUSABLE_GATES));
  const count = String(jobs[PLAN_JOB].outputs.count).replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  const evalCount = (intentPr, planned) => Function(`"use strict"; return (${count
    .replaceAll("steps.kind.outputs.intent_pr", JSON.stringify(intentPr))
    .replaceAll("steps.plan.outputs.count", JSON.stringify(planned))
    .replace(/'([^']*)'/g, (_, s) => JSON.stringify(s))
    .replace(/(?<![=!])==(?!=)/g, "===")});`)();
  assert.equal(evalCount("true", "3"), "0", "intent PR: no matrix");
  assert.equal(evalCount("false", "3"), "3", "any other PR keeps the planned count");
  assert.equal(evalCount("", "2"), "2", "a manual run keeps the planned count");
  assert.match(String(jobs["source-root"].if), /needs\.source-roots-plan\.outputs\.count != '0'/);
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// flow-0213: `coverage_runs_tests: true` skips the separate Test step, because the coverage
// command already runs the same suite. Measured in mapd: Test 16 min, then Coverage 18.5 min.
// ─────────────────────────────────────────────────────────────────────────────────────────

const CFG_STEP = (s) => s.id === "cfg";

test("flow-0213 criterion 2: with coverage_runs_tests true, a non-intent PR skips Test and still runs Coverage", { skip }, () => {
  for (const event of ["pull_request", "workflow_dispatch"]) {
    const ctx = { intentPr: event === "pull_request" ? "false" : "", event, coverageRunsTests: "true" };
    assert.deepEqual(gateRuns(WF(REUSABLE_GATES), ctx), { ran: ["install", "build", "lint", "coverage"], doctor: false }, event);
  }
});

test("flow-0213 criterion 3 (mutation): the Test step that ignores coverage_runs_tests is caught, and the key defaults to false", { skip }, () => {
  const text = WF(REUSABLE_GATES);
  const cfg = findStep(jobsOf(text).gate, CFG_STEP, "id: cfg");
  assert.match(cfg.run, /echo "coverage_runs_tests=\$\(yq -r '\.coverage_runs_tests \/\/ false' \.flow\/config\.yml\)"/,
    "the config step must read coverage_runs_tests with a false default");
  const doc = parse(text);
  doc.jobs.gate.steps.find(configStep("test")).if = "steps.kind.outputs.intent_pr != 'true'";
  assert.ok(gateRuns(yamlMod.stringify(doc), { intentPr: "false", coverageRunsTests: "true" }).ran.includes("test"),
    "a Test step without the coverage_runs_tests clause runs the suite twice");
  // And the default: the key unset reads as "false", so every command still runs.
  assert.ok(gateRuns(text, { intentPr: "false", coverageRunsTests: "false" }).ran.includes("test"));
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// flow-0217: the review starts only after the gate has passed, and runs in three jobs, not five
// ─────────────────────────────────────────────────────────────────────────────────────────

const REVIEW_JOB = "flow-review";
const REVIEW_CHECKS = ["qa", "code-review", "security"];
// A ready, same-repo PR in a repo that has opted in: the case where every reviewer should start.
const READY_PR = { FLOW_AI: "true", draft: false, sameRepo: true };

// Whether a job runs, given the result of each job it needs. This is GitHub's rule for exactly the
// shapes these files use: with no status function (`always()`, `!cancelled()`, `success()`,
// `failure()`) in its `if:`, a job runs only when every job it needs SUCCEEDED; with one, the
// status function decides. A job whose needs are not all `success` is skipped otherwise.
function jobRuns(job, needResults, ctx = READY_PR) {
  const results = [].concat(job.needs ?? []).map((n) => needResults[n]);
  const cond = job.if == null ? "" : String(job.if).replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  const hasStatusFn = /\b(always|cancelled|success|failure)\(\)/.test(cond);
  if (!hasStatusFn && results.some((r) => r !== "success")) return false;
  if (!cond) return true;
  const expr = cond
    .replaceAll("always()", "true")
    .replaceAll("cancelled()", JSON.stringify(results.includes("cancelled")))
    .replaceAll("success()", JSON.stringify(results.every((r) => r === "success")))
    .replaceAll("failure()", JSON.stringify(results.includes("failure")))
    .replaceAll("vars.FLOW_AI", JSON.stringify(ctx.FLOW_AI))
    .replaceAll("github.event.pull_request.draft", String(ctx.draft))
    .replaceAll("github.event.pull_request.head.repo.full_name == github.repository", String(ctx.sameRepo))
    .replaceAll("github.event_name", JSON.stringify(ctx.event ?? "pull_request"))
    .replace(/'([^']*)'/g, (_, v) => JSON.stringify(v))
    .replace(/(?<![=!])==(?!=)/g, "===").replace(/!=(?!=)/g, "!==");
  assert.match(expr, /^[\s()&|!=a-z"_0-9.-]+$/, `unexpected token in job condition: ${job.if}`);
  return Function(`"use strict"; return (${expr});`)();
}

test("flow-0217 criterion 1: in both gate callers, a gate that fails or is cancelled starts no review", { skip }, () => {
  for (const f of GATE_CALLERS) {
    const review = jobsOf(WF(f))[REVIEW_JOB];
    assert.ok(review, `${f} must call the review as its \`${REVIEW_JOB}\` job`);
    assert.match(String(review.uses), /\/_flow-review\.yml@/, `${f}: the job must call the review reusable`);
    assert.equal(review.needs, "flow-gates", `${f}: the review must wait for the gate job`);
    for (const gate of ["failure", "cancelled", "skipped"]) {
      assert.equal(jobRuns(review, { "flow-gates": gate }), false, `${f}: the review ran after a gate that was ${gate}`);
    }
    assert.equal(jobRuns(review, { "flow-gates": "success" }), true, `${f}: the review must run once the gate passed`);
    assert.equal(jobRuns(review, { "flow-gates": "success" }, { ...READY_PR, event: "workflow_dispatch" }), false,
      `${f}: a manual gate run has no PR to review`);
  }
});

test("flow-0217 criterion 1 (mutation): a review job that drops its needs, or runs always(), is caught", { skip }, () => {
  const doc = parse(WF(GATE_CALLERS[1]));
  delete doc.jobs[REVIEW_JOB].needs;
  assert.equal(jobRuns(doc.jobs[REVIEW_JOB], { "flow-gates": "failure" }), true);
  const doc2 = parse(WF(GATE_CALLERS[1]));
  doc2.jobs[REVIEW_JOB].if = "${{ always() && github.event_name == 'pull_request' }}";
  assert.equal(jobRuns(doc2.jobs[REVIEW_JOB], { "flow-gates": "failure" }), true);
});

test("flow-0217 criterion 2: once the gate passes, qa, code-review and security run and report as before", { skip }, () => {
  const jobs = jobsOf(WF(REUSABLE_REVIEW));
  // The checks are reported as `<caller job> / <job>`, so these two names are the check names
  // branch protection requires: flow-review / qa, flow-review / code-review, flow-review / security.
  for (const f of GATE_CALLERS) assert.ok(jobsOf(WF(f))[REVIEW_JOB], f);
  assert.deepEqual(Object.keys(jobs), REVIEW_CHECKS, "the three check names must not change");
  const results = {};
  for (const name of REVIEW_CHECKS) {
    assert.equal(jobRuns(jobs[name], results), true, `${name} must run on a ready PR once the gate passed`);
    results[name] = "success";
    const steps = jobs[name].steps ?? [];
    const reviewer = steps.filter((st) => String(st.uses ?? "").startsWith("anthropics/claude-code-action") && st.id === "claude");
    assert.equal(reviewer.length, 1, `${name}: exactly one reviewer model step`);
    const enforce = steps.filter((st) => new RegExp(`flow-review\\.mjs enforce \\S+ --check ${name}\\b`).test(String(st.run ?? "")));
    assert.equal(enforce.length, 1, `${name}: exactly one step decides the check`);
    assert.match(String(enforce[0].if), /always\(\)/, `${name}: a crashed reviewer must still fail the check`);
    assert.equal(enforce[0]["continue-on-error"], undefined, `${name}: the deciding step must be able to fail`);
  }
  // security also runs when a reviewer before it failed, so its verdict and the guide still report.
  assert.equal(jobRuns(jobs.security, { qa: "failure", "code-review": "success" }), true);
  assert.equal(jobRuns(jobs.security, { qa: "cancelled", "code-review": "success" }), false);
  // And the fences hold: a draft, a fork PR or a repo that has not opted in starts none of them.
  for (const ctx of [{ ...READY_PR, draft: true }, { ...READY_PR, sameRepo: false }, { ...READY_PR, FLOW_AI: "" }]) {
    for (const name of REVIEW_CHECKS) {
      assert.equal(jobRuns(jobs[name], { qa: "success", "code-review": "success" }, ctx), false, `${name}: ${JSON.stringify(ctx)}`);
    }
  }
});

function reviewJobProblems(text) {
  const names = Object.keys(jobsOf(text));
  return names.length <= 3 ? [] : [`${names.length} jobs: ${names.join(", ")}`];
}

test("flow-0217 criterion 3: a review run is at most three jobs", { skip }, () => {
  assert.deepEqual(reviewJobProblems(WF(REUSABLE_REVIEW)), [],
    "GitHub bills every job at least one minute; plan and guide are steps now, not jobs");
});

test("flow-0217 criterion 3 (mutation): splitting the guide back out into its own job is caught", { skip }, () => {
  const doc = parse(WF(REUSABLE_REVIEW));
  doc.jobs.guide = { needs: ["qa", "code-review", "security"], "runs-on": "ubuntu-latest", steps: [{ run: "echo guide" }] };
  assert.deepEqual(reviewJobProblems(yamlMod.stringify(doc)), ["4 jobs: qa, code-review, security, guide"]);
});

// The kickback's filter, run for real with jq over a jobs payload shaped like the API's. Since the
// review runs inside flow-gates, a failed run can hold failed GATE jobs, and those must never read
// as a failed review check.
const hasJq = (() => { try { execFileSync("jq", ["--version"]); return true; } catch { return false; } })();
function failedReviewChecks(jobs) {
  const step = jobsOf(WF(REUSABLE_KICKBACK)).plan.steps.find((st) => st.id === "failed");
  const filter = String(step.run).match(/--jq '([^']*)'/)?.[1];
  assert.ok(filter, "the failed-jobs step must select the failed jobs with one --jq filter");
  return execFileSync("jq", ["-r", filter], { input: JSON.stringify({ jobs }), encoding: "utf8" })
    .split("\n").filter(Boolean).sort();
}

test("flow-0217 criterion 4: kickback listens for flow-gates and sees only failed review checks", { skip: skip || (!hasJq && "needs jq") }, () => {
  for (const f of [".github/workflows/flow-kickback.yml", "project-template/.github/workflows/flow-kickback.yml"]) {
    assert.deepEqual(triggersOf(WF(f)).workflow_run.workflows, ["flow-gates"], f);
  }
  const job = (name, conclusion) => ({ name, conclusion });
  assert.deepEqual(failedReviewChecks([
    job("flow-gates / gate", "success"), job("flow-review / qa", "failure"),
    job("flow-review / code-review", "failure"), job("flow-review / security", "success"),
  ]), ["code-review", "qa"]);
  assert.deepEqual(failedReviewChecks([job("flow-review / security", "failure")]), ["security"]);
  // A red gate is not a red review: no check reaches the decision.
  assert.deepEqual(failedReviewChecks([job("flow-gates / gate", "failure"), job("flow-gates / source-root (app)", "failure")]), []);
  // A cancelled review job is not a failed one either.
  assert.deepEqual(failedReviewChecks([job("flow-review / qa", "cancelled")]), []);
});

test("flow-0217 criterion 4: with no failed review check, kickback decides nothing", { skip }, () => {
  const steps = jobsOf(WF(REUSABLE_KICKBACK)).plan.steps;
  for (const id of ["facts", "decide"]) {
    assert.match(String(steps.find((st) => st.id === id).if), /steps\.failed\.outputs\.checks != ''/,
      `${id}: a run whose only failures are gate jobs must not reach the decision, which would escalate at the round cap`);
  }
});

test("flow-0217: flow-sync deletes an adopter's old flow-review.yml, and the review gate accepts that deletion", { skip }, async () => {
  const sync = WF(".github/workflows/_flow-sync.yml");
  assert.match(sync.match(/for RETIRED in [^\n]*; do/)?.[0] ?? "", /"\.github\/workflows\/flow-review\.yml"/,
    "a caller left behind would run the review a second time, on every push, alongside the gate");
  const { SYNC_RETIRED_PATHS } = await import("../../project-template/.flow/bin/flow-review.mjs");
  assert.ok(SYNC_RETIRED_PATHS.includes(".github/workflows/flow-review.yml"));
});
