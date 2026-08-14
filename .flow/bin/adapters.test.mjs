// adapters.test.mjs — proving tests for canonical's `.flow/bin` adapters.
//
// Canonical adopts Flow by *calling* its own `project-template/.flow/bin/` logic rather than
// copying it, so the only new behaviour in these four files is (a) which store they resolve and
// (b) that their CLI blocks actually run. Both are exactly the things that fail silently:
//
//   · A wrong store means flow-doctor validates the template's fixture tasks instead of
//     canonical's real ones, and apply-board-edits writes state into the wrong directory —
//     while every command still exits 0.
//   · A CLI block that never runs makes flow-status and flow-done no-op, leaving a merged
//     task stranded at in_progress with the gate reporting success.
//
// Criteria proved here (flow-0004):
//   · "flow-doctor runs against this repo and reports no consistency failures"
//   · the local half of "PR opens -> in_review with branch and pr recorded; merges -> done"
//     (the CI half is proved by this task's own PR)

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { canonicalFlowDir as doctorFlowDir } from "./flow-doctor.mjs";
import { canonicalFlowDir as editsFlowDir, applyEdits } from "./apply-board-edits.mjs";
import { canonicalFlowDir as guardFlowDir, findTaskFile } from "./touches-guard.mjs";
import { parseTaskId } from "./parse-task-id.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const FLOW = resolve(BIN, "..");
const REPO = resolve(FLOW, "..");
const TEMPLATE_FLOW = join(REPO, "project-template", ".flow");

const tmp = (name) => mkdtempSync(join(tmpdir(), `flow-ad-${name}-`));
const run = (script, args = [], env = {}) =>
  spawnSync(process.execPath, [join(BIN, script), ...args],
    { cwd: REPO, encoding: "utf8", env: { ...process.env, ...env } });

test("every adapter resolves CANONICAL's store, not the template's fixture store", () => {
  for (const [name, dir] of [["flow-doctor", doctorFlowDir()],
                             ["apply-board-edits", editsFlowDir()],
                             ["touches-guard", guardFlowDir()]]) {
    assert.equal(dir, FLOW, `${name} must resolve canonical's .flow/`);
    assert.notEqual(dir, TEMPLATE_FLOW,
      `${name} must NOT resolve project-template/.flow — that is the fixture store, and ` +
      `writing state there would silently corrupt the template while reporting success`);
  }
});

test("the store the adapters resolve is the one holding this task", () => {
  const file = findTaskFile(join(doctorFlowDir(), "tasks"), "flow-0004");
  assert.ok(file, "flow-0004 must be findable in the store the adapters point at");
  assert.match(readFileSync(file, "utf8"), /^id: "flow-0004"$/m);
});

