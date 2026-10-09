// flow-kickback-workflow.test.mjs — the structural half of flow-0082's proving tests.
//
// WHY A STRUCTURE TEST AND NOT A BEHAVIOUR TEST. `_flow-kickback.yml` hands a model a checkout
// of a PR branch with `--permission-mode bypassPermissions`, and then decides whether to push
// what it wrote. Nothing about that is safe by accident: it is safe because the credential is
// not persisted, because the guard runs from the default branch's copy of the helper, because
// the push step comes after four checks in a stated order, and because every escalation posts a
// card before it adds a label. Each of those is a property of the FILE, and a property of a file
// is exactly what a structure test can hold down and a unit test cannot.
//
// The decision logic itself is tested where it lives — `project-template/.flow/bin/
// flow-kickback.test.mjs` — and canonical's `.flow/bin/flow-kickback.mjs` is an adapter over it,
// so neither is re-tested here. What is here is the wiring, the config and the docs.
//
// DEPENDENCY NOTE — see check-workflows.test.mjs. `_flow-gates.yml`'s `flow-tooling` job runs
// `node --test .flow/bin/*.test.mjs` with no install step, so assertions that need to read a
// workflow the way GitHub does are skipped there and run for real in the per-stack gate job.
// The ones that can be made on raw text are NOT guarded, so the no-install job still proves the
// prompt's rules, the pins and the push ordering.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { changelogEntry } from "./changelog-entry.mjs";
import { NEEDS_HUMAN_LABEL, ROUND_TRAILER, HARD_MAX_ROUNDS } from "./flow-kickback.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const WORKFLOWS = join(REPO, ".github", "workflows");
const TEMPLATE_WORKFLOWS = join(REPO, "project-template", ".github", "workflows");

const REUSABLE = join(WORKFLOWS, "_flow-kickback.yml");
const CANON_CALLER = join(WORKFLOWS, "flow-kickback.yml");
const TEMPLATE_CALLER = join(TEMPLATE_WORKFLOWS, "flow-kickback.yml");
const QUEUE_RUNNER = join(WORKFLOWS, "_flow-queue-runner.yml");

const src = (f) => readFileSync(f, "utf8");

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";
const parse = (f) => yamlMod.parse(src(f));

// Every step of one job, in file order.
const steps = (wf, job) => wf.jobs[job].steps ?? [];
// Every `run:` script in the whole workflow, concatenated.
const allRuns = (wf) =>
  Object.values(wf.jobs ?? {}).flatMap((j) => j.steps ?? []).map((s) => s.run)
    .filter((r) => typeof r === "string");

// ═════════════════════════════════════════════════════════════════════════════════════════
// The trigger and the concurrency group
// ═════════════════════════════════════════════════════════════════════════════════════════

test("both callers trigger on workflow_run for flow-review, types: [completed]", { skip }, () => {
  for (const file of [CANON_CALLER, TEMPLATE_CALLER]) {
    const on = parse(file).on;
    assert.ok(on.workflow_run, `${file} must trigger on workflow_run — nothing else can observe a review run's conclusion`);
    assert.deepEqual(on.workflow_run.workflows, ["flow-review"], file);
    assert.deepEqual(on.workflow_run.types, ["completed"], file);
    assert.ok(!on.schedule && !on.pull_request,
      `${file} must not poll and must not run on the PR event — a workflow_run is what runs the file from the DEFAULT branch`);
  }
});

test("both callers key concurrency on the PR, and the reusable acts only on a failed run", { skip }, () => {
  for (const file of [CANON_CALLER, TEMPLATE_CALLER]) {
    const group = parse(file).concurrency?.group ?? "";
    assert.match(group, /pull_requests\[0\]\.number/,
      `${file}: the concurrency group must be keyed on the PR number — two fixers on one branch would push over each other`);
    assert.equal(parse(file).concurrency.cancel_in_progress ?? parse(file).concurrency["cancel-in-progress"], false,
      `${file}: a round must never be cancelled mid-flight — it would leave the PR a draft with nothing watching it`);
  }
  // The reusable declares no concurrency of its own: a called workflow sharing its caller's
  // group name would wait for the caller, which never finishes.
  assert.equal(parse(REUSABLE).concurrency, undefined);
  assert.match(parse(REUSABLE).jobs.plan.if, /workflow_run\.conclusion == 'failure'/);
});

