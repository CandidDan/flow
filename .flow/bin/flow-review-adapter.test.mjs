// flow-review-adapter.test.mjs — proving tests for canonical's `.flow/bin/flow-review.mjs`
// adapter.
//
// The gap this closes: flow-0015 gave canonical a `flow-review.yml` caller, but not the
// `.flow/bin/flow-review.mjs` helper that `_flow-review.yml` invokes in the consuming repo — so
// the review gate's `plan` step died on canonical's own PRs (first seen on PR #25) with the
// "run the flow-sync workflow" remedy that cannot apply here: canonical is the sync source and
// deliberately has no flow-sync caller (see adapters.test.mjs).
//
// `flow-review.test.mjs` (in the template's bin/) proves the review logic and the CLI shell;
// `flow-review-workflow.test.mjs` proves the workflow's wiring. What is left to prove here is
// the adapter's own two properties — the ones that fail silently:
//
//   · it resolves CANONICAL's config and history, from this file's location, not from whatever
//     cwd it happens to be invoked in — the property a copy of the template's cwd-relative CLI
//     would lose;
//   · its CLI block actually runs (the symlink failure mode), and the shell it runs is the
//     template's own exported `runReviewCli`, never a second copy of it.
//
// Zero dependencies on purpose: `_flow-gates.yml`'s `flow-tooling` job runs
// `node --test .flow/bin/*.test.mjs` with no install step in front of it.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { canonicalFlowDir, runReviewCli } from "./flow-review.mjs";
import { runReviewCli as templateShell } from "../../project-template/.flow/bin/flow-review.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const FLOW = resolve(BIN, "..");
const REPO = resolve(FLOW, "..");
const TEMPLATE_FLOW = join(REPO, "project-template", ".flow");
const CLI = join(BIN, "flow-review.mjs");

const tmp = (name) => mkdtempSync(join(tmpdir(), `flow-review-ad-${name}-`));
const run = (args, opts = {}) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", ...opts });

test("the adapter resolves CANONICAL's store, not the template's fixture store", () => {
  assert.equal(canonicalFlowDir(), FLOW, "flow-review must resolve canonical's .flow/");
  assert.notEqual(canonicalFlowDir(), TEMPLATE_FLOW,
    "resolving project-template/.flow would plan the review against the fixture config — " +
    "with every command still exiting 0");
});

test("the shell the adapter runs is the template's own exported one — never a copy", () => {
  assert.equal(runReviewCli, templateShell,
    "a second copy of the CLI shell is the flow-0008 hazard in miniature: the same fix needed " +
    "twice, and the gate green when only one lands");
});

test("`plan` reads canonical's config and history from ANY cwd — what a cwd-relative copy would lose", () => {
  const dir = tmp("plan");
  try {
    const out = join(dir, "gh-output");
    // cwd is a bare temp directory: no .flow/config.yml here, and not a git repository. The
    // template's CLI invoked here would die on both counts; the adapter must pin everything to
    // canonical's own tree. BASE_REF=HEAD keeps the diff empty and the run hermetic.
    const r = run(["plan"], {
      cwd: dir,
      env: {
        ...process.env,
        BASE_REF: "HEAD",
        REVIEW_OUT_DIR: join(dir, "out"),
        GITHUB_OUTPUT: out,
        GITHUB_STEP_SUMMARY: "",
      },
    });

    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /### Flow review gate — plan/,
      "the CLI block must actually run — silence here is the symlink failure mode");
    assert.match(readFileSync(out, "utf8"), /^model=/m,
      "_flow-review.yml reads the reviewer model from this output");
    assert.ok(existsSync(join(dir, "out", "files.txt")) && existsSync(join(dir, "out", "diff.patch")),
      "the bounded context the reviewers read must be materialised where REVIEW_OUT_DIR says");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("`verdict` FAILS CLOSED through the adapter — a missing verdict is never an approval", () => {
  const r = run(["verdict", join(tmpdir(), "flow-review-ad-no-such.json"), "--check", "qa"]);
  assert.equal(r.status, 1, "a reviewer that died mid-run must not read as an approval");
  assert.match(r.stderr, /no verdict at/);
});

test("a clean verdict clears the check, and an unknown command never exits 0", () => {
  const dir = tmp("verdict");
  try {
    const f = join(dir, "qa.json");
    writeFileSync(f, JSON.stringify({ verdict: "PASS", summary: "in scope, tested" }));
    const r = run(["verdict", f, "--check", "qa"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /qa: PASS/);

    const bad = run(["definitely-not-a-command"]);
    assert.equal(bad.status, 1, "exit 0 having done nothing is the fail-open shape every guard here refuses");
    assert.match(bad.stderr, /expected "plan" or "verdict"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
