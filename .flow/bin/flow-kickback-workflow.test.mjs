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

test("the reusable's permissions name only what its steps use, and never grant workflows:", { skip }, () => {
  const perms = parse(REUSABLE).permissions;
  assert.deepEqual(perms, { contents: "read", "pull-requests": "write", "id-token": "write" },
    "contents: read is the checkout; pull-requests: write is the draft toggle, the card and the label; id-token: write is OIDC for claude-code-action. Nothing else is used, so nothing else is granted.");
  for (const scope of ["workflows", "actions", "packages", "deployments", "security-events"]) {
    assert.ok(!(scope in perms), `${scope}: is granted but no step uses it`);
  }
  assert.notEqual(perms.contents, "write",
    "contents: write would be write access to the DEFAULT branch. The round count lives on the PR so that this grant is never needed.");
});

test("both callers grant exactly the reusable's permissions — a reusable cannot raise them", { skip }, () => {
  const wanted = parse(REUSABLE).permissions;
  for (const file of [CANON_CALLER, TEMPLATE_CALLER]) {
    const jobs = Object.values(parse(file).jobs);
    assert.equal(jobs.length, 1, `${file} must be a thin caller: exactly one job`);
    assert.deepEqual(jobs[0].permissions, wanted,
      `${file}: id-token is never in the default GITHUB_TOKEN and a reusable cannot raise a grant above its caller's`);
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

test("a round that died part-way still escalates — the if: always() backstop", { skip }, () => {
  const escalate = steps(parse(REUSABLE), "fix").find((s) => s.id === "escalate");
  assert.ok(escalate, "the fix job must carry its own escalation step");
  assert.match(escalate.if, /always\(\)/,
    "a crashed or cancelled round must not leave a draft PR that nothing is watching");
  assert.match(escalate.if, /stamp-and-push\.outputs\.pushed != 'true'/,
    "a round that pushed is not an escalation — the reviewers get it next");
  // Each guard's own sentence is what the card leads with, so the human is told WHICH check fired.
  for (const id of GUARD_ORDER) {
    const step = steps(parse(REUSABLE), "fix").find((s) => s.id === id);
    assert.match(step.run, /amend=/, `\`${id}\` must write the sentence its own failure puts on the card`);
    assert.ok(Object.values(escalate.env).some((v) => String(v).includes(`${id}.outputs.amend`)),
      `\`${id}\`'s sentence must actually reach the card`);
  }
});

test("the escalate job never checks out the PR's code and its model call cannot write to the PR", { skip }, () => {
  const job = parse(REUSABLE).jobs.escalate;
  const checkout = (job.steps ?? []).find((s) => /actions\/checkout@/.test(s.uses ?? ""));
  assert.match(checkout.with.ref, /default_branch/,
    "a security escalation must not run anything out of the PR it is escalating");
  const model = (job.steps ?? []).find((s) => /claude-code-action/.test(s.uses ?? ""));
  for (const forbidden of ["git push", "git commit", "gh pr ready", "gh pr merge", "gh pr edit", "gh pr comment"]) {
    assert.ok(model.with.claude_args.includes(`Bash(${forbidden}:*)`),
      `the card writer must not be able to run \`${forbidden}\` — it writes a card, it does not act`);
  }
  assert.match(model.with.prompt, /DO NOT fix anything/);
});

test("the security escalation never routes through the fix job", { skip }, () => {
  const wf = parse(REUSABLE);
  assert.match(wf.jobs.fix.if, /action == 'dispatch'/);
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
const FRAGMENT = join(REPO, "changes", "flow-0082.md");

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

test("changes/flow-0082.md exists and states the caller action", () => {
  assert.ok(existsSync(FRAGMENT), "every task that changes anything user-visible leaves a fragment");
  // Read through changelogEntry, not off disk: assembling a release DELETES the fragment, so a
  // test that reads `changes/<id>.md` is green until the next release and red on the release's
  // own PR. The protocol names this trap by name.
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
