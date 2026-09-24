// sync-surface.test.mjs — proving tests for flow-0048.
//
// WHAT THIS FILE IS ABOUT. `_flow-sync.yml` is the only sanctioned route by which a change made in
// canonical reaches a repo that has adopted Flow. Its copied surface was, for four releases,
// exactly three things: `.flow/bin/`, `.github/workflows/flow-*.yml`, and the `.flow/VERSION`
// stamp. `.flow/PROTOCOL.md` was not among them — `flow-init` copies it once, at adoption, and
// nothing refreshed it afterwards. An adopting repo's protocol was therefore frozen at whatever
// version it adopted, permanently, through any number of syncs.
//
// The protocol is not documentation. It is the contract every session reads before doing anything,
// and the file that decides when a worker stops, so a bug in it stops workers. 1.3.1 fixed a
// session-hygiene trip condition that fired on routine harness-side truncation; until then every
// fresh worker session in CandidDan/later claimed its task, ran one search, wrote a handoff and
// ended before implementation began (`later-0010` sat `in_progress` with an empty `branch` and
// `pr`). The fix shipped in canonical, cleared all three reviewers, and could not reach that repo
// by any sanctioned route: both of its reviewers blocked the hand-patch and told the worker to use
// flow-sync, and flow-sync could not carry the file. It merged as a knowing exception,
// CandidDan/later#14.
//
// The second-order failure is worse than the first. The STAMP moved without the content: a sync to
// 1.3.1 wrote `1.3.1` into `.flow/VERSION` while leaving the protocol untouched, after which
// `flow-sync decide` — which compares stamps and nothing else — answered `current` and the repo
// stopped being told it was behind, while running a protocol it had never adopted. That is the same
// shape as the 2026-08-19 `release-guard.mjs` header incident arriving through the sync path, and
// the release guard cannot see it because the stamp and the tag agree. Only the tree disagrees.
//
// WHY A SURFACE TEST AND NOT A BEHAVIOUR TEST OF THE WORKFLOW. The bug was not a wrong line; it
// was an ABSENT one, and nothing failed. So the assertions below are about what the copy step
// copies, and each is proved to fail against a mutated copy of the shipped file — a surface test
// that cannot fail is the same gap one level up, which is the gap being closed here.
//
// Why this is canonical's own test rather than the template's: it asserts facts about
// `.github/workflows/_flow-sync.yml`, which exists only here. An adopting repo has the thin caller,
// not the reusable. Same reasoning, and the same directory, as sync-permissions.test.mjs and
// sync-checkout-isolation.test.mjs.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { prContent } from "../../project-template/.flow/bin/flow-sync.mjs";

// DEPENDENCY NOTE. Same posture as sync-permissions.test.mjs: `_flow-gates.yml`'s flow-tooling job
// runs `node --test .flow/bin/*.test.mjs` with no install step, so when `yaml` is missing these
// skip *visibly* ("# skipped") rather than crashing the job. They run for real in the per-stack
// gate job, which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-sync.yml");
const CANON_TPL = join(REPO, "project-template");

// The file this whole task exists for, written the way the workflow writes it (a path relative to
// the repo being synced) because that string is what the assertions match on.
const PROTOCOL = ".flow/PROTOCOL.md";

// The two files that are the same CLASS as the protocol — canonical-authored, copied at init, never
// refreshed — but which are excluded, because each carries a `## Project notes` section holding
// context that exists nowhere else. flow-0048 requires the exclusion be stated, not silent: a
// silent omission is precisely how the protocol fell off this surface.
const HOST_FILES = ["AGENTS.md", "CLAUDE.md"];

const readReusable = () => readFileSync(REUSABLE, "utf8");

// ---------------------------------------------------------------------------------------------
// The check, written over file CONTENT rather than a path, so a test can hand it a mutated copy and
// prove the check would have caught the real defect. Returns human-readable problems; an empty list
// means the copied surface includes the protocol and accounts for the two host files.
// ---------------------------------------------------------------------------------------------

/** Every `run:` script in a parsed workflow, concatenated. */
const runScripts = (wf) =>
  Object.values(wf?.jobs ?? {})
    .flatMap((job) => job?.steps ?? [])
    .map((step) => step?.run)
    .filter((run) => typeof run === "string")
    .join("\n");

