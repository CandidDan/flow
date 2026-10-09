// model-ids.test.mjs — flow-0140's proving tests: every model Flow's reusables name is a FULL
// model ID, every claude-code-action step runs the v1.0.245 pin, and every Claude step reports the
// model that actually answered.
//
// WHY. Every Claude step was pinned to claude-code-action v1.0.219, whose bundled CLI predates the
// 5.5 models, and passed a bare alias (`opus`, `sonnet`). An alias resolves through whatever CLI
// the pin installs, so workers ran Opus 5 and reviewers Sonnet 5 — a generation behind — and
// nothing said so. Full IDs make a new model a one-line, reviewed change; the report step makes
// any remaining drift visible on the run.
//
// LINE-BASED, NOT YAML-BASED, like `action-pins.test.mjs`: it runs without `npm ci` (no `yaml`
// module) and a violation can name its LINE, which a parsed document cannot.
//
// NO WORKFLOW IS EXEMPT. flow-0140 exempted `_flow-kickback.yml` while flow-0135 rewrote it;
// flow-0143 moved its three Claude steps to full IDs and report steps and deleted the exemption.
//
// AN EMPTY SCAN IS A FAILURE: no workflow, no model value or no Claude step found means the check
// verified nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const WORKFLOWS = join(REPO, ".github", "workflows");

export const FULL_ID = /^claude-[a-z]+-\d+(-\d+)*$/;
export const ALIASES = Object.freeze(["opus", "sonnet", "haiku", "fable", "mythos"]);
export const PIN_SHA = "6fed3ca145920b639991cb756090506e1bcaf515";
export const PIN_VERSION = "v1.0.245";
export const PINNED_REUSABLES = Object.freeze([
  "_flow-queue-runner.yml", "_flow-review.yml", "_flow-compass.yml", "_flow-triage.yml", "_flow-kickback.yml",
]);
const REPORT_STEP = "Report the model that answered";
const HEREDOC = "FLOW_MODEL_REPORT";

const isComment = (line) => /^\s*#/.test(line);

