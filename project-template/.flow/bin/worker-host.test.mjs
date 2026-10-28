// worker-host.test.mjs — proving tests for flow-0170: a repo chooses where its worker runs.
//
// Two halves. The helper's resolution (default, the three values, the unknown-value error) is
// pure and tested directly. The WIRING is tested by running `_flow-queue-runner.yml`'s own
// decision step — its `run:` script, lifted out of the parsed workflow and executed with bash
// against a fixture repo — and then evaluating the `if:` conditions of the steps after it against
// the outputs that step actually wrote. A grep of the YAML could pass with the step in the wrong
// place or a condition that never reads it; this cannot.
//
// The workflow half needs canonical's reusable and the `yaml` package. In an adopting repo the
// reusable does not exist, and in `_flow-gates.yml`'s flow-tooling job `yaml` is not installed,
// so those tests skip visibly rather than fail.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HOST, HOSTS, hostDecision, readWorkerHost, resolveWorkerHost, runCli, summaryLine,
} from "./worker-host.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const HELPER = join(BIN, "worker-host.mjs");
const TEMPLATE_CONFIG = resolve(BIN, "..", "config.yml");
const REUSABLE = resolve(BIN, "..", "..", "..", ".github", "workflows", "_flow-queue-runner.yml");

const yamlMod = await import("yaml").then((m) => m, () => null);
const wfSkip = !existsSync(REUSABLE) ? "canonical's _flow-queue-runner.yml is not in this repo"
  : !yamlMod ? "needs `npm ci` (yaml) — runs in the per-stack gate job" : false;

const config = (worker) => `project:\n  name: "x"\n${worker}\ngit:\n  base_branch: "main"\n`;

// ── criterion: no `worker` key -> github-actions ──

test("a config with no worker key resolves to github-actions", () => {
  assert.equal(DEFAULT_HOST, "github-actions");
  assert.equal(resolveWorkerHost(config("")), "github-actions");
  assert.equal(resolveWorkerHost(""), "github-actions", "an empty or missing config is the default too");
  assert.equal(resolveWorkerHost(config("worker:\n  # host: manual")), "github-actions",
    "a commented-out host is not a host");
  assert.equal(readWorkerHost(config("")), null);
});

// ── criterion: each of the three values is returned as written ──

test("each allowed worker.host is returned as written, block or inline, quoted or not", () => {
  assert.deepEqual([...HOSTS], ["manual", "claude-routine", "github-actions"]);
  for (const host of HOSTS) {
    assert.equal(resolveWorkerHost(config(`worker:\n  host: ${host}`)), host);
    assert.equal(resolveWorkerHost(config(`worker:\n  host: "${host}"   # why`)), host);
    assert.equal(resolveWorkerHost(config(`worker: { host: '${host}' }`)), host);
  }
});

test("only the worker block's host counts", () => {
  // A `host:` under some other top-level key must not be read as the worker's.
  assert.equal(resolveWorkerHost("other:\n  host: manual\nworker:\n  host: claude-routine\n"), "claude-routine");
  assert.equal(resolveWorkerHost("worker:\n  note: x\nother:\n  host: manual\n"), "github-actions");
});

// ── criterion: an unknown value fails, naming the three allowed values ──

test("an unknown worker.host fails with a message naming the three allowed values", () => {
  for (const bad of ["jenkins", "Manual", "github_actions"]) {
    assert.throws(() => resolveWorkerHost(config(`worker:\n  host: ${bad}`)), (e) => {
      assert.match(e.message, new RegExp(`"${bad}"`));
      for (const h of HOSTS) assert.ok(e.message.includes(`\`${h}\``), `message names ${h}: ${e.message}`);
      return true;
    });
  }
  assert.throws(() => resolveWorkerHost("worker: manual\n"), /must be a block/);
});

