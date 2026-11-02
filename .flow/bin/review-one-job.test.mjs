// review-one-job.test.mjs — proving tests for flow-0193 (5.0.0): qa, code-review and security run
// in ONE `review` job and each posts a CHECK RUN of its own name; the auto-fix round reads those
// check runs; the callers grant the one new scope each; Flow is on v5.
//
// The helper halves are proved where the logic lives: `checkRunPayload` in
// project-template/.flow/bin/flow-review.test.mjs, `failedReviewChecks` in flow-kickback.test.mjs.
// This file holds the workflows, the callers, the version and the doc to the design.
//
// DEPENDENCY NOTE — same as flow-review-workflow.test.mjs: the workflow tests need `yaml`, so they
// skip visibly in the no-install `flow-tooling` job and run for real after `npm ci`.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";
const parse = (path) => (yamlMod ? yamlMod.parse(readFileSync(path, "utf8")) : { jobs: {} });

const wf = parse(join(REPO, ".github/workflows/_flow-review.yml"));
const kickback = parse(join(REPO, ".github/workflows/_flow-kickback.yml"));

const CHECKS = ["qa", "code-review", "security"];
const MODEL_ACTION = "anthropics/claude-code-action";
const isModelStep = (s) => String(s.uses ?? "").startsWith(MODEL_ACTION);
const verdictPath = (check) => `$RUNNER_TEMP/flow-review/${check}.json`;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CREATES_CHECK_RUN = /check-runs\b|flow-review\.mjs check-run\b/;

// Which review a model step is: read from the verdict file its prompt is told to write.
const checkOfModelStep = (s) =>
  CHECKS.find((c) => String(s.with?.prompt ?? "").includes(`Write \${{ runner.temp }}/flow-review/${c}.json`));

// ── criterion 1: one job, three model steps, each fenced by a delete and a check run ───────

test("criterion 1: qa, code-review and security run in ONE job, the review job", { skip }, () => {
  const owners = new Map();
  for (const [name, job] of Object.entries(wf.jobs)) {
    for (const s of (job.steps ?? []).filter(isModelStep)) {
      const check = checkOfModelStep(s);
      if (check) owners.set(check, [...(owners.get(check) ?? []), name]);
    }
  }
  for (const check of CHECKS) {
    assert.deepEqual(owners.get(check), ["review"],
      `${check} must make exactly one model call, and it must be in the review job`);
  }
});

test("criterion 1: each model step is preceded by a step deleting its verdict file", { skip }, () => {
  const steps = wf.jobs.review.steps;
  const models = steps.map((s, i) => [s, i]).filter(([s]) => isModelStep(s));
  assert.equal(models.length, 3, "the review job makes exactly three model calls");
  let previousModel = -1;
  for (const [model, at] of models) {
    const check = checkOfModelStep(model);
    const del = steps.findIndex((s) => new RegExp(`rm -f "${escape(verdictPath(check))}"`).test(String(s.run ?? "")));
    assert.ok(del > previousModel && del < at,
      `${check}: the step deleting ${verdictPath(check)} must sit between the previous model step and this one`);
    previousModel = at;
  }
});

test("criterion 1: each model step is followed, before the next model step, by a step that validates its file and creates its check run", { skip }, () => {
  const steps = wf.jobs.review.steps;
  const modelAt = steps.map((s, i) => (isModelStep(s) ? i : -1)).filter((i) => i >= 0);
  for (const [n, at] of modelAt.entries()) {
    const check = checkOfModelStep(steps[at]);
    const next = modelAt[n + 1] ?? steps.length;
    const between = steps.slice(at + 1, next);
    const creator = between.filter((s) => CREATES_CHECK_RUN.test(String(s.run ?? "")));
    assert.equal(creator.length, 1,
      `${check}: exactly one step between its model step and the next one creates its check run`);
    const run = String(creator[0].run);
    assert.match(run, new RegExp(`flow-review\\.mjs check-run "${escape(verdictPath(check))}" --check ${escape(check)}\\b`),
      `${check}: the step validates ${verdictPath(check)} with the helper`);
    assert.match(run, /gh api -X POST "repos\/\$GITHUB_REPOSITORY\/check-runs" --input "\$payload"/,
      `${check}: …and creates the check run from the helper's payload`);
    assert.ok(!isModelStep(creator[0]), "the step that creates the check run is not a model step");
    assert.equal(creator[0].env?.HEAD_SHA, "${{ github.event.pull_request.head.sha }}",
      `${check}: the check run goes on the PR head`);
  }
});

