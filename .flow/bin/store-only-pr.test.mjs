// store-only-pr.test.mjs — proving tests for flow-0223 in canonical's own files: a store-only PR
// runs only the store-guard, classify and flow-doctor in `_flow-gates.yml`, and canonical's own
// push-to-main workflows are clean under flow-doctor's new warning.
//
// The classifier is `classifyStoreOnlyPr` in the template's flow-review.mjs (proved in its own
// test file). The workflow assertions need `yaml`, which `_flow-gates.yml`'s flow-tooling step
// does not install, so they skip visibly there and run in full in the per-stack gate job.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { runDoctor } from "./flow-doctor.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";
const gates = () => yamlMod.parse(readFileSync(join(REPO, ".github/workflows/_flow-gates.yml"), "utf8")).jobs;

const CONFIG_COMMANDS = ["install", "build", "lint", "test", "coverage"];
const configStep = (cmd) => (s) => s.run === `\${{ steps.cfg.outputs.${cmd} }}`;

// Evaluate a step condition. Only the shapes these steps use are understood.
function runs(cond, { intentPr = "false", storeOnly = "false", event = "pull_request", covRunsTests = "false" } = {}) {
  if (cond == null) return true;
  const expr = String(cond).replace(/^\$\{\{\s*|\s*\}\}$/g, "")
    .replaceAll("steps.kind.outputs.intent_pr", JSON.stringify(intentPr))
    .replaceAll("steps.kind.outputs.store_only", JSON.stringify(storeOnly))
    .replaceAll("steps.cfg.outputs.coverage_runs_tests", JSON.stringify(covRunsTests))
    .replaceAll("github.event_name", JSON.stringify(event))
    .replace(/'([^']*)'/g, (_, s) => JSON.stringify(s))
    .replace(/(?<![=!])==(?!=)/g, "===").replace(/!=(?!=)/g, "!==");
  assert.match(expr, /^[\s()&|!=a-z"_0-9.-]+$/, `unexpected token in step condition: ${cond}`);
  return Function(`"use strict"; return (${expr});`)();
}

const STORE_ONLY = { intentPr: "false", storeOnly: "true" };

test("flow-0223 criterion 4: on store_only == 'true' the gate job skips install, build, lint, test and coverage", { skip }, () => {
  const steps = gates().gate.steps;
  for (const cmd of CONFIG_COMMANDS) {
    const s = steps.find(configStep(cmd));
    assert.ok(s, cmd);
    assert.equal(runs(s.if, STORE_ONLY), false, `${cmd} runs on a store-only PR`);
    assert.equal(runs(s.if, { storeOnly: "false" }), true, `${cmd} must still run on an ordinary PR`);
    assert.equal(runs(s.if, { intentPr: "true", storeOnly: "false" }), false,
      `${cmd}: an intent PR is still skipped even where minimal_ci.paths leaves intents out`);
  }
});

test("flow-0223 criterion 4: the store-guard, its assertion, classify and flow-doctor still run on a store-only PR", { skip }, () => {
  const steps = gates().gate.steps;
  const want = {
    "store-guard": (s) => s.name === "Guard — store is main-only",
    "its assertion": (s) => s.name === "Assert — the store-guard proved it ran",
    classify: (s) => s.id === "kind",
    "flow-doctor": (s) => String(s.run ?? "").trim() === "node .flow/bin/flow-doctor.mjs",
  };
  for (const [label, match] of Object.entries(want)) {
    const s = steps.find(match);
    assert.ok(s, label);
    assert.equal(runs(s.if, STORE_ONLY), true, `${label} must run on a store-only PR`);
  }
  // The store-guard still fails a PR that touches .flow/tasks/ — being store-only excuses nothing.
  const guard = steps.find(want["store-guard"]);
  assert.match(guard.run, /grep -E '\^\\\.flow\/tasks\/'/);
  assert.match(guard.run, /exit 1/);
  assert.ok(steps.indexOf(guard) < steps.findIndex(want.classify), "the guard runs before the classification");
  // flow-doctor is not run on an ordinary PR's gate job (it already runs in source-roots-plan).
  assert.equal(runs(steps.find(want["flow-doctor"]).if, { storeOnly: "false" }), false);
  // classify publishes store_only from canonical's helper, never the PR's copy.
  assert.equal(String(steps.find(want.classify).run).trim().split("\n").pop(), 'node "$FLOW_BIN"/flow-review.mjs classify');
});

test("flow-0223 criterion 4: no job gains a job-level `if` on store_only, and source-root runs none of its steps on one", { skip }, () => {
  const jobs = gates();
  for (const [name, job] of Object.entries(jobs)) {
    assert.doesNotMatch(String(job.if ?? ""), /store_only/, `${name} gained a job-level if on store_only`);
  }
  // `source-root` keeps its job-level condition on the planned count; the plan job publishes 0 for
  // a store-only PR, so the job — and every one of its steps — is skipped, as for an intent PR.
  assert.match(String(jobs["source-root"].if), /needs\.source-roots-plan\.outputs\.count != '0'/);
  const count = String(jobs["source-roots-plan"].outputs.count).replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  const evalCount = (intentPr, storeOnly, planned) => Function(`"use strict"; return (${count
    .replaceAll("steps.kind.outputs.intent_pr", JSON.stringify(intentPr))
    .replaceAll("steps.kind.outputs.store_only", JSON.stringify(storeOnly))
    .replaceAll("steps.plan.outputs.count", JSON.stringify(planned))
    .replace(/'([^']*)'/g, (_, s) => JSON.stringify(s))
    .replace(/(?<![=!])==(?!=)/g, "===")});`)();
  assert.equal(evalCount("false", "true", "3"), "0", "store-only PR: source-root steps are all skipped");
  assert.equal(evalCount("true", "true", "3"), "0", "intent PR: unchanged");
  assert.equal(evalCount("true", "false", "3"), "0", "intent PR outside minimal_ci.paths: unchanged");
  assert.equal(evalCount("false", "false", "3"), "3", "an ordinary PR keeps its matrix");
  assert.equal(evalCount("", "", "2"), "2", "a manual run keeps its matrix");
});

test("flow-0223 criterion 8: flow-doctor on canonical prints no push-to-main warning", () => {
  const { warnings } = runDoctor({ flowDir: join(REPO, ".flow"), gitStatus: () => ({ inRepo: false, porcelain: "" }) });
  const push = warnings.filter((w) => w.startsWith(".github/workflows/"));
  assert.deepEqual(push, [], push.join("\n"));
  // And the CLI, run against the repo the way the gate runs it, agrees.
  let out = "";
  try {
    out = execFileSync(process.execPath, [join(BIN, "flow-doctor.mjs")], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;   // a store PROBLEM elsewhere exits 1; that is not this check
  }
  assert.doesNotMatch(out, /WARN\s+\.github\/workflows\//);
});

test("flow-0223: canonical's ci.yml and release-tag.yml skip every store-only push, and plane-guard is the one exemption", () => {
  const cfg = readFileSync(join(REPO, ".flow/config.yml"), "utf8");
  assert.match(cfg, /^minimal_ci:\n/m);
  assert.match(cfg, /push_workflows_exempt:\n(?:\s+#.*\n)+\s+- "plane-guard\.yml"/, "listed with a reason comment above it");
  for (const f of ["ci.yml", "release-tag.yml"]) {
    const src = readFileSync(join(REPO, ".github/workflows", f), "utf8");
    assert.match(src, /paths-ignore: \["\.flow\/tasks\/\*\*", "\.flow\/intents\/\*\*", "\.flow\/workstreams\/\*\*", "docs\/research\/\*\*"\]/, f);
  }
});
