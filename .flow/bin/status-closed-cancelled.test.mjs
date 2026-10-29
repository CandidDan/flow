// status-closed-cancelled.test.mjs — proving tests for flow-0176.
//
// `cancelled` is terminal and only a human reverses it. The orchestrator cancels a task on `main`
// and then closes its PR unmerged, and `_flow-status.yml` used to answer that close by writing the
// task back to `ready` (owner, branch, pr cleared) and raising its model a tier — flow-0171,
// 2026-10-28, commit 5e38216. Both steps now ask `status-transition.mjs closed` first.
//
// As in draft-pr-lifecycle.test.mjs, these EXTRACT the workflow's own shell and RUN it against a
// scratch repo holding the template's real helpers, then read the task file back. A grep of the
// YAML would pass on a comment; these fail if the guard is removed.

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { closedUnmerged, main, readStatus, canonicalFlowDir } from "./status-transition.mjs";

// DEPENDENCY NOTE — see check-workflows.test.mjs: reading the workflow needs `yaml`, which the
// flow-tooling job does not install. Those tests skip visibly there and run in the per-stack job.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE_BIN = join(REPO, "project-template", ".flow", "bin");
const STATUS_YML = join(REPO, ".github", "workflows", "_flow-status.yml");

const stepNamed = (name) => {
  const s = yamlMod.parse(readFileSync(STATUS_YML, "utf8")).jobs["sync-status"].steps.find((x) => x.name === name);
  assert.ok(s, `no step named ${JSON.stringify(name)} in _flow-status.yml`);
  return s;
};
const TRANSITION_STEP = "Sync task state from the PR event";
const ESCALATE_STEP = "Escalate the model of a task whose PR closed unmerged";

const ID = "flow-0171";
const EVENT = {
  HEAD_REF: "flow/flow-0171-some-runbook",
  PR_TITLE: "[flow-0171] Some runbook",
  PR_URL: "https://github.com/example/repo/pull/252",
  PR_NUM: "252",
  ACTION: "closed",
  MERGED: "false",
  DRAFT: "false",
};

function taskText(status) {
  return [
    "---",
    `id: "${ID}"`,
    `status: "${status}"`,
    'owner: "worker-flow-0171"',
    `branch: "${EVENT.HEAD_REF}"`,
    `pr: "${EVENT.PR_URL}"`,
    'cancelled_reason: "duplicate of the flow-0172 runbook"',
    'model: "sonnet"',
    'effort: "medium"',
    'model_reason: "well-specified"',
    "---",
    "",
    "## Context",
    "",
  ].join("\n");
}

