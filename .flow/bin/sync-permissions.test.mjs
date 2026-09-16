// sync-permissions.test.mjs — proving tests for flow-0060 (superseding flow-0051's).
//
// flow-0051 diagnosed a real bug — `_flow-sync.yml` could not push the
// `.github/workflows/flow-*.yml` callers it exists to deliver — and fixed it by adding
// `workflows: write` to both permission blocks. There is no such permission. GITHUB_TOKEN's set is
// closed (actions, attestations, checks, contents, deployments, discussions, id-token, issues,
// models, packages, pages, pull-requests, repository-projects, security-events, statuses);
// `workflows` belongs to GitHub Apps and fine-grained PATs, which is exactly WHY GITHUB_TOKEN may
// not push under `.github/workflows/`. GitHub's parser answered the point directly:
//
//   failed to parse workflow: (Line: 43, Col: 7): Unexpected value 'workflows'
//
// So the workflow stopped starting at all, in canonical and in every repo that had adopted it —
// strictly worse than the push failure it replaced.
//
// THIS FILE USED TO ASSERT THE STRING `workflows: write` WAS PRESENT. That is the fourth of the
// five checks flow-0060 found passing on a change that could not run: a test that pins the wrong
// thing in place is worse than no test, because it makes removing the defect look like a
// regression. Every assertion below would have FAILED against the broken tree. Criteria proved:
//
//   · neither `_flow-sync.yml` nor the published thin caller declares a `workflows:` permission
//     key, at workflow level or job level — it is not a key that exists
//   · `_flow-sync.yml`'s checkout of the repo being synced takes `token: secrets.FLOW_PAT`, so
//     the `git push` is authenticated by a credential that CAN carry the workflows scope. This is
//     the actual fix: a credential, not a permission
//   · a step earlier than the push fails the run when FLOW_PAT is unset, naming FLOW_PAT and
//     Workflows: Write — not GitHub's opaque refusal forty lines later
//   · each of those, removed from a mutated copy of the real file, fails the check by name
//   · removing the copy step fails too: the copied caller surface is WHY the credential is
//     needed, so narrowing it to dodge the requirement must fail as loudly
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

const REUSABLE_LABEL = "_flow-sync.yml";
const CALLER_LABEL = "project-template/.github/workflows/flow-sync.yml";

// The caller canonical ships that a long-adopted repo has never had. flow-0013 added it, and it is
// the file named in every one of Nudge's rejected pushes.
const NEW_CALLER = "flow-compass.yml";

// The credential the push must be made with. Compared as the literal expression, because what
// `actions/checkout` persists as the remote credential is decided by this exact string.
const FLOW_PAT_EXPR = "${{ secrets.FLOW_PAT }}";

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

/** [path, block] for the workflow-level permissions block and every job's. */
const permissionBlocks = (wf) => {
  const blocks = [["permissions", wf?.permissions]];
  for (const [id, job] of Object.entries(wf?.jobs ?? {})) {
    if (job && typeof job === "object") blocks.push([`jobs.${id}.permissions`, job.permissions]);
  }
  return blocks;
};

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

const syncSteps = (wf) => wf?.jobs?.sync?.steps ?? [];

