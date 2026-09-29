// flow-pat-forwarding.test.mjs — proving tests for flow-0026, flow-0093 and flow-0095.
//
// Criteria proved here (flow-0026):
//   · "_flow-queue-runner.yml declares FLOW_PAT in on.workflow_call.secrets with required: false"
//   · "the 'Work the task' step's with.github_token is exactly
//      ${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}"
//
// Criteria proved here (flow-0093 — the worker's own git and gh, not just the action's API calls):
//   · "the worker job's actions/checkout sets token: ${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}"
//   · "the worker step exposes GH_TOKEN from the same expression"
//   · "_flow-open-pr.yml's header and docs/flow-reusable-workflows.md carry the same
//      four-permission list"
//   · "the docs state the Actions PR-creation setting is not needed, with the reason"
//   · "changes/flow-0093.md exists and states the caller action"
//
// Criteria proved here (flow-0095):
//   · "the template caller's header no longer says the reusable never uses FLOW_PAT, and points
//      to the permission list"
//   · "changes/flow-0095.md exists and states the caller action"
//
// NOT proved here, on purpose — flow-0095's other three criteria are all instances of one rule,
// "every caller forwards exactly the secrets its reusable declares, by name", and that rule has a
// single owning test file: `secrets-scope.test.mjs`. Its table is where the expected secret set
// for each caller is stated, so asserting the same three facts here as well would mean two places
// to update and one of them silently going stale — which is the failure that produced this task
// (that file's table still encoded a `v1` tag in which the reusable had no FLOW_PAT to forward).
// This file keeps what is genuinely its own: the reusable's wiring, and the prose around it.
//
// Why it matters: pushes made with the Actions GITHUB_TOKEN don't trigger downstream workflows
// (GitHub's recursion guard), so a worker branch pushed under GITHUB_TOKEN never fires
// _flow-open-pr.yml and sits PR-less until the recovery sweep. FLOW_PAT is a real actor, so the
// push event fires normally; the fallback keeps a repo without the secret on today's behaviour.
// Same wiring shape as _flow-open-pr.yml / _flow-recover.yml / _flow-sync.yml (CAN-58).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE. Same posture as check-workflows.test.mjs: `_flow-gates.yml`'s flow-tooling
// job runs `node --test .flow/bin/*.test.mjs` with no install step, so when `yaml` is missing
// these tests skip *visibly* ("# skipped") instead of crashing the job. They run for real in
// the per-stack gate job, which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const QUEUE_RUNNER = join(REPO, ".github/workflows/_flow-queue-runner.yml");
const OPEN_PR = join(REPO, ".github/workflows/_flow-open-pr.yml");
const DOCS = join(REPO, "docs/flow-reusable-workflows.md");
const FRAGMENT = join(REPO, "changes/flow-0093.md");

const parseQueueRunner = () => yamlMod.parse(readFileSync(QUEUE_RUNNER, "utf8"));

test("_flow-queue-runner.yml declares FLOW_PAT as an optional workflow_call secret", { skip }, () => {
  const wf = parseQueueRunner();
  const secret = wf.on?.workflow_call?.secrets?.FLOW_PAT;
  assert.ok(secret, "on.workflow_call.secrets.FLOW_PAT must be declared — without the " +
    "declaration a thin caller's named `FLOW_PAT: ...` forward would be rejected as an " +
    "undeclared secret");
  assert.equal(secret.required, false,
    "required:true would fail the whole workflow at call time in a repo that hasn't created " +
    "the secret, instead of falling back to GITHUB_TOKEN (today's behaviour)");
});

