// flow-review-workflow.test.mjs — proving tests for the review gate's WIRING (flow-0007).
//
// `flow-review.test.mjs` (in the template's bin/) proves the logic: the security decision, the
// bounded context, the fail-closed verdict. This file proves the other half — that the workflow
// actually wires that logic up, and that the properties which are structural rather than
// behavioural hold. Those are exactly the ones that rot quietly: a model name pasted back into
// the workflow, a branch fence re-added, a verdict step that stops running when the reviewer
// dies. None of them break anything visibly; they just make the gate stop being a gate.
//
// DEPENDENCY NOTE — see check-workflows.test.mjs. `_flow-gates.yml`'s `flow-tooling` job runs
// `node --test .flow/bin/*.test.mjs` with no install step; these tests need `yaml` to read a
// workflow the way GitHub does. They skip visibly there and run for real in the per-stack job.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { changelogEntry } from "./changelog-entry.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const REUSABLE = join(REPO, ".github/workflows/_flow-review.yml");
const CALLER = join(TEMPLATE, ".github/workflows/flow-review.yml");
const QUEUE_RUNNER = join(REPO, ".github/workflows/_flow-queue-runner.yml");

const reusableSrc = readFileSync(REUSABLE, "utf8");
const wf = yamlMod ? yamlMod.parse(reusableSrc) : { jobs: {} };
const REVIEW_JOBS = ["qa", "code-review", "security"];
// flow-0084 added a fifth job, `guide`. It is NOT a review job — it blocks nothing and posts no
// verdict — but it does materialise the base gate and run `plan`, so it belongs in HELPER_JOBS and
// in every assertion about where the helper comes from. The distinction is load-bearing: a `guide`
// that crept into REVIEW_JOBS would be asserted to carry a verdict step and to block the PR.
const GUIDE_JOB = "guide";
const HELPER_JOBS = ["plan", ...REVIEW_JOBS, GUIDE_JOB];

// flow-0079: the helper is no longer invoked by its path in the checkout. `$FLOW_REVIEW_DIR` is
// written to $GITHUB_ENV by the materialise step and points at the BASE branch's copy — so these
// are what "a plan invocation" and "a verdict invocation" now look like.
const PLAN_RUN = /node "\$FLOW_REVIEW_DIR"\/flow-review\.mjs plan\b/;
const VERDICT_RUN = /node "\$FLOW_REVIEW_DIR"\/flow-review\.mjs verdict\b/;
const stepsOf = (job) => wf.jobs[job]?.steps ?? [];
const allSteps = () => Object.values(wf.jobs ?? {}).flatMap((j) => j.steps ?? []);
const materialiseStep = (job) =>
  stepsOf(job).find((s) => /Materialise the review gate from the BASE branch/.test(String(s.name ?? "")));

// flow-0085: the materialise step's script has three branches — base carries the gate, BOOTSTRAP,
// neither — then an unconditional block. These cut it into the pieces the criteria talk about.
const baseBranch = (run) => run.slice(run.indexOf("git worktree add"), run.indexOf("elif [ -f .flow/bin/flow-review.mjs ]"));
const bootstrapBranch = (run) => run.slice(run.indexOf("elif [ -f .flow/bin/flow-review.mjs ]"), run.search(/\n\s*else\n/));
const finalBlock = (run) => {
  // The parsed block scalar is dedented, so `fi` closing the if/elif/else sits at column 0.
  const at = run.lastIndexOf("\nfi\n");
  assert.ok(at > 0, "the materialise step's if/elif/else must close with `fi` before the shared block");
  return run.slice(at);
};
// Every job that materialises the gate, found by its step rather than listed: a job added later
// without the base-side task directory fails the base-branch test below instead of escaping it.
const materialisingJobs = () => Object.keys(wf.jobs ?? {}).filter((job) => materialiseStep(job));

// Every `uses: anthropics/claude-code-action@…` step in a job — the reviewer invocation itself.
const reviewerSteps = (job) =>
  (wf.jobs[job]?.steps ?? []).filter((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action"));
// Prompts are block scalars, so a sentence wraps across lines. Collapse whitespace before
// matching — the assertions are about what the prompt SAYS, not how it is wrapped.
const prompts = () =>
  REVIEW_JOBS.flatMap((j) => reviewerSteps(j).map((s) => String(s.with?.prompt ?? "").replace(/\s+/g, " ")));

// ── criterion 1: the checks exist on the PR, and their verdicts land in the conversation ──

test("the reusable defines a qa and a code-review job, plus the plan they share", { skip }, () => {
  for (const job of ["plan", ...REVIEW_JOBS]) {
    assert.ok(wf.jobs[job], `_flow-review.yml must define a "${job}" job — it is the check on the PR`);
  }
  for (const job of REVIEW_JOBS) {
    assert.deepEqual(wf.jobs[job].needs, "plan",
      `${job} must read its model and its security decision from the shared plan job`);
  }
});

test("every reviewer is told to post its verdict as a PR comment, not only to a file", { skip }, () => {
  const found = prompts();
  assert.equal(found.length, REVIEW_JOBS.length, "one reviewer invocation per check");
  for (const p of found) {
    assert.match(p, /Post ONE pull-request comment/,
      "a verdict the human cannot read in the conversation is not a review");
  }
});

test("the caller is a thin, pinned reference that passes the token by name", { skip }, () => {
  const caller = yamlMod.parse(readFileSync(CALLER, "utf8"));
  const job = caller.jobs["flow-review"];
  assert.match(job.uses, /^CandidDan\/flow\/\.github\/workflows\/_flow-review\.yml@/,
    "repos adopt the logic by reference; a copy is the drift surface this replaced");
  assert.deepEqual(job.secrets, { CLAUDE_CODE_OAUTH_TOKEN: "${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}" },
    "named, not `secrets: inherit` — the reusable declares only CLAUDE_CODE_OAUTH_TOKEN, so " +
    "inherit would over-grant this job FLOW_PAT it never uses (see secrets-scope.test.mjs)");
  // A caller `permissions:` block is exhaustive, and a reusable cannot raise above its caller.
  for (const p of ["contents", "pull-requests", "issues", "id-token"]) {
    assert.ok(job.permissions?.[p], `the caller must grant ${p} — the reusable cannot raise it`);
  }
  assert.equal(job.permissions["id-token"], "write", "claude-code-action mints an OIDC token");
});

// ── criterion 2 + fail-closed: the verdict, not the model call, decides the check ──────────

test("each reviewer's verdict is enforced by the helper, and enforced even if it died", { skip }, () => {
  for (const job of REVIEW_JOBS) {
    const enforce = stepsOf(job).filter((s) => VERDICT_RUN.test(String(s.run ?? "")));
    assert.equal(enforce.length, 1, `${job} must enforce exactly one verdict`);
    assert.match(String(enforce[0].run), new RegExp(`--check ${job}\\b`));
    assert.match(String(enforce[0].if ?? ""), /always\(\)/,
      `${job}'s verdict step must run with always() — a reviewer that crashed must fail the ` +
      `check, not skip it and leave the job green`);
  }
});

test("the model call can never pass the check on its own", { skip }, () => {
  for (const job of REVIEW_JOBS) {
    for (const s of reviewerSteps(job)) {
      assert.equal(s["continue-on-error"], true,
        `${job}'s claude-code-action step must not decide the check — the verdict step does`);
    }
  }
});

test("the qa prompt demands the unproven criteria be named verbatim", { skip }, () => {
  const qa = reviewerSteps("qa")[0].with.prompt;
  assert.match(qa, /"unproven"/, "the qa verdict must carry the criteria that have no proving test");
  assert.match(qa, /verbatim/, "a failure that paraphrases the criterion makes the worker guess");
  assert.match(qa, /asserts the criterion's OUTCOME|proves its OUTCOME/,
    "the mapping, not coverage, is the real gate");
});

// ── criterion 3: the security review is conditional, and its skip is visible ───────────────

test("the security job always runs, so the check is never silently absent", { skip }, () => {
  const job = wf.jobs.security;
  assert.equal(job.if, undefined,
    "a job-level `if` would make the check VANISH from the PR when it is skipped — " +
    "indistinguishable from a gate that broke. Gate the steps, not the job.");
  const report = (job.steps ?? [])[0];
  assert.equal(report.if, undefined, "the applicability report must run unconditionally");
  assert.match(String(report.run), /GITHUB_STEP_SUMMARY/, "the decision must reach the run summary");
  assert.match(String(report.run), /SECURITY_REASON/,
    "and it must carry the reason, not just the verdict (through env — see the injection test)");
});

test("the security reviewer itself is gated on the config-driven decision", { skip }, () => {
  for (const s of reviewerSteps("security")) {
    assert.match(String(s.if), /needs\.plan\.outputs\.security_run == 'true'/,
      "the trigger comes from review.security_paths in the repo's config, not from this file");
  }
  assert.match(String(reusableSrc), /security_run: \$\{\{ steps\.plan\.outputs\.security_run \}\}/,
    "the plan job must publish the decision for the security job to read");
});

// ── criterion 5: no model is hardcoded in the reusable workflow ────────────────────────────

test("no reviewer names a model — every one reads it from the plan job", { skip }, () => {
  // The value is an expression containing spaces, so match the whole `${{ … }}` rather than \S+.
  const modelFlags = [...reusableSrc.matchAll(/--model\s+(\$\{\{[^}]*\}\}|\S+)/g)].map((m) => m[1]);
  assert.equal(modelFlags.length, REVIEW_JOBS.length + 1,
    "one --model per reviewer, plus the guide's (flow-0084). The guide reads `review.model` like " +
    "everything else here: it cannot have a knob of its own without a `guide_model` output on the " +
    "plan job, and the point stands either way — no model is named in this file.");
  for (const flag of modelFlags) {
    // flow-0140: code-review reads `code_review_model`, falling back to `model` with `||` for an
    // adopter whose base-branch helper predates the key. Still a plan output either way.
    assert.match(flag, /^\$\{\{\s*needs\.plan\.outputs\.((security_)?model|code_review_model\s*\|\|\s*needs\.plan\.outputs\.model)\s*\}\}$/,
      `"${flag}" hardcodes a model. It belongs in the consuming repo's .flow/config.yml under ` +
      `review.model, so a project tunes its reviewers as data instead of patching shared infra.`);
  }
});

test("no model name leaks into the workflow by any other route", { skip }, () => {
  // Comments are stripped first: the file legitimately DISCUSSES models in prose.
  const code = reusableSrc.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  for (const name of ["sonnet", "opus", "haiku"]) {
    assert.doesNotMatch(code, new RegExp(`\\b${name}\\b`),
      `"${name}" appears in _flow-review.yml. The model is config, not infra.`);
  }
});

test("attacker-controlled review text never reaches a shell through ${{ }}", { skip }, () => {
  // `security_reason` names the changed files that matched (or did not match) the trigger
  // globs, and a PR author picks file names. Interpolating it into a `run:` block splices
  // chosen text into the script — the class .flow/config.yml lists for these reusables.
  const runBlocks = Object.values(wf.jobs ?? {})
    .flatMap((j) => j.steps ?? [])
    .map((s) => String(s.run ?? ""));
  for (const block of runBlocks) {
    assert.doesNotMatch(block, /\$\{\{[^}]*security_reason[^}]*\}\}/,
      "security_reason must reach the shell through `env:`, where it is data, not script");
  }
  const report = (wf.jobs.security.steps ?? [])[0];
  assert.equal(report.env?.SECURITY_REASON, "${{ needs.plan.outputs.security_reason }}",
    "…and it must still actually be reported — passing it safely is not the same as dropping it");
});

