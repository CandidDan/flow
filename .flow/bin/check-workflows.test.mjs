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
//
// And the flow-0060 criteria, in the "permission keys" section at the bottom:
//   · "a workflow declaring any `permissions:` key outside GitHub's documented set fails the
//      build, naming the file, the key and the valid set"
//   · "a fixture carrying `workflows: write` fails — the exact key flow-0051 invented, pinned
//      by name as a regression case"
//   · "fixtures using every valid key, including the rare ones, all pass — a validator that
//      rejects legitimate keys would be a worse outage than the one it prevents"

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
const { DEFAULT_WORKFLOW_DIR, DEFAULT_WORKFLOW_DIRS, GITHUB_TOKEN_PERMISSIONS, checkWorkflows, invalidPermissionKeys } = mod ?? {};

const yamlMod = await import("yaml").then((m) => m, () => null);
const yamlSkip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");
const SCRIPT = join(BIN, "check-workflows.mjs");
const WORKFLOWS = join(REPO, DEFAULT_WORKFLOW_DIR ?? ".github/workflows");
const TEMPLATE_WORKFLOWS = join(TEMPLATE, ".github/workflows");

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
  assert.deepEqual(job.secrets, { CLAUDE_CODE_OAUTH_TOKEN: "${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}" },
    "named, not `secrets: inherit` — the reusable declares only CLAUDE_CODE_OAUTH_TOKEN, so " +
    "inherit would over-grant this job FLOW_PAT it never uses (see secrets-scope.test.mjs)");
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

// ── flow-0060: GitHub's `permissions:` keys are a closed set, and the build now knows it ──────
//
// The bug this section exists to prevent: `workflows: write` is valid YAML and not a permission
// that exists. It parsed, shipped to four repos and behind the `v2` tag, and GitHub then refused
// to start the workflow at all. Parsing was never going to catch it — only knowing the set could.

const workflowWith = (permissions) =>
  `name: fixture\non: push\npermissions:\n${permissions}jobs:\n  a:\n    runs-on: ubuntu-latest\n`;

const inDir = (name, files) => {
  const dir = tmp(name);
  for (const [file, body] of Object.entries(files)) writeFileSync(join(dir, file), body);
  return dir;
};

