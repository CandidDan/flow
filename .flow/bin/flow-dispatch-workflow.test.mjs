// flow-dispatch-workflow.test.mjs — proving tests for flow-0182's workflow half.
//
// The helper's behaviour is tested in project-template/.flow/bin/flow-dispatch.test.mjs. This file
// owns what only canonical can check: the reusable `_flow-dispatch.yml` and its two callers, read
// the way GitHub reads them, and the sync that delivers the template caller to an adopting repo.
//
// The structural rule is written as a function over file TEXT (`checkDispatchWorkflows`) so each
// assertion can be shown to fail against a mutated copy — a structure test that cannot fail checks
// nothing.

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE — see check-workflows.test.mjs. The no-install flow-tooling job runs this file
// without `yaml`; the YAML-reading tests skip visibly there and run for real in the per-stack job.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-dispatch.yml");
const TEMPLATE_CALLER = join(REPO, "project-template/.github/workflows/flow-dispatch.yml");
const CANON_CALLER = join(REPO, ".github/workflows/flow-dispatch.yml");
const TIERS = ["HAIKU", "SONNET", "OPUS", "FABLE"];
const TOKENS = TIERS.map((t) => `FLOW_ROUTINE_${t}_TOKEN`);
/** The repository_dispatch event type flow-unblock and flow-recover send, and flow-dispatch listens for. */
export const TASK_STATE_EVENT = "flow-task-state";

const read = (f) => readFileSync(f, "utf8");
const majorRef = () => `v${read(join(REPO, "VERSION")).trim().split(".")[0]}`;

/**
 * Problems with the dispatch reusable + one caller, as human-readable strings. Empty means: every
 * trigger is present, runs queue rather than cancel, the routine tokens reach the script only
 * through `secrets:` and `env:`, and the caller pins `wantRef`.
 */