test("the reusable's header says why workflow_run is what makes holding credentials safe", () => {
  const header = src(REUSABLE).split("\non:")[0];
  assert.match(header, /workflow_run/);
  assert.match(header, /default branch/i);
  assert.match(header, /never from the PR head/i,
    "the fork fence's reasoning is explained in _flow-review.yml's header; this file owes the same explanation for its own");
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// The action pin
// ═════════════════════════════════════════════════════════════════════════════════════════

const pinsOf = (text) =>
  [...text.matchAll(/uses:\s*(anthropics\/claude-code-action@[0-9a-f]{40})/g)].map((m) => m[1]);

test("the claude-code-action pin equals _flow-queue-runner.yml's, everywhere it appears", () => {
  const queuePins = new Set(pinsOf(src(QUEUE_RUNNER)));
  const ourPins = pinsOf(src(REUSABLE));
  assert.equal(queuePins.size, 1, "the queue runner must itself resolve to one pin");
  assert.ok(ourPins.length >= 1, "an empty scan is a failure, not a pass — no action pin found");
  for (const pin of ourPins) {
    assert.ok(queuePins.has(pin),
      `_flow-kickback.yml runs ${pin} while _flow-queue-runner.yml runs ${[...queuePins][0]}. A split pin is a version bump in disguise, in the workflow that hands a model a PR branch.`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// The fixer's limits
// ═════════════════════════════════════════════════════════════════════════════════════════

test("the fixer step disallows `git push` and `gh pr ready`", { skip }, () => {
  const fixer = steps(parse(REUSABLE), "fix").find((s) => /claude-code-action/.test(s.uses ?? ""));
  assert.ok(fixer, "the fix job must run a claude-code-action worker");
  const args = fixer.with.claude_args;
  assert.match(args, /--disallowedTools/);
  assert.match(args, /Bash\(git push:\*\)/, "the fixer must not be able to push — the guard sits between the commit and the push");
  assert.match(args, /Bash\(gh pr ready:\*\)/, "the fixer must not re-request review — the workflow does that, after the checks");
  // The two above are the task's criterion. These three are the routes a deny-list of exactly
  // those two left open: `gh api` can commit contents to a branch, and curl/wget reach the
  // network a hosted runner leaves open. The list is still only a statement of intent — the
  // boundary is the token, pinned by the FLOW_PAT tests below — but it should at least name the
  // obvious ways around itself, so a round that reaches for one is visible rather than routine.
  for (const route of ["gh api", "curl", "wget"]) {
    assert.ok(args.includes(`Bash(${route}:*)`),
      `\`${route}\` is an unlisted route past "no push" and "no re-ready"`);
  }
  // Defence in depth for the HIGH finding below. With the `fix` job's read-only token these
  // would all fail anyway, so none of them is the boundary — they are here so that the day
  // someone widens that job's permissions, the deny-list is already standing. `gh pr edit` is
  // the one that matters most: it is how a session would REMOVE `flow:needs-human` and re-arm
  // a PR a human had deliberately stopped.
  for (const act of ["gh pr merge", "gh pr edit", "gh pr comment", "gh pr close", "gh pr review",
                     "gh label", "gh issue"]) {
    assert.ok(args.includes(`Bash(${act}:*)`),
      `\`${act}\` changes the PR's own state, and a session a PR comment can address must not reach for it`);
  }
});

// The CRITICAL finding on PR #179, pinned so it cannot come back. The fixer is a model running
// under `--permission-mode bypassPermissions`, on a checkout of the PR branch, and its own prompt
// tells it to read PR comments as its instructions — so on a non-fork PR, anyone who can comment
// can address that session. A push-capable credential in that process's environment is not held
// back by `--disallowedTools`: that flag pattern-matches command prefixes, so any route the list
// does not textually name (a wrapper script, an unlisted CLI) reaches the remote, and a hosted
// runner's open egress reaches the network. The only real boundary is the token itself, so the
// test is about WHICH token the step is handed, not about what the step was asked not to do.
test("the fixer step is handed NO FLOW_PAT — not in env:, not in with:", { skip }, () => {
  const fixer = steps(parse(REUSABLE), "fix").find((s) => /claude-code-action/.test(s.uses ?? ""));
  assert.ok(fixer, "the fix job must run a claude-code-action worker");
  for (const [block, values] of [["env", fixer.env ?? {}], ["with", fixer.with ?? {}]]) {
    for (const [k, v] of Object.entries(values)) {
      assert.doesNotMatch(String(v), /FLOW_PAT/,
        `the fixer's ${block}.${k} references FLOW_PAT. A session that can be addressed by a PR comment must not hold a credential that can push — GITHUB_TOKEN, scoped by this workflow's \`contents: read\`, is what makes the guard set a boundary rather than a request.`);
    }
  }
  for (const key of ["github_token"]) {
    assert.equal(fixer.with[key], "${{ github.token }}",
      `the fixer's ${key} must be GITHUB_TOKEN and nothing stronger`);
  }
});

// flow-0135. The invariant is a JOB one, and it replaces flow-0082's step-level one ("FLOW_PAT
// reaches exactly one step"), which a same-job layout satisfied while a model step in that job
// could plant a hook, a $GITHUB_ENV entry (BASH_ENV, NODE_OPTIONS, LD_PRELOAD) or a $GITHUB_PATH
// entry that ran beside the PAT. On a runner, the boundary is the job.
const PAT_VALUE = /secrets\.FLOW_PAT(?!\s*!=)/;
// Every job, split by the two facts that matter: does it run a model, does it reference the PAT
// value anywhere (job env, step env, with:, run:). `plan`'s presence test is not the value.
export function patLayout(wf) {
  const model = [];
  const pat = [];
  for (const [name, job] of Object.entries(wf.jobs ?? {})) {
    if (runsAModel(job)) model.push(name);
    if (PAT_VALUE.test(JSON.stringify(job))) pat.push(name);
  }
  return { model, pat, both: model.filter((j) => pat.includes(j)) };
}

test("flow-0135: no job that runs a model references FLOW_PAT, and the job that does runs no model", { skip }, () => {
  const wf = parse(REUSABLE);
  const { model, pat, both } = patLayout(wf);
  assert.ok(model.length >= 3 && pat.length >= 1, "an empty scan is a failure, not a pass");
  assert.deepEqual(both, [],
    `these jobs run a model AND reference secrets.FLOW_PAT: ${both.join(", ")}. A model step can reach a secret held by any later step of its job.`);
  assert.deepEqual(pat, ["push"], "FLOW_PAT belongs to exactly one job, `push`");
  assert.ok(!runsAModel(wf.jobs.push), "the FLOW_PAT job runs no model");
  assert.ok(!JSON.stringify(wf.jobs.fix).includes("FLOW_PAT"),
    "the fixer's job must not even name the secret");

  // MUTATION: the pre-change layout — the guards and the push back inside `fix` — fails.
  const before = structuredClone(wf);
  before.jobs.fix.steps = [...before.jobs.fix.steps, ...before.jobs.push.steps];
  delete before.jobs.push;
  assert.deepEqual(patLayout(before).both, ["fix"], "the same-job layout this task removed must be reported");
  // And so does the PAT merely reaching the model job's environment, at job level.
  const leaky = structuredClone(wf);
  leaky.jobs.fix.env = { GH_TOKEN: "${{ secrets.FLOW_PAT }}" };
  assert.deepEqual(patLayout(leaky).both, ["fix"]);
});

test("FLOW_PAT's value reaches one step — stamp-and-push, in `push`, after every guard", { skip }, () => {
  const wf = parse(REUSABLE);
  const holders = [];
  for (const [job, j] of Object.entries(wf.jobs)) {
    for (const step of j.steps ?? []) {
      const refs = [...Object.entries(step.env ?? {}), ...Object.entries(step.with ?? {})]
        .filter(([, v]) => PAT_VALUE.test(String(v)));
      if (refs.length) holders.push({ job, id: step.id ?? step.name, keys: refs.map(([k]) => k) });
    }
  }
  assert.deepEqual(holders.map((h) => `${h.job}/${h.id}`), ["push/stamp-and-push"],
    `FLOW_PAT must reach one step and one only; found: ${JSON.stringify(holders)}`);
  const ids = steps(wf, "push").map((s) => s.id).filter(Boolean);
  assert.ok(ids.indexOf("stamp-and-push") > ids.indexOf(GUARD_ORDER.at(-1)),
    "the one step holding the push credential is the one that runs last");
  // `plan` reads only WHETHER the secret is set. The value itself never enters that job.
  const hasPat = steps(wf, "plan").flatMap((s) => Object.values(s.env ?? {}))
    .filter((v) => /FLOW_PAT/.test(String(v)));
  assert.deepEqual(hasPat, ["${{ secrets.FLOW_PAT != '' }}"],
    "plan may test for the secret's presence; it may never be handed the secret");
});

test("every checkout in the reusable sets persist-credentials: false", { skip }, () => {
  const wf = parse(REUSABLE);
  const checkouts = Object.values(wf.jobs).flatMap((j) => j.steps ?? [])
    .filter((s) => /actions\/checkout@/.test(s.uses ?? ""));
  assert.ok(checkouts.length >= 3, "an empty scan is a failure, not a pass");
  for (const c of checkouts) {
    assert.equal(c.with["persist-credentials"], false,
      "a credential left in .git/config is a credential the fixer can push with, which is exactly what the guard set exists to prevent");
  }
});

test("the fixer prompt carries all four of its rules, in its own words", { skip }, () => {
  const prompt = steps(parse(REUSABLE), "fix")
    .find((s) => /claude-code-action/.test(s.uses ?? "")).with.prompt;
  assert.match(prompt, /NEVER WEAKEN A TEST/, "the no-weakening rule");
  assert.match(prompt, /strengthen assertions/, "adding and strengthening must be explicitly allowed, or the rule reads as 'do not touch tests'");
  assert.match(prompt, /COMMIT, DO NOT PUSH/, "the commit-don't-push rule");
  assert.match(prompt, /DISPUTING IS ALLOWED/, "the dispute instruction");
  assert.match(prompt, /NEVER EDIT THE TASK STORE/, "the never-edit-the-store rule");
  assert.match(prompt, /\.flow\/tasks/, "the store rule must name the directory it is about");
  assert.match(prompt, /NEVER SPAWN A REVIEW AGENT/, "a worker that reviews its own fix is the one thing this system refuses");
  assert.match(prompt, /outcome\.json/, "the hand-back is what every escalation path reads");
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// The guard set, and the single push
// ═════════════════════════════════════════════════════════════════════════════════════════

// Guards 1–4 as flow-0082 ordered them, with flow-0135's bundle check between 2 and 3: the
// commits it admits are what 3 and 4 judge.
const GUARD_ORDER = ["check-outcome", "check-remote-head", "check-bundle", "check-weakens", "check-commits"];

test("the push happens only after the guards, in the stated order, in a job after the round", { skip }, () => {
  const wf = parse(REUSABLE);
  const ids = steps(wf, "push").map((s) => s.id).filter(Boolean);
  const at = (id) => {
    const i = ids.indexOf(id);
    assert.notEqual(i, -1, `the push job must have a step with id \`${id}\``);
    return i;
  };
  const order = GUARD_ORDER.map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b),
    `the guards must run in the order the task states: ${GUARD_ORDER.join(" -> ")}`);
  for (const id of GUARD_ORDER) {
    assert.ok(at(id) < at("stamp-and-push"),
      `\`${id}\` must run BEFORE anything is pushed — a check after the push is not a check`);
  }
  // The guards judge the round, so their job runs after the round's — and only when it succeeded:
  // no `always()`, so a crashed or cancelled round never reaches a push.
  assert.deepEqual(wf.jobs.push.needs, ["plan", "fix"]);
  assert.doesNotMatch(wf.jobs.push.if, /always\(\)/, "a round that did not finish must never be pushed");
  assert.match(wf.jobs.push.if, /action == 'dispatch'/);
  for (const id of GUARD_ORDER) {
    assert.ok(!steps(wf, "fix").some((s) => s.id === id),
      `\`${id}\` runs in the model's job, where the model can tamper with it ($GITHUB_ENV, $GITHUB_PATH, hooks)`);
  }
});

test("no guard pipes its verdict into tee — a pipeline reports the LAST command's status", { skip }, () => {
  for (const step of steps(parse(REUSABLE), "push")) {
    if (!GUARD_ORDER.includes(step.id)) continue;
    assert.doesNotMatch(step.run, /flow-kickback\.mjs[^\n|]*\|\s*tee/,
      `\`${step.id}\` pipes the guard into tee, so the step would see tee's exit code 0 and the guard would never trip`);
  }
});

test("the guard runs the DEFAULT branch's copy of the helper, not the PR's", { skip }, () => {
  const wf = parse(REUSABLE);
  const push = steps(wf, "push");
  const weakens = push.find((s) => s.id === "check-weakens");
  assert.match(weakens.run, /KICKBACK_BIN/,
    "running `.flow/bin/flow-kickback.mjs` from the PR checkout would let a round edit the check about to judge it (flow-0079's rule)");
  const materialise = push.find((s) => /worktree add/.test(s.run ?? ""));
  assert.ok(materialise, "the default-branch copy has to be materialised from somewhere");
  assert.match(materialise.run, /GUARD_SHA/,
    "the guard's commit must be pinned by SHA — a SHA is content-addressed and cannot be made to name a different tree");
  // Recorded by `plan`, on its default-branch checkout, in a job that runs no model.
  assert.match(String(materialise.env.GUARD_SHA), /needs\.plan\.outputs\.guard_sha/);
  assert.match(wf.jobs.plan.outputs.guard_sha, /steps\.pr\.outputs\.guard_sha/);
  assert.match(steps(wf, "plan").find((s) => s.id === "pr").run, /guard_sha=\$\(git rev-parse HEAD\)/);
  assert.ok(!runsAModel(wf.jobs.plan));
});

// flow-0135 criterion 2. The push job starts from nothing the model touched: a fresh checkout of
// the head `plan` recorded, the round's commits only as a bundle, and a refusal (no push, the
// guard's sentence on the card) when the bundle's base is not that head.
test("the push job checks out fresh and takes the round's commits only as a bundle", { skip }, () => {
  const wf = parse(REUSABLE);
  const push = steps(wf, "push");
  const checkout = push.find((s) => /actions\/checkout@/.test(s.uses ?? ""));
  assert.match(checkout.with.ref, /needs\.plan\.outputs\.head_sha/,
    "the recorded head, by SHA — never a ref the fix job reported");
  assert.equal(checkout.with["persist-credentials"], false);
  assert.match(wf.jobs.plan.outputs.head_sha, /steps\.pr\.outputs\.head_sha/);
  assert.match(steps(wf, "plan").find((s) => s.id === "pr").run, /jq -r \.headRefOid/);

  // The bundle leaves `fix` as an artifact, cut from the round's base, and arrives in `push`.
  const fix = steps(wf, "fix");
  // The round itself is built on the recorded head, so a moved branch fails before the model runs.
  const fixCheckout = fix.find((s) => /actions\/checkout@/.test(s.uses ?? ""));
  assert.match(fixCheckout.with.ref, /needs\.plan\.outputs\.head_sha/,
    "`fix` must check out the head `push` will accept, not whatever head_ref points at now");
  const carry = fix.find((s) => s.id === "carry");
  assert.match(carry.run, /git bundle create "\$dir\/round\.bundle" "\$BASE_SHA\.\.HEAD"/);
  assert.match(carry.if, /always\(\)/, "a disputed round still hands back");
  const up = fix.find((s) => /actions\/upload-artifact@/.test(s.uses ?? ""));
  const down = push.find((s) => /actions\/download-artifact@/.test(s.uses ?? ""));
  assert.ok(up && down, "the round crosses the job boundary as an artifact");
  assert.equal(up.with.name, down.with.name);
  assert.equal(up.with.overwrite, true, "a re-run of a failed `fix` re-uploads the same name in the same run");
  assert.ok(fix.indexOf(up) > fix.findIndex((s) => s.id === "worker"));
  // Nothing but the bundle carries commits into `push`: no fetch from the PR, no second checkout.
  const runs = push.map((s) => s.run ?? "").join("\n");
  assert.doesNotMatch(runs, /git (-c \S+ )*(fetch|pull)\b/, "the round's commits come from the bundle and nowhere else");
  assert.equal(push.filter((s) => /actions\/checkout@/.test(s.uses ?? "")).length, 1);

  const bundle = push.find((s) => s.id === "check-bundle");
  assert.match(String(bundle.env.BASE_SHA), /needs\.plan\.outputs\.head_sha/);
  assert.match(bundle.run, /\[ "\$prereqs" = "1" \] \|\| refuse/, "exactly one prerequisite");
  assert.match(bundle.run, /\[ "\$base" = "\$BASE_SHA" \] \|\| refuse/, "and it is the recorded head");
  assert.match(bundle.run, /merge-base --is-ancestor "\$BASE_SHA" "\$tip" \|\| refuse/);
  assert.match(bundle.run, /refuse\(\) \{[\s\S]*amend=[\s\S]*exit 1/, "a refusal escalates with its own sentence");
  for (const id of ["check-weakens", "check-commits"]) {
    assert.match(String(push.find((s) => s.id === id).env.BASE_SHA), /needs\.plan\.outputs\.head_sha/,
      `${id} judges the round against the recorded head, not the fix job's word for it`);
  }
});

// The refusal, run for real: the check-bundle script against bundles built in a scratch repo.
function runBundleCheck({ build }) {
  const dir = mkdtempSync(join(tmpdir(), "flow-kickback-bundle-"));
  try {
    const g = (...a) => execFileSync("git", ["-C", join(dir, "repo"), ...a], { encoding: "utf8" }).trim();
    mkdirSync(join(dir, "repo"));
    g("init", "-q");
    g("config", "user.email", "t@example.com");
    g("config", "user.name", "t");
    g("commit", "-q", "--allow-empty", "-m", "c0");
    const c0 = g("rev-parse", "HEAD");
    g("commit", "-q", "--allow-empty", "-m", "c1");
    const head = g("rev-parse", "HEAD");
    const round = join(dir, "temp", "flow-kickback-round");
    mkdirSync(round, { recursive: true });
    build({ g, c0, head, bundle: join(round, "round.bundle") });
    // The push job's checkout: the recorded head, detached.
    g("checkout", "-q", "--detach", head);
    const out = join(dir, "out.txt");
    writeFileSync(out, "");
    const step = steps(parse(REUSABLE), "push").find((s) => s.id === "check-bundle");
    const r = spawnSync("bash", ["-c", step.run], {
      cwd: join(dir, "repo"), encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: dir, RUNNER_TEMP: join(dir, "temp"), GITHUB_OUTPUT: out, BASE_SHA: head },
    });
    return { status: r.status, out: readFileSync(out, "utf8"), head, now: g("rev-parse", "HEAD") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("check-bundle admits a bundle based on the recorded head, and refuses every other base", { skip }, () => {
  const ok = runBundleCheck({ build: ({ g, head, bundle }) => {
    g("commit", "-q", "--allow-empty", "-m", "fix");
    g("bundle", "create", "-q", bundle, `${head}..HEAD`);
  } });
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /^tip=[0-9a-f]{40}$/m);
  assert.notEqual(ok.now, ok.head, "the admitted round is what is checked out for the push");

  const none = runBundleCheck({ build: () => {} });
  assert.equal(none.status, 0, "no bundle is no commits, which check 4 reports in its own words");
  assert.equal(none.out.trim(), `tip=${none.head}`);

  // Cut from an older commit: the base is not the recorded head.
  const stale = runBundleCheck({ build: ({ g, c0, bundle }) => {
    g("checkout", "-q", "--detach", c0);
    g("commit", "-q", "--allow-empty", "-m", "elsewhere");
    g("bundle", "create", "-q", bundle, `${c0}..HEAD`);
  } });
  assert.equal(stale.status, 1);
  assert.match(stale.out, /^amend=The round's commits did not arrive as a bundle based on this PR's recorded head \(its base is [0-9a-f]{40}, not /m);
  assert.equal(stale.now, stale.head, "a refused bundle is never checked out");

  // A whole-history bundle has no prerequisite at all.
  const full = runBundleCheck({ build: ({ g, bundle }) => {
    g("commit", "-q", "--allow-empty", "-m", "fix");
    g("bundle", "create", "-q", bundle, "HEAD");
  } });
  assert.equal(full.status, 1);
  assert.match(full.out, /names 0 prerequisites, not exactly one/);

  const junk = runBundleCheck({ build: ({ bundle }) => writeFileSync(bundle, "not a bundle\n") });
  assert.equal(junk.status, 1);
  assert.match(junk.out, /not a git bundle/);
});

test("the pushed head carries the round trailer, stamped by the workflow and not by the fixer", { skip }, () => {
  const push = steps(parse(REUSABLE), "push").find((s) => s.id === "stamp-and-push");
  const amendAt = push.run.search(/git (-c \S+ )*commit --amend/);
  const pushAt = push.run.search(/git (-c \S+ )*push/);
  assert.ok(amendAt !== -1 && pushAt !== -1);
  assert.ok(amendAt < pushAt, "the trailer is stamped before the push, so the pushed head carries it");
  assert.match(push.run, /--trailer "\$ROUND_TRAILER_LINE"/);
  assert.match(push.env.ROUND_TRAILER_LINE, /needs\.plan\.outputs\.trailer/,
    "the trailer text comes from the helper, which is where the N/CAP format is defined");
  assert.match(push.run, /gh pr ready "\$PR_NUMBER"/,
    "re-requesting review is what makes the round's work get checked; a push alone proves nothing");
  // The fixer must not be able to write the stamp the cap is counted from.
  const prompt = steps(parse(REUSABLE), "fix").find((s) => /claude-code-action/.test(s.uses ?? "")).with.prompt;
  assert.ok(!prompt.includes(ROUND_TRAILER),
    "the fixer is never told the trailer — a bound the bounded thing can write is not a bound");
});

test("there is exactly one push in the file, and it targets the PR's branch, never the default one", { skip }, () => {
  const pushes = allRuns(parse(REUSABLE)).join("\n").split("\n")
    .filter((l) => /\bgit (-c \S+ )*push\b/.test(l) && !l.trim().startsWith("#"));
  assert.equal(pushes.length, 1, `expected exactly one push; found:\n${pushes.join("\n")}`);
  assert.match(pushes[0], /"HEAD:\$HEAD_REF"/,
    "the only branch this workflow writes to is the PR's own — the round count lives on the PR precisely so the default branch needs no write at all");
  const commits = allRuns(parse(REUSABLE)).join("\n").split("\n")
    .filter((l) => /\bgit (-c \S+ )*commit\b/.test(l) && !l.trim().startsWith("#"));
  assert.equal(commits.length, 1, "the ONE amend is the only commit this workflow makes");
  assert.match(commits[0], /--amend --no-edit/);
});

// flow-0135 criterion 3. Defence in depth: the push job never ran a model, so its .git/hooks/ is
// the fresh checkout's — but the day a model step moves back in, the hook route is already shut.
test("the push job's commit and push run with hooks off — core.hooksPath and --no-verify", { skip }, () => {
  const run = steps(parse(REUSABLE), "push").find((s) => s.id === "stamp-and-push").run;
  const lines = run.split("\n").filter((l) => /\bgit (-c \S+ )*(commit|push)\b/.test(l) && !l.trim().startsWith("#"));
  assert.equal(lines.length, 2, "one commit and one push");
  for (const l of lines) {
    assert.match(l, /git -c core\.hooksPath=\/dev\/null (commit|push) /, `hooks path not disabled: ${l.trim()}`);
    assert.match(l, /--no-verify/, `--no-verify missing: ${l.trim()}`);
  }
  // Mutation: the pre-change stamp (hooks on) fails the same check.
  const old = 'git commit --amend --no-edit --trailer "$ROUND_TRAILER_LINE"';
  assert.doesNotMatch(old, /git -c core\.hooksPath=\/dev\/null commit /);
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// Permissions
// ═════════════════════════════════════════════════════════════════════════════════════════

// The HIGH finding on PR #179's second review, pinned so it cannot come back. The fixer and
// the card writer are models told to read PR comments as input, so on a non-fork PR anyone who
// can comment can address them. This file used to declare ONE workflow-level block holding
// `pull-requests: write` and `issues: write`, and every job inherited it — which put both
// scopes in the GITHUB_TOKEN those sessions were handed. An injected comment could then have
// run `gh pr review --approve`, `gh pr close`, or `gh pr edit --remove-label flow:needs-human`
// to re-arm a PR a human had deliberately stopped. The fix is structural, not a prompt rule:
// the write scopes moved onto jobs that run no model, and the model jobs hold reads only.
//
// MODEL_JOBS and WRITER_JOBS are asserted to be disjoint and to cover every job that is one or
// the other, so adding a model call to a job holding writes fails here rather than in the wild.
// FLOW_PAT is a write (flow-0135): it can push and re-ready, so the job holding it is a writer.
const MODEL_JOBS = ["fix", "card", "round-card"];
const WRITER_JOBS = ["undraft", "push", "escalate-round", "escalate"];
const CARD_POSTERS = ["escalate-round", "escalate"];
const WRITE_SCOPES = ["write", "admin"];
const writes = (perms) =>
  Object.entries(perms ?? {}).filter(([, v]) => WRITE_SCOPES.includes(v)).map(([k]) => k);
const holdsPat = (job) => /secrets\.FLOW_PAT(?!\s*!=)/.test(JSON.stringify(job));
const runsAModel = (job) =>
  (job.steps ?? []).some((st) => /claude-code-action/.test(st.uses ?? ""));

test("no job that runs a model holds a write scope — not one, not even issues:", { skip }, () => {
  const wf = parse(REUSABLE);
  const found = Object.entries(wf.jobs).filter(([, j]) => runsAModel(j)).map(([n]) => n);
  assert.deepEqual(found.sort(), [...MODEL_JOBS].sort(),
    "an empty or unexpected scan is a failure, not a pass — this test exists to find the model jobs and check their tokens");
  for (const name of found) {
    const perms = wf.jobs[name].permissions;
    assert.ok(perms, `${name} must declare its own permissions; inheriting the workflow default is how this finding happened`);
    assert.deepEqual(writes(perms), ["id-token"],
      `${name} runs a model over PR comments and holds a write scope. id-token: write is OIDC minting and reaches nothing in this repo; any other write — pull-requests, issues, contents — is one injected comment away from \`gh pr review --approve\`, \`gh pr close\` or removing the flow:needs-human label.`);
    assert.equal(perms["pull-requests"], "read",
      `${name}'s prompt tells it to read the reviewers' verdicts, so it needs pull-requests: READ and must never have write`);
  }
});

test("the jobs that hold the write scopes run no model at all", { skip }, () => {
  const wf = parse(REUSABLE);
  const found = Object.entries(wf.jobs)
    .filter(([, j]) => writes(j.permissions).some((sc) => sc !== "id-token") || holdsPat(j)).map(([n]) => n);
  assert.deepEqual(found.sort(), [...WRITER_JOBS].sort(),
    "an empty or unexpected scan is a failure, not a pass");
  for (const name of found) {
    assert.ok(!runsAModel(wf.jobs[name]),
      `${name} holds a write scope or FLOW_PAT, so it may not run a model — the undraft, the push, the card and the label are fixed shell over values that arrive through env: or a file`);
  }
  // The model jobs hold neither.
  for (const name of MODEL_JOBS) assert.ok(!holdsPat(wf.jobs[name]), `${name} runs a model and references FLOW_PAT`);
  // And the split is total: no job is in neither list but holds a write, and none is in both.
  assert.deepEqual(MODEL_JOBS.filter((j) => WRITER_JOBS.includes(j)), []);
});

test("the model's hand-back crosses the job boundary as base64, never as raw text", { skip }, () => {
  const wf = parse(REUSABLE);
  // Splitting the model off from the poster means outcome.json has to travel between runners.
  // Every field in it is model-written, so it travels in an alphabet that cannot carry a quote,
  // a newline, a backtick or a `$` — the same reason `facts` base64s commit messages.
  // The round's hand-back now reaches `push` inside the artifact (as a file, like the bundle), and
  // `push` is what carries it on to the card poster — so `push` is its encoder (flow-0135).
  const PRODUCERS = ["push", "card", "round-card"];
  for (const producer of PRODUCERS) {
    assert.ok(wf.jobs[producer].outputs?.handback,
      `${producer} must expose the hand-back as a job output; there is no shared filesystem between jobs`);
  }
  const encoders = PRODUCERS.flatMap((j) => steps(wf, j))
    .filter((st) => typeof st.run === "string" && /base64/.test(st.run));
  assert.equal(encoders.length, PRODUCERS.length, "one encoder per producing job");
  for (const st of encoders) {
    assert.match(st.run, /base64 -w0/, "the hand-back is encoded, not echoed");
    assert.match(st.run, /head -c \d+/, "a job output is bounded; an unbounded one fails the run instead of falling back");
    assert.match(st.if ?? "", /always\(\)/, "a round that failed its guard is exactly when the hand-back is needed");
  }
  const decoders = CARD_POSTERS.flatMap((j) => steps(wf, j))
    .filter((st) => typeof st.run === "string" && /base64 -d/.test(st.run));
  assert.equal(decoders.length, 2, "one decoder per card-posting job");
  for (const st of decoders) {
    assert.match(st.run, /base64 -d > "\$handback"/,
      "decoded into a FILE, which is what the card renderer reads — never into a shell word");
    assert.match(st.run, /flow-kickback\.mjs card "\$handback"/,
      "and the file the renderer reads is the one that was just decoded");
  }
});

test("every job declares its own permissions, and the file's default is read-only", { skip }, () => {
  const wf = parse(REUSABLE);
  assert.deepEqual(wf.permissions, { contents: "read" },
    "the top-level block is the FLOOR, not the budget: a job added later is read-only until someone writes a block saying otherwise. A workflow-level write is a write every job gets, which is the shape of the finding this file was kicked back for.");
  for (const [name, job] of Object.entries(wf.jobs)) {
    assert.ok(job.permissions, `${name} inherits the workflow default instead of saying what it needs`);
    for (const scope of ["workflows", "packages", "deployments", "security-events"]) {
      assert.ok(!(scope in job.permissions), `${name} grants ${scope}: but no step uses it`);
    }
    assert.notEqual(job.permissions.contents, "write",
      `${name}: contents: write is write access to the DEFAULT branch. The round count lives on the PR so that this grant is never needed anywhere in this file.`);
    assert.notEqual(job.permissions.actions, "write",
      `${name}: nothing here re-runs or cancels a workflow`);
  }
  // `actions: read` is one job's, for one API call, and no other job can reach the Actions API.
  const withActions = Object.entries(wf.jobs).filter(([, j]) => j.permissions.actions).map(([n]) => n);
  assert.deepEqual(withActions, ["plan"],
    "the jobs API (`.../actions/runs/<id>/jobs`) is how `plan` learns WHICH review job failed, and it is the only step in the file that needs the Actions API at all");
  assert.match(steps(wf, "plan").find((st) => st.id === "failed").run, /actions\/runs\/\$RUN_ID\/jobs/,
    "the grant has to be justified by a call that actually exists, or it is an over-grant with a comment");
});

test("both callers grant exactly the UNION of the reusable's job permissions", { skip }, () => {
  const wf = parse(REUSABLE);
  // A reusable can never raise a scope above its caller's, so the caller grants the union —
  // and the reusable then hands each job only its own share. The union is what the test
  // computes rather than what it hardcodes, so a job that quietly needs more fails here.
  const rank = { read: 1, write: 2, admin: 3 };
  const union = {};
  for (const job of Object.values(wf.jobs)) {
    for (const [scope, level] of Object.entries(job.permissions ?? {})) {
      if (!union[scope] || rank[level] > rank[union[scope]]) union[scope] = level;
    }
  }
  for (const file of [CANON_CALLER, TEMPLATE_CALLER]) {
    const jobs = Object.values(parse(file).jobs);
    assert.equal(jobs.length, 1, `${file} must be a thin caller: exactly one job`);
    assert.deepEqual(jobs[0].permissions, union,
      `${file}: a caller that grants less silently 403s the job that needed it, and one that grants more hands the extra to every job in the reusable. id-token is never in the default GITHUB_TOKEN, so it has to be here.`);
    assert.ok(!("workflows" in jobs[0].permissions), `${file}: workflows: is not a grantable GITHUB_TOKEN permission and would never take effect`);
  }
});

test("both callers forward the two secrets by name rather than inheriting every secret", { skip }, () => {
  for (const file of [CANON_CALLER, TEMPLATE_CALLER]) {
    const job = Object.values(parse(file).jobs)[0];
    assert.notEqual(job.secrets, "inherit", `${file}: inherit would hand this job every configured secret`);
    assert.deepEqual(Object.keys(job.secrets).sort(), ["CLAUDE_CODE_OAUTH_TOKEN", "FLOW_PAT"], file);
    for (const [k, v] of Object.entries(job.secrets)) assert.equal(v, `\${{ secrets.${k} }}`, file);
  }
  const declared = Object.keys(parse(REUSABLE).on.workflow_call.secrets);
  assert.deepEqual(declared.sort(), ["CLAUDE_CODE_OAUTH_TOKEN", "FLOW_PAT"],
    "GitHub rejects an undeclared named secret at call time, which fails the whole run in every adopting repo at once");
});

test("the canonical caller pins @main and the template caller pins the current major", { skip }, () => {
  const major = readFileSync(join(REPO, "VERSION"), "utf8").trim().split(".")[0];
  assert.match(src(CANON_CALLER), /_flow-kickback\.yml@main/);
  assert.ok(src(TEMPLATE_CALLER).includes(`_flow-kickback.yml@v${major}`),
    `the published caller must pin @v${major}, matching root VERSION — a caller a major behind is the flow-0056 split brain`);
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// Untrusted input never reaches a `run:` block
// ═════════════════════════════════════════════════════════════════════════════════════════

test("no `run:` block interpolates anything — every value arrives through env: or a file", { skip }, () => {
  const offenders = [];
  for (const [name, job] of Object.entries(parse(REUSABLE).jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== "string") continue;
      for (const m of step.run.matchAll(/\$\{\{([^}]*)\}\}/g)) {
        offenders.push(`${name}/${step.id ?? step.name}: \${{${m[1]}}}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    "a PR title, a branch name, a reviewer's comment and every field of the round's own outcome.json are attacker- or model-controlled text. They reach the shell through `env:` or a file, never through an expansion GitHub performs before the shell ever sees it.");
});

test("the PR's own strings are read out of a JSON file with jq, never expanded by the shell", { skip }, () => {
  const plan = steps(parse(REUSABLE), "plan");
  const facts = plan.find((s) => s.id === "facts");
  for (const field of ["headRefName", "title"]) {
    assert.match(facts.run, new RegExp(`jq -r \\.${field}`), `${field} must come out of the JSON file`);
  }
  // The decision card is handed to `gh` as a FILE, never as an argument.
  for (const run of allRuns(parse(REUSABLE)).filter((r) => /gh pr comment/.test(r))) {
    assert.match(run, /gh pr comment "\$PR_NUMBER" --body-file "\$card"/,
      "--body with an interpolated string would put model-written text on a command line");
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// Escalation: a card, then the label — on every path
// ═════════════════════════════════════════════════════════════════════════════════════════

const labelSteps = (wf) =>
  Object.entries(wf.jobs).flatMap(([job, j]) => (j.steps ?? [])
    .filter((s) => typeof s.run === "string" && s.run.includes("--add-label"))
    .map((s) => ({ job, step: s })));

test("every path that adds flow:needs-human posts a card first — no path adds the label alone", { skip }, () => {
  const found = labelSteps(parse(REUSABLE));
  assert.ok(found.length >= 2,
    "both escalation paths — the dead/blocked round, and the escalations plan itself decided — must post a card");
  for (const { job, step } of found) {
    assert.match(step.run, /flow-kickback\.mjs" card|flow-kickback\.mjs card/,
      `${job}: the card must be rendered by decisionCard, so a malformed recommendation falls back visibly instead of posting nonsense`);
    assert.ok(step.run.includes(NEEDS_HUMAN_LABEL), `${job}: the label must be the one the helper names`);
    assert.ok(step.run.indexOf("gh pr comment") < step.run.indexOf("--add-label"),
      `${job}: the card is posted BEFORE the label, so a failed comment never leaves a bare label — the "12 questions" problem this replaces`);
  }
});

// A `||` after a command that cannot fail is dead code that reads like a safety net, and here it
// read like a SECOND rendering path for an unreadable hand-back. There is no second path: `card`
// catches its own read and parse errors and renders the fallback card, exiting 0 either way. The
// `||` hid that the fallback is the only thing on both sides of it.
test("no card step guards its render with a dead `||` — the card command cannot fail", { skip }, () => {
  const cardSteps = Object.entries(parse(REUSABLE).jobs).flatMap(([job, j]) => (j.steps ?? [])
    .filter((st) => typeof st.run === "string" && /flow-kickback\.mjs"? card/.test(st.run))
    .map((st) => ({ job, step: st })));
  assert.ok(cardSteps.length >= 2, "an empty scan is a failure, not a pass — both escalation paths render a card");
  for (const { job, step } of cardSteps) {
    const renders = step.run.split("\n").filter((l) => /flow-kickback\.mjs"? card/.test(l) && !l.trim().startsWith("#"));
    assert.equal(renders.length, 1,
      `${job}: the card is rendered once; a second invocation behind \`||\` never runs, because \`card\` always exits 0`);
    assert.doesNotMatch(renders[0], /\|\|/,
      `${job}: \`card\` renders the fallback and exits 0 on a missing or unparseable hand-back, so a \`||\` branch after it is unreachable`);
  }
});

test("a round that died part-way still escalates — the if: always() backstop", { skip }, () => {
  const wf = parse(REUSABLE);
  // The backstop is now a JOB, because posting the card needs `pull-requests: write` and the
  // job that ran the model must not have it. `always()` on the job is what makes it fire for
  // every exit, including the ones nobody predicted: a failed guard, a crashed action, a
  // cancelled job, and — new with the split — an `undraft` that never succeeded, which skips
  // `fix` and `push` entirely and leaves `needs.push.outputs.pushed` empty.
  const job = wf.jobs["escalate-round"];
  assert.ok(job, "the dead-round backstop must be a job of its own");
  assert.match(job.if, /always\(\)/,
    "a crashed or cancelled round must not leave a draft PR that nothing is watching");
  assert.match(job.if, /needs\.push\.outputs\.pushed != 'true'/,
    "a round that pushed is not an escalation — the reviewers get it next");
  assert.match(job.if, /needs\.plan\.outputs\.action == 'dispatch'/,
    "and a run that never dispatched a round has nothing to escalate here");
  assert.deepEqual(job.needs, ["plan", "push", "round-card"],
    "it needs `push` for the verdict, `plan` for the PR and `round-card` for a dead round's four fields — and `needs` plus `always()` is what makes it run when any of them was skipped");
  // Each guard's own sentence is what the card leads with, so the human is told WHICH check
  // fired. The sentences now cross a job boundary: guard -> the `verdict` step's output ->
  // the job output -> this job's env. Every link is asserted, because a broken one is silent.
  const verdict = steps(wf, "push").find((st) => st.id === "verdict");
  assert.ok(verdict, "the push job must carry the sentence out as a job output");
  for (const id of GUARD_ORDER) {
    const step = steps(wf, "push").find((st) => st.id === id);
    assert.match(step.run, /amend=/, `\`${id}\` must write the sentence its own failure puts on the card`);
    assert.ok(Object.values(verdict.env).some((v) => String(v).includes(`${id}.outputs.amend`)),
      `\`${id}\`'s sentence must reach the step that carries it out of the job`);
  }
  assert.match(wf.jobs.push.outputs.amend, /steps\.verdict\.outputs\.amend/);
  const post = (job.steps ?? []).find((st) => typeof st.run === "string" && st.run.includes("--add-label"));
  assert.ok(Object.values(post.env).some((v) => String(v).includes("needs.push.outputs.amend")),
    "and the job output must actually reach the card");
  assert.match(post.run, /\$\{ROUND_AMEND:-[^}]+\}/,
    "a `fix` that never reached its verdict step hands this job an empty sentence, and a card whose lead line is blank tells the human nothing — the shell default is the honest account of that case");
});

// The BLOCKING finding on PR #179's third review, pinned so it cannot come back. The task's Scope
// splits escalations in two: a dispute, or a round a later guard stopped, is described by the
// round's OWN hand-back; "every other escalation (security, exhausted, DID NOT HAND BACK) runs one
// bounded, read-only model call". `decide` can never return `escalate` for a dead round — that is a
// round-level fact discovered inside `fix`, long after `decide` said `dispatch` — so the `card`
// job could not reach it, and the human got the context-free fallback card ("recommendation
// unavailable") for the one case that most needs a recommendation: a round that crashed.
test("a round that handed nothing back gets the read-only model call, not the fallback card", { skip }, () => {
  const wf = parse(REUSABLE);
  const job = wf.jobs["round-card"];
  assert.ok(job,
    "the dead round's card needs a job of its own: `decide` returns `escalate` only for security and the exhausted cap, so `card` is structurally unreachable from inside a dispatched round");

  // It fires for exactly the dead-round case: dispatched, nothing pushed, no usable hand-back.
  assert.match(job.if, /always\(\)/,
    "a `fix` that crashed, timed out or was cancelled never reports success — `always()` is the only thing that reaches it");
  assert.match(job.if, /needs\.plan\.outputs\.action == 'dispatch'/);
  assert.match(job.if, /needs\.push\.outputs\.pushed != 'true'/, "a round that pushed is not an escalation at all");
  assert.match(job.if, /needs\.push\.outputs\.handback_ok != 'true'/,
    "and a round that DID hand back describes itself; the model call is for the round that could not");
  assert.deepEqual(job.needs, ["plan", "push"]);

  // `handback_ok` is the routing fact, and it is true only for a hand-back that parsed and named
  // an outcome the protocol knows. That keeps a guard-stopped round on its own four fields and
  // sends every other exit here, which is the Scope's split rather than a second one.
  assert.match(wf.jobs.push.outputs.handback_ok, /steps\.verdict\.outputs\.handback_ok/,
    "the fact has to leave the `push` job as an output, or no `if:` can read it");
  const verdict = steps(wf, "push").find((st) => st.id === "verdict");
  assert.ok(Object.values(verdict.env).some((v) => String(v).includes("check-outcome.outputs.outcome")),
    "and it must be derived from the guard that actually parsed the hand-back, not re-parsed in YAML");
  assert.match(verdict.run, /fixed\|disputed\)\s*printf 'handback_ok=true/,
    "`fixed` and `disputed` are the two outcomes the round can describe itself with");
  assert.match(verdict.run, /\*\)\s*printf 'handback_ok=false/,
    "and the catch-all is the dead round: no file, unparseable JSON, or an outcome nobody knows");

  // It is a READ-ONLY model call on the DEFAULT branch, with `card`'s bounds. The token is what
  // actually holds it (the write-scope tests above cover that); this is what it was asked not to do.
  const model = (job.steps ?? []).find((s) => /claude-code-action/.test(s.uses ?? ""));
  assert.ok(model, "the model call IS the fix for this finding — a job here that renders a card in shell changes nothing");
  for (const forbidden of ["git push", "git commit", "gh pr ready", "gh pr merge", "gh pr edit", "gh pr comment"]) {
    assert.ok(model.with.claude_args.includes(`Bash(${forbidden}:*)`),
      `the dead round's card writer must not be able to run \`${forbidden}\` — it writes a card, it does not act`);
  }
  assert.match(model.with.prompt, /DO NOT fix anything/, "this is not a second auto-fix round wearing a card's clothes");
  for (const [re, what] of [[/--comments/, "the reviewers' verdicts"], [/gh pr diff/, "what the PR changes"],
                            [/json commits/, "the round history"]]) {
    assert.match(model.with.prompt, re,
      `the card is built by reading ${what} — reading the PR is the whole difference between a recommendation and a shrug`);
  }
  assert.ok(Object.values(model.with).some((v) => String(v).includes("needs.push.outputs.amend")),
    "and it must be told WHAT stopped the round, or its card re-describes a failure it cannot see");
  const checkout = (job.steps ?? []).find((s) => /actions\/checkout@/.test(s.uses ?? ""));
  assert.match(checkout.with.ref, /default_branch/,
    "a card written about a PR must not run that PR's code (flow-0079's rule)");

  // And what it writes reaches the human: `escalate-round` posts the round's own hand-back when
  // there is one, and this job's when there is not.
  const post = steps(wf, "escalate-round").find((st) => typeof st.run === "string" && st.run.includes("--add-label"));
  const b64 = String(post.env.HANDBACK_B64);
  assert.match(b64, /needs\.push\.outputs\.handback_ok == 'true' && needs\.push\.outputs\.handback/,
    "a round that handed back keeps its own four fields — it is the only thing that knows what it tried");
  assert.match(b64, /needs\['round-card'\]\.outputs\.handback/,
    "and a dead round gets the four fields the read-only model call wrote");
  assert.ok((wf.jobs["escalate-round"].needs ?? []).includes("round-card"),
    "a job output cannot be read from a job this one does not `needs`, so the fallback would be silently empty");
});

test("the card writer never checks out the PR's code and its model call cannot write to the PR", { skip }, () => {
  const job = parse(REUSABLE).jobs.card;
  const checkout = (job.steps ?? []).find((s) => /actions\/checkout@/.test(s.uses ?? ""));
  assert.match(checkout.with.ref, /default_branch/,
    "a security escalation must not run anything out of the PR it is escalating");
  const model = (job.steps ?? []).find((s) => /claude-code-action/.test(s.uses ?? ""));
  for (const forbidden of ["git push", "git commit", "gh pr ready", "gh pr merge", "gh pr edit", "gh pr comment"]) {
    assert.ok(model.with.claude_args.includes(`Bash(${forbidden}:*)`),
      `the card writer must not be able to run \`${forbidden}\` — it writes a card, it does not act`);
  }
  assert.match(model.with.prompt, /DO NOT fix anything/);
  // And the job it hands the card to is the one that posts it, so the deny-list above is not
  // the only thing standing between a model and a PR comment: the token is (see the
  // write-scope tests). `escalate` carries the write scopes and runs no model.
  assert.deepEqual(parse(REUSABLE).jobs.escalate.needs, ["plan", "card"]);
});

test("the security escalation never routes through the fix job", { skip }, () => {
  const wf = parse(REUSABLE);
  assert.match(wf.jobs.fix.if, /action == 'dispatch'/);
  assert.match(wf.jobs.undraft.if, /action == 'dispatch'/,
    "the draft toggle is the round's first act, so it is fenced by the same decision");
  assert.match(wf.jobs.card.if, /action == 'escalate'/);
  assert.match(wf.jobs.escalate.if, /action == 'escalate'/);
  assert.ok(!/security/.test(wf.jobs.fix.if ?? ""),
    "the security fence is in `decide`, where it is unit-tested, and must not be duplicated as a second YAML condition that can disagree with it");
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// Config, docs and the changelog fragment
// ═════════════════════════════════════════════════════════════════════════════════════════

const TEMPLATE_CONFIG = join(REPO, "project-template", ".flow", "config.yml");
const CANON_CONFIG = join(REPO, ".flow", "config.yml");
const DOCS = join(REPO, "docs", "flow-reusable-workflows.md");

// Canonical dogfoods the thing it ships. flow-0134 held it at 0 while the fixer and FLOW_PAT shared
// a job; flow-0135 split them and re-armed it (kickback-credential-boundary.test.mjs keeps the two
// facts tied together).
test("the template ships auto_fix_rounds COMMENTED OUT; canonical arms it at 2 (flow-0135)", () => {
  const template = src(TEMPLATE_CONFIG).split("\n")
    .filter((l) => l.includes("auto_fix_rounds:"));
  assert.ok(template.length > 0, "the template must document the key, or an adopting repo never learns it exists");
  for (const line of template) {
    assert.match(line.trim(), /^#/,
      `project-template/.flow/config.yml must ship auto-fix OFF: "${line.trim()}" is live`);
  }
  const live = src(CANON_CONFIG).split("\n")
    .map((l) => l.trim()).filter((l) => /^auto_fix_rounds:/.test(l));
  assert.deepEqual(live, ["auto_fix_rounds: 2"],
    "canonical is re-armed now that FLOW_PAT is out of the model's job (flow-0135)");
});

// flow-0135's changelog fragment, read through changelogEntry so it survives the release that
// folds it into CHANGELOG.md.
test("flow-0135's changelog entry states the caller action and the step-vs-job root cause", () => {
  const text = changelogEntry(REPO, "flow-0135");
  assert.ok(text.length > 0, "the entry must exist");
  assert.match(text, /flow-0135\)/, "the bullet's file list must end `, flow-0135)`");
  assert.match(text, /caller action/i, "an adopting repo has to be told whether it must do something");
  assert.match(text, /\bstep\b[\s\S]*\bjob\b/i, "the root cause: the invariant was stated per step; the boundary is the job");
  assert.match(text, /FLOW_PAT/);
});

test("the template's commented key explains the hard maximum and the FLOW_PAT requirement", () => {
  const text = src(TEMPLATE_CONFIG);
  const block = text.slice(text.indexOf("auto-fix round (flow-0082)"), text.indexOf("# auto_fix_rounds: 2"));
  assert.ok(block.length > 200, "a key shipped off needs the paragraph that says what turning it on does");
  assert.match(block, new RegExp(`HARD MAXIMUM IS ${HARD_MAX_ROUNDS}`));
  assert.match(block, /FLOW_PAT/);
  assert.match(block, new RegExp(NEEDS_HUMAN_LABEL));
  assert.match(block, /SECURITY/);
});

test("docs/flow-reusable-workflows.md documents the workflow, the key, the label, the card and FLOW_PAT", () => {
  const doc = src(DOCS);
  assert.match(doc, /_flow-kickback\.yml/, "the reusable belongs in the table of reusables");
  assert.match(doc, /review\.auto_fix_rounds/, "the config key");
  assert.match(doc, new RegExp(NEEDS_HUMAN_LABEL), "the label");
  assert.match(doc, /decision card/i, "the card");
  assert.match(doc, /FLOW_PAT/, "the FLOW_PAT requirement");
  assert.match(doc, new RegExp(`${ROUND_TRAILER}`), "how a human reads the rounds used");
});

test("the template caller's header documents the same five things", () => {
  const header = src(TEMPLATE_CALLER);
  assert.match(header, /review\.auto_fix_rounds/);
  assert.match(header, new RegExp(NEEDS_HUMAN_LABEL));
  assert.match(header, /decision card/i);
  assert.match(header, /FLOW_PAT IS REQUIRED/);
  assert.match(header, /hard maximum is 3/i);
});

test("flow-0082's changelog entry exists and states the caller action", () => {
  // Read through changelogEntry, not off disk, and do not assert the FRAGMENT exists either:
  // assembling a release DELETES `changes/<id>.md` and folds it into CHANGELOG.md, so both
  // reading the fragment and asserting its existence are green until the next release and red on
  // the release's own PR (flow-0098). The entry is what must survive; the file it lives in is not.
  const text = changelogEntry(REPO, "flow-0082");
  assert.ok(text.length > 0, "the entry must survive the release that folds it into CHANGELOG.md");
  assert.match(text, /flow-0082\)/, "the bullet's file list must end `, flow-0082)` — that is how assembly finds it");
  assert.match(text, /caller action/i, "an adopting repo has to be told whether it must do something");
  assert.match(text, /flow-kickback\.yml/, "the new caller is the thing a repo adopts");
  assert.match(text, /auto_fix_rounds/, "and the key is how it opts in");
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// The adapter
// ═════════════════════════════════════════════════════════════════════════════════════════

test("canonical's .flow/bin/flow-kickback.mjs is an adapter, not a copy and not a symlink", () => {
  const adapter = src(join(BIN, "flow-kickback.mjs"));
  assert.match(adapter, /from "\.\.\/\.\.\/project-template\/\.flow\/bin\/flow-kickback\.mjs"/,
    "shared behaviour lives in the template, where every repo gets it; only the CLI shell belongs here");
  assert.ok(!/export function decide\b/.test(adapter), "a second copy of the decision logic is the flow-0008 hazard");
  assert.ok(!/export function weakensTests\b/.test(adapter));
  // The exported surface must actually resolve — an adapter that re-exports a name the template
  // dropped fails at import, which is the whole reason this import sits at the top of the file.
  assert.equal(typeof NEEDS_HUMAN_LABEL, "string");
  assert.equal(ROUND_TRAILER, "Flow-Auto-Fix-Round");
});

test("the reusable invokes the adapter by the path every consuming repo has it at", () => {
  const text = src(REUSABLE);
  assert.match(text, /\.flow\/bin\/flow-kickback\.mjs/);
  assert.ok(existsSync(join(BIN, "flow-kickback.mjs")),
    "a workflow canonical calls that invokes a helper canonical does not have dies at the first step");
  assert.match(text, /\.flow\/bin\/parse-task-id\.mjs/, "the id resolves the same way flow-status resolves it");
  assert.ok(existsSync(join(BIN, "parse-task-id.mjs")));
});
