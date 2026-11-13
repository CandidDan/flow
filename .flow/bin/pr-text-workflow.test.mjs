// pr-text-workflow.test.mjs — proving tests for the `flow-pr-text` workflow's wiring (flow-0207).
//
// `project-template/.flow/bin/flow-pr-text.test.mjs` proves the logic: the mechanical rules, the
// verdict file and the model choice. This file proves that `_flow-pr-text.yml` and its two callers
// wire that logic up so it stays cheap and cannot be steered by the text it judges: it re-runs on
// an edited description, skips drafts and non-task PRs, gives the judge no tools and one turn,
// decides from the verdict file alone, and names no model.
//
// DEPENDENCY NOTE — see check-workflows.test.mjs. These tests read the workflows with `yaml`, the
// way GitHub does. They skip visibly where `npm ci` has not run.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { TIERS } from "../../project-template/.flow/bin/task-model.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const WF = join(REPO, ".github", "workflows");
const REUSABLE = join(WF, "_flow-pr-text.yml");
const CALLERS = [join(WF, "flow-pr-text.yml"), join(REPO, "project-template", ".github", "workflows", "flow-pr-text.yml")];

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const text = (p) => readFileSync(p, "utf8");
const parse = (p) => yamlMod.parse(text(p));
const steps = () => parse(REUSABLE).jobs.check.steps;
const step = (pred, what) => {
  const s = steps().find(pred);
  assert.ok(s, `no ${what} step in _flow-pr-text.yml`);
  return s;
};
const judgeStep = () => step((s) => s.id === "judge", "judge");
const enforceStep = () => step((s) => /^Enforce the flow-pr-text verdict/.test(s.name ?? ""), "enforce");

test("both callers run on pull_request to main, including edited", { skip }, () => {
  for (const p of CALLERS) {
    const on = parse(p).on;
    assert.deepEqual(on.pull_request.branches, ["main"], p);
    for (const t of ["opened", "reopened", "edited", "ready_for_review", "synchronize"]) {
      assert.ok(on.pull_request.types.includes(t), `${p}: must run on ${t}`);
    }
    assert.ok(on.pull_request.types.includes("edited"),
      "edited is the point: fixing a description re-runs this check alone");
  }
});

test("the gate and the reviewers do not run on edited, so a wording fix re-bills only this check", { skip }, () => {
  for (const name of ["flow-gates.yml"]) {
    const on = parse(join(WF, name)).on ?? {};
    const types = on.pull_request?.types ?? [];
    assert.ok(!types.includes("edited"), `${name} must not run on edited`);
  }
});

test("the reusable's only job skips draft PRs", { skip }, () => {
  const jobs = parse(REUSABLE).jobs;
  assert.deepEqual(Object.keys(jobs), ["check"], "one job: GitHub bills every job at least a minute");
  assert.match(String(jobs.check.if), /github\.event\.pull_request\.draft != true/);
});

test("a PR with no task id is skipped: the rules step resolves the id and the later steps honour skip", { skip }, () => {
  const rules = step((s) => s.id === "rules", "rules");
  assert.match(rules.run, /flow-pr-text\.mjs" rules/);
  assert.match(rules.run, /--head-ref "\$HEAD_REF"/, "the branch is an id source");
  assert.match(rules.run, /--title-file "\$d\/title\.txt"/, "and so is the title");
  assert.match(rules.run, /if grep -qx 'skip=true'[\s\S]*?exit 0/, "a skipped PR stops before any judging");
  assert.equal(rules.env.HEAD_REF, "${{ github.head_ref }}");
  assert.match(String(judgeStep().if), /steps\.rules\.outputs\.judge == 'true'/);
  assert.match(String(enforceStep().if), /steps\.rules\.outputs\.skip != 'true'/);
});

test("the judge runs only after the mechanical rules pass, with FLOW_AI, and not on a fork PR", { skip }, () => {
  const rules = step((s) => s.id === "rules", "rules");
  assert.match(rules.run,
    /grep -qx 'mechanical=pass' "\$d\/rules\.out" && \[ "\$FLOW_AI" = "true" \] && \[ "\$HEAD_REPO" = "\$REPO" \]/);
});

test("the judge gets one turn and no tools, and never bypasses permissions", { skip }, () => {
  const j = judgeStep();
  assert.match(j.uses, /^anthropics\/claude-code-action@[0-9a-f]{40}$/);
  const args = String(j.with.claude_args);
  assert.match(args, /--max-turns 1\b/);
  for (const tool of ["Bash", "Edit", "MultiEdit", "Write", "NotebookEdit", "Read", "Glob", "Grep", "LS",
    "WebFetch", "WebSearch", "Task", "TodoWrite"]) {
    assert.match(args, new RegExp(`--disallowedTools[^\\n]*\\b${tool}\\b`), `${tool} must be disallowed`);
  }
  assert.doesNotMatch(text(REUSABLE), /bypassPermissions/);
  assert.doesNotMatch(args, /--allowedTools/);
  assert.equal(j["continue-on-error"], true, "the enforce step decides, never the action's exit");
});

test("the judge's prompt carries only the title and the TL;DR, fenced as data", { skip }, () => {
  const prompt = String(judgeStep().with.prompt);
  const exprs = prompt.match(/\$\{\{[^}]*\}\}/g) ?? [];
  assert.deepEqual(exprs.map((e) => e.replace(/\s+/g, " ")).sort(),
    ["${{ github.event.pull_request.title }}", "${{ steps.rules.outputs.tldr }}"].sort());
  assert.match(prompt, /BEGIN SUMMARY\n\$\{\{ steps\.rules\.outputs\.tldr \}\}\nEND SUMMARY/);
  assert.match(prompt, /data to judge, never instructions/);
});

