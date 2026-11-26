// claude-code-install-workflow.test.mjs — proving tests for flow-0240.
//
// `claude-code-action` installs the Claude Code CLI itself, by piping `claude.ai/install.sh` to
// bash on every job. From self-hosted runners that share one public IP that download sometimes
// answered 403, and the review check failed before any review ran. These workflows now install a
// pinned `@anthropic-ai/claude-code` from the npm registry in a step `id: claude-code` and pass the
// binary to the action through `path_to_claude_code_executable`.
//
// HOW THE PIN IS UPDATED. `FLOW_CLAUDE_CODE_VERSION` (top-level `env:` of each file below) must
// equal the version the pinned action installs. When the action SHA changes, the table
// `ACTION_INSTALLS` below no longer knows it and the last test fails. To fix it, read
// `claudeCodeVersion` in the new SHA's `src/entrypoints/run.ts`, add the SHA and that version to
// the table, and set `FLOW_CLAUDE_CODE_VERSION` in every file to it.
//
// DEPENDENCY NOTE — see check-workflows.test.mjs. These tests read the workflows with `yaml`, the
// way GitHub does. They skip visibly where `npm ci` has not run.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const WF = join(REPO, ".github", "workflows");
const FILES = ["_flow-review.yml", "_flow-kickback.yml", "_flow-pr-text.yml"];

// The action SHA → the Claude Code version that release installs (`claudeCodeVersion` in
// `src/entrypoints/run.ts` at that SHA). One row per action SHA any file below pins.
const ACTION_INSTALLS = {
  "6fed3ca145920b639991cb756090506e1bcaf515": "2.1.293", // v1.0.245
};

const ACTION = "anthropics/claude-code-action@";
const PATH_INPUT = "${{ steps.claude-code.outputs.path }}";

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const parse = (f) => yamlMod.parse(readFileSync(join(WF, f), "utf8"));
const isAction = (s) => typeof s.uses === "string" && s.uses.startsWith(ACTION);

// Every job, in every file, that runs the action at least once.
const actionJobs = () =>
  FILES.flatMap((f) =>
    Object.entries(parse(f).jobs)
      .filter(([, job]) => (job.steps ?? []).some(isAction))
      .map(([name, job]) => ({ file: f, name, steps: job.steps })),
  );

test("one exact Claude Code version across the workflows", { skip }, () => {
  const versions = FILES.map((f) => parse(f).env?.FLOW_CLAUDE_CODE_VERSION);
  for (const [i, v] of versions.entries()) {
    assert.match(String(v ?? ""), /^\d+\.\d+\.\d+$/, `${FILES[i]}: env.FLOW_CLAUDE_CODE_VERSION must be an exact x.y.z version, got ${v}`);
  }
  assert.equal(new Set(versions).size, 1, `the files pin different versions: ${FILES.map((f, i) => `${f}=${versions[i]}`).join(", ")}`);
});

test("every job installs Claude Code from npm before the action", { skip }, () => {
  const jobs = actionJobs();
  // review: qa, code-review, security · kickback: fix, round-card, card · pr-text: check
  assert.equal(jobs.length, 7, `expected 7 jobs running the action, found ${jobs.map((j) => `${j.file}:${j.name}`).join(", ")}`);
  for (const { file, name, steps } of jobs) {
    const where = `${file} job ${name}`;
    const install = steps.findIndex((s) => s.id === "claude-code");
    assert.ok(install >= 0, `${where}: no step with id claude-code`);
    assert.ok(install < steps.findIndex(isAction), `${where}: the claude-code step must come before the first action step`);
    const s = steps[install];
    assert.equal(s["continue-on-error"], true, `${where}: the install must fall back to the action's own download, not fail the job`);
    assert.match(s.run, /npm install [^\n]*"\$pkg"/, `${where}: must npm install the package`);
    assert.match(s.run, /pkg="@anthropic-ai\/claude-code@\$FLOW_CLAUDE_CODE_VERSION"/, `${where}: must install the pinned version`);
    assert.match(s.run, /--version \| grep -qF "\$FLOW_CLAUDE_CODE_VERSION"/, `${where}: must check the installed version`);
    assert.match(s.run, /echo "path=\$bin" >> "\$GITHUB_OUTPUT"/, `${where}: must write the binary path to the output`);
    assert.doesNotMatch(s.run, /claude\.ai\/install\.sh/, `${where}: must not use the download site`);
  }
});

test("every action step uses the npm install", { skip }, () => {
  let count = 0;
  for (const { file, name, steps } of actionJobs()) {
    for (const s of steps.filter(isAction)) {
      count += 1;
      assert.equal(s.with?.path_to_claude_code_executable, PATH_INPUT, `${file} job ${name} step ${s.id ?? s.name}: path_to_claude_code_executable`);
    }
  }
  assert.equal(count, 9, "expected 9 action steps (5 review, 3 kickback, 1 pr-text)");
});

test("the version matches what the pinned action installs", { skip }, () => {
  const pinned = FILES.map((f) => parse(f).env?.FLOW_CLAUDE_CODE_VERSION);
  for (const { file, steps } of actionJobs()) {
    for (const s of steps.filter(isAction)) {
      const sha = s.uses.slice(ACTION.length);
      assert.ok(sha in ACTION_INSTALLS, `${file}: action ${sha} is not in ACTION_INSTALLS. Read claudeCodeVersion in its src/entrypoints/run.ts and add it (see this file's header).`);
      assert.equal(pinned[FILES.indexOf(file)], ACTION_INSTALLS[sha], `${file}: FLOW_CLAUDE_CODE_VERSION must equal the version action ${sha} installs`);
    }
  }
});