test("criterion 2: the review job fails when any of the three checks failed or did not report", { skip }, () => {
  const steps = wf.jobs.review.steps;
  const last = steps[steps.length - 1];
  assert.match(String(last.name), /Fail the review job/);
  assert.equal(last.if, "${{ !cancelled() }}");
  for (const [key, id] of [["QA", "qa_check"], ["CODE_REVIEW", "code_review_check"], ["SECURITY", "security_check"]]) {
    assert.equal(last.env?.[key], `\${{ steps.${id}.outcome }}/\${{ steps.${id}.outputs.conclusion }}`);
  }
  const run = String(last.run);
  assert.match(run, /\[ "\$QA" = "success\/success" \]/, "qa passes only on a created, successful check run");
  assert.match(run, /\[ "\$CODE_REVIEW" = "success\/success" \]/);
  assert.match(run, /success\/success\|success\/skipped\) ;;/, "security may also be skipped, nothing else");
  assert.match(run, /exit 1/);
});

// ── criterion 2: no other job starts a runner, and the advisory jobs create no check run ──

test("criterion 2: on a non-intent PR no job other than plan, review, guide and intent-review starts a runner", { skip }, () => {
  assert.deepEqual(Object.keys(wf.jobs).sort(), ["guide", "intent-review", "plan", "review"],
    "the only jobs in the file — so the only jobs that could start a runner");
  assert.equal(wf.jobs["intent-review"].if, "${{ needs.plan.outputs.intent_pr == 'true' }}",
    "intent-review starts only on an intent PR, so a non-intent PR starts plan, review and guide");
  assert.equal(wf.jobs.review.if, undefined, "review runs whenever plan does");
});

test("criterion 2: no step in guide or intent-review creates a check run, and neither job holds checks:", { skip }, () => {
  for (const name of ["guide", "intent-review"]) {
    const job = wf.jobs[name];
    for (const s of job.steps ?? []) {
      assert.doesNotMatch(String(s.run ?? ""), CREATES_CHECK_RUN, `${name}: "${s.name ?? s.uses}" creates a check run`);
    }
    assert.equal(job.permissions?.checks, undefined, `${name} must not hold a checks: scope`);
    assert.equal(job["continue-on-error"], true, `${name} stays advisory`);
  }
  for (const [name, job] of Object.entries(wf.jobs)) {
    if (name === "review") continue;
    assert.equal(job.permissions, undefined, `only the review job declares its own permissions (${name} does)`);
  }
});

// ── criterion 4: the auto-fix round reads check runs, never job names ─────────────────────

test("criterion 4: kickback decides from the head SHA's check runs, through the helper, not from job names", { skip }, () => {
  const plan = kickback.jobs.plan;
  const failed = plan.steps.find((s) => s.id === "failed");
  const run = String(failed.run);
  assert.match(run, /gh api --paginate --slurp "repos\/\{owner\}\/\{repo\}\/commits\/\$HEAD_SHA\/check-runs"/);
  assert.match(run, /node \.flow\/bin\/flow-kickback\.mjs failed-checks "\$RUNNER_TEMP\/check-runs\.json"/);
  assert.equal(failed.env?.HEAD_SHA, "${{ github.event.workflow_run.head_sha }}",
    "the check runs of the commit the review run reviewed");
  assert.doesNotMatch(JSON.stringify(kickback), /actions\/runs\/\$RUN_ID\/jobs/, "the jobs API is gone");
  assert.equal(plan.permissions.checks, "read");
  assert.equal(plan.permissions.actions, undefined, "no job reads the Actions API any more");
  for (const [name, job] of Object.entries(kickback.jobs)) {
    if (name !== "plan") assert.equal(job.permissions?.checks, undefined, `${name} must not hold checks:`);
  }
});

// ── criterion 5: the callers grant exactly one new scope each ──────────────────────────────

const V4_REVIEW = { contents: "read", "pull-requests": "write", issues: "read", "id-token": "write" };
const V4_KICKBACK = { contents: "read", "pull-requests": "write", issues: "write", actions: "read", "id-token": "write" };

// Every flow-*.yml caller's job permissions, keyed by file, from the commit before flow-0193 (the
// v4 baseline for the two callers it changes is pinned above; every other caller must not move).
const callerPerms = (dir) => Object.fromEntries(readdirSync(dir).filter((f) => /^flow-.*\.yml$/.test(f))
  .map((f) => [f, Object.fromEntries(Object.entries(parse(join(dir, f)).jobs ?? {}).map(([n, j]) => [n, j.permissions ?? null]))]));