// ── criterion 6: identical checks whoever opened the PR ───────────────────────────────────

test("no reviewer is fenced on the branch name or the PR author", { skip }, () => {
  assert.doesNotMatch(reusableSrc, /head\.ref/,
    "a `flow/` branch fence skips every PR from a human or a non-Claude agent — the checks must " +
    "not care who opened the PR");
  assert.doesNotMatch(reusableSrc, /github\.actor/);
  for (const job of REVIEW_JOBS) {
    for (const s of reviewerSteps(job)) {
      assert.equal(s.with.allowed_bots, "*",
        `${job} must accept a bot-initiated run — Flow's own worker PRs are opened by one`);
    }
  }
  // The remaining gates are the repo's own opt-in, the PR's draft state, and the fork boundary
  // (flow-0068). NONE of the three is about authorship, which is what this criterion protects:
  // opt-in and draft state are cost and readiness, and the head-repo comparison is about whose
  // CODE this runner executes, not who opened the PR. A fork PR still gets identical treatment
  // from a human, a bot or a non-Claude agent — it gets none of them, because GitHub withholds
  // the token there anyway and three `bypassPermissions` jobs must not start on a head this repo
  // does not own. See the header of _flow-review.yml for why the reusable asserts that itself
  // instead of inheriting it from a caller-owned trigger.
  //
  // Pinned as an exact string rather than a substring match so a future `head.ref`/`actor` clause
  // smuggled into the same expression fails here instead of silently re-fencing the reviewers.
  // Changing this line is a deliberate act; widening it to a substring match is not a fix.
  assert.equal(wf.jobs.plan.if.trim(),
    "${{ vars.FLOW_AI == 'true' && github.event.pull_request.draft != true" +
    " && github.event.pull_request.head.repo.full_name == github.repository }}");
});

// ── flow-0068: the fork boundary, and the task the reviewers are handed ───────────────────

test("the fork fence sits on `plan` and nowhere else — so it suppresses all four jobs at once", { skip }, () => {
  const FENCE = "github.event.pull_request.head.repo.full_name == github.repository";
  assert.ok(wf.jobs.plan.if.includes(FENCE),
    "three jobs run claude-code-action with --permission-mode bypassPermissions; the head they " +
    "check out must be one this repo owns, and `plan` is the single gate the other three need");
  for (const job of REVIEW_JOBS) {
    assert.equal(wf.jobs[job].if, undefined,
      `${job} must not carry its own copy of the fence — \`needs: plan\` already suppresses it, ` +
      `and a second copy is the one that gets forgotten when the rule changes`);
  }
  // Stated as a test rather than a comment: the fence is worthless if the trigger it assumes is
  // ever widened HERE. The caller owns `pull_request`; this reusable takes workflow_call only.
  assert.deepEqual(Object.keys(wf.on ?? wf.true ?? {}), ["workflow_call"],
    "the reusable must stay workflow_call-only — a pull_request_target trigger added here would " +
    "hand fork-authored code to the reviewers in every adopting repo at once");
});

test("every `plan` invocation is handed BOTH id sources, as env, never as shell text", { skip }, () => {
  const planSteps = allSteps().filter((s) => PLAN_RUN.test(String(s.run ?? "")));
  assert.equal(planSteps.length, 5,
    "the plan job, one bounded-context step per reviewer, and the guide's (flow-0084) — each " +
    "materialises its own context rather than passing an artifact around");
  for (const s of planSteps) {
    assert.equal(s.env?.HEAD_REF, "${{ github.head_ref }}",
      "`github.head_ref`, not `github.event.pull_request.head.ref`: the branch is an ID SOURCE " +
      "here, and the `head.ref` form is forbidden outright above so a real branch fence cannot " +
      "hide behind this one");
    assert.equal(s.env?.PR_TITLE, "${{ github.event.pull_request.title }}",
      "CAN-52's second source — without it a cloud session's claude/… branch resolves no task");
  }
  // The PR title is attacker-controlled. Same rule as security_reason: env is data, `${{ }}` in a
  // run block is script.
  for (const block of Object.values(wf.jobs ?? {}).flatMap((j) => j.steps ?? []).map((s) => String(s.run ?? ""))) {
    assert.doesNotMatch(block, /\$\{\{[^}]*pull_request\.title[^}]*\}\}/,
      "a PR title spliced into a shell script is the injection class .flow/config.yml lists");
  }
  assert.equal(wf.jobs.plan.outputs?.task_id, "${{ steps.plan.outputs.task_id }}",
    "the resolved id is published, so the run page says which task was graded");
});

