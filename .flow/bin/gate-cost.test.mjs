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

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const REVIEW_CALLERS = [".github/workflows/flow-review.yml", "project-template/.github/workflows/flow-review.yml"];

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
  for (const f of GATE_CALLERS) assert.deepEqual(concurrencyProblems(WF(f), "flow-gates"), [], f);
  for (const f of REVIEW_CALLERS) assert.deepEqual(concurrencyProblems(WF(f), "flow-review"), [], f);
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
