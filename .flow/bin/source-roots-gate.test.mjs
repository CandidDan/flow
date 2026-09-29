// source-roots-gate.test.mjs — the structural half of flow-0077's proof.
//
// `source-roots.mjs` and its tests prove what the HELPER decides. This file proves the other
// half: that `_flow-gates.yml` actually wires it up, and wires it up safely. Those are different
// failures. A perfect planner whose matrix job never calls it is a tree that silently stops being
// gated, and the symptom — a green PR — is indistinguishable from the tree being clean.
//
// Criteria proved here:
//   · the matrix job `needs:` the plan job, is conditional on a non-zero count, and its matrix
//     comes from the plan job's output
//   · `actions/setup-node` runs only for `runtime: node`, `denoland/setup-deno` only for
//     `runtime: deno`, and neither for `none`
//   · the matrix job actually runs `source-roots.mjs run` — the wiring is end-to-end
//   · NO `run:` block in either new job contains `${{ matrix.` — matrix values reach the shell
//     through `env:` only (the task's security note)
//   · every new third-party `uses:` is pinned to a 40-character SHA
//   · the plan job fails with an `::error` naming `.flow/bin/source-roots.mjs` when the consumer
//     has not synced it
//
// Each is asserted against a MUTATED copy of the real file as well as the file itself, where a
// mutation is meaningful: an assertion that only ever sees a passing input has never been shown
// to fail, and "this workflow is fine" is precisely the claim nobody can check by eye.
//
// Why canonical's own test and not the template's: it asserts facts about
// `.github/workflows/_flow-gates.yml`, which exists only here. An adopting repo has a thin
// caller, not the reusable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const GATES = join(REPO, ".github", "workflows", "_flow-gates.yml");
const source = readFileSync(GATES, "utf8");

// `yaml` is a devDependency, and the `flow-tooling` job runs `node --test .flow/bin/*.test.mjs`
// with no install step — so when it is missing these skip VISIBLY instead of crashing the job.
// They run for real in the per-stack gate job, which installs first. Same guard as
// sync-permissions.test.mjs.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const PLAN_JOB = "source-roots-plan";
const MATRIX_JOB = "source-root";
// flow-0094: the gate no longer runs the CALLER's copy. `_flow-gates.yml` fetches canonical's
// `project-template/.flow/bin/` at its own commit into `$FLOW_BIN` and runs that, so a release
// that makes the gate need a new helper cannot strand a repo that has not synced yet.
const HELPER = '"$FLOW_BIN"/source-roots.mjs';
const CALLER_COPY = ".flow/bin/source-roots.mjs";

const parse = (text = source) => yamlMod.parse(text);
const jobs = (text) => parse(text).jobs;
/** Every `run:` script in one job, concatenated. */
const runScripts = (job) => (job.steps ?? []).map((s) => s.run ?? "").join("\n");

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: the matrix job depends on the plan job and is conditional on a non-zero count
// ─────────────────────────────────────────────────────────────────────────────────────────

test("both jobs exist, and the matrix job needs the plan job", { skip }, () => {
  const j = jobs(source);
  assert.ok(j[PLAN_JOB], `${PLAN_JOB} must exist — the matrix has to come from somewhere`);
  assert.ok(j[MATRIX_JOB], `${MATRIX_JOB} must exist`);
  const needs = [].concat(j[MATRIX_JOB].needs ?? []);
  assert.ok(needs.includes(PLAN_JOB),
    `${MATRIX_JOB} must need ${PLAN_JOB}; without it the matrix expression resolves to nothing`);
});

test("the plan job publishes matrix AND count as outputs", { skip }, () => {
  const outputs = jobs(source)[PLAN_JOB].outputs ?? {};
  assert.ok(outputs.matrix, "no `matrix` output — the fan-out has no input");
  assert.ok(outputs.count, "no `count` output — the conditional has nothing to read");
  for (const [name, expr] of Object.entries(outputs)) {
    assert.match(expr, /steps\.\w+\.outputs\./, `output ${name} must come from a step, not a literal`);
  }
});

