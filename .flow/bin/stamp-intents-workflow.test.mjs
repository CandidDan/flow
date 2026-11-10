// stamp-intents-workflow.test.mjs — canonical-only proving tests for intent stamping in CI.
//
// flow-0127 / flow-0209 (ADR-0007 slice 4). `.flow/bin/stamp-intents.mjs` (the adapter) and
// `_flow-done.yml` (the reusable workflow) exist only in canonical, so their tests live here rather
// than beside the template's helper, where an adopting repo would run them against files it lacks.
//
// The workflow is read with `yaml`, the way GitHub reads it, and the tests that need it skip
// visibly without it: the tooling gate job runs `node --test .flow/bin/*.test.mjs` with no install.

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const REPO = resolve(import.meta.dirname, "..", "..");
const ADAPTER = join(REPO, ".flow", "bin", "stamp-intents.mjs");
const HELPER = join(REPO, "project-template", ".flow", "bin", "stamp-intents.mjs");
const WORKFLOW = join(REPO, ".github", "workflows", "_flow-done.yml");

const yamlMod = await import("yaml").then((m) => m, () => null);
const needsYaml = "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BY = "CandidDan";
const AT = "2026-10-03T07:52:11Z";

const intent = ({ status = "proposed", by = '""', at = '""' } = {}) => [
  "---",
  'id: "a"',
  `status: "${status}"`,
  `approved_by: ${by}`,
  `approved_at: ${at}`,
  "---",
  "",
  "## Problem",
  "",
].join("\n");

// ── the adapter ─────────────────────────────────────────────────────────────────────────────

