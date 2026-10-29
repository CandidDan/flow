// intent-pr-kind.test.mjs — proving tests for flow-0178: an intent-only PR is classified in code,
// by its paths alone, and the classification is fail-closed.
//
// The classifier is `classifyIntentPr` in the template's flow-review.mjs, which every repo gets.
// This file is canonical's because the security half reads canonical's own `_flow-review.yml`.
//
// Most of it needs nothing installed. The one workflow assertion needs `yaml`, which
// `_flow-gates.yml`'s flow-tooling step does not install, so that test alone skips visibly there
// and runs in full in the per-stack gate job.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import {
  INTENT_PR_PASS_LINE,
  INTENT_PR_SENTINEL,
  INTENT_REVIEW_MAX_TURNS,
  REVIEWER_MAX_TURNS,
  SECURITY_FLOOR_PATHS,
  classifyIntentPr,
  intentDecisionLine,
  planSummary,
  reviewersLine,
  runPlan,
  runReviewCli,
  securityDecision,
} from "../../project-template/.flow/bin/flow-review.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const kind = (changedFiles) => classifyIntentPr({ changedFiles }).classified;

// ── criterion 1: the classification ───────────────────────────────────────────────────────

test("flow-0178 criterion 1: changed files that are all .flow/intents/<slug>.md classify as intent", () => {
  for (const files of [
    [".flow/intents/reviewer-matches-the-change.md"],
    [".flow/intents/a.md", ".flow/intents/b.md"],
  ]) {
    const c = classifyIntentPr({ changedFiles: files });
    assert.equal(c.kind, "intent");
    assert.equal(c.classified, true, files.join(", "));
    assert.equal(c.sentinel, INTENT_PR_SENTINEL);
    assert.deepEqual(c.outside, []);
  }
});

test("flow-0178 criterion 1: _TEMPLATE.md, any other path, a mix, or an empty list is not intent", () => {
  const cases = {
    "the template": [".flow/intents/_TEMPLATE.md"],
    "the template alongside an intent": [".flow/intents/a.md", ".flow/intents/_TEMPLATE.md"],
    "any other underscore file": [".flow/intents/_notes.md"],
    "an intent mixed with code": [".flow/intents/a.md", "src/index.mjs"],
    "an intent mixed with a task": [".flow/intents/a.md", ".flow/tasks/flow-0001-x.md"],
    "an intent mixed with config": [".flow/intents/a.md", ".flow/config.yml"],
    "a subdirectory": [".flow/intents/old/a.md"],
    "not Markdown": [".flow/intents/a.txt"],
    "a lookalike directory": [".flow/intents-archive/a.md"],
    "the template's fixture store": ["project-template/.flow/intents/a.md"],
    "an empty diff": [],
    "blank entries only": ["", null],
  };
  for (const [label, files] of Object.entries(cases)) {
    assert.equal(kind(files), false, `${label} must not classify as an intent PR`);
  }
  // The offending paths are named, so "why was this not an intent PR?" has an answer.
  assert.deepEqual(classifyIntentPr({ changedFiles: [".flow/intents/a.md", "src/x.mjs"] }).outside, ["src/x.mjs"]);
});

test("flow-0178 criterion 1: the decision line names the outcome in the guards' `decision=` shape", () => {
  assert.equal(intentDecisionLine(classifyIntentPr({ changedFiles: [".flow/intents/a.md"] })),
    "pr-kind: decision=intent files=1");
  assert.equal(intentDecisionLine(classifyIntentPr({ changedFiles: [".flow/intents/a.md", "x"] })),
    "pr-kind: decision=full files=2 outside=1");
});

// ── the plan: the classification reaches the workflow, and stays fail-closed ───────────────

const CONFIG = `review:
  model: "haiku"
  security_paths:
    - "src/auth/**"
`;

