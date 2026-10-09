// kickback-credential-boundary.test.mjs — canonical keeps auto-fix OFF while the fixer model and
// FLOW_PAT share a job (flow-0134).
//
// On a GitHub runner the trust boundary is the JOB, not the step. Every step of a job shares the
// filesystem (so `.git/hooks/`) and the `$GITHUB_ENV` / `$GITHUB_PATH` files, which feed every later
// step. A model step running `bypassPermissions` over PR comments can therefore plant a hook, an env
// var (BASH_ENV) or a PATH entry that runs beside any secret a later step of the same job holds.
// flow-0082 pinned "FLOW_PAT reaches exactly one step", which a same-job layout satisfies, so it
// passed three security reviews. This pins the job-level fact instead.
//
// While `_flow-kickback.yml` has a job that both runs `anthropics/claude-code-action` and references
// `secrets.FLOW_PAT`, canonical's `review.auto_fix_rounds` must be 0 or absent. flow-0135 split the
// job (`fix` runs the model, `push` holds the PAT), so the predicate reports nothing and canonical
// is re-armed at 2. Moving a model step back beside the PAT fails here while canonical is armed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAutoFixRounds, effectiveCap, decide, SKIP } from "./flow-kickback.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REUSABLE = join(REPO, ".github", "workflows", "_flow-kickback.yml");
const CONFIG = join(REPO, ".flow", "config.yml");

// Dynamic, like every other yaml user here: flow-tooling runs these tests WITHOUT `npm ci`, and a
// static import would crash the whole file there. The per-stack gate job installs yaml and runs
// them in full; criterion 1 needs no parser and runs everywhere.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const MODEL_ACTION = /^anthropics\/claude-code-action@/;
const FLOW_PAT = /\bsecrets\.FLOW_PAT\b/;

// The jobs that both run a model and reference FLOW_PAT anywhere (job env, step env, with:, run:).
export function modelJobsHoldingPat(workflowText) {
  const jobs = yamlMod.parse(workflowText)?.jobs ?? {};
  const out = [];
  for (const [name, job] of Object.entries(jobs)) {
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    const runsModel = steps.some((s) => typeof s?.uses === "string" && MODEL_ACTION.test(s.uses));
    if (runsModel && FLOW_PAT.test(JSON.stringify(job))) out.push(name);
  }
  return out;
}

// Violations: the offending jobs, but only while the config arms auto-fix.
export function boundaryViolations(workflowText, configText) {
  const { cap } = effectiveCap(parseAutoFixRounds(configText));
  return cap === 0 ? [] : modelJobsHoldingPat(workflowText);
}

const WORKFLOW = readFileSync(REUSABLE, "utf8");
const armed = (n) => `review:\n  auto_fix_rounds: ${n}\n`;

test("canonical keeps auto-fix off while a model job references FLOW_PAT", { skip }, () => {
  const v = boundaryViolations(WORKFLOW, readFileSync(CONFIG, "utf8"));
  assert.deepEqual(v, [],
    `review.auto_fix_rounds is armed in canonical's .flow/config.yml, but these jobs in ` +
    `_flow-kickback.yml run a model AND reference secrets.FLOW_PAT: ${v.join(", ")}. A model step ` +
    "can reach a secret held by any later step of its job (hooks, $GITHUB_ENV, $GITHUB_PATH). Set " +
    "auto_fix_rounds to 0, or move the FLOW_PAT steps into a job that runs no model (flow-0135).");
});

test("flow-0135: canonical is re-armed at 2, and the kickback plan dispatches on that cap", () => {
  const raw = parseAutoFixRounds(readFileSync(CONFIG, "utf8"));
  assert.equal(raw, "2");
  assert.equal(effectiveCap(raw).cap, 2);
  // The facts of a real kickback: a red qa check on an in_review task's PR, with FLOW_PAT set.
  const d = decide({ flowAi: "true", configuredCap: raw, rounds: 0, flowPat: "true", fork: "false",
    taskId: "flow-0135", taskStatus: "in_review", draft: "false", labels: "", failedChecks: "qa" });
  assert.notEqual(d.action, SKIP, d.reason);
  assert.match(d.reason, /dispatching auto-fix round 1\/2/);
});

test("flow-0135: the split layout passes armed; the pre-split layout (push steps back in `fix`) is reported", { skip }, () => {
  assert.deepEqual(modelJobsHoldingPat(WORKFLOW), []);
  assert.deepEqual(boundaryViolations(WORKFLOW, armed(2)), [],
    "the job split is what lets canonical arm auto-fix at all");
  // Mutation: fold `push` back into `fix` — the layout flow-0134 disarmed for.
  const wf = yamlMod.parse(WORKFLOW);
  wf.jobs.fix.steps = [...wf.jobs.fix.steps, ...wf.jobs.push.steps];
  delete wf.jobs.push;
  const before = yamlMod.stringify(wf);
  assert.deepEqual(boundaryViolations(before, armed(2)), ["fix"]);
  assert.deepEqual(boundaryViolations(before, armed(0)), []);
  assert.deepEqual(boundaryViolations(before, "review:\n  model: opus\n"), [], "absent key = off");
});

test("flow-0134 criterion 3: a layout whose model jobs never reference FLOW_PAT passes, armed or not", { skip }, () => {
  const split = `
on: workflow_call
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@0000000000000000000000000000000000000000
        with: { github_token: "\${{ github.token }}" }
  push:
    needs: fix
    runs-on: ubuntu-latest
    steps:
      - run: git push
        env: { FLOW_PAT: "\${{ secrets.FLOW_PAT }}" }
`;
  assert.deepEqual(modelJobsHoldingPat(split), []);
  assert.deepEqual(boundaryViolations(split, armed(2)), []);
  // …and the same model job gaining FLOW_PAT at job level is reported.
  const leaky = split.replace("  fix:\n    runs-on: ubuntu-latest\n",
    "  fix:\n    runs-on: ubuntu-latest\n    env: { GH_TOKEN: \"${{ secrets.FLOW_PAT }}\" }\n");
  assert.deepEqual(boundaryViolations(leaky, armed(2)), ["fix"]);
});
