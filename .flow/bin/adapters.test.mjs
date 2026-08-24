// adapters.test.mjs — proving tests for canonical's `.flow/bin` adapters.
//
// Canonical adopts Flow by *calling* its own `project-template/.flow/bin/` logic rather than
// copying it, so the only new behaviour in these four files is (a) which store they resolve and
// (b) that their CLI blocks actually run. Both are exactly the things that fail silently:
//
//   · A wrong store means flow-doctor validates the template's fixture tasks instead of
//     canonical's real ones, and apply-board-edits writes state into the wrong directory —
//     while every command still exits 0.
//   · A CLI block that never runs makes flow-status and flow-done no-op, leaving a merged
//     task stranded at in_progress with the gate reporting success.
//
// Criteria proved here (flow-0004):
//   · "flow-doctor runs against this repo and reports no consistency failures"
//   · the local half of "PR opens -> in_review with branch and pr recorded; merges -> done"
//     (the CI half is proved by this task's own PR)
//
// flow-0015 added the fifth adapter (flow-state) and the five missing workflow callers; the
// sections at the foot of this file prove those. They belong here rather than in a file of
// their own because they are the same property under test: canonical adopting its own tooling
// without the adoption quietly pointing at the wrong tree.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { canonicalRepoRoot, canonicalTasksDir } from "./flow-state.mjs";
import { canonicalFlowDir as doctorFlowDir } from "./flow-doctor.mjs";
import { canonicalFlowDir as editsFlowDir, applyEdits } from "./apply-board-edits.mjs";
import { canonicalFlowDir as guardFlowDir, findTaskFile } from "./touches-guard.mjs";
import { parseTaskId } from "./parse-task-id.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const FLOW = resolve(BIN, "..");
const REPO = resolve(FLOW, "..");
const TEMPLATE_FLOW = join(REPO, "project-template", ".flow");

const tmp = (name) => mkdtempSync(join(tmpdir(), `flow-ad-${name}-`));
const run = (script, args = [], env = {}) =>
  spawnSync(process.execPath, [join(BIN, script), ...args],
    { cwd: REPO, encoding: "utf8", env: { ...process.env, ...env } });

test("every adapter resolves CANONICAL's store, not the template's fixture store", () => {
  for (const [name, dir] of [["flow-doctor", doctorFlowDir()],
                             ["apply-board-edits", editsFlowDir()],
                             ["touches-guard", guardFlowDir()]]) {
    assert.equal(dir, FLOW, `${name} must resolve canonical's .flow/`);
    assert.notEqual(dir, TEMPLATE_FLOW,
      `${name} must NOT resolve project-template/.flow — that is the fixture store, and ` +
      `writing state there would silently corrupt the template while reporting success`);
  }
});

test("the store the adapters resolve is the one holding this task", () => {
  const file = findTaskFile(join(doctorFlowDir(), "tasks"), "flow-0004");
  assert.ok(file, "flow-0004 must be findable in the store the adapters point at");
  assert.match(readFileSync(file, "utf8"), /^id: "flow-0004"$/m);
});