/**
 * Shell line continuations make one logical command span several lines, and a regex written with
 * `[^\n]*` silently stops at the first of them — the exact blindness sync-checkout-isolation's
 * header records paying for twice. Join them before matching command shapes.
 */
export const joinContinuations = (script) => script.replace(/\\\n\s*/g, " ");

/**
 * The command lines of a shell script: continuations joined, comments dropped. Comments MUST be
 * dropped here, because the workflow's own copy step explains in prose why AGENTS.md and CLAUDE.md
 * are excluded — a naive scan for `cp` near `CLAUDE.md` would match that sentence and conclude the
 * file was being copied.
 */
export const commandLines = (script) =>
  joinContinuations(script)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

/** Just the comment lines, which is where an exclusion has to justify itself. */
const commentLines = (script) =>
  script.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("#"));

/**
 * Does `script` contain a command that copies `file` out of canonical's template and into the repo
 * being synced? Matched on both halves — the `$CANON_TPL` source and the destination path — so a
 * line that merely mentions the filename does not count.
 */
const copiesFromCanonical = (script, file) =>
  commandLines(script).some((line) =>
    /(^|[^\w-])(cp|rsync|install)\b/.test(line) &&
    new RegExp(`\\$\\{?CANON_TPL\\}?[^\\s"']*/${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(line));

export function checkSyncSurface(text, yaml) {
  const problems = [];
  const script = runScripts(yaml.parse(text));

  // 1. The protocol is on the copied surface. This is the whole bug: not a wrong line, an absent
  //    one, with nothing to fail.
  if (!copiesFromCanonical(script, PROTOCOL)) {
    problems.push(
      `the copy step does not copy ${PROTOCOL} from $CANON_TPL. An adopting repo's protocol is ` +
      `then frozen at the version it adopted, through any number of syncs — while .flow/VERSION ` +
      `advances, so flow-sync reports 'current' and stops saying the repo is behind (flow-0048).`,
    );
  }

  // 2. Each host file is either copied too, or excluded with a comment NAMING THE REASON. The
  //    reason is checkable because it is a specific one: the `## Project notes` section. "we don't
  //    copy CLAUDE.md" is not a reason, and would have passed a laxer check.
  for (const file of HOST_FILES) {
    if (copiesFromCanonical(script, file)) continue;
    // The reason spans several comment lines, so it is looked for in two parts: a comment that
    // names the file, and the specific reason somewhere in the same script. Requiring both on one
    // line would force the justification into a sentence too short to be one.
    const named = commentLines(script).some((line) => line.includes(file));
    const reasoned = commentLines(script).some((line) => /project notes/i.test(line));
    if (!(named && reasoned)) {
      problems.push(
        `${file} is neither copied nor excluded with a comment naming the reason. It is the same ` +
        `class of file as the protocol — canonical-authored, copied at init, never refreshed — so ` +
        `an unexplained omission reads as an oversight, which is how flow-0048 happened.`,
      );
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------------------------
// Lifted from the shipped `run:` block rather than reimplemented — a paraphrase would only prove
// the paraphrase. The whole copy region is extracted, from the `mkdir -p` that opens it to the
// stamp write that closes it, so the end-to-end tests below run the REAL surface and not just the
// one line this task added. If this stops matching, the step was reshaped: re-read it and update
// the extractor, never relax the behaviour asserted below.
// ---------------------------------------------------------------------------------------------
const COPY_REGION =
  /^\s*mkdir -p \.flow\/bin \.github\/workflows$[\s\S]*?^\s*printf '%s\\n' "\$CANON_VER" > \.flow\/VERSION$/m;

const extractCopyRegion = (text) => {
  const match = runScripts(yamlMod.parse(text)).match(COPY_REGION);
  assert.ok(match, "could not find the copied-surface block in _flow-sync.yml's run scripts — it " +
    "was reshaped; update this extractor and re-verify the behaviour below still holds");
  return match[0];
};

/** The one line in that region that copies the protocol, as shipped. Used to mutate it away. */
const PROTOCOL_CP = /^\s*cp "\$CANON_TPL\/\.flow\/PROTOCOL\.md" \.flow\/PROTOCOL\.md$/m;

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });

/**
 * A fixture repo shaped like a real adopting repo mid-drift: it has a `.flow/` with a stale
 * protocol and a stale stamp, committed, so `git diff` afterwards is the diff the sync PR carries.
 */
const fixtureRepo = (t, { protocol }) => {
  const repo = mkdtempSync(join(tmpdir(), "flow-0048-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, ".flow/bin"), { recursive: true });
  mkdirSync(join(repo, ".github/workflows"), { recursive: true });
  if (protocol !== null) writeFileSync(join(repo, PROTOCOL), protocol);
  writeFileSync(join(repo, ".flow/VERSION"), "1.3.0\n");
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "flow-bot@users.noreply.github.com");
  git(repo, "config", "user.name", "flow-bot");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "fixture: an adopting repo, behind canonical");
  return repo;
};

/** Run the shipped copy region in `repo`, exactly as the workflow's shell runs it. */
const runCopyRegion = (repo, { canonTpl = CANON_TPL, canonVer = "2.0.0", ref = "v2" } = {}) =>
  execFileSync("bash", ["-euo", "pipefail", "-c", extractCopyRegion(readReusable())], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, CANON_TPL: canonTpl, CANON_VER: canonVer, CANONICAL_REF: ref },
  });

// ---------------------------------------------------------------------------------------------
// Criterion 1 — the protocol is among the files copied. Read off the shipped workflow.
// ---------------------------------------------------------------------------------------------

test("the shipped _flow-sync.yml copies .flow/PROTOCOL.md from canonical", { skip }, () => {
  const problems = checkSyncSurface(readReusable(), yamlMod);
  assert.deepEqual(problems, [], `_flow-sync.yml: ${problems.join(" | ")}`);
});

test("the header's documented surface lists the protocol too", { skip }, () => {
  // The comment block at the top of the file is what a maintainer reads to learn what a sync
  // carries, and it listed three things for four releases. A correct copy step under a stale
  // inventory is how the next person concludes the protocol is deliberately excluded.
  const header = readReusable().split("\njobs:")[0];
  assert.match(header, /What it syncs/);
  assert.match(header, /\.flow\/PROTOCOL\.md/,
    "the documented copied surface must name the protocol, or the inventory contradicts the code");
  assert.doesNotMatch(header, /protocol block stays a manual adopt/,
    "that sentence was true before flow-0048 and is now false — a sync refreshes the protocol");
});

// ---------------------------------------------------------------------------------------------
// Criterion 4 — the check FAILS when the copy line is removed. Demonstrated, not asserted.
// ---------------------------------------------------------------------------------------------

test("removing the PROTOCOL.md copy line fails the check, by name", { skip }, () => {
  const text = readReusable();
  const mutated = text.replace(PROTOCOL_CP, (line) =>
    // Keep the block scalar's indentation, or the mutant is malformed YAML and proves nothing
    // about the check. A comment is left in its place so the `if` around it stays syntactically
    // whole — this mutation removes the COPY, not the guard.
    line.match(/^[ \t]*/)[0] + "# (protocol copy removed)");
  assert.notEqual(mutated, text, "the mutation must actually remove the copy line");

  const problems = checkSyncSurface(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the protocol copy is gone: ${problems.join(" | ")}`);
  assert.match(problems[0], /does not copy \.flow\/PROTOCOL\.md/);
  assert.match(problems[0], /frozen at the version it adopted/,
    "the message must name the consequence, not just the missing line");
});

test("the check is not satisfied by a mere mention of the protocol", { skip }, () => {
  // The defence against the cheapest false green: a line that names the file without copying it.
  const mutated = readReusable().replace(PROTOCOL_CP, (line) =>
    line.match(/^[ \t]*/)[0] + 'echo "$CANON_TPL/.flow/PROTOCOL.md"');
  const problems = checkSyncSurface(mutated, yamlMod);
  assert.equal(problems.length, 1, `expected the protocol problem: ${problems.join(" | ")}`);
  assert.match(problems[0], /does not copy/);
});

// ---------------------------------------------------------------------------------------------
// Criterion 5 — AGENTS.md and CLAUDE.md are each copied or excluded with a stated reason.
// ---------------------------------------------------------------------------------------------

test("the shipped workflow states why AGENTS.md and CLAUDE.md are excluded", { skip }, () => {
  const script = runScripts(yamlMod.parse(readReusable()));
  for (const file of HOST_FILES) {
    assert.ok(commentLines(script).some((l) => l.includes(file)),
      `${file} must be named in the copy step's comments — it is excluded, and flow-0048 requires ` +
      `the exclusion be stated where the copying happens`);
  }
  assert.match(script, /## Project notes/,
    "the reason must be the specific one: each host file carries a per-project notes section");
});