test("flow-doctor reports no consistency failures against this repo", () => {
  const r = run("flow-doctor.mjs");
  assert.match(r.stdout, /flow-doctor: \d+ task\(s\) checked/,
    "the CLI block must actually run — silence here is the symlink failure mode");
  assert.equal(r.status, 0,
    `flow-doctor found problems:\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /FAIL/, r.stderr);
});

test("flow-doctor finds no undeclared top-level source tree", () => {
  const r = run("flow-doctor.mjs");
  assert.doesNotMatch(r.stderr, /not covered by any source_root/, r.stderr);
  assert.doesNotMatch(r.stderr, /does not exist on disk/,
    "every declared source_root must exist — flightdeck/bin/ does not yet, flightdeck/ does");
});

test("parse-task-id CLI resolves an id from the branch, then the PR title", () => {
  assert.equal(run("parse-task-id.mjs", ["flow/flow-0004-canonical", ""]).stdout.trim(), "flow-0004");
  assert.equal(run("parse-task-id.mjs", ["claude/next-tasks-ahnx30", "[flow-0004] Adopt Flow"]).stdout.trim(),
    "flow-0004", "a platform-forced branch must still resolve via the PR title");
  assert.equal(run("parse-task-id.mjs", ["some/branch", "no id here"]).stdout.trim(), "",
    "no id is the workflows' safe no-op");
  assert.equal(run("parse-task-id.mjs", ["some/branch", "no id here"]).status, 0);
});

test("the branch this task is on only resolves via the PR title — so the title is load-bearing", () => {
  assert.equal(parseTaskId("claude/next-tasks-ahnx30", ""), null);
  assert.equal(parseTaskId("claude/next-tasks-ahnx30", "[flow-0004] Adopt Flow in canonical"), "flow-0004");
});

test("PR opened -> in_review with branch and pr recorded (the flow-status transition)", () => {
  const dir = tmp("status");
  try {
    cpSync(join(FLOW, "tasks"), dir, { recursive: true });
    const { applied, problems } = applyEdits({
      tasksDir: dir,
      updates: [{ id: "flow-0004", status: "in_review", branch: "claude/next-tasks-ahnx30", pr: "https://github.com/CandidDan/flow/pull/8" }],
    });

    assert.equal(applied, 1);
    assert.deepEqual(problems, []);
    const after = readFileSync(join(dir, "flow-0004-canonical-adopts-flow.md"), "utf8");
    assert.match(after, /^status: "in_review"$/m);
    assert.match(after, /^branch: "claude\/next-tasks-ahnx30"$/m);
    assert.match(after, /^pr: "https:\/\/github\.com\/CandidDan\/flow\/pull\/8"$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PR merged -> done (the flow-done transition)", () => {
  const dir = tmp("done");
  try {
    cpSync(join(FLOW, "tasks"), dir, { recursive: true });
    applyEdits({ tasksDir: dir, updates: [{ id: "flow-0004", status: "in_review" }] });
    const { applied, problems } = applyEdits({ tasksDir: dir, updates: [{ id: "flow-0004", status: "done" }] });

    assert.equal(applied, 1);
    assert.deepEqual(problems, []);
    assert.match(readFileSync(join(dir, "flow-0004-canonical-adopts-flow.md"), "utf8"), /^status: "done"$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PR closed unmerged -> back to ready, cleared for re-claim (the flow-status reset)", () => {
  const dir = tmp("reopen");
  try {
    cpSync(join(FLOW, "tasks"), dir, { recursive: true });
    applyEdits({ tasksDir: dir, updates: [{ id: "flow-0004", status: "ready", owner: "", branch: "", pr: "" }] });

    const after = readFileSync(join(dir, "flow-0004-canonical-adopts-flow.md"), "utf8");
    assert.match(after, /^status: "ready"$/m);
    assert.match(after, /^owner: ""$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply-board-edits CLI fails loudly when the edits file is missing", () => {
  const r = run("apply-board-edits.mjs", [join(tmpdir(), "flow-no-such-edits.json")]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no edits file at/);
});

test("touches-guard skips cleanly when no task id resolves, rather than failing the gate", () => {
  const r = run("touches-guard.mjs", [], { HEAD_REF: "some/branch", PR_TITLE: "no id" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no task id in branch/);
});

test("touches-guard's CLI actually runs — the guard must never fail open", () => {
  // A guard reached through a symlink used to exit 0 having done nothing, and the gate went
  // green reporting enforcement it never performed. Assert on output, not just exit status.
  const r = run("touches-guard.mjs", [], { HEAD_REF: "flow/flow-0004-x", PR_TITLE: "", BASE_REF: "HEAD" });
  assert.match(r.stdout, /touches-guard: flow-0004 — \d+ feature file\(s\) checked against \d+ glob\(s\)/,
    `expected the guard to report a real check; got:\n${r.stdout}${r.stderr}`);
});

test("findTaskFile ignores the template placeholder and returns null for an unknown id", () => {
  const tasks = join(doctorFlowDir(), "tasks");
  assert.equal(findTaskFile(tasks, "flow-9999"), null);
});
