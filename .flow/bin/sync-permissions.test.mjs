// sync-permissions.test.mjs — proving tests for flow-0051.
//
// The defect: `_flow-sync.yml` copies canonical's thin callers into the adopting repo's
// `.github/workflows/`, and GitHub refuses any push that creates or modifies a file under that
// directory unless the pushing token carries the `workflows` permission. The workflow granted
// `contents` and `pull-requests` only, so the first sync that added a caller — `flow-compass.yml`,
// a file most repos have never had — died at `git push` with:
//
//   ! [remote rejected] flow-sync/1.3.0 -> flow-sync/1.3.0
//     (refusing to allow a GitHub App to create or update workflow
//      `.github/workflows/flow-compass.yml` without `workflows` permission)
//
// weekly, on a schedule, with nothing reaching a human. Criteria proved here:
//
//   · `_flow-sync.yml`'s permissions block includes `workflows: write`
//   · `project-template/.github/workflows/flow-sync.yml` grants it to the called workflow
//     (a called workflow can never hold a permission its caller withheld, so the caller is the
//     ceiling and both halves are load-bearing)
//   · removing the grant from EITHER file fails, naming the file that lost it — demonstrated by
//     mutating a copy of the real file and re-running the check, not by asserting a literal
//   · removing the copy step fails too: the grant and the copy it exists to serve must not drift
//     apart in either direction. Narrowing the copied surface to dodge the permission is the
//     wrong fix (it turns every future new caller into a manual adopt), so the check is
//     symmetric by construction.
//   · end to end: run the workflow's OWN copy loop against a fixture repo whose
//     `.github/workflows/` lacks a caller canonical ships, and the resulting commit — the diff
//     the sync PR carries — contains that caller.
//
// Why this is canonical's own test rather than the template's: it asserts facts about
// `.github/workflows/_flow-sync.yml`, which exists only here. An adopting repo has the thin
// caller, not the reusable.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE. Same posture as flow-pat-forwarding.test.mjs: `_flow-gates.yml`'s flow-tooling
// job runs `node --test .flow/bin/*.test.mjs` with no install step, so when `yaml` is missing
// these skip *visibly* ("# skipped") instead of crashing the job. They run for real in the
// per-stack gate job, which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-sync.yml");
const CALLER = join(REPO, "project-template/.github/workflows/flow-sync.yml");
const CANON_TPL = join(REPO, "project-template");

// The caller canonical ships that a long-adopted repo has never had. flow-0013 added it, and it is
// the file named in every one of Nudge's rejected pushes.
const NEW_CALLER = "flow-compass.yml";

// ---------------------------------------------------------------------------------------------
// The check, written over file CONTENT rather than paths, so a test can hand it a mutated copy.
// Returns a list of human-readable problems; empty means the pair is coherent.
// ---------------------------------------------------------------------------------------------

/** Every `run:` script in a parsed workflow, concatenated. */
const runScripts = (wf) =>
  Object.values(wf?.jobs ?? {})
    .flatMap((job) => job?.steps ?? [])
    .map((step) => step?.run)
    .filter((run) => typeof run === "string")
    .join("\n");

/** Does this reusable still copy canonical's thin callers into `.github/workflows/`? */
const copiesCallers = (script) =>
  /\$CANON_TPL/.test(script) &&
  /\.github\/workflows\/flow-\*\.yml/.test(script) &&
  /\bcp\b[^\n]*\.github\/workflows\//.test(script);

// Lifted from the shipped `run:` block rather than reimplemented — a paraphrase would prove the
// paraphrase. If this stops matching, the copy step's shape changed: re-read it and update the
// extractor, don't relax it.
const COPY_LOOP =
  /^\s*for f in "\$CANON_TPL"\/\.github\/workflows\/flow-\*\.yml; do$[\s\S]*?^\s*done$/m;

const extractCopyLoop = (reusable) => {
  const match = runScripts(yamlMod.parse(reusable)).match(COPY_LOOP);
  assert.ok(match, "could not find the thin-caller copy loop in _flow-sync.yml's run script — " +
    "it was reshaped; update this extractor and re-verify the behaviour below still holds");
  return match[0];
};

function checkSyncPermissions({ reusable, caller }) {
  const problems = [];
  const reusableWf = yamlMod.parse(reusable);
  const callerWf = yamlMod.parse(caller);

  const copies = copiesCallers(runScripts(reusableWf));
  const reusableGrant = reusableWf?.permissions?.workflows;
  const callerGrant = callerWf?.jobs?.["flow-sync"]?.permissions?.workflows;

  if (!copies) {
    problems.push(
      "_flow-sync.yml no longer copies `.github/workflows/flow-*.yml` from canonical. That copy " +
      "is how canonical ships a NEW thin caller to a repo that has never heard of it; dropping " +
      "it turns every future workflow into a manual adopt (flow-0051, note 4). If the copy is " +
      "genuinely gone, the `workflows: write` grants below are unexplained privilege and must go " +
      "with it — that is why this check is symmetric.",
    );
  }
  if (reusableGrant !== "write") {
    problems.push(
      "_flow-sync.yml: permissions.workflows is " + JSON.stringify(reusableGrant ?? null) +
      ", expected \"write\". Without it every sync that adds or changes a thin caller dies at " +
      "`git push` with \"refusing to allow a GitHub App to create or update workflow ... " +
      "without `workflows` permission\" — silently, on the weekly cron.",
    );
  }
  if (callerGrant !== "write") {
    problems.push(
      "project-template/.github/workflows/flow-sync.yml: jobs.flow-sync.permissions.workflows is " +
      JSON.stringify(callerGrant ?? null) + ", expected \"write\". A called workflow can never " +
      "hold a permission its caller did not grant, so the reusable's own declaration is inert " +
      "without this one — the caller is the ceiling.",
    );
  }
  return problems;
}

