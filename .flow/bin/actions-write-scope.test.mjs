// actions-write-scope.test.mjs — pins which reusable workflows may grant `actions: write`.
//
// WHY. Since flow-0152 `github-actions[bot]` can start the bypassPermissions queue-runner worker,
// and dispatching needs `actions: write`. So the real boundary is "any workflow that holds
// `actions: write` and dispatches with GITHUB_TOKEN". This test makes widening that set a
// deliberate, reviewed edit to ALLOWLIST below rather than a quiet permissions line.
//
// `permissions: write-all` implies `actions: write`, so it counts as a grant.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Same dependency note as queue-runner-switch.test.mjs: the flow-tooling step runs
// `node --test .flow/bin/*.test.mjs` with no install, so `yaml` is absent there. These tests skip
// visibly in that step and run for real in the gate job, which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";
const parseYaml = (text) => yamlMod.parse(text);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

// Workflow file -> why it may hold `actions: write`. Add here only via a reviewed change.
export const ALLOWLIST = {
  "_flow-unblock.yml": "lists the queue runner's runs and dispatches it once a human answers a blocked task",
};

function grantsActionsWrite(perms) {
  if (perms === "write-all") return true;
  return perms !== null && typeof perms === "object" && perms.actions === "write";
}

// Returns the scopes in one workflow's parsed YAML that grant actions: write.
// Each entry is "workflow" or "job <id>".
export function findGrants(doc) {
  const grants = [];
  if (!doc || typeof doc !== "object") return grants;
  if (grantsActionsWrite(doc.permissions)) grants.push("workflow");
  for (const [id, job] of Object.entries(doc.jobs ?? {})) {
    if (grantsActionsWrite(job?.permissions)) grants.push(`job ${id}`);
  }
  return grants;
}

// Returns failure messages for files (name -> YAML text) that grant outside `allow`.
export function checkFiles(files, allow = ALLOWLIST) {
  const failures = [];
  for (const [name, text] of Object.entries(files)) {
    if (name in allow) continue;
    for (const scope of findGrants(parseYaml(text))) {
      failures.push(`${name}: ${scope} grants \`actions: write\` but is not in the allowlist`);
    }
  }
  return failures;
}

function loadReusables() {
  const files = {};
  for (const f of readdirSync(WORKFLOWS).filter((n) => /^_flow-.*\.yml$/.test(n))) {
    files[f] = readFileSync(join(WORKFLOWS, f), "utf8");
  }
  return files;
}

test("today's reusable workflows grant actions: write only to the allowlist", { skip }, () => {
  const files = loadReusables();
  assert.ok(Object.keys(files).length > 0, "no _flow-*.yml found — an empty check is a failure");
  assert.deepEqual(checkFiles(files), []);
});

test("the allowlist names exactly the workflows that grant actions: write today, each with a reason", { skip }, () => {
  const files = loadReusables();
  const holders = Object.keys(files).filter((n) => findGrants(parseYaml(files[n])).length > 0).sort();
  assert.deepEqual(holders, Object.keys(ALLOWLIST).sort());
  for (const [name, reason] of Object.entries(ALLOWLIST)) {
    assert.ok(reason.trim().length > 0, `${name} needs a reason`);
  }
});

test("a job-level actions: write in a non-allowlisted workflow fails, naming file and job", { skip }, () => {
  const copy = loadReusables()["_flow-kickback.yml"];
  const jobs = parseYaml(copy).jobs;
  const id = Object.keys(jobs)[0];
  const doc = parseYaml(copy);
  doc.jobs[id].permissions = { ...(doc.jobs[id].permissions ?? {}), actions: "write" };
  const failures = checkFiles({ "_flow-copy.yml": JSON.stringify(doc) });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /_flow-copy\.yml/);
  assert.match(failures[0], new RegExp(`job ${id}`));
});

test("permissions: write-all on a non-allowlisted workflow fails", { skip }, () => {
  const failures = checkFiles({ "_flow-x.yml": "name: x\non: push\npermissions: write-all\njobs: {}\n" });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /_flow-x\.yml: workflow/);
});

test("actions: read and unrelated writes do not fail", { skip }, () => {
  const y = "name: x\non: push\npermissions:\n  contents: write\njobs:\n  a:\n    permissions:\n      actions: read\n";
  assert.deepEqual(checkFiles({ "_flow-x.yml": y }), []);
});