function checkSyncCredential({ reusable, caller }) {
  const problems = [];
  const reusableWf = yamlMod.parse(reusable);
  const callerWf = yamlMod.parse(caller);

  // 1. `workflows` is not a GITHUB_TOKEN permission. Neither file may name it, anywhere.
  for (const [label, wf] of [[REUSABLE_LABEL, reusableWf], [CALLER_LABEL, callerWf]]) {
    for (const [where, block] of permissionBlocks(wf)) {
      if (block && typeof block === "object" && Object.keys(block).includes("workflows")) {
        problems.push(
          `${label}: ${where} declares 'workflows'. That is not a GITHUB_TOKEN permission — the ` +
          "set is closed and does not contain it — so GitHub refuses to parse the whole file: " +
          "\"Unexpected value 'workflows'\". The workflow does not start. The scope must come " +
          "from FLOW_PAT, passed to actions/checkout as `token:`.",
        );
      }
    }
  }

  // 2. The copy step is why a workflows-scoped credential is needed at all.
  if (!copiesCallers(runScripts(reusableWf))) {
    problems.push(
      `${REUSABLE_LABEL} no longer copies \`.github/workflows/flow-*.yml\` from canonical. That ` +
      "copy is how canonical ships a NEW thin caller to a repo that has never heard of it; " +
      "dropping it turns every future workflow into a manual adopt (flow-0051, note 4). If the " +
      "copy is genuinely gone, the FLOW_PAT requirement below is unexplained privilege and must " +
      "go with it — that is why this check is symmetric.",
    );
  }

  // 3. THE FIX: the push credential. checkout persists its `token:` as the remote credential, so
  //    this line and not the permissions block decides who `git push` authenticates as.
  const steps = syncSteps(reusableWf);
  const checkout = steps.find(
    (s) => String(s?.uses ?? "").startsWith("actions/checkout") && !s?.with?.repository,
  );
  if (!checkout) {
    problems.push(
      `${REUSABLE_LABEL}: no \`actions/checkout\` step for the repo being synced — the push ` +
      "credential cannot be verified. Re-read the job and update this check.",
    );
  } else if (checkout.with?.token !== FLOW_PAT_EXPR) {
    problems.push(
      `${REUSABLE_LABEL}: the checkout of the synced repo has token ` +
      JSON.stringify(checkout.with?.token ?? null) + `, expected ${JSON.stringify(FLOW_PAT_EXPR)}. ` +
      "Left at its default it is GITHUB_TOKEN, and a push that creates or modifies a file under " +
      "`.github/workflows/` is refused server-side however the permissions block is written. " +
      "Only a fine-grained PAT can carry the workflows scope.",
    );
  }

  // 4. The preflight, and that it really is pre-flight — before the push, not after it.
  const pushIdx = steps.findIndex((s) => /git push/.test(String(s?.run ?? "")));
  const guardIdx = steps.findIndex(
    (s) =>
      /FLOW_PAT/.test(String(s?.run ?? "")) &&
      /Workflows: Write/.test(String(s?.run ?? "")) &&
      /exit 1/.test(String(s?.run ?? "")),
  );
  if (pushIdx < 0) {
    problems.push(`${REUSABLE_LABEL}: no step runs \`git push\` — re-read the job and update this check.`);
  } else if (guardIdx < 0) {
    problems.push(
      `${REUSABLE_LABEL}: no step fails the run when FLOW_PAT is unset while naming FLOW_PAT and ` +
      "Workflows: Write. Without it the run dies at `git push` with GitHub's \"refusing to allow " +
      "a GitHub App to create or update workflow ... without `workflows` permission\", which " +
      "names neither the secret nor the scope — the opacity that cost flow-0051 weeks.",
    );
  } else if (guardIdx > pushIdx) {
    problems.push(
      `${REUSABLE_LABEL}: the FLOW_PAT check runs at step ${guardIdx}, after the push at step ` +
      `${pushIdx}. A check that fires after the failure it predicts is not a preflight.`,
    );
  }

  return problems;
}

const readPair = () => ({
  reusable: readFileSync(REUSABLE, "utf8"),
  caller: readFileSync(CALLER, "utf8"),
});

// ---------------------------------------------------------------------------------------------
// The shipped pair, and the mutations that must fail.
// ---------------------------------------------------------------------------------------------

test("the shipped reusable and thin caller are coherent: no invalid key, and FLOW_PAT pushes", { skip }, () => {
  assert.deepEqual(checkSyncCredential(readPair()), [],
    "flow-sync exists to deliver `.github/workflows/flow-*.yml`; only a token carrying the " +
    "workflows scope may push them, and no permissions block can grant that scope");
});

test("re-adding `workflows: write` to _flow-sync.yml fails, naming that file", { skip }, () => {
  const pair = readPair();
  // The exact regression: flow-0051's line, back in flow-0051's place.
  const mutated = pair.reusable.replace(
    /^permissions:\n/m, "permissions:\n  workflows: write\n");
  assert.notEqual(mutated, pair.reusable, "the mutation must actually add the key");

  const problems = checkSyncCredential({ ...pair, reusable: mutated });
  assert.equal(problems.length, 1, "exactly the invalid key: " + problems.join(" | "));
  assert.match(problems[0], /^_flow-sync\.yml: permissions declares 'workflows'/,
    "the failure must name the file and the block, so the fix is obvious from the log");
  assert.match(problems[0], /does not start/,
    "and must say the consequence — an unparseable workflow is not a degraded workflow");
});

test("re-adding it to the thin caller's job block fails, naming the caller", { skip }, () => {
  const pair = readPair();
  const mutated = pair.caller.replace(
    /^      pull-requests: write$/m, "      pull-requests: write\n      workflows: write");
  assert.notEqual(mutated, pair.caller, "the mutation must actually add the key");

  const problems = checkSyncCredential({ ...pair, caller: mutated });
  assert.equal(problems.length, 1, "exactly the invalid key: " + problems.join(" | "));
  assert.match(problems[0], /^project-template\/\.github\/workflows\/flow-sync\.yml: jobs\.flow-sync\.permissions/,
    "the failure must name the caller, not the reusable — they are different edits with " +
    "different owners (canonical vs. every adopting repo)");
});

