// draft-push-rule.test.mjs — proving tests for flow-0218.
//
// CI already skips draft PRs (flow-0136) and starts the review checks only when a PR leaves draft
// (flow-0039). What was missing was the worker's half: the protocol still told a worker that opens
// its own PR to open it non-draft, framed the local gate as "before opening" rather than "before
// marking ready", and said nothing about how many pushes a fix round should take, although every
// push to a ready PR re-runs the gate and the review checks. These tests pin the protocol text a
// worker reads, and the two workflow facts that text relies on.
//
// The protocol tests read the loop step by step, not the whole file, so a sentence that drifts into
// another step (where a worker following the loop would not meet it) fails them.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE — see check-workflows.test.mjs. The gate's `flow-tooling` job runs these tests
// with no install step; the two workflow tests need `yaml` to read a trigger block the way GitHub
// does. They skip visibly there and run for real in the per-stack job.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const PROTOCOL = readFileSync(join(REPO, "project-template", ".flow", "PROTOCOL.md"), "utf8");
const WF = join(REPO, ".github", "workflows");

// One numbered step of "## The loop you run", from its number to the next step's number.
function loopStep(n) {
  const loop = PROTOCOL.split("## The loop you run")[1].split("\n## ")[0];
  const start = loop.indexOf(`\n${n}. **`);
  assert.notEqual(start, -1, `loop step ${n} not found`);
  const next = loop.indexOf(`\n${n + 1}. **`, start + 1);
  return loop.slice(start, next === -1 ? undefined : next).replace(/\s+/g, " ");
}

test("criterion 1: a worker that opens its own PR opens it as a draft, by both routes", () => {
  const step7 = loopStep(7);
  assert.match(step7, /gh pr create --draft/, "the gh route must pass --draft");
  assert.match(step7, /-F draft=true/, "the REST route must send draft=true");
  assert.doesNotMatch(step7, /non-draft/, "step 7 must no longer tell the worker to open non-draft");
});

test("criterion 2: the PR is marked ready only after the local gate passes", () => {
  assert.match(loopStep(5), /don't mark the PR ready \(step 8\) until all of it passes/);
  assert.match(loopStep(8), /Mark it ready only once the local gate \(step 5\) passes/);
});

test("criterion 3: after a kickback or a red check, the worker fixes everything and pushes once", () => {
  const step9 = loopStep(9);
  assert.match(step9, /Fix everything, then push once\./);
  assert.match(step9, /re-runs the whole CI gate and the review checks/, "the rule must say why");
  assert.match(step9, /red CI check or review check/, "the rule must cover CI failures, not only comments");
});

test("criterion 4: the protocol names the on-demand gate run for a draft, and the callers allow it", { skip }, () => {
  assert.match(loopStep(5), /gh workflow run flow-gates\.yml --ref <branch>/);
  for (const caller of [join(WF, "flow-gates.yml"), join(REPO, "project-template", ".github", "workflows", "flow-gates.yml")]) {
    const on = yamlMod.parse(readFileSync(caller, "utf8")).on;
    assert.ok("workflow_dispatch" in on, `${caller} must accept workflow_dispatch, or the documented command fails`);
  }
});

test("criterion 5: canonical's ci.yml does not run on pull requests", { skip }, () => {
  const on = yamlMod.parse(readFileSync(join(WF, "ci.yml"), "utf8")).on;
  assert.equal("pull_request" in on, false, "the gate's npm test already runs these tests on a PR");
  assert.ok("push" in on && "workflow_dispatch" in on, "it still runs after a merge to main, and on demand");
});
