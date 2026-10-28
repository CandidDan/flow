// unblock-no-dispatch.test.mjs — proving tests for flow-0173 and flow-0174.
//
// flow-unblock releases blocked tasks and stops there. It used to dispatch flow-queue-runner after
// a release; the queue-runner is retired (flow-0174), and the worker routine's own schedule picks
// up what the sweep releases. These tests fail if a dispatch grows back, if the declared
// `queue_runner_workflow` input is removed (that would fail every caller still passing it), if the
// protocol goes back to saying flow-unblock starts the next worker, or (flow-0174) if the
// dispatch-only helpers or the `actions: write` grant that served them come back.
//
// Dependency note: without `npm ci` there is no `yaml`, and the parsing tests skip visibly in the
// flow-tooling job and run for real in the gate job.

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

// ── flow-0174: the dispatch-only remains are gone ─────────────────────────────────────────

const HELPER = join(REPO, "project-template", ".flow", "bin", "flow-unblock.mjs");
const CALLERS = [
  join(REPO, ".github", "workflows", "flow-unblock.yml"),
  join(REPO, "project-template", ".github", "workflows", "flow-unblock.yml"),
];
const DISPATCH_ONLY = ["count-ready", "count-active-runs", "should-dispatch", "dispatch-outcome"];
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** The dispatch-only names a module's exports or CLI source still carry. Pure, so a mutated input proves it can fail. */
export const dispatchRemnants = (exportNames, source) => [
  ...DISPATCH_ONLY.filter((n) => exportNames.includes(camel(n))).map((n) => `export ${camel(n)}`),
  ...DISPATCH_ONLY.filter((n) => new RegExp(`["'\`]${n}["'\`]`).test(source)).map((n) => `subcommand ${n}`),
];

test("flow-unblock.mjs exports none of the four dispatch-only functions or subcommands", async () => {
  const mod = await import(HELPER);
  const names = Object.keys(mod);
  assert.ok(names.length > 0, "the helper exports nothing — the check would pass vacuously");
  assert.deepEqual(dispatchRemnants(names, readFileSync(HELPER, "utf8")), []);
  // …and the adapter re-exports none either.
  const adapter = await import(join(BIN, "flow-unblock.mjs"));
  assert.deepEqual(dispatchRemnants(Object.keys(adapter), ""), []);
});

test("the remnant check catches each name, as an export or a subcommand", () => {
  assert.deepEqual(dispatchRemnants(["shouldDispatch"], ""), ["export shouldDispatch"]);
  assert.deepEqual(dispatchRemnants([], 'if (cmd === "count-ready")'), ["subcommand count-ready"]);
});

test("neither flow-unblock.yml caller requests actions: write, and the reusable does not either", { skip }, () => {
  for (const f of CALLERS) {
    const wf = yamlMod.parse(readFileSync(f, "utf8"));
    const jobs = Object.values(wf.jobs ?? {});
    assert.ok(jobs.length > 0, `${f}: no jobs parsed`);
    for (const j of jobs) assert.equal(j.permissions?.actions, undefined, `${f} still grants actions`);
    assert.equal(wf.permissions?.actions, undefined, `${f} still grants actions at the top level`);
  }
  // A caller's grant is a ceiling: a reusable that kept requesting it would fail every v4 caller at startup.
  assert.equal(yamlMod.parse(src).permissions?.actions, undefined, "_flow-unblock.yml must not request actions");
});