test("dropping `token: secrets.FLOW_PAT` from the checkout fails — that IS the fix", { skip }, () => {
  const pair = readPair();
  const mutated = pair.reusable.replace(/^          token: \$\{\{ secrets\.FLOW_PAT \}\}$/m, "");
  assert.notEqual(mutated, pair.reusable, "the mutation must actually remove the token line");

  const problems = checkSyncCredential({ ...pair, reusable: mutated });
  assert.equal(problems.length, 1, "exactly the push credential is gone: " + problems.join(" | "));
  assert.match(problems[0], /the checkout of the synced repo has token null/);
  assert.match(problems[0], /GITHUB_TOKEN/,
    "the message must say what the default silently becomes — the whole defect is that the " +
    "absence looks like nothing at all");
});

test("removing the FLOW_PAT preflight fails — the run must not die at the push instead", { skip }, () => {
  const pair = readPair();
  const mutated = pair.reusable.replace(/^          set -euo pipefail\n          if \[ -z "\$\{FLOW_PAT\}" \][\s\S]*?\n          fi\n/m,
    "          echo noop\n");
  assert.notEqual(mutated, pair.reusable, "the mutation must actually remove the guard");

  const problems = checkSyncCredential({ ...pair, reusable: mutated });
  assert.equal(problems.length, 1, "only the preflight is gone: " + problems.join(" | "));
  assert.match(problems[0], /no step fails the run when FLOW_PAT is unset/);
  assert.match(problems[0], /Workflows: Write/,
    "the replacement must name the scope, or the operator still has to go and find out why");
});

test("removing the copy of `.github/workflows/flow-*.yml` fails too — no silent narrowing", { skip }, () => {
  const pair = readPair();
  // Keep the block scalar's indentation, or the mutant fails as malformed YAML and proves
  // nothing about the check.
  const mutated = pair.reusable.replace(COPY_LOOP, (loop) =>
    loop.match(/^[ \t]*/)[0] + "# (thin-caller copy step removed)");
  assert.notEqual(mutated, pair.reusable, "the mutation must actually remove the copy loop");

  const problems = checkSyncCredential({ ...pair, reusable: mutated });
  assert.equal(problems.length, 1, "only the copy step is gone: " + problems.join(" | "));
  assert.match(problems[0], /no longer copies/,
    "dropping the copied caller surface to avoid needing the credential is the wrong fix, and " +
    "must fail as loudly as dropping the credential");
});

test("the preflight's message names the secret AND the scope AND how to set it", { skip }, () => {
  const wf = yamlMod.parse(readFileSync(REUSABLE, "utf8"));
  const guard = syncSteps(wf).find((s) => /FLOW_PAT/.test(String(s?.run ?? "")) && /exit 1/.test(String(s?.run ?? "")));
  assert.ok(guard, "the preflight step must exist");
  const script = String(guard.run);
  assert.match(script, /::error/, "it must be a GitHub annotation, not a line buried in the log");
  assert.match(script, /Workflows: Write/, "the scope the PAT needs");
  assert.match(script, /fine-grained PAT/, "the KIND of token — a classic PAT's scopes are named differently");
  assert.match(script, /flow-sync\.yml caller/, "where to forward it from");
  assert.ok(!/\$\{\{ *secrets\./.test(script),
    "the secret must reach the script through `env:`, never interpolated into the shell source");
});

test("the reusable authenticates `gh` with FLOW_PAT and no GITHUB_TOKEN fallback", { skip }, () => {
  const wf = yamlMod.parse(readFileSync(REUSABLE, "utf8"));
  const adopt = syncSteps(wf).find((s) => /git push/.test(String(s?.run ?? "")));
  assert.ok(adopt, "the adopt step must exist");
  assert.equal(adopt.env?.GH_TOKEN, FLOW_PAT_EXPR,
    "a `|| github.token` fallback would let `gh pr create` succeed on a run whose push could " +
    "never have been legal — the preflight already proved FLOW_PAT is set");
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

  // And this is precisely the push GitHub rejects unless the pushing token carries the workflows
  // scope: a diff that creates a file under `.github/workflows/`. The local push in this fixture
  // cannot demonstrate the refusal — it is server-side policy, not git — so assert the named
  // precondition instead, and then that the credential which satisfies it is wired up.
  assert.ok(diff.some((p) => p.startsWith(".github/workflows/")),
    "the sync diff touches `.github/workflows/`, which is the condition for GitHub's refusal");
  assert.deepEqual(checkSyncCredential(readPair()), [],
    "…and the push is made by FLOW_PAT, which is what makes it legal. Note what this test can " +
    "and cannot prove: a fixture repo has no GitHub server to refuse it, so the proof that the " +
    "real push now succeeds is a real sync run in an adopting repo, not anything runnable here.");
});