test("every reviewer reads the MATERIALISED task, not a prose instruction to go and find it", { skip }, () => {
  for (const p of prompts()) {
    assert.match(p, /\.flow-review\/task\.md/,
      "the task reaches the reviewer through the bounded context, resolved in code from the " +
      "branch OR the PR title — the review gate was the last workflow leaving that to the model");
    assert.match(p, /NO TASK FILE RESOLVED/,
      "and the no-task case is named by its exact sentinel, so a reviewer cannot mistake an " +
      "unresolved task for a task with nothing to check");
    assert.match(p, /TASK CONTEXT UNAVAILABLE/,
      "…as is the version-skew case, which asks the reviewer for the OPPOSITE thing — not to " +
      "report a missing task. A prompt naming only one sentinel leaves the reviewer to infer " +
      "the difference from prose it may not read closely");
    // CAN-52's point is that the id has TWO sources, and the reading list has to say so. Pinning
    // only `task.md` would let a future edit quietly drop the PR title back out of the reading
    // list — leaving the prose describing a branch-only world the code no longer lives in, which
    // is how a reviewer starts hunting in .flow/tasks/ again.
    assert.match(p, /the branch/,
      "the branch is the canonical source and the prompt must still name it");
    assert.match(p, /the PR title/,
      "and the PR title alongside it — the source a platform-imposed claude/… branch falls back " +
      "to, which is the path canonical's own worker PRs take");
  }
  const qa = reviewerSteps("qa")[0].with.prompt.replace(/\s+/g, " ");
  assert.match(qa, /do not report a criterion.{0,3}test table you were not in a position to build/,
    "a well-formed PASS with an empty `unproven` is exactly what a reviewer that never found " +
    "the task writes, and `verdict` cannot tell that from a real pass");
});

// ── criterion 7: the reviewers read the diff and its blast radius, not the whole repo ──────

test("every reviewer is handed a materialised, bounded context", { skip }, () => {
  for (const job of REVIEW_JOBS) {
    const plan = stepsOf(job).filter((s) => PLAN_RUN.test(String(s.run ?? "")));
    assert.equal(plan.length, 1, `${job} must materialise .flow-review/ before the reviewer runs`);
  }
  for (const p of prompts()) {
    assert.match(p, /\.flow-review\/diff\.patch/, "the diff is the context");
    assert.match(p, /\.flow-review\/files\.txt/, "and the files it changes are the blast radius");
    assert.match(p, /Do NOT read the repository at large/,
      "the bound is what keeps per-PR cost flat as the codebase grows");
  }
});

