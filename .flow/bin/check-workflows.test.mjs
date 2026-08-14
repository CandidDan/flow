// check-workflows.test.mjs — proving tests for canonical's `build` command.
//
// Criteria proved here (flow-0004):
//   · "the build command exits 0 and every file in .github/workflows/ has been parsed"
//   · "a deliberately malformed _flow-gates.yml makes it exit non-zero and name the file"

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_WORKFLOW_DIR, checkWorkflows } from "./check-workflows.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const SCRIPT = join(BIN, "check-workflows.mjs");
const WORKFLOWS = join(REPO, DEFAULT_WORKFLOW_DIR);

const tmp = (name) => mkdtempSync(join(tmpdir(), `flow-cw-${name}-`));
const run = (args, cwd = REPO) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });

test("the repo as-is: every workflow file parses, and the count matches what is on disk", () => {
  const { checked, failures } = checkWorkflows(WORKFLOWS);
  const onDisk = readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n));

  assert.deepEqual(failures, [], "canonical's own workflows must all parse");
  assert.equal(checked.length, onDisk.length,
    "every YAML file in .github/workflows/ must be parsed, not a subset");
  assert.ok(checked.length > 0, "the fixture is meaningless if the directory is empty");
});

test("CLI: the repo as-is exits 0 and reports how many files it parsed", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /check-workflows: \d+ workflow file\(s\) parsed/);
});

test("a malformed _flow-gates.yml fails and names the offending file", () => {
  const dir = tmp("malformed");
  try {
    cpSync(WORKFLOWS, dir, { recursive: true });
    // Unclosed flow mapping — rejected by any YAML loader, and the shape a truncated or
    // badly-merged workflow actually takes.
    writeFileSync(join(dir, "_flow-gates.yml"), "name: broken\non: { push:\njobs:\n  a: [\n");

    const { failures } = checkWorkflows(dir);
    assert.equal(failures.length, 1, "exactly the broken file should fail");
    assert.match(failures[0].file, /_flow-gates\.yml$/);
    assert.ok(failures[0].message.length > 0, "the parse error must be reported, not swallowed");

    const r = run([dir]);
    assert.notEqual(r.status, 0, "a malformed workflow must fail the build");
    assert.match(r.stderr, /_flow-gates\.yml/, "the offending file must be named on stderr");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a valid file alongside a malformed one still parses — only the broken file is blamed", () => {
  const dir = tmp("mixed");
  try {
    writeFileSync(join(dir, "good.yml"), "name: fine\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n");
    writeFileSync(join(dir, "bad.yml"), "name: broken\njobs: [\n");

    const { checked, failures } = checkWorkflows(dir);
    assert.deepEqual(checked.map((f) => f.replace(/.*\//, "")), ["good.yml"]);
    assert.equal(failures.length, 1);
    assert.match(failures[0].file, /bad\.yml$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty workflow directory FAILS — a build that parses nothing must not report success", () => {
  const dir = tmp("empty");
  try {
    const { checked, failures } = checkWorkflows(dir);
    assert.equal(checked.length, 0);
    assert.equal(failures.length, 1);
    assert.match(failures[0].message, /parsed nothing/);

    const r = run([dir]);
    assert.notEqual(r.status, 0, "the silent no-op must be a red gate, not a green one");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing workflow directory fails rather than throwing", () => {
  const base = tmp("missing");
  try {
    const dir = join(base, "does-not-exist");
    const { checked, failures } = checkWorkflows(dir);
    assert.equal(checked.length, 0);
    assert.equal(failures.length, 1);
    assert.match(failures[0].message, /cannot read workflow directory/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("non-YAML files in the directory are ignored, not counted as parsed", () => {
  const dir = tmp("mixedext");
  try {
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "README.md"), "# not a workflow\n");
    writeFileSync(join(dir, "a.yml"), "name: a\non: push\n");
    writeFileSync(join(dir, "b.yaml"), "name: b\non: push\n");

    const { checked, failures } = checkWorkflows(dir);
    assert.deepEqual(failures, []);
    assert.equal(checked.length, 2, ".yml and .yaml count; .md does not");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
