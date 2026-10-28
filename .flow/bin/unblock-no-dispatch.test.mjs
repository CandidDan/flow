// unblock-no-dispatch.test.mjs — proving tests for flow-0173.
//
// flow-unblock releases blocked tasks and stops there. It used to dispatch flow-queue-runner after
// a release; the queue runner is being retired, and the worker routine's own schedule picks up what
// the sweep releases. These tests fail if a dispatch grows back, if the declared
// `queue_runner_workflow` input is removed (that would fail every caller still passing it), or if
// the protocol goes back to saying flow-unblock starts the next worker.
//
// Same dependency note as queue-runner-bot-dispatch.test.mjs: without `npm ci` there is no `yaml`,
// and the parsing tests skip visibly in the flow-tooling job and run for real in the gate job.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const WF = join(REPO, ".github", "workflows", "_flow-unblock.yml");
const src = readFileSync(WF, "utf8");
const code = src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const steps = () => Object.values(yamlMod.parse(src).jobs ?? {}).flatMap((j) => j.steps ?? []);

test("_flow-unblock.yml: no step dispatches a workflow, and none is named \"Start the next worker\"", { skip }, () => {
  const all = steps();
  assert.ok(all.length > 0, "no steps parsed — a check that found nothing is a failure");
  for (const s of all) {
    assert.notEqual(s.name, "Start the next worker", "the dispatch step must stay removed");
    assert.doesNotMatch(String(s.run ?? ""), /actions\/workflows\//, `step "${s.name}" dispatches a workflow`);
    assert.doesNotMatch(String(s.run ?? ""), /\/dispatches\b/, `step "${s.name}" dispatches a workflow`);
  }
  assert.doesNotMatch(code, /actions\/workflows\/[^\s"']*\/dispatches/, "no dispatch call anywhere outside comments");
});

test("_flow-unblock.yml still declares queue_runner_workflow, so a caller that passes it still starts", { skip }, () => {
  const inputs = yamlMod.parse(src).on?.workflow_call?.inputs ?? {};
  assert.ok("queue_runner_workflow" in inputs, "removing a declared input breaks every caller still passing it");
  assert.equal(inputs.queue_runner_workflow.required, false, "it must stay optional");
  assert.match(inputs.queue_runner_workflow.description, /ignored/i, "its description must say it is ignored");
});

test("PROTOCOL.md's blocked_by paragraph no longer says flow-unblock starts the next worker", () => {
  const protocol = readFileSync(join(REPO, "project-template", ".flow", "PROTOCOL.md"), "utf8");
  const para = protocol.slice(protocol.indexOf("**`flow-unblock`**"), protocol.indexOf("- `cancelled`"));
  assert.ok(para.length > 0, "the flow-unblock sentence was not found");
  assert.doesNotMatch(para.replace(/\s+/g, " "), /starts the next worker/);
  assert.match(para.replace(/\s+/g, " "), /picked up by the next worker run/);
});
