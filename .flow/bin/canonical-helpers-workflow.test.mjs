// canonical-helpers-workflow.test.mjs — the gate runs CANONICAL's helpers, at its own commit.
//
// flow-0094 / ADR-0008. A Flow repo adopts two things from canonical and they arrive at different
// times: the reusable workflows, which change for every pinned repo the instant an alias moves,
// and the `.flow/bin/` helpers those workflows invoke, which are files in the consuming repo and
// change only when its flow-sync PR merges. So a release that made a reusable need a new helper
// broke every pinned repo until it synced — 2.1.0 (`source-roots.mjs`) and 2.1.1
// (`check-claude-md.mjs`) did exactly that, and every `@v2` repo went red on every PR for a reason
// that had nothing to do with its own code.
//
// `_flow-gates.yml` now fetches canonical's `project-template/.flow/bin/` at the same commit as
// the running workflow and runs the helper from there. These tests pin both halves: that the
// workflow really does it, and that a helper run from that foreign directory reads the repo it was
// pointed at rather than the fixtures it was loaded from.
//
// Canonical-only by location: it lives in `.flow/bin/`, not `project-template/.flow/bin/`, so
// flow-sync never copies it into a repo that has no `project-template/` to test.
//
// TEXT SCANNING, not YAML parsing, on purpose: the `flow-tooling` job runs
// `node --test .flow/bin/*.test.mjs` with no install step before it, so `yaml` is not importable.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import test from "node:test";

const REPO = resolve(import.meta.dirname, "..", "..");
const WORKFLOW = join(REPO, ".github", "workflows", "_flow-gates.yml");
const TEMPLATE = join(REPO, "project-template");
const ADR = join(REPO, "docs", "adr", "0008-helpers-from-canonical.md");

const source = readFileSync(WORKFLOW, "utf8");

// The three helpers this slice converts. `flow-doctor` is deliberately NOT here — see below.
const CONVERTED = ["source-roots.mjs", "check-claude-md.mjs", "touches-guard.mjs"];

// The env var name the workflow exports the fetched directory as, and the one it points the
// helpers back at the caller's checkout with.
const BIN_VAR = '"$FLOW_BIN"';
const REPO_DIR_ENV = "FLOW_REPO_DIR";
const CI_MODE_ENV = "FLOW_CI";

// ─────────────────────────────────────────────────────────────────────────────────────────
// The ADR
// ─────────────────────────────────────────────────────────────────────────────────────────