test("the matrix job is conditional on a non-zero count — an empty plan SKIPS, never fails", { skip }, () => {
  const job = jobs(source)[MATRIX_JOB];
  assert.ok(job.if, "no `if` — with an empty include list Actions errors instead of skipping, " +
    "which would make every single-tree repo (and canonical) permanently red");
  const cond = String(job.if);
  assert.match(cond, new RegExp(`needs\\.${PLAN_JOB}\\.outputs\\.count`),
    "the condition must read the plan job's count");
  assert.match(cond, /!=\s*'0'|>\s*0|!=\s*"0"/, `the condition must test for non-zero, got: ${cond}`);
});

test("the matrix itself comes from the plan job's output, via fromJSON", { skip }, () => {
  const strategy = jobs(source)[MATRIX_JOB].strategy ?? {};
  assert.match(String(strategy.matrix), new RegExp(`fromJSON\\(\\s*needs\\.${PLAN_JOB}\\.outputs\\.matrix`),
    "a hardcoded matrix would ignore the config this whole job exists to read");
  assert.equal(strategy["fail-fast"], false,
    "fail-fast would cancel the other trees' jobs on the first failure, hiding whether they were clean");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: setup-node only for node, setup-deno only for deno, neither for none
// ─────────────────────────────────────────────────────────────────────────────────────────

/** The steps of the matrix job that `uses:` the given action. */
const stepsUsing = (action, text = source) =>
  (jobs(text)[MATRIX_JOB].steps ?? []).filter((s) => String(s.uses ?? "").startsWith(action + "@"));

test("actions/setup-node in the matrix job runs ONLY when runtime is node", { skip }, () => {
  const steps = stepsUsing("actions/setup-node");
  assert.equal(steps.length, 1, "exactly one Node setup step");
  assert.equal(String(steps[0].if).trim(), "matrix.runtime == 'node'",
    "an unconditional setup-node would install Node into a Deno job for nothing, and would make " +
    "`runtime: none` a lie");
});

test("denoland/setup-deno runs ONLY when runtime is deno", { skip }, () => {
  const steps = stepsUsing("denoland/setup-deno");
  assert.equal(steps.length, 1, "exactly one Deno setup step — `runtime: deno` is the whole reason " +
    "Nudge's edge-parse job cannot become a config entry without this");
  assert.equal(String(steps[0].if).trim(), "matrix.runtime == 'deno'");
});

test("each setup step takes its version from the matrix, not a literal", { skip }, () => {
  assert.match(String(stepsUsing("actions/setup-node")[0].with["node-version"]), /matrix\.version/);
  assert.match(String(stepsUsing("denoland/setup-deno")[0].with["deno-version"]), /matrix\.version/);
});

test("`runtime: none` reaches neither setup step — every setup step in the job is guarded", { skip }, () => {
  const setups = (jobs(source)[MATRIX_JOB].steps ?? []).filter((s) => /setup-(node|deno)@/.test(String(s.uses ?? "")));
  assert.ok(setups.length > 0);
  for (const s of setups) {
    assert.ok(s.if, `${s.uses} has no \`if\` — it would run for runtime: none`);
    assert.match(String(s.if), /matrix\.runtime ==/,
      `${s.uses} must be gated on the entry's runtime, nothing else`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: the matrix job actually RUNS the helper
// ─────────────────────────────────────────────────────────────────────────────────────────

test("the matrix job runs `source-roots.mjs run`, and the plan job runs `source-roots.mjs plan`", { skip }, () => {
  const j = jobs(source);
  assert.ok(runScripts(j[MATRIX_JOB]).includes(`node ${HELPER} run`),
    "the fan-out must invoke the runner; a matrix that sets up a toolchain and checks nothing is worse than no job");
  assert.ok(runScripts(j[PLAN_JOB]).includes(`node ${HELPER} plan`));
  for (const name of [PLAN_JOB, MATRIX_JOB]) {
    assert.ok(!runScripts(j[name]).includes(`node ${CALLER_COPY}`),
      `${name} must not run the caller's own copy — that is the 2.1.0 fleet break, where every ` +
      "@v2 repo went red on a helper it had no way to have yet");
  }
});

/** The step that runs the DECLARED check — not flow-0097's install step, which runs the helper too. */
const checkStep = (text = source) =>
  (jobs(text)[MATRIX_JOB].steps ?? [])
    .find((s) => /source-roots\.mjs run/.test(s.run ?? "") && /matrix\.check/.test(String(s.env?.FLOW_SOURCE_ROOT_CHECK ?? "")));

test("the check's values reach the runner through env, and all three are passed", { skip }, () => {
  const step = checkStep();
  assert.ok(step, "no step runs the helper");
  const env = step.env ?? {};
  assert.match(String(env.FLOW_SOURCE_ROOT_CHECK), /matrix\.check/);
  assert.match(String(env.FLOW_SOURCE_ROOT_RETRY), /matrix\.retry/);
  assert.match(String(env.FLOW_SOURCE_ROOT_PATH), /matrix\.path/,
    "without the path the job log cannot say which tree failed");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: no `run:` block in the new jobs contains `${{ matrix.` (the security note)
// ─────────────────────────────────────────────────────────────────────────────────────────

test("no `run:` block in either new job interpolates a matrix value", { skip }, () => {
  const j = jobs(source);
  for (const name of [PLAN_JOB, MATRIX_JOB]) {
    const script = runScripts(j[name]);
    assert.ok(!script.includes("${{ matrix."),
      `${name} pastes a matrix value into a shell script. \`path\` and \`check\` come from ` +
      ".flow/config.yml, which a PR can edit; Actions substitutes the text before bash parses it, " +
      "so a crafted value escapes the quoting. Pass it through `env:`.");
    assert.ok(!/\$\{\{\s*matrix\./.test(script), `${name}: same rule, whitespace variants included`);
  }
});

test("no `run:` block ANYWHERE in the file interpolates a matrix value", { skip }, () => {
  for (const [name, job] of Object.entries(jobs(source))) {
    assert.ok(!/\$\{\{\s*matrix\./.test(runScripts(job)),
      `${name}: a later job must not reintroduce the shape flow-0077 closed`);
  }
});

test("the rule fails against a mutated copy — moving the check into the `run:` line is caught", { skip }, () => {
  // `run: node "$FLOW_BIN"/source-roots.mjs run` now appears twice (flow-0097 added an install
  // step that reuses the helper), so mutate the LAST one — the declared-check step.
  const marker = `        run: node ${HELPER} run`;
  const at = source.lastIndexOf(marker);
  assert.ok(at > -1, "the check step's run line must be findable, or this proves nothing");
  const mutated = source.slice(0, at) +
    `        run: node ${HELPER} run "\${{ matrix.check }}"` +
    source.slice(at + marker.length);
  assert.notEqual(mutated, source, "the mutation must actually apply, or this proves nothing");
  const offenders = Object.entries(jobs(mutated))
    .filter(([, job]) => /\$\{\{\s*matrix\./.test(runScripts(job)))
    .map(([name]) => name);
  assert.deepEqual(offenders, [MATRIX_JOB], "the check must catch exactly this");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: every new third-party `uses:` is pinned to a 40-character SHA
// ─────────────────────────────────────────────────────────────────────────────────────────

const SHA_RE = /^[0-9a-f]{40}$/;

test("every `uses:` in the two new jobs is pinned to a 40-hex SHA with a version comment", { skip }, () => {
  const j = jobs(source);
  const used = [PLAN_JOB, MATRIX_JOB].flatMap((n) => (j[n].steps ?? []).map((s) => s.uses).filter(Boolean));
  assert.ok(used.length >= 4, `expected checkout + setups in the new jobs, got ${JSON.stringify(used)}`);
  for (const u of used) {
    const [, ref] = String(u).split("@");
    assert.match(ref, SHA_RE, `uses: ${u} is not pinned — a tag can be moved by whoever owns the repo`);
  }
});

test("denoland/setup-deno is pinned, and its line carries a readable version comment", { skip: false }, () => {
  const line = source.split("\n").find((l) => l.includes("denoland/setup-deno@"));
  assert.ok(line, "the Deno setup step must exist");
  assert.match(line, /denoland\/setup-deno@[0-9a-f]{40}\s+#\s*v?\d+(\.\d+)*/,
    "flow-0031's rule: a 40-hex SHA plus a `# vX.Y.Z` comment so a reviewer can read the version " +
    "without resolving it. `.flow/bin/action-pins.test.mjs` enforces this repo-wide; this names " +
    "the action flow-0077 introduced, so removing the pin fails by name.");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: a consumer missing the helper gets a named error, not ERR_MODULE_NOT_FOUND
// ─────────────────────────────────────────────────────────────────────────────────────────

test("the plan job no longer guards for a missing helper — it cannot be missing (flow-0094)", { skip }, () => {
  const script = runScripts(jobs(source)[PLAN_JOB]);
  assert.ok(!script.includes(`! -f ${CALLER_COPY}`),
    "the `[ ! -f .flow/bin/source-roots.mjs ]` branch guarded against a caller that bumped its " +
    "workflow refs without syncing .flow/bin/. The helper now arrives WITH the workflow, so that " +
    "state is unreachable and the branch is dead code telling a caller to run a sync it does not need");
  assert.ok(!/flow-sync/.test(script),
    "and the advice must go with it — a gate that tells a repo to sync a helper it no longer uses " +
    "sends the next person to fix the wrong thing");
  assert.ok(script.includes(`node ${HELPER} plan`), "it still plans, from the fetched canonical copy");
});

test("the plan job materialises canonical's helpers BEFORE invoking one, and pins a commit", { skip }, () => {
  const steps = jobs(source)[PLAN_JOB].steps ?? [];
  const fetchAt = steps.findIndex((st) => /job\.workflow_sha/.test(JSON.stringify(st.env ?? {})));
  const planAt = steps.findIndex((st) => String(st.run ?? "").includes(`node ${HELPER} plan`));
  assert.ok(fetchAt > -1, "no step resolves this workflow's own commit — see docs/adr/0008-helpers-from-canonical.md");
  assert.ok(planAt > -1, "no step plans");
  assert.ok(fetchAt < planAt, "fetching after the call means node has already died with its own message");

  const fetch = String(steps[fetchAt].run ?? "");
  assert.ok(/refs\/heads\/\*\)/.test(fetch) && /main\|master\|HEAD/.test(fetch),
    "a moving branch must be REFUSED, not fetched: a gate that follows `main` cannot be " +
    "reproduced from a run log, and every run of it gates against something different");
  assert.ok(!/@main|origin\/main/.test(fetch), "and `main` must not appear as a fetch target at all");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// The jobs this task must NOT have touched
// ─────────────────────────────────────────────────────────────────────────────────────────

test("gate, flow-tooling and touches are still present and still do their own work", { skip }, () => {
  const j = jobs(source);
  for (const name of ["gate", "flow-tooling", "touches"]) {
    assert.ok(j[name], `${name} must survive — flow-0077 adds jobs, it does not restructure the gate`);
  }
  assert.match(runScripts(j.gate), /store-guard: decision=/, "the store-guard's decision line is a CI contract");
  assert.ok(!j.gate.needs, "the primary gate must not have been made to wait on the plan job");
  assert.ok(!j["flow-tooling"].needs);
});

test("the workflow still declares `on: workflow_call` with the setup_node_version input intact", { skip }, () => {
  const wf = parse(source);
  const call = wf.on?.workflow_call ?? wf[true]?.workflow_call;
  assert.ok(call, "this is a reusable; losing workflow_call breaks every caller at once");
  assert.equal(call.inputs.setup_node_version.default, "22",
    "flow-0077 does not touch this input — a changed default would silently alter every consumer's gate");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// flow-0087: the job name is static, so a SKIPPED job does not show a raw expression
// ─────────────────────────────────────────────────────────────────────────────────────────

// GitHub never evaluates the name of a skipped job, and this job skips in canonical and in every
// single-tree repo. An expression in the name is therefore printed verbatim on most PRs, as
// `source-root (${{ matrix.path }})`, which reads as broken templating.
const nameHasExpression = (text) => /\$\{\{/.test(String(jobs(text)[MATRIX_JOB].name ?? ""));

test("flow-0087: the source-root job name carries no ${{ }} expression", { skip }, () => {
  assert.equal(nameHasExpression(source), false,
    "a skipped job's name is never evaluated, so an expression in it shows up raw on the PR");

  // Proved against a mutated copy too: the assertion must be able to fail.
  const mutated = source.replace(/^(\s+)name: source-root$/m, "$1name: source-root (${{ matrix.path }})");
  assert.notEqual(mutated, source, "the mutation must actually change the file");
  assert.equal(nameHasExpression(mutated), true, "the check must catch the old templated name");
});

test("flow-0087: the source-root job name is exactly `source-root`", { skip }, () => {
  assert.equal(jobs(source)[MATRIX_JOB].name, "source-root",
    "GitHub appends matrix values to a static name when the job runs; skipped, it reads plainly");
});