export function checkDispatchWorkflows({ reusable, caller, wantRef }, yaml) {
  const problems = [];
  const r = yaml.parse(reusable);
  const c = yaml.parse(caller);
  const on = c.on ?? c[true] ?? {};

  // ── triggers ──
  const push = on.push ?? {};
  if (!(push.branches ?? []).includes("main") || !(push.paths ?? []).includes(".flow/tasks/**")) {
    problems.push("trigger: push to main with paths `.flow/tasks/**` is missing");
  }
  // flow-0185: flow-unblock and flow-recover start this workflow with repository_dispatch
  // `flow-task-state`, sent only after they push a task-file change. `workflow_run` on them started a
  // runner after every one of their runs, including the ones that changed nothing.
  const rd = on.repository_dispatch ?? {};
  if (!(rd.types ?? []).includes(TASK_STATE_EVENT)) {
    problems.push(`trigger: repository_dispatch of type ${TASK_STATE_EVENT} is missing`);
  }
  if ("workflow_run" in on) {
    problems.push("trigger: workflow_run must be absent — it starts a runner after every unblock/recover run, changed or not");
  }
  const crons = (on.schedule ?? []).map((s) => s.cron);
  const daily = crons.length === 1 && /^\d{1,2} \d{1,2} \* \* \*$/.test(crons[0]);
  if (!daily) problems.push(`trigger: exactly one daily schedule expected, got ${JSON.stringify(crons)}`);
  if (!("workflow_dispatch" in on)) problems.push("trigger: workflow_dispatch is missing");

  // ── concurrency ──
  if (c.concurrency?.group !== "flow-dispatch") problems.push("concurrency: group must be flow-dispatch");
  if (c.concurrency?.["cancel-in-progress"] !== false) {
    problems.push("concurrency: cancel-in-progress must be false — a cancelled run is a dropped event");
  }

  // ── the pin ──
  const jobs = Object.values(c.jobs ?? {});
  if (jobs.length !== 1) problems.push("caller: a thin caller has exactly one job");
  const job = jobs[0] ?? {};
  const want = `CandidDan/flow/.github/workflows/_flow-dispatch.yml@${wantRef}`;
  if (job.uses !== want) problems.push(`pin: caller must use ${want}, got ${job.uses}`);

  // ── the tokens: secrets → env, never run ──
  if (job.secrets === "inherit") problems.push("caller: `secrets: inherit` hands this job every secret in the repo");
  const declared = r.on?.workflow_call?.secrets ?? {};
  for (const t of TOKENS) {
    if (!(t in declared)) problems.push(`reusable: on.workflow_call.secrets does not declare ${t}`);
    else if (declared[t]?.required !== false) problems.push(`reusable: ${t} must be required: false — a repo without routines stays green`);
    if (job.secrets?.[t] !== `\${{ secrets.${t} }}`) problems.push(`caller: ${t} must be forwarded by name as \${{ secrets.${t} }}`);
  }
  const extra = Object.keys(job.secrets ?? {}).filter((k) => !TOKENS.includes(k));
  if (extra.length) problems.push(`caller: forwards secrets the reusable does not use: ${extra.join(", ")}`);

  for (const t of TIERS) {
    const input = `${t.toLowerCase()}_routine_id`;
    if (job.with?.[input] !== `\${{ vars.FLOW_ROUTINE_${t}_ID }}`) {
      problems.push(`caller: ${input} must come from vars.FLOW_ROUTINE_${t}_ID`);
    }
  }

  const steps = Object.values(r.jobs ?? {}).flatMap((j) => j.steps ?? []);
  for (const step of steps) {
    const run = String(step.run ?? "");
    if (/\$\{\{[^}]*secrets\./.test(run) || /\$\{\{[^}]*FLOW_ROUTINE_\w+_TOKEN/.test(run)) {
      problems.push(`reusable: step "${step.name ?? "?"}" interpolates a secret into run: — it becomes part of the script text`);
    }
    for (const [k, v] of Object.entries(step.with ?? {})) {
      if (/secrets\./.test(String(v))) problems.push(`reusable: step "${step.name ?? "?"}" passes a secret through with.${k}`);
    }
  }
  const fire = steps.find((s) => /flow-dispatch\.mjs/.test(String(s.run ?? "")));
  if (!fire) problems.push("reusable: no step runs .flow/bin/flow-dispatch.mjs");
  for (const t of TOKENS) {
    if (fire?.env?.[t] !== `\${{ secrets.${t} }}`) problems.push(`reusable: the dispatch step's env must map ${t} from secrets.${t}`);
  }
  for (const t of TIERS) {
    const id = `FLOW_ROUTINE_${t}_ID`;
    if (fire?.env?.[id] !== `\${{ inputs.${t.toLowerCase()}_routine_id }}`) {
      problems.push(`reusable: the dispatch step's env must map ${id} from its input`);
    }
  }

  // Least privilege: the job reads the repo and nothing else.
  const perms = JSON.stringify(r.permissions ?? {});
  if (perms !== JSON.stringify({ contents: "read" })) problems.push(`reusable: permissions must be exactly contents: read, got ${perms}`);
  if (JSON.stringify(job.permissions ?? {}) !== JSON.stringify({ contents: "read" })) {
    problems.push("caller: permissions must be exactly contents: read");
  }
  return problems;
}

const realInput = (caller, wantRef) => ({ reusable: read(REUSABLE), caller: read(caller), wantRef });

test("the template caller and the reusable: every trigger, queued concurrency, tokens via secrets/env only, pinned @v4", { skip }, () => {
  assert.equal(majorRef(), "v4", "this release is v4; the template caller is pinned to it");
  assert.deepEqual(checkDispatchWorkflows(realInput(TEMPLATE_CALLER, majorRef()), yamlMod), []);
});

test("canonical's own caller is the same, pinned @main", { skip }, () => {
  assert.deepEqual(checkDispatchWorkflows(realInput(CANON_CALLER, "main"), yamlMod), []);
});

test("the check fails on each mutation it exists to catch", { skip }, () => {
  const base = realInput(TEMPLATE_CALLER, "v4");
  const mutations = [
    ["caller", /  push:\n    branches: \[main\]\n    paths: \[".flow\/tasks\/\*\*"\]\n/, "", /push to main/],
    ["caller", "types: [flow-task-state]", "types: [flow-task-changed]", /repository_dispatch of type flow-task-state/],
    ["caller", "  repository_dispatch:\n", "  workflow_run:\n    workflows: [flow-unblock, flow-recover]\n    types: [completed]\n  repository_dispatch:\n", /workflow_run must be absent/],
    ["caller", /  schedule:\n.*\n/, "", /daily schedule/],
    ["caller", '"41 6 * * *"', '"0 * * * *"', /daily schedule/],
    ["caller", "  workflow_dispatch:\n", "", /workflow_dispatch/],
    ["caller", "cancel-in-progress: false", "cancel-in-progress: true", /cancel-in-progress must be false/],
    ["caller", "_flow-dispatch.yml@v4", "_flow-dispatch.yml@v3", /pin: caller must use/],
    ["caller", "_flow-dispatch.yml@v4", "_flow-dispatch.yml@main", /pin: caller must use/],
    ["caller", /    secrets:\n(      .*\n)+/, "    secrets: inherit\n", /secrets: inherit/],
    ["caller", "FLOW_ROUTINE_OPUS_TOKEN: ${{ secrets.FLOW_ROUTINE_OPUS_TOKEN }}", "FLOW_ROUTINE_OPUS_TOKEN: ${{ secrets.FLOW_PAT }}", /FLOW_ROUTINE_OPUS_TOKEN must be forwarded/],
    ["caller", "contents: read ", "contents: write ", /caller: permissions/],
    ["reusable", "node .flow/bin/flow-dispatch.mjs\n",
      'curl -H "Authorization: Bearer ${{ secrets.FLOW_ROUTINE_SONNET_TOKEN }}" x\n          node .flow/bin/flow-dispatch.mjs\n', /interpolates a secret into run/],
    ["reusable", "FLOW_ROUTINE_FABLE_TOKEN: ${{ secrets.FLOW_ROUTINE_FABLE_TOKEN }}", "FLOW_ROUTINE_FABLE_TOKEN: ${{ inputs.fable_routine_id }}", /must map FLOW_ROUTINE_FABLE_TOKEN/],
    ["reusable", "      FLOW_ROUTINE_HAIKU_TOKEN:\n        required: false\n", "", /does not declare FLOW_ROUTINE_HAIKU_TOKEN/],
    ["reusable", "contents: read           # the checkout", "contents: write          # the checkout", /reusable: permissions/],
  ];
  for (const [which, from, to, expect] of mutations) {
    const mutated = { ...base, [which]: base[which].replace(from, to) };
    assert.notEqual(mutated[which], base[which], `mutation did not apply: ${from}`);
    const problems = checkDispatchWorkflows(mutated, yamlMod);
    assert.ok(problems.some((p) => expect.test(p)), `${from} -> ${to}: expected ${expect}, got ${JSON.stringify(problems)}`);
  }
});

test("the reusable's run block holds no ${{ }} expression at all", () => {
  // Regex-only, so it also runs in the no-install job: the dispatch step's script is plain shell.
  const text = read(REUSABLE);
  const run = text.slice(text.indexOf("        run: |"));
  assert.ok(run.includes("node .flow/bin/flow-dispatch.mjs"), "the dispatch step must run the helper");
  assert.doesNotMatch(run, /\$\{\{/, "an expression in run: is substituted into the script before the shell sees it");
});

// ── canonical's adapter, run as the workflow runs it ─────────────────────────────────────────

test("canonical's adapter CLI runs against canonical's store and, with no routine configured, exits 0 with one decision line", () => {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  const r = spawnSync(process.execPath, [join(BIN, "flow-dispatch.mjs")], { cwd: REPO, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n").filter((l) => /decision=/.test(l));
  assert.equal(lines.length, 1, r.stdout);
  assert.match(lines[0], /^flow-dispatch: decision=skipped reason=(at-capacity|nothing-ready|no-routine-for-\w+)/);
  // A routine-less skip names a canonical id, never a fixture one.
  const named = lines[0].match(/task=(\S+)/);
  if (named) assert.match(named[1], /^flow-\d{4}$/);
});

// ── delivery: the sync that runs at this release adds the caller ─────────────────────────────

const COPY_LOOP_REGION =
  /^\s*KEPT_FILE="\$\(mktemp\)"$[\s\S]*?^\s*KEPT="\$\(cat "\$KEPT_FILE"\)"$/m;

test("a repo whose sync runs at this release gets .github/workflows/flow-dispatch.yml added in its sync PR", { skip }, (t) => {
  const steps = Object.values(yamlMod.parse(read(join(REPO, ".github/workflows/_flow-sync.yml"))).jobs ?? {})
    .flatMap((j) => j.steps ?? []).map((s) => s.run).filter((s) => typeof s === "string").join("\n");
  const region = steps.match(COPY_LOOP_REGION);
  assert.ok(region, "could not find _flow-sync.yml's caller-copy loop — it was reshaped; update the extractor");

  // An adopting repo at the previous release: it has flow-unblock.yml and no flow-dispatch.yml.
  const repo = mkdtempSync(join(tmpdir(), "flow-dispatch-sync-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  mkdirSync(join(repo, ".github/workflows"), { recursive: true });
  writeFileSync(join(repo, ".github/workflows/flow-unblock.yml"),
    read(join(REPO, "project-template/.github/workflows/flow-unblock.yml")));
  git("add", "-A");
  git("commit", "-q", "-m", "adopted at the previous release");

  execFileSync("bash", ["-euo", "pipefail", "-c", region[0]], {
    cwd: repo, encoding: "utf8", env: { ...process.env, CANON_TPL: join(REPO, "project-template") },
  });
  git("add", "-A");
  const changed = git("diff", "--cached", "--no-renames", "--name-status");
  assert.match(changed, /^A\t\.github\/workflows\/flow-dispatch\.yml$/m, changed);
  assert.equal(read(join(repo, ".github/workflows/flow-dispatch.yml")), read(TEMPLATE_CALLER));

  // …and the sync PR body lists it under Added, the review question for a new CI-executing file.
  const body = execFileSync(process.execPath, [join(REPO, "project-template/.flow/bin/flow-sync.mjs"), "pr-body",
    "--local", "4.0.0", "--canonical", "4.1.0", "--files", changed], { encoding: "utf8" });
  const added = body.match(/\*\*Added\*\* \(\d+\)\n([\s\S]*?)(?=\n\*\*|\nOpened)/);
  assert.ok(added, body);
  assert.match(added[1], /^- `\.github\/workflows\/flow-dispatch\.yml`$/m, body);
});

// ── flow-0185: the task-state signal from flow-unblock and flow-recover ──────────────────────
//
// The chain this replaces: flow-dispatch ran on `workflow_run` of flow-unblock and flow-recover,
// so every one of their runs started a dispatch runner, including the ones that changed nothing.
// Now each reusable's sweep step writes `changed=true` to its step outputs only after it PUSHED a
// task-file commit, and a last step, gated on that output, sends repository_dispatch
// `flow-task-state` — the event flow-dispatch's callers listen for. A sweep that changed nothing
// skips the step, so no event is sent and no flow-dispatch run, and no runner, starts.

/** The name of the signal step, and its exact condition — shared with unblock-no-dispatch.test.mjs. */
export const SIGNAL_STEP = "Start flow-dispatch, because a task file changed on main";
// `!cancelled()` so a sweep that pushed one change and then failed on a later one still signals.
export const SIGNAL_IF = "${{ !cancelled() && steps.sweep.outputs.changed == 'true' }}";
const sweepSteps = (file) => yamlMod.parse(read(join(REPO, ".github/workflows", file))).jobs.sweep.steps;

/**
 * Problems with one sweep reusable's signal, as strings. Empty means: the sweep step has `id:
 * sweep`; the signal step is the last step, is gated on exactly `steps.sweep.outputs.changed ==
 * 'true'`, posts `event_type=<TASK_STATE_EVENT>` to this repo's dispatches endpoint with
 * GITHUB_TOKEN, and never fails the job; and in the sweep script every `changed=true` follows a push
 * to main, and every push to main is followed by one.
 */
export function checkTaskStateSignal(text, yaml) {
  const problems = [];
  const steps = yaml.parse(text).jobs?.sweep?.steps ?? [];
  const sweep = steps.find((s) => s.id === "sweep");
  if (!sweep) problems.push("no step has id: sweep — the signal's condition reads steps.sweep.outputs");
  const signal = steps.find((s) => s.name === SIGNAL_STEP);
  if (!signal) return [...problems, `no step named "${SIGNAL_STEP}"`];
  if (steps.at(-1) !== signal) problems.push("the signal step must be the last step: it reports what the sweep pushed");
  if (signal.if !== SIGNAL_IF) problems.push(`signal: if must be exactly ${SIGNAL_IF}, got ${JSON.stringify(signal.if)}`);
  if (signal.env?.GH_TOKEN !== "${{ github.token }}") problems.push("signal: GH_TOKEN must be github.token — never FLOW_PAT, whose scopes are the repo's");
  const run = String(signal.run ?? "");
  if (!run.includes(`"repos/$GITHUB_REPOSITORY/dispatches" -f event_type=${TASK_STATE_EVENT}`)) {
    problems.push(`signal: must POST event_type=${TASK_STATE_EVENT} to repos/$GITHUB_REPOSITORY/dispatches`);
  }
  if (/actions\/workflows\//.test(run)) problems.push("signal: must not dispatch a named workflow — it sends an event, flow-dispatch decides");
  if (!/^\s*if gh api /m.test(run) || !/::warning::/.test(run)) {
    problems.push("signal: a failed send must warn, not fail the job — the change is already on main");
  }

  // Inside the sweep script: `changed=true` only after a push to main, and after every one.
  const lines = String(sweep?.run ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const isPush = (l) => /^(if )?git push origin (HEAD:)?main\b/.test(l);
  const isMark = (l) => /^echo "changed=true" >> "\$\{GITHUB_OUTPUT:-\/dev\/null\}"$/.test(l);
  const pushes = lines.filter(isPush).length, marks = lines.filter(isMark).length;
  if (marks === 0) problems.push("sweep: never writes changed=true");
  if (pushes !== marks) problems.push(`sweep: ${pushes} push(es) to main but ${marks} changed=true line(s) — each push must be marked once`);
  lines.forEach((l, i) => {
    if (isMark(l) && !lines.slice(Math.max(0, i - 3), i).some(isPush)) {
      problems.push(`sweep: changed=true at script line ${i + 1} does not follow a push to main`);
    }
  });
  return problems;
}

test("both sweep reusables send flow-task-state after a pushed change, and only then", { skip }, () => {
  for (const f of ["_flow-unblock.yml", "_flow-recover.yml"]) {
    assert.deepEqual(checkTaskStateSignal(read(join(REPO, ".github/workflows", f)), yamlMod), [], f);
  }
});

test("the signal check fails on each mutation it exists to catch", { skip }, () => {
  const unblock = read(join(REPO, ".github/workflows/_flow-unblock.yml"));
  const recover = read(join(REPO, ".github/workflows/_flow-recover.yml"));
  const mutations = [
    [unblock, "if: ${{ !cancelled() && steps.sweep.outputs.changed == 'true' }}", "if: ${{ always() }}", /if must be exactly/],
    [recover, "if: ${{ !cancelled() && steps.sweep.outputs.changed == 'true' }}", "if: ${{ steps.sweep.outputs.changed == 'true' }}", /if must be exactly/],
    [unblock, "event_type=flow-task-state", "event_type=flow-task", /must POST event_type=flow-task-state/],
    [unblock, "        id: sweep\n", "", /no step has id: sweep/],
    [unblock, 'echo "changed=true" >> "${GITHUB_OUTPUT:-/dev/null}"', ":", /never writes changed=true/],
    [unblock, "            if git push origin HEAD:main; then\n", "            echo \"changed=true\" >> \"${GITHUB_OUTPUT:-/dev/null}\"\n            if git push origin HEAD:main; then\n", /does not follow a push|push\(es\) to main but/],
    [recover, /\n *echo "changed=true" >> "\$\{GITHUB_OUTPUT:-\/dev\/null\}"\n( *fi\n *;;\n *\*\))/, "\n$1", /1 push\(es\)|2 push\(es\) to main but 1/],
    [recover, "GH_TOKEN: ${{ github.token }}\n        run: |\n          if gh api", "GH_TOKEN: ${{ secrets.FLOW_PAT }}\n        run: |\n          if gh api", /GH_TOKEN must be github.token/],
    [recover, /\n      # flow-0185\. Runs only[\s\S]*$/, "\n", /no step named/],
  ];
  for (const [text, from, to, expect] of mutations) {
    const mutated = text.replace(from, to);
    assert.notEqual(mutated, text, `mutation did not apply: ${from}`);
    const problems = checkTaskStateSignal(mutated, yamlMod);
    assert.ok(problems.some((p) => expect.test(p)), `${from} -> ${to}: expected ${expect}, got ${JSON.stringify(problems)}`);
  }
});

test("the event type the sweeps send is the one both flow-dispatch callers listen for", { skip }, () => {
  for (const caller of [TEMPLATE_CALLER, CANON_CALLER]) {
    const on = yamlMod.parse(read(caller)).on;
    assert.deepEqual(on.repository_dispatch, { types: [TASK_STATE_EVENT] }, caller);
    assert.equal(on.workflow_run, undefined, `${caller}: an unblock/recover run that changed nothing must start no dispatch run`);
  }
});

// A sandbox repo with a bare origin, canonical's adapters, and a fake `gh` that logs every call and
// answers the one PR lookup as merged. The release step and the signal step run as GitHub runs them.
function unblockSandbox(t) {
  const root = mkdtempSync(join(tmpdir(), "flow-0185-unblock-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = join(root, "work");
  cpSync(join(REPO, "project-template/.flow/bin"), join(work, "project-template/.flow/bin"), { recursive: true });
  mkdirSync(join(work, ".flow/tasks"), { recursive: true });
  for (const f of ["flow-unblock.mjs", "apply-board-edits.mjs"]) cpSync(join(BIN, f), join(work, ".flow/bin", f));
  const task = (name, body) => writeFileSync(join(work, ".flow/tasks", name), body);
  task("9001-dep.md", '---\nid: "flow-9001"\nstatus: "done"\n---\n');
  task("9002-rel.md", '---\nid: "flow-9002"\nstatus: "blocked"\nblocked_reason: "waits on 9001 and #7"\n' +
    'blocked_by:\n  - "flow-9001"\n  - "https://github.com/o/r/pull/7"\ntouches: ["a/**"]\n---\nbody\n');
  const git = (...a) => execFileSync("git", a, { cwd: work, encoding: "utf8" });
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", join(root, "origin.git")]);
  git("init", "-q", "-b", "main");
  git("config", "user.name", "t"); git("config", "user.email", "t@t");
  git("add", "-A"); git("commit", "-qm", "seed");
  git("remote", "add", "origin", join(root, "origin.git"));
  git("push", "-q", "origin", "main");
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "gh"), [
    "#!/bin/sh", 'echo "$*" >> "$GH_LOG"',
    'case "$1 $2" in',
    '  "api repos/o/r/pulls/7") printf "closed\\ttrue\\n" ;;',
    '  "api -X") [ -z "$GH_DISPATCH_FAIL" ] || exit 1 ;;',
    "  *) exit 1 ;;", "esac", ""].join("\n"));
  chmodSync(join(root, "bin", "gh"), 0o755);

  const output = join(root, "github_output");
  const run = (step) => {
    writeFileSync(output, "");
    return spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", step.run], {
      cwd: work, encoding: "utf8",
      env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, RUNNER_TEMP: root,
             GH_LOG: join(root, "gh.log"), GITHUB_REPOSITORY: "o/r", GITHUB_OUTPUT: output, ...(step.env_extra ?? {}) },
    });
  };
  const outputs = () => Object.fromEntries(read(output).split("\n").filter(Boolean).map((l) => l.split("=")));
  const ghLog = () => (existsSync(join(root, "gh.log")) ? read(join(root, "gh.log")) : "");
  return { root, run, outputs, ghLog };
}

// GitHub's evaluation of the one condition the signal step carries, on the outputs the sweep wrote
// and the run's state (`cancelled`), so the partial-failure case below is the condition, not a guess.
const signalRuns = (outputs, { cancelled = false } = {}) => !cancelled && outputs.changed === "true";

test("a flow-done-triggered unblock that releases a task sends flow-task-state in the same run", { skip }, (t) => {
  const steps = sweepSteps("_flow-unblock.yml");
  const sweep = steps.find((s) => s.id === "sweep");
  const signal = steps.find((s) => s.name === SIGNAL_STEP);
  assert.equal(signal.if, SIGNAL_IF, "the condition evaluated below must be the one in the file");
  const sb = unblockSandbox(t);

  const r = sb.run(sweep);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Released: flow-9002/);
  assert.deepEqual(sb.outputs(), { changed: "true" });
  assert.ok(signalRuns(sb.outputs()), "the signal step runs after a pushed release");

  const s = sb.run(signal);
  assert.equal(s.status, 0, s.stdout + s.stderr);
  assert.match(sb.ghLog(), new RegExp(`^api -X POST repos/o/r/dispatches -f event_type=${TASK_STATE_EVENT}$`, "m"));
  // …and that is the event both flow-dispatch callers start on (previous test), so the released task
  // is dispatched in this chain, not at the next daily sweep.
});

test("an unblock run that changes no task file writes no output, so the signal step and flow-dispatch never start", { skip }, (t) => {
  const steps = sweepSteps("_flow-unblock.yml");
  const sweep = steps.find((s) => s.id === "sweep");
  const sb = unblockSandbox(t);
  assert.equal(sb.run(sweep).status, 0);            // releases flow-9002
  const again = sb.run(sweep);                       // nothing left to release
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /Nothing to release\./);
  assert.deepEqual(sb.outputs(), {}, "no changed=true when nothing was pushed");
  assert.equal(signalRuns(sb.outputs()), false, "the signal step is skipped — no event, no flow-dispatch run, no runner");
  assert.doesNotMatch(sb.ghLog(), /dispatches/, "neither sweep run sent anything");
});

test("a failed signal warns and leaves the run green — the release is already on main", { skip }, (t) => {
  const signal = sweepSteps("_flow-unblock.yml").find((s) => s.name === SIGNAL_STEP);
  const sb = unblockSandbox(t);
  const r = sb.run({ ...signal, env_extra: { GH_DISPATCH_FAIL: "1" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /::warning::Could not send repository_dispatch flow-task-state/);
});

test("a sweep that pushed a change and then failed still signals; a cancelled run does not", { skip }, (t) => {
  const steps = sweepSteps("_flow-unblock.yml");
  const sweep = steps.find((s) => s.id === "sweep");
  const sb = unblockSandbox(t);
  // Push the release, then fail the step after it — the shape of recover pushing task 1 and failing on task 2.
  const r = sb.run({ ...sweep, run: `${sweep.run}\nexit 1\n` });
  assert.notEqual(r.status, 0, "the step must have failed for this case to mean anything");
  assert.deepEqual(sb.outputs(), { changed: "true" }, "the push before the failure is recorded");
  assert.ok(signalRuns(sb.outputs()), "a failed sweep that changed main still starts flow-dispatch");
  assert.equal(signalRuns(sb.outputs(), { cancelled: true }), false, "a cancelled run sends nothing");
});

