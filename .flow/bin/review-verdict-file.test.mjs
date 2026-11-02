// review-verdict-file.test.mjs — proving tests for flow-0186's wiring of the vendor-neutral
// verdict file in `_flow-review.yml`.
//
// Each review check's model step writes `$RUNNER_TEMP/flow-review/<check>.json`; the shape is
// defined by `validateVerdictFile` in the template's flow-review.mjs (its tests are in
// flow-review.test.mjs). These tests hold the workflow to the other half of the contract:
//
//   · qa, code-review and security each make exactly one model call (since flow-0193 they are
//     sections of ONE `review` job, not three jobs: review-one-job.test.mjs proves that layout);
//   · each model step is preceded by a step that deletes that check's verdict file, so a stale
//     file can never pass;
//   · the steps that decide a check read that file and no output of the model step, so a
//     different vendor's model step can be dropped in without touching them;
//   · a skipped security review makes no model call.
//
// DEPENDENCY NOTE — same as flow-review-workflow.test.mjs: these need `yaml`, so they skip
// visibly in the no-install `flow-tooling` job and run for real after `npm ci`.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const src = readFileSync(join(REPO, ".github/workflows/_flow-review.yml"), "utf8");
const wf = yamlMod ? yamlMod.parse(src) : { jobs: {} };

const CHECKS = ["qa", "code-review", "security"];
const MODEL_ACTION = "anthropics/claude-code-action";
// flow-0193: a review is a SECTION of the `review` job — from the step that clears its verdict
// file to the step that creates its check run, inclusive. Any other name is a job.
const sectionOf = (check) => {
  const steps = wf.jobs.review?.steps ?? [];
  const start = steps.findIndex((s) => s.name === `Clear the ${check} verdict file`);
  const end = steps.findIndex((s) => s.id === `${check.replace(/-/g, "_")}_check`);
  return start >= 0 && end > start ? steps.slice(start, end + 1) : [];
};
const stepsOf = (job) => (CHECKS.includes(job) ? sectionOf(job) : wf.jobs[job]?.steps ?? []);
const isModelStep = (s) => String(s.uses ?? "").startsWith(MODEL_ACTION);
const verdictPath = (check) => `$RUNNER_TEMP/flow-review/${check}.json`;
// A step that only REPORTS which model answered (flow-0140). The orchestrator's note on
// flow-0186 allows it to read the action's execution file: it reports, it does not decide.
const isModelReport = (s) => s.name === "Report the model that answered";
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every step that can decide a check: the check-run step, and anything that posts a comment or
// triggers a fix. Found by what the step does, not by a fixed list of names.
const isDecidingStep = (s) =>
  !isModelStep(s) && !isModelReport(s) &&
  /flow-review\.mjs (check-run|enforce|verdict)\b|gh (api|pr)\b|issues\/[^\s]*comments|dispatches|kickback/
    .test(String(s.run ?? ""));

test("criterion 1: qa, code-review and security each make exactly one model call of their own", { skip }, () => {
  for (const check of CHECKS) {
    assert.ok(stepsOf(check).length, `the review job has no ${check} section`);
    const models = stepsOf(check).filter(isModelStep);
    assert.equal(models.length, 1,
      `${check} must make exactly one model call of its own — reviews never share a session`);
  }
});

test("criterion 1: each model step is preceded by a step that deletes that check's verdict file", { skip }, () => {
  for (const check of CHECKS) {
    const steps = stepsOf(check);
    const model = steps.findIndex(isModelStep);
    const deletes = steps.findIndex((s) =>
      new RegExp(`rm -f "${escape(verdictPath(check))}"`).test(String(s.run ?? "")));
    assert.ok(deletes >= 0, `${check} has no step deleting ${verdictPath(check)}`);
    assert.ok(deletes < model,
      `${check} deletes its verdict file AFTER the model step — a stale file could then pass`);
    // Nothing between the delete and the model step may run unconditionally and write the file
    // for a reviewer that has not run: only the intent-PR fixed line may, and only on that kind.
    for (const s of steps.slice(deletes + 1, model)) {
      if (!String(s.run ?? "").includes("VERDICT_FILE") && !JSON.stringify(s.env ?? {}).includes("flow-review/")) continue;
      assert.equal(s.if, "${{ needs.plan.outputs.intent_pr == 'true' }}",
        `${check}: "${s.name}" writes the verdict file and is not limited to an intent PR`);
    }
  }
});

test("criterion 1: each model step is told to write that same file, with its check name", { skip }, () => {
  for (const check of CHECKS) {
    const prompt = String(stepsOf(check).find(isModelStep).with?.prompt ?? "");
    assert.match(prompt, new RegExp(`Write \\$\\{\\{ runner\\.temp \\}\\}/flow-review/${escape(check)}\\.json`));
    assert.match(prompt, new RegExp(`"check":"${escape(check)}"`));
    assert.match(prompt, /"verdict":"pass"\|"fail"/, "the contract's verdict values are lower case");
    assert.doesNotMatch(prompt, /\.flow-review\/[\w-]+\.json/,
      "the old workspace verdict path must be gone from the prompt");
  }
});

test("criterion 2: no step that decides a check reads a model step's outputs", { skip }, () => {
  for (const check of CHECKS) {
    const steps = stepsOf(check);
    const modelIds = steps.filter(isModelStep).map((s) => s.id).filter(Boolean);
    assert.ok(modelIds.length, `${check}: the model step needs an id for this test to mean anything`);
    const deciding = steps.filter(isDecidingStep);
    assert.ok(deciding.length >= 1, `${check}: no deciding step found — an empty scan proves nothing`);
    for (const s of steps.filter((x) => !isModelStep(x) && !isModelReport(x))) {
      for (const id of modelIds) {
        assert.ok(!JSON.stringify(s).includes(`steps.${id}.`),
          `${check}: "${s.name ?? s.run}" reads the model step's outputs (steps.${id}.…). Only ` +
          `the verdict file may carry a reviewer's result.`);
      }
    }
  }
});

test("criterion 2: the deciding steps read only $RUNNER_TEMP/flow-review/<check>.json", { skip }, () => {
  for (const check of CHECKS) {
    const deciding = stepsOf(check).filter(isDecidingStep);
    assert.equal(deciding.length, 1, `${check}: exactly one step decides the check`);
    const run = String(deciding[0].run);
    assert.match(run, new RegExp(`flow-review\\.mjs check-run "${escape(verdictPath(check))}" --check ${escape(check)}\\b`));
    assert.doesNotMatch(run, /\.flow-review\//,
      "the workspace is where the reviewer works; the verdict is not read from it");
    assert.equal(String(deciding[0].if ?? ""), "${{ !cancelled() }}",
      "a reviewer that crashed must still fail the check, not skip its check run");
  }
});

test("criterion 4 (as of flow-0193): when plan skips security, no security model call is made", { skip }, () => {
  const model = stepsOf("security").find(isModelStep);
  assert.equal(model.if, "${{ needs.plan.outputs.security_run == 'true' }}",
    "the security model step runs only on the plan's decision; one runner serves all three reviews");
  assert.deepEqual(wf.jobs.review.needs, "plan");
  // The skip is recorded twice: the plan job's summary, and the security check run's summary.
  assert.ok(stepsOf("plan").some((s) => /flow-review\.mjs plan\b/.test(String(s.run ?? ""))),
    "the plan job's summary is where `### Security review — SKIPPED` is recorded");
});
