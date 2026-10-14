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
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalRepoRoot, canonicalTasksDir, readTaskState } from "./queue-runner-verify.mjs";
import { changelogEntry } from "./changelog-entry.mjs";

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

// ── flow-0083: the worker's model is the task's, and a run with no PR escalates it ──
//
// Criteria proved here (flow-0083):
//   · no literal `--model` value remains in the dispatch step; the worker's claude_args and the
//     report step read the resolver's outputs
//   · a run's step summary names tier, model ID, effort and reason (the resolve step, executed)
//   · a run that ends without a PR escalates the task on main by one tier (the escalate step,
//     executed end to end against a bare origin — the step's logic, not a live run)
//   · TIERS is the only place that maps a tier to a model ID, across `.github/workflows/` and
//     `project-template/.flow/bin/`
// The pure resolver and escalation are proved in `project-template/.flow/bin/task-model.test.mjs`.

const dispatchSteps = () => yamlMod.parse(wfSrc()).jobs.dispatch.steps;
const stepNamed = (re) => dispatchSteps().find((s) => re.test(s.name || ""));
const TEMPLATE_BIN = join(REPO, "project-template", ".flow", "bin");

test("no literal --model value remains in the dispatch step", { skip }, () => {
  const steps = dispatchSteps();
  const work = steps.find((s) => s.id === "work");
  const args = String(work.with.claude_args);
  assert.match(args, /\$\{\{ steps\.model\.outputs\.args \}\}/, "the worker must take the resolver's args");
  assert.doesNotMatch(args.replace(/\$\{\{[^}]*\}\}/g, ""), /--model/, "a literal --model is back in claude_args");
  const report = steps.find((s) => /Report the model/.test(s.name || ""));
  assert.equal(report.env.REQUESTED_MODEL, "${{ steps.model.outputs.model }}");
  const literals = JSON.stringify(steps).replace(/\$\{\{[^}]*\}\}/g, "");
  assert.doesNotMatch(literals, /claude-(haiku|sonnet|opus|fable)-\d/, "a model id is spelled out in the dispatch job");
  const resolveIdx = steps.findIndex((s) => s.id === "model");
  assert.ok(resolveIdx > steps.findIndex((s) => s.id === "pick") && resolveIdx < steps.indexOf(work),
    "the model is resolved after the pick and before the worker");
});

