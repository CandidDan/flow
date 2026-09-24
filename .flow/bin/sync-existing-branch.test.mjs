// sync-existing-branch.test.mjs — proving tests for flow-0075.
//
// WHAT THIS FILE IS ABOUT. `_flow-sync.yml` is the only sanctioned route by which a canonical
// change reaches an adopting repo. Its idempotency check was four lines: if `git ls-remote` found
// `flow-sync/<version>` on origin, log that "a sync PR for <version> is already open" and exit 0.
// It never looked. So a sync PR closed WITHOUT merging left its branch behind, and that version
// could never be offered again — every later run was a green no-op asserting a PR was open when
// none was. The only way out was deleting the branch by hand.
//
// Observed in CandidDan/Nudge: `flow-sync/2.0.0` outlived a closed-unmerged PR (Nudge#286) and
// needed Nudge#297 to clear it. The branch had also been built from an older `v2` on an older
// `main`, so reopening it would have regressed the repo — which is why "the branch exists" is not
// the same question as "the branch is current", and why the head now records a `Canonical-SHA:`
// trailer.
//
// NOTHING FAILED. That is the defect's whole character, and it is why the assertions below are
// about the SHAPE of the shipped workflow as well as its behaviour: a green run that checked
// nothing leaves no evidence behind to test. Each static assertion is therefore proved to fail
// against a mutated copy of the real file — usually the pre-flow-0075 line, restored — because a
// structure check that cannot fail is the same gap one level up.
//
// The behavioural half runs the shipped fact-gathering block for real, under `bash`, against
// shimmed `git` and `gh`, and through the REAL `flow-sync.mjs existing` CLI. Those tests are what
// prove the four verdicts reach the workflow, and that a failed lookup stops the run instead of
// becoming one.
//
// Why this is canonical's own test rather than the template's: it asserts facts about
// `.github/workflows/_flow-sync.yml`, which exists only here. An adopting repo has the thin
// caller, not the reusable. Same reasoning, and the same directory, as sync-surface.test.mjs and
// sync-permissions.test.mjs.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { CANONICAL_SHA_TRAILER } from "../../project-template/.flow/bin/flow-sync.mjs";

// DEPENDENCY NOTE. Same posture as sync-surface.test.mjs and sync-permissions.test.mjs:
// `_flow-gates.yml`'s flow-tooling job runs `node --test .flow/bin/*.test.mjs` with no install
// step, so when `yaml` is missing these skip *visibly* ("# skipped") rather than crashing the job.
// They run for real in the per-stack gate job, which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-sync.yml");
const FLOW_SYNC = join(REPO, "project-template/.flow/bin/flow-sync.mjs");

const readReusable = () => readFileSync(REUSABLE, "utf8");

const VERDICTS = ["create", "rebuild", "refresh", "noop"];

// ---------------------------------------------------------------------------------------------
// Shared shell readers. Lifted from sync-surface.test.mjs's approach for the same reason it gives:
// a comment must never satisfy a check about code, and a shell continuation must never hide half
// a command from a regex.
// ---------------------------------------------------------------------------------------------

/** Every `run:` script in a parsed workflow, concatenated. */
const runScripts = (wf) =>
  Object.values(wf?.jobs ?? {})
    .flatMap((job) => job?.steps ?? [])
    .map((step) => step?.run)
    .filter((run) => typeof run === "string")
    .join("\n");