test("dropping the exclusion comment fails, once per unexplained host file", { skip }, () => {
  // Strip every comment line that names either host file, leaving the code untouched. The surface
  // is then identical and the REASONING is gone, which is the state the bug was found in.
  const text = readReusable();
  const mutated = text
    .split("\n")
    .filter((l) => !(l.trim().startsWith("#") && HOST_FILES.some((f) => l.includes(f))))
    .join("\n");
  assert.notEqual(mutated, text, "the mutation must actually remove the comments");

  const problems = checkSyncSurface(mutated, yamlMod);
  assert.equal(problems.length, HOST_FILES.length,
    `expected one problem per host file: ${problems.join(" | ")}`);
  for (const file of HOST_FILES) {
    assert.ok(problems.some((p) => p.startsWith(file)), `${file} must be reported`);
  }
});

// ---------------------------------------------------------------------------------------------
// Criterion 2 — a repo behind canonical gets the protocol in the PR's diff, and in its body.
// ---------------------------------------------------------------------------------------------

test("a sync into a repo with a stale protocol commits canonical's, byte for byte", { skip }, (t) => {
  const repo = fixtureRepo(t, {
    // The 1.3.0 shape of the defect: a protocol carrying the trip condition that stopped workers.
    protocol: "# The Flow protocol\n\nAn older protocol, missing the 1.3.1 hygiene fix.\n",
  });

  runCopyRegion(repo);

  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "flow: adopt canonical Flow infra 2.0.0");
  const changed = git(repo, "diff", "--name-only", "HEAD~1", "HEAD").split("\n").filter(Boolean);

  assert.ok(changed.includes(PROTOCOL),
    `the sync commit must carry ${PROTOCOL}. Got: ${JSON.stringify(changed)}`);
  assert.equal(
    readFileSync(join(repo, PROTOCOL), "utf8"),
    readFileSync(join(CANON_TPL, PROTOCOL), "utf8"),
    "the copied protocol must be canonical's, byte for byte — this is a copy, not a patch",
  );

  // The other half of the criterion: the PR body is generated from the same changed-file list the
  // commit carries (`$SYNC pr-body --files "$CHANGED"`), so the file the diff carries is the file
  // the body lists. Asserted through the real generator, not a copy of its format. The list is
  // computed here rather than lifted from the workflow on purpose — flow-0054 is reshaping that
  // variable (to `git diff --cached --no-renames --name-status`, because the old form reported no
  // ADDED files) in a PR open at the same time as this one. What must hold either way is that a
  // protocol appearing in the diff appears in the body, and that is what is asserted.
  const { body } = prContent({ local: "1.3.0", canonical: "2.0.0", files: changed });
  const synced = body.split("### Synced from canonical")[1] ?? "";
  assert.match(synced, /- `\.flow\/PROTOCOL\.md`/,
    "the protocol must appear under 'Synced from canonical', or a reviewer reading the body has " +
    "no way to know the contract they work under just changed");
});

test("a repo that never had a protocol gets one — the pre-split adoption case", { skip }, (t) => {
  // A repo that adopted before the protocol was split out of CLAUDE.md has no `.flow/PROTOCOL.md`
  // at all. `cp` creates it, which is the right outcome: the file is canonical's in full.
  const repo = fixtureRepo(t, { protocol: null });
  assert.ok(!existsSync(join(repo, PROTOCOL)), "the fixture must start without a protocol");

  runCopyRegion(repo);

  assert.equal(
    readFileSync(join(repo, PROTOCOL), "utf8"),
    readFileSync(join(CANON_TPL, PROTOCOL), "utf8"));
  assert.match(git(repo, "status", "--porcelain"), /\?\? \.flow\/PROTOCOL\.md/,
    "and it shows up as a new file in the diff the sync PR carries");
});