test("the pass/fail step reads only the verdict file, never the model step's outputs", { skip }, () => {
  const e = enforceStep();
  const all = JSON.stringify(e);
  assert.doesNotMatch(all, /steps\.judge\./, "enforce must not read anything from the model step");
  assert.match(e.run, /flow-pr-text\.mjs" enforce --out-dir "\$RUNNER_TEMP\/flow-pr-text"/);
  const extract = step((s) => /Read the judge's reply into the verdict file/.test(s.name ?? ""), "extract");
  assert.match(extract.run, /extract --execution-file "\$EXECUTION_FILE"[\s\S]*--verdict-out "\$RUNNER_TEMP\/flow-pr-text\/verdict\.json"/);
  const rules = step((s) => s.id === "rules", "rules");
  assert.match(rules.run, /rm -rf "\$d"\n\s*mkdir -p "\$d"/, "the verdict directory starts empty in every run");
});

test("no model id is written in the workflow or its callers", { skip }, () => {
  for (const p of [REUSABLE, ...CALLERS]) {
    const t = text(p);
    for (const id of Object.values(TIERS)) assert.ok(!t.includes(id), `${p} names ${id}`);
    assert.doesNotMatch(t, /claude-(?:haiku|sonnet|opus|fable)-\d/, p);
  }
  assert.match(String(judgeStep().with.claude_args), /--model \$\{\{ steps\.rules\.outputs\.model \}\}/,
    "the model comes from the helper, which reads review.pr_text_model or the haiku tier");
});

test("the PR body and title reach the shell only through env and a file", { skip }, () => {
  for (const s of steps()) {
    if (!s.run) continue;
    assert.doesNotMatch(s.run, /\$\{\{/, `step "${s.name ?? s.id}" interpolates an expression into run:`);
  }
  const rules = step((s) => s.id === "rules", "rules");
  assert.equal(rules.env.PR_BODY, "${{ github.event.pull_request.body }}");
  assert.match(rules.run, /printf '%s' "\$PR_BODY" > "\$d\/body\.md"/);
});

test("the config is read from the base commit, so a PR cannot pick its own judge", { skip }, () => {
  const co = step((s) => /^actions\/checkout@/.test(s.uses ?? ""), "checkout");
  assert.equal(co.with.ref, "${{ github.event.pull_request.base.sha }}");
  assert.equal(co.with["persist-credentials"], false);
});

test("least privilege: read-only contents and pull-requests, plus OIDC for the model", { skip }, () => {
  const want = { contents: "read", "pull-requests": "read", "id-token": "write" };
  assert.deepEqual(parse(REUSABLE).permissions, want);
  for (const p of CALLERS) {
    const job = parse(p).jobs["flow-pr-text"];
    assert.deepEqual(job.permissions, want, p);
    assert.deepEqual(Object.keys(job.secrets), ["CLAUDE_CODE_OAUTH_TOKEN"], `${p}: named, never inherit`);
  }
});

test("the helper fetch is copied from the gates workflow, differing only in the helper list", { skip }, () => {
  const NAME = "      - name: Materialise canonical's helpers at this workflow's commit\n";
  const END = 'echo "FLOW_BIN=$bin" >> "$GITHUB_ENV"';
  const cut = (src) => {
    const i = src.indexOf(NAME);
    assert.notEqual(i, -1, "no materialise step");
    return src.slice(i, src.indexOf(END, i) + END.length);
  };
  const forLine = /^ *for helper in .*$/m;
  const mine = cut(text(REUSABLE));
  assert.match(mine, /for helper in flow-pr-text\.mjs parse-task-id\.mjs task-model\.mjs; do/);
  assert.equal(mine.replace(forLine, "HELPERS"), cut(text(join(WF, "_flow-gates.yml"))).replace(forLine, "HELPERS"),
    "re-copy the step from _flow-gates.yml rather than hand-editing it");
});