test(".flow/bin/stamp-intents.mjs is an ADAPTER — imports the template, holds no decision logic", async () => {
  const src = readFileSync(ADAPTER, "utf8");
  const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.match(code, /from "\.\.\/\.\.\/project-template\/\.flow\/bin\/stamp-intents\.mjs"/,
    "it must import the template module");
  assert.doesNotMatch(code, /\bfunction\s+(?!__)\w*\s*\(/, "no function of its own: logic lives in the template");
  for (const word of ['"approved"', "intents/", "readFileSync", "writeFileSync", "execFileSync", "fetch("]) {
    assert.ok(!code.includes(word), `the adapter must not decide or do I/O itself (found ${JSON.stringify(word)})`);
  }
  const mod = await import(ADAPTER);
  const tpl = await import(HELPER);
  for (const name of ["stampIntents", "repairIntents", "addingMergeFromGitHub", "runStampCli"]) {
    assert.equal(mod[name], tpl[name], `${name}: the same function, re-exported — not a copy`);
  }

  // And its CLI block actually runs: silence here is the symlink failure mode.
  const r = spawnSync(process.execPath, [ADAPTER, "--base", "a", "--head", "b", "--merged-by", "", "--merged-at", AT],
    { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /mergedBy is empty/);
});

// ── the workflow step ───────────────────────────────────────────────────────────────────────

const stampStep = () => {
  const wf = yamlMod.parse(readFileSync(WORKFLOW, "utf8"));
  const job = wf.jobs["mark-done"];
  const i = job.steps.findIndex((s) => s.name === "Stamp intents this merge approved");
  assert.notEqual(i, -1, "the stamping step exists in mark-done");
  return { wf, job, steps: job.steps, i, step: job.steps[i] };
};

test("flow-0209 criterion 7: the stamp step has the token, the repo and whole history the repair needs", async (t) => {
  if (!yamlMod) return t.skip(needsYaml);
  const { wf, job, steps, step } = stampStep();
  assert.equal(step.env.GH_TOKEN, "${{ github.token }}", "the job's token reaches the helper");
  assert.equal(step.env.REPO, "${{ github.repository }}");
  assert.match(step.run, /--repo "\$REPO"/, "the helper is told which repo to ask about");
  // History: the checkout fetches all of it, and the step unshallows if a checkout ever did not.
  const checkout = steps.find((s) => String(s.uses || "").startsWith("actions/checkout@"));
  assert.equal(checkout.with["fetch-depth"], 0);
  assert.match(step.run,
    /if \[ "\$\(git rev-parse --is-shallow-repository\)" = "true" \]; then\n\s*git fetch --unshallow --quiet origin\n\s*fi/);
  // The reusable requests nothing (flow-0219): see the next test.
  assert.equal(wf.permissions, undefined);
  assert.equal(job.permissions, undefined);
});

// flow-0219: callers grant, the reusable inherits (the flow-0211 pattern).
const CALLERS = [
  join(REPO, ".github", "workflows", "flow-done.yml"),
  join(REPO, "project-template", ".github", "workflows", "flow-done.yml"),
];

test("flow-0219 criterion 1: both flow-done callers grant exactly contents: write and pull-requests: read", async (t) => {
  if (!yamlMod) return t.skip(needsYaml);
  for (const file of CALLERS) {
    const wf = yamlMod.parse(readFileSync(file, "utf8"));
    assert.deepEqual(wf.jobs["flow-done"].permissions, { contents: "write", "pull-requests": "read" }, file);
    assert.match(wf.jobs["flow-done"].uses, /\/_flow-done\.yml@/, `${file} calls the reusable`);
  }
});

test("flow-0219 criterion 2: _flow-done.yml declares no permissions, at the top level or on any job", async (t) => {
  if (!yamlMod) return t.skip(needsYaml);
  const wf = yamlMod.parse(readFileSync(WORKFLOW, "utf8"));
  assert.equal(Object.hasOwn(wf, "permissions"), false, "a top-level block would cut what the caller grants");
  for (const [name, job] of Object.entries(wf.jobs)) {
    assert.equal(Object.hasOwn(job, "permissions"), false, `job ${name} must not request permissions`);
  }
});

test("flow-0209 criterion 7: the step still retries a rejected push, discarding and redoing the stamp", async (t) => {
  if (!yamlMod) return t.skip(needsYaml);
  const { steps, step } = stampStep();
  const transition = steps.find((s) => s.name === "Flip the merged task to done").run;
  for (const line of ["MAX_PUSH_ATTEMPTS=5", "until git push origin HEAD:main; do",
    'if [ "$attempt" -gt "$MAX_PUSH_ATTEMPTS" ]; then', 'sleep "$attempt"',
    "git fetch origin main --quiet", "git reset --hard FETCH_HEAD"]) {
    assert.ok(transition.includes(line), `the shared loop still has ${line}`);
    assert.ok(step.run.includes(line), `the stamping step reuses ${line}`);
  }
  const loop = step.run.slice(step.run.indexOf("until git push origin HEAD:main; do"));
  assert.match(loop, /git reset --hard FETCH_HEAD\n\s*stamp\n/, "a refused push re-runs the stamp on the new tip");
  const code = step.run.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.doesNotMatch(code, /git (pull|rebase|merge)\b|--force/);
  assert.match(step.run, /git commit -m "\$COMMIT_MSG"/);
});

test("the step is gated on the merge, runs after the transition, and is fed from the event through env", async (t) => {
  if (!yamlMod) return t.skip(needsYaml);
  const { steps, i, step } = stampStep();
  const transition = steps.findIndex((s) => s.name === "Flip the merged task to done");
  assert.ok(transition !== -1 && i > transition, "it runs AFTER the task transition");
  assert.match(step.if, /github\.event\.pull_request\.merged == true/);
  assert.match(step.if, /!cancelled\(\)/, "a failed transition must not drop a stamp");
  assert.equal(step.env.MERGED_BY, "${{ github.event.pull_request.merged_by.login }}");
  assert.equal(step.env.MERGED_AT, "${{ github.event.pull_request.merged_at }}");
  assert.equal(step.env.MERGE_SHA, "${{ github.event.pull_request.merge_commit_sha }}");
  assert.match(step.run, /--merged-by "\$MERGED_BY" --merged-at "\$MERGED_AT"/);
  assert.match(step.run, /BASE_SHA="\$\(git rev-parse "\$MERGE_SHA\^1"\)"/, "base is the merge's first parent");
  assert.doesNotMatch(step.run, /\$\{\{/, "event values reach the shell through env, never interpolated");
  assert.match(step.run, /if \[ ! -f \.flow\/bin\/stamp-intents\.mjs \]; then\n\s*echo "[^"\n]+"\n\s*exit 0\n/,
    "a repo without the helper skips with one line");
});

// The step's run block, executed for real: a bare remote standing in for `main`, and a runner clone.
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

function sandbox({ helper = HELPER, shallow = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "stamp-step-"));
  const remote = join(root, "remote.git");
  const work = join(root, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  mkdirSync(work);
  git(work, "init", "-q", "-b", "main");
  git(work, "config", "user.name", "t");
  git(work, "config", "user.email", "t@example.com");
  git(work, "config", "commit.gpgsign", "false");
  mkdirSync(join(work, ".flow", "intents"), { recursive: true });
  writeFileSync(join(work, ".flow/intents/done.md"), intent({ status: "approved", by: '"Earlier"', at: '"2026-09-01T00:00:00Z"' }));
  if (helper) {
    mkdirSync(join(work, ".flow", "bin"), { recursive: true });
    copyFileSync(helper, join(work, ".flow/bin/stamp-intents.mjs"));
  }
  git(work, "add", "-A");
  git(work, "commit", "-qm", "base");
  git(work, "checkout", "-qb", "pr");
  writeFileSync(join(work, ".flow/intents/a.md"), intent());
  git(work, "add", "-A");
  git(work, "commit", "-qm", "intent: a");
  git(work, "checkout", "-q", "main");
  git(work, "merge", "-q", "--no-ff", "pr", "-m", "Merge pull request #37");
  git(work, "remote", "add", "origin", remote);
  git(work, "push", "-q", "origin", "main");
  const runner = join(root, "runner");
  execFileSync("git", ["clone", "-q", ...(shallow ? ["--depth", "1"] : []), `file://${remote}`, runner]);
  git(runner, "config", "user.name", "t");
  git(runner, "config", "user.email", "t@example.com");
  git(runner, "config", "commit.gpgsign", "false");
  return { root, remote, runner, merge: git(work, "rev-parse", "HEAD") };
}

// GITHUB_API_URL points nowhere: every intent in these sandboxes is either added by this merge or
// already stamped, so the repair has nothing to look up — a lookup would fail loudly in the log.
const runStep = (sb, script, env = {}) => spawnSync("bash", ["-e", "-c", script], {
  cwd: sb.runner, encoding: "utf8",
  env: { ...process.env, PR_NUM: "37", MERGED_BY: BY, MERGED_AT: AT, MERGE_SHA: sb.merge,
    REPO: "o/r", GH_TOKEN: "", GITHUB_API_URL: "http://127.0.0.1:9", ...env },
});

test("the step, run for real — it unshallows, approves the intent the merge added, pushes, and a re-run pushes nothing", async (t) => {
  if (!yamlMod) return t.skip(needsYaml);
  const { step } = stampStep();
  const sb = sandbox({ shallow: true });
  try {
    assert.equal(git(sb.runner, "rev-parse", "--is-shallow-repository"), "true", "the sandbox starts shallow");
    const r = runStep(sb, step.run);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(git(sb.runner, "rev-parse", "--is-shallow-repository"), "false", "the step made the history whole");
    assert.equal(git(sb.remote, "log", "-1", "--format=%s", "main"),
      `flow: stamp intent approval (PR #37 merged by ${BY})`);
    const text = git(sb.remote, "show", "main:.flow/intents/a.md");
    assert.match(text, /^status: "approved"$/m);
    assert.match(text, /^approved_by: "CandidDan"$/m);
    assert.match(text, /^approved_at: "2026-10-03T07:52:11Z"$/m);
    assert.match(git(sb.remote, "show", "main:.flow/intents/done.md"), /^approved_by: "Earlier"$/m);

    const tip = git(sb.remote, "rev-parse", "main");
    const again = runStep(sb, step.run);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /nothing to stamp/);
    assert.equal(git(sb.remote, "rev-parse", "main"), tip);
  } finally { rmSync(sb.root, { recursive: true, force: true }); }
});

test("the step, run for real — no helper skips cleanly; a pre-flow-0209 helper is not handed --repo", async (t) => {
  if (!yamlMod) return t.skip(needsYaml);
  const { step } = stampStep();

  const absent = sandbox({ helper: null });
  try {
    const before = git(absent.remote, "rev-parse", "main");
    const r = runStep(absent, step.run);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim().split("\n").length, 1, "a single log line");
    assert.match(r.stdout, /skipping intent stamping/);
    assert.equal(git(absent.remote, "rev-parse", "main"), before, "nothing pushed");
  } finally { rmSync(absent.root, { recursive: true, force: true }); }

  // A stand-in for a helper synced before flow-0209: it rejects any flag it does not know.
  const sp = mkdtempSync(join(tmpdir(), "old-helper-"));
  const old = join(sp, "stamp-intents.mjs");
  writeFileSync(old, [
    "const known = new Set(['--base', '--head', '--merged-by', '--merged-at']);",
    "const a = process.argv.slice(2);",
    "for (let i = 0; i < a.length; i += 2) if (!known.has(a[i])) { console.error('unknown argument ' + a[i]); process.exit(1); }",
    "console.log('old helper ran');",
  ].join("\n"));
  const legacy = sandbox({ helper: old });
  try {
    const r = runStep(legacy, step.run);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /old helper ran/);
  } finally {
    rmSync(legacy.root, { recursive: true, force: true });
    rmSync(sp, { recursive: true, force: true });
  }

  // A throw in the normal path still fails the step instead of dropping the stamp.
  const broken = sandbox();
  try {
    const r = runStep(broken, step.run, { MERGED_AT: "2026-10-03" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not a full UTC ISO-8601 instant/);
  } finally { rmSync(broken.root, { recursive: true, force: true }); }
});