test("the CLI exits 1 on an unknown host, writing no decision", () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-wh-"));
  try {
    const cfg = join(dir, "config.yml");
    writeFileSync(cfg, config("worker:\n  host: jenkins"));
    const r = spawnSync(process.execPath, [HELPER, "--config", cfg],
      { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: join(dir, "out") } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /::error::worker-host:.*jenkins.*`manual`, `claude-routine`, `github-actions`/);
    assert.equal(existsSync(join(dir, "out")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the CLI writes host/run/reason and one summary line for a valid host", () => {
  const writes = [];
  const sink = { write: () => {} };
  const code = runCli(["--config", "c.yml"], {
    env: { GITHUB_OUTPUT: "o", GITHUB_STEP_SUMMARY: "s" }, out: sink, err: sink,
    append: (p, s) => writes.push([p, s]), exists: () => true,
    read: () => config("worker:\n  host: claude-routine"),
  });
  assert.equal(code, 0);
  assert.match(writes[0][1], /^host=claude-routine\nrun=false\nreason=.*cloud routine/);
  assert.equal(writes[1][0], "s");
  assert.match(writes[1][1], /^- \*\*no worker\*\* \(`claude-routine`\)/);
  // A missing config file is the default, not an error.
  const out = [];
  assert.equal(runCli([], { env: {}, out: { write: (s) => out.push(s) }, err: sink, exists: () => false }), 0);
  assert.match(out.join(""), /defaults to `github-actions`/);
});

test("only github-actions dispatches", () => {
  assert.equal(hostDecision("github-actions").run, true);
  assert.equal(hostDecision("manual").run, false);
  assert.equal(hostDecision("claude-routine").run, false);
  assert.match(summaryLine(hostDecision("github-actions")), /^- \*\*worker dispatch\*\*/);
});

// ── criterion: the template ships worker.host: manual, with a comment ──

test("the template config ships worker.host: manual with an explanatory comment", () => {
  const text = readFileSync(TEMPLATE_CONFIG, "utf8");
  assert.equal(resolveWorkerHost(text), "manual");
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^worker:/.test(l));
  const comment = [];
  for (let i = at - 1; i >= 0 && lines[i].startsWith("#"); i -= 1) comment.unshift(lines[i]);
  const prose = comment.join("\n");
  for (const h of HOSTS) assert.ok(prose.includes(h), `the comment above worker: explains ${h}`);
  assert.match(prose, /NO `worker` key/);
});

// ── criterion: manual / claude-routine start no worker; github-actions behaves as before ──
//
// The decision step is run for real, then the conditions of the steps after it are evaluated
// against what it wrote.

// Just enough of GitHub's expression language for these step conditions: `steps.<id>.outputs.<k>`
// compared with `==` / `!=` to a quoted string. Anything else throws, so a condition this model
// cannot read fails the test instead of quietly evaluating to false.
function evalStepIf(expr, steps) {
  const m = String(expr).match(/^\$\{\{\s*steps\.([\w-]+)\.outputs\.([\w-]+)\s*(==|!=)\s*'([^']*)'\s*\}\}$/);
  if (!m) throw new SyntaxError(`step-condition model cannot read: ${expr}`);
  const actual = steps[m[1]]?.outputs?.[m[2]] ?? "";
  return m[3] === "==" ? actual === m[4] : actual !== m[4];
}

const dispatchSteps = () => yamlMod.parse(readFileSync(REUSABLE, "utf8")).jobs.dispatch.steps;

function runDecisionStep({ worker, event, synced = true }) {
  const step = dispatchSteps().find((s) => s.id === "host");
  const dir = mkdtempSync(join(tmpdir(), "flow-wh-wf-"));
  try {
    mkdirSync(join(dir, ".flow", "bin"), { recursive: true });
    if (synced) copyFileSync(HELPER, join(dir, ".flow", "bin", "worker-host.mjs"));
    writeFileSync(join(dir, ".flow", "config.yml"), config(worker));
    const outFile = join(dir, "gh-output");
    const summaryFile = join(dir, "gh-summary");
    writeFileSync(outFile, ""); writeFileSync(summaryFile, "");
    const r = spawnSync("bash", ["-e", "-c", step.run], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: summaryFile, GITHUB_EVENT_NAME: event },
    });
    const outputs = Object.fromEntries(readFileSync(outFile, "utf8").split("\n").filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    return { status: r.status, stderr: r.stderr, outputs, summary: readFileSync(summaryFile, "utf8") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Which steps after the decision would run, given what it wrote. A skipped step writes no
// outputs, which is how `pick` being skipped empties `task_id` for everything after it.
function stepsThatRun(hostOutputs) {
  const steps = dispatchSteps();
  const ctx = { host: { outputs: hostOutputs } };
  const ran = [];
  for (const s of steps.slice(steps.findIndex((x) => x.id === "host") + 1)) {
    const runs = s.if === undefined ? true
      : /\b(always|failure|cancelled)\s*\(/.test(s.if) ? null : evalStepIf(s.if, ctx);
    if (runs === null) continue;      // status-function steps: covered by queue-runner-verify.test.mjs
    if (runs) {
      ran.push(s.id ?? s.name);
      if (s.id === "pick") ctx.pick = { outputs: { task_id: "flow-0001" } };
    }
  }
  return ran;
}

test("the decision step runs before anything that picks or works a task, on every event", { skip: wfSkip }, () => {
  const steps = dispatchSteps();
  const host = steps.findIndex((s) => s.id === "host");
  const pick = steps.findIndex((s) => s.id === "pick");
  const work = steps.findIndex((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action"));
  assert.ok(host > -1 && host < pick && pick < work, "host decides before pick, pick before the worker");
  assert.equal(steps[host].if, undefined, "the decision itself runs on schedule and workflow_dispatch alike");
});

for (const host of ["manual", "claude-routine"]) {
  for (const event of ["schedule", "workflow_dispatch"]) {
    test(`host ${host} on ${event}: no worker starts, and the summary says why`, { skip: wfSkip }, () => {
      const r = runDecisionStep({ worker: `worker:\n  host: ${host}`, event });
      assert.equal(r.status, 0, `the run ends successfully: ${r.stderr}`);
      assert.equal(r.outputs.host, host);
      assert.equal(r.outputs.run, "false");
      assert.match(r.summary, new RegExp(`^- \\*\\*no worker\\*\\* \\(\`${host}\`\\) — .*starts no worker`));
      assert.equal(r.summary.trim().split("\n").length, 1, "one line");
      assert.deepEqual(stepsThatRun(r.outputs), [], "pick, model, the worker and every later step skip");
    });
  }
}

test("host github-actions (set, unset, or helper not yet synced) dispatches exactly as before", { skip: wfSkip }, () => {
  for (const [label, args] of [
    ["set", { worker: "worker:\n  host: github-actions" }],
    ["no worker key", { worker: "" }],
    ["helper not synced", { worker: "worker:\n  host: manual", synced: false }],
  ]) {
    for (const event of ["schedule", "workflow_dispatch"]) {
      const r = runDecisionStep({ ...args, event });
      assert.equal(r.status, 0, `${label}: ${r.stderr}`);
      assert.equal(r.outputs.run, "true", label);
      const ran = stepsThatRun(r.outputs);
      for (const id of ["pick", "model", "work"]) assert.ok(ran.includes(id), `${label}/${event}: ${id} runs`);
    }
  }
});

test("an unknown host fails the decision step, so no worker starts", { skip: wfSkip }, () => {
  const r = runDecisionStep({ worker: "worker:\n  host: jenkins", event: "schedule" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /`manual`, `claude-routine`, `github-actions`/);
  assert.equal(r.outputs.run, undefined);
});

test("the step-condition model refuses what it cannot read", () => {
  assert.throws(() => evalStepIf("${{ always() }}", {}), SyntaxError);
  assert.equal(evalStepIf("${{ steps.a.outputs.b != '' }}", {}), false);
});
