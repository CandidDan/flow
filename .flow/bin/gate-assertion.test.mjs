// gate-assertion.test.mjs — the gate's "the guard proved it ran" assertion, tested by running
// the shell it actually ships.
//
// flow-0008. The guards used to fail OPEN: when `touches-guard`'s CLI block silently didn't run
// it exited 0, the gate went green, and scope enforcement — the strongest guarantee Flow makes —
// was off with nothing anywhere saying so. The fix is a decision line every guard prints on
// every run, plus a gate step that fails when that line is absent.
//
// A gate assertion is only worth having if it fails when it should, so this file does not
// re-implement the check and test the re-implementation. It parses `_flow-gates.yml`, pulls the
// `run:` scripts out of the real steps, and executes them under `bash -e` — the same shell
// GitHub uses for a `run:` block (`bash -e {0}`; note pipefail is NOT on by default, which one
// of the tests below turns out to depend on).
//
// The decisive case is "a deliberately no-op'd guard": an empty log, standing in for a guard
// that ran, printed nothing and exited 0. If that passes, the assertion is decoration.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// DEPENDENCY NOTE — same shape as check-workflows.test.mjs, for the same reason. The
// `flow-tooling` job in `_flow-gates.yml` runs `node --test .flow/bin/*.test.mjs` with NO
// install step, so `yaml` is not there. These tests skip *visibly* ("# SKIP") in that job and
// run for real in the per-stack gate job, which does `npm ci` and then `npm test`.
//
// A printed skip is not a silent no-op; a module-not-found crash is not a gate result at all —
// which is precisely the distinction this whole task exists to draw, so a static import here
// would have been the task contradicting itself in its own test file.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW = join(REPO, ".github", "workflows", "_flow-gates.yml");
const wf = yamlMod ? yamlMod.parse(readFileSync(WORKFLOW, "utf8")) : null;

// The `run:` script of the uniquely-named step in `job`. Fails loudly rather than returning
// undefined: a renamed step must break this file, not quietly stop testing anything.
function stepScript(job, name) {
  if (!wf) return null;                       // skipped runs never reach the assertions
  const steps = wf.jobs?.[job]?.steps ?? [];
  const found = steps.filter((s) => s.name === name);
  assert.equal(found.length, 1,
    `expected exactly one step named ${JSON.stringify(name)} in job '${job}', found ${found.length}. ` +
    `If it was renamed, update this test — do not let the assertion go untested.`);
  return found[0].run;
}

const STORE_GUARD = stepScript("gate", "Guard — store is main-only");
const STORE_ASSERT = stepScript("gate", "Assert — the store-guard proved it ran");
const TOUCHES_STEP = stepScript("touches", "touches-guard — diff stays within declared scope");
const TOUCHES_ASSERT = stepScript("touches", "Assert — the touches-guard proved it ran");