/** One logical command per line: continuations joined, comments dropped. */
const commandLines = (script) =>
  script
    .replace(/\\\n\s*/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

// ---------------------------------------------------------------------------------------------
// The check, written over file CONTENT so a test can hand it a mutated copy and prove the check
// would have caught the real defect. An empty problem list means the shipped workflow gathers its
// facts, delegates the verdict, forces only under a lease, records the trailer, and never claims a
// PR is open without naming one.
// ---------------------------------------------------------------------------------------------
export function checkExistingBranchHandling(text, yaml) {
  const problems = [];
  const script = runScripts(yaml.parse(text));
  const lines = commandLines(script);

  // 1. THE DEFECT ITSELF. The branch-existence test must no longer be a standalone verdict: a
  //    command group that tests `git ls-remote` and exits 0 inside it is the pre-flow-0075 shape,
  //    whatever it prints. The fact is gathered and handed on; it does not decide anything.
  const lsRemoteEarlyExit = /if\s+\[\s+-n\s+"\$\(git ls-remote[^\n]*\n(?:[^\n]*\n){0,3}?\s*exit 0/m
    .test(script.replace(/\\\n\s*/g, " "));
  if (lsRemoteEarlyExit) {
    problems.push(
      "the `git ls-remote` branch-existence test still exits 0 on its own. That is the flow-0075 " +
      "defect verbatim: branch-exists was read as sync-PR-is-open, so a PR closed without merging " +
      "made its version permanently unofferable while every run went green.",
    );
  }

  // 2. The verdict comes from the decision subcommand, and it is given all four facts. A call
  //    missing the open-PR fact would re-answer the question the old code assumed.
  const call = lines.find((l) => /\$SYNC existing\b|flow-sync\.mjs existing\b/.test(l));
  if (!call) {
    problems.push(
      "no step calls `flow-sync.mjs existing`. The leftover-branch rule is a pure function so it " +
      "can be unit-tested with no network; the workflow gathers facts and acts on the verdict.",
    );
  } else {
    for (const flag of ["--branch-exists", "--open-pr", "--head-canonical-sha", "--canonical-sha"]) {
      if (!call.includes(flag)) {
        problems.push(`the \`existing\` call omits ${flag}, so the verdict is reached from an incomplete set of facts.`);
      }
    }
  }

  // 3. The open-PR fact is actually looked up, and looked up as OPEN. `gh pr list --head <branch>`
  //    without `--state open` would count a closed PR — the Nudge case — as a live one.
  const prLookup = lines.find((l) => /\bgh pr list\b/.test(l));
  if (!prLookup) {
    problems.push(
      "nothing runs `gh pr list` — whether a sync PR is open is the fact the old check asserted " +
      "without ever gathering, and it is still ungathered.",
    );
  } else if (!/--state\s+open/.test(prLookup)) {
    problems.push(
      "`gh pr list` does not pass `--state open`. A PR closed without merging would then count as " +
      "open, which is precisely the Nudge#286 branch that could never be re-offered.",
    );
  }

  // 4. All four verdicts are handled. An unhandled one either falls through silently or trips the
  //    catch-all, and both lose the behaviour the verdict names.
  for (const verdict of VERDICTS) {
    if (!lines.some((l) => new RegExp(`(^|[|(\\s])${verdict}\\)`).test(l))) {
      problems.push(`the workflow has no branch for the \`${verdict}\` verdict, so flow-sync.mjs can return a verdict nothing acts on.`);
    }
  }

  // 5. FORCE-PUSH SAFETY. Every push that forces must do it under a lease, and must target only
  //    `$BRANCH` — the name `flow-sync.mjs branch` computed. A bare `--force` discards whatever a
  //    human pushed to the branch between the lookup and the push, silently.
  for (const line of lines.filter((l) => /\bgit push\b/.test(l))) {
    if (/(^|\s)-f(\s|$)/.test(line) || /--force(?!-with-lease)/.test(line)) {
      problems.push(
        `\`${line}\` force-pushes without a lease. flow-sync/* branches are bot-owned, which is ` +
        `what makes forcing legitimate at all — but --force-with-lease is what makes a human's ` +
        `commit survive instead of vanishing.`,
      );
    }
    const lease = line.match(/--force-with-lease=("?)([^"\s]*)\1/);
    if (lease && !lease[2].startsWith("$BRANCH")) {
      problems.push(
        `\`${line}\` leases a ref other than $BRANCH (${lease[2]}). Only the branch name computed ` +
        `by \`flow-sync.mjs branch\` may ever be force-pushed.`,
      );
    }
    if (lease && !/\borigin "\$BRANCH"/.test(line)) {
      problems.push(`\`${line}\` force-pushes to something other than origin "$BRANCH".`);
    }
  }

  // 6. THE TRAILER, written and read. Written: the sync commit records which canonical commit it
  //    was built from. Read: the next run compares against it. Either half alone is inert.
  const commit = lines.find((l) => /\bgit commit\b/.test(l));
  if (!commit || !new RegExp(`${CANONICAL_SHA_TRAILER}: \\$(\\{)?CANON_SHA`).test(commit)) {
    problems.push(
      `the sync commit carries no \`${CANONICAL_SHA_TRAILER}: $CANON_SHA\` trailer. Without it ` +
      `there is no record of WHICH canonical tree a sync branch was built from — ".flow/VERSION" ` +
      `answers only "which version", and canonical_ref is normally a moving branch.`,
    );
  }
  if (!lines.some((l) => new RegExp(`key=${CANONICAL_SHA_TRAILER}`).test(l))) {
    problems.push(
      `nothing reads the \`${CANONICAL_SHA_TRAILER}\` trailer back, so a branch built from an ` +
      `older canonical cannot be told from a current one and \`refresh\` can never fire.`,
    );
  }

  // 7. LOG WHAT WAS CHECKED, NEVER WHAT WAS ASSUMED. The old line said "a sync PR for $CANON_VER
  //    is already open" having looked up nothing. Any line still making that claim must name the
  //    PR the lookup returned.
  for (const line of lines.filter((l) => /already open/i.test(l))) {
    if (!/OPEN_PR/.test(line)) {
      problems.push(
        `\`${line}\` claims a PR is open without naming the one the lookup returned. That sentence ` +
        `is the flow-0075 bug's voice: it was printed on a path where no lookup had happened.`,
      );
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------------------------
// Static criteria, read off the shipped file.
// ---------------------------------------------------------------------------------------------

test("the shipped _flow-sync.yml delegates the leftover-branch decision and forces only under a lease", { skip }, () => {
  const problems = checkExistingBranchHandling(readReusable(), yamlMod);
  assert.deepEqual(problems, [], `_flow-sync.yml: ${problems.join(" | ")}`);
});

test("restoring the pre-flow-0075 early exit fails the check, by name", { skip }, () => {
  // The exact four lines this task removed, put back in place of the fact-gathering block.
  const text = readReusable();
  const anchor = /^(\s*)# Fact 1 — does the branch exist[\s\S]*?^\s*esac$/m;
  assert.match(text, anchor, "the fact-gathering block must be findable — if not, it was reshaped");
  const mutated = text.replace(anchor, (block, indent) => [
    `${indent}if [ -n "$(git ls-remote --heads origin "$BRANCH")" ]; then`,
    `${indent}  echo "Sync branch '$BRANCH' already exists — a sync PR for $CANON_VER is already open. Idempotent no-op."`,
    `${indent}  exit 0`,
    `${indent}fi`,
  ].join("\n"));
  assert.notEqual(mutated, text, "the mutation must actually restore the old check");

  const problems = checkExistingBranchHandling(mutated, yamlMod);
  assert.ok(problems.some((p) => /still exits 0 on its own/.test(p)),
    `the early exit must be reported: ${problems.join(" | ")}`);
  assert.ok(problems.some((p) => /no step calls `flow-sync\.mjs existing`/.test(p)),
    "and the missing delegation, since the verdict is what replaced it");
  assert.ok(problems.some((p) => /claims a PR is open without naming the one the lookup returned/.test(p)),
    "and the sentence itself — asserting an open PR is what made the no-op look healthy");
});

test("dropping --state open from the PR lookup fails — a closed PR would count as open", { skip }, () => {
  const text = readReusable();
  const mutated = text.replace(/ --state open/, "");
  assert.notEqual(mutated, text, "the mutation must actually drop the flag");

  const problems = checkExistingBranchHandling(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the state filter is gone: ${problems.join(" | ")}`);
  assert.match(problems[0], /does not pass `--state open`/);
  assert.match(problems[0], /Nudge#286/, "the message must name the case it protects");
});

test("baring the force-push fails — a human's commit would vanish", { skip }, () => {
  const text = readReusable();
  const mutated = text.replace('--force-with-lease="$BRANCH:$REMOTE_SHA"', "--force");
  assert.notEqual(mutated, text, "the mutation must actually bare the force");

  const problems = checkExistingBranchHandling(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the lease is gone: ${problems.join(" | ")}`);
  assert.match(problems[0], /force-pushes without a lease/);
});

test("leasing a ref other than $BRANCH fails — nothing else may ever be force-pushed", { skip }, () => {
  const text = readReusable();
  const mutated = text.replace('--force-with-lease="$BRANCH:$REMOTE_SHA"', '--force-with-lease="main:$REMOTE_SHA"');
  assert.notEqual(mutated, text, "the mutation must actually retarget the lease");

  const problems = checkExistingBranchHandling(mutated, yamlMod);
  assert.ok(problems.some((p) => /leases a ref other than \$BRANCH/.test(p)),
    `the retarget must be reported: ${problems.join(" | ")}`);
});

test("$BRANCH is the name flow-sync.mjs computed, not one assembled in the shell", { skip }, () => {
  // The lease and the push both name $BRANCH; this is what makes that name trustworthy.
  const lines = commandLines(runScripts(yamlMod.parse(readReusable())));
  assert.ok(lines.some((l) => /^BRANCH="\$\(\$SYNC branch --canonical "\$CANON_VER"\)"$/.test(l)),
    "BRANCH must be assigned from `$SYNC branch --canonical`, so the only force-pushable name in " +
    "this file is one flow-sync.mjs produced");
});

test("dropping the Canonical-SHA trailer fails — refresh could never fire", { skip }, () => {
  const text = readReusable();
  const mutated = text.replace(' -m "Canonical-SHA: $CANON_SHA"', "");
  assert.notEqual(mutated, text, "the mutation must actually drop the trailer");

  const problems = checkExistingBranchHandling(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the trailer is gone: ${problems.join(" | ")}`);
  assert.match(problems[0], /carries no `Canonical-SHA: \$CANON_SHA` trailer/);
});

test("removing a verdict's branch fails — flow-sync could return one nothing acts on", { skip }, () => {
  for (const verdict of VERDICTS) {
    const text = readReusable();
    // Rename the arm rather than deleting it, so the YAML and the `case` stay well-formed and only
    // the handling of that one verdict disappears.
    const mutated = text.replace(new RegExp(`(^|[|(\\s])${verdict}\\)`, "gm"), `$1unreachable-${verdict})`);
    assert.notEqual(mutated, text, `the mutation must actually remove the ${verdict} arm`);

    const problems = checkExistingBranchHandling(mutated, yamlMod);
    assert.ok(problems.some((p) => p.includes(`no branch for the \`${verdict}\` verdict`)),
      `${verdict} must be reported as unhandled: ${problems.join(" | ")}`);
  }
});

