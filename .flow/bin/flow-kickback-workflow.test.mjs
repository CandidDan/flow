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
import { existsSync, readFileSync } from "node:fs";
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

test("FLOW_PAT reaches exactly one step — stamp-and-push, after every guard", { skip }, () => {
  const wf = parse(REUSABLE);
  const holders = [];
  for (const [job, j] of Object.entries(wf.jobs)) {
    for (const step of j.steps ?? []) {
      const refs = [...Object.entries(step.env ?? {}), ...Object.entries(step.with ?? {})]
        .filter(([, v]) => /secrets\.FLOW_PAT(?!\s*!=)/.test(String(v)));
      if (refs.length) holders.push({ job, id: step.id ?? step.name, keys: refs.map(([k]) => k) });
    }
  }
  assert.deepEqual(holders.map((h) => h.id), ["stamp-and-push"],
    `FLOW_PAT must reach one step and one only; found: ${JSON.stringify(holders)}`);
  // And that step runs after all four guards, which the ordering test above already pins. What
  // is pinned here is that no guard, no card step and no fixer step is on the list at all.
  const ids = steps(wf, "fix").map((s) => s.id).filter(Boolean);
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

const GUARD_ORDER = ["check-outcome", "check-remote-head", "check-weakens", "check-commits"];

test("the push happens only after the four checks, in the stated order", { skip }, () => {
  const ids = steps(parse(REUSABLE), "fix").map((s) => s.id).filter(Boolean);
  const at = (id) => {
    const i = ids.indexOf(id);
    assert.notEqual(i, -1, `the fix job must have a step with id \`${id}\``);
    return i;
  };
  const order = GUARD_ORDER.map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b),
    `the guards must run in the order the task states: ${GUARD_ORDER.join(" -> ")}`);
  for (const id of GUARD_ORDER) {
    assert.ok(at(id) < at("stamp-and-push"),
      `\`${id}\` must run BEFORE anything is pushed — a check after the push is not a check`);
  }
  assert.ok(at("worker") < at(GUARD_ORDER[0]), "the guards judge the round, so they run after it");
});

test("no guard pipes its verdict into tee — a pipeline reports the LAST command's status", { skip }, () => {
  for (const step of steps(parse(REUSABLE), "fix")) {
    if (!GUARD_ORDER.includes(step.id)) continue;
    assert.doesNotMatch(step.run, /flow-kickback\.mjs[^\n|]*\|\s*tee/,
      `\`${step.id}\` pipes the guard into tee, so the step would see tee's exit code 0 and the guard would never trip`);
  }
});

test("the guard runs the DEFAULT branch's copy of the helper, not the PR's", { skip }, () => {
  const fix = steps(parse(REUSABLE), "fix");
  const weakens = fix.find((s) => s.id === "check-weakens");
  assert.match(weakens.run, /KICKBACK_BIN/,
    "running `.flow/bin/flow-kickback.mjs` from the PR checkout would let a round edit the check about to judge it (flow-0079's rule)");
  const materialise = fix.find((s) => /worktree add/.test(s.run ?? ""));
  assert.ok(materialise, "the default-branch copy has to be materialised from somewhere");
  assert.match(materialise.run, /GUARD_SHA/,
    "the guard's commit must be pinned by SHA resolved BEFORE the fixer ran — a SHA is content-addressed and cannot be made to name a different tree");
  assert.ok(fix.indexOf(fix.find((s) => s.id === "base")) < fix.indexOf(fix.find((s) => s.id === "worker")),
    "the guard SHA is recorded before the fixer gets the runner");
});

test("the pushed head carries the round trailer, stamped by the workflow and not by the fixer", { skip }, () => {
  const push = steps(parse(REUSABLE), "fix").find((s) => s.id === "stamp-and-push");
  const amendAt = push.run.indexOf("git commit --amend");
  const pushAt = push.run.indexOf("git push");
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
    .filter((l) => /\bgit push\b/.test(l) && !l.trim().startsWith("#"));
  assert.equal(pushes.length, 1, `expected exactly one push; found:\n${pushes.join("\n")}`);
  assert.match(pushes[0], /"HEAD:\$HEAD_REF"/,
    "the only branch this workflow writes to is the PR's own — the round count lives on the PR precisely so the default branch needs no write at all");
  const commits = allRuns(parse(REUSABLE)).join("\n").split("\n")
    .filter((l) => /\bgit commit\b/.test(l) && !l.trim().startsWith("#"));
  assert.equal(commits.length, 1, "the ONE amend is the only commit this workflow makes");
  assert.match(commits[0], /--amend --no-edit/);
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
const MODEL_JOBS = ["fix", "card"];
const WRITER_JOBS = ["undraft", "escalate-round", "escalate"];
const WRITE_SCOPES = ["write", "admin"];
const writes = (perms) =>
  Object.entries(perms ?? {}).filter(([, v]) => WRITE_SCOPES.includes(v)).map(([k]) => k);
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
    .filter(([, j]) => writes(j.permissions).some((sc) => sc !== "id-token")).map(([n]) => n);
  assert.deepEqual(found.sort(), [...WRITER_JOBS].sort(),
    "an empty or unexpected scan is a failure, not a pass");
  for (const name of found) {
    assert.ok(!runsAModel(wf.jobs[name]),
      `${name} holds a write scope, so it may not run a model — the undraft, the card and the label are fixed shell over values that arrive through env: or a file`);
  }
  // And the split is total: no job is in neither list but holds a write, and none is in both.
  assert.deepEqual(MODEL_JOBS.filter((j) => WRITER_JOBS.includes(j)), []);
});