test("criterion 5: both review callers add checks: write, both kickback callers add checks: read, and no permission was added anywhere else", { skip }, () => {
  for (const dir of [join(REPO, ".github/workflows"), join(TEMPLATE, ".github/workflows")]) {
    const review = parse(join(dir, "flow-review.yml")).jobs["flow-review"].permissions;
    assert.deepEqual(review, { ...V4_REVIEW, checks: "write" }, `${dir}/flow-review.yml: checks: write and nothing else new`);
    const kick = parse(join(dir, "flow-kickback.yml")).jobs["flow-kickback"].permissions;
    // `actions: read` is dropped, not added: no reusable job uses the Actions API any more, and a
    // caller grants exactly the union of its reusable's jobs (flow-kickback-workflow.test.mjs).
    const { actions, ...rest } = V4_KICKBACK;
    assert.equal(actions, "read");
    assert.deepEqual(kick, { ...rest, checks: "read" }, `${dir}/flow-kickback.yml: checks: read and nothing else new`);
  }
  // No OTHER caller gained a checks: scope.
  for (const dir of [join(REPO, ".github/workflows"), join(TEMPLATE, ".github/workflows")]) {
    for (const [file, jobs] of Object.entries(callerPerms(dir))) {
      if (file === "flow-review.yml" || file === "flow-kickback.yml") continue;
      for (const [job, perms] of Object.entries(jobs)) {
        assert.equal(perms?.checks, undefined, `${dir}/${file} (${job}) must not grant checks:`);
      }
    }
  }
});

// ── criterion 6: v5 ────────────────────────────────────────────────────────────────────────

const VERSION = readFileSync(join(REPO, "VERSION"), "utf8").trim();
const MAJOR = `v${VERSION.split(".")[0]}`;

test("criterion 6: VERSION and the template stamp read 5.0.0", () => {
  assert.equal(VERSION, "5.0.0");
  assert.equal(readFileSync(join(TEMPLATE, ".flow/VERSION"), "utf8").trim(), VERSION);
});

test("criterion 6: every template caller pins the major VERSION names", () => {
  const callers = readdirSync(join(TEMPLATE, ".github/workflows")).filter((f) => /^flow-.*\.yml$/.test(f));
  assert.ok(callers.length > 0, "an empty scan proves nothing");
  for (const f of callers) {
    const pins = [...readFileSync(join(TEMPLATE, ".github/workflows", f), "utf8")
      .matchAll(/uses: CandidDan\/flow\/\.github\/workflows\/_flow-[a-z-]+\.yml@(\S+)/g)].map((m) => m[1]);
    assert.ok(pins.length > 0, `${f} calls no reusable`);
    for (const pin of pins) assert.equal(pin, MAJOR, `${f} pins @${pin}, not @${MAJOR}`);
  }
});

test("criterion 6: _flow-sync.yml's default, description and fallback are the major VERSION names", () => {
  const src = readFileSync(join(REPO, ".github/workflows/_flow-sync.yml"), "utf8");
  assert.match(src, new RegExp(`^ {10}FALLBACK_REF="${MAJOR}"$`, "m"));
  assert.match(src, new RegExp(`Match your callers' pin\\. Default ${MAJOR}\\.`));
  const caller = readFileSync(join(TEMPLATE, ".github/workflows/flow-sync.yml"), "utf8");
  assert.match(caller, new RegExp(`Default ${MAJOR}\\.`));
});

// ── criterion 7: the repinning doc ─────────────────────────────────────────────────────────

test("criterion 7: the repinning doc has the v4 to v5 section, naming the three new required checks", () => {
  const doc = readFileSync(join(REPO, "docs/repinning-a-consuming-repo.md"), "utf8");
  const at = doc.indexOf("## Moving from `@v4` to `@v5`");
  assert.ok(at >= 0, "the heading is missing");
  const next = doc.indexOf("\n## ", at + 1);
  // Whitespace collapsed: a markdown paragraph wraps wherever its line length puts the break.
  const section = doc.slice(at, next < 0 ? undefined : next).replace(/\s+/g, " ");
  for (const old of ["flow-review / qa", "flow-review / code-review", "flow-review / security"]) {
    assert.ok(section.includes(`\`${old}\``), `the section must name the old required check \`${old}\``);
  }
  assert.match(section, /`qa`, `code-review`(,| and) `security`/, "…and the three new ones");
  assert.match(section, /checks: write/);
  assert.match(section, /checks: read/);
  assert.match(section, /flow-sync/);
  assert.ok(section.indexOf("flow-sync") < section.search(/branch protection/i),
    "the order is repin, run flow-sync, then change branch protection");
});