test("no reviewer is allowed to write anything but its own verdict", { skip }, () => {
  for (const p of prompts()) {
    assert.match(p, /Never push commits, never edit source files/);
    assert.match(p, /The only file you write is \.flow-review\//);
  }
});

// ── criterion 4: nothing in the worker's session reviews the worker's work ─────────────────

test("the three review agent definitions are gone from the template", { skip: false }, () => {
  for (const name of ["qa-verifier", "security-reviewer", "code-reviewer"]) {
    assert.equal(existsSync(join(TEMPLATE, ".claude/agents", `${name}.md`)), false,
      `${name}.md still ships in the template — a worker that auto-discovers it will run the ` +
      `review inside the session that wrote the code, which is the whole failure this removed`);
  }
  assert.equal(existsSync(join(TEMPLATE, ".claude/agents")), false,
    "the agents directory itself must be gone, not merely emptied");
  assert.equal(existsSync(join(REPO, ".claude/agents")), false, "and canonical never had one");
});

test("the protocol tells the worker not to run a review agent, and says where they run", { skip: false }, () => {
  const protocol = readFileSync(join(TEMPLATE, ".flow/PROTOCOL.md"), "utf8");
  assert.match(protocol, /You never run a review agent/,
    "the protocol is what a fresh session actually reads — an instruction left stale there " +
    "outlives every workflow change");
  assert.match(protocol, /checks on the pull request/i);
  for (const stale of ["qa-verifier", "security-reviewer", "code-reviewer"]) {
    assert.doesNotMatch(protocol, new RegExp(stale),
      `the protocol still names the "${stale}" subagent, which no longer exists`);
  }
});

test("the queue-runner's worker prompt no longer dispatches review subagents", { skip: false }, () => {
  const src = readFileSync(QUEUE_RUNNER, "utf8");
  for (const stale of ["qa-verifier", "security-reviewer", "code-reviewer"]) {
    assert.doesNotMatch(src, new RegExp(stale),
      `_flow-queue-runner.yml still instructs the worker to run "${stale}" — the prompt is the ` +
      `other place a worker is told to certify its own work`);
  }
  assert.match(src, /Do NOT run any review subagent/,
    "silence is not enough: the prompt must say so, because the habit predates it");
});

test("the inherited Definition-of-Done block every future task carries is updated too", { skip: false }, () => {
  const tmpl = readFileSync(join(TEMPLATE, ".flow/tasks/_TEMPLATE.md"), "utf8");
  const dod = tmpl.split("## Definition of done (inherited — do not edit)")[1] ?? "";
  assert.ok(dod, "_TEMPLATE.md must still carry the inherited block");
  for (const stale of ["qa-verifier", "security-reviewer", "code-reviewer"]) {
    assert.doesNotMatch(dod, new RegExp(stale),
      `the inherited block names "${stale}", so every task written from here would re-teach the ` +
      `worker to review its own work`);
  }
  assert.match(dod, /checks on the PR/);
});

// ── flow-0079: the gate that decides comes from BASE, the thing decided about comes from the PR ──
// `plan` used to run `.flow/bin/flow-review.mjs` out of the PR checkout against `.flow/config.yml`
// in that same checkout, so the diff being reviewed owned both the trigger list and the `verdict`
// code that turns a reviewer's words into a red check. These are structural properties of the
// workflow — the helper cannot test where it was invoked from — so they are pinned here.

test("no step invokes the helper from the PR checkout — every call goes through the base copy", { skip }, () => {
  for (const s of allSteps()) {
    const run = String(s.run ?? "");
    assert.doesNotMatch(run, /node\s+(?:"?\$GITHUB_WORKSPACE\/)?\.flow\/bin\/flow-review\.mjs/,
      `a step runs the helper from the checkout: ${String(s.name ?? run).slice(0, 60)}. That copy ` +
      `is part of the diff under review, so a PR editing \`verdict\` decides its own check.`);
  }
  const invocations = allSteps().filter((s) =>
    PLAN_RUN.test(String(s.run ?? "")) || VERDICT_RUN.test(String(s.run ?? "")));
  assert.equal(invocations.length, 8,
    "five plans (the plan job, one bounded context per reviewer, and the guide's) and three verdicts");
});

test("every job that runs the helper materialises the BASE branch first", { skip }, () => {
  for (const job of HELPER_JOBS) {
    const steps = stepsOf(job);
    const mat = steps.findIndex((s) => s === materialiseStep(job));
    assert.ok(mat >= 0, `${job} must materialise the base gate before it runs anything`);
    const firstUse = steps.findIndex((s) =>
      PLAN_RUN.test(String(s.run ?? "")) || VERDICT_RUN.test(String(s.run ?? "")));
    assert.ok(firstUse > mat,
      `${job} uses $FLOW_REVIEW_DIR before the step that sets it — the var would be empty`);
  }
});

test("the materialised helper and config are the BASE branch's, in a scratch tree outside the checkout", { skip }, () => {
  for (const job of HELPER_JOBS) {
    const run = String(materialiseStep(job).run);
    assert.match(run, /base_dir="\$RUNNER_TEMP\/flow-review-base"/,
      `${job} must materialise base outside the working tree — a copy inside it is part of the diff`);
    assert.match(run, /git worktree add -q --detach "\$base_dir" "origin\/\$BASE_BRANCH"/,
      "a worktree, not a single-file `git show`: the helper imports touches-guard.mjs and " +
      "parse-task-id.mjs, and in canonical it is an adapter over project-template/.flow/bin/");
    assert.match(run, /FLOW_REVIEW_DIR=\$base_dir\/\.flow\/bin"/,
      `${job} must invoke BASE's helper — this is the criterion: not the checkout's copy`);
    assert.match(run, /FLOW_CONFIG=\$base_dir\/\.flow\/config\.yml/,
      "and read BASE's security_paths, so a PR cannot delete the glob covering its own diff");

    // …while everything the gate REASONS ABOUT still comes from the PR.
    assert.match(run, /REVIEW_REPO_DIR=\$GITHUB_WORKSPACE/,
      "the diff must still be the PR's. Without this an adapter pinned to its own realpath " +
      "diffs base against itself and hands three reviewers an empty patch");
    assert.match(run, /REVIEW_OUT_DIR=\$GITHUB_WORKSPACE\/\.flow-review/,
      "the bounded context has to land where the reviewer prompts say it is");
    // flow-0085: REVIEW_TASKS_DIR is no longer a PR-side variable. See the base/bootstrap tests.
    assert.doesNotMatch(finalBlock(run), /REVIEW_TASKS_DIR=/,
      "the unconditional block must not set REVIEW_TASKS_DIR; each branch chooses its own source");

    assert.equal(materialiseStep(job).env?.BASE_BRANCH, "${{ github.base_ref }}",
      "the ref name reaches the shell through env, never ${{ }} — same rule as the PR title");
  }
});

test("a base branch with no gate BOOTSTRAPS: the PR's helper, forced security, a visible warning", { skip }, () => {
  for (const job of HELPER_JOBS) {
    const run = String(materialiseStep(job).run);
    assert.match(run, /git cat-file -e "origin\/\$BASE_BRANCH:\.flow\/bin\/flow-review\.mjs"/,
      "the bootstrap case is DETECTED, not assumed — a repo adopting the gate in this very PR");
    assert.match(run, /elif \[ -f \.flow\/bin\/flow-review\.mjs \]; then/);
    assert.match(run, /FLOW_REVIEW_DIR=\$GITHUB_WORKSPACE\/\.flow\/bin"/,
      "bootstrap falls back to the PR's copy — fail-closed, never a skipped check");
    assert.match(run, /REVIEW_BOOTSTRAP=1/,
      "which is what makes the helper force the security review on (see flow-review.test.mjs)");
    assert.match(run, /BOOTSTRAP[\s\S]*>> "\$GITHUB_STEP_SUMMARY"/,
      "and the human is told, in the run summary, that the gate came from the diff it graded");
    // The pre-existing failure mode must survive the new branch: no gate anywhere is an ERROR.
    assert.match(run, /::error::\.flow\/bin\/flow-review\.mjs is missing/,
      "a repo that bumped the workflow tag without running flow-sync must still be told so, " +
      "rather than dying on `node: not found`");
    assert.match(run, /exit 1/, "…and the job must fail, not carry on with an unset helper path");
  }
});

// ── flow-0101: none of the three reviewers may PASS a diff it only partly read ─────────────
// The bounded context is capped in bytes, and `boundDiff` stamps a DIFF TRUNCATED marker into
// the patch when it clips one. Only the qa prompt used to react to that marker, so an oversized
// PR could collect two green checks from reviewers that had read part of the change — and a green
// check is read as a full review. The instruction is pinned as ONE string shared by all three
// prompts: three paraphrases drift, and the one that drifts is the one that stops saying "do not
// PASS". Collapsed whitespace, because a block scalar wraps it differently in each prompt.

const TRUNCATION_RULE =
  "If the diff carries the DIFF TRUNCATED marker, do NOT return a PASS verdict: name " +
  "the truncation in your verdict and in its summary, because passing a partial read " +
  "certifies what you could not read.";

test("qa, code-review and security all carry the same truncation instruction", { skip }, () => {
  const found = prompts();
  assert.equal(found.length, REVIEW_JOBS.length, "one reviewer invocation per check");
  for (const [i, p] of found.entries()) {
    assert.ok(p.includes(TRUNCATION_RULE),
      `the ${REVIEW_JOBS[i]} prompt does not carry the shared truncation instruction verbatim. ` +
      `All three read the same bounded diff; a reviewer that is not told to refuse a partial ` +
      `read will PASS one, and the PR will look fully reviewed.`);
  }
});

test("the shared truncation instruction forbids PASS and demands the verdict name it", { skip }, () => {
  // Criterion-level, and deliberately about the WORDS rather than their placement: the previous
  // qa wording ("say so in your verdict rather than approving what you could not read") named the
  // truncation but never forbade a PASS verdict outright.
  assert.match(TRUNCATION_RULE, /do NOT return a PASS verdict/,
    "the instruction must forbid PASS, not merely ask the reviewer to mention the truncation");
  assert.match(TRUNCATION_RULE, /name the truncation in your verdict/,
    "…and the verdict must say WHY it failed, or the worker cannot tell a truncation from a bug");
  assert.match(TRUNCATION_RULE, /DIFF TRUNCATED/,
    "it must name the marker `boundDiff` actually writes, so the reviewer knows what to look for");
  // The marker the prompts key off is produced by the helper. If that string ever changes, the
  // three prompts point at something that no longer appears in the patch.
  const helper = readFileSync(join(TEMPLATE, ".flow/bin/flow-review.mjs"), "utf8");
  assert.match(helper, /\*\*\* DIFF TRUNCATED at /,
    "flow-review.mjs must still stamp the DIFF TRUNCATED marker the three prompts name");
});

test("the security verdict rule does not contradict the truncation instruction", { skip }, () => {
  // `FAIL iff there is a High or Critical finding` is the only one of the three verdict
  // contracts that enumerates its failure causes, so it is the only one that could read as
  // permission to PASS a truncated diff with no High/Critical finding in the part it saw.
  const sec = String(reviewerSteps("security")[0].with.prompt).replace(/\s+/g, " ");
  assert.match(sec, /a truncated diff is its own FAIL/,
    "the security prompt tells the reviewer to FAIL iff High/Critical; without this clause the " +
    "truncation instruction above it is a second, contradicting rule");
});

// ── flow-0103: the truncation fact reaches all three verdict steps, from the plan's output ──
// flow-0101 put the rule in the three prompts; this is the same rule in code, and the wiring is
// the half the helper cannot test. Two properties matter and neither is behavioural: the fact must
// come from the PLAN's output expression (the reviewer writes into the workspace, so a file there
// is not a fact), and all THREE steps must pass it — the failure mode this whole pair of tasks
// exists for is two checks going green on a diff nobody fully read.

test("the plan job publishes diff_truncated, so the verdict steps read one shared fact", { skip }, () => {
  assert.equal(wf.jobs.plan.outputs?.diff_truncated, "${{ steps.plan.outputs.diff_truncated }}",
    "without the job output there is nothing for the three verdict steps to read, and each would " +
    "have to trust its own workspace");
  for (const key of ["diff_bytes", "diff_full_bytes"]) {
    assert.equal(wf.jobs.plan.outputs?.[key], `\${{ steps.plan.outputs.${key} }}`,
      `${key} is what makes the failure message name a number instead of just "too big"`);
  }
});

test("all three verdict steps pass --diff-truncated from the plan's output, never from a file", { skip }, () => {
  const steps = REVIEW_JOBS.map((job) => {
    const found = stepsOf(job).filter((s) => VERDICT_RUN.test(String(s.run ?? "")));
    assert.equal(found.length, 1, `${job} must enforce exactly one verdict`);
    return [job, found[0]];
  });
  assert.equal(steps.length, 3, "qa, code-review and security — a rule two of them follow is not a gate");

  for (const [job, step] of steps) {
    const run = String(step.run);
    assert.match(run, /--diff-truncated "\$DIFF_TRUNCATED"/,
      `${job}'s verdict step does not pass the truncation fact. The helper requires the flag, so ` +
      `this would fail the check for the wrong reason — and a gate that fails opaquely gets ` +
      `merged past as noise.`);
    assert.equal(step.env?.DIFF_TRUNCATED, "${{ needs.plan.outputs.diff_truncated }}",
      `${job} must take the fact from the PLAN JOB's output. \`.flow-review/\` is written by the ` +
      `reviewer itself, so a truncation fact read from the workspace is one the reviewer can edit.`);
    // Reporting only, but the message is the whole reason a red check is actionable.
    assert.equal(step.env?.DIFF_BYTES, "${{ needs.plan.outputs.diff_bytes }}");
    assert.equal(step.env?.DIFF_FULL_BYTES, "${{ needs.plan.outputs.diff_full_bytes }}");
    assert.match(run, /--diff-bytes "\$DIFF_BYTES" --diff-full-bytes "\$DIFF_FULL_BYTES"/);
  }
});

test("no verdict step reads the truncation fact out of the workspace the reviewer writes to", { skip }, () => {
  for (const s of allSteps()) {
    const run = String(s.run ?? "");
    if (!VERDICT_RUN.test(run)) continue;
    assert.doesNotMatch(run, /--diff-truncated[^\n]*\.flow-review/,
      "the fact must not be read back out of the bounded context — the reviewer writes there");
    // `${{ }}` in a run block is script, not data: the same rule the PR title and security_reason
    // follow. The value is a boolean from our own helper, but the rule is cheaper to keep whole.
    assert.doesNotMatch(run, /\$\{\{/,
      "a verdict step's script must stay free of ${{ }} interpolation — values arrive via env:");
  }
});

test("the helper the workflow calls actually REQUIRES the flag — the two cannot drift apart", { skip: false }, () => {
  const helper = readFileSync(join(TEMPLATE, ".flow/bin/flow-review.mjs"), "utf8");
  assert.match(helper, /export const TRUNCATION_FLAG = "--diff-truncated";/,
    "the flag name is a contract between this workflow and the helper, so it is pinned in code");
  assert.match(helper, /is required and must be exactly "true" or "false"/,
    "a flag the helper defaulted would let a workflow that stopped passing it go quietly green — " +
    "the two ship from the same commit, so there is no skew for a default to absorb");
});

test("changes/flow-0103.md exists, says no caller action, and names review.max_diff_bytes", () => {
  const text = changelogEntry(REPO, "flow-0103");
  assert.ok(text, "every review check on the fleet can now go red on a large PR — that owes an entry");
  assert.match(text, /No caller action/,
    "the caller-action line is what a reader of the release notes scans for");
  assert.match(text, /review\.max_diff_bytes/,
    "a repo that routinely opens PRs over the limit has to be told which setting to raise BEFORE " +
    "it takes this release, or it adopts a permanently red gate");
  assert.ok(!/^#/m.test(text),
    "a fragment is assembled verbatim under `## Unreleased` — it carries no heading of its own");
});

test("changes/flow-0101.md exists and states that no caller action is needed", () => {
  // Fragment while pending; assembled CHANGELOG entry after a release (flow-0098).
  const text = changelogEntry(REPO, "flow-0101");
  assert.ok(text, "a change to what every adopting repo's reviewers are told owes the changelog an entry");
  assert.match(text, /No caller action/,
    "the caller-action line is what a reader of the release notes scans for");
  assert.ok(!/^#/m.test(text),
    "a fragment is assembled verbatim under `## Unreleased` — it carries no heading of its own");
});

test("criterion 8 (flow-0100): its changelog entry exists, says no caller action, and names the key", () => {
  // Moved here from the template's flow-review.test.mjs, which read the fragment file directly and
  // so went red on the release that assembled it. Fragment first, assembled entry after (flow-0098).
  const text = changelogEntry(REPO, "flow-0100");
  assert.ok(text, "the changelog entry for flow-0100 is missing");
  assert.match(text, /No caller action/i, "a repo opts in by setting the key; nothing is required");
  assert.match(text, /max_diff_bytes/, "and the entry has to name the key a repo would set");
});

// ── flow-0085: the task file, and so the acceptance criteria, are read from BASE ──

test("flow-0085: with a gate on base, every materialising job reads the task from the base worktree", { skip }, () => {
  const jobs = materialisingJobs();
  assert.deepEqual([...jobs].sort(), [...HELPER_JOBS].sort(),
    "the set of jobs that materialise the gate changed — each one must carry the base-side task dir");
  for (const job of jobs) {
    const run = String(materialiseStep(job).run);
    assert.match(baseBranch(run), /echo "REVIEW_TASKS_DIR=\$base_dir\/\.flow\/tasks"/,
      `${job}: a PR must not choose the criteria it is judged against — read the task from base`);
  }
});

test("flow-0085: in BOOTSTRAP the task comes from the PR, since base has no independent copy", { skip }, () => {
  for (const job of materialisingJobs()) {
    const run = String(materialiseStep(job).run);
    assert.match(bootstrapBranch(run), /echo "REVIEW_TASKS_DIR=\$GITHUB_WORKSPACE\/\.flow\/tasks"/, job);
    assert.doesNotMatch(bootstrapBranch(run), /\$base_dir/, `${job}: bootstrap has no base worktree`);
  }
});

test("flow-0085: the diff and the output still come from, and go to, the PR checkout", { skip }, () => {
  for (const job of materialisingJobs()) {
    const tail = finalBlock(String(materialiseStep(job).run));
    assert.match(tail, /echo "REVIEW_REPO_DIR=\$GITHUB_WORKSPACE"/, job);
    assert.match(tail, /echo "REVIEW_OUT_DIR=\$GITHUB_WORKSPACE\/\.flow-review"/, job);
  }
});

test("flow-0085: the step's header comment names the task file as read from base", { skip }, () => {
  for (const job of materialisingJobs()) {
    // Comments are stripped by the YAML parser, so read the source between this job's step name
    // and its `run:` key.
    const at = reusableSrc.indexOf("Materialise the review gate from the BASE branch",
      reusableSrc.indexOf(`\n  ${job}:\n`));
    const header = reusableSrc.slice(at, reusableSrc.indexOf("run: |", at)).replace(/\s+#?\s*/g, " ");
    assert.match(header, /`REVIEW_TASKS_DIR` \(the task file and its acceptance criteria, flow-0085\) point at base/, job);
  }
});

// End to end over the real helper, no workflow run: a base branch holds criterion A, the PR branch
// rewrites it to B, and `runPlan` pointed at a worktree of base (what the workflow now does) must
// hand the reviewers A.
async function taskPlanFixture(t, { taskOnBase }) {
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { execFileSync } = await import("node:child_process");
  const { runPlan, NO_TASK_SENTINEL } = await import(join(TEMPLATE, ".flow/bin/flow-review.mjs"));
  const root = mkdtempSync(join(tmpdir(), "flow-0085-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(join(repo, ".flow/tasks"), { recursive: true });
  const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  const task = (criterion) => `---\nid: "flow-9999"\ntitle: "x"\nstatus: "in_progress"\n---\n\n## Acceptance criteria\n\n- [ ] ${criterion}\n`;
  const taskPath = join(repo, ".flow/tasks/flow-9999-x.md");
  copyFileSync(join(REPO, ".flow/config.yml"), join(repo, ".flow/config.yml"));
  git(["init", "-q", "-b", "main"]);
  if (taskOnBase) writeFileSync(taskPath, task("CRITERION-A from base"));
  writeFileSync(join(repo, "README.md"), "base\n");
  git(["add", "-A"]); git(["commit", "-q", "-m", "base"]);
  git(["checkout", "-q", "-b", "flow/flow-9999-x"]);
  writeFileSync(taskPath, task("CRITERION-B chosen by the PR"));
  writeFileSync(join(repo, "README.md"), "pr\n");
  git(["add", "-A"]); git(["commit", "-q", "-m", "pr"]);
  const baseDir = join(root, "flow-review-base");
  git(["worktree", "add", "-q", "--detach", baseDir, "main"]);
  const plan = runPlan({
    configPath: join(baseDir, ".flow/config.yml"),
    outDir: join(root, "out"),
    baseRef: "main",
    env: {},
    headRef: "flow/flow-9999-x",
    prTitle: "[flow-9999] x",
    callerSupplied: true,
    tasksDir: join(baseDir, ".flow/tasks"),
    git: (args) => git(args),
  });
  const { readFileSync: rf } = await import("node:fs");
  return { plan, text: rf(join(root, "out", "task.md"), "utf8"), NO_TASK_SENTINEL };
}

test("flow-0085: a task edited on the PR branch reaches the reviewers as BASE's copy", async (t) => {
  const { plan, text } = await taskPlanFixture(t, { taskOnBase: true });
  assert.equal(plan.task.found, true);
  assert.match(text, /CRITERION-A from base/);
  assert.doesNotMatch(text, /CRITERION-B/, "the PR's own edit to its criteria must not reach the reviewers");
});

test("flow-0085: a task that exists only on the PR branch resolves to the existing NO TASK sentinel", async (t) => {
  const { plan, text, NO_TASK_SENTINEL } = await taskPlanFixture(t, { taskOnBase: false });
  assert.equal(plan.task.found, false);
  assert.ok(text.startsWith(NO_TASK_SENTINEL), "no new sentinel: the same one as any unresolved task");
  assert.doesNotMatch(text, /CRITERION-B/);
});

test("flow-0085 has a changelog fragment that says the caller does nothing", () => {
  const text = changelogEntry(REPO, "flow-0085");
  assert.ok(text, "the changelog entry for flow-0085 is missing");
  assert.match(text, /Caller action: none/);
});


// ── flow-0089: the two PRs that are task-less BY DESIGN ───────────────────────────────────
// The helper's own tests prove the classification; these prove the half the helper cannot — that
// each reviewer is TOLD what to do with the sentinel, in the same words, and that the rules it
// reports still come from release-guard rather than from a second copy living in the gate.
//
// Verbatim and shared for the same reason the truncation instruction is (flow-0101): three
// paraphrases drift, and the one that drifts is the one that stops saying what to do.

const CLASSIFIED_PR_RULE =
  ".flow-review/task.md may instead begin with one of two sentinels that mean this PR has NO " +
  "TASK BY DESIGN. Both are decided in code — branch prefix AND every changed path inside a " +
  "closed list — so neither is a branch-name exemption, and neither is a judgement call for " +
  "you: · \"RELEASE PR\" — release files only. The sentinel carries release-guard's verdict over " +
  "this tree. If it reports no problems, PASS with exactly: release PR: release files only, " +
  "release-guard clean. If it reports problems, FAIL and name them. · \"SYNC PR\" — the flow-sync " +
  "surface only. The classification proves where the files are, not where their content came " +
  "from, so still read the diff. If it adds or widens a `permissions:` block, introduces " +
  "`pull_request_target`, points a `uses:` at a different owner or an unpinned branch, or changes " +
  "how a secret is read or passed, FAIL and name it. Otherwise PASS with exactly: sync PR: synced " +
  "surface only; flow-tooling validates it. Under either sentinel there are no acceptance criteria to map, and " +
  "a missing task is not a finding. Do not go looking for one.";

test("flow-0089: every reviewer prompt carries the RELEASE PR / SYNC PR instruction verbatim", { skip }, () => {
  const found = prompts();
  assert.equal(found.length, REVIEW_JOBS.length, "one reviewer invocation per check");
  for (const [i, p] of found.entries()) {
    assert.ok(p.includes(CLASSIFIED_PR_RULE),
      `the ${REVIEW_JOBS[i]} prompt does not carry the classified-PR instruction verbatim. All ` +
      `three read the same task.md; a reviewer not told what the sentinel means improvises, ` +
      `which is how #117 passed and #121 failed on the same kind of PR.`);
  }
});

test("flow-0089: the RELEASE PR rule states both a PASS condition and a FAIL condition", { skip }, () => {
  assert.match(CLASSIFIED_PR_RULE, /"RELEASE PR"/,
    "the sentinel is named exactly as the helper writes it, or the reviewer cannot match on it");
  assert.match(CLASSIFIED_PR_RULE,
    /If it reports no problems, PASS with exactly: release PR: release files only, release-guard clean/,
    "a guard-clean release PR has one allowed verdict and one allowed sentence — no judgement call");
  assert.match(CLASSIFIED_PR_RULE, /If it reports problems, FAIL and name them/,
    "…and the other direction has to be stated too, or the rule reads as a blanket exemption, " +
    "which is the loophole this task exists to refuse");
  assert.match(CLASSIFIED_PR_RULE, /a missing task is not a finding/,
    "under either sentinel the no-task case is expected; reporting it is the behaviour being replaced");
});

test("flow-0089: the SYNC PR rule is named with its PASS line", { skip }, () => {
  assert.match(CLASSIFIED_PR_RULE, /"SYNC PR"/);
  assert.match(CLASSIFIED_PR_RULE,
    /Otherwise PASS with exactly: sync PR: synced surface only; flow-tooling validates it/,
    "this is the case every adopting repo hits on every sync — the fleet-wide half of the task");
});

test("flow-0089: the SYNC PR rule states a FAIL condition, so classification is not a blanket pass", { skip }, () => {
  // Security review on #146: the classifier is branch prefix + path glob, and the synced surface
  // is exactly the high-leverage files (caller workflows, .flow/bin, PROTOCOL.md). A PASS line
  // with no FAIL branch would wave through a poisoned edit to any of them on a branch named right.
  assert.match(CLASSIFIED_PR_RULE, /proves where the files are, not where their content came from/);
  assert.match(CLASSIFIED_PR_RULE, /still read the diff/);
  for (const risk of [/`permissions:`/, /`pull_request_target`/, /`uses:`/, /secret/]) {
    assert.match(CLASSIFIED_PR_RULE, risk, `the SYNC PR rule must name ${risk} as a FAIL condition`);
  }
  assert.match(CLASSIFIED_PR_RULE, /FAIL and name it\. Otherwise PASS with exactly: sync PR/,
    "the FAIL branch comes before the canned PASS line, and the PASS is conditional on it");
});

test("flow-0089: the prompts and the helper name the same sentinels and the same PASS lines", { skip: false }, () => {
  // The prompt tells the reviewer what to look for; the helper writes what it will find. Two
  // files, one contract — pinned here because a rename in either is silent in the other.
  const helper = readFileSync(join(TEMPLATE, ".flow/bin/flow-review.mjs"), "utf8");
  assert.match(helper, /export const RELEASE_PR_SENTINEL = "RELEASE PR";/);
  assert.match(helper, /export const SYNC_PR_SENTINEL = "SYNC PR";/);
  assert.match(helper,
    /export const RELEASE_PR_PASS_LINE = "release PR: release files only, release-guard clean";/);
  assert.match(helper,
    /export const SYNC_PR_PASS_LINE = "sync PR: synced surface only; flow-tooling validates it";/);
});

test("flow-0089: the classification IMPORTS checkRelease — no release rule is restated in the gate", { skip: false }, () => {
  const helper = readFileSync(join(TEMPLATE, ".flow/bin/flow-review.mjs"), "utf8");
  assert.match(helper, /^import \{[\s\S]*?\bcheckRelease,[\s\S]*?\} from "\.\/release-guard\.mjs";$/m,
    "`checkRelease` must be imported from release-guard.mjs: it is the function the release path " +
    "itself runs, and a gate that re-decided release correctness would drift away from the guard " +
    "it is supposed to agree with");
  assert.match(helper, /checkRelease\(\{/,
    "…and actually called, rather than imported and then second-guessed");

  // The rules themselves must live in exactly one file. These are release-guard's own strings and
  // patterns; any of them appearing here would be the copy this criterion forbids.
  const guard = readFileSync(join(TEMPLATE, ".flow/bin/release-guard.mjs"), "utf8");
  for (const rule of ["stamp drift:", "unassembled changelog", "no stamp found", "expected MAJOR.MINOR.PATCH"]) {
    assert.ok(guard.includes(rule), `release-guard.mjs no longer states "${rule}" — update this test`);
    assert.ok(!helper.includes(rule),
      `flow-review.mjs restates release-guard's rule "${rule}". The guard's words must reach the ` +
      `reviewer by being RUN, not by being retyped.`);
  }
  for (const pattern of ["^\\d+\\.\\d+\\.\\d+$", "^[a-z][a-z0-9]*-\\d+\\.md$"]) {
    assert.ok(!helper.includes(pattern),
      `flow-review.mjs carries a copy of a release-guard regex (${pattern}) — import the constant`);
  }
});

test("flow-0089: the versioning policy states the hotfix order and the release-files-only rule", () => {
  const doc = readFileSync(join(REPO, "docs/flow-versioning-policy.md"), "utf8");
  assert.match(doc, /A hotfix is therefore two PRs, in this order: a task PR, then a release PR/,
    "the procedure a human follows has to say it, or the gate is the only place the rule exists " +
    "and people meet it as a surprise red check");
  assert.match(doc, /A release PR carries release files and nothing else/,
    "and the rule the gate enforces has to be written down where the release procedure is");
  assert.match(doc, /starts with `release\/` \*\*and\*\* every changed path is one of/,
    "BOTH halves, since the branch prefix on its own exempting a PR is the loophole this refuses");
});

test("flow-0089: changes/flow-0089.md exists and says the caller does nothing", () => {
  const text = changelogEntry(REPO, "flow-0089");
  assert.ok(text, "a change to what every adopting repo's reviewers are told owes the changelog an entry");
  assert.match(text, /Caller action: none/,
    "the caller-action line is what a reader of the release notes scans for");
  assert.match(text, /SYNC PR/,
    "the sync half is the one that fires in every adopting repo, so the entry has to name it");
  assert.ok(!/^#/m.test(text),
    "a fragment is assembled verbatim under `## Unreleased` — it carries no heading of its own");
});


// ── flow-0084: the `guide` job — one comment telling the human where to look ───────────────
// The helper's own tests (project-template/.flow/bin/review-guide.test.mjs) prove the facts: the
// hotspots, the verbatim assumptions, the cap at three, the fail-open prose, the marker lookup.
// These prove the half a helper cannot see — that the job exists, runs after all three checks
// whatever they concluded, inherits the draft and fork fences rather than recopying them, computes
// its facts from BASE's gate, and can never turn this PR red.

const GUIDE_FACTS_RUN = /node "\$FLOW_REVIEW_DIR"\/review-guide\.mjs facts\b/;
const GUIDE_COMMENT_RUN = /node "\$FLOW_REVIEW_DIR"\/review-guide\.mjs comment(?!-)\b/;
const GUIDE_ID_RUN = /node "\$FLOW_REVIEW_DIR"\/review-guide\.mjs comment-id\b/;
const guideSteps = () => stepsOf(GUIDE_JOB);
const guideStep = (re) => guideSteps().find((s) => re.test(String(s.run ?? "")));

test("flow-0084: the guide runs after all three checks, whatever each of them concluded", { skip }, () => {
  const job = wf.jobs[GUIDE_JOB];
  assert.ok(job, "_flow-review.yml must define a `guide` job — it is the human's merge touchpoint");
  assert.deepEqual(job.needs, ["plan", "qa", "code-review", "security"],
    "the guide combines the three verdicts, so it must wait for all three AND for the plan it " +
    "reads the security decision from");
  assert.match(String(job.if), /always\(\)/,
    "without always(), a FAILED reviewer suppresses the guide — which is exactly the PR a human " +
    "most needs told where to look");
});

test("flow-0084: the guide never runs on a draft or a fork, and does not recopy either fence", { skip }, () => {
  const guard = String(wf.jobs[GUIDE_JOB].if).trim();
  assert.match(guard, /needs\.plan\.result == 'success'/,
    "`plan` carries the opt-in, the draft clause and the head-repo comparison, so gating on its " +
    "RESULT inherits all three. always() would otherwise defeat them: a skipped `needs` does not " +
    "suppress a job that runs always().");
  // The fences stay in exactly one place. A second copy here is the one that gets forgotten when
  // the rule changes — the same reasoning the three review jobs carry no `if` at all.
  assert.ok(!guard.includes("draft"), "the draft clause must not be recopied into the guide's if");
  assert.ok(!guard.includes("head.repo"), "nor the fork fence");
  assert.ok(!guard.includes("vars.FLOW_AI"), "nor the opt-in");
  // And the whole-file bans still hold with the job added — reasserted because `guide` is the
  // first job here that needed an `if` of its own.
  assert.doesNotMatch(reusableSrc, /head\.ref/);
  assert.doesNotMatch(reusableSrc, /github\.actor/);
});

test("flow-0084: the guide can never fail this PR — asserted, not assumed", { skip }, () => {
  assert.equal(wf.jobs[GUIDE_JOB]["continue-on-error"], true,
    "job-level continue-on-error is what makes `the guide never blocks` structural: a broken " +
    "advisory comment must not fail the workflow run, and a required check that turns red on a " +
    "guide bug is the thing this must never become");
  for (const [name, job] of Object.entries(wf.jobs ?? {})) {
    if (name === GUIDE_JOB) continue;
    const needs = Array.isArray(job.needs) ? job.needs : [job.needs].filter(Boolean);
    assert.ok(!needs.includes(GUIDE_JOB),
      `${name} declares \`needs: guide\` — the guide would then be able to hold up, or fail, a ` +
      `check that blocks the PR`);
  }
  // The model call is the half most likely to fail, and it must not even fail the guide job.
  const model = guideSteps().filter((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action"));
  assert.equal(model.length, 1, "exactly one model call in the guide");
  assert.equal(model[0]["continue-on-error"], true, "prose is fail-open; the comment posts without it");
});

test("flow-0084: the facts come from BASE's gate and BASE's config, like every other decision here", { skip }, () => {
  const facts = guideStep(GUIDE_FACTS_RUN);
  assert.ok(facts, "the guide must compute its facts with review-guide.mjs");
  // $FLOW_REVIEW_DIR is the base worktree's bin/ (see the materialise tests above), so this is the
  // same fence the three checks sit behind: a PR cannot edit the code that computes its own
  // hotspots, nor the `security_paths` those hotspots are matched against.
  const steps = guideSteps();
  assert.ok(steps.indexOf(facts) > steps.indexOf(materialiseStep(GUIDE_JOB)),
    "the facts step uses $FLOW_REVIEW_DIR before the step that sets it");
  assert.ok(steps.indexOf(facts) > steps.findIndex((s) => PLAN_RUN.test(String(s.run ?? ""))),
    "and it reads .flow-review/, so `plan` must have materialised it first");
  for (const s of allSteps()) {
    assert.doesNotMatch(String(s.run ?? ""), /node\s+(?:"?\$GITHUB_WORKSPACE\/)?\.flow\/bin\/review-guide\.mjs/,
      "no step may run review-guide.mjs from the PR checkout — that copy is part of the diff whose " +
      "hotspots it computes");
  }
});

test("flow-0084: the PR body reaches the helper as env data, never as shell script", { skip }, () => {
  const facts = guideStep(GUIDE_FACTS_RUN);
  assert.equal(facts.env?.PR_BODY, "${{ github.event.pull_request.body }}",
    "the description's `## Assumptions` section is quoted into the comment, so the body has to be " +
    "passed — and it is the third piece of attacker-chosen text here, after the branch and the title");
  for (const block of allSteps().map((s) => String(s.run ?? ""))) {
    assert.doesNotMatch(block, /\$\{\{[^}]*pull_request\.body[^}]*\}\}/,
      "a PR body spliced into a shell script is the injection class .flow/config.yml lists for " +
      "these reusables");
  }
});

test("flow-0084: the verdicts row is built from the three JOB results, plus the plan's skip fact", { skip }, () => {
  const render = guideStep(GUIDE_COMMENT_RUN);
  assert.ok(render, "the guide must render its comment with review-guide.mjs");
  assert.match(String(render.if ?? ""), /always\(\)/,
    "the render step is what makes the fail-open real — it must run even though the model step " +
    "before it is continue-on-error");
  assert.deepEqual(
    Object.fromEntries(Object.entries(render.env ?? {})),
    {
      QA_RESULT: "${{ needs.qa.result }}",
      CODE_REVIEW_RESULT: "${{ needs['code-review'].result }}",
      SECURITY_RESULT: "${{ needs.security.result }}",
      // The security job ALWAYS runs so its check is never silently absent, so a skipped REVIEW
      // still reports a successful JOB. `security_run` is the only thing that can tell those apart,
      // and rendering a skip as a pass is the one wrong answer this row can give.
      SECURITY_RUN: "${{ needs.plan.outputs.security_run }}",
      SECURITY_REASON: "${{ needs.plan.outputs.security_reason }}",
    },
    "each reviewer writes its verdict JSON into its own job's workspace, so the guide reads the " +
    "job results — the same fact the human sees on the checks list");
});

test("flow-0084: one comment per PR, upserted through the helper's marker lookup", { skip }, () => {
  const post = guideSteps().find((s) => GUIDE_ID_RUN.test(String(s.run ?? "")));
  assert.ok(post, "the upsert must resolve the existing comment with `review-guide.mjs comment-id`");
  const run = String(post.run);
  assert.match(String(post.if ?? ""), /always\(\)/);
  assert.match(run, /gh api --paginate --slurp "repos\/\$GITHUB_REPOSITORY\/issues\/\$PR_NUMBER\/comments"/,
    "the whole comment list has to be fetched, or a guide comment past the first page reads as absent");
  assert.match(run, /gh api -X PATCH "repos\/\$GITHUB_REPOSITORY\/issues\/comments\/\$id"/,
    "an existing comment is EDITED. The review workflow runs again on every hand-off, and a guide " +
    "that appended would bury the reviewers' own comments under its history");
  assert.match(run, /gh api -X POST "repos\/\$GITHUB_REPOSITORY\/issues\/\$PR_NUMBER\/comments"/,
    "…and the first run posts one");
  assert.ok(!/--jq .*contains/.test(run),
    "the marker lookup is the helper's, with a proving test — a `--jq` expression in a reusable " +
    "workflow is the one piece of this gate nobody can test");
  assert.equal(post.env?.GH_TOKEN, "${{ secrets.GITHUB_TOKEN }}",
    "posting needs the workflow's own token; `pull-requests: write` is already granted at the top");
  assert.equal(post.env?.PR_NUMBER, "${{ github.event.pull_request.number }}");
});

test("flow-0084: the marker the workflow upserts on is the helper's, and it is hidden", { skip: false }, () => {
  // Two files, one contract. A rename in the helper orphans every guide comment in the fleet, and
  // the workflow would silently start posting a second comment per PR.
  const helper = readFileSync(join(TEMPLATE, ".flow/bin/review-guide.mjs"), "utf8");
  assert.match(helper, /export const GUIDE_MARKER = "<!-- flow-review-guide: [^"]*-->";/,
    "the marker must be an HTML comment, so it is invisible in the rendered comment, and exported " +
    "so the upsert cannot carry a second copy of it");
});

test("flow-0084: the guide's prompt bounds the model to the facts file and forbids a second comment", { skip }, () => {
  const p = String(guideSteps().find((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action"))
    .with.prompt).replace(/\s+/g, " ");
  assert.match(p, /\.flow-review\/guide-facts\.md/, "one file in");
  assert.match(p, /\.flow-review\/guide-prose\.json/, "one file out");
  assert.match(p, /Do not read the diff, the task, or the repository/,
    "the guide must not re-review: the three checks already did, at three times the cost");
  assert.match(p, /THE FACTS ARE NOT YOURS TO EDIT/,
    "facts render from code and prose from the model, and the prompt has to say which is which");
  assert.match(p, /You are choosing an order, not a subset/,
    "`selectLookHere` enforces this in code; the prompt says it so the model does not try and fail");
  assert.match(p, /Do NOT post a pull-request comment/,
    "the workflow posts ONE comment and updates it in place — a second from the model is the noise " +
    "this job exists to remove");
  assert.match(p, /never edit source files/);
  // The guide is advisory and must stay cheap: it reads one file and writes one small JSON object.
  const args = String(guideSteps().find((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action")).with.claude_args);
  assert.match(args, /--max-turns 6\b/,
    "the turn budget is the effort bound — a guide needing more turns than this has misunderstood " +
    "the job, and the three reviewers are already the expensive part of this workflow");
});

test("flow-0084: the three existing checks are untouched — the guide is additive", { skip }, () => {
  for (const job of REVIEW_JOBS) {
    assert.equal(wf.jobs[job].if, undefined, `${job} must still carry no job-level if`);
    assert.equal(wf.jobs[job]["continue-on-error"], undefined,
      `${job} must still be able to fail the PR — only the guide is advisory`);
    assert.deepEqual(wf.jobs[job].needs, "plan", `${job}'s needs must not have gained the guide`);
  }
});

test("flow-0084: changes/flow-0084.md exists and states that the caller does nothing", () => {
  const text = changelogEntry(REPO, "flow-0084");
  assert.ok(text, "a new comment on every PR in the fleet owes the changelog an entry");
  assert.match(text, /[Cc]aller action: none/,
    "the job lives in the reusable, so an adopting repo gets it by bumping the tag and nothing else");
  assert.ok(!/^#/m.test(text),
    "a fragment is assembled verbatim under `## Unreleased` — it carries no heading of its own");
});

// ── flow-0084: canonical's own adapter over the helper ────────────────────────────────────
// `_flow-review.yml` runs `$FLOW_REVIEW_DIR/review-guide.mjs` in the CONSUMING repo, and canonical
// is one of those. CLAUDE.md's adapter rule names the two ways this fails silently, and both end in
// a green tick over a comment nobody posted: a store resolved to `project-template/` (the fixture
// tree), and a CLI block that never runs because main-module detection compared an as-invoked path
// against a resolved one. Asserted on output, never only on an exit status.

test("flow-0084: the review-guide adapter resolves CANONICAL's .flow/, not the template's", async () => {
  const { canonicalFlowDir } = await import("./review-guide.mjs");
  assert.equal(canonicalFlowDir(), join(REPO, ".flow"));
  assert.notEqual(canonicalFlowDir(), join(TEMPLATE, ".flow"),
    "project-template/.flow is the FIXTURE tree — reading its config.yml would compute hotspots " +
    "against the wrong repo's security_paths while still exiting 0");
});

test("flow-0084: the adapter imports the template's logic rather than copying it", () => {
  const src = readFileSync(join(REPO, ".flow/bin/review-guide.mjs"), "utf8");
  assert.match(src, /from "\.\.\/\.\.\/project-template\/\.flow\/bin\/review-guide\.mjs"/,
    "a second copy of the logic is the flow-0008 hazard: the same fix needed twice, green when " +
    "only one of them lands");
  for (const name of ["rankHotspots", "selectLookHere", "GUIDE_MARKER", "pickGuideComment"]) {
    assert.ok(src.includes(name), `the adapter must re-export ${name} so a test can reach it here`);
  }
  // Nothing that DECIDES may live in the adapter. The only thing it supplies is which repo.
  assert.ok(!/function (rankHotspots|selectLookHere|pickGuideComment)/.test(src),
    "the adapter must not reimplement a decision — only the CLI shell and canonical's paths");
});

test("flow-0084: the adapter's CLI block actually runs — silence is the symlink failure mode", async (t) => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const root = mkdtempSync(join(tmpdir(), "flow-0084-adapter-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const out = join(root, ".flow-review");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "files.txt"), ".github/workflows/_flow-review.yml\n");
  writeFileSync(join(out, "diff.patch"), "");
  writeFileSync(join(out, "task.md"), "NO TASK FILE RESOLVED\n\nnone\n");

  const run = (args) => spawnSync(process.execPath, [join(REPO, ".flow/bin/review-guide.mjs"), ...args],
    { cwd: REPO, encoding: "utf8", env: { ...process.env, REVIEW_OUT_DIR: out } });

  const facts = run(["facts"]);
  assert.equal(facts.status, 0, facts.stderr);
  assert.match(facts.stdout, /review-guide: 1 hotspot\(s\) across 1 changed file\(s\)/,
    "the adapter must produce its report, not nothing — and the one hotspot is the security FLOOR, " +
    "which fires whatever canonical's config says");

  // `comment-id` is the subcommand the upsert branches on, so an empty answer and a found one are
  // both load-bearing: the first posts, the second edits.
  const list = join(root, "comments.json");
  const { GUIDE_MARKER } = await import("./review-guide.mjs");
  writeFileSync(list, JSON.stringify([{ id: 1, body: "qa review" }, { id: 2, body: `${GUIDE_MARKER} x` }]));
  const found = run(["comment-id", list]);
  assert.equal(found.status, 0, found.stderr);
  assert.equal(found.stdout.trim(), "2");

  writeFileSync(list, "[]");
  assert.equal(run(["comment-id", list]).stdout.trim(), "",
    "empty output is how the workflow decides to post a new comment");
});