test("the model's hand-back crosses the job boundary as base64, never as raw text", { skip }, () => {
  const wf = parse(REUSABLE);
  // Splitting the model off from the poster means outcome.json has to travel between runners.
  // Every field in it is model-written, so it travels in an alphabet that cannot carry a quote,
  // a newline, a backtick or a `$` — the same reason `facts` base64s commit messages.
  for (const [producer, out] of [["fix", "handback"], ["card", "handback"]]) {
    assert.ok(wf.jobs[producer].outputs?.[out],
      `${producer} must expose the hand-back as a job output; there is no shared filesystem between jobs`);
  }
  const encoders = MODEL_JOBS.flatMap((j) => steps(wf, j))
    .filter((st) => typeof st.run === "string" && /base64/.test(st.run));
  assert.equal(encoders.length, 2, "one encoder per model job");
  for (const st of encoders) {
    assert.match(st.run, /base64 -w0/, "the hand-back is encoded, not echoed");
    assert.match(st.run, /head -c \d+/, "a job output is bounded; an unbounded one fails the run instead of falling back");
    assert.match(st.if ?? "", /always\(\)/, "a round that failed its guard is exactly when the hand-back is needed");
  }
  const decoders = WRITER_JOBS.flatMap((j) => steps(wf, j))
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
  // `fix` entirely and leaves `needs.fix.outputs.pushed` empty.
  const job = wf.jobs["escalate-round"];
  assert.ok(job, "the dead-round backstop must be a job of its own");
  assert.match(job.if, /always\(\)/,
    "a crashed or cancelled round must not leave a draft PR that nothing is watching");
  assert.match(job.if, /needs\.fix\.outputs\.pushed != 'true'/,
    "a round that pushed is not an escalation — the reviewers get it next");
  assert.match(job.if, /needs\.plan\.outputs\.action == 'dispatch'/,
    "and a run that never dispatched a round has nothing to escalate here");
  assert.deepEqual(job.needs, ["plan", "fix"],
    "it needs `fix` for the verdict and `plan` for the PR — and `needs` plus `always()` is what makes it run when `fix` was skipped");
  // Each guard's own sentence is what the card leads with, so the human is told WHICH check
  // fired. The sentences now cross a job boundary: guard -> the `verdict` step's output ->
  // the job output -> this job's env. Every link is asserted, because a broken one is silent.
  const verdict = steps(wf, "fix").find((st) => st.id === "verdict");
  assert.ok(verdict, "the fix job must carry the sentence out as a job output");
  for (const id of GUARD_ORDER) {
    const step = steps(wf, "fix").find((st) => st.id === id);
    assert.match(step.run, /amend=/, `\`${id}\` must write the sentence its own failure puts on the card`);
    assert.ok(Object.values(verdict.env).some((v) => String(v).includes(`${id}.outputs.amend`)),
      `\`${id}\`'s sentence must reach the step that carries it out of the job`);
  }
  assert.match(wf.jobs.fix.outputs.amend, /steps\.verdict\.outputs\.amend/);
  const post = (job.steps ?? []).find((st) => typeof st.run === "string" && st.run.includes("--add-label"));
  assert.ok(Object.values(post.env).some((v) => String(v).includes("needs.fix.outputs.amend")),
    "and the job output must actually reach the card");
  assert.match(post.run, /\$\{ROUND_AMEND:-[^}]+\}/,
    "a `fix` that never reached its verdict step hands this job an empty sentence, and a card whose lead line is blank tells the human nothing — the shell default is the honest account of that case");
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

test("the template ships auto_fix_rounds COMMENTED OUT; canonical sets it to 2", () => {
  const template = src(TEMPLATE_CONFIG).split("\n")
    .filter((l) => l.includes("auto_fix_rounds:"));
  assert.ok(template.length > 0, "the template must document the key, or an adopting repo never learns it exists");
  for (const line of template) {
    assert.match(line.trim(), /^#/,
      `project-template/.flow/config.yml must ship auto-fix OFF: "${line.trim()}" is live`);
  }
  const live = src(CANON_CONFIG).split("\n")
    .map((l) => l.trim()).filter((l) => /^auto_fix_rounds:/.test(l));
  assert.deepEqual(live, ["auto_fix_rounds: 2"], "canonical dogfoods the thing it ships, at 2");
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
