// Tests for canonical's queue-runner-verify adapter and the workflow step that invokes it.
//
// Criteria proved here (flow-0025):
//   · the adapter resolves canonical's own store and remote, not the template's fixture store
//     (the same assertion adapters.test.mjs makes for its siblings)
//   · a checkout with no `.flow/bin/queue-runner-verify.mjs` -> the step no-ops with a message
//     rather than failing the job (the bootstrap guard, executed for real against a bare dir)
//   · `_flow-queue-runner.yml`, parsed the way GitHub parses it, carries the new step in the
//     `dispatch` job, not gated on `if: failure()`, gated on `steps.pick.outputs.task_id != ''`
// Criteria proved here (flow-0049):
//   · the verify step carries an `id:` and publishes its facts to `$GITHUB_OUTPUT` BEFORE the
//     verifier that may fail the job; the explain step reads them from that step
//   · a checkout with no helper publishes no outputs and the explain step still renders the
//     generic two-branch text without erroring (executed for real against a bare dir)
//   · the adapter re-exports the renderer — function identity, not a second copy of the text
// The pure decision and renderer behaviour are proved in
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
  // Two steps invoke the helper since flow-0049; the verifier is the one that judges rather
  // than renders. Without excluding `--mode explain`, reordering the steps would silently point
  // every assertion below at the wrong one.
  const isVerify = (s) =>
    /queue-runner-verify\.mjs/.test(s.run || "") && !/--mode explain/.test(s.run || "");
  return { steps, step: steps.find(isVerify) };
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

// ── flow-0049: the adapter re-exports the renderer, and the workflow carries the facts ──

test("the adapter re-exports the template's renderer rather than duplicating it", async () => {
  // Function identity, not behavioural equivalence: two copies that happen to agree today is
  // exactly the drift the adapter shape exists to prevent (the assertion adapters.test.mjs
  // makes for its siblings, in the form this file's single re-export allows).
  const template = await import(
    new URL("../../project-template/.flow/bin/queue-runner-verify.mjs", import.meta.url).href);
  const adapter = await import("./queue-runner-verify.mjs");
  for (const name of ["renderClaimNotice", "explainArgsFromFlags", "runCli", "verifyOutcome"]) {
    assert.equal(typeof adapter[name], "function", `the adapter must expose ${name}`);
    assert.equal(adapter[name], template[name],
      `${name} must BE the template's function — a copy would let canonical's notice drift ` +
      `from the one every adopting repo renders`);
  }
});

test("adapter CLI --mode explain renders the outcome it was handed, and exits 0", () => {
  const r = cli(["--mode", "explain", "--task-id", "flow-0049", "--branch", "flow/flow-0049-x",
                 "--branch-exists", "1", "--ahead", "2", "--has-open-pr", "1"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pull request is open/);
  assert.doesNotMatch(r.stdout, /No PR (was|is) open/i);
});

const explainStep = () =>
  yamlMod.parse(wfSrc()).jobs.dispatch.steps.find((s) => /Explain what happens to the claim/.test(s.name || ""));

test("the verify step carries an id, and the explain step reads that step's outputs", { skip }, () => {
  const { step } = verifyStep();
  assert.ok(step.id, "without an `id:` the facts it derives cannot leave the step");
  const explain = explainStep();
  assert.ok(explain, "the explain step must still exist");
  const env = Object.values(explain.env || {}).join("\n");
  for (const out of ["facts_known", "branch", "branch_exists", "ahead", "has_open_pr"]) {
    assert.match(env, new RegExp(`steps\\.${step.id}\\.outputs\\.${out}`),
      `the notice must read ${out} from the step that derived it, not re-derive or guess it`);
  }
  assert.match(explain.run, /--mode explain/,
    "rendering belongs to the pure function, so the step must call it");
});

test("the verify step writes its outputs BEFORE invoking the verifier", { skip }, () => {
  const { step } = verifyStep();
  const wrote = step.run.indexOf('>> "$GITHUB_OUTPUT"');
  const invoked = step.run.indexOf("node .flow/bin/queue-runner-verify.mjs");
  assert.ok(wrote > 0, "the step must publish the facts it derived");
  assert.ok(invoked > 0, "the step must still invoke the verifier");
  assert.ok(wrote < invoked,
    "the verifier exits non-zero on a wasted run and a run: block stops there — outputs " +
    "written after it would be missing on exactly the failure path that needs them");
});

test("the explain step no-ops to the generic two-branch text when no facts were published", { skip }, () => {
  const explain = explainStep();
  // A repo that has not synced the helper: the verify step's bootstrap guard published nothing,
  // and there is no renderer to call either. Execute the script for real in a bare directory.
  const dir = mkdtempSync(join(tmpdir(), "qrv-explain-"));
  try {
    const script = join(dir, "step.sh");
    const summary = join(dir, "summary.md");
    writeFileSync(script, explain.run);
    const r = spawnSync("bash", [script], {
      cwd: dir, encoding: "utf8",
      // No FACTS_KNOWN/BRANCH/... — precisely what GitHub passes when the step published none.
      env: { ...process.env, TASK_ID: "x-1", GITHUB_STEP_SUMMARY: summary,
             FACTS_KNOWN: "", BRANCH: "", BRANCH_EXISTS: "", AHEAD: "", HAS_OPEN_PR: "" },
    });
    assert.equal(r.status, 0, `the fallback must not error:\n${r.stderr}`);
    const md = readFileSync(summary, "utf8");
    assert.match(md, /Worker run failed for `x-1`/);
    assert.match(md, /branch pushed, ahead of `main`/, "the generic two-branch text is the fallback");
    assert.match(md, /nothing pushed/);
    assert.match(md, /flow-recover/);
    assert.doesNotMatch(md, /No PR (was|is) open/i,
      "with no facts published the step knows nothing about a PR, so it must assert nothing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
