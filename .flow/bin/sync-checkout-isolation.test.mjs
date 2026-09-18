// sync-checkout-isolation.test.mjs — proving tests for flow-0064.
//
// `_flow-sync.yml` used to fetch canonical with a second `actions/checkout` at
// `path: .flow-canonical`. The first checkout lands at the workspace root, so that path sat INSIDE
// the working tree of the repo being synced. `git add -A` then staged it, and because the
// directory carries its own `.git`, git cannot store it as a tree: it records a GITLINK — a
// submodule entry — and nothing writes a `.gitmodules` stanza for it. Both of the first two real
// sync PRs (CandidDan/TanPlan#26, CandidDan/Nudge#286) carried one, and every job afterwards ended:
//
//   fatal: No url found for submodule path '.flow-canonical' in .gitmodules
//   ##[warning]The process '/usr/bin/git' failed with exit code 128
//
// Merging such a PR writes the entry into the adopting repo's history permanently, after which
// `git clone --recurse-submodules` fails outright for anyone cloning it.
//
// WHY THE OBVIOUS FIX IS NOT AVAILABLE, which is the fact these tests exist to pin. `path:` is
// documented as a relative path under `$GITHUB_WORKSPACE` and `actions/checkout` refuses anything
// outside it. With two checkout steps the second tree is therefore ALWAYS inside the first — the
// collision is structural to the approach, not a badly chosen string. So the fix removes the
// second checkout entirely and clones into `$RUNNER_TEMP`, which a plain `git clone` may do.
// CandidDan/flow is public, which is why the step being replaced passed no token either.
//
// An ignore rule (`.git/info/exclude`, or an `-- ':(exclude)…'` pathspec on the `git add`) would
// also have silenced it, and was rejected: it leaves a second full checkout of canonical sitting
// inside the repo being synced, one missed pattern or one `git add -f` away from the same commit.
// The assertions below are written so that reintroducing the checkout fails even if an ignore rule
// is added alongside it.
//
// Why this is canonical's own test rather than the template's: it asserts facts about
// `.github/workflows/_flow-sync.yml`, which exists only here. An adopting repo has the thin
// caller, not the reusable. Same reasoning, and the same directory, as sync-permissions.test.mjs.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE. Same posture as sync-permissions.test.mjs: `_flow-gates.yml`'s flow-tooling job
// runs `node --test .flow/bin/*.test.mjs` with no install step, so when `yaml` is missing these
// skip *visibly* ("# skipped") rather than crashing the job. They run for real in the per-stack
// gate job, which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-sync.yml");

// ---------------------------------------------------------------------------------------------
// The check, written over file CONTENT rather than a path, so a test can hand it a mutated copy
// and prove the check would have caught the real defect. Returns human-readable problems; an
// empty list means the workflow keeps canonical's tree out of the synced repo's working tree.

// Shell line continuations make a single logical command span several lines, and a regex written
// with `[^\n]*` silently stops at the first of them. Assertions about a command's WHOLE form have
// to see it whole, so they run over this rather than the raw script.
export function joinContinuations(script) {
  return script.replace(/\\\n\s*/g, " ");
}

