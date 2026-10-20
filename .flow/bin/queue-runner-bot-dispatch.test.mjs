// queue-runner-bot-dispatch.test.mjs — proving tests for flow-0152.
//
// _flow-unblock.yml dispatches the queue runner with GITHUB_TOKEN, so that run's actor is
// github-actions[bot]. claude-code-action refuses a bot-initiated run unless the bot is in
// `allowed_bots`. These tests pin the worker step to exactly that one bot, keep `*` out of the
// runner (the worker writes code; the reviewers only read), and leave _flow-review.yml unchanged.
//
// Same dependency note as queue-runner-switch.test.mjs: without `npm ci` there is no `yaml`, and
// the parsing tests skip visibly in the flow-tooling job and run for real in the gate job.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { changelogEntry } from "./changelog-entry.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const load = (rel) => (yamlMod ? yamlMod.parse(readFileSync(join(REPO, rel), "utf8")) : { jobs: {} });
const runner = load(".github/workflows/_flow-queue-runner.yml");
const review = load(".github/workflows/_flow-review.yml");
const steps = (wf) => Object.values(wf.jobs ?? {}).flatMap((j) => j.steps ?? []);

test("the worker step allows exactly github-actions[bot]", { skip }, () => {
  const worker = steps(runner).find((s) => s.name === "Work the task (fresh worker session)");
  assert.ok(worker, "worker step not found by name");
  assert.equal(worker.with?.allowed_bots, "github-actions[bot]");
});

test("no step in the queue runner allows every bot", { skip }, () => {
  for (const s of steps(runner)) {
    assert.notEqual(s.with?.allowed_bots, "*", `step "${s.name}" allows every bot`);
  }
});

test("_flow-review.yml keeps allowed_bots: \"*\" on every reviewer", { skip }, () => {
  const values = steps(review).map((s) => s.with?.allowed_bots).filter((v) => v !== undefined);
  assert.ok(values.length >= 1, "no allowed_bots found in _flow-review.yml");
  for (const v of values) assert.equal(v, "*");
});

test("changes/flow-0152.md states no caller action", () => {
  const entry = changelogEntry(REPO, "flow-0152");
  assert.match(entry, /flow-0152/);
  assert.match(entry, /No caller action/);
});
