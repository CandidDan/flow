// queue-runner-retired.test.mjs — proving tests for flow-0174: queue-runner is retired fleet-wide.
//
// Two scans, and each one is shown to be able to fail:
//
//   * THE WORKFLOWS. No file under `.github/workflows/` or `project-template/.github/workflows/`
//     may call, dispatch or `uses:` the queue-runner, and neither of its files may exist. Comments
//     are dropped first, because a comment recording that it is retired is not a call.
//   * EVERY OTHER TRACKED FILE. A remaining mention must sit in a sentence that marks it retired:
//     the hit's own line, or the two lines either side, says "retire". History is exempt. That
//     means the task store, the intents, the changelog and its fragments, and the ADRs, which record
//     what was true and must not be rewritten.
//
// Reads files as text, so it needs no `yaml` install and runs in the flow-tooling job too.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");

// Built from parts so the patterns are explicit about what they match.
const MENTION = new RegExp("queue" + "[- ]runner", "i");
const RETIRED = /retir/i;
const CALL = new RegExp("_?flow-" + "queue-runner(\\.yml)?", "i");

/** History: what was true when it was written. Never rewritten, so never scanned. */
export const HISTORY = [".flow/tasks/", ".flow/intents/", "changes/", "CHANGELOG.md", "docs/adr/"];
const isHistory = (path) => HISTORY.some((h) => (h.endsWith("/") ? path.startsWith(h) : path === h));

const tracked = () =>
  execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8" })
    .split("\0").filter(Boolean).filter((p) => existsSync(join(REPO, p)));

/** `path:line` for every mention that no nearby text marks retired. Pure, so a mutated input proves it can fail. */
export function liveMentions(files, window = 2) {
  const out = [];
  for (const { path, text } of files) {
    if (isHistory(path)) continue;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (!MENTION.test(line)) return;
      const near = lines.slice(Math.max(0, i - window), i + window + 1).join("\n");
      if (!RETIRED.test(near)) out.push(`${path}:${i + 1}`);
    });
  }
  return out;
}

/**
 * Whether a workflow file's code (comments dropped) still reaches the queue-runner. The one line
 * that names it and is not a call is `_flow-sync.yml`'s retired-paths list: that DELETES the
 * caller downstream, which is this task's own mechanism.
 */
export const callsQueueRunner = (yaml) =>
  CALL.test(yaml.split("\n").filter((l) => !/^\s*for RETIRED in /.test(l))
    .map((l) => l.replace(/(^|\s)#.*$/, "")).join("\n"));

const WORKFLOW_DIRS = [".github/workflows", "project-template/.github/workflows"];

test("neither retired queue-runner workflow file exists, in canonical or the template", () => {
  // the three files flow-0174 retired
  for (const f of [".github/workflows/_flow-queue-runner.yml", ".github/workflows/flow-queue-runner.yml",
    "project-template/.github/workflows/flow-queue-runner.yml"]) {
    assert.ok(!existsSync(join(REPO, f)), `${f} must be deleted`);
  }
});

test("no workflow calls, dispatches or uses the retired queue-runner", () => {
  const files = tracked().filter((p) => WORKFLOW_DIRS.some((d) => p.startsWith(`${d}/`)) && /\.ya?ml$/.test(p));
  assert.ok(files.length > 15, `the scan found only ${files.length} workflow files — an empty scan is not a pass`);
  const offenders = files.filter((p) => callsQueueRunner(readFileSync(join(REPO, p), "utf8")));
  assert.deepEqual(offenders, [], `these still reach the retired queue-runner: ${offenders.join(", ")}`);
});

test("the workflow scan catches a uses:, a dispatch and a workflow name, and ignores comments", () => {
  // fixtures: each line below would reach the retired workflow
  assert.ok(callsQueueRunner("    uses: CandidDan/flow/.github/workflows/_flow-queue-runner.yml@v3\n"));
  assert.ok(callsQueueRunner('  run: gh workflow run flow-queue-runner.yml\n'));
  assert.ok(callsQueueRunner("  workflows: [flow-queue-runner]\n"));
  assert.ok(!callsQueueRunner("# flow-queue-runner.yml was retired in flow-0174\n"));
  assert.ok(!callsQueueRunner('  for RETIRED in ".github/workflows/flow-queue-runner.yml"; do\n'),
    "the sync's retired-paths list deletes the caller; it does not call it");
});

test("every remaining mention outside history is in a sentence that marks it retired", () => {
  const files = tracked().map((path) => ({ path, text: readFileSync(join(REPO, path), "utf8") }));
  assert.ok(files.length > 200, `the scan found only ${files.length} files — an empty scan is not a pass`);
  const scanned = files.filter((f) => !isHistory(f.path) && MENTION.test(f.text));
  assert.ok(scanned.length > 0, "nothing outside history mentions it at all, so this check proved nothing; " +
    "this file's own header is expected to");
  const live = liveMentions(files);
  assert.deepEqual(live, [], `these still describe the queue-runner as live — mark them retired or drop them:\n  ${live.join("\n  ")}`);
});

test("the mention scan can fail, and history is exempt", () => {
  const live = [{ path: "docs/x.md", text: "intro\n\n\n\nThe queue runner dispatches a worker hourly.\n" }];
  assert.deepEqual(liveMentions(live), ["docs/x.md:5"]);
  assert.deepEqual(liveMentions([{ path: "docs/x.md", text: "The queue-runner was retired in flow-0174.\n" }]), []);
  for (const path of [".flow/tasks/flow-0001-x.md", "changes/flow-0001.md", "CHANGELOG.md", "docs/adr/0001-x.md"]) {
    assert.deepEqual(liveMentions([{ path, text: live[0].text }]), [], `${path} is history`);
  }
});