// ---------------------------------------------------------------------------------------------
// The behavioural half. The shipped fact-gathering block, run for real under bash, against shimmed
// `git` and `gh` and the REAL `flow-sync.mjs existing` CLI. A paraphrase would only prove the
// paraphrase — and the thing under test is precisely that the shell asks the right questions and
// obeys the answer.
// ---------------------------------------------------------------------------------------------

const FACTS_REGION = /^\s*# Fact 1 — does the branch exist[\s\S]*?^\s*esac$/m;

const extractFactsRegion = (text) => {
  const match = runScripts(yamlMod.parse(text)).match(FACTS_REGION);
  assert.ok(match, "could not find the fact-gathering block in _flow-sync.yml's run scripts — it " +
    "was reshaped; update this extractor and re-verify the behaviour below still holds");
  return match[0];
};

const SHA_NOW = "f1e2d3c4b5a6978877665544332211aabbccddee";
const SHA_OLD = "0011223344556677889900aabbccddeeff001122";
const BRANCH = "flow-sync/2.0.0";

/**
 * Run the shipped block with `git` and `gh` replaced by shims whose answers come from the
 * environment. Every shim exits non-zero only when asked to, so a failing lookup is a deliberate
 * scenario rather than an accident of the harness.
 */
const runFacts = (t, { lsRemote = "", lsRemoteRc = 0, ghOut = "", ghRc = 0, trailer = "", fetchRc = 0 } = {}) => {
  const bin = mkdtempSync(join(tmpdir(), "flow-0075-shims-"));
  t.after(() => rmSync(bin, { recursive: true, force: true }));

  writeFileSync(join(bin, "git"), [
    "#!/usr/bin/env bash",
    'case "$1" in',
    '  ls-remote)',
    '    if [ "${SHIM_LS_REMOTE_RC}" -ne 0 ]; then echo "fatal: could not read from remote" >&2; exit "${SHIM_LS_REMOTE_RC}"; fi',
    '    printf "%s" "${SHIM_LS_REMOTE}"; exit 0 ;;',
    '  fetch)',
    '    if [ "${SHIM_FETCH_RC}" -ne 0 ]; then echo "fatal: fetch failed" >&2; exit "${SHIM_FETCH_RC}"; fi',
    '    exit 0 ;;',
    // The workflow asks git to parse the trailer, so the shim answers as `--format` would: the
    // value alone, or an empty line when the head carries none.
    '  log) printf "%s\\n" "${SHIM_TRAILER}"; exit 0 ;;',
    'esac',
    "exit 0",
  ].join("\n"));
  writeFileSync(join(bin, "gh"), [
    "#!/usr/bin/env bash",
    'if [ "${SHIM_GH_RC}" -ne 0 ]; then echo "gh: HTTP 502 Bad Gateway" >&2; exit "${SHIM_GH_RC}"; fi',
    'printf "%s" "${SHIM_GH_OUT}"',
  ].join("\n"));
  chmodSync(join(bin, "git"), 0o755);
  chmodSync(join(bin, "gh"), 0o755);

  return spawnSync("bash", ["-euo", "pipefail", "-c", extractFactsRegion(readReusable())], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BRANCH,
      CANON_VER: "2.0.0",
      CANON_SHA: SHA_NOW,
      // The REAL decision CLI — these tests prove the workflow and flow-sync.mjs agree, which a
      // stubbed verdict could not.
      SYNC: `node ${FLOW_SYNC}`,
      SHIM_LS_REMOTE: lsRemote,
      SHIM_LS_REMOTE_RC: String(lsRemoteRc),
      SHIM_GH_OUT: ghOut,
      SHIM_GH_RC: String(ghRc),
      SHIM_TRAILER: trailer,
      SHIM_FETCH_RC: String(fetchRc),
    },
  });
};