// Run a `run:` script the way Actions does: `bash -e <file>` with the step's env. Note the
// shell: Actions' default is `bash -e {0}`, so `-e` is on and pipefail is NOT — running these
// under anything stricter would test a shell the gate never uses.
function runScript(script, env = {}, cwd = null) {
  const dir = mkdtempSync(join(tmpdir(), "flow-gate-"));
  const file = join(dir, "step.sh");
  writeFileSync(file, script);
  try {
    const stdout = execFileSync("bash", ["-e", file], {
      encoding: "utf8", stdio: "pipe", cwd: cwd ?? dir,
      env: { ...process.env, ...env },
    });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A log file holding `contents`, plus the env the assertion step reads.
function withLog(contents, prefix) {
  const dir = mkdtempSync(join(tmpdir(), "flow-log-"));
  const log = join(dir, "guard.log");
  if (contents !== null) writeFileSync(log, contents);
  return { dir, env: { DECISION_LOG: log, DECISION_PREFIX: prefix } };
}

// ── One rule, both guards ────────────────────────────────────────────────────────────────
// Task scope: "apply the same treatment to the store-guard step, which shares the fail-open
// shape". Two copies that drift are two different rules wearing one name, so pin them equal.
test("both guards are asserted by the identical script (one rule, not two)", { skip }, () => {
  assert.equal(TOUCHES_ASSERT, STORE_ASSERT,
    "the store-guard and touches-guard assertions have diverged — the fail-open shape is only " +
    "closed for whichever one is stricter.");
});

// ── AC#3 / AC#6 — absence of a decision is a FAILURE, not a pass ─────────────────────────
test("AC#6: the assertion FAILS against a deliberately no-op'd guard (empty output)", { skip }, () => {
  const { dir, env } = withLog("", "touches-guard: decision=");
  const r = runScript(TOUCHES_ASSERT, env);
  assert.equal(r.code, 1,
    "a guard that produced NOTHING passed the assertion — the assertion is testing the presence " +
    "of a line it never had to observe, which is the fail-open bug wearing a green tick.");
  assert.match(r.out, /the guard did not run/);
  rmSync(dir, { recursive: true, force: true });
});

test("AC#3: the assertion FAILS when the guard produced no log at all", { skip }, () => {
  const { dir, env } = withLog(null, "touches-guard: decision=");
  const r = runScript(TOUCHES_ASSERT, env);
  assert.equal(r.code, 1, "a missing log must fail, not error out or pass");
  assert.match(r.out, /the guard did not run/);
  rmSync(dir, { recursive: true, force: true });
});

test("AC#3: prose without a decision line still fails — the old output is not enough", { skip }, () => {
  // Exactly what the pre-flow-0008 guard printed on its happy path. It must no longer satisfy
  // the gate on its own, or adopting repos would silently keep the old contract.
  const { dir, env } = withLog(
    "touches-guard: flow-0008 — 4 feature file(s) checked against 5 glob(s).\n" +
    "touches-guard: all changed files are within scope ✓\n", "touches-guard: decision=");
  const r = runScript(TOUCHES_ASSERT, env);
  assert.equal(r.code, 1);
  rmSync(dir, { recursive: true, force: true });
});

// ── AC#1 / AC#2 — a stated decision passes, enforced or skipped ──────────────────────────
test("AC#1: an `enforced` decision line satisfies the assertion", { skip }, () => {
  const { dir, env } = withLog(
    "touches-guard: decision=enforced reason=in-scope task=flow-0008 checked=4 globs=5 outside=0\n",
    "touches-guard: decision=");
  const r = runScript(TOUCHES_ASSERT, env);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /decision=enforced reason=in-scope/, "the decision is echoed into the job log");
  rmSync(dir, { recursive: true, force: true });
});

test("AC#2: a `skipped` decision naming its reason passes — a legitimate skip stays green", { skip }, () => {
  const { dir, env } = withLog(
    "touches-guard: no task id in branch 'dependabot/npm/x' or title 'Bump x' — skipping.\n" +
    "touches-guard: decision=skipped reason=no-task-id task=- checked=0 globs=0 outside=0\n",
    "touches-guard: decision=");
  const r = runScript(TOUCHES_ASSERT, env);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /reason=no-task-id/);
  rmSync(dir, { recursive: true, force: true });
});

// ── AC#5 — the parse is anchored on a fixed token ────────────────────────────────────────
test("AC#5: the match is anchored — the token mid-line does not count", { skip }, () => {
  const { dir, env } = withLog(
    "note: we print touches-guard: decision=enforced when we get around to it\n",
    "touches-guard: decision=");
  const r = runScript(TOUCHES_ASSERT, env);
  assert.equal(r.code, 1,
    "a loose substring match would accept prose that merely mentions the token — including a " +
    "guard's own documentation echoed into the log.");
  rmSync(dir, { recursive: true, force: true });
});

test("AC#5: the prefix is a fixed token, so a reworded guard message alone cannot satisfy it", { skip }, () => {
  const { dir, env } = withLog(
    "touches-guard: DECISION = enforced\n", "touches-guard: decision=");
  const r = runScript(TOUCHES_ASSERT, env);
  assert.equal(r.code, 1);
  rmSync(dir, { recursive: true, force: true });
});