// The command lines of a shell script, continuations joined and comments dropped. Comments are
// dropped because this file's own prose explains why `--` is right for `git clone` and wrong for
// `git checkout` — and a naive scan for `git clone` matched that sentence and asserted against it.
export function commandLines(script) {
  return joinContinuations(script)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export function checkCheckoutIsolation(text, yaml) {
  const problems = [];
  const doc = yaml.parse(text);

  for (const [jobName, job] of Object.entries(doc?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      const uses = typeof step?.uses === "string" ? step.uses : "";

      // Any `path:` on a checkout is inside $GITHUB_WORKSPACE by the action's own contract, and
      // the repo being synced is checked out at the workspace root — so any path at all nests one
      // git tree inside another. There is no safe value, which is why this rejects the key rather
      // than inspecting what it was set to.
      if (uses.startsWith("actions/checkout@") && step?.with?.path !== undefined) {
        problems.push(
          `job '${jobName}', step '${step.name ?? uses}': actions/checkout declares ` +
          `path: '${step.with.path}'. That path resolves under $GITHUB_WORKSPACE, which is the ` +
          `working tree of the repo being synced, so 'git add -A' records it as a gitlink.`,
        );
      }

      // The rsync source. If it is ever reassigned to a relative path, the tree is back inside the
      // working tree even with no checkout step to blame.
      const run = typeof step?.run === "string" ? step.run : "";
      for (const m of run.matchAll(/^\s*CANON_TPL=(.+)$/gm)) {
        const value = m[1].trim();
        if (!/\$\{?(CANON_DIR|RUNNER_TEMP)\b/.test(value)) {
          problems.push(
            `job '${jobName}', step '${step.name ?? "run"}': CANON_TPL is set to ${value}, ` +
            `which is not derived from $CANON_DIR or $RUNNER_TEMP — canonical's tree would sit ` +
            `inside the synced repo's working tree.`,
          );
        }
      }
    }
  }
  return problems;
}

// The pre-fix step, verbatim in shape: this is what the workflow carried when both sync PRs were
// opened. Used to prove the check above fails against the real defect rather than only passing
// against the repaired file.
const BROKEN_STEP = [
  "      - name: Checkout canonical",
  "        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0",
  "        with:",
  "          repository: CandidDan/flow",
  "          ref: ${{ inputs.canonical_ref || 'v2' }}",
  "          path: .flow-canonical",
].join("\n");

const MINIMAL_BROKEN = [
  "name: t",
  "on: { workflow_call: {} }",
  "jobs:",
  "  flow-sync:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  BROKEN_STEP,
  "      - name: Adopt canonical infra if behind",
  "        run: |",
  '          CANON_TPL=".flow-canonical/project-template"',
  '          echo "$CANON_TPL"',
].join("\n");

// ---------------------------------------------------------------------------------------------

test("the shipped _flow-sync.yml keeps canonical's tree out of the synced repo", { skip }, () => {
  const problems = checkCheckoutIsolation(readFileSync(REUSABLE, "utf8"), yamlMod);
  assert.deepEqual(problems, [], `_flow-sync.yml: ${problems.join(" | ")}`);
});

test("the check FAILS against the workflow as it stood when both sync PRs broke", { skip }, () => {
  const problems = checkCheckoutIsolation(MINIMAL_BROKEN, yamlMod);
  // Both halves of the defect are named: the checkout that creates the nested tree, and the
  // relative rsync source that depends on it. A check that caught only one would pass a file that
  // fixed only one.
  assert.equal(problems.length, 2, `expected both problems, got: ${problems.join(" | ")}`);
  assert.match(problems[0], /actions\/checkout declares path: '\.flow-canonical'/);
  assert.match(problems[1], /CANON_TPL is set to/);
});

test("reintroducing the checkout is caught even at a different path", { skip }, () => {
  const text = readFileSync(REUSABLE, "utf8").replace(
    /^jobs:$/m,
    ["jobs:",
     "  smuggled:",
     "    runs-on: ubuntu-latest",
     "    steps:",
     "      - uses: actions/checkout@v4",
     "        with:",
     "          path: vendor/canonical",
    ].join("\n"),
  );
  const problems = checkCheckoutIsolation(text, yamlMod);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /path: 'vendor\/canonical'/);
});

test("the shipped workflow clones canonical under RUNNER_TEMP and exports it", { skip }, () => {
  const text = readFileSync(REUSABLE, "utf8");
  const doc = yamlMod.parse(text);
  const runs = Object.values(doc.jobs)
    .flatMap((j) => j.steps ?? [])
    .map((s) => (typeof s.run === "string" ? s.run : ""))
    .join("\n");

  assert.match(runs, /CANON_DIR="\$\{RUNNER_TEMP\}\/flow-canonical"/,
    "the clone must target $RUNNER_TEMP, which is outside $GITHUB_WORKSPACE");
  assert.match(runs, /echo "CANON_DIR=\$\{CANON_DIR\}" >> "\$GITHUB_ENV"/,
    "later steps read CANON_DIR from the environment, so the clone step must export it");

  // EVERY clone is checked, not whichever one happened to fit on a single line. The first version
  // of this assertion was `/git clone[^\n]*(secrets\.|…)/` over the raw text, and the shallow
  // clone line-continues with `\` before its URL — so `[^\n]*` stopped at the newline and the
  // check never reached the thing it existed to inspect. It passed while blind, which is the
  // failure mode sync-permissions.test.mjs names in its own header: a test that pins the wrong
  // thing is worse than no test. Raised by this PR's code review; verified by mutation (splicing
  // a credential into the shallow clone left the old assertion green) before being replaced.
  const clones = commandLines(runs).filter((l) => /(^|[^\w-])git clone\b/.test(l));

  assert.ok(clones.length >= 2,
    `expected the shallow clone and its full-clone fallback; found ${clones.length}`);

  for (const cmd of clones) {
    // Public by design: CandidDan/flow is public, and the actions/checkout step this replaced
    // passed no token either. A credential here would be a new secret in a shell command — a
    // different and worse thing than the bug being fixed.
    assert.doesNotMatch(cmd, /secrets\.|x-access-token|:[^/@\s]+@github\.com/,
      `a canonical clone carries a credential: ${cmd}`);
    assert.match(cmd, /(^|\s)https:\/\/github\.com\/CandidDan\/flow\.git(\s|$)/,
      `a canonical clone does not target the expected public URL: ${cmd}`);
  }
});

test("a canonical_ref starting with '-' is refused, and the checkout form is the safe one", { skip }, () => {
  const runs = Object.values(yamlMod.parse(readFileSync(REUSABLE, "utf8")).jobs)
    .flatMap((j) => j.steps ?? [])
    .map((s) => (typeof s.run === "string" ? s.run : ""))
    .join("\n");

  assert.match(runs, /case "\$CANONICAL_REF" in\s*\n\s*-\*\)/,
    "a ref beginning with '-' is rejected up front rather than defended against per-command");

  // flow-0064's security review proposed `git checkout -- "$CANONICAL_REF"`. In `git checkout`,
  // `--` separates revisions from PATHS, so that form looks for a FILE named e.g. `v2` and exits 1
  // with `pathspec 'v2' did not match any file(s) known to git`. It would have broken the SHA
  // fallback. This pins the correct ordering so the suggestion cannot be re-applied later.
  assert.doesNotMatch(runs, /checkout[^\n]*\s--\s+"\$CANONICAL_REF"/,
    "a LEADING `--` before the ref makes git read it as a pathspec, not a revision");
  assert.match(runs, /checkout --quiet "\$CANONICAL_REF" --/,
    "the separator belongs after the revision, where it means 'that was a rev, not a path'");
});