const headRef = `${SHA_OLD}\trefs/heads/${BRANCH}`;

test("no sync branch → the workflow reaches `create`", { skip }, (t) => {
  const res = runFacts(t, { lsRemote: "" });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /-> create\b/);
  assert.match(res.stdout, /present=no/, "and logs the fact it was reached from");
  assert.doesNotMatch(res.stdout, /already open/i,
    "nothing may claim a PR is open on a path where no branch, and so no lookup, existed");
});

test("branch exists with NO open PR → `rebuild` (the Nudge#286 case), not a green no-op", { skip }, (t) => {
  const res = runFacts(t, { lsRemote: headRef, ghOut: "", trailer: SHA_NOW });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /-> rebuild\b/);
  assert.match(res.stdout, /open PR=none/, "the lookup happened and answered 'none'");
  assert.doesNotMatch(res.stdout, /already open/i,
    "the sentence that made this bug invisible must not appear when no PR was found");
  assert.match(res.stdout, /closed without merging/,
    "the log must say what it concluded and why, so a reader is not left to guess");
});

test("open PR whose head records a different canonical SHA → `refresh`", { skip }, (t) => {
  const res = runFacts(t, { lsRemote: headRef, ghOut: "286", trailer: SHA_OLD });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /-> refresh\b/);
  assert.match(res.stdout, /open PR=286/);
  assert.match(res.stdout, new RegExp(SHA_OLD), "both SHAs are logged, so the comparison is auditable");
  assert.match(res.stdout, new RegExp(SHA_NOW));
  assert.match(res.stdout, /no second PR is opened/);
});