// A consuming repo's checkout: the template's helpers in `.flow/bin/`, one task in the store,
// committed and pushed to a bare `origin` so the escalate step has a real `main` to write.
function adopterRepo(taskText) {
  const dir = mkdtempSync(join(tmpdir(), "qr-model-"));
  const repo = join(dir, "repo"), origin = join(dir, "origin.git");
  const git = (...a) => {
    const r = spawnSync("git", a, { cwd: repo, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`);
    return r.stdout;
  };
  spawnSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  spawnSync("git", ["init", "-q", "-b", "main", repo]);
  for (const d of [".flow/bin", ".flow/tasks"]) spawnSync("mkdir", ["-p", join(repo, d)]);
  for (const f of ["task-model.mjs", "asks.mjs"]) {
    writeFileSync(join(repo, ".flow/bin", f), readFileSync(join(TEMPLATE_BIN, f)));
  }
  writeFileSync(join(repo, ".flow/tasks/proj-0001-x.md"), taskText);
  git("-c", "user.name=t", "-c", "user.email=t@t", "add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  git("remote", "add", "origin", origin);
  git("push", "-q", "origin", "main");
  const onMain = () => spawnSync("git", ["--git-dir", origin, "show", "main:.flow/tasks/proj-0001-x.md"], { encoding: "utf8" }).stdout;
  return { dir, repo, onMain };
}

const TASK = (fm = "") => `---\nid: "PROJ-0001"\ntitle: "t"\nstatus: "in_progress"\n${fm}touches: []\n---\n\nbody\n`;

function runStep(step, cwd, env) {
  const script = join(cwd, "..", `${step.id || "step"}.sh`);
  writeFileSync(script, step.run);
  return spawnSync("bash", ["-eo", "pipefail", script], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
}

test("the resolve step writes args and a summary naming tier, model ID, effort and reason", { skip }, () => {
  const step = stepNamed(/Resolve the worker's model/);
  assert.ok(step && step.id === "model", "a `model` step must resolve the worker's model");
  const { dir, repo } = adopterRepo(TASK('model: "opus"\neffort: "high"\nmodel_reason: "edits CI"\n'));
  try {
    const out = join(dir, "out"), sum = join(dir, "sum");
    writeFileSync(out, ""); writeFileSync(sum, "");
    const r = runStep(step, repo, { TASK_ID: "PROJ-0001", GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum });
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(out, "utf8"), /^args=--model claude-opus-5-5 --effort high$/m);
    assert.match(readFileSync(out, "utf8"), /^model=claude-opus-5-5$/m);
    const summary = readFileSync(sum, "utf8");
    for (const s of ["tier: `opus`", "model: `claude-opus-5-5`", "effort: `high`", "reason: edits CI"]) {
      assert.ok(summary.includes(s), `summary is missing "${s}":\n${summary}`);
    }
    // An invalid value fails the step — the worker never runs on a silent fallback.
    writeFileSync(join(repo, ".flow/tasks/proj-0001-x.md"), TASK('model: "gpt-5"\nmodel_reason: "x"\n'));
    const bad = runStep(step, repo, { TASK_ID: "PROJ-0001", GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stdout + bad.stderr, /model: "gpt-5"/);
    // Bootstrap: no helper synced yet -> no --model, said so, exit 0.
    rmSync(join(repo, ".flow/bin/task-model.mjs"));
    const boot = runStep(step, repo, { TASK_ID: "PROJ-0001", GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum });
    assert.equal(boot.status, 0, boot.stderr);
    assert.match(readFileSync(sum, "utf8"), /no `\.flow\/bin\/task-model\.mjs` in this repo yet/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a run that ends without a PR escalates the task on main by one tier", { skip }, () => {
  const step = stepNamed(/Escalate the task's model/);
  assert.ok(step, "the dispatch job must carry the escalate step");
  assert.match(String(step.if), /!cancelled\(\)/, "it must run after a failed verify step");
  assert.match(String(step.if), /steps\.work\.outcome == 'failure'/);
  const names = dispatchSteps().map((s) => s.name || s.id);
  assert.ok(names.indexOf(step.name) > dispatchSteps().findIndex((s) => s.id === "verify"), "it reads the verify step's facts");
  const { dir, repo, onMain } = adopterRepo(TASK());
  try {
    const sum = join(dir, "sum");
    writeFileSync(sum, "");
    const env = {
      TASK_ID: "PROJ-0001", WORKER_OUTCOME: "failure", FACTS_KNOWN: "1", BRANCH_EXISTS: "0", AHEAD: "0",
      HAS_OPEN_PR: "0", GITHUB_RUN_ID: "4242", RUNNER_TEMP: dir, GITHUB_STEP_SUMMARY: sum,
    };
    const r = runStep(step, repo, env);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const main = onMain();
    assert.match(main, /^model: "opus"$/m, `the task on main was not escalated:\n${main}`);
    assert.match(main, /^model_reason: "escalated after run 4242 ended without a PR \(was sonnet\)"$/m);
    assert.match(readFileSync(sum, "utf8"), /sonnet -> opus/);
    // A run that left an open PR does not escalate.
    const again = runStep(step, repo, { ...env, HAS_OPEN_PR: "1" });
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /no escalation — a PR is open/);
    assert.match(onMain(), /^model: "opus"$/m, "an open PR must leave the model where it was");
    // No facts published -> no escalation on a guess.
    const blind = runStep(step, repo, { ...env, FACTS_KNOWN: "" });
    assert.match(blind.stdout, /not escalating on a guess/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a blocked task is not escalated: the worker's own stop is a legitimate outcome", { skip }, () => {
  const step = stepNamed(/Escalate the task's model/);
  const { dir, repo, onMain } = adopterRepo(TASK().replace('status: "in_progress"', 'status: "blocked"'));
  try {
    const r = runStep(step, repo, {
      TASK_ID: "PROJ-0001", WORKER_OUTCOME: "success", FACTS_KNOWN: "1", BRANCH_EXISTS: "0", AHEAD: "0",
      HAS_OPEN_PR: "0", GITHUB_RUN_ID: "1", RUNNER_TEMP: dir, GITHUB_STEP_SUMMARY: join(dir, "sum"),
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no escalation — the task is blocked on main/);
    assert.doesNotMatch(onMain(), /^model:/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A tier name used as a key or arrow source, pointing at a full model id: `opus: "claude-…"`,
// `sonnet → claude-…`, `fable = 'claude-…'`. `model: "claude-sonnet-5-5"` in flow-review.mjs maps a
// ROLE to an id, not a tier, and is deliberately not matched.
export const TIER_MAPPING = /\b(haiku|sonnet|opus|fable)\b["']?\s*(:|=>|->|→|=)\s*["'`]?claude-[a-z]+-\d/;

test("TIERS is the only place that maps a tier to a model ID", () => {
  const files = [
    ...readdirSync(join(REPO, ".github", "workflows")).filter((n) => /\.ya?ml$/.test(n))
      .map((n) => join(REPO, ".github", "workflows", n)),
    ...readdirSync(TEMPLATE_BIN).filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))
      .map((n) => join(TEMPLATE_BIN, n)),
  ];
  assert.ok(files.length > 10, "the scan found nothing to check");
  const hits = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (TIER_MAPPING.test(line)) hits.push(`${f.slice(REPO.length + 1)}:${i + 1}`);
    });
  }
  const tierFile = "project-template/.flow/bin/task-model.mjs";
  assert.deepEqual(hits.filter((h) => !h.startsWith(`${tierFile}:`)), [], "a second tier -> model-ID table exists");
  assert.equal(hits.length, 4, `task-model.mjs's TIERS must hold the four mappings, found: ${hits.join(", ")}`);
  // The pattern is not vacuous: it catches the shapes a second table would take.
  for (const s of ['  opus: "claude-opus-5-5",', "sonnet → claude-sonnet-5-5", "FABLE=claude-fable-5-1".toLowerCase()]) {
    assert.match(s, TIER_MAPPING);
  }
  assert.doesNotMatch('  model: "claude-sonnet-5-5",', TIER_MAPPING);
});

test("changes/flow-0083.md exists and states the caller action", () => {
  const entry = changelogEntry(REPO, "flow-0083");
  assert.ok(entry.trim(), "changes/flow-0083.md must exist (or be assembled into CHANGELOG.md)");
  assert.match(entry, /\*\*No caller action\*\*/, "the caller action must be stated");
  assert.match(entry, /now build on Sonnet 5\.5/, "adopters must be told unmodelled tasks now build on Sonnet");
});
