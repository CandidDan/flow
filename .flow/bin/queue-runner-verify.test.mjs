// Tests for canonical's queue-runner-verify adapter and the workflow step that invokes it.
//
// Criteria proved here (flow-0025):
//   · the adapter resolves canonical's own store and remote, not the template's fixture store
//     (the same assertion adapters.test.mjs makes for its siblings)
//   · a checkout with no `.flow/bin/queue-runner-verify.mjs` -> the step no-ops with a message
//     rather than failing the job (the bootstrap guard, executed for real against a bare dir)
//   · `_flow-queue-runner.yml`, parsed the way GitHub parses it, carries the new step in the
//     `dispatch` job, not gated on `if: failure()`, gated on `steps.pick.outputs.task_id != ''`
// The pure decision function's behaviour is proved in
// `project-template/.flow/bin/queue-runner-verify.test.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalRepoRoot, canonicalTasksDir, readTaskState } from "./queue-runner-verify.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const FLOW = resolve(BIN, "..");
const REPO = resolve(FLOW, "..");
const TEMPLATE_TASKS = join(REPO, "project-template", ".flow", "tasks");

// DEPENDENCY NOTE — same as adapters.test.mjs: the structural workflow assertions need the
// `yaml` package, absent in the no-install `flow-tooling` job; they run for real in the
// per-stack gate job.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

// ── the adapter resolves CANONICAL's store, not the template's fixture store ──

test("canonicalTasksDir is canonical's .flow/tasks, never project-template's", () => {
  assert.equal(canonicalRepoRoot(), REPO);
  assert.equal(canonicalTasksDir(), join(FLOW, "tasks"));
  assert.notEqual(canonicalTasksDir(), TEMPLATE_TASKS,
    "resolving the fixture store would judge the wrong tree while still printing a verdict");
});

test("the store the adapter resolves is the one holding this task; the fixture store is not", () => {
  assert.equal(readTaskState(canonicalTasksDir(), "flow-0025").found, true,
    "flow-0025 must be findable in the store the adapter points at");
  assert.equal(readTaskState(TEMPLATE_TASKS, "flow-0025").found, false,
    "the template's fixture store must NOT hold canonical's tasks — if this fails, the " +
    "adapter and a symlinked copy have become indistinguishable and the test proves nothing");
});

// ── the adapter's CLI block actually runs (the symlink failure mode fails open) ──

const cli = (args) =>
  spawnSync(process.execPath, [join(BIN, "queue-runner-verify.mjs"), ...args],
    { cwd: REPO, encoding: "utf8" });

test("adapter CLI exits 0 on a pushed branch, with output proving the block ran", () => {
  const r = cli(["--task-id", "flow-0025", "--branch-exists", "1", "--ahead", "1", "--has-open-pr", "0"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /OK/, "silence here is the symlink failure mode — the job would go green unchecked");
});

test("adapter CLI exits 1 for a task with no outcome, naming it and the three checks", () => {
  // A deliberately nonexistent id: its verdict cannot drift as real tasks change status.
  const r = cli(["--task-id", "flow-9999", "--branch-exists", "0", "--ahead", "0", "--has-open-pr", "0"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /flow-9999/);
  assert.match(r.stderr, /branch on origin ahead of main/);
  assert.match(r.stderr, /open PR/);
  assert.match(r.stderr, /blocked_reason/);
  assert.match(r.stderr, /task file not found on main/);
});

// ── the workflow step: structure, gating, and the bootstrap guard ──

const WF = join(REPO, ".github", "workflows", "_flow-queue-runner.yml");
const wfSrc = () => readFileSync(WF, "utf8");
const verifyStep = () => {
  const steps = yamlMod.parse(wfSrc()).jobs.dispatch.steps;
  return { steps, step: steps.find((s) => /queue-runner-verify\.mjs/.test(s.run || "")) };
};

test("the verify step exists in the dispatch job, after the worker step", { skip }, () => {
  const { steps, step } = verifyStep();
  assert.ok(step, "a step in jobs.dispatch must invoke .flow/bin/queue-runner-verify.mjs");
  const workIdx = steps.findIndex((s) => s.id === "work");
  assert.ok(workIdx >= 0, "the worker step ('work') must exist");
  assert.ok(steps.indexOf(step) > workIdx, "verification must run after the worker");
});

test("the verify step is not gated on failure() and IS gated on a task having been picked", { skip }, () => {
  const { step } = verifyStep();
  const cond = String(step.if || "");
  assert.doesNotMatch(cond, /failure\(\)/,
    "gating on failure() would miss the exact case this exists for: a worker that exits 0 having done nothing");
  assert.match(cond, /steps\.pick\.outputs\.task_id\s*!=\s*''/,
    "with no task picked there is nothing to verify — the step must not fail an idle run");
});

test("the verify step reads the store from origin/main, not the worker-mutated worktree", { skip }, () => {
  const { step } = verifyStep();
  assert.match(step.run, /git fetch -q origin main/);
  assert.match(step.run, /git checkout -q origin\/main -- \.flow\/tasks\//);
});

test("a checkout without the helper no-ops with a message instead of failing", { skip }, () => {
  const { step } = verifyStep();
  assert.match(step.run, /if \[ ! -f \.flow\/bin\/queue-runner-verify\.mjs \]/,
    "the bootstrap guard must key off the helper's presence in the CONSUMING repo's checkout");
  // Execute the step's script in a bare directory — a repo that has not synced the helper.
  // The guard must exit 0 with its message before any git/gh/node invocation is reached.
  const dir = mkdtempSync(join(tmpdir(), "qrv-bootstrap-"));
  try {
    const script = join(dir, "step.sh");
    writeFileSync(script, step.run);
    const r = spawnSync("bash", [script], { cwd: dir, encoding: "utf8", env: { ...process.env, TASK_ID: "x-1" } });
    assert.equal(r.status, 0, `the guard must no-op, not fail:\n${r.stderr}`);
    assert.match(r.stdout, /No \.flow\/bin\/queue-runner-verify\.mjs in this repo yet/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
