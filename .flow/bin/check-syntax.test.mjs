// check-syntax.test.mjs — proving tests for canonical's `lint` command.
//
// Criterion proved here (flow-0004):
//   · "a deliberately broken .mjs helper makes the lint command exit non-zero and name the file"

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { checkSyntax, trackedMjs } from "./check-syntax.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const SCRIPT = join(BIN, "check-syntax.mjs");

const tmp = (name) => mkdtempSync(join(tmpdir(), `flow-cs-${name}-`));
const run = (args, cwd = REPO) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });

test("the repo as-is: every tracked .mjs parses", () => {
  const files = trackedMjs(REPO);
  assert.ok(files.length > 0, "git must report tracked .mjs files — an empty list proves nothing");

  const { checked, failures } = checkSyntax(files, { cwd: REPO });
  assert.deepEqual(failures, [], "canonical's own helpers must all parse");
  assert.equal(checked.length, files.length);
});

test("CLI: the repo as-is exits 0 and reports how many files it parsed", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /check-syntax: \d+ \.mjs file\(s\) parsed/);
});

test("a broken .mjs fails and names the offending file", () => {
  const dir = tmp("broken");
  try {
    const bad = join(dir, "flow-doctor.mjs");
    writeFileSync(bad, "export function busted( {\n  return 1\n");          // unbalanced
    const good = join(dir, "fine.mjs");
    writeFileSync(good, "export const ok = 1;\n");

    const { checked, failures } = checkSyntax([good, bad]);
    assert.deepEqual(checked, [good], "the valid file must still be reported as checked");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].file, bad);
    assert.match(failures[0].message, /Error/, "the parser's own message must survive");

    const r = run([good, bad]);
    assert.notEqual(r.status, 0, "a broken helper must fail the lint");
    assert.match(r.stderr, /flow-doctor\.mjs/, "the offending file must be named on stderr");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ESM-only syntax is accepted — the check must use the module parse goal, not script", () => {
  const dir = tmp("esm");
  try {
    // `import.meta` and top-level await are syntax errors under the script goal. A checker that
    // silently parsed .mjs as a script would reject every helper in this repo.
    const f = join(dir, "esm.mjs");
    writeFileSync(f, "const u = import.meta.url;\nawait Promise.resolve(u);\nexport default u;\n");

    const { failures } = checkSyntax([f]);
    assert.deepEqual(failures, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty file list FAILS — a lint that checks nothing must not report success", () => {
  const { checked, failures } = checkSyntax([]);
  assert.equal(checked.length, 0);
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /parsed nothing/);
});

test("trackedMjs returns [] outside a git work tree rather than throwing", () => {
  const dir = tmp("nogit");
  try {
    assert.deepEqual(trackedMjs(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("trackedMjs lists only tracked files — an untracked .mjs is not linted", () => {
  const files = trackedMjs(REPO);
  assert.ok(files.every((f) => f.endsWith(".mjs")), "only .mjs paths may be returned");
  assert.ok(
    files.some((f) => f.startsWith("project-template/.flow/bin/")),
    "the template's bin is tracked and must be covered by lint",
  );
  assert.ok(
    !files.some((f) => f.startsWith("flow-validation/") || f.startsWith("flow-plugin/")),
    "directories git no longer tracks after the public split must not trip the lint",
  );
});