test("the ADR exists and records how the commit is obtained, with the evidence and the fallback's race", () => {
  assert.ok(existsSync(ADR), "the decision must be written down before the mechanism is relied on");
  const adr = readFileSync(ADR, "utf8");

  assert.match(adr, /job\.workflow_sha/,
    "the ADR must name the property the workflow actually uses");
  assert.match(adr, /job\.workflow_repository/,
    "…and how the fetch learns which repo to fetch from");
  assert.match(adr, /github\.job_workflow_sha/,
    "…and must dispose of the name that looks right and is not exposed as an expression, or the " +
    "next person re-derives that from scratch");
  assert.match(adr, /docs\.github\.com/,
    "the evidence must be citable, not remembered — a documented context or a run log");
  assert.match(adr, /flow_ref/, "the fallback must be named");
  assert.match(adr, /\brace\b/i,
    "and its race stated: an alias that moves mid-run leaves that run one release ahead");
  assert.match(adr, new RegExp(REPO_DIR_ENV),
    "the repo-root variable is a contract between the workflow and the helpers; it is named once, here");
  assert.match(adr, /flow-doctor/,
    "and why flow-doctor and the flow-tooling tests deliberately stay on the repo's own copy");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// The conversion: what the workflow invokes, and from where
// ─────────────────────────────────────────────────────────────────────────────────────────

test("no converted helper is invoked against the caller's checkout", () => {
  for (const helper of CONVERTED) {
    assert.ok(!source.includes(`node .flow/bin/${helper}`),
      `_flow-gates.yml still runs .flow/bin/${helper} from the caller's checkout. That file ` +
      "arrives with a flow-sync PR while this workflow arrives with an alias move, and the gap " +
      "between the two is the 2.1.x fleet break.");
  }
});

test("every converted helper is invoked from the fetched canonical path", () => {
  for (const helper of CONVERTED) {
    assert.ok(source.includes(`node ${BIN_VAR}/${helper}`),
      `_flow-gates.yml must run ${helper} from the canonical checkout it materialised, as ` +
      `node ${BIN_VAR}/${helper}`);
  }
});

test("every step that invokes a converted helper passes the repo root and turns CI mode on", () => {
  const steps = source.split(/\n      - (?:name|uses):/);
  const invoking = steps.filter((s) => CONVERTED.some((h) => s.includes(`node ${BIN_VAR}/${h}`)));
  assert.equal(invoking.length, 4,
    "expected exactly the four helper invocations (ceiling, touches, plan, run); got " +
    `${invoking.length} — a new one without the env block would read canonical's own fixtures`);
  for (const step of invoking) {
    assert.match(step, new RegExp(`${REPO_DIR_ENV}: \\$\\{\\{ github\\.workspace \\}\\}`),
      `a step invokes a converted helper without ${REPO_DIR_ENV}. Run from canonical's checkout ` +
      "the helper resolves its store from its own realpath — canonical's fixtures — and exits 0.");
    assert.match(step, new RegExp(`${CI_MODE_ENV}: "1"`),
      `…and without ${CI_MODE_ENV} the helper would silently fall back instead of failing loudly ` +
      `if ${REPO_DIR_ENV} were ever dropped`);
  }
});

test("the dead `run flow-sync` advice is gone — the state it described is unreachable", () => {
  for (const helper of CONVERTED) {
    assert.ok(!source.includes(`! -f .flow/bin/${helper}`),
      `the "${helper} is missing, run flow-sync" branch guarded against a caller that bumped its ` +
      "workflow refs without syncing. The helper now arrives with the workflow, so that state " +
      "cannot happen and the branch would send the next person to fix the wrong thing.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// The fetch itself
// ─────────────────────────────────────────────────────────────────────────────────────────

// Each copy of the materialise step: from its `- name:` to the line that exports the fetched
// directory, which is the step's last. Cut there rather than at the next step, so the comparison
// below is of the step itself and not of whatever happens to follow it in each job.
const FETCH_END = 'echo "FLOW_BIN=$bin" >> "$GITHUB_ENV"';
function fetchSteps() {
  return source.split("\n      - name: ")
    .filter((s) => s.startsWith("Materialise canonical's helpers"))
    .map((s) => {
      const end = s.indexOf(FETCH_END);
      assert.ok(end > -1, `a fetch step does not export ${BIN_VAR} — nothing downstream could run`);
      return s.slice(0, end + FETCH_END.length);
    });
}

test("the fetch pins the commit the ADR specifies, and refuses a moving branch", () => {
  const steps = fetchSteps();
  assert.ok(steps.length > 0, "an empty scan is a failure, not a pass — no fetch step found");
  for (const step of steps) {
    assert.match(step, /\$\{\{ job\.workflow_sha \}\}/,
      "the ref must come from this workflow's own commit — `github.workflow_sha` is the CALLER's");
    assert.match(step, /\$\{\{ job\.workflow_repository \}\}/,
      "and the repo from the same context, so a fork gates against itself");
    assert.match(step, /main\|master\|HEAD\|refs\/heads\/\*/,
      "a moving branch must be REFUSED. A gate that follows a branch cannot be reproduced from a " +
      "run log, and two runs of it gate against different code.");
    assert.ok(!/origin\/main|@main\b/.test(step),
      "and `main` must not appear as a fetch target anywhere in the step");
    assert.match(step, /inputs\.flow_ref/,
      "the documented fallback for a platform where the job context is unavailable");
  }
});

test("the `flow_ref` input defaults to empty, never to a branch", () => {
  const block = source.slice(source.indexOf("      flow_ref:"), source.indexOf("jobs:"));
  assert.ok(block.includes("flow_ref:"), "the input must exist");
  assert.match(block, /default: ""/,
    'defaulting flow_ref to a branch name would make the refusal above unreachable and put every ' +
    "GHES repo back on a moving ref");
});

test("the four copies of the fetch step are byte-identical", () => {
  // The same rule `gate-assertion.test.mjs` applies to the two decision-line assertions. A
  // reusable workflow cannot share a step between jobs without a composite action, and a composite
  // action would itself have to be fetched before it could fetch anything — so the copies stay,
  // and stay pinned. A divergence here means one job is gating against a different commit.
  const steps = fetchSteps();
  assert.equal(steps.length, 4,
    "expected one fetch per job that runs a helper: gate, touches, source-roots-plan, source-root");
  for (const s of steps.slice(1)) {
    assert.equal(s, steps[0],
      "the copies have drifted. One job is now materialising canonical differently from another, " +
      "which is how two jobs in one run end up gating against two different commits.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// What deliberately did NOT move
// ─────────────────────────────────────────────────────────────────────────────────────────

test("flow-doctor and the flow-tooling test step still run the repo's own copy", () => {
  const job = source.slice(source.indexOf("\n  flow-tooling:"));
  const end = job.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  const tooling = end === -1 ? job : job.slice(0, end + 1);

  assert.match(tooling, /node --test \.flow\/bin\/\*\.test\.mjs/,
    "the point of this step is to prove the SYNCED copy works in the repo that synced it. Running " +
    "canonical's tests instead would make it unable to fail for the reason it was added.");
  assert.match(tooling, /node \.flow\/bin\/flow-doctor\.mjs/,
    "flow-doctor validates THIS repo's store against THIS repo's tooling — run from canonical it " +
    "would report on canonical");
  assert.ok(!tooling.includes(BIN_VAR),
    "and neither may quietly become canonical's copy");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// The 2.1.0 break, proved closed
// ─────────────────────────────────────────────────────────────────────────────────────────

// The closest cheap stand-in for a repo that adopted Flow and has not synced since: the published
// template (what `flow-init` gave it), minus `.flow/intents/` (which flow-sync does not carry),
// with its config calibrated — and then with the two helpers 2.1.x added DELETED. Same shape as
// `adopter-layout.test.mjs`'s stand-in, for the same reason.
function buildStaleAdopter() {
  const dir = mkdtempSync(join(tmpdir(), "flow-stale-adopter-"));
  cpSync(TEMPLATE, dir, { recursive: true });
  rmSync(join(dir, ".flow", "intents"), { recursive: true, force: true });
  const cfgPath = join(dir, ".flow", "config.yml");
  writeFileSync(cfgPath, readFileSync(cfgPath, "utf8").replaceAll("REPLACE-ME", "demo"));
  mkdirSync(join(dir, "demo"), { recursive: true });
  writeFileSync(join(dir, "demo", "index.js"), "export const ok = true;\n");
  // The 2.1.x state exactly: the repo predates both helpers and has not run flow-sync.
  for (const h of ["source-roots.mjs", "check-claude-md.mjs"]) {
    rmSync(join(dir, ".flow", "bin", h), { force: true });
  }
  return dir;
}

// What `_flow-gates.yml`'s materialise step produces: canonical's `project-template/.flow/bin/`
// under a directory that is not the repo under test. The layout is copied exactly, because the
// helpers resolve their fallback root relative to it — which is the fallback that must not win.
function materialiseCanonical() {
  const dir = mkdtempSync(join(tmpdir(), "flow-canonical-"));
  cpSync(TEMPLATE, join(dir, "project-template"), { recursive: true });
  return join(dir, "project-template", ".flow", "bin");
}

// The invocation the workflow really makes, read OUT of the workflow rather than restated here, so
// this cannot keep passing against a step that has changed. `$FLOW_BIN` is substituted the way the
// runner would substitute it.
function invocationFromWorkflow(helper) {
  const line = source.split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(`node ${BIN_VAR}/${helper}`));
  assert.ok(line, `no step invokes ${helper} — the workflow changed under this test`);
  return line.replace(/\s*2>&1.*$/, "").split(/\s+/).slice(1);
}

test("a stale adopter missing both 2.1.x helpers still passes the converted gate steps", () => {
  const repoDir = buildStaleAdopter();
  const bin = materialiseCanonical();
  try {
    assert.ok(!existsSync(join(repoDir, ".flow", "bin", "source-roots.mjs")),
      "sanity: the stand-in must really be missing the helper, or this proves nothing");

    for (const [helper, extra] of [["check-claude-md.mjs", []], ["source-roots.mjs", []]]) {
      const [script, ...args] = invocationFromWorkflow(helper);
      assert.equal(script, `${BIN_VAR}/${helper}`.replace(BIN_VAR, BIN_VAR));
      const r = spawnSync(process.execPath, [join(bin, helper), ...args, ...extra], {
        cwd: repoDir,
        encoding: "utf8",
        env: { ...process.env, [REPO_DIR_ENV]: repoDir, [CI_MODE_ENV]: "1" },
      });
      assert.equal(r.status, 0,
        `${helper} failed in a repo that has not synced — this is the 2.1.x break, still open:\n` +
        `${r.stdout}\n${r.stderr}`);
    }
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(resolve(bin, "..", "..", ".."), { recursive: true, force: true });
  }
});

test("the same stale adopter fails the OLD invocation — the proof above is not vacuous", () => {
  const repoDir = buildStaleAdopter();
  try {
    const r = spawnSync(process.execPath, [join(repoDir, ".flow", "bin", "source-roots.mjs"), "plan"], {
      cwd: repoDir, encoding: "utf8",
    });
    assert.notEqual(r.status, 0,
      "if the caller's copy worked too, the test above would pass without the conversion");
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});
