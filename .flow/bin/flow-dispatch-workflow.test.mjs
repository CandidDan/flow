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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const wr = on.workflow_run ?? {};
  for (const w of ["flow-unblock", "flow-recover"]) {
    if (!(wr.workflows ?? []).includes(w)) problems.push(`trigger: workflow_run of ${w} is missing`);
  }
  if (!(wr.types ?? []).includes("completed")) problems.push("trigger: workflow_run must fire on types [completed]");
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
    ["caller", "workflows: [flow-unblock, flow-recover]", "workflows: [flow-unblock]", /workflow_run of flow-recover/],
    ["caller", "workflows: [flow-unblock, flow-recover]", "workflows: [flow-recover]", /workflow_run of flow-unblock/],
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