const readPair = () => ({
  reusable: readFileSync(REUSABLE, "utf8"),
  caller: readFileSync(CALLER, "utf8"),
});

// ---------------------------------------------------------------------------------------------
// The grants, and the removals that must fail.
// ---------------------------------------------------------------------------------------------

test("_flow-sync.yml and the thin caller both grant `workflows: write`", { skip }, () => {
  assert.deepEqual(checkSyncPermissions(readPair()), [],
    "flow-sync exists to deliver `.github/workflows/flow-*.yml`; it cannot push them without " +
    "`workflows`, and the reusable cannot exceed what the caller granted");
});

test("removing the grant from _flow-sync.yml fails, naming that file", { skip }, () => {
  const pair = readPair();
  const mutated = pair.reusable.replace(/^\s*workflows: write.*$/m, "");
  assert.notEqual(mutated, pair.reusable, "the mutation must actually remove the grant line");

  const problems = checkSyncPermissions({ ...pair, reusable: mutated });
  assert.equal(problems.length, 1, "exactly the reusable's grant is missing: " + problems.join(" | "));
  assert.match(problems[0], /^_flow-sync\.yml:/,
    "the failure must name the file that lost the grant, so the fix is obvious from the log");
});

test("removing the grant from the thin caller fails, naming that file", { skip }, () => {
  const pair = readPair();
  const mutated = pair.caller.replace(/^\s*workflows: write.*$/m, "");
  assert.notEqual(mutated, pair.caller, "the mutation must actually remove the grant line");

  const problems = checkSyncPermissions({ ...pair, caller: mutated });
  assert.equal(problems.length, 1, "exactly the caller's grant is missing: " + problems.join(" | "));
  assert.match(problems[0], /^project-template\/\.github\/workflows\/flow-sync\.yml:/,
    "the failure must name the caller, not the reusable — they are different edits with " +
    "different owners (canonical vs. every adopting repo)");
});

test("removing the copy of `.github/workflows/flow-*.yml` fails too — no silent narrowing", { skip }, () => {
  const pair = readPair();
  // Keep the block scalar's indentation, or the mutant fails as malformed YAML and proves
  // nothing about the check.
  const mutated = pair.reusable.replace(COPY_LOOP, (loop) =>
    loop.match(/^[ \t]*/)[0] + "# (thin-caller copy step removed)");
  assert.notEqual(mutated, pair.reusable, "the mutation must actually remove the copy loop");

  const problems = checkSyncPermissions({ ...pair, reusable: mutated });
  assert.equal(problems.length, 1, "only the copy step is gone: " + problems.join(" | "));
  assert.match(problems[0], /no longer copies/,
    "dropping the copied caller surface to avoid needing the permission is the wrong fix, and " +
    "must fail as loudly as dropping the permission");
});

// ---------------------------------------------------------------------------------------------
// End to end: the workflow's own copy loop, against a repo missing a caller canonical ships.
// ---------------------------------------------------------------------------------------------

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });

test("a sync into a repo lacking a caller commits that caller — the diff the PR carries", { skip }, (t) => {
  const repo = mkdtempSync(join(tmpdir(), "flow-sync-fixture-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  // An adopting repo at an older Flow: it has the callers canonical shipped back then, and has
  // never had NEW_CALLER. This is CandidDan/Nudge's exact shape.
  mkdirSync(join(repo, ".github/workflows"), { recursive: true });
  cpSync(join(CANON_TPL, ".github/workflows"), join(repo, ".github/workflows"), { recursive: true });
  rmSync(join(repo, ".github/workflows", NEW_CALLER));
  writeFileSync(join(repo, ".flow-VERSION"), "1.0.0\n");

  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "flow-bot@users.noreply.github.com");
  git(repo, "config", "user.name", "flow-bot");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "fixture: repo at an older Flow");

  // Run the real loop, with CANON_TPL pointing at canonical's template exactly as the checkout
  // step arranges it in CI.
  execFileSync("bash", ["-euo", "pipefail", "-c", extractCopyLoop(readFileSync(REUSABLE, "utf8"))], {
    cwd: repo,
    env: { ...process.env, CANON_TPL },
  });

  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "flow: adopt canonical Flow infra");
  const diff = git(repo, "diff", "--name-only", "HEAD~1", "HEAD").split("\n").filter(Boolean);

  assert.ok(diff.includes(`.github/workflows/${NEW_CALLER}`),
    `the sync commit must add .github/workflows/${NEW_CALLER} — shipping a caller the repo has ` +
    `never had is what the copy step is for. Got: ${JSON.stringify(diff)}`);
  assert.equal(
    readFileSync(join(repo, ".github/workflows", NEW_CALLER), "utf8"),
    readFileSync(join(CANON_TPL, ".github/workflows", NEW_CALLER), "utf8"),
    "the copied caller must be canonical's, byte for byte",
  );

  // And this is precisely the push GitHub rejects without `workflows`: a diff that creates a file
  // under `.github/workflows/`. The local push in this fixture cannot demonstrate the refusal —
  // it is server-side policy, not git — so assert the named precondition instead.
  assert.ok(diff.some((p) => p.startsWith(".github/workflows/")),
    "the sync diff touches `.github/workflows/`, which is the condition for GitHub's refusal");
  assert.deepEqual(checkSyncPermissions(readPair()), [],
    "…and both permission blocks grant `workflows: write`, which is what makes that push legal");
});
