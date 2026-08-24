// check-workflows.test.mjs — proving tests for canonical's `build` command.
//
// Criteria proved here (flow-0004):
//   · "the build command exits 0 and every file in .github/workflows/ has been parsed"
//   · "a deliberately malformed _flow-gates.yml makes it exit non-zero and name the file"
//
// Also proves the flow-0013 boundary: _flow-compass.yml's read-only permission block, its
// FLOW_AI gate, its optional-secret declaration and its idempotent label step, the thin
// caller's wiring, and the SKILL.md boundaries that back the mechanical checks up. See the
// "compass" section below.

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE. `_flow-gates.yml` has a `flow-tooling` job that runs
// `node --test .flow/bin/*.test.mjs` with NO install step — it exists so a consuming repo's
// Flow tooling is tested independently of its stack. canonical's build helper needs `yaml`,
// so these tests skip *visibly* there ("# skipped") rather than crashing the job on a missing
// module. They still run for real in the per-stack gate job, which does `npm ci` first and
// then `npm test`. A printed skip is not a silent no-op; a module-not-found crash is not a
// gate result at all.
const mod = await import("./check-workflows.mjs").then((m) => m, () => null);
const skip = mod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";
const { DEFAULT_WORKFLOW_DIR, checkWorkflows } = mod ?? {};

const yamlMod = await import("yaml").then((m) => m, () => null);
const yamlSkip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");
const SCRIPT = join(BIN, "check-workflows.mjs");
const WORKFLOWS = join(REPO, DEFAULT_WORKFLOW_DIR ?? ".github/workflows");

const tmp = (name) => mkdtempSync(join(tmpdir(), `flow-cw-${name}-`));
const run = (args, cwd = REPO) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });

test("the repo as-is: every workflow file parses, and the count matches what is on disk", { skip }, () => {
  const { checked, failures } = checkWorkflows(WORKFLOWS);
  const onDisk = readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n));

  assert.deepEqual(failures, [], "canonical's own workflows must all parse");
  assert.equal(checked.length, onDisk.length,
    "every YAML file in .github/workflows/ must be parsed, not a subset");
  assert.ok(checked.length > 0, "the fixture is meaningless if the directory is empty");
});

test("CLI: the repo as-is exits 0 and reports how many files it parsed", { skip }, () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /check-workflows: \d+ workflow file\(s\) parsed/);
});