function planWith(files, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "flow-intent-kind-"));
  writeFileSync(join(dir, "config.yml"), CONFIG);
  const git = (args) => (args.includes("--name-only") ? files.join("\n") + "\n" : "diff --git a/x b/x\n");
  try {
    const plan = runPlan({
      configPath: join(dir, "config.yml"), outDir: join(dir, "out"),
      headRef: "claude/some-branch", prTitle: "add an intent", tasksDir: join(dir, "tasks"),
      git, ls: () => [], ...opts,
    });
    return { plan, taskMd: readFileSync(join(dir, "out", "task.md"), "utf8") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("flow-0178 criterion 1: an intent-only plan is marked intent and hands the reviewers the INTENT PR sentinel", () => {
  const { plan, taskMd } = planWith([".flow/intents/a.md"]);
  assert.equal(plan.intentPr, true);
  assert.equal(plan.task.kind, "intent");
  assert.ok(taskMd.startsWith(INTENT_PR_SENTINEL), taskMd.slice(0, 40));
  assert.ok(taskMd.includes(INTENT_PR_PASS_LINE));
  assert.ok(taskMd.includes(".flow/intents/a.md"));
});

test("flow-0178 criterion 1: a branch prefix, BOOTSTRAP, or a mix each keep the full review", () => {
  assert.equal(planWith([".flow/intents/a.md", "README.md"]).plan.intentPr, false, "a mix");
  assert.equal(planWith([".flow/intents/a.md"], { bootstrap: true }).plan.intentPr, false,
    "under BOOTSTRAP the helper deciding is the PR's own copy");
  assert.equal(planWith([".flow/intents/a.md"], { headRef: "release/9.9.9" }).plan.intentPr, false,
    "a release/ branch was already classified, and not as a release; the looser rule must not win");
});

test("flow-0178: the plan CLI publishes intent_pr as exactly true or false", () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-intent-cli-"));
  try {
    writeFileSync(join(dir, "config.yml"), CONFIG);
    for (const [files, want] of [[[".flow/intents/a.md"], "true"], [["src/a.mjs"], "false"]]) {
      const out = join(dir, `gh-${want}`);
      const git = (args) => (args.includes("--name-only") ? files.join("\n") : "");
      assert.equal(runReviewCli(["plan"], {
        env: { GITHUB_OUTPUT: out, HEAD_REF: "claude/x", PR_TITLE: "t", REVIEW_TASKS_DIR: join(dir, "none") },
        configPath: join(dir, "config.yml"), outDir: join(dir, `out-${want}`), git,
      }), 0);
      assert.match(readFileSync(out, "utf8"), new RegExp(`^intent_pr=${want}$`, "m"));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("flow-0178: the classify CLI publishes intent_pr and fails closed when git fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-intent-classify-"));
  try {
    const out = join(dir, "gh");
    assert.equal(runReviewCli(["classify"], {
      env: { GITHUB_OUTPUT: out, BASE_REF: "origin/main" },
      git: (args) => {
        assert.deepEqual(args, ["diff", "--name-only", "origin/main...HEAD"]);
        return ".flow/intents/a.md\n.flow/intents/b.md\n";
      },
    }), 0);
    assert.equal(readFileSync(out, "utf8"), "intent_pr=true\n");

    const out2 = join(dir, "gh2");
    assert.equal(runReviewCli(["classify"], { env: { GITHUB_OUTPUT: out2 }, git: () => "src/a.mjs\n" }), 0);
    assert.equal(readFileSync(out2, "utf8"), "intent_pr=false\n");

    const out3 = join(dir, "gh3");
    assert.equal(runReviewCli(["classify"], {
      env: { GITHUB_OUTPUT: out3 }, git: () => { throw new Error("bad revision"); },
    }), 1, "an unclassifiable PR must fail the step, never fall through as an intent PR");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── criterion 4: security is unchanged ─────────────────────────────────────────────────────

test("flow-0178 criterion 4: an intent-only PR still triggers the security review on the .flow/** floor", () => {
  assert.ok(SECURITY_FLOOR_PATHS.includes(".flow/**"));
  const files = [".flow/intents/a.md"];
  const d = securityDecision({ changedFiles: files, securityPaths: ["src/auth/**"] });
  assert.equal(d.run, true, "a narrow security_paths must not scope an intent PR out of review");
  assert.deepEqual(d.floor, files);
  assert.match(d.reason, /SECURITY FLOOR/);
  assert.equal(planWith(files).plan.security.run, true, "and the plan publishes that decision");
});

test("flow-0178 criterion 4: the security job's trigger does not read the intent classification", { skip }, () => {
  const src = readFileSync(join(REPO, ".github/workflows/_flow-review.yml"), "utf8");
  const sec = yamlMod.parse(src).jobs.security;
  assert.equal(sec.if, undefined, "the security job keeps no job-level if");
  assert.doesNotMatch(JSON.stringify(sec), /intent_pr/,
    "no step of the security job may be skipped, or reworded, for an intent PR");
  const gated = (sec.steps ?? []).filter((s) => s.uses?.startsWith("anthropics/claude-code-action"));
  assert.equal(gated.length, 1);
  assert.equal(gated[0].if, "${{ needs.plan.outputs.security_run == 'true' }}");
});

// ── G9: the run summary says which reviewers ran, at what effort ───────────────────────────

test("flow-0178: the plan summary names the reviewers and their turn budgets for both kinds", () => {
  const cfg = { model: "m-review", codeReviewModel: "m-code" };
  const security = { run: true, reason: "x" };
  const intent = reviewersLine({ cfg, security, intentPr: true });
  assert.match(intent, /qa and code-review PASS with the fixed line and call no model/);
  assert.match(intent, new RegExp(`ADVISORY intent reviewer on \`m-review\` at \`--max-turns ${INTENT_REVIEW_MAX_TURNS}\``));
  assert.match(intent, /security RUNNING/);
  const full = reviewersLine({ cfg, security: { run: false }, intentPr: false });
  assert.match(full, new RegExp(`qa on \`m-review\` and code-review on \`m-code\`, each at \`--max-turns ${REVIEWER_MAX_TURNS}\``));
  assert.match(full, /security SKIPPED/);
  assert.ok(INTENT_REVIEW_MAX_TURNS <= 15, "Dan, 2026-10-28: the intent reviewer runs at low effort");

  const { plan } = planWith([".flow/intents/a.md"]);
  assert.match(planSummary(plan), /- reviewers: \*\*intent PR\*\*/);
  assert.match(planSummary({ ...plan, intentPr: undefined }), /- reviewers: qa on/,
    "an older plan object with no intentPr renders as the full review");
});
