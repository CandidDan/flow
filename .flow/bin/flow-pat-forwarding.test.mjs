// flow-pat-forwarding.test.mjs — proving tests for flow-0026.
//
// Criteria proved here:
//   · "_flow-queue-runner.yml declares FLOW_PAT in on.workflow_call.secrets with required: false"
//   · "the 'Work the task' step's with.github_token is exactly
//      ${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}"
//
// Why it matters: pushes made with the Actions GITHUB_TOKEN don't trigger downstream workflows
// (GitHub's recursion guard), so a worker branch pushed under GITHUB_TOKEN never fires
// _flow-open-pr.yml and sits PR-less until the recovery sweep. FLOW_PAT is a real actor, so the
// push event fires normally; the fallback keeps a repo without the secret on today's behaviour.
// Same wiring shape as _flow-open-pr.yml / _flow-recover.yml / _flow-sync.yml (CAN-58).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE. Same posture as check-workflows.test.mjs: `_flow-gates.yml`'s flow-tooling
// job runs `node --test .flow/bin/*.test.mjs` with no install step, so when `yaml` is missing
// these tests skip *visibly* ("# skipped") instead of crashing the job. They run for real in
// the per-stack gate job, which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const QUEUE_RUNNER = join(REPO, ".github/workflows/_flow-queue-runner.yml");

const parseQueueRunner = () => yamlMod.parse(readFileSync(QUEUE_RUNNER, "utf8"));

test("_flow-queue-runner.yml declares FLOW_PAT as an optional workflow_call secret", { skip }, () => {
  const wf = parseQueueRunner();
  const secret = wf.on?.workflow_call?.secrets?.FLOW_PAT;
  assert.ok(secret, "on.workflow_call.secrets.FLOW_PAT must be declared — without the " +
    "declaration a thin caller's named `FLOW_PAT: ...` forward would be rejected as an " +
    "undeclared secret");
  assert.equal(secret.required, false,
    "required:true would fail the whole workflow at call time in a repo that hasn't created " +
    "the secret, instead of falling back to GITHUB_TOKEN (today's behaviour)");
});

test("the 'Work the task' step authenticates with FLOW_PAT, falling back to GITHUB_TOKEN", { skip }, () => {
  const wf = parseQueueRunner();
  const steps = wf.jobs?.dispatch?.steps ?? [];
  const work = steps.find((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action"));
  assert.ok(work, "the dispatch job must have a claude-code-action step — the worker itself");
  assert.equal(work.with?.github_token, "${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}",
    "the worker's git pushes must use FLOW_PAT (a real actor) so the branch push fires " +
    "_flow-open-pr.yml directly — GITHUB_TOKEN pushes don't trigger downstream workflows " +
    "(GitHub's recursion guard), which is exactly the gap observed on CandidDan/write#24. " +
    "The || fallback keeps a repo without the secret on unchanged behaviour");
});