test("open PR whose head has no Canonical-SHA trailer → `refresh`, not `noop`", { skip }, (t) => {
  // Every branch built before flow-0075 is in this state; absent counts as stale.
  const res = runFacts(t, { lsRemote: headRef, ghOut: "286", trailer: "" });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /-> refresh\b/);
  assert.match(res.stdout, /head Canonical-SHA=<none>/);
});

test("open PR whose head records the same canonical SHA → `noop`, and only then 'already open'", { skip }, (t) => {
  const res = runFacts(t, { lsRemote: headRef, ghOut: "286", trailer: SHA_NOW });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /-> noop\b/);
  assert.match(res.stdout, /already open \(#286\)/,
    "the only path that may say this, and it names the PR the lookup actually returned");
});

test("a failed open-PR lookup fails the run with an ::error naming it — never a verdict", { skip }, (t) => {
  const res = runFacts(t, { lsRemote: headRef, ghRc: 1 });
  assert.equal(res.status, 1, "the run must fail; a sync that cannot see its PRs has decided nothing");
  const annotation = res.stdout.split("\n").find((l) => /::error/.test(l));
  assert.ok(annotation, "the failure must be a GitHub annotation, not a line buried in the log");
  assert.match(annotation, /gh pr list/, "naming the lookup that failed");
  assert.match(annotation, /UNKNOWN/, "and saying the fact is unknown rather than assumed");
  for (const verdict of VERDICTS) {
    assert.doesNotMatch(res.stdout, new RegExp(`-> ${verdict}\\b`),
      `no verdict may be printed when a fact could not be gathered (saw ${verdict})`);
  }
});

test("a failed branch lookup fails the run too — neither answer may be guessed", { skip }, (t) => {
  const res = runFacts(t, { lsRemoteRc: 128 });
  assert.equal(res.status, 1);
  const annotation = res.stdout.split("\n").find((l) => /::error/.test(l));
  assert.ok(annotation, "the failure must be an annotation");
  assert.match(annotation, /ls-remote/, "naming the lookup");
  assert.match(annotation, /force-push over a branch/,
    "and why guessing 'absent' is not the safe default either");
});

test("a failed fetch of the branch head fails the run — the trailer is not assumed absent", { skip }, (t) => {
  // Absent and unreadable are different answers: absent means stale (a rebuild), unreadable means
  // nothing is known. Collapsing them would make a network blip look like a decision.
  const res = runFacts(t, { lsRemote: headRef, ghOut: "286", fetchRc: 128 });
  assert.equal(res.status, 1);
  const annotation = res.stdout.split("\n").find((l) => /::error/.test(l));
  assert.ok(annotation, "the failure must be an annotation");
  assert.match(annotation, /Canonical-SHA:? trailer/i, "naming the fact that could not be read");
});