test("the 'Work the task' step authenticates with FLOW_PAT, falling back to GITHUB_TOKEN", { skip }, () => {
  const wf = parseQueueRunner();
  const steps = wf.jobs?.dispatch?.steps ?? [];
  const work = steps.find((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action"));
  assert.ok(work, "the dispatch job must have a claude-code-action step — the worker itself");
  assert.equal(work.with?.github_token, "${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}",
    "the worker's git pushes must use FLOW_PAT (a real actor) so the branch push fires " +
    "_flow-open-pr.yml directly — GITHUB_TOKEN pushes don't trigger downstream workflows " +
    "(GitHub's recursion guard), which is exactly the gap observed on CandidDan/write#24. " +
    "The || fallback keeps a repo without the secret on unchanged behaviour");
});

// ─── flow-0093: the worker's own credential ──────────────────────────────────────────────────
//
// The distinction this section exists to protect: `with.github_token` above reaches the ACTION's
// API calls. It does not reach the credential `actions/checkout` persists in `.git/config`, and it
// does not reach `gh`. So a worker could hold FLOW_PAT for the action and still be unable to
// `git push` a workflow-file change or run `gh pr create` — which is exactly what an adopting repo
// reported. Each of the three wirings is asserted separately because each fails on its own.

const TOKEN_EXPR = "${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}";

const dispatchSteps = () => parseQueueRunner().jobs?.dispatch?.steps ?? [];
const workerStep = () =>
  dispatchSteps().find((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action"));

test("the worker job's checkout persists FLOW_PAT as the git credential", { skip }, () => {
  const checkout = dispatchSteps().find((s) => String(s.uses ?? "").startsWith("actions/checkout"));
  assert.ok(checkout, "the dispatch job must check the repo out before the worker runs");
  assert.equal(checkout.with?.token, TOKEN_EXPR,
    "the checkout `token:` is the credential the WORKER's later `git push` authenticates as. " +
    "Left at the default it is GITHUB_TOKEN, and GitHub refuses a GITHUB_TOKEN push that changes " +
    "anything under .github/workflows/ — server-side, whatever `permissions:` says, because " +
    "`workflows` is not one of GITHUB_TOKEN's grantable permissions. A worker on a task whose " +
    "`touches` names a workflow file then cannot push at all. `with.github_token` does not " +
    "substitute: it reaches the action's API calls, never git's persisted credential");
});

test("the worker step exports GH_TOKEN from the same expression", { skip }, () => {
  const work = workerStep();
  assert.ok(work, "the dispatch job must have a claude-code-action step — the worker itself");
  assert.equal(work.env?.GH_TOKEN, TOKEN_EXPR,
    "`gh` reads its credential from the environment, not from the action's `github_token:` input, " +
    "so without GH_TOKEN the worker's `gh pr create` / `gh pr ready` / `gh issue create` fail " +
    "outright. It must be the SAME expression as the checkout token: one credential for " +
    "everything the worker does to the repo means one permission list to reason about");
});

test("checkout token, GH_TOKEN and github_token are all the same expression", { skip }, () => {
  const work = workerStep();
  const checkout = dispatchSteps().find((s) => String(s.uses ?? "").startsWith("actions/checkout"));
  assert.deepEqual(
    [checkout.with?.token, work.env?.GH_TOKEN, work.with?.github_token],
    [TOKEN_EXPR, TOKEN_EXPR, TOKEN_EXPR],
    "three wirings, one credential. If they ever diverge the worker authenticates as one actor " +
    "for git, another for gh and a third for the action, and the failure surfaces as whichever " +
    "of the three the task happens to need — the hardest shape of this bug to diagnose");
});

// ─── flow-0093: one permission list, in two places, proved identical ─────────────────────────
//
// The list is duplicated on purpose (a workflow header and a doc are read by different people at
// different moments) and the duplication is only safe because this test fails when the copies
// disagree. Normalisation strips what differs between a YAML comment and a Markdown bullet — the
// leading `#`, backticks, emphasis — and joins wrapped continuation lines, so the two files may
// wrap differently but may not say different things.

const PERMISSION_MARKER =
  "FLOW_PAT — required permissions (fine-grained PAT, this repository only, short expiry):";

const normaliseLine = (line) => line.replace(/^\s*#/, "").replace(/[`*]/g, "").trim();

const extractPermissionList = (file) => {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => normaliseLine(l) === PERMISSION_MARKER);
  assert.notEqual(start, -1,
    `${file} must carry the marker line "${PERMISSION_MARKER}" verbatim — it is what makes the ` +
    "list machine-checkable rather than two paragraphs that happen to look similar");
  const entries = [];
  for (const raw of lines.slice(start + 1)) {
    const line = normaliseLine(raw);
    if (line === "") {
      if (entries.length === 0) continue;   // Markdown puts a blank line before the first bullet.
      break;                                // A blank after the list ends it, in both formats.
    }
    if (line.startsWith("- ")) entries.push(line.slice(2));
    else if (entries.length > 0) entries[entries.length - 1] += ` ${line}`;
    else break;
  }
  return entries.map((e) => e.replace(/\s+/g, " ").trim());
};

test("_flow-open-pr.yml's header and the docs carry the same four-permission list", () => {
  const fromWorkflow = extractPermissionList(OPEN_PR);
  const fromDocs = extractPermissionList(DOCS);
  assert.equal(fromWorkflow.length, 4,
    `_flow-open-pr.yml's list must have exactly four entries, found ${fromWorkflow.length}`);
  assert.deepEqual(fromDocs, fromWorkflow,
    "the two copies of the FLOW_PAT permission list have drifted. Whichever a reader trusts, the " +
    "other is now wrong — and a token issued from the short list fails later, at the one step " +
    "that needed the permission it omits. Fix both copies, not just the one you are looking at");
});

test("the permission list names all four permissions, each Read and write", () => {
  const entries = extractPermissionList(OPEN_PR);
  assert.deepEqual(
    entries.map((e) => e.split(":")[0]),
    ["Contents", "Pull requests", "Issues", "Workflows"],
    "all four are load-bearing: Contents for the claim and branch pushes, Pull requests for the " +
    "PR, Issues for the worker filing one, Workflows because GitHub refuses a push touching " +
    ".github/workflows/ without it");
  for (const entry of entries) {
    assert.match(entry, /^[A-Za-z ]+: Read and write — \S/,
      `"${entry}" must read "<Permission>: Read and write — <which workflow needs it, and why>". ` +
      "Read-only on any of the four is a run that fails at a push or a gh call, and the reason " +
      "is what tells the reader which one");
  }
});

test("the docs rule out the Actions PR-creation setting, and say why", () => {
  const docs = readFileSync(DOCS, "utf8");
  assert.match(docs, /do not need the "Allow GitHub Actions to create and approve pull requests"/,
    "the docs must state plainly that the repository setting is not needed — it is the first " +
    "thing a reader reaches for when a workflow cannot open a PR, and reaching for it is wrong");
  const section = docs.slice(docs.indexOf("Allow GitHub Actions to create and approve"));
  assert.match(section, /widen/,
    "the reason must be stated, not just the verdict: the setting only widens GITHUB_TOKEN");
  assert.match(section, /triggers no downstream workflows|no downstream workflows/,
    "and the consequence that makes it actively harmful: a PR created by GITHUB_TOKEN triggers " +
    "no downstream workflows, so flow-gates and the three review checks never run on it — the " +
    "exact silent gate bypass _flow-open-pr exists to prevent");
});

test("changes/flow-0093.md exists and states the caller action", () => {
  const fragment = readFileSync(FRAGMENT, "utf8");
  assert.match(fragment, /FLOW_PAT/,
    "the fragment must name the secret the change is about");
  assert.match(fragment, /Caller action|No caller action/,
    "changes/README.md requires every fragment to say what a caller must do, or say explicitly " +
    "that there is nothing to do. This change needs one: a FLOW_PAT issued before flow-0093 " +
    "lacks Workflows and Issues write, and nothing detects that until a run fails");
  assert.match(fragment, /Workflows/,
    "the caller action is specifically to regenerate the PAT with the documented permissions, " +
    "and Workflows: Read and write is the one an existing token is guaranteed to be missing");
});

// ─── flow-0095: the prose around the caller, which no structure test can carry ───────────────
//
// The forwarding itself is asserted in secrets-scope.test.mjs (see the header note above). What
// remains here is the part that is not a YAML shape: a header that told the reader the reusable
// never used FLOW_PAT, and a changelog fragment telling an adopting repo it must act. The stale
// sentence mattered because FLOW_PAT is optional — a reader who is talked out of setting it gets
// a queue runner that works, and silently cannot push a workflow-file change or trigger the
// checks on its own PR.

const TEMPLATE_CALLER = join(REPO, "project-template/.github/workflows/flow-queue-runner.yml");
const FRAGMENT_0095 = join(REPO, "changes/flow-0095.md");

test("the template caller's header documents FLOW_PAT and points at the permission list", { skip }, () => {
  const source = readFileSync(TEMPLATE_CALLER, "utf8");
  // The header is the comment block above `on:` — the part a human reads before wiring the secret.
  const header = source.slice(0, source.indexOf("\non:"));
  assert.doesNotMatch(header, /FLOW_PAT it never uses|never uses FLOW_PAT/,
    "the header used to justify passing one secret by claiming the reusable never uses FLOW_PAT. " +
    "Since flow-0093 it uses it three times, and the stale sentence is what would talk the next " +
    "reader out of the line this task adds");
  assert.match(header, /FLOW_PAT/,
    "the header must say what FLOW_PAT is for — it is optional, so a reader who does not know " +
    "what it buys will simply not set it");
  assert.match(header, /optional|OPTIONAL/,
    "FLOW_PAT is declared `required: false`; the header must say so, or a reader will think a " +
    "repo without it cannot run the queue runner at all");
  assert.match(header, /\.github\/workflows\//,
    "the header must name the concrete thing the worker cannot do without it: GitHub refuses a " +
    "GITHUB_TOKEN push that changes a file under .github/workflows/");
  assert.match(header, /docs\/flow-reusable-workflows\.md/,
    "and it must point at the permission list flow-0093 wrote, rather than restating it — a " +
    "third copy of that list is a third thing to drift");
});

test("changes/flow-0095.md exists and states the caller action", () => {
  const fragment = readFileSync(FRAGMENT_0095, "utf8");
  assert.match(fragment, /FLOW_PAT/, "the fragment must name the secret the change is about");
  assert.match(fragment, /Caller action/,
    "changes/README.md requires every fragment to say what a caller must do. This change needs " +
    "one twice over: adopt the updated caller, and set the secret it now forwards");
  assert.match(fragment, /flow-sync/,
    "the caller action is specifically to adopt the updated thin caller via flow-sync (or add the " +
    "one FLOW_PAT line by hand) — an adopting repo's existing caller does not change on its own");
});