test("a failed shallow clone replays git's own error instead of asserting a cause", { skip }, () => {
  const runs = Object.values(yamlMod.parse(readFileSync(REUSABLE, "utf8")).jobs)
    .flatMap((j) => j.steps ?? [])
    .map((s) => (typeof s.run === "string" ? s.run : ""))
    .join("\n");

  // flow-0049's defect class, guarded at the point it would otherwise be reintroduced: the retry
  // message used to say "a commit SHA reaches here", which is a CAUSE it has not established. A
  // network failure or a deleted tag arrives by the same branch and would have been reported as a
  // SHA. git's stderr is captured and replayed so the real reason survives.
  assert.doesNotMatch(runs, /git clone[^\n]*2>\/dev\/null/,
    "discarding git's stderr leaves the retry message as the only diagnostic");
  assert.match(runs, /2>"\$CLONE_ERR"/, "the shallow clone's stderr is captured");
  assert.match(runs, /sed 's\/\^\/ {2}\/' "\$CLONE_ERR"/, "…and replayed before the retry");
  assert.doesNotMatch(runs, /retrying as a full clone \(a commit SHA reaches here\)/,
    "the message must not assert a cause it has not established");
});

test("the credential check now catches a token in the LINE-CONTINUED clone", { skip }, () => {
  // The regression this guards is the assertion's own blindness, not the workflow's behaviour.
  // Mutate the shallow clone — the line-continued one — and the check must go red. The version
  // this replaced stayed green against exactly this mutation.
  const mutated = readFileSync(REUSABLE, "utf8")
    .replace("-- https://github.com/CandidDan/flow.git",
             "-- https://x-access-token:TOKEN@github.com/CandidDan/flow.git");

  const clones = commandLines(mutated).filter((l) => /(^|[^\w-])git clone\b/.test(l));

  const caught = clones.filter((c) => /secrets\.|x-access-token|:[^/@\s]+@github\.com/.test(c));
  assert.equal(caught.length, 1,
    "a credential spliced into the shallow clone must be seen; the old [^\\n]* form never was");
  assert.match(caught[0], /--depth 1/, "…and it is the shallow clone that was caught, not the fallback");
});

// ---------------------------------------------------------------------------------------------
// The mechanism, reproduced. The assertions above are about the workflow's text; this one proves
// the thing the text is avoiding is real, so that nobody later reads the rule as superstition.

test("a nested checkout inside the working tree really is staged as a gitlink", () => {
  const root = mkdtempSync(join(tmpdir(), "flow-0064-"));
  const git = (cwd, ...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  try {
    const outer = join(root, "outer");
    mkdirSync(outer);
    git(outer, "init", "--quiet", "-b", "main");
    git(outer, "config", "user.email", "t@example.com");
    git(outer, "config", "user.name", "t");
    writeFileSync(join(outer, "README.md"), "outer\n");

    // The nested clone, exactly where the old `path: .flow-canonical` put it.
    const nested = join(outer, ".flow-canonical");
    mkdirSync(nested);
    git(nested, "init", "--quiet", "-b", "main");
    git(nested, "config", "user.email", "t@example.com");
    git(nested, "config", "user.name", "t");
    writeFileSync(join(nested, "VERSION"), "2.0.0\n");
    git(nested, "add", "-A");
    git(nested, "commit", "--quiet", "-m", "inner");

    git(outer, "add", "-A");
    const staged = git(outer, "ls-files", "--stage");

    // Mode 160000 is git's gitlink mode. Its presence with no .gitmodules is the whole defect.
    const gitlinks = staged.split("\n").filter((l) => l.startsWith("160000"));
    assert.equal(gitlinks.length, 1, `expected the nested repo to stage as a gitlink:\n${staged}`);
    assert.match(gitlinks[0], /\.flow-canonical$/);
    assert.doesNotMatch(staged, /\.gitmodules/,
      "and nothing writes the .gitmodules entry that would make it a valid submodule");

    // The fix's premise: the same clone outside the working tree is invisible to `git add -A`.
    const outside = join(root, "canonical-temp");
    mkdirSync(outside);
    git(outside, "init", "--quiet", "-b", "main");
    writeFileSync(join(outside, "VERSION"), "2.0.0\n");

    rmSync(nested, { recursive: true, force: true });
    git(outer, "rm", "--quiet", "--cached", "-r", ".flow-canonical");
    git(outer, "add", "-A");
    assert.doesNotMatch(git(outer, "ls-files", "--stage"), /^160000/m,
      "with canonical cloned outside the working tree, no gitlink can be staged");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