// A scratch repo laid out like an adopter: the template's real helpers in `.flow/bin/`, one task.
function scratchRepo(status) {
  const dir = mkdtempSync(join(tmpdir(), "flow-0176-"));
  const bin = join(dir, ".flow", "bin");
  mkdirSync(join(dir, ".flow", "tasks"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  for (const f of ["status-transition.mjs", "apply-board-edits.mjs", "task-model.mjs", "asks.mjs", "parse-task-id.mjs"]) {
    copyFileSync(join(TEMPLATE_BIN, f), join(bin, f));
  }
  const file = join(dir, ".flow", "tasks", "flow-0171-some-runbook.md");
  writeFileSync(file, taskText(status));
  return { dir, file };
}

const field = (md, f) => (md.slice(0, md.indexOf("\n---", 3)).match(new RegExp(`^${f}:\\s*(.*)$`, "m")) || [])[1];

// The transition step from its first line through the in-step model escalation — everything that
// decides and writes, short of the commit and push.
function runTransition(dir) {
  const lines = stepNamed(TRANSITION_STEP).run.split("\n");
  const start = lines.findIndex((l) => /^\s*id=""\s*$/.test(l));
  const warn = lines.findIndex((l) => /went back to ready but its model was NOT escalated/.test(l));
  assert.ok(start !== -1 && warn !== -1, "could not find the transition block in _flow-status.yml");
  const block = lines.slice(start, warn + 2).join("\n");
  return execFileSync("bash", ["-e", "-c", block], { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, ...EVENT } });
}

// ── the decision ─────────────────────────────────────────────────────────────────────────────

test("a cancelled task's closed-unmerged decision is `leave`, with no edit at all", () => {
  const d = closedUnmerged({ id: ID, status: "cancelled", eventPr: "252" });
  assert.equal(d.verdict, "leave");
  assert.deepEqual(d.updates, []);
  assert.match(d.line, /flow-0171 is cancelled — left unchanged/);
});

for (const status of ["in_progress", "in_review"]) {
  test(`an ${status} task's closed-unmerged decision is still the reset to ready`, () => {
    const d = closedUnmerged({ id: ID, status, eventPr: "252" });
    assert.equal(d.verdict, "ready");
    assert.deepEqual(d.updates, [{ id: ID, status: "ready", owner: "", branch: "", pr: "" }]);
  });
}

test("canonical's adapter reads canonical's store, not the template's fixtures", () => {
  assert.equal(canonicalFlowDir(), resolve(BIN, ".."));
  const r = main(["status", "--id", "flow-0176"], { tasksDir: join(canonicalFlowDir(), "tasks") });
  assert.equal(r.code, 0);
  assert.ok(readStatus(`---\nstatus: "${r.stdout.trim()}"\n---\n`), "flow-0176 must be found in canonical's store");
});

test("the adapter's CLI runs (exit 3 + leave-alone line for a cancelled task)", () => {
  const { dir } = scratchRepo("cancelled");
  try {
    const r = spawnSync(process.execPath, [join(dir, ".flow", "bin", "status-transition.mjs"), "closed", "--id", ID, "--event-pr", "252"],
      { encoding: "utf8" });
    assert.equal(r.status, 3);
    assert.match(r.stdout, /PR #252 closed unmerged: flow-0171 is cancelled/);
    const a = spawnSync(process.execPath, [join(BIN, "status-transition.mjs"), "status", "--id", "flow-0176"], { encoding: "utf8" });
    assert.equal(a.status, 0);
    assert.match(a.stdout, /^[a-z_]+\n$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── the transition step, executed ────────────────────────────────────────────────────────────

test("a cancelled task's PR closing unmerged leaves the task file byte-for-byte unchanged", { skip }, () => {
  const { dir, file } = scratchRepo("cancelled");
  try {
    const before = readFileSync(file, "utf8");
    const out = runTransition(dir);
    assert.match(out, /flow-0171 is cancelled — left unchanged/);
    assert.equal(readFileSync(file, "utf8"), before, "no status, owner, branch, pr or model edit");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const status of ["in_progress", "in_review"]) {
  test(`an ${status} task's PR closing unmerged still resets it to ready and escalates one tier`, { skip }, () => {
    const { dir, file } = scratchRepo(status);
    try {
      const out = runTransition(dir);
      assert.match(out, /closed unmerged -> flow-0171 back to ready/);
      const md = readFileSync(file, "utf8");
      assert.equal(field(md, "status"), '"ready"');
      assert.equal(field(md, "owner"), '""');
      assert.equal(field(md, "branch"), '""');
      assert.equal(field(md, "pr"), '""');
      assert.equal(field(md, "model"), '"opus"', "sonnet -> opus, one tier");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

// ── the escalate step, executed against a real origin ────────────────────────────────────────

function gitRepoWithOrigin(status) {
  const { dir, file } = scratchRepo(status);
  const origin = mkdtempSync(join(tmpdir(), "flow-0176-origin-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  git("init", "-q", "-b", "main");
  git("config", "user.name", "t"); git("config", "user.email", "t@example.com");
  git("add", "."); git("commit", "-q", "-m", "seed");
  git("remote", "add", "origin", origin); git("push", "-q", "origin", "main");
  const mainFile = () => execFileSync("git", ["--git-dir", origin, "show", "main:.flow/tasks/flow-0171-some-runbook.md"], { encoding: "utf8" });
  return { dir, file, origin, mainFile, cleanup: () => { rmSync(dir, { recursive: true, force: true }); rmSync(origin, { recursive: true, force: true }); } };
}

const runEscalate = (dir) => execFileSync("bash", ["-e", "-c", stepNamed(ESCALATE_STEP).run],
  { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, ...EVENT } });

test("the escalate step does not raise a cancelled task's model", { skip }, () => {
  const r = gitRepoWithOrigin("cancelled");
  try {
    const before = r.mainFile();
    const out = runEscalate(r.dir);
    assert.match(out, /flow-0171 is cancelled — left unchanged/);
    assert.equal(r.mainFile(), before);
    assert.equal(field(r.mainFile(), "model"), '"sonnet"');
  } finally { r.cleanup(); }
});

test("the escalate step still raises an in_review task's model one tier", { skip }, () => {
  const r = gitRepoWithOrigin("in_review");
  try {
    runEscalate(r.dir);
    assert.equal(field(r.mainFile(), "model"), '"opus"');
  } finally { r.cleanup(); }
});

// ── the workflow calls the shared decision ───────────────────────────────────────────────────

test("both the closed transition and the escalate step call status-transition.mjs closed", { skip }, () => {
  const run = stepNamed(TRANSITION_STEP).run;
  const from = run.search(/^\s*closed\)\s*$/m);
  assert.notEqual(from, -1, "no `closed)` branch in the transition step");
  const closed = run.slice(from, run.search(/^\s*esac\s*$/m));
  const call = closed.search(/node \.flow\/bin\/status-transition\.mjs closed/);
  const reset = closed.search(/"status":"ready"/);
  assert.notEqual(call, -1, "the closed branch must ask status-transition.mjs");
  assert.ok(reset > call && /else\s*\n[^\n]*\n\s*printf '\{"updates":\[\{"id":"%s","status":"ready"/.test(closed.slice(call)),
    "the inline ready edit may only remain as the fallback for a repo without the helper");
  assert.match(stepNamed(ESCALATE_STEP).run, /node \.flow\/bin\/status-transition\.mjs closed[^\n]*\|\| rc=\$\?\n\s*if \[ "\$rc" = "3" \]; then exit 0; fi/);
});
