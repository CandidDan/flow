// unblock-pr-read-scope.test.mjs — pins `pull-requests: read` on every flow-unblock permissions block.
//
// WHY (flow-0163). The sweep resolves a PR-url `blocked_by` entry with
// `gh api repos/<owner>/<repo>/pulls/<n>` on GITHUB_TOKEN. A `permissions:` block is exhaustive,
// so a chain that grants only `contents: write` + `actions: write` cannot read pull requests in a
// private repo: every lookup failed, every PR-url entry resolved `unknown`, and every such block
// waited for a human (CandidDan/write run 40268705927). This test fails, naming the file, if any
// of the three blocks loses the grant — and fails if the sweep stops calling a `pulls` endpoint,
// so the grant and its reason cannot drift apart silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Same dependency note as actions-write-scope.test.mjs: `yaml` is absent in the no-install
// flow-tooling step, so these skip visibly there and run for real in the gate job.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";
const parseYaml = (text) => yamlMod.parse(text);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REUSABLE = ".github/workflows/_flow-unblock.yml";
const CALLERS = [".github/workflows/flow-unblock.yml", "project-template/.github/workflows/flow-unblock.yml"];
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const readsPulls = (perms) =>
  perms === "read-all" || perms === "write-all" ||
  (perms !== null && typeof perms === "object" && ["read", "write"].includes(perms["pull-requests"]));

// Returns failure messages for files (name -> YAML text). The reusable is checked at the top
// level, where it declares its permissions; a caller on every job, because the grant a reusable
// receives is its calling job's.
export function checkPrRead(files) {
  const failures = [];
  for (const [name, text] of Object.entries(files)) {
    const doc = parseYaml(text);
    if (name.endsWith(REUSABLE)) {
      if (!readsPulls(doc?.permissions)) failures.push(`${name}: top-level permissions lack \`pull-requests: read\``);
      continue;
    }
    for (const [id, job] of Object.entries(doc?.jobs ?? {})) {
      if (!readsPulls(job?.permissions)) failures.push(`${name}: job ${id} permissions lack \`pull-requests: read\``);
    }
  }
  return failures;
}

const allFiles = () => Object.fromEntries([REUSABLE, ...CALLERS].map((f) => [f, read(f)]));

test("the template caller grants pull-requests: read alongside contents: write, and nothing else", { skip }, () => {
  const file = CALLERS[1];
  const jobs = Object.values(parseYaml(read(file)).jobs);
  assert.equal(jobs.length, 1, `${file} is a thin caller`);
  // actions: write went in flow-0174 with the dispatch it served.
  assert.deepEqual(jobs[0].permissions, { contents: "write", "pull-requests": "read" }, file);
});

test("canonical's caller and the reusable each grant pull-requests: read", { skip }, () => {
  const caller = Object.values(parseYaml(read(CALLERS[0])).jobs)[0];
  assert.equal(caller.permissions["pull-requests"], "read", CALLERS[0]);
  assert.equal(parseYaml(read(REUSABLE)).permissions["pull-requests"], "read", REUSABLE);
  assert.deepEqual(checkPrRead(allFiles()), []);
});

test("a copy of any of the three with the pull-requests grant removed fails, naming that file", { skip }, () => {
  for (const [name, text] of Object.entries(allFiles())) {
    const stripped = text.replace(/^\s*pull-requests: read\b.*\n/m, "");
    assert.notEqual(stripped, text, `${name}: the grant line was not found to remove`);
    const failures = checkPrRead({ [name]: stripped });
    assert.equal(failures.length, 1, name);
    assert.ok(failures[0].startsWith(`${name}:`), failures[0]);
    assert.match(failures[0], /pull-requests: read/);
  }
});

test("pull-requests: write also satisfies the check; an unrelated grant does not", { skip }, () => {
  const job = (perms) => `name: x\non: push\njobs:\n  a:\n    permissions:\n${perms}    uses: o/r/.github/workflows/w.yml@v1\n`;
  assert.deepEqual(checkPrRead({ "x.yml": job("      pull-requests: write\n") }), []);
  assert.equal(checkPrRead({ "x.yml": job("      contents: write\n") }).length, 1);
});

test("the reusable's sweep still looks PRs up through a repos/…/pulls/… call", { skip }, () => {
  const steps = parseYaml(read(REUSABLE)).jobs.sweep.steps;
  const calls = steps.filter((s) => /gh api "?repos\/[^"\s]*\/pulls\//.test(s.run ?? ""));
  assert.ok(calls.length > 0,
    `${REUSABLE}: no step calls a repos/…/pulls/… endpoint any more — the pull-requests: read grant has lost its reason`);
});