// Every literal `--model <value>` in a workflow, with its line. A `${{ … }}` value is a plan
// output, validated by flow-review.mjs's checkModel and by flow-review-workflow.test.mjs, so it is
// not a literal to judge here.
export function modelFlags(src) {
  const found = [];
  src.split("\n").forEach((line, i) => {
    if (isComment(line)) return;
    for (const m of line.matchAll(/--model[\s=]+(\$\{\{[^}]*\}\}|[^\s"']+)/g)) {
      if (!m[1].startsWith("${{")) found.push({ line: i + 1, value: m[1] });
    }
  });
  return found;
}

// Every `*model:` key inside a config's top-level `review:` block, with its line.
export function reviewModels(src) {
  const found = [];
  let inBlock = false;
  src.split("\n").forEach((line, i) => {
    if (/^\S/.test(line)) inBlock = /^review:\s*(#.*)?$/.test(line);
    if (!inBlock || isComment(line)) return;
    const m = line.match(/^\s+(\w*model):\s*["']?([^"'\s#]*)/);
    if (m) found.push({ line: i + 1, key: m[1], value: m[2] });
  });
  return found;
}

export function judgeModel(value) {
  if (ALIASES.includes(value.toLowerCase())) return `is the bare alias "${value}"`;
  if (!FULL_ID.test(value)) return `"${value}" is not a full model id (${FULL_ID})`;
  return null;
}

// The whole check over a directory of workflows plus a list of config files. Returns violations
// as "file:line — why" strings, and how many values it judged (an empty scan is a failure).
export function checkModelIds({ dir, configs = [] }) {
  const violations = [];
  let judged = 0;
  const files = readdirSync(dir).filter((f) => /^_flow-.*\.ya?ml$/.test(f)).sort();
  for (const f of files) {
    for (const { line, value } of modelFlags(readFileSync(join(dir, f), "utf8"))) {
      judged++;
      const why = judgeModel(value);
      if (why) violations.push(`${f}:${line} — --model ${why}`);
    }
  }
  for (const c of configs) {
    for (const { line, key, value } of reviewModels(readFileSync(c, "utf8"))) {
      judged++;
      const why = judgeModel(value);
      if (why) violations.push(`${c}:${line} — review.${key} ${why}`);
    }
  }
  return { files, judged, violations };
}

const TEMPLATE_CONFIG = join(REPO, "project-template", ".flow", "config.yml");
const CANON_CONFIG = join(REPO, ".flow", "config.yml");

// ── AC1: the pin ──────────────────────────────────────────────────────────────────────────

test("AC1: every claude-code-action ref in the reusables is 6fed3ca1 with a v1.0.245 comment", () => {
  let seen = 0;
  for (const f of PINNED_REUSABLES) {
    readFileSync(join(WORKFLOWS, f), "utf8").split("\n").forEach((line, i) => {
      if (isComment(line) || !/anthropics\/claude-code-action@/.test(line)) return;
      seen++;
      assert.match(line, new RegExp(`claude-code-action@${PIN_SHA}\\s+#\\s*${PIN_VERSION.replace(/\./g, "\\.")}\\s*$`),
        `${f}:${i + 1} — claude-code-action must be pinned to ${PIN_SHA} # ${PIN_VERSION}`);
    });
  }
  assert.ok(seen >= PINNED_REUSABLES.length, `found ${seen} claude-code-action refs — the scan found nothing to judge`);
});

// ── AC2: full model IDs, and the mutation ─────────────────────────────────────────────────

test("AC2: no model value in the reusables or the template/canonical config is a bare alias", () => {
  const { files, judged, violations } = checkModelIds({ dir: WORKFLOWS, configs: [TEMPLATE_CONFIG, CANON_CONFIG] });
  assert.ok(files.length > 0 && judged > 0, "an empty scan verified nothing");
  assert.deepEqual(violations, []);
  const keys = reviewModels(readFileSync(TEMPLATE_CONFIG, "utf8")).map((r) => `${r.key}=${r.value}`);
  assert.deepEqual(keys.sort(), [
    "code_review_model=claude-opus-5-5", "model=claude-sonnet-5-5", "security_model=claude-opus-5-5",
  ], "the template ships the decided split: Sonnet for qa/guide, Opus for code-review and security");
  assert.ok(modelFlags(readFileSync(join(WORKFLOWS, "_flow-queue-runner.yml"), "utf8"))
    .some((m) => m.value === "claude-opus-5-5"), "the queue runner's worker runs claude-opus-5-5");
});

test("AC2 mutation: reintroducing `--model opus` into a copy of a workflow fails, naming file and line", () => {
  for (const f of ["_flow-queue-runner.yml", "_flow-kickback.yml"]) {
    const dir = mkdtempSync(join(tmpdir(), "flow-model-ids-"));
    try {
      const src = readFileSync(join(WORKFLOWS, f), "utf8");
      assert.ok(src.includes("--model claude-opus-5-5"), `${f}: fixture precondition`);
      writeFileSync(join(dir, f), src.replace("--model claude-opus-5-5", "--model opus"));
      const line = src.split("\n").findIndex((l) => l.includes("--model claude-opus-5-5")) + 1;
      const { violations } = checkModelIds({ dir });
      assert.equal(violations.length, 1, f);
      assert.match(violations[0], new RegExp(`^${f.replace(/\./g, "\\.")}:${line} — --model is the bare alias "opus"`));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }

  const dir = mkdtempSync(join(tmpdir(), "flow-model-ids-"));
  try {
    writeFileSync(join(dir, "_flow-queue-runner.yml"), readFileSync(join(WORKFLOWS, "_flow-queue-runner.yml"), "utf8"));
    const cfg = join(dir, "config.yml");
    writeFileSync(cfg, `project:\n  name: x\nreview:\n  model: "sonnet"\n  security_model: claude-opus-5\nother:\n  model: opus\n`);
    const bad = checkModelIds({ dir, configs: [cfg] }).violations.filter((v) => v.startsWith(cfg));
    assert.deepEqual(bad, [`${cfg}:4 — review.model is the bare alias "sonnet"`],
      "an alias in review: fails naming its line; a model key outside review: is not this check's");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("judgeModel rejects aliases in any case and anything not shaped like a full id", () => {
  for (const v of ALIASES) assert.match(judgeModel(v.toUpperCase()), /bare alias/);
  for (const v of ["claude-opus", "gpt-5", "opus-5", "claude-opus-5-5 --print"]) assert.ok(judgeModel(v), v);
  for (const v of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5"]) assert.equal(judgeModel(v), null, v);
});

// ── AC5: every Claude step reports the model that answered ────────────────────────────────

// Each claude-code-action step's id, and each report step's EXECUTION_FILE step id, by line.
function claudeAndReportSteps(src) {
  const lines = src.split("\n");
  const stepStart = (i) => { while (i > 0 && !/^\s*-\s/.test(lines[i])) i--; return i; };
  const stepEnd = (s) => {
    const indent = lines[s].match(/^\s*/)[0].length;
    let e = s + 1;
    while (e < lines.length && !(lines[e].trim() && lines[e].match(/^\s*/)[0].length <= indent)) e++;
    return e;
  };
  const claude = [];
  const reports = [];
  lines.forEach((line, i) => {
    if (!isComment(line) && /uses:\s*anthropics\/claude-code-action@/.test(line)) {
      const s = stepStart(i);
      const id = lines.slice(s, stepEnd(s)).map((l) => l.match(/^\s*-?\s*id:\s*(\S+)/)).find(Boolean)?.[1];
      claude.push({ line: i + 1, id });
    }
    if (line.includes(`name: ${REPORT_STEP}`)) {
      const s = stepStart(i);
      const body = lines.slice(s, stepEnd(s)).join("\n");
      reports.push({
        line: i + 1,
        reads: body.match(/EXECUTION_FILE:\s*\$\{\{\s*steps\.([\w-]+)\.outputs\.execution_file\s*\}\}/)?.[1],
        always: /if:\s*\$\{\{\s*always\(\)/.test(body),
      });
    }
  });
  return { claude, reports };
}

// The inline report script of every copy, dedented.
export function reportScripts(src) {
  const out = [];
  const re = new RegExp(`^(\\s*)node - <<'${HEREDOC}'\\n([\\s\\S]*?)^\\s*${HEREDOC}\\s*$`, "gm");
  for (const m of src.matchAll(re)) {
    const indent = m[1].length;
    out.push(m[2].split("\n").map((l) => l.slice(indent)).join("\n"));
  }
  return out;
}

const reportedFiles = () => readdirSync(WORKFLOWS).filter((f) => /^_flow-.*\.ya?ml$/.test(f)).sort();

test("AC5: every Claude step is followed by a report step reading that step's execution_file", () => {
  let total = 0;
  for (const f of reportedFiles()) {
    const { claude, reports } = claudeAndReportSteps(readFileSync(join(WORKFLOWS, f), "utf8"));
    claude.forEach((c, k) => {
      total++;
      assert.ok(c.id, `${f}:${c.line} — the Claude step needs an id: the report step reads its outputs by it`);
      const next = claude[k + 1]?.line ?? Infinity;
      const r = reports.find((x) => x.line > c.line && x.line < next);
      assert.ok(r, `${f}:${c.line} — no "${REPORT_STEP}" step follows this Claude step`);
      assert.equal(r.reads, c.id, `${f}:${r.line} — the report must read steps.${c.id}.outputs.execution_file`);
      assert.ok(r.always, `${f}:${r.line} — the report must run with always(), so a failed run still says what ran`);
    });
  }
  assert.equal(total, 10, "the ten Claude steps: worker, qa, code-review, security, guide, compass, triage, " +
    "and kickback's fixer, round-card and card");
});

test("AC5: the report script is byte-identical in every copy", () => {
  const scripts = reportedFiles().flatMap((f) => reportScripts(readFileSync(join(WORKFLOWS, f), "utf8")));
  assert.equal(scripts.length, 10);
  for (const s of scripts) assert.equal(s, scripts[0], "ten copies of one script must not drift apart");
});

// Runs the extracted script exactly as the step does (`node -`, script on stdin).
function runReport({ execution, requested = "", step = "qa", missing = false }) {
  const dir = mkdtempSync(join(tmpdir(), "flow-model-report-"));
  try {
    const script = reportScripts(readFileSync(join(WORKFLOWS, "_flow-review.yml"), "utf8"))[0];
    const file = join(dir, "claude-execution-output.json");
    if (!missing) writeFileSync(file, typeof execution === "string" ? execution : JSON.stringify(execution));
    const summary = join(dir, "summary.md");
    writeFileSync(summary, "");
    const r = spawnSync(process.execPath, ["-"], {
      input: script, encoding: "utf8", cwd: dir,
      env: { PATH: process.env.PATH, EXECUTION_FILE: file, REQUESTED_MODEL: requested, CLAUDE_STEP: step, GITHUB_STEP_SUMMARY: summary },
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, summary: readFileSync(summary, "utf8") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const INIT = { type: "system", subtype: "init", model: "claude-sonnet-5-5" };
const ASSISTANT = { type: "assistant", message: { model: "claude-sonnet-5-5", content: [] } };
const RESULT = { type: "result", subtype: "success", modelUsage: { "claude-sonnet-5-5": {}, "claude-haiku-4-5": {} } };

test("AC5: the summary names every model in result.modelUsage", () => {
  const r = runReport({ execution: [INIT, ASSISTANT, RESULT], requested: "claude-sonnet-5-5" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.summary, /### Model: qa/);
  assert.match(r.summary, /requested: `claude-sonnet-5-5`/);
  assert.match(r.summary, /answered: `claude-sonnet-5-5`, `claude-haiku-4-5`/);
  assert.doesNotMatch(r.summary, /mismatch/);
});

test("AC5: with no result message, the summary falls back to assistant, then init", () => {
  assert.match(runReport({ execution: [INIT, ASSISTANT] }).summary, /answered: `claude-sonnet-5-5`/);
  const init = runReport({ execution: [{ ...INIT, model: "claude-opus-5-5" }] });
  assert.match(init.summary, /answered: `claude-opus-5-5`/);
  assert.match(init.summary, /requested: none passed, so the CLI's default/);
});

test("AC5: a missing or unreadable execution file says the action did not report it — and never fails the job", () => {
  for (const args of [{ missing: true }, { execution: "not json" }, { execution: [{ type: "user" }] }]) {
    const r = runReport({ ...args, requested: "claude-opus-5-5" });
    assert.equal(r.status, 0, "reporting only: it must never fail the job");
    assert.match(r.summary, /answered: not reported by the action \(requested `claude-opus-5-5`\)/);
  }
});

test("AC5: a requested model that did not answer is flagged as a mismatch and a warning", () => {
  const r = runReport({ execution: [RESULT], requested: "claude-opus-5-5", step: "code-review" });
  assert.match(r.summary, /\*\*mismatch:\*\* requested `claude-opus-5-5`/);
  assert.match(r.stdout, /::warning::code-review requested claude-opus-5-5 but was answered by/);
});

test("AC5: a model value that is not a plain identifier never reaches the summary", () => {
  const r = runReport({ execution: [{ type: "result", modelUsage: { "x`](javascript:alert(1))": {}, "claude-opus-5-5": {} } }] });
  assert.match(r.summary, /answered: `claude-opus-5-5`\n/);
  assert.doesNotMatch(r.summary, /javascript/);
});