// ── The store-guard now states its decision too ──────────────────────────────────────────
// Built against a real git repo so the script is exercised, not paraphrased.
function storeFixture(extraFile) {
  const root = mkdtempSync(join(tmpdir(), "flow-store-"));
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  writeFileSync(join(root, "seed.txt"), "seed\n");
  git("add", "-A"); git("commit", "-qm", "base");
  // `origin/main` is what the script diffs against; a local ref of that name is enough.
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-q", "-b", "work");
  mkdirSync(join(root, dirname(extraFile)), { recursive: true });
  writeFileSync(join(root, extraFile), "x\n");
  git("add", "-A"); git("commit", "-qm", "change");
  return root;
}

test("store-guard states `clean` on a code-only diff, and passes", { skip }, () => {
  const root = storeFixture("src/app.mjs");
  const log = join(root, "store.log");
  const r = runScript(STORE_GUARD, { BASE_BRANCH: "main", DECISION_LOG: log }, root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^store-guard: decision=enforced reason=clean files=0$/m);
  rmSync(root, { recursive: true, force: true });
});

test("store-guard states `store-modified` and FAILS when a branch edits .flow/tasks/", { skip }, () => {
  const root = storeFixture(".flow/tasks/flow-0008-x.md");
  const log = join(root, "store.log");
  const r = runScript(STORE_GUARD, { BASE_BRANCH: "main", DECISION_LOG: log }, root);
  assert.equal(r.code, 1, "a branch that edited the store must still be rejected");
  assert.match(r.out, /^store-guard: decision=enforced reason=store-modified files=1$/m);
  assert.match(r.out, /offending: \.flow\/tasks\/flow-0008-x\.md/);
  rmSync(root, { recursive: true, force: true });
});

test("the store-guard's decision line satisfies its own assertion end to end", { skip }, () => {
  const root = storeFixture("src/app.mjs");
  const log = join(root, "store.log");
  runScript(STORE_GUARD, { BASE_BRANCH: "main", DECISION_LOG: log }, root);
  const r = runScript(STORE_ASSERT, { DECISION_LOG: log, DECISION_PREFIX: "store-guard: decision=" });
  assert.equal(r.code, 0, r.out);
  rmSync(root, { recursive: true, force: true });
});

// ── The capture must not swallow the guard's exit code ───────────────────────────────────
// Piping the guard through `tee` to capture its decision line is what makes the assertion
// possible — and, without `set -o pipefail`, is also what would let out-of-scope drift pass.
// Actions' default shell is `bash -e {0}`: pipefail is off, so `false | tee` exits 0.
function touchesStepWithStub(script, exitCode) {
  return script
    .replace(/git fetch [^\n]*/, "true")
    .replace(/node \.flow\/bin\/touches-guard\.mjs/, `sh -c 'echo stub; exit ${exitCode}'`);
}

test("a failing touches-guard fails the step despite being piped through tee", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-pipe-"));
  const r = runScript(touchesStepWithStub(TOUCHES_STEP, 1),
    { BASE_BRANCH: "main", DECISION_LOG: join(dir, "t.log") });
  assert.equal(r.code, 1, "out-of-scope drift must still fail the gate after the tee capture");
  rmSync(dir, { recursive: true, force: true });
});

test("without `set -o pipefail` that same failure would pass — the line is load-bearing", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-pipe-"));
  const stripped = touchesStepWithStub(TOUCHES_STEP, 1).replace(/^\s*set -o pipefail\s*$/m, "");
  assert.notEqual(stripped, touchesStepWithStub(TOUCHES_STEP, 1),
    "`set -o pipefail` is no longer in the step — removing it silently re-opens the guard");
  const r = runScript(stripped, { BASE_BRANCH: "main", DECISION_LOG: join(dir, "t.log") });
  assert.equal(r.code, 0,
    "sanity: this is the fail-open the pipefail line prevents. If this now fails, the shell " +
    "changed its defaults and the comment in the workflow needs revisiting.");
  rmSync(dir, { recursive: true, force: true });
});