test("REGRESSION (flow-0051): a workflow carrying `workflows: write` fails the check", { skip }, () => {
  const dir = inDir("workflows-key", { "bad.yml": workflowWith("  contents: write\n  workflows: write\n") });
  try {
    const { checked, failures } = checkWorkflows(dir);
    assert.deepEqual(checked, [], "a workflow GitHub refuses to start has not been checked");
    assert.equal(failures.length, 1);
    assert.match(failures[0].file, /bad\.yml$/, "the offending file must be named");
    assert.match(failures[0].message, /'workflows' is not a GITHUB_TOKEN permission/);
    assert.match(failures[0].message, /fine-grained-PAT scope/,
      "the message must say WHY the key cannot exist, not just that it is unknown — that is the " +
      "part flow-0051 needed and did not have");
    assert.match(failures[0].message, /actions, attestations, checks, contents/,
      "the valid set must be printed, so the fix does not require a doc hunt");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the same key in a JOB's permissions block fails too — that is where the caller carried it", { skip }, () => {
  // project-template/.github/workflows/flow-sync.yml declared it at job level, not workflow level.
  //
  // The `uses:` owner is a PLACEHOLDER on purpose. `adr-split-authoring.test.mjs` counts every
  // tracked file that names canonical's bare owner/repo and pins that count in an ADR, precisely
  // so the release-repo cutover cannot lose a reference. A synthetic fixture is not a reference to
  // canonical, and spelling it as one would inflate that count and make this file look like
  // something the cutover has to re-pin. (Which is also why this comment does not spell it out.)
  const dir = inDir("job-level", {
    "caller.yml":
      "name: caller\non: push\njobs:\n  flow-sync:\n    permissions:\n      contents: write\n" +
      "      workflows: write\n    uses: EXAMPLE-OWNER/example/.github/workflows/_flow-sync.yml@v2\n",
  });
  try {
    const { failures } = checkWorkflows(dir);
    assert.equal(failures.length, 1);
    assert.match(failures[0].message, /^jobs\.flow-sync\.permissions: 'workflows'/,
      "the failure must name the exact YAML path to edit, not just the file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: an invented permission key fails the build and names file, key and valid set", { skip }, () => {
  const dir = inDir("cli-invented", { "x.yml": workflowWith("  contents: read\n  workfloww: write\n") });
  try {
    const r = run([dir]);
    assert.notEqual(r.status, 0, "an unparseable-by-GitHub workflow must fail `npm run build`");
    assert.match(r.stderr, /x\.yml/, "the file");
    assert.match(r.stderr, /'workfloww'/, "the key — any invented key, not just `workflows`");
    assert.match(r.stderr, /repository-projects/, "the valid set");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every valid key passes, including the rare ones a naive list would omit", { skip }, () => {
  // A validator that rejects a legitimate key is a worse outage than the one it prevents: it
  // blocks the gate on correct code, in every adopting repo at once.
  const body = GITHUB_TOKEN_PERMISSIONS.map((k) => `  ${k}: write\n`).join("");
  const dir = inDir("all-valid", { "all.yml": workflowWith(body) });
  try {
    const { checked, failures } = checkWorkflows(dir);
    assert.deepEqual(failures, [], "no documented permission may be rejected");
    assert.equal(checked.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const rare of ["id-token", "models", "attestations", "repository-projects"]) {
    assert.ok(GITHUB_TOKEN_PERMISSIONS.includes(rare), `${rare} is a real permission and must be allowed`);
    assert.deepEqual(invalidPermissionKeys({ permissions: { [rare]: "write" } }), [],
      `${rare} must pass on its own, not only inside the full set`);
  }
});

test("`workflows` is absent from the allowed set, and stays absent", { skip }, () => {
  assert.ok(!GITHUB_TOKEN_PERMISSIONS.includes("workflows"),
    "adding it here would re-open flow-0051: it is a GitHub App / fine-grained-PAT scope, and " +
    "GITHUB_TOKEN cannot be granted it at all");
  assert.equal(GITHUB_TOKEN_PERMISSIONS.length, 15, "the set is closed; grow it only with a doc link");
});

test("the shorthands, an empty block and an absent block are all accepted", { skip }, () => {
  for (const shorthand of ["read-all", "write-all"]) {
    assert.deepEqual(invalidPermissionKeys({ permissions: shorthand }), [],
      `permissions: ${shorthand} names no keys and is valid`);
  }
  assert.deepEqual(invalidPermissionKeys({ permissions: {} }), [], "`permissions: {}` drops all scopes");
  assert.deepEqual(invalidPermissionKeys({ permissions: null }), [], "a bare `permissions:` is null, not a key");
  assert.deepEqual(invalidPermissionKeys({}), [], "most workflows declare none at all");
  assert.deepEqual(invalidPermissionKeys(null), [], "a non-object document must not throw");
  assert.deepEqual(invalidPermissionKeys({ permissions: 7 }), [], "a nonsense scalar is the YAML schema's problem, not this check's");
  assert.deepEqual(invalidPermissionKeys({ jobs: { a: null, b: "x" } }), [],
    "a null or scalar job must be skipped rather than crash the build");
  assert.deepEqual(invalidPermissionKeys({ permissions: "read-only" }), [{ where: "permissions", key: "read-only" }],
    "an invented SHORTHAND is caught too — `read-only` is the plausible-looking one that does not exist");
});

test("both of canonical's shipped workflow trees are checked by default, and both are clean", { skip }, () => {
  assert.deepEqual([...DEFAULT_WORKFLOW_DIRS], [".github/workflows", "project-template/.github/workflows"],
    "the published thin callers are API too — flow-0060's invalid key sat in that tree, unbuilt");
  for (const dir of [WORKFLOWS, TEMPLATE_WORKFLOWS]) {
    const { checked, failures } = checkWorkflows(dir);
    assert.deepEqual(failures, [], `${dir} must be free of invented permission keys`);
    assert.ok(checked.length > 0, `${dir} must not be empty`);
  }
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /project-template\/\.github\/workflows/,
    "the default run must say it looked at the template tree, so a green build is not a silent one");
});
