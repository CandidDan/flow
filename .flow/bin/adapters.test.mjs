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
import { chmodSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { canonicalRepoRoot, canonicalTasksDir } from "./flow-state.mjs";
import { canonicalFlowDir as doctorFlowDir } from "./flow-doctor.mjs";
import { canonicalFlowDir as editsFlowDir, applyEdits } from "./apply-board-edits.mjs";
import { canonicalFlowDir as guardFlowDir, findTaskFile } from "./touches-guard.mjs";
import { canonicalFlowDir as pickFlowDir, pickTask, readTasks } from "./pick-task.mjs";
import { canonicalFlowDir as recoverFlowDir, readTasks as recoverReadTasks } from "./flow-recover.mjs";
import { canonicalFlowDir as openPrFlowDir } from "./flow-open-pr.mjs";
import { canonicalFlowDir as unblockFlowDir } from "./flow-unblock.mjs";
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
                             ["touches-guard", guardFlowDir()],
                             ["pick-task", pickFlowDir()],
                             ["flow-recover", recoverFlowDir()],
                             ["flow-open-pr", openPrFlowDir()],
                             ["flow-unblock", unblockFlowDir()]]) {
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
    "every declared source_root must exist");
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

test("no flightdeck/ tree and no flow-watchdog.yml remain tracked", () => {
  const tracked = spawnSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).stdout.split("\n");
  assert.deepEqual(tracked.filter((f) => f.startsWith("flightdeck/")), []);
  assert.ok(!tracked.includes(".github/workflows/flow-watchdog.yml"));
});

test("config.yml and package.json name no flightdeck, and every source root exists", () => {
  for (const f of [".flow/config.yml", "package.json"]) {
    assert.doesNotMatch(readFileSync(join(REPO, f), "utf8"), /flightdeck/, f);
  }
  const roots = [...readFileSync(join(REPO, ".flow/config.yml"), "utf8").matchAll(/^\s+- path: "([^"]+)"/gm)].map((m) => m[1]);
  assert.ok(roots.length > 0);
  for (const r of roots) assert.ok(existsSync(join(REPO, r)), `${r} must exist`);
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
// no-install job still proves the pins and the callers' existence.

const WORKFLOWS = join(REPO, ".github", "workflows");
const wfNames = readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n)).sort();
const wfSrc = (name) => readFileSync(join(WORKFLOWS, name), "utf8");

// The reusables, by their short name: `_flow-open-pr.yml` -> `open-pr`.
const REUSABLES = wfNames.filter((n) => n.startsWith("_flow-")).map((n) => n.slice(6, -4));
// The callers this task added, distinct from the three canonical already had — less the
// queue-runner's, retired in flow-0174.
const ADDED = ["flow-open-pr.yml", "flow-recover.yml", "flow-triage.yml", "flow-review.yml"];

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

// ── criterion: each new caller references the reusable @main, grants matching permissions, passes
//              exactly the secret(s) its reusable declares ──

// Which secret(s) each ADDED caller's reusable declares in on.workflow_call.secrets — FLOW_PAT
// for the two that only need a real git actor, CLAUDE_CODE_OAUTH_TOKEN for the two that only run
// claude-code-action. Named, not `secrets: inherit`: inheriting would additionally hand each job
// whichever of the two it doesn't need (see secrets-scope.test.mjs for the fleet-wide version).
const ADDED_SECRET = {
  "flow-open-pr.yml": "FLOW_PAT",
  "flow-recover.yml": "FLOW_PAT",
  "flow-triage.yml": "CLAUDE_CODE_OAUTH_TOKEN",
  "flow-review.yml": "CLAUDE_CODE_OAUTH_TOKEN",
};

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

test("every new caller passes exactly the secret(s) its reusable declares, by name", { skip }, () => {
  for (const name of ADDED) {
    const wanted = ADDED_SECRET[name];
    assert.ok(wanted, `no expected secret recorded for ${name} — update ADDED_SECRET`);
    const wantedKeys = (Array.isArray(wanted) ? wanted : [wanted]).slice().sort();
    const job = Object.values(wfParse(name).jobs ?? {})[0];
    assert.deepEqual(Object.keys(job.secrets ?? {}).sort(), wantedKeys,
      `${name} must pass exactly {${wantedKeys.join(", ")}} — not \`secrets: inherit\`, which ` +
      `would also hand this job whichever credential it doesn't need`);
    for (const key of wantedKeys) {
      assert.equal(job.secrets[key], `\${{ secrets.${key} }}`,
        `${name}'s ${key} must be forwarded verbatim from the caller's own secret of that name`);
    }
  }
});