test("flow-doctor reports no consistency failures against this repo", () => {
  const r = run("flow-doctor.mjs");
  assert.match(r.stdout, /flow-doctor: \d+ task\(s\) checked/,
    "the CLI block must actually run — silence here is the symlink failure mode");
  assert.equal(r.status, 0,
    `flow-doctor found problems:\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /FAIL/, r.stderr);
});

test("flow-doctor finds no undeclared top-level source tree", () => {
  const r = run("flow-doctor.mjs");
  assert.doesNotMatch(r.stderr, /not covered by any source_root/, r.stderr);
  assert.doesNotMatch(r.stderr, /does not exist on disk/,
    "every declared source_root must exist — flightdeck/bin/ does not yet, flightdeck/ does");
});

test("parse-task-id CLI resolves an id from the branch, then the PR title", () => {
  assert.equal(run("parse-task-id.mjs", ["flow/flow-0004-canonical", ""]).stdout.trim(), "flow-0004");
  assert.equal(run("parse-task-id.mjs", ["claude/next-tasks-ahnx30", "[flow-0004] Adopt Flow"]).stdout.trim(),
    "flow-0004", "a platform-forced branch must still resolve via the PR title");
  assert.equal(run("parse-task-id.mjs", ["some/branch", "no id here"]).stdout.trim(), "",
    "no id is the workflows' safe no-op");
  assert.equal(run("parse-task-id.mjs", ["some/branch", "no id here"]).status, 0);
});

test("the branch this task is on only resolves via the PR title — so the title is load-bearing", () => {
  assert.equal(parseTaskId("claude/next-tasks-ahnx30", ""), null);
  assert.equal(parseTaskId("claude/next-tasks-ahnx30", "[flow-0004] Adopt Flow in canonical"), "flow-0004");
});

test("PR opened -> in_review with branch and pr recorded (the flow-status transition)", () => {
  const dir = tmp("status");
  try {
    cpSync(join(FLOW, "tasks"), dir, { recursive: true });
    const { applied, problems } = applyEdits({
      tasksDir: dir,
      updates: [{ id: "flow-0004", status: "in_review", branch: "claude/next-tasks-ahnx30", pr: "https://github.com/CandidDan/flow/pull/8" }],
    });

    assert.equal(applied, 1);
    assert.deepEqual(problems, []);
    const after = readFileSync(join(dir, "flow-0004-canonical-adopts-flow.md"), "utf8");
    assert.match(after, /^status: "in_review"$/m);
    assert.match(after, /^branch: "claude\/next-tasks-ahnx30"$/m);
    assert.match(after, /^pr: "https:\/\/github\.com\/CandidDan\/flow\/pull\/8"$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PR merged -> done (the flow-done transition)", () => {
  const dir = tmp("done");
  try {
    cpSync(join(FLOW, "tasks"), dir, { recursive: true });
    applyEdits({ tasksDir: dir, updates: [{ id: "flow-0004", status: "in_review" }] });
    const { applied, problems } = applyEdits({ tasksDir: dir, updates: [{ id: "flow-0004", status: "done" }] });

    assert.equal(applied, 1);
    assert.deepEqual(problems, []);
    assert.match(readFileSync(join(dir, "flow-0004-canonical-adopts-flow.md"), "utf8"), /^status: "done"$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PR closed unmerged -> back to ready, cleared for re-claim (the flow-status reset)", () => {
  const dir = tmp("reopen");
  try {
    cpSync(join(FLOW, "tasks"), dir, { recursive: true });
    applyEdits({ tasksDir: dir, updates: [{ id: "flow-0004", status: "ready", owner: "", branch: "", pr: "" }] });

    const after = readFileSync(join(dir, "flow-0004-canonical-adopts-flow.md"), "utf8");
    assert.match(after, /^status: "ready"$/m);
    assert.match(after, /^owner: ""$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply-board-edits CLI fails loudly when the edits file is missing", () => {
  const r = run("apply-board-edits.mjs", [join(tmpdir(), "flow-no-such-edits.json")]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no edits file at/);
});

test("touches-guard skips cleanly when no task id resolves, rather than failing the gate", () => {
  const r = run("touches-guard.mjs", [], { HEAD_REF: "some/branch", PR_TITLE: "no id" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no task id in branch/);
});

test("touches-guard's CLI actually runs — the guard must never fail open", () => {
  // A guard reached through a symlink used to exit 0 having done nothing, and the gate went
  // green reporting enforcement it never performed. Assert on output, not just exit status.
  const r = run("touches-guard.mjs", [], { HEAD_REF: "flow/flow-0004-x", PR_TITLE: "", BASE_REF: "HEAD" });
  assert.match(r.stdout, /touches-guard: flow-0004 — \d+ feature file\(s\) checked against \d+ glob\(s\)/,
    `expected the guard to report a real check; got:\n${r.stdout}${r.stderr}`);
});

// ══ the flow-review adapter — `_flow-review.yml` (flow-0007) invokes `.flow/bin/flow-review.mjs
//    plan`/`verdict` on every PR. Canonical had no such file (this repo's own PRs failed
//    `flow-review / plan` with "flow-review.mjs is missing" until this closed the gap — the
//    same class of miss flow-state.mjs's header describes, except this one was not latent) ══

test("flow-review adapter CLI actually runs `plan` against canonical's own config — not a symlink no-op", () => {
  const dir = tmp("review-plan");
  try {
    const out = join(dir, "gh-output");
    const summary = join(dir, "gh-summary");
    writeFileSync(out, "");
    writeFileSync(summary, "");
    const r = run("flow-review.mjs", ["plan"], {
      BASE_REF: "HEAD", GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary,
    });
    assert.equal(r.status, 0, `expected plan to succeed against canonical's real .flow/config.yml:\n${r.stderr}`);
    assert.match(r.stdout, /### Flow review gate — plan/,
      `expected the adapter to actually execute the template's CLI, not exit silently; got:\n${r.stdout}${r.stderr}`);
    assert.match(readFileSync(out, "utf8"), /^model=/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("flow-review adapter CLI `verdict` fails closed on a missing verdict file, same as the template", () => {
  const r = run("flow-review.mjs", ["verdict", join(tmpdir(), "flow-adapter-no-such-verdict.json"), "--check", "qa"]);
  assert.equal(r.status, 1, "a reviewer that produced no verdict must not read as an approval");
  assert.match(r.stderr, /no verdict at/);
});

test("findTaskFile ignores the template placeholder and returns null for an unknown id", () => {
  const tasks = join(doctorFlowDir(), "tasks");
  assert.equal(findTaskFile(tasks, "flow-9999"), null);
});

// ══ flow-0015: the flow-state adapter, and the callers that make canonical run its own
//    automation ═══════════════════════════════════════════════════════════════════════════
//
// Two findings with one root cause, both from adoption having been scoped to "what CI already
// invokes" rather than "what this repo needs to run the protocol":
//
//   · canonical had no `.flow/bin/flow-state.mjs`, so `flightdeck-state.mjs` reported the repo
//     that AUTHORS the flightdeck as `unavailable` (PR #13);
//   · canonical published nine reusable workflows and called three of them.
//
// The store-resolution hazard is sharper for flow-state than for the other adapters. A copy or
// a symlink here resolves `project-template/` as the repo root — a store holding one
// placeholder task, and in practice not even that: `readTasksFromOrigin` shells out to
// `git ls-tree`, whose paths come out relative to the cwd it is given, so pointed at the
// template it resolves to NOTHING, exits 0, and the flightdeck renders a healthy empty project.
// The tests below therefore assert on the ids, never merely on the exit status.

// ── a real repo whose origin/main ref exists, built without a network ──────────────────────
// `flow-state` reads `origin/main` and falls back to the working tree when it cannot. A test
// that ran against this checkout would silently take whichever path the CI runner happened to
// give it (a PR checkout has no `origin/main` ref), so the fixture below constructs the
// authoritative layer explicitly: copy the repo, commit it, point `refs/remotes/origin/main` at
// that commit. It is canonical's actual adapter and actual store, in the state a fresh clone is
// in — which is the state every consumer of the resolver is in.
// Always built from REPO, never by copying an existing fixture: git writes loose objects mode
// 0444, and copying a tree that already contains them fails with EACCES for any user that does
// not own them — invisible to a root shell, red on a CI runner.
function buildClone({ omit = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "flow-clone-"));
  const dir = join(root, "flow");
  const excluded = omit ? join(REPO, omit) : null;
  cpSync(REPO, dir, {
    recursive: true,
    filter: (src) => !/(^|[\\/])(\.git|node_modules)$/.test(src) && src !== excluded,
  });
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "--quiet", "-b", "main");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "--quiet", "-m", "fixture");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  return { root, dir };
}

let _fixture = null;
function canonicalClone() {
  if (!_fixture) _fixture = buildClone();
  return _fixture.dir;
}
process.on("exit", () => { if (_fixture) rmSync(_fixture.root, { recursive: true, force: true }); });

// The ids canonical's store actually holds, read straight off disk — the answer the resolver
// must reproduce, derived independently of the resolver.
const storeIds = (tasksDir) =>
  readdirSync(tasksDir)
    .filter((n) => n.endsWith(".md") && n !== "_TEMPLATE.md")
    .map((n) => readFileSync(join(tasksDir, n), "utf8").match(/^id:\s*"?([^"\n]+)"?/m)?.[1].trim())
    .filter(Boolean)
    .sort();

test("the flow-state adapter resolves CANONICAL's root and store, not the template's", () => {
  assert.equal(canonicalRepoRoot(), REPO, "the repo root is what runStateCli is given");
  assert.equal(canonicalTasksDir(), join(FLOW, "tasks"));
  assert.notEqual(canonicalTasksDir(), join(TEMPLATE_FLOW, "tasks"),
    "project-template/.flow/tasks holds only _TEMPLATE.md — resolving it would report canonical " +
    "as having no tasks at all, and still exit 0");

  // State the two stores' contents as an assertion rather than a comment, so the wrong-store
  // failure is characterised rather than assumed: the template holds a single placeholder task
  // and canonical holds the real backlog, and they share nothing.
  const template = storeIds(join(TEMPLATE_FLOW, "tasks"));
  const canonical = storeIds(join(FLOW, "tasks"));
  assert.ok(canonical.includes("flow-0015"), "canonical's store holds this task");
  assert.ok(!template.includes("flow-0015"));
  assert.deepEqual(template.filter((id) => canonical.includes(id)), [],
    "the two stores are disjoint, so reading the wrong one is never a partially-right answer");
});

test("node .flow/bin/flow-state.mjs --json emits canonical's own task ids, resolved from origin/main", () => {
  const dir = canonicalClone();
  const r = spawnSync(process.execPath, [join(dir, ".flow", "bin", "flow-state.mjs"), "--json", "--no-pr"],
    { encoding: "utf8" });

  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.trim(), "empty stdout is how flightdeck-state decides a resolver failed");
  const payload = JSON.parse(r.stdout);
  assert.match(payload.source, /^origin\/main @ /,
    `state must come from origin/main, never the working tree; got: ${payload.source}`);
  assert.deepEqual(payload.tasks.map((t) => t.id).sort(), storeIds(join(dir, ".flow", "tasks")),
    "the ids reported must be canonical's own, one for one");
  assert.ok(payload.tasks.length > 1, "a copy or symlink would report the template's empty store");
});

test("the adapter's CLI block actually runs against this checkout — silence is the symlink failure", () => {
  const r = run("flow-state.mjs", ["--no-pr"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^state source: /m, "the CLI must produce its header, not nothing");

  // Assert the ROW EXISTS with some lifecycle value, never a particular one: `flow-status` and
  // `flow-done` move this task's status while the branch sits open, so pinning it to
  // `in_progress` writes a test that the automation invalidates the moment the PR opens.
  assert.match(r.stdout, /^flow-0015\s+(ready|in_progress|in_review|done|blocked)\s+\S/m,
    "this task must appear in canonical's own resolved state, whatever the lifecycle has done to it");
});

test("flightdeck-state resolves canonical as ok, closing the 'unavailable' finding from PR #13", () => {
  const dir = canonicalClone();
  const registry = join(dir, "..", "registry.yml");
  writeFileSync(registry,
    `projects:\n  - name: "canonical"\n    repo: "CandidDan/flow"\n    path: "${dir}"\n    enabled: true\n`);

  const r = spawnSync(process.execPath,
    [join(REPO, "flightdeck", "bin", "flightdeck-state.mjs"), "--registry", registry, "--no-pr"],
    { encoding: "utf8" });

  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const canonical = out.projects.find((p) => p.name === "canonical");
  assert.ok(canonical, "canonical must appear in the aggregation");
  assert.equal(canonical.status, "ok",
    `canonical must resolve, not be reported unavailable — reason given: ${canonical.reason}`);
  assert.equal(canonical.reason, undefined);
  assert.equal(out.summary.unavailable, 0);
  assert.ok(canonical.tasks.length > 1, "an 'ok' project with no tasks is the empty-store failure wearing a green badge");
  assert.ok(canonical.tasks.every((t) => t.project === "canonical"));
  assert.match(canonical.provenance.commit, /^[0-9a-f]{40}$/);
});

test("removing the adapter reproduces PR #13's exact failure — the test that would have caught it", () => {
  // Same repo, same origin/main — only `.flow/bin/flow-state.mjs` is absent, which is exactly
  // what canonical was before this task. The omission is matched by absolute path, so the
  // template's own flow-state.mjs (same trailing path) stays put and the missing file really
  // is the adapter.
  const { root, dir } = buildClone({ omit: join(".flow", "bin", "flow-state.mjs") });
  try {
    assert.ok(existsSync(join(dir, "project-template", ".flow", "bin", "flow-state.mjs")),
      "only the adapter is removed — the template's resolver must survive, or this proves nothing");
    assert.ok(!existsSync(join(dir, ".flow", "bin", "flow-state.mjs")));

    const registry = join(root, "registry-missing.yml");
    writeFileSync(registry, `projects:\n  - name: "canonical"\n    path: "${dir}"\n    enabled: true\n`);

    const r = spawnSync(process.execPath,
      [join(REPO, "flightdeck", "bin", "flightdeck-state.mjs"), "--registry", registry, "--no-pr"],
      { encoding: "utf8" });
    const p = JSON.parse(r.stdout).projects[0];
    assert.equal(p.status, "unavailable");
    assert.match(p.reason, /flow-state\.mjs/, "the reason must name the resolver that is missing");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ══ the workflow callers (flow-0015) ══════════════════════════════════════════════════════
//
// Canonical publishes nine reusable workflows and used to call three, so its own reusables were
// exercised only in other people's repos — a bug in `_flow-open-pr.yml` would be found
// downstream, after the ref had been pinned. These tests assert the wiring itself, because the
// wiring is what rots quietly: a caller that grants too few permissions fails at dispatch time
// with a message about the reusable, and a caller pinned to the wrong ref never fails at all.
//
// DEPENDENCY NOTE — see check-workflows.test.mjs. `_flow-gates.yml`'s `flow-tooling` job runs
// `node --test .flow/bin/*.test.mjs` with no install step, so the structural assertions that
// need to read a workflow the way GitHub does are skipped there and run for real in the
// per-stack gate job. The ones that can be made without a YAML loader are NOT guarded, so the
// no-install job still proves the pins, the callers' existence and the queue-runner's cadence.

const WORKFLOWS = join(REPO, ".github", "workflows");
const wfNames = readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n)).sort();
const wfSrc = (name) => readFileSync(join(WORKFLOWS, name), "utf8");

// The reusables, by their short name: `_flow-open-pr.yml` -> `open-pr`.
const REUSABLES = wfNames.filter((n) => n.startsWith("_flow-")).map((n) => n.slice(6, -4));
// The five this task added, distinct from the three canonical already had.
const ADDED = ["flow-open-pr.yml", "flow-recover.yml", "flow-triage.yml", "flow-review.yml",
               "flow-queue-runner.yml"];

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";
const wfParse = (name) => yamlMod.parse(wfSrc(name));

// ── criterion: a caller for every reusable except _flow-sync.yml, and the absence is explained ──

test("every reusable has a thin caller except _flow-sync.yml, whose absence is recorded in a comment", () => {
  assert.ok(REUSABLES.length >= 9, `expected canonical's reusables; found ${REUSABLES.join(", ")}`);

  const missing = REUSABLES.filter((n) => n !== "sync" && !wfNames.includes(`flow-${n}.yml`));
  assert.deepEqual(missing, [],
    "a reusable with no caller is a workflow canonical publishes and never runs on itself");

  assert.ok(!wfNames.includes("flow-sync.yml"),
    "canonical is the sync source; a self-sync can only report that it is up to date with itself");

  // The absence has to be legible to a reader counting eight callers against nine reusables.
  const explained = wfNames.some((n) => /flow-sync\.yml.*(no caller|deliberately|absence)|WHY THERE IS NO flow-sync/is
    .test(wfSrc(n)));
  assert.ok(explained,
    "some workflow file must record WHY flow-sync has no caller — otherwise it reads as an oversight");
});

// ── criterion: each new caller references the reusable @main, grants matching permissions, inherits secrets ──

test("every new caller references CandidDan/flow's reusable at @main, not @v1", () => {
  for (const name of ADDED) {
    const src = wfSrc(name);
    const reusable = `_${name.replace(/\.yml$/, "")}.yml`;
    assert.match(src, new RegExp(`uses:\\s*CandidDan/flow/\\.github/workflows/${reusable.replace(/[.]/g, "\\.")}@main`),
      `${name} must call ${reusable}@main — canonical gates against the reusables as they are ` +
      `now, not as they were at the last release (see flow-gates.yml's header)`);
    assert.doesNotMatch(src, /@v1\b/,
      `${name} must not pin @v1: that would gate canonical against a version of itself it has moved past`);
  }
});

test("every new caller passes secrets: inherit, or the reusable gets no token at all", () => {
  for (const name of ADDED) {
    assert.match(wfSrc(name), /^\s*secrets:\s*inherit\s*$/m,
      `${name} must inherit secrets — FLOW_PAT and CLAUDE_CODE_OAUTH_TOKEN reach the reusable no other way`);
  }
});

test("every new caller grants at least the permissions its reusable declares", { skip }, () => {
  for (const name of ADDED) {
    const reusable = `_${name.replace(/\.yml$/, "")}.yml`;
    const required = wfParse(reusable).permissions ?? {};
    const jobs = Object.values(wfParse(name).jobs ?? {});
    assert.equal(jobs.length, 1, `${name} is a thin caller: exactly one job`);
    const granted = jobs[0].permissions ?? {};

    for (const [scope, level] of Object.entries(required)) {
      assert.equal(granted[scope], level,
        `${name} must grant ${scope}: ${level} — a reusable cannot raise a permission above ` +
        `its caller's grant, and a permissions block is exhaustive, so an omitted scope is a denial`);
    }
  }
});

test("id-token: write is granted on the caller wherever the reusable runs claude-code-action", { skip }, () => {
  for (const name of ADDED) {
    const reusable = `_${name.replace(/\.yml$/, "")}.yml`;
    const usesAgent = /uses:\s*anthropics\/claude-code-action/.test(wfSrc(reusable));
    const granted = Object.values(wfParse(name).jobs)[0].permissions ?? {};

    if (usesAgent) {
      assert.equal(granted["id-token"], "write",
        `${reusable} mints an OIDC token; that permission is never in the default GITHUB_TOKEN ` +
        `and cannot be raised by the reusable, so ${name} must grant it`);
    } else {
      assert.equal(granted["id-token"], undefined,
        `${name} must not grant id-token: write — ${reusable} runs no agent and does not need it`);
    }
  }
});

// ── criterion: flow-queue-runner is dispatch-only, and the absence of a schedule is asserted ──

test("flow-queue-runner declares workflow_dispatch and NO schedule — the absence is the assertion", () => {
  const src = wfSrc("flow-queue-runner.yml");
  assert.match(src, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(src, /^\s*schedule:/m,
    "canonical's store is being restructured by hand; an unattended dispatcher claiming tasks " +
    "against a moving queue is the wasted-worker-run failure flow-0010 was written about");
  assert.match(src, /THERE IS DELIBERATELY NO `schedule:` BLOCK/,
    "the omission must read as a decision, or the next person restores it from the template");
});

test("flow-queue-runner's trigger set is exactly workflow_dispatch", { skip }, () => {
  const triggers = wfParse("flow-queue-runner.yml").on;
  assert.deepEqual(Object.keys(triggers), ["workflow_dispatch"]);
  assert.equal(triggers.schedule, undefined);
  // The other schedule-bearing caller is left alone, so this is a decision about the runner
  // rather than a blanket removal of cron from canonical.
  assert.ok(wfParse("flow-recover.yml").on.schedule, "flow-recover keeps the template's sweep cadence");
});

// ── criterion: build still parses every workflow, five new files included ──

test("checkWorkflows parses every workflow in canonical, including the five new callers", { skip }, async () => {
  const { checkWorkflows } = await import("./check-workflows.mjs");
  const { checked, failures } = checkWorkflows(WORKFLOWS);
  assert.deepEqual(failures, [], "npm run build is what stops a malformed reusable reaching the fleet");
  for (const name of ADDED) {
    assert.ok(checked.includes(join(WORKFLOWS, name)), `${name} must be among the parsed files`);
  }
});
