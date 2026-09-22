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
    const enforce = (wf.jobs[job].steps ?? []).filter((s) =>
      String(s.run ?? "").includes("flow-review.mjs verdict"));
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
  assert.equal(modelFlags.length, REVIEW_JOBS.length, "one --model per reviewer");
  for (const flag of modelFlags) {
    assert.match(flag, /^\$\{\{\s*needs\.plan\.outputs\.(security_)?model\s*\}\}$/,
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
  const planSteps = Object.values(wf.jobs ?? {})
    .flatMap((j) => j.steps ?? [])
    .filter((s) => String(s.run ?? "").includes("flow-review.mjs plan"));
  assert.equal(planSteps.length, 4,
    "the plan job plus one bounded-context step per reviewer — each materialises its own context");
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
    const plan = (wf.jobs[job].steps ?? []).filter((s) =>
      String(s.run ?? "").includes("flow-review.mjs plan"));
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