test("a malformed _flow-gates.yml fails and names the offending file", { skip }, () => {
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

test("a valid file alongside a malformed one still parses — only the broken file is blamed", { skip }, () => {
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

test("an empty workflow directory FAILS — a build that parses nothing must not report success", { skip }, () => {
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

test("a missing workflow directory fails rather than throwing", { skip }, () => {
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

test("non-YAML files in the directory are ignored, not counted as parsed", { skip }, () => {
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

// ── flow-0013: _flow-compass.yml's read-only boundary, proved rather than documented ─────────

const COMPASS_REUSABLE = join(REPO, ".github/workflows/_flow-compass.yml");
const COMPASS_CALLER = join(TEMPLATE, ".github/workflows/flow-compass.yml");
const COMPASS_SKILL = join(TEMPLATE, ".claude/skills/flow-compass/SKILL.md");

test("_flow-compass.yml grants exactly contents:read, issues:write, id-token:write", { skip: yamlSkip }, () => {
  const wf = yamlMod.parse(readFileSync(COMPASS_REUSABLE, "utf8"));
  assert.deepEqual(Object.keys(wf.permissions).sort(), ["contents", "id-token", "issues"],
    "no other permission may be granted — the audit's whole output surface is a filed issue");
  assert.equal(wf.permissions.contents, "read",
    "contents must never be raised to write — that would let the audit commit or open a PR, " +
    "the exact boundary this task exists to hold");
  assert.equal(wf.permissions.issues, "write", "filing an issue is compass's only output");
  assert.equal(wf.permissions["id-token"], "write", "claude-code-action mints an OIDC token");
});

test("the compass job is gated on the repo's FLOW_AI opt-in", { skip: yamlSkip }, () => {
  const wf = yamlMod.parse(readFileSync(COMPASS_REUSABLE, "utf8"));
  assert.ok(wf.jobs.compass, "_flow-compass.yml must define a \"compass\" job");
  assert.equal(String(wf.jobs.compass.if).trim(), "${{ vars.FLOW_AI == 'true' }}",
    "compass ships in the same opt-in tier as triage, review and the queue-runner");
});

test("CLAUDE_CODE_OAUTH_TOKEN is declared optional, so a repo without the secret gets a skip", { skip: yamlSkip }, () => {
  const wf = yamlMod.parse(readFileSync(COMPASS_REUSABLE, "utf8"));
  const secret = wf.on?.workflow_call?.secrets?.CLAUDE_CODE_OAUTH_TOKEN;
  assert.ok(secret, "on.workflow_call.secrets.CLAUDE_CODE_OAUTH_TOKEN must be declared");
  assert.equal(secret.required, false,
    "required:true would fail the whole workflow at call time in a repo that hasn't enabled " +
    "compass yet, instead of letting the job's FLOW_AI gate skip it cleanly");
});

test("the compass label is created idempotently before the agent step runs", { skip: yamlSkip }, () => {
  const wf = yamlMod.parse(readFileSync(COMPASS_REUSABLE, "utf8"));
  const steps = wf.jobs.compass.steps ?? [];
  const labelIdx = steps.findIndex((s) => String(s.run ?? "").includes("gh label create"));
  const agentIdx = steps.findIndex((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action"));
  assert.ok(labelIdx >= 0, "no step creates the compass label");
  assert.ok(agentIdx >= 0, "no claude-code-action step found");
  assert.ok(labelIdx < agentIdx, "the label must exist before the agent can apply it");
  assert.match(String(steps[labelIdx].run), /--force/,
    "idempotent means a first run on a repo with no such label must still succeed — " +
    "`gh label create --force` updates rather than erroring on an existing label");
});

test("the thin caller wires the reusable correctly and owns the schedule", { skip: yamlSkip }, () => {
  const caller = yamlMod.parse(readFileSync(COMPASS_CALLER, "utf8"));
  const job = caller.jobs["flow-compass"];
  assert.match(job.uses, /^CandidDan\/flow\/\.github\/workflows\/_flow-compass\.yml@/,
    "repos adopt the logic by reference; a copy is the drift surface this replaced");
  assert.equal(job.secrets, "inherit");
  for (const p of ["contents", "issues", "id-token"]) {
    assert.ok(job.permissions?.[p], `the caller must grant ${p} — the reusable cannot raise it`);
  }
  assert.equal(job.permissions["id-token"], "write", "claude-code-action mints an OIDC token");
  assert.equal(job.permissions.contents, "read", "the caller must not widen the boundary either");

  assert.ok(Array.isArray(caller.on?.schedule) && caller.on.schedule.length > 0,
    "the caller owns a cron schedule — that's the point of a thin caller");
  assert.ok("workflow_dispatch" in (caller.on ?? {}),
    "workflow_dispatch lets a human run the audit on demand, not only on the cron");
});

test("flow-compass/SKILL.md states the boundary and names the permission block as its proof", () => {
  const skill = readFileSync(COMPASS_SKILL, "utf8");
  const dont = skill.split(/^## Don't/m)[1] ?? "";
  assert.ok(dont, "SKILL.md must have a Don't section");
  assert.match(dont, /commit/i);
  assert.match(dont, /\.flow\/tasks/, "must say it never edits task files");
  assert.match(dont, /VISION\.md/, "must say it never edits the vision");
  assert.match(dont, /source file|code/i, "must say it never touches code");
  assert.match(dont, /permissions:.*block|permission block/i,
    "the Don't section must point at the workflow's permissions block as the mechanical proof, " +
    "not just assert good behaviour in prose");
});

test("the skill requires every finding to carry checkable evidence and a proposed lane", () => {
  const skill = readFileSync(COMPASS_SKILL, "utf8");
  assert.match(skill, /from the issue alone/i,
    "evidence must be self-contained in the issue, not require reading the audit's own reasoning");
  assert.match(skill, /task ids?/i);
  assert.match(skill, /PR links?/i);
  assert.match(skill, /goal ids?/i);
  assert.match(skill, /\bfix\b/);
  assert.match(skill, /\bamend\b/);
  assert.match(skill, /\baccept\b/);
});

test("the skill's calibration defines material, requires batching trivia, and bars re-filing accepted findings", () => {
  const skill = readFileSync(COMPASS_SKILL, "utf8");
  const calibration = skill.split(/^## Calibration/m)[1] ?? "";
  assert.ok(calibration, "SKILL.md must have a Calibration section");
  assert.match(calibration, /a human should spend a decision on it/i,
    "material must be defined, not left to the agent's own judgement of the word");
  assert.match(calibration, /batch|roll-up/i, "trivia must be instructed to batch, not fan out");
  assert.match(calibration, /accept/i);
  assert.match(calibration, /materially grown|grown/i,
    "a finding the human already accepted must not be re-filed unless it has genuinely worsened");
});