test("every new caller grants at least the permissions its reusable declares", { skip }, () => {
  for (const name of ADDED) {
    const reusable = `_${name.replace(/\.yml$/, "")}.yml`;
    // The union of the reusable's top-level permissions and every job's own: a job-scoped grant
    // the caller lacks is just as fatal (GitHub refuses to start the run) as a top-level one.
    const parsed = wfParse(reusable);
    const required = { ...(parsed.permissions ?? {}) };
    for (const job of Object.values(parsed.jobs ?? {})) {
      for (const [scope, level] of Object.entries(job.permissions ?? {})) {
        if (required[scope] !== "write") required[scope] = level;
      }
    }
    const jobs = Object.values(wfParse(name).jobs ?? {});
    assert.equal(jobs.length, 1, `${name} is a thin caller: exactly one job`);
    const granted = jobs[0].permissions ?? {};

    for (const [scope, level] of Object.entries(required)) {
      const ok = granted[scope] === level || (level === "read" && granted[scope] === "write");
      assert.ok(ok,
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

// ── criterion: build still parses every workflow, five new files included ──

test("checkWorkflows parses every workflow in canonical, including the new callers", { skip }, async () => {
  const { checkWorkflows } = await import("./check-workflows.mjs");
  const { checked, failures } = checkWorkflows(WORKFLOWS);
  assert.deepEqual(failures, [], "npm run build is what stops a malformed reusable reaching the fleet");
  for (const name of ADDED) {
    assert.ok(checked.includes(join(WORKFLOWS, name)), `${name} must be among the parsed files`);
  }
});

// ── the adapters the autonomous workflows invoke (and that canonical did not have) ─────────
//
// `_flow-recover.yml` runs `.flow/bin/flow-recover.mjs` + `.flow/bin/flow-open-pr.mjs` in the
// CONSUMING repo — canonical included. Both were absent, and the failure was invisible: the
// recover sweep opens with `if [ ! -f .flow/bin/flow-recover.mjs ]` and exits 0, so 160+
// scheduled runs reported success having never read canonical's store. (pick-task.mjs was the
// third, for the since-retired queue-runner; the worker routine runs it now.)
//
// The general rule this encodes: every helper a flow-* workflow invokes by path must exist here.

const WORKFLOW_INVOKED_ADAPTERS = [
  "flow-doctor.mjs", "apply-board-edits.mjs", "touches-guard.mjs", "parse-task-id.mjs",
  "flow-review.mjs", "pick-task.mjs", "flow-recover.mjs", "flow-open-pr.mjs",
  "source-roots.mjs", "flow-unblock.mjs",
];

test("every .flow/bin/<helper>.mjs a workflow canonical CALLS invokes by path exists here", () => {
  // Derived from the workflows themselves rather than from a hand-kept list, so a helper added to
  // a reusable tomorrow is covered without anyone remembering to update this.
  //
  // Scope is the reachable set, not every file in the directory: canonical AUTHORS reusables it
  // does not itself call. `_flow-sync.yml` is the standing example — it invokes flow-sync.mjs,
  // canonical has no flow-sync.mjs adapter, and that is correct rather than a gap, because
  // canonical is the sync SOURCE and deliberately ships no flow-sync caller. So start from the
  // thin callers (the non-underscore files), follow their `uses:` into canonical's own reusables,
  // and check only what that set actually runs.
  const callers = readdirSync(WORKFLOWS)
    .filter((n) => /\.ya?ml$/.test(n) && !n.startsWith("_"));
  assert.ok(callers.length > 0, "an empty scan is a failure, not a pass — no callers found");

  const reachable = new Set(callers);
  for (const name of callers) {
    const src = readFileSync(join(WORKFLOWS, name), "utf8");
    for (const m of src.matchAll(/CandidDan\/flow\/\.github\/workflows\/(_flow-[A-Za-z0-9-]+\.ya?ml)@/g)) {
      reachable.add(m[1]);
    }
  }

  const invoked = new Map();
  for (const name of reachable) {
    const file = join(WORKFLOWS, name);
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, "utf8").matchAll(/\.flow\/bin\/([A-Za-z0-9._-]+\.mjs)/g)) {
      if (!invoked.has(m[1])) invoked.set(m[1], name);
    }
  }
  assert.ok(invoked.size > 0, "an empty scan is a failure, not a pass — no helper refs extracted");

  const missing = [...invoked].filter(([h]) => !existsSync(join(BIN, h)))
    .map(([h, w]) => `${h} (invoked by ${w})`).sort();
  assert.deepEqual(missing, [],
    `these helpers are invoked by a workflow canonical calls, but are absent from .flow/bin/: ` +
    `${missing.join(", ")}. A bootstrap-guarded caller will report success having done nothing; ` +
    "an unguarded one dies at the first step.");

  // The exception is real and stays checked, so it cannot quietly become a gap: flow-sync is
  // referenced by a reusable canonical publishes but does NOT call.
  assert.ok(!existsSync(join(BIN, "flow-sync.mjs")),
    "canonical is the sync source and must not adopt flow-sync; if this changes, add a caller too");
  assert.match(readFileSync(join(WORKFLOWS, "_flow-sync.yml"), "utf8"), /\.flow\/bin\/flow-sync\.mjs/,
    "the exception is only meaningful while _flow-sync.yml actually invokes the helper");
});

test("the three autonomous-loop adapters are present and their CLI blocks run", () => {
  for (const f of ["pick-task.mjs", "flow-recover.mjs", "flow-open-pr.mjs"]) {
    assert.ok(existsSync(join(BIN, f)), `${f} must exist — a workflow invokes it by this path`);
    assert.ok(WORKFLOW_INVOKED_ADAPTERS.includes(f));
  }

  // pick-task against canonical's real store. A copy or a symlink would read
  // project-template/.flow/tasks (the fixture store) and pick a fixture id. flow-0155: this used to
  // require a canonical id, which tied the gate to the live queue — whenever every ready task
  // overlapped an in-flight one, pick-task correctly printed nothing and every PR went red. Now the
  // CLI must agree with the module run on canonical's store (empty when nothing is eligible), and
  // must not print the fixture store's pick, which is asserted non-empty so that check is real.
  const picked = run("pick-task.mjs").stdout.trim();
  const expected = pickTask(readTasks(join(pickFlowDir(), "tasks"))) ?? "";
  assert.equal(picked, expected,
    "pick-task's CLI must print exactly what pickTask chooses from canonical's own store");
  const fixturePick = pickTask(readTasks(join(TEMPLATE_FLOW, "tasks")));
  assert.ok(fixturePick, "the fixture store must have an eligible task, or the next check is vacuous");
  assert.notEqual(picked, fixturePick,
    "pick-task printed the fixture store's pick — the adapter is reading project-template/.flow");
  if (picked) {
    assert.match(picked, /^flow-\d{4}$/);
    assert.ok(findTaskFile(join(pickFlowDir(), "tasks"), picked),
      `pick-task chose ${picked}, which is not in canonical's store`);
  }

  // flow-recover's new subcommands, through the CLI rather than the module.
  const cands = run("flow-recover.mjs", ["branch-candidates", "flow-0040", "claude/foo-x"]);
  assert.deepEqual(cands.stdout.trim().split("\n"), ["claude/foo-x", "flow/flow-0040-*"],
    "the declared branch must be tried before the flow/<id>-… convention");

  const counted = spawnSync(process.execPath, [join(BIN, "flow-recover.mjs"), "count-task-prs", "flow-0040"],
    { cwd: REPO, encoding: "utf8", input: '[{"title":"[flow-0040] x"},{"title":"re flow-0040"}]' });
  assert.equal(counted.stdout.trim(), "1", "only a LEADING [id] counts as this task's PR");

  // flow-open-pr's --id override, resolved against canonical's store for the title.
  const decided = run("flow-open-pr.mjs",
    ["--branch", "claude/foo-x", "--base", "main", "--ahead", "2", "--has-open-pr", "0",
     "--id", "flow-0040"]);
  const payload = JSON.parse(decided.stdout.trim());
  assert.equal(payload.id, "flow-0040");
  assert.match(payload.title, /^\[flow-0040\] .+/,
    "the title must come from canonical's task file, not the template's fixture");
});

test("list-in-progress emits three tab-separated fields, branch last", () => {
  // The sweep reads `read -r id started declared_branch`, so the branch must be the third column
  // and must stay present-but-empty when the task has none — otherwise the columns shift.
  const dir = tmp("recover-list");
  try {
    const tasks = join(dir, "tasks");
    cpSync(join(FLOW, "tasks"), tasks, { recursive: true });
    writeFileSync(join(tasks, "9001-x.md"),
      '---\nid: "flow-9001"\nstatus: "in_progress"\nstarted: "2026-09-14T09:00:00Z"\n' +
      'branch: "claude/next-task-abc"\n---\nbody\n');
    writeFileSync(join(tasks, "9002-y.md"),
      '---\nid: "flow-9002"\nstatus: "in_progress"\nstarted: "2026-09-14T09:00:00Z"\n---\nbody\n');

    const rows = recoverReadTasks(tasks).filter((t) => t.status === "in_progress")
      .map((t) => `${t.id}\t${t.started}\t${t.branch}`);
    assert.ok(rows.includes("flow-9001\t2026-09-14T09:00:00Z\tclaude/next-task-abc"));
    assert.ok(rows.includes("flow-9002\t2026-09-14T09:00:00Z\t"),
      "a task with no branch keeps the empty third column");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── the sweep must actually USE the prStateKnown rule, not merely have it available ────────
//
// classifyStranded refusing to act on an unknown PR state is worthless if the shell never tells
// it the state was unknown. That gap — a correct, tested rule wired to nothing — is the same
// shape as the bootstrap-guarded workflow that reported success without reading the store, so it
// gets the same treatment: assert the wiring, not just the rule.

// Line-based on purpose, NOT YAML-parsed — the same reasoning action-pins.test.mjs states for
// itself. This file's other workflow tests carry `{ skip }` because they need `yaml`, which the
// `flow-tooling` gate job does not install (it runs `node --test .flow/bin/*.test.mjs` with no
// `npm ci`). A guard that skips in one of the two jobs that run it is weaker for no reason when
// every assertion here is about the shell TEXT: scanning the raw file means this runs in both.
test("_flow-recover.yml distinguishes a failed gh query from an empty one, and passes it on", () => {
  const sh = readFileSync(join(WORKFLOWS, "_flow-recover.yml"), "utf8");

  assert.match(sh, /--pr-state-known "\$pr_state_known"/,
    "classify must be told whether the PR state was actually knowable");
  assert.match(sh, /if prs_json="\$\(gh pr list/,
    "the gh call's exit status must be branched on, not discarded");
  // Whitespace- and quote-tolerant, because the narrow form was not enough. The code review
  // called hardening this low-value on the grounds that the structural wiring assertions above
  // already cover the invariant — they do not. `||echo '[]'` (one space less) placed INSIDE the
  // `if prs_json="$(gh pr list …)"` structure satisfies every other assertion here and restores
  // the original bug exactly. Verified by doing it.
  assert.doesNotMatch(sh, /gh pr list[^\n]*\|\|\s*echo\s*["']?\[\]["']?/,
    "`|| echo '[]'` collapses 'the query failed' into 'there are no PRs' — the bug that let a " +
    "GitHub 5xx clear a live claim");
  // Both gh queries must mark the state unknown on failure, and that is asserted INDEPENDENTLY
  // for each. A single /pr_state_known=0/ match is satisfied by the title path alone, so deleting
  // the --head path's marker left this guard green — verified by doing exactly that. A guard that
  // passes while half the thing it guards is missing is the failure shape this whole change is
  // about, so it is not one this test gets to have.
  // Asserted per-query and positionally rather than by counting: "gh pr list" also appears inside
  // the ::warning:: strings, so any count-based check measures the wrong thing.
  assert.match(sh, /if prs_json="\$\(gh pr list[\s\S]{0,600}?pr_state_known=0/,
    "the title query's failure branch must mark the PR state unknown");
  assert.match(sh, /if head_count="\$\(gh pr list --head[\s\S]{0,600}?pr_state_known=0/,
    "the --head query's own failure branch must mark the state unknown, not lean on the title " +
    "query's — deleting this one leaves a single /pr_state_known=0/ check green");
});

// The structural half, which does need a parse: the assertions above are only meaningful if that
// text actually lives in the sweep step's `run:` block rather than in a comment elsewhere.
test("the pr-state-known wiring is in the sweep step's run block", { skip }, () => {
  const step = wfParse("_flow-recover.yml").jobs.sweep.steps
    .find((s) => s.name && s.name.includes("Sweep"));
  assert.ok(step, "the sweep step must exist");
  assert.match(step.run, /--pr-state-known "\$pr_state_known"/);
});

test("the classify CLI honours --pr-state-known end to end", () => {
  const args = ["classify", "--status", "in_progress", "--branch-exists", "0", "--ahead", "0",
                "--has-open-pr", "0", "--age", "9999", "--threshold", "75"];
  assert.equal(run("flow-recover.mjs", args).stdout.trim(), "reset-to-ready",
    "omitted flag defaults to known, preserving existing behaviour");
  assert.equal(run("flow-recover.mjs", [...args, "--pr-state-known", "1"]).stdout.trim(),
    "reset-to-ready");
  assert.equal(run("flow-recover.mjs", [...args, "--pr-state-known", "0"]).stdout.trim(), "ok",
    "an unknown PR state must never reach the destructive branch");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// flow-recover: the adapter runs the TEMPLATE's CLI, not a copy of it (flow-0121)
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// Until flow-0121 this adapter re-implemented the template's CLI shell — the same seven
// `cmd === …` branches, hand-kept in two places. It drifted exactly as a second implementation
// always does: flow-0104 added `classify --open-pr-ready`, `ready-pr` and `promote` to the
// template, the copy grew none of them, and `promote-in-review` was therefore unreachable in
// canonical's own sweep for every scheduled run in between.
//
// What made that cost a release rather than a minute is that NOTHING went red. An unknown flag
// is ignored and arrives at the classifier as 0; a missing subcommand prints the usage line to
// stderr and exits 0; the sweep reads an empty stdout as "no ready PR". Every one of those is
// byte-identical to the healthy "nothing to promote" answer. So the tests below do not check
// that the subcommands exist — they check that the adapter and the template give the SAME
// answer to the same question, which is the only property that cannot be satisfied by silence.

import { mkdirSync } from "node:fs";
// Both shapes of the adapter's surface: the named import the sweep's own callers use, and the
// namespace, which is how the re-export list below is compared against the template's.
import * as adapterExports from "./flow-recover.mjs";
import { runRecoverCli } from "./flow-recover.mjs";

// A two-store fixture: canonical's adapter and the template's CLI, side by side in a tmp repo,
// each pointed at its own store. Deliberately NOT the real stores — `list-in-progress` is the
// one subcommand whose answer depends on the store, and asserting on canonical's live store
// would make this test pass or fail according to whether a worker happens to hold a claim.
// Seeded instead, so the difference between the two stores is a fact of the fixture: the
// adapter's store has exactly one in_progress task and the template's has none.
//
// The layout is the minimum that makes the adapter's relative import resolve — it reaches the
// template's module as `../../project-template/.flow/bin/flow-recover.mjs`, and the template
// resolves its own store from its own realpath, so both trees have to be real directories.
const SEED_ROW = "flow-9121\t2026-10-02T09:00:00Z\tclaude/seeded-x";
function recoverPairFixture() {
  const root = tmp("recover-pair");
  cpSync(join(TEMPLATE_FLOW, "bin"), join(root, "project-template", ".flow", "bin"), { recursive: true });
  cpSync(join(TEMPLATE_FLOW, "tasks"), join(root, "project-template", ".flow", "tasks"), { recursive: true });
  mkdirSync(join(root, ".flow", "bin"), { recursive: true });
  mkdirSync(join(root, ".flow", "tasks"), { recursive: true });
  cpSync(join(BIN, "flow-recover.mjs"), join(root, ".flow", "bin", "flow-recover.mjs"));
  writeFileSync(join(root, ".flow", "tasks", "9121-seed.md"),
    '---\nid: "flow-9121"\nstatus: "in_progress"\nstarted: "2026-10-02T09:00:00Z"\n' +
    'branch: "claude/seeded-x"\n---\nseeded\n');
  writeFileSync(join(root, ".flow", "tasks", "9122-seed.md"),
    '---\nid: "flow-9122"\nstatus: "ready"\nstarted: ""\n---\nseeded\n');
  return root;
}

const PRS_JSON = JSON.stringify([
  { number: 9, title: "[flow-9121] seeded", headRefName: "claude/seeded-x", isDraft: false,
    isCrossRepository: false, url: "https://github.com/o/r/pull/9" },
  { number: 10, title: "[flow-9122] draft", headRefName: "claude/seeded-y", isDraft: true,
    isCrossRepository: false, url: "https://github.com/o/r/pull/10" },
]);

// The table. One row per subcommand, and the `storeDependent` flag names the single licensed
// difference between the two CLIs — which store they read. Keys are checked against the
// template's source below, so a subcommand added later fails this test until it has a row:
// that is how "covered without anyone remembering" is enforced rather than hoped for.
const RECOVER_CASES = {
  "classify": {
    argv: ["classify", "--status", "in_progress", "--has-open-pr", "1", "--open-pr-ready", "1",
           "--age", "9999", "--threshold", "75"],
    want: "promote-in-review\n",
  },
  "list-in-progress": { argv: ["list-in-progress"], storeDependent: true },
  "branch-candidates": {
    argv: ["branch-candidates", "flow-9121", "claude/seeded-x"],
    want: "claude/seeded-x\nflow/flow-9121-*\n",
  },
  "count-task-prs": { argv: ["count-task-prs", "flow-9121"], stdin: PRS_JSON, want: "1\n" },
  "ready-pr": {
    argv: ["ready-pr", "flow-9121", "claude/seeded-x"], stdin: PRS_JSON,
    want: "9\thttps://github.com/o/r/pull/9\n",
  },
  "reset": {
    argv: ["reset", "flow-9121"],
    want: '{"updates":[{"id":"flow-9121","status":"ready","owner":"","branch":"","pr":""}]}\n',
  },
  "promote": {
    argv: ["promote", "flow-9121", "https://github.com/o/r/pull/9", "claude/seeded-x"],
    want: '{"updates":[{"id":"flow-9121","status":"in_review","pr":"https://github.com/o/r/pull/9","branch":"claude/seeded-x"}]}\n',
  },
  // flow-0174. A decision that keeps the model answers before any store read, so both CLIs agree
  // byte for byte and neither store is written; the reset path's bump is proved in flow-recover.test.mjs.
  "escalate": {
    argv: ["escalate", "flow-9121", "reopen-pr", "run 1"],
    want: "flow-9121: reopen-pr keeps the model — work was pushed\n",
  },
};

test("every flow-recover subcommand answers identically from the adapter and the template", () => {
  const root = recoverPairFixture();
  try {
    const invoke = (rel, c) => spawnSync(process.execPath, [join(root, rel), ...c.argv],
      { cwd: root, encoding: "utf8", input: c.stdin ?? "" });
    const ADAPTER = join(".flow", "bin", "flow-recover.mjs");
    const TEMPLATE = join("project-template", ".flow", "bin", "flow-recover.mjs");

    // The table must cover exactly the subcommands the template implements. Read off the
    // template's source, so this is the thing that goes red when the eighth one lands.
    const implemented = [...readFileSync(join(TEMPLATE_FLOW, "bin", "flow-recover.mjs"), "utf8")
      .matchAll(/cmd === "([a-z-]+)"/g)].map((m) => m[1]).sort();
    assert.ok(implemented.length > 0, "an empty scan is a failure, not a pass");
    assert.deepEqual(implemented, Object.keys(RECOVER_CASES).sort(),
      "a subcommand with no row here is a subcommand nobody proved the adapter can reach — " +
      "which is precisely how flow-0104's three went inert in canonical for a whole release");
    assert.equal(implemented.length, 8, "seven subcommands per flow-0121, and flow-0174's escalate");

    for (const [name, c] of Object.entries(RECOVER_CASES)) {
      const a = invoke(ADAPTER, c);
      const t = invoke(TEMPLATE, c);
      assert.equal(a.status, 0, `${name}: the adapter must exit 0 — ${a.stderr}`);
      assert.equal(t.status, 0, `${name}: the template must exit 0 — ${t.stderr}`);
      assert.equal(a.stderr, "", `${name}: a usage line on stderr means the adapter has no such ` +
        `subcommand — the exact shape of the flow-0104 drift, and it exits 0 while it happens`);

      if (c.storeDependent) {
        // The licensed difference, asserted in both directions so neither half can be the
        // accident. A copy or a symlink resolves the template's fixture store and prints the
        // template's answer here, which is empty — and empty is also what a healthy sweep
        // prints when nothing is in flight, so only the seeded row can tell them apart.
        assert.equal(a.stdout, SEED_ROW + "\n",
          "the adapter must read the CONSUMING repo's store — its seeded in_progress task");
        assert.equal(t.stdout, "",
          "the template reads its own fixture store, which holds no in_progress task");
        continue;
      }
      assert.equal(a.stdout, t.stdout, `${name}: adapter and template must agree byte for byte`);
      assert.equal(a.stdout, c.want, `${name}: and that shared answer is the one expected`);
    }

    // The fallthrough is drift-prone too: the adapter's copy listed five subcommands in its
    // usage line while the template listed seven, which is a wrong answer to `--help`-shaped
    // misuse that no other assertion here would have caught.
    const bad = { argv: ["no-such-subcommand"] };
    assert.equal(invoke(ADAPTER, bad).stderr, invoke(TEMPLATE, bad).stderr);
    assert.match(invoke(ADAPTER, bad).stderr, /ready-pr\|reset\|promote/,
      "the usage line must name every subcommand, including flow-0104's");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flow-recover.mjs is an ADAPTER — one call into runRecoverCli, with no CLI of its own", () => {
  const file = join(BIN, "flow-recover.mjs");
  assert.ok(!lstatSync(file).isSymbolicLink(),
    "a symlink resolves its realpath into project-template/, so the sweep would read the " +
    "fixture store and still exit 0 — the failure canonical's CLAUDE.md names by name");
  const src = readFileSync(file, "utf8");
  // Comments are stripped first: the file is allowed to SAY `cmd ===` in the note explaining
  // why it must not DO it, and a guard that forbids the explanation of itself gets deleted.
  const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.ok(!/cmd ===/.test(code),
    "a `cmd === …` branch here is the hand-kept copy growing back; the next subcommand added " +
    "to the template would go inert in canonical again");
  assert.ok(!/function parseFlags\s*\(/.test(code),
    "flag parsing belongs to the one CLI, not to a second copy of it");
  assert.match(code, /runRecoverCli\(process\.argv\.slice\(2\), \{ tasksDir: join\(canonicalFlowDir\(\), "tasks"\) \}\)/,
    "the CLI must be one call into the template's runner, given canonical's store");
  assert.match(code, /from "\.\.\/\.\.\/project-template\/\.flow\/bin\/flow-recover\.mjs"/,
    "the logic must come from the template, not be re-implemented here");
});

test("runRecoverCli's stdin and out are injectable, and it returns the exit code", () => {
  // The signature flow-0121 specifies, exercised in-process: the adapter and the template are
  // two callers of ONE function, so the parameters that make them differ have to be real.
  const dir = tmp("recover-cli");
  try {
    const tasksDir = join(dir, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, "9121-seed.md"),
      '---\nid: "flow-9121"\nstatus: "in_progress"\nstarted: "2026-10-02T09:00:00Z"\n' +
      'branch: "claude/seeded-x"\n---\nseeded\n');

    let buf = "";
    const out = { write: (s) => { buf += s; } };
    assert.equal(runRecoverCli(["list-in-progress"], { tasksDir, out }), 0,
      "always 0 — a scheduled sweep degrades to a no-op rather than failing the run");
    assert.equal(buf, SEED_ROW + "\n", "the store it reads is the one it was given");

    buf = "";
    runRecoverCli(["ready-pr", "flow-9121"], { tasksDir, out, stdin: () => PRS_JSON });
    assert.equal(buf, "9\thttps://github.com/o/r/pull/9\n", "stdin is read through the injection");

    buf = "";
    runRecoverCli(["ready-pr", "flow-9121"], { tasksDir, out, stdin: () => "not json" });
    assert.equal(buf, "", "and unparseable input still never promotes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the adapter re-exports the template's pure helpers, flow-0104's included", () => {
  // The re-export list is the other hand-kept list in this file, and it had drifted the same
  // way: readyOpenPr and buildPromoteEdit existed in the template and were unreachable through
  // the adapter. Asserted against the template's own export surface so it cannot drift again.
  const names = (src) => new Set([...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]));
  const fromTemplate = names(readFileSync(join(TEMPLATE_FLOW, "bin", "flow-recover.mjs"), "utf8"));
  assert.ok(fromTemplate.size >= 8, "an empty scan is a failure, not a pass");
  const reExported = new Set(Object.keys(adapterExports));
  const missing = [...fromTemplate].filter((n) => !reExported.has(n)).sort();
  assert.deepEqual(missing, [],
    `the adapter must re-export everything the template exports: ${missing.join(", ")}`);
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// source-roots (flow-0077) — the sixth adapter, and the one whose correct answer is silence
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// `_flow-gates.yml` invokes `.flow/bin/source-roots.mjs plan` in the consuming repo, canonical
// included. Canonical's plan is EMPTY by design: all four of its source_roots declare
// `npm run lint` or `npm run build`, which the `gate` job already runs, so every entry is
// excluded as already covered.
//
// That makes this adapter the sharpest case of the hazard the whole file is about. `count=0` is
// the correct output here — and it is also exactly what a broken adapter produces. A copy or a
// symlink resolves `project-template/` as the root, reads the template's REPLACE-ME config,
// excludes its one uncalibrated entry and prints `count=0`, exit 0. Identical output, wrong repo.
// So nothing below asserts on the count alone: every test asserts on WHICH entries were
// excluded and WHY, which is the only thing that differs between the two.

import { lstatSync } from "node:fs";
import {
  canonicalConfigPath as srConfigPath, canonicalRepoRoot as srRepoRoot, planSourceRoots as srPlan,
} from "./source-roots.mjs";

test("the source-roots adapter resolves CANONICAL's root and config, not the template's", () => {
  assert.equal(srRepoRoot(), REPO, "the adapter must plan canonical's tree");
  assert.equal(srConfigPath(), join(FLOW, "config.yml"));
  assert.notEqual(srConfigPath(), join(TEMPLATE_FLOW, "config.yml"),
    "the template's config is the uncalibrated REPLACE-ME one; planning it would exit 0 having " +
    "read the wrong repo");
});

test("source-roots.mjs is an ADAPTER — not a symlink, and not a copy of the template's logic", () => {
  const file = join(BIN, "source-roots.mjs");
  assert.ok(!lstatSync(file).isSymbolicLink(),
    "a symlink resolves its realpath into project-template/, so `plan` would read the fixture " +
    "config and still exit 0 — the exact failure this repo's CLAUDE.md names");
  const src = readFileSync(file, "utf8");
  assert.match(src, /from "\.\.\/\.\.\/project-template\/\.flow\/bin\/source-roots\.mjs"/,
    "the adapter must import the template's logic — one implementation, not two");
  assert.ok(!/function parseSourceRoots\s*\(/.test(src),
    "a re-implemented parser here is the drift this task exists to remove");
  assert.ok(!/function planSourceRoots\s*\(/.test(src) && !/function runCheck\s*\(/.test(src),
    "only the CLI shell and the store location belong in an adapter");
});

test("source-roots plan against canonical: count 0 because all three entries are ALREADY GATED", () => {
  const { matrix, count, excluded, errors } = srPlan({ configPath: srConfigPath(), repoRoot: srRepoRoot() });
  assert.deepEqual(errors, [], "canonical's own config must satisfy the schema it publishes");
  assert.deepEqual(matrix, []);
  assert.equal(count, 0);
  // The assertion that tells the two zeroes apart.
  assert.deepEqual(excluded.map((x) => x.path).sort(),
    [".flow/bin/", ".github/workflows/", "project-template/.flow/bin/"],
    "these are canonical's three declared trees; seeing REPLACE-ME here means the template's " +
    "config was read instead");
  for (const x of excluded) {
    assert.equal(x.reason, "covered by the primary gate",
      `${x.path} was excluded as "${x.reason}" — canonical's entries are all primary commands, ` +
      "so anything else means the commands block was not read");
  }
});

test("the source-roots CLI block actually runs — silence here is the symlink failure mode", () => {
  const r = run("source-roots.mjs", ["plan"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^count=0$/m, "the CLI must emit the count, not merely exit 0");
  assert.match(r.stdout, /^matrix=\{"include":\[\]\}$/m);
  assert.match(r.stderr, /skipping "\.github\/workflows\/" — covered by the primary gate/,
    "the exclusions must name canonical's own trees; a copy or symlink would name REPLACE-ME");
  assert.doesNotMatch(r.stderr, /REPLACE-ME/, "reading the template's fixture config is the bug");
});

test("the source-roots CLI's `run` subcommand runs a check and honours its retry", () => {
  const ok = run("source-roots.mjs", ["run"], { FLOW_SOURCE_ROOT_CHECK: "exit 0" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /attempt 1\/1 succeeded/);

  const bad = run("source-roots.mjs", ["run"],
    { FLOW_SOURCE_ROOT_CHECK: "exit 3", FLOW_SOURCE_ROOT_RETRY: "1" });
  assert.equal(bad.status, 3, "the process must exit with the check's own status, not a flattened 1");
  assert.match(bad.stdout, /attempt 2\/2 failed \(exit 3\)/,
    "both attempts must be visible — a retry that hides the flake is the flake with the evidence removed");
});

test("_flow-gates.yml runs source-roots from CANONICAL, not from the caller's .flow/bin", () => {
  // flow-0094 moved this one. The adapter still exists and is still the local entry point — `npm
  // run lint`, a human debugging canonical, and flow-doctor all reach the helper through it — but
  // the GATE runs canonical's own copy, fetched at the workflow's own commit. Pinning both halves
  // here is what stops a well-meaning revert to `.flow/bin/` from passing as a tidy-up.
  const src = readFileSync(join(WORKFLOWS, "_flow-gates.yml"), "utf8");
  assert.ok(src.includes('node "$FLOW_BIN"/source-roots.mjs plan'));
  assert.ok(src.includes('node "$FLOW_BIN"/source-roots.mjs run'));
  assert.ok(!src.includes("node .flow/bin/source-roots.mjs"),
    "running the caller's copy is the 2.1.0 fleet break: the workflow moves with the alias, the " +
    "copy moves with a sync PR, and every pinned repo is red in between");
  assert.ok(existsSync(join(BIN, "source-roots.mjs")),
    "the adapter still has to exist — it is the local and flow-doctor entry point");
  assert.ok(WORKFLOW_INVOKED_ADAPTERS.includes("source-roots.mjs"),
    "the hand-kept list must name it too, so its absence would be caught twice");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// flow-unblock (flow-0041): the adapter, the two callers, and the reusable's release step run for real
// ─────────────────────────────────────────────────────────────────────────────────────────

import * as unblockAdapter from "./flow-unblock.mjs";
import * as unblockTemplate from "../../project-template/.flow/bin/flow-unblock.mjs";

test("flow-unblock.mjs is an ADAPTER — one call into runUnblockCli, re-exporting the template", () => {
  const file = join(BIN, "flow-unblock.mjs");
  assert.ok(!lstatSync(file).isSymbolicLink(),
    "a symlink resolves into project-template/ and would sweep the fixture store, exiting 0");
  const code = readFileSync(file, "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.ok(!/cmd ===/.test(code), "a `cmd === …` branch here is a second CLI growing back");
  assert.match(code, /runUnblockCli\(process\.argv\.slice\(2\), \{ tasksDir: join\(canonicalFlowDir\(\), "tasks"\) \}\)/);
  assert.match(code, /from "\.\.\/\.\.\/project-template\/\.flow\/bin\/flow-unblock\.mjs"/);
  // Every export of the template is re-exported — and is the SAME function, not a copy.
  for (const name of Object.keys(unblockTemplate)) {
    assert.equal(unblockAdapter[name], unblockTemplate[name], `${name} must be re-exported from the template`);
  }
});

// A consuming-repo layout in a tmp dir: the template's bin, canonical's adapters, a seeded store,
// and a bare `origin` so the release step's push lands somewhere the test can read back.
const UNBLOCK_PR = "https://github.com/o/r/pull/7";
function unblockRepo({ readyToo = false } = {}) {
  const root = tmp("unblock");
  const work = join(root, "work");
  cpSync(join(TEMPLATE_FLOW, "bin"), join(work, "project-template", ".flow", "bin"), { recursive: true });
  mkdirSync(join(work, ".flow", "bin"), { recursive: true });
  mkdirSync(join(work, ".flow", "tasks"), { recursive: true });
  for (const f of ["flow-unblock.mjs", "apply-board-edits.mjs"]) cpSync(join(BIN, f), join(work, ".flow", "bin", f));
  const t = (name, body) => writeFileSync(join(work, ".flow", "tasks", name), body);
  t("9001-dep.md", '---\nid: "flow-9001"\nstatus: "done"\n---\n');
  t("9002-rel.md", '---\nid: "flow-9002"\nstatus: "blocked"\nowner: "w"\nblocked_reason: "waits on 9001 and #7"\n' +
    `blocked_by:\n  - "flow-9001"\n  - "${UNBLOCK_PR}"\ntouches: ["a/**"]\n---\nbody\n`);
  t("9003-human.md", '---\nid: "flow-9003"\nstatus: "blocked"\nblocked_reason: "a phone call"\nblocked_by: []\n---\n');
  if (readyToo) t("9004-ready.md", '---\nid: "flow-9004"\nstatus: "ready"\n---\n');
  const git = (...a) => execFileSync("git", a, { cwd: work, encoding: "utf8" });
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", join(root, "origin.git")]);
  git("init", "-q", "-b", "main");
  git("config", "user.name", "t"); git("config", "user.email", "t@t");
  git("add", "-A"); git("commit", "-qm", "seed");
  git("remote", "add", "origin", join(root, "origin.git"));
  git("push", "-q", "origin", "main");
  // A fake `gh` that logs every call: the PR reads merged. The run-list and dispatch cases answer
  // as they did before flow-0173, so a dispatch creeping back would be logged, and caught.
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "gh"), [
    "#!/bin/sh",
    'echo "$*" >> "$GH_LOG"',
    'case "$1 $2" in',
    '  "api repos/o/r/pulls/7") printf "closed\\ttrue\\n" ;;',
    '  "run list") printf "%s" "${GH_RUNS:-[]}" ;;',
    '  "api -X") if [ -n "$GH_DISPATCH_403" ]; then echo "gh: Resource not accessible by integration (HTTP 403)" >&2; exit 1; fi ;;',
    "  *) exit 1 ;;",
    "esac", ""].join("\n"));
  chmodSync(join(root, "bin", "gh"), 0o755);
  return { root, work, git };
}

function runStep(repo, stepName, env = {}) {
  const step = wfParse("_flow-unblock.yml").jobs.sweep.steps.find((s) => s.name === stepName);
  assert.ok(step, `no step named ${stepName}`);
  return spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", step.run], {
    cwd: repo.work, encoding: "utf8",
    env: { ...process.env, PATH: `${join(repo.root, "bin")}:${process.env.PATH}`,
           RUNNER_TEMP: repo.root, GH_LOG: join(repo.root, "gh.log"), GITHUB_REPOSITORY: "o/r", ...env },
  });
}
const RELEASE_STEP = "Release blocked tasks whose every blocked_by entry has resolved";
const DISPATCH_STEP = "Start the next worker";
const ghLog = (repo) => (existsSync(join(repo.root, "gh.log")) ? readFileSync(join(repo.root, "gh.log"), "utf8") : "");

test("the release step commits the released task to main: ready, cleared, nothing else changed", { skip }, () => {
  const repo = unblockRepo();
  try {
    const before = readFileSync(join(repo.work, ".flow", "tasks", "9002-rel.md"), "utf8");
    const r = runStep(repo, RELEASE_STEP);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /flow-9002: every blocked_by entry resolved -> ready/);
    assert.match(r.stdout, /flow-9003 stays blocked: no blocked_by entry/);
    const onMain = execFileSync("git", ["--git-dir", join(repo.root, "origin.git"), "show",
      "main:.flow/tasks/9002-rel.md"], { encoding: "utf8" });
    assert.equal(onMain, before.replace('status: "blocked"', 'status: "ready"')
      .replace('blocked_reason: "waits on 9001 and #7"', 'blocked_reason: ""')
      .replace(`blocked_by:\n  - "flow-9001"\n  - "${UNBLOCK_PR}"`, "blocked_by: []"));
    const human = execFileSync("git", ["--git-dir", join(repo.root, "origin.git"), "show",
      "main:.flow/tasks/9003-human.md"], { encoding: "utf8" });
    assert.match(human, /status: "blocked"/, "a block with no blocked_by is never released");
    assert.match(execFileSync("git", ["--git-dir", join(repo.root, "origin.git"), "log", "-1", "--format=%s", "main"],
      { encoding: "utf8" }), /^flow: unblock flow-9002 -> ready/);
    // A second run has nothing left to release and pushes nothing.
    const again = runStep(repo, RELEASE_STEP);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /Nothing to release\./);
  } finally { rmSync(repo.root, { recursive: true, force: true }); }
});

test("the release step keeps a task blocked when its PR cannot be read", { skip }, () => {
  const repo = unblockRepo();
  try {
    // A `gh` that fails every call: the PR resolves unknown.
    writeFileSync(join(repo.root, "bin", "gh"), "#!/bin/sh\nexit 1\n");
    const r = runStep(repo, RELEASE_STEP);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /::warning::Could not read https:\/\/github\.com\/o\/r\/pull\/7/);
    assert.match(r.stdout, /Nothing to release\./);
  } finally { rmSync(repo.root, { recursive: true, force: true }); }
});

// flow-0173: the sweep releases and stops — the next worker run picks what it released. The
// dispatch step is gone, and a run with ready work still makes no dispatch call.
test("flow-0173: the reusable has no dispatch step, and the release step dispatches nothing even with ready work", { skip }, () => {
  const steps = wfParse("_flow-unblock.yml").jobs.sweep.steps;
  assert.equal(steps.find((s) => s.name === DISPATCH_STEP), undefined, `"${DISPATCH_STEP}" must be absent`);
  const repo = unblockRepo({ readyToo: true });
  try {
    const r = runStep(repo, RELEASE_STEP);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /flow-9002: every blocked_by entry resolved -> ready/);
    assert.doesNotMatch(ghLog(repo), /api -X POST|run list/, "unblock must not list or dispatch a worker");
  } finally { rmSync(repo.root, { recursive: true, force: true }); }
});

test("both flow-unblock callers: three triggers, exactly contents+actions write + pull-requests read, no secrets", { skip }, () => {
  for (const [file, ref] of [[join(WORKFLOWS, "flow-unblock.yml"), "main"],
                             [join(REPO, "project-template", ".github", "workflows", "flow-unblock.yml"), "v3"]]) {
    const wf = yamlMod.parse(readFileSync(file, "utf8"));
    assert.deepEqual(wf.on.workflow_run, { workflows: ["flow-done"], types: ["completed"] }, file);
    assert.ok(Array.isArray(wf.on.schedule) && wf.on.schedule.length === 1 && wf.on.schedule[0].cron, file);
    assert.ok("workflow_dispatch" in wf.on, `${file} must be dispatchable`);
    const jobs = Object.values(wf.jobs);
    assert.equal(jobs.length, 1, `${file} is a thin caller`);
    assert.deepEqual(jobs[0].permissions, { contents: "write", "pull-requests": "read" }, file);
    assert.equal(jobs[0].uses, `CandidDan/flow/.github/workflows/_flow-unblock.yml@${ref}`, file);
    assert.equal(jobs[0].secrets, undefined, `${file} forwards nothing — the reusable uses GITHUB_TOKEN only`);
  }
  // `workflows: [flow-done]` matches by workflow NAME; both flow-done callers must carry it.
  for (const dir of [WORKFLOWS, join(REPO, "project-template", ".github", "workflows")]) {
    assert.equal(yamlMod.parse(readFileSync(join(dir, "flow-done.yml"), "utf8")).name, "flow-done");
  }
  // The reusable is trigger-agnostic, declares no secrets, never reads FLOW_PAT, and is not FLOW_AI-gated.
  const reusable = wfParse("_flow-unblock.yml");
  assert.deepEqual(Object.keys(reusable.on), ["workflow_call"]);
  assert.equal(reusable.on.workflow_call.secrets, undefined);
  assert.equal(reusable.on.workflow_call.inputs.queue_runner_workflow.default, "", "names nothing: its worker is retired");
  assert.doesNotMatch(wfSrc("_flow-unblock.yml").replace(/^\s*#.*$/gm, ""), /FLOW_PAT|FLOW_AI/);
});

// ── flow-0157: the task-model adapter re-exports the template's WHOLE surface ──
// A caller that imports named exports from `<repo>/.flow/bin/task-model.mjs` gets the adapter on
// canonical. A name the adapter omits imports as `undefined` here and
// nowhere else, so the list is derived from the template at run time, never written by hand.

test("flow-0157: every named export of the template's task-model.mjs is re-exported by the adapter", async () => {
  const template = await import(join(TEMPLATE_FLOW, "bin", "task-model.mjs"));
  const adapter = await import(join(BIN, "task-model.mjs"));
  const names = Object.keys(template);
  assert.ok(names.includes("readAsks") && names.includes("writeAsks"),
    "the template must still export its frontmatter helpers, or this test is vacuous");
  const missing = names.filter((n) => !(n in adapter));
  assert.deepEqual(missing, [], `the adapter does not re-export: ${missing.join(", ")}`);
  for (const n of names) {
    assert.equal(adapter[n], template[n], `${n} must BE the template's export, not a reimplementation`);
  }
});
