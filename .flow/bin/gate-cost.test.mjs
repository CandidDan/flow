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
// `yaml`, so it skips in flow-tooling (no `npm ci`) and runs in full in the per-stack gate job.

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
  assert.ok(Object.keys(jobs).length >= 5, "the reusable gate's jobs were not found");
  assert.deepEqual(jobsThatRunOnADraft(text), [], "these jobs still run on a draft PR");
  for (const [name, job] of Object.entries(jobs)) {
    assert.equal(evaluate(job.if, { event: "pull_request", draft: false }), true, `${name} must run on a ready PR`);
    if (name !== "touches") {   // touches is pull_request-only by design: no diff to scope otherwise
      assert.equal(evaluate(job.if, { event: "workflow_dispatch" }), true, `${name} must run on workflow_dispatch`);
    }
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