// ---------------------------------------------------------------------------------------------
// Criterion 3 — idempotent. A repo already at canonical's protocol gets no diff, and cannot
// conflict: the step copies a whole file rather than patching one.
// ---------------------------------------------------------------------------------------------

test("a repo already carrying canonical's protocol sees no protocol diff", { skip }, (t) => {
  const repo = fixtureRepo(t, { protocol: readFileSync(join(CANON_TPL, PROTOCOL), "utf8") });

  runCopyRegion(repo);

  const changed = git(repo, "diff", "--name-only").split("\n").filter(Boolean);
  assert.ok(!changed.includes(PROTOCOL),
    `an identical protocol must produce no diff; got ${JSON.stringify(changed)}`);

  // And running it twice is the same as running it once — the property that makes a re-run of a
  // sync safe, and the reason a hand-patched repo (CandidDan/later) sees a no-op on any section
  // that already matches.
  runCopyRegion(repo);
  const again = git(repo, "diff", "--name-only").split("\n").filter(Boolean);
  assert.deepEqual(again, changed, "the copy step must be idempotent across runs");
});

// ---------------------------------------------------------------------------------------------
// The guard. `canonical_ref` may be pinned at a release older than the split that created
// `project-template/.flow/PROTOCOL.md` (v1.0.0, v1.1.0, v1.1.1 have none). Under `set -e` a bare
// `cp` would abort the entire sync for those callers — so the copy is guarded, and the guard warns
// instead of skipping silently, because a silent skip is the defect this task exists to fix.
// ---------------------------------------------------------------------------------------------

test("a canonical without a protocol warns and still completes the sync", { skip }, (t) => {
  const repo = fixtureRepo(t, { protocol: "# local protocol, untouched\n" });

  // A template shaped like canonical before the split: it has the bin dir and the callers, and no
  // PROTOCOL.md.
  const oldCanon = mkdtempSync(join(tmpdir(), "flow-0048-canon-"));
  t.after(() => rmSync(oldCanon, { recursive: true, force: true }));
  mkdirSync(join(oldCanon, ".flow/bin"), { recursive: true });
  mkdirSync(join(oldCanon, ".github/workflows"), { recursive: true });
  writeFileSync(join(oldCanon, ".flow/bin/flow-doctor.mjs"), "// old\n");
  writeFileSync(join(oldCanon, ".github/workflows/flow-gates.yml"), "name: flow-gates\n");

  const out = runCopyRegion(repo, { canonTpl: oldCanon, canonVer: "1.1.1", ref: "v1.1.1" });

  assert.match(out, /::warning title=No protocol to adopt::/,
    "an absent protocol must be REPORTED — a silent skip is how flow-0048 went unnoticed");
  assert.match(out, /v1\.1\.1/, "…naming the ref that has none, so the fix is the pin");
  assert.equal(readFileSync(join(repo, PROTOCOL), "utf8"), "# local protocol, untouched\n",
    "and the repo's own protocol is left exactly as it was, not truncated or emptied");
  assert.equal(readFileSync(join(repo, ".flow/VERSION"), "utf8"), "1.1.1\n",
    "the rest of the surface still syncs — the guard must not abort the run");
});

test("the guard's warning names the ref from the environment, not a hardcoded default", { skip }, () => {
  const region = extractCopyRegion(readReusable());
  assert.match(region, /\$\{CANONICAL_REF\}/,
    "the warning must interpolate the resolved ref; a hardcoded 'v2' would misreport the pin");
  // CANONICAL_REF is resolved once, in the clone step, and exported via $GITHUB_ENV. If that export
  // is dropped, `set -u` makes this step fail at the warning — in the one situation the warning
  // exists to explain.
  assert.match(runScripts(yamlMod.parse(readReusable())),
    /echo "CANONICAL_REF=\$\{CANONICAL_REF\}" >> "\$GITHUB_ENV"/,
    "the resolved ref must be exported to the adopt step, or `set -u` kills the warning branch");
});
