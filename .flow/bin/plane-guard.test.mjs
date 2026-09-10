// plane-guard.test.mjs — the proving tests for flow-0035's acceptance criteria.
//
// Named per criterion, because `_flow-review.yml`'s qa check verifies the criterion→test mapping
// by name and a criterion with no test that asserts its OUTCOME fails the gate even when coverage
// is green.
//
// ── A CORRECTION TO THE TASK, RECORDED HERE RATHER THAN QUIETLY WORKED AROUND ────────────────
//
// flow-0035's criterion 5 asks for an audit over history containing `d91e100`, reporting that
// commit as a violation naming `VISION.md`. Every part of that fixture is wrong, and the checks
// in this file are what pin the correction so nobody re-derives it:
//
//   · `d91e100` touches ONE path — `.flow/tasks/flow-0024-release-cannot-publish-a-lying-stamp.md`.
//     It is a textbook store-plane claim commit: exactly what the protocol requires a direct push
//     to `main` to look like. It is not a violation and never was.
//   · The commit that created `VISION.md` (105 lines) is `5e2b41c`, two days earlier.
//   · `5e2b41c` was carried by **merged PR #11**. So `VISION.md` did NOT arrive by direct push;
//     it came through review, as did every later change to it (PRs #56, #60, #61).
//
// The likely origin of the error is worth stating because the tooling invites it: a shallow clone
// (a CI checkout, or a fresh cloud session — this repo arrives with ~80 of ~350 commits and
// grafted history) makes `git log --follow -- VISION.md` report a single commit, and the sha of a
// nearby commit then gets paired with it.
//
// THE GAP THE TASK IDENTIFIED IS REAL ANYWAY, and much worse than one commit: the audit run for
// flow-0035's PR found **18** commits that reached `main` outside `.flow/tasks/` with no merged
// pull request. So criterion 5 is proved against a real violation from that audit — `d751e977` —
// which is a strictly better fixture than the one named, because it touches store files AND
// non-store files in the same commit and so proves criterion 4 on real history too.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

import {
  STORE_PREFIX,
  PLANE_GUARD_LABEL,
  ISSUES_PER_PAGE,
  DEFAULT_BASE_BRANCH,
  checkCommits,
  classifyCommit,
  collectCommits,
  exitCodeFor,
  formatViolation,
  isStorePath,
  markedIssues,
  foreignMarkedIssues,
  mergedPulls,
  offendingPaths,
  parseGitLog,
  planIssueActions,
  renderIssueBody,
  applyActions,
  ensureLabel,
  runPlaneGuard,
  gitCommitsInRange,
  gitFirstParentShas,
  resolveFirstParentShas,
  gitIntroducedByMerge,
  pullsProducingMerge,
  createIO,
  violationMarker,
  issueTitle,
  parseArgs,
} from "./plane-guard.mjs";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

// ── a throwaway repo with a KNOWN graph, built fresh per test ────────────────────────────────
//
// WHY NOT THIS CHECKOUT. The first version of the git-behaviour tests below ran against this
// repository's real history and named a real old sha. That passes locally and FAILS IN CI:
// `_flow-gates.yml`'s `flow-tooling` job checks out at the default `fetch-depth: 1`, where that sha
// is not an object at all. flow-review's code-review caught it, reproduced it with
// `git clone --depth 1`, and it is the same shallow-clone trap the task's own notes describe hitting
// — introduced right back into the file that documents it.
//
// The alternative of skipping on `git rev-parse --is-shallow-repository` was rejected: it would make
// the assertion silently absent in the one job that runs this suite, which is the failure mode
// flow-0008 exists to prevent. A fixture repo runs everywhere and proves MORE — the graph below has a
// real merge commit, so the first-parent rule is exercised against a real second-parent side rather
// than against a hand-written set.
//
//   A ─── D0 ─── M ─── D        <- main's first-parent line
//          \    /
//           B ─┘                <- only reachable through the merge
//
// Cleanup is promise-AWARE, not a bare `finally`. With an async `fn` a synchronous `finally` deletes
// the repo before the callback has run a single git command, and the failure surfaces as
// `spawnSync git ENOENT` — which reads like git is missing rather than like the cwd is gone. Found by
// exactly that failure.
function withFixtureRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), "plane-guard-fixture-"));
  const clean = () => rmSync(dir, { recursive: true, force: true });
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Fixture");
    const commit = (file, body, message) => {
      const full = join(dir, file);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
      git("add", file);
      git("commit", "-q", "-m", message);
      return git("rev-parse", "HEAD");
    };

    const A = commit("a.md", "a\n", "A: root");
    git("checkout", "-q", "-b", "feat");
    const B = commit("b.md", "b\n", "B: on the feature branch");
    git("checkout", "-q", "main");
    const D0 = commit(".flow/tasks/t.md", "t\n", "D0: a store-plane commit on main");
    git("merge", "-q", "--no-ff", "-m", "M: Merge pull request #1 from feat", "feat");
    const M = git("rev-parse", "HEAD");
    const D = commit("d.md", "d\n", "D: straight to main");

    const result = fn({ dir, git, shas: { A, B, D0, M, D } });
    if (result && typeof result.then === "function") return result.finally(clean);
    clean();
    return result;
  } catch (err) {
    clean();
    throw err;
  }
}
const WORKFLOW = join(REPO_ROOT, ".github", "workflows", "plane-guard.yml");

// A merged PR, as GitHub's `/commits/{sha}/pulls` returns it — only the two fields that decide
// anything, so a fixture cannot accidentally depend on a field the code does not read.
const MERGED = (number, base = "main") => [{ number, merged_at: "2026-09-01T00:00:00Z", base: { ref: base } }];
const OPEN = (number) => [{ number, merged_at: null, base: { ref: "main" } }];

// A no-network IO. `commits` returns what it was given; `pullsFor` reads a map keyed by sha, and
// THROWS for a sha it does not know — so a test that forgets to supply an answer fails loudly
// rather than silently taking the fail-closed path and looking like it proved something.
function fakeIO({ commits = [], pulls = {}, issues = [], writes = [], failWrites = false, firstParent = null, introducing = {} } = {}) {
  return {
    commits: async () => commits,
    // Default: every supplied commit is ON the first-parent line, so a test that says nothing about
    // the graph exercises the PR-API path it was written for. Pass `firstParent` to say otherwise.
    firstParentShas: async () => new Set(firstParent ?? commits.map((c) => c.sha)),
    // Which merge brought each off-the-line commit in. `introducing` maps sha -> merge sha; an Error
    // value makes the whole map read throw, which is how the real git call fails.
    introducedByMerge: async (_range) => {
      for (const v of Object.values(introducing ?? {})) if (v instanceof Error) throw v;
      return new Map(Object.entries(introducing ?? {}).filter(([, v]) => v));
    },
    pullsFor: async (sha) => {
      if (!(sha in pulls)) throw new Error(`no fixture answer for ${sha}`);
      const answer = pulls[sha];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    rest: async (path) => {
      if (path.includes("/labels/")) return { name: PLANE_GUARD_LABEL };
      if (path.includes("/issues?")) return issues;
      throw new Error(`unexpected GET ${path}`);
    },
    write: async (method, path, body) => {
      if (failWrites) { const e = new Error("500 boom"); e.status = 500; throw e; }
      writes.push({ method, path, body });
      return { number: 999 };
    },
    _writes: writes,
  };
}

// ── criterion 1 ──────────────────────────────────────────────────────────────────────────────
// "a direct push whose commits touch only .flow/tasks/ -> no violation"

test("criterion 1: a direct push touching only .flow/tasks/ reports no violation", () => {
  const commits = [
    { sha: "a".repeat(40), author: "worker", message: "flow: claim flow-0042", paths: [".flow/tasks/flow-0042-x.md"] },
    { sha: "b".repeat(40), author: "flow-status", message: "flow: flow-0042 status sync", paths: [".flow/tasks/flow-0042-x.md"] },
    { sha: "c".repeat(40), author: "flow-done", message: "flow: flow-0041 -> done", paths: [".flow/tasks/flow-0041-y.md", ".flow/tasks/flow-0040-z.md"] },
  ];
  const { examined, violations, emptyScan } = checkCommits(commits);

  assert.equal(examined, 3);
  assert.deepEqual(violations, [], "the store plane is exactly what a direct push to main is FOR");
  assert.equal(emptyScan, false);
  assert.equal(exitCodeFor({ violations, emptyScan, failures: [] }), 0, "the job must pass");

  for (const c of commits) assert.equal(classifyCommit(c).verdict, "store-only");
});

test("criterion 1: only .flow/tasks/ is store — .flow/config.yml and .flow/bin/ are not", () => {
  // The prefix is deliberately narrower than `.flow/`. `config.yml` is repo-owned config that
  // travels on a branch when a task declares it in `touches`; `.flow/bin/**` is canonical's and is
  // adopted by PR. Widening the prefix to `.flow/` would silently excuse both.
  assert.equal(STORE_PREFIX, ".flow/tasks/");
  assert.equal(isStorePath(".flow/tasks/flow-0001-a.md"), true);
  assert.equal(isStorePath("./.flow/tasks/flow-0001-a.md"), true, "a leading ./ must not defeat the prefix test");
  assert.equal(isStorePath(".flow/config.yml"), false);
  assert.equal(isStorePath(".flow/bin/plane-guard.mjs"), false);
  assert.equal(isStorePath(".flow/tasks-old/x.md"), false, "a sibling directory with a shared prefix is not the store");
  assert.equal(isStorePath("project-template/.flow/tasks/_TEMPLATE.md"), false,
    "the template's fixture store is repo content, adopted by PR — not canonical's main-only plane");
});

// ── criterion 2 ──────────────────────────────────────────────────────────────────────────────
// "a commit outside .flow/tasks/ with no associated PR -> a violation naming commit + paths, job fails"

test("criterion 2: a commit outside the store with no PR is a violation naming the commit and its paths, and the job fails", async () => {
  const sha = "1".repeat(40);
  const io = fakeIO({
    commits: [{ sha, author: "Dan", message: "docs: quick fix", paths: ["VISION.md", "docs/adr/0007-x.md"] }],
    pulls: { [sha]: [] },
  });

  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0 });

  assert.equal(summary.violations.length, 1);
  const v = summary.violations[0];
  assert.equal(v.sha, sha, "the violation names the commit");
  assert.equal(v.verdict, "violation");
  assert.deepEqual(v.offending, ["VISION.md", "docs/adr/0007-x.md"], "the violation names the offending paths");
  assert.equal(exitCodeFor(summary), 1, "the job must FAIL");

  const line = formatViolation(v);
  assert.match(line, /1111111/, "the console line carries the sha");
  assert.match(line, /Dan/, "…the author");
  assert.match(line, /docs: quick fix/, "…the subject");
  assert.match(line, /VISION\.md/, "…and the offending paths");
});

test("criterion 2: the violation is filed as an issue naming the commit, author, subject and paths", async () => {
  const sha = "2".repeat(40);
  const io = fakeIO({
    commits: [{ sha, author: "Dan", message: "chore: prepare for release", paths: ["LICENSE"] }],
    pulls: { [sha]: [] },
  });

  const summary = await runPlaneGuard({ io, repo: "CandidDan/flow", range: "x..y", now: 0, fileIssues: true });

  assert.equal(summary.actions.length, 1);
  assert.equal(summary.actions[0].type, "file");
  const posted = io._writes.find((w) => w.path === "/repos/CandidDan/flow/issues");
  assert.ok(posted, "an issue is POSTed");
  assert.deepEqual(posted.body.labels, [PLANE_GUARD_LABEL]);
  assert.match(posted.body.title, /2222222/);
  for (const needle of [sha, "Dan", "chore: prepare for release", "LICENSE", "CandidDan/flow"]) {
    assert.ok(posted.body.body.includes(needle), `the issue body must name ${needle}`);
  }
  assert.ok(posted.body.body.includes(violationMarker(sha)), "…and carry the dedupe marker");
});

test("criterion 2: the issue body says this is detection, never prevention, and that nothing was reverted", () => {
  // The task is explicit that describing a push-triggered check as prevention is a false claim.
  // A guard's whole asset is being believed, so the honesty is asserted, not just intended.
  const body = renderIssueBody({ repo: "o/r", violation: { sha: "f".repeat(40), author: "x", message: "m", offending: ["a.md"] }, now: 0 });
  assert.match(body, /detection, not prevention/i);
  assert.match(body, /Nothing has been reverted/i);
});

test("a re-run comments on the existing issue rather than filing a second one", async () => {
  const sha = "3".repeat(40);
  const violation = classifyCommit({ sha, author: "Dan", message: "m", paths: ["x.md"], pulls: [] });
  const openIssues = [{ number: 7, user: { login: "github-actions[bot]" }, body: `${violationMarker(sha)}\n\nolder report` }];

  const { actions } = planIssueActions({ repo: "o/r", violations: [violation], openIssues, now: 0 });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "comment");
  assert.equal(actions[0].issueNumber, 7);

  assert.deepEqual([...markedIssues(openIssues).keys()], [sha]);
  assert.equal(markedIssues([{ number: 8, user: { login: "github-actions[bot]" }, body: "a human filed this by hand" }]).size, 0,
    "an issue with no marker is never acted on — this must not corrupt the inbox it feeds");
});

// ── criterion 3 ──────────────────────────────────────────────────────────────────────────────
// "a commit outside the store that IS associated with a merged PR -> no violation"
//
// This is the criterion that decides whether the guard survives contact with the repo: a check
// that fires on every ordinary merge gets switched off within a week.

test("criterion 3: an ordinary merge does not fire the guard — a merged PR excuses non-store paths", () => {
  const cases = [
    // Squash merge: ONE commit lands on main's first-parent line, associated with the PR.
    { style: "squash", commit: { sha: "s".padEnd(40, "1"), author: "Claude", message: "[flow-0031] Pin actions", paths: [".github/workflows/ci.yml"], pulls: MERGED(63) } },
    // Merge commit: the merge itself carries the PR. Its combined diff is empty, so it also has
    // no offending paths — belt and braces, and asserted so a change to either is caught.
    { style: "merge-commit", commit: { sha: "m".padEnd(40, "2"), author: "GitHub", message: "Merge pull request #63", paths: [], pulls: MERGED(63) } },
    // Rebase merge: each rebased commit is individually associated with the PR.
    { style: "rebase", commit: { sha: "r".padEnd(40, "3"), author: "Claude", message: "[flow-0031] one of three", paths: ["docs/x.md"], pulls: MERGED(63) } },
  ];

  for (const { style, commit } of cases) {
    const r = classifyCommit(commit);
    assert.equal(r.violation, false, `${style} must not be reported`);
    assert.ok(["merged-pr", "no-paths"].includes(r.verdict), `${style} verdict was ${r.verdict}`);
  }

  const { violations } = checkCommits(cases.map((c) => c.commit));
  assert.deepEqual(violations, [], "no merge style may fire the guard");
});

test("criterion 3: an OPEN pull request does not excuse the commit — only a merged one does", () => {
  // The failure this excludes: push straight to main, then open a PR from main to somewhere. The
  // sha is then in an open PR's head, which proves nothing about how it reached main.
  const r = classifyCommit({ sha: "o".padEnd(40, "4"), author: "Dan", message: "m", paths: ["VISION.md"], pulls: OPEN(99) });
  assert.equal(r.violation, true);
  assert.deepEqual(mergedPulls(OPEN(99)), []);
  assert.equal(mergedPulls(MERGED(99)).length, 1);
});

test("criterion 3: a merge-borne commit is excused when a merged PR PRODUCED the introducing merge", async () => {
  // The graph locates the merge; the API confirms a pull request produced it. This is the stacked-merge
  // case that broke plain base-filtering: `/commits/{sha}/pulls` for `de72f18` names only PR #61, based
  // on an integration branch — but the merge that brought it onto `main` is `0c3430c`, and merged PR #62
  // into `main` carries exactly that `merge_commit_sha`. So it is excused for the right reason.
  const commit = "de72f18".padEnd(40, "0");
  const mergeSha = "0c3430c".padEnd(40, "1");
  const io = fakeIO({
    commits: [{ sha: commit, author: "Dan", message: "vision: audience", paths: ["VISION.md"] }],
    firstParent: [mergeSha],                     // the commit is NOT on the line; the merge is
    introducing: { [commit]: mergeSha },
    pulls: { [mergeSha]: [{ number: 62, merged_at: "2026-09-09T05:13:09Z", base: { ref: "main" }, merge_commit_sha: mergeSha }] },
  });

  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0 });
  assert.deepEqual(summary.violations, [], "a merge a PR produced must not be reported");
  assert.equal(summary.results[0].verdict, "merged-parent");
  assert.equal(summary.results[0].mergeSha, mergeSha);

  // The PR must have produced THIS merge. A merged PR into `main` whose merge_commit_sha is some other
  // commit proves nothing about this one — that is the whole point of checking the field.
  assert.deepEqual(pullsProducingMerge(
    [{ number: 99, merged_at: "x", base: { ref: "main" }, merge_commit_sha: "f".repeat(40) }],
    mergeSha), []);
  assert.equal(pullsProducingMerge(
    [{ number: 62, merged_at: "x", base: { ref: "main" }, merge_commit_sha: mergeSha.toUpperCase() }],
    mergeSha).length, 1, "sha comparison is case-insensitive");
});


test("a SQUASH merge lands on the first-parent line, so the graph cannot excuse it and the API must", async () => {
  // Why both signals exist. A squash lands one commit exactly where a direct push lands; only the
  // API separates them. Same graph position, opposite verdicts, decided by the PR answer alone.
  const squashed = "5".repeat(40);
  const pushed = "6".repeat(40);
  const io = fakeIO({
    commits: [
      { sha: squashed, author: "Claude", message: "[flow-0031] squashed", paths: ["docs/x.md"] },
      { sha: pushed, author: "Dan", message: "quick fix", paths: ["docs/y.md"] },
    ],
    firstParent: [squashed, pushed],
    pulls: { [squashed]: MERGED(63), [pushed]: [] },
  });

  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0 });
  assert.deepEqual(summary.violations.map((v) => v.sha), [pushed], "the squash is excused, the direct push is not");
  assert.equal(summary.results.find((r) => r.sha === squashed).verdict, "merged-pr");
});

test("an unreadable first-parent line fails the run rather than judging on the PR API alone", async () => {
  // An empty set is a broken read, not a repo where everything arrived by merge. Treating it as the
  // latter would route every commit to signal two — which is exactly where the false positives are.
  const io = { ...fakeIO({ commits: [{ sha: "a".repeat(40), author: "x", message: "m", paths: ["a.md"] }] }), firstParentShas: async () => new Set() };
  await assert.rejects(() => runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0 }),
    /refusing to judge on the PR API alone/);
});

test("the first-parent walk uses --end-of-options and fails loudly", () => {
  const exec = () => { const e = new Error("Command failed"); e.stderr = "fatal: bad revision 'nope'\n"; throw e; };
  assert.throws(() => gitFirstParentShas("nope", { exec }), /could not walk the first-parent line of .nope./);

  // The property the whole rule rests on, against a real graph with a real merge: the first-parent
  // line is a STRICT subset of history, and the commit that arrived through the merge is the one
  // missing from it. If they were equal the graph signal would prove nothing.
  withFixtureRepo(({ dir, shas }) => {
    const fp = gitFirstParentShas("HEAD", { cwd: dir });
    const all = new Set(execFileSync("git", ["rev-list", "HEAD"], { cwd: dir, encoding: "utf8" }).trim().split("\n"));

    assert.ok(fp.size < all.size, "there must be a merge commit, or the graph signal is meaningless");
    for (const [name, sha] of [["A", shas.A], ["D0", shas.D0], ["M", shas.M], ["D", shas.D]]) {
      assert.ok(fp.has(sha), `${name} is on main's first-parent line`);
    }
    assert.ok(!fp.has(shas.B), "B arrived through the merge, so it is NOT on the first-parent line — the whole basis of the graph signal");
    assert.ok(all.has(shas.B), "…but it IS in history, which is what makes the distinction meaningful");
  });
});

test("the graph ref is derived from the policed branch, so the two signals cannot disagree", () => {
  // The bug flow-review's code-review found: `--base` reached the PR-base check but not the graph
  // walk, which always used `HEAD`. `--base develop` from a `main` checkout then had signal one
  // judging `main` and signal two judging `develop`. These assertions pin the wiring itself.
  withFixtureRepo(({ dir, git, shas }) => {
    // The local branch name resolves first.
    const onMain = resolveFirstParentShas("main", { cwd: dir });
    assert.ok(onMain.has(shas.D) && !onMain.has(shas.B), "main's first-parent line, not HEAD's by accident");

    // A branch that exists but is NOT the one checked out must still resolve to ITS OWN line — the
    // property a `HEAD` default silently breaks. `feat`'s line contains B; main's does not.
    const onFeat = resolveFirstParentShas("feat", { cwd: dir });
    assert.ok(onFeat.has(shas.B), "feat's line contains B");
    assert.ok(!onFeat.has(shas.D), "…and not D, which is only on main");
    git("checkout", "-q", "main"); // HEAD is main, yet the walk above answered about feat

    // Remote-tracking fallback, for a runner checkout that has origin/<branch> and no local branch.
    git("update-ref", "refs/remotes/origin/release", shas.D0);
    const onRemote = resolveFirstParentShas("release", { cwd: dir });
    assert.ok(onRemote.has(shas.D0) && !onRemote.has(shas.D), "resolved through refs/remotes/origin/release");

    // Neither spelling resolves -> a loud failure naming both, never a HEAD fallback.
    assert.throws(() => resolveFirstParentShas("nope", { cwd: dir }),
      /policed branch .nope. — tried nope, refs\/remotes\/origin\/nope/);
  });
});

test("createIO wires the policed branch into the graph walk", async () => {
  // `createIO` was the uncovered block where the inconsistency lived, so it is constructed here for
  // real. No token and no network: only `firstParentShas` is exercised, which is pure git.
  withFixtureRepo(({ dir, shas }) => {
    const io = createIO({ repo: "o/r", cwd: dir, baseBranch: "feat" });
    return io.firstParentShas().then((shas2) => {
      assert.ok(shas2.has(shas.B), "createIO({ baseBranch: 'feat' }) must walk feat, not HEAD");
      assert.ok(!shas2.has(shas.D));
    });
  });

  // And the default is the policed branch's default, not a hardcoded ref.
  assert.equal(parseArgs([]).baseBranch, DEFAULT_BASE_BRANCH);

  // THE CLI'S OWN CALL, asserted on the source. This is the precise line flow-review's code-review
  // found wrong, and it lives inside the `__isMain` block, which by design never runs under the test
  // runner — so no behavioural test can reach it. A source assertion is the only thing that can, and
  // without it the one-line regression that caused the finding passes the whole suite. (Checked: it
  // does. Removing `baseBranch` here failed nothing before this assertion existed.)
  const src = readFileSync(join(import.meta.dirname, "plane-guard.mjs"), "utf8");
  assert.match(src, /createIO\(\{[^}]*\bbaseBranch\b[^}]*\}\)/,
    "the CLI must pass baseBranch into createIO, or the graph walks the wrong branch");
});

test("resolveFirstParentShas falls through a candidate that resolves but walks nothing", () => {
  // A ref can resolve and still yield no commits. Taking that as the answer hands `collectCommits` an
  // empty set, which it treats as a broken read — correct, but it would have skipped a candidate that
  // WOULD have worked. Driven with an injected exec because the case is awkward to build in real git.
  const calls = [];
  const exec = (_cmd, args) => {
    const ref = args[args.length - 1];
    calls.push(ref);
    if (ref === "release") return "\n";                    // resolves, walks nothing
    if (ref === "refs/remotes/origin/release") return "abc\ndef\n";
    throw Object.assign(new Error("Command failed"), { stderr: "fatal: bad revision\n" });
  };

  const shas = resolveFirstParentShas("release", { exec });
  assert.deepEqual([...shas], ["abc", "def"], "the second candidate answered");
  assert.deepEqual(calls, ["release", "refs/remotes/origin/release"], "…and only after the first was tried");

  // Both empty -> a loud failure that says which candidate did what, not a silent empty set.
  const bothEmpty = () => "";
  assert.throws(() => resolveFirstParentShas("release", { exec: bothEmpty }),
    /resolved but walked no commits/);
});

test("a locally built merge pushed straight to the branch is CAUGHT, not excused", async () => {
  // The bypass flow-review's code-review reproduced and escalated to blocking, now closed. An earlier
  // version stopped at "not on the first-parent line" and excused these outright — so
  // `git merge --no-ff feature && git push`, an entirely ordinary local workflow, slipped arbitrary
  // content past the guard with no red tick and no issue. Quieter than a plain direct commit, which is
  // the wrong way round.
  //
  // Driven off a REAL git graph: `withFixtureRepo` builds exactly that shape, and no PR exists anywhere.
  await withFixtureRepo(async ({ dir, shas }) => {
    const io = {
      commits: async (range) => gitCommitsInRange(range, { cwd: dir }),
      firstParentShas: async () => resolveFirstParentShas("main", { cwd: dir }),
      introducedByMerge: async (range) => gitIntroducedByMerge(range, { cwd: dir }),
      pullsFor: async () => [],                  // no pull request has ever existed in this repo
      rest: async () => [], write: async () => ({ number: 1 }),
    };
    const summary = await runPlaneGuard({ io, repo: "o/r", range: `${shas.A}..${shas.D}`, now: 0 });

    const b = summary.results.find((r) => r.sha === shas.B);
    assert.equal(b.verdict, "violation", "B came in through a local merge with no PR — it must be reported");
    assert.equal(b.viaUnreviewedMerge, true, "…and flagged as arriving via an unreviewed merge, not as a direct commit");
    assert.equal(b.mergeSha, shas.M, "naming the merge that brought it in");
    assert.deepEqual(b.offending, ["b.md"]);

    assert.ok(summary.violations.some((v) => v.sha === shas.D), "and the plain direct commit is still caught");
    assert.equal(exitCodeFor(summary), 1);

    // The report says which of the two it is, because the remedy differs.
    assert.match(formatViolation(b), /via merge .*, which no merged PR produced/);
    assert.match(renderIssueBody({ repo: "o/r", violation: b, now: 0 }), /no merged pull request produced/);
  });
});

test("the introducing merge is resolved from the real graph, and its PR answer is cached per merge", async () => {
  await withFixtureRepo(async ({ dir, shas }) => {
    const map = gitIntroducedByMerge("main", { cwd: dir });
    // Scoped to a range, the same merge is still found — and a range that excludes it finds nothing.
    assert.equal(gitIntroducedByMerge(`${shas.A}..${shas.D}`, { cwd: dir }).get(shas.B), shas.M);
    assert.equal(gitIntroducedByMerge(`${shas.M}..${shas.D}`, { cwd: dir }).size, 0,
      "a range starting after the merge contains no merge to attribute anything to");
    assert.equal(map.get(shas.B), shas.M, "B was brought in by the merge M");
    assert.equal(map.get(shas.D), undefined, "a commit already ON the line was introduced by no merge");
    assert.equal(map.get(shas.A), undefined);
    assert.equal(map.size, 1, "exactly the one commit the merge contributed");

    // One API answer per merge, not per commit it carried.
    const asked = [];
    const io = {
      commits: async (range) => gitCommitsInRange(range, { cwd: dir }),
      firstParentShas: async () => resolveFirstParentShas("main", { cwd: dir }),
      introducedByMerge: async (range) => gitIntroducedByMerge(range, { cwd: dir }),
      pullsFor: async (sha) => { asked.push(sha); return []; },
      rest: async () => [], write: async () => ({ number: 1 }),
    };
    await runPlaneGuard({ io, repo: "o/r", range: `${shas.A}..${shas.D}`, now: 0 });
    assert.deepEqual(asked.filter((a) => a === shas.M).length, 1, "the merge was asked about exactly once");
  });
});

test("gitIntroducedByMerge attributes to the OLDEST merge and skips anything that is not a merge", () => {
  // Both branches are defensive: this repo's linear first-parent history cannot produce a commit
  // introduced by two merges (once the older merge lands, the newer merge's first parent already
  // contains the commit), and `rev-list --merges` only ever returns merges. The fixture repo therefore
  // cannot distinguish either, and an untested defensive branch is one nobody notices breaking — so
  // they are driven with an injected exec instead of left uncovered.
  const M_OLD = "1".repeat(40), M_NEW = "2".repeat(40), PLAIN = "3".repeat(40);
  const SHARED = "a".repeat(40), ONLY_NEW = "b".repeat(40);

  const exec = (_cmd, args) => {
    if (args.includes("--merges")) return `${M_NEW}\n${PLAIN}\n${M_OLD}\n`;   // newest-first, as git prints
    if (args.includes("--parents")) {
      const rev = args[args.length - 1];
      if (rev === M_OLD) return `${M_OLD} p1old p2old\n`;
      if (rev === M_NEW) return `${M_NEW} p1new p2new\n`;
      return `${PLAIN} p1plain\n`;                                             // one parent: not a merge
    }
    // rev-list <parents…> --not <first parent>
    if (args.includes("p2old")) return `${SHARED}\n`;
    if (args.includes("p2new")) return `${SHARED}\n${ONLY_NEW}\n`;
    throw new Error(`unexpected rev-list: ${args.join(" ")}`);
  };

  const map = gitIntroducedByMerge("main", { exec });
  assert.equal(map.get(SHARED), M_OLD, "a commit both merges carry belongs to the one that put it on the branch FIRST");
  assert.equal(map.get(ONLY_NEW), M_NEW);
  assert.equal(map.size, 2, "the single-parent commit in the merge list contributed nothing");
  assert.ok(![...map.values()].includes(PLAIN), "a non-merge must never be reported as an introducing merge");
});

test("a merge-borne commit whose merge lookup fails is unresolved, files nothing, and fails the job", async () => {
  const commit = "a".repeat(40);
  const io = fakeIO({
    commits: [{ sha: commit, author: "Dan", message: "m", paths: ["x.md"] }],
    firstParent: ["someone-else"],
    introducing: { [commit]: new Error("500 Internal Server Error") },
  });
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0, fileIssues: true });
  assert.equal(summary.violations.length, 1, "fail closed");
  assert.equal(summary.violations[0].verdict, "unresolved");
  assert.deepEqual(summary.actions, [], "and file nothing it could not establish");
  assert.equal(exitCodeFor(summary), 1);
});

test("off the first-parent line with no introducing merge fails closed rather than inventing an excuse", async () => {
  const commit = "b".repeat(40);
  const io = fakeIO({
    commits: [{ sha: commit, author: "Dan", message: "m", paths: ["x.md"] }],
    firstParent: ["someone-else"],
    introducing: { [commit]: null },
  });
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0 });
  assert.equal(summary.violations.length, 1);
  assert.match(summary.violations[0].pullLookupError, /no introducing merge found/);
});


test("the two-signal rule, end to end against a real commit graph", async () => {
  // The rule assembled from real git rather than fixtures: the merge-borne commit is excused with no
  // API call, and the commit pushed straight onto the first-parent line is reported.
  await withFixtureRepo(async ({ dir, shas }) => {
    // A merged PR into `main` that produced the fixture's merge commit — the legitimate shape.
    const io = {
      commits: async (range) => gitCommitsInRange(range, { cwd: dir }),
      firstParentShas: async () => resolveFirstParentShas("main", { cwd: dir }),
      introducedByMerge: async (range) => gitIntroducedByMerge(range, { cwd: dir }),
      pullsFor: async (sha) => (sha === shas.M
        ? [{ number: 1, merged_at: "2026-09-01T00:00:00Z", base: { ref: "main" }, merge_commit_sha: shas.M }]
        : []),
      rest: async () => [],
      write: async () => ({ number: 1 }),
    };

    const summary = await runPlaneGuard({ io, repo: "o/r", range: `${shas.A}..${shas.D}`, now: 0 });
    const byVerdict = Object.fromEntries(summary.results.map((r) => [r.sha, r.verdict]));

    assert.equal(byVerdict[shas.B], "merged-parent", "B arrived through a merge a PR produced");
    assert.equal(byVerdict[shas.D], "violation", "D was pushed straight onto the first-parent line with no PR");
    assert.equal(byVerdict[shas.D0], "store-only", "D0 touches only .flow/tasks/");
    assert.equal(byVerdict[shas.M], "no-paths", "the merge commit itself touches nothing");
    assert.deepEqual(summary.violations.map((v) => v.sha), [shas.D]);
  });
});

test("criterion 3: a PR merged into a DIFFERENT branch does not excuse a commit on main", () => {
  // flow-review's security check: `merged_at` alone answers "did some PR carry this sha?" when the
  // question is "did a PR put this on the policed branch?". A merge of `main` into a long-lived
  // branch carries every commit on `main`, this one included, and would excuse a direct push.
  const onDevelop = classifyCommit({ sha: "d".padEnd(40, "5"), author: "Dan", message: "m", paths: ["VISION.md"], pulls: MERGED(77, "develop") });
  assert.equal(onDevelop.violation, true, "a PR merged into `develop` says nothing about `main`");

  const onMain = classifyCommit({ sha: "d".padEnd(40, "6"), author: "Dan", message: "m", paths: ["VISION.md"], pulls: MERGED(78, "main") });
  assert.equal(onMain.violation, false);

  // A PR with no `base` at all is not an excuse either — absence must not read as a match.
  const noBase = classifyCommit({ sha: "d".padEnd(40, "7"), author: "Dan", message: "m", paths: ["VISION.md"], pulls: [{ number: 79, merged_at: "x" }] });
  assert.equal(noBase.violation, true, "a PR whose base is unknown cannot prove which plane it merged into");

  assert.deepEqual(mergedPulls(MERGED(1, "develop")), []);
  assert.equal(mergedPulls(MERGED(1, "develop"), { baseBranch: "develop" }).length, 1,
    "the policed branch is a parameter, so a repo whose base is not `main` is not silently mis-judged");
  assert.equal(DEFAULT_BASE_BRANCH, "main", "canonical's own .flow/config.yml declares git.base_branch: main");
});

test("the policed branch is reported, so a wrong --base is visible rather than silent", async () => {
  const sha = "9".repeat(40);
  const io = fakeIO({ commits: [{ sha, author: "w", message: "m", paths: [".flow/tasks/a.md"] }] });
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0, baseBranch: "trunk" });
  assert.equal(summary.baseBranch, "trunk");
  assert.equal(parseArgs(["--base", "trunk"]).baseBranch, "trunk");
  assert.equal(parseArgs([]).baseBranch, "main");
});

test("a PR lookup that fails is reported as unresolved, fails the job, and files NOTHING", async () => {
  // Fail CLOSED: an unanswerable lookup must not silently excuse the commit. But it must also not
  // assert a violation it did not establish, so no issue is filed — the red tick is the signal.
  const sha = "4".repeat(40);
  const io = fakeIO({
    commits: [{ sha, author: "Dan", message: "m", paths: ["x.md"] }],
    pulls: { [sha]: new Error("500 Internal Server Error") },
  });

  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0, fileIssues: true });

  assert.equal(summary.violations.length, 1, "still counted — fail closed");
  assert.equal(summary.violations[0].verdict, "unresolved");
  assert.match(summary.violations[0].pullLookupError, /500/,
    "the reason must survive classification, or a lookup failure is indistinguishable from a real finding");
  assert.match(formatViolation(summary.violations[0]), /fails closed/);
  assert.equal(exitCodeFor(summary), 1);
  assert.deepEqual(summary.actions, [], "no issue is filed for a commit whose PR question went unanswered");
});

test("the graph is not read at all when no commit needs judging", async () => {
  // Lazy on purpose: a push carrying only store commits should cost no git call, and an empty scan
  // must reach its own `emptyScan` outcome rather than fail on a read it never needed. `fakeIO`'s
  // graph reader throws here, so either regression fails this test.
  const io = {
    ...fakeIO({ commits: [{ sha: "e".repeat(40), author: "w", message: "claim", paths: [".flow/tasks/a.md"] }] }),
    firstParentShas: async () => { throw new Error("the graph must not be read when nothing needs judging"); },
  };
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0 });
  assert.deepEqual(summary.violations, []);
  assert.equal(summary.examined, 1);

  const empty = { ...io, commits: async () => [] };
  const emptySummary = await runPlaneGuard({ io: empty, repo: "o/r", range: "x..y", now: 0 });
  assert.equal(emptySummary.emptyScan, true, "an empty scan is its own outcome, not a graph-read failure");
  assert.equal(exitCodeFor(emptySummary), 1);
});

test("the PR question is asked ONLY for commits with offending paths", async () => {
  // A full-history audit that asked for every store commit would spend one API call each for an
  // answer that cannot change the verdict. `fakeIO.pullsFor` throws for an unsupplied sha, so if
  // this regressed the store commit below would come back `unresolved` instead of `store-only`.
  const storeSha = "5".repeat(40);
  const codeSha = "6".repeat(40);
  const io = fakeIO({
    commits: [
      { sha: storeSha, author: "w", message: "claim", paths: [".flow/tasks/a.md"] },
      { sha: codeSha, author: "w", message: "code", paths: ["a.mjs"] },
    ],
    pulls: { [codeSha]: MERGED(1) },
  });

  const collected = await collectCommits({ io, range: "x..y" });
  assert.equal(collected.find((c) => c.sha === storeSha).pulls, undefined, "not asked");
  assert.equal(collected.find((c) => c.sha === codeSha).pulls.length, 1, "asked");
});

// ── criterion 4 ──────────────────────────────────────────────────────────────────────────────
// "a commit touching BOTH .flow/tasks/ and a path outside it, no PR -> a violation"

test("criterion 4: a store change does not launder the rest of the commit", () => {
  const r = classifyCommit({
    sha: "7".repeat(40),
    author: "Dan",
    message: "flow: claim flow-0024 — release guard so the stamp cannot lie",
    paths: [".flow/tasks/flow-0024-x.md", "VISION.md", ".flow/tasks/flow-0025-y.md", "docs/adr/0007.md"],
    pulls: [],
  });

  assert.equal(r.violation, true, "a task file in the same commit must not excuse the rest");
  assert.deepEqual(r.offending, ["VISION.md", "docs/adr/0007.md"],
    "and the report names ONLY the offending paths, not the whole commit");
  assert.equal(offendingPaths([".flow/tasks/a.md"]).length, 0);
});

// ── criterion 5 ──────────────────────────────────────────────────────────────────────────────
// "audit mode across a range of history reports the historical violation, naming its paths"
//
// Fixture, not a live run, and the reason is not convenience: the real audit needs the full commit
// graph and one API call per non-store commit, and CI checks out shallow with no network budget for
// 121 lookups. So the recorded FACTS of real commits (verified with `git log` and
// `/commits/{sha}/pulls` — see the PR description for the full 18-violation report) drive the pure
// layer here, and the real run is recorded in the PR where a human reads it.
//
// See this file's header for why the fixture is `d751e977` rather than the `d91e100` the task names.

// The COMPLETE `git log --format=%x1e%H%x1f%an%x1f%s%x1f --name-only` output for d751e977 — all 19
// paths, generated from the real commit rather than typed, so the parser is proved against the bytes
// git actually emits and not against this file's idea of them. The first version trimmed the list to
// nine paths while calling itself verbatim; flow-review's qa check caught the overstatement, which is
// the review layer doing its job on a comment rather than on code.
//
// Four of the 19 are `.flow/tasks/` files, and that is what makes this one commit prove criterion 4
// on REAL history too: a genuine store change, in a genuine commit, laundering nothing.
const D751_GITLOG =
  // The blank line after the header is git's own, not padding: `--name-only` separates the header
  // from the path list with one. `parseGitLog` drops empty lines, and a fixture that quietly
  // deleted it would stop proving that.
  "\x1ed751e97778f4da3b4084527899e9a5859c141cd7\x1fDan\x1ffix(bin): main-module detection must compare realpaths\x1f\n" +
  "\n" +
  ".flow/tasks/flow-0005-flow-init-cli.md\n" +
  ".flow/tasks/flow-0006-vendor-neutral-protocol.md\n" +
  ".flow/tasks/flow-0007-review-gates-out-of-session.md\n" +
  ".flow/tasks/flow-0008-guards-must-prove-they-ran.md\n" +
  "README.md\n" +
  "docs/adr/0003-flow-mcp-server.md\n" +
  "flow-diagnose.sh\n" +
  "flow-finish.sh\n" +
  "flow-tidy.sh\n" +
  "project-template/.flow/bin/apply-board-edits.mjs\n" +
  "project-template/.flow/bin/flow-doctor.mjs\n" +
  "project-template/.flow/bin/flow-open-pr.mjs\n" +
  "project-template/.flow/bin/flow-recover.mjs\n" +
  "project-template/.flow/bin/flow-state.mjs\n" +
  "project-template/.flow/bin/flow-sync.mjs\n" +
  "project-template/.flow/bin/main-module.test.mjs\n" +
  "project-template/.flow/bin/parse-task-id.mjs\n" +
  "project-template/.flow/bin/pick-task.mjs\n" +
  "project-template/.flow/bin/touches-guard.mjs\n";

test("criterion 5: audit mode over real history reports d751e977 — a real violation, naming its non-store paths", async () => {
  const commits = parseGitLog(D751_GITLOG);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].sha, "d751e97778f4da3b4084527899e9a5859c141cd7");
  assert.equal(commits[0].author, "Dan");

  const io = fakeIO({ commits, pulls: { "d751e97778f4da3b4084527899e9a5859c141cd7": [] } });
  const summary = await runPlaneGuard({ io, repo: "CandidDan/flow", range: "<root>..main", now: 0 });

  assert.equal(summary.violations.length, 1);
  const v = summary.violations[0];
  assert.deepEqual(v.offending, [
    "README.md",
    "docs/adr/0003-flow-mcp-server.md",
    "flow-diagnose.sh",
    "flow-finish.sh",
    "flow-tidy.sh",
    "project-template/.flow/bin/apply-board-edits.mjs",
    "project-template/.flow/bin/flow-doctor.mjs",
    "project-template/.flow/bin/flow-open-pr.mjs",
    "project-template/.flow/bin/flow-recover.mjs",
    "project-template/.flow/bin/flow-state.mjs",
    "project-template/.flow/bin/flow-sync.mjs",
    "project-template/.flow/bin/main-module.test.mjs",
    "project-template/.flow/bin/parse-task-id.mjs",
    "project-template/.flow/bin/pick-task.mjs",
    "project-template/.flow/bin/touches-guard.mjs",
  ], "the four .flow/tasks/ paths in the same commit are excused; the other fifteen are not");
  assert.equal(v.paths.length, 19, "the whole commit is carried, so the excused paths are visible too");
  assert.equal(exitCodeFor(summary), 1);
});

test("criterion 5 (the task's own fixture, corrected): d91e100 is NOT a violation and VISION.md arrived by PR #11", async () => {
  // Both facts pinned mechanically so the mistaken story in flow-0035's notes cannot be re-derived
  // from them. `git log -1 --name-only d91e100` and `/commits/5e2b41c/pulls` are the evidence.
  const d91 = parseGitLog("\x1ed91e100fe577f23fbe939b5f63d2efdc10410227\x1fClaude\x1fflow: claim flow-0024 — release guard so the stamp cannot lie\x1f\n" +
    ".flow/tasks/flow-0024-release-cannot-publish-a-lying-stamp.md\n");
  assert.equal(classifyCommit(d91[0]).verdict, "store-only",
    "d91e100 touches one task file: it is a correct claim commit, not the VISION.md violation the task describes");

  const vision = parseGitLog("\x1e5e2b41c581540d83a432f408516484064ba5c88e\x1fClaude\x1f[vision] Initial vision for canonical\x1f\nVISION.md\n");
  const io = fakeIO({ commits: vision, pulls: { "5e2b41c581540d83a432f408516484064ba5c88e": MERGED(11) } });
  const summary = await runPlaneGuard({ io, repo: "CandidDan/flow", range: "x..y", now: 0 });
  assert.deepEqual(summary.violations, [],
    "5e2b41c created VISION.md and was carried by merged PR #11 — the guard must not report it");
});

test("the git log parser survives a commit subject containing the characters a delimiter would eat", () => {
  // `%s` is single-line by construction and the delimiters are control characters, so a subject
  // carrying pipes, colons, quotes or an em dash cannot swallow the path list that follows it.
  const nasty = 'fix: a|b :: "c" — d\\e';
  const parsed = parseGitLog(`\x1e${"9".repeat(40)}\x1fO'Brien\x1f${nasty}\x1f\nsrc/a.mjs\n`);
  assert.equal(parsed[0].message, nasty);
  assert.equal(parsed[0].author, "O'Brien");
  assert.deepEqual(parsed[0].paths, ["src/a.mjs"]);
});

test("a commit whose subject carries a record separator FAILS the parse rather than inventing a path", () => {
  // Verified against real git: `git commit -m $'subject with \x1f a separator'` is accepted, and the
  // text after the separator would otherwise land in the PATH LIST — the guard would report a violation
  // against a path that does not exist. A detection tool whose report can be made wrong has lost the
  // only thing it has, so it refuses to answer instead. Raised twice by flow-review's security check.
  const withFieldSep = `\x1e${"1".repeat(40)}\x1fDan\x1fsubject with \x1f a separator\x1f\nf.md\n`;
  assert.throws(() => parseGitLog(withFieldSep), /split into 5 fields, not 4/);

  // A RECORD separator in the subject splits the record in two instead. Both halves are then
  // short-field, so the field-count check catches it first — a different message, the same refusal.
  // (The expectation here was originally the sha check; the test was wrong, not the code.)
  const withRecordSep = `\x1e${"2".repeat(40)}\x1fDan\x1fsubject with \x1e a separator\x1f\nf.md\n`;
  assert.throws(() => parseGitLog(withRecordSep), /not 4/);

  // The sha check is the backstop for output that is the right SHAPE but not git's: four fields whose
  // first is not a commit id. Hard to reach through a crafted commit, which is why it is a backstop.
  assert.throws(() => parseGitLog(`\x1eNOT-A-SHA\x1fDan\x1fsubject\x1f\nf.md\n`), /is not a commit sha/);

  // An author name is equally attacker-influenced and equally covered.
  assert.throws(() => parseGitLog(`\x1e${"3".repeat(40)}\x1fDa\x1fn\x1fsubject\x1f\nf.md\n`), /not 4/);

  // And the ordinary case still parses — a strict check that rejected real output would be worse.
  const ok = parseGitLog(`\x1e${"4".repeat(40)}\x1fDan\x1fan ordinary subject\x1f\nf.md\ng.md\n`);
  assert.equal(ok.length, 1);
  assert.deepEqual(ok[0].paths, ["f.md", "g.md"]);
  assert.equal(ok[0].message, "an ordinary subject");
});

test("the commit-pulls request asks for a full page, so a multi-PR commit is not read short", () => {
  // In the real-IO block, which by design no behavioural test reaches — so a source assertion, the
  // same treatment the CLI's `createIO` call got for the same reason. Reading a short page could miss
  // the PR that excuses a commit and report a false violation, which is the one error class this guard
  // must not make.
  const src = readFileSync(join(import.meta.dirname, "plane-guard.mjs"), "utf8");
  assert.match(src, /commits\/\$\{sha\}\/pulls\?per_page=100/,
    "the commit->PR lookup must request a full page rather than the default 30");
});

test("the failing parse reaches the CLI as an unresolvable-range failure, not a silent empty scan", async () => {
  // `gitCommitsInRange` wraps the parse, so a crafted commit surfaces through the same loud path as a
  // bad ref: nothing is examined and the run fails, rather than reporting green on a partial read.
  const exec = () => `\x1e${"5".repeat(40)}\x1fDan\x1fbad \x1f subject\x1f\nf.md\n`;
  assert.throws(() => gitCommitsInRange("a..b", { exec }), /not 4/);
});

test("a merge commit parses to zero paths, which is the right answer and not an omission", () => {
  const parsed = parseGitLog(`\x1e${"8".repeat(40)}\x1fGitHub\x1fMerge pull request #63 from CandidDan/x\x1f\n`);
  assert.deepEqual(parsed[0].paths, [], "git prints an empty combined diff for an ordinary merge");
  assert.equal(classifyCommit(parsed[0]).verdict, "no-paths",
    "and its verdict says so — a merge touching nothing is a different fact from one touching only the store");
  assert.equal(classifyCommit(parsed[0]).violation, false, "either way there is nothing to police");
  assert.equal(classifyCommit({ sha: "x".repeat(40), author: "w", message: "claim", paths: [".flow/tasks/a.md"] }).verdict,
    "store-only", "…and a real store commit keeps the label that describes it");
});

// ── criterion 6 ──────────────────────────────────────────────────────────────────────────────
// "a run that examined no commits fails rather than reporting success"

test("criterion 6: a scan that examined no commits FAILS — an empty check is not a pass", async () => {
  const io = fakeIO({ commits: [] });
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0 });

  assert.equal(summary.examined, 0);
  assert.equal(summary.emptyScan, true, "reported as its own distinct outcome, never folded into `no violations`");
  assert.deepEqual(summary.violations, []);
  assert.equal(exitCodeFor(summary), 1, "zero commits and zero violations must still exit 1");

  assert.equal(checkCommits([]).emptyScan, true);
  assert.equal(checkCommits(undefined).emptyScan, true);
});

test("criterion 6: a range git cannot resolve fails loudly instead of degrading to an empty scan", () => {
  // The two must not look alike. An empty scan claims the guard ran and found nothing to check —
  // a statement about `main`. An unresolvable ref is a statement about the checkout.
  const exec = () => { const e = new Error("Command failed"); e.stderr = "fatal: bad revision 'deadbeef..main'\n"; throw e; };
  assert.throws(() => gitCommitsInRange("deadbeef..main", { exec }), /could not resolve the range .deadbeef\.\.main./);
  assert.throws(() => gitCommitsInRange("deadbeef..main", { exec }), /fatal: bad revision/);
});

test("a failed write fails the job even when the finding itself was reported", async () => {
  const sha = "b".repeat(40);
  const io = fakeIO({ commits: [{ sha, author: "Dan", message: "m", paths: ["x.md"] }], pulls: { [sha]: [] }, failWrites: true });
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0, fileIssues: true });
  assert.ok(summary.failures.length > 0, "the failure is collected, not raised — one bad write must not abort the rest");
  assert.equal(exitCodeFor(summary), 1);
});

test("audit mode files nothing unless asked, so a long range cannot open an issue per finding", async () => {
  const sha = "c".repeat(40);
  const io = fakeIO({ commits: [{ sha, author: "Dan", message: "m", paths: ["x.md"] }], pulls: { [sha]: [] } });
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "v1.0.0..main", now: 0 });
  assert.equal(summary.violations.length, 1, "still reported");
  assert.deepEqual(summary.actions, [], "and nothing filed — `fileIssues` defaults to false");
  assert.deepEqual(io._writes, []);
});

test("--dry-run plans the actions without performing a single write", async () => {
  const sha = "d".repeat(40);
  const io = fakeIO({ commits: [{ sha, author: "Dan", message: "m", paths: ["x.md"] }], pulls: { [sha]: [] } });
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0, fileIssues: true, dryRun: true });
  assert.equal(summary.actions.length, 1);
  assert.equal(summary.actions[0].dryRun, true);
  assert.deepEqual(io._writes, []);
});

test("the label is ensured idempotently, and a 422 duplicate counts as success", async () => {
  const exists = { rest: async () => ({ name: PLANE_GUARD_LABEL }), write: async () => { throw new Error("should not POST"); } };
  assert.equal(await ensureLabel({ io: exists, repo: "o/r" }), "exists");

  const creates = { rest: async () => { throw new Error("404"); }, write: async () => ({ name: PLANE_GUARD_LABEL }) };
  assert.equal(await ensureLabel({ io: creates, repo: "o/r" }), "created");

  const raced = { rest: async () => { throw new Error("404"); }, write: async () => { const e = new Error("422"); e.status = 422; throw e; } };
  assert.equal(await ensureLabel({ io: raced, repo: "o/r" }), "exists");
});

test("a failed label ensure does not skip the filings it precedes", async () => {
  const writes = [];
  const io = {
    rest: async () => { throw new Error("404"); },
    write: async (method, path, body) => {
      if (path.endsWith("/labels")) { const e = new Error("403"); e.status = 403; throw e; }
      writes.push({ method, path, body });
      return { number: 1 };
    },
  };
  const actions = [{ type: "file", sha: "e".repeat(40), title: "t", body: "b" }];
  const { applied, failures } = await applyActions({ io, repo: "o/r", actions });
  assert.equal(applied.length, 1, "the issue is still attempted");
  assert.equal(failures.filter((f) => f.type === "label").length, 1, "and the label failure is recorded separately");
});

test("the comment write path is exercised end to end, URL template included", async () => {
  // code-review's note: `planIssueActions` proves the DECISION to comment, but nothing drove the
  // actual write, so a wrong URL template on the comment POST would have gone unnoticed. This asserts
  // the URL and body that reach `io.write`, not just the plan.
  const sha = "7".repeat(40);
  const io = fakeIO({
    commits: [{ sha, author: "Dan", message: "m", paths: ["x.md"] }],
    pulls: { [sha]: [] },
    issues: [{ number: 42, user: { login: "github-actions[bot]" }, body: `${violationMarker(sha)}\n\nfiled on an earlier run` }],
  });

  const summary = await runPlaneGuard({ io, repo: "CandidDan/flow", range: "x..y", now: 0, fileIssues: true });

  assert.deepEqual(summary.actions, [{ type: "comment", sha, issueNumber: 42 }]);
  assert.deepEqual(io._writes.map((w) => `${w.method} ${w.path}`),
    ["POST /repos/CandidDan/flow/issues/42/comments"],
    "exactly one comment POST, at the right URL — and no second issue filed");
  assert.match(io._writes[0].body.body, /Still unresolved/);
  assert.ok(!io._writes.some((w) => w.path.endsWith("/labels")), "no label ensure: nothing is being filed");
});

test("a failed open-issues read fails the job rather than filing blind", async () => {
  // The other uncovered catch. Without the index the guard cannot tell a new finding from one already
  // tracked, so the failure is recorded and the job fails — it does not proceed to file duplicates.
  const sha = "8".repeat(40);
  const io = {
    commits: async () => [{ sha, author: "Dan", message: "m", paths: ["x.md"] }],
    firstParentShas: async () => new Set([sha]),
    pullsFor: async () => [],
    rest: async (path) => { if (path.includes("/issues?")) throw new Error("502 Bad Gateway"); return {}; },
    write: async () => ({ number: 1 }),
  };
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0, fileIssues: true });
  assert.equal(summary.failures.filter((f) => f.type === "read-issues").length, 1);
  assert.match(summary.failures[0].reason, /502/);
  assert.equal(exitCodeFor(summary), 1);
});

test("a decoy issue carrying a forged marker does not suppress the real alert", async () => {
  // flow-review's security check: the marker is an HTML comment in a body anyone who can open a
  // labelled issue could write, so a decoy naming a commit about to be pushed would make the guard
  // treat the real violation as tracked and merely comment on the decoy — downgrading the alert
  // exactly when it matters. Authorship is now part of the match, and the attempt is REPORTED rather
  // than silently skipped, so it becomes a signal instead of a no-op.
  const sha = "c".repeat(40);
  const decoy = { number: 5, user: { login: "not-the-guard" }, body: `${violationMarker(sha)}\n\nnothing to see here` };
  const io = fakeIO({
    commits: [{ sha, author: "Dan", message: "sneaky", paths: ["payload.mjs"] }],
    pulls: { [sha]: [] },
    issues: [decoy],
  });

  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0, fileIssues: true });

  assert.deepEqual(summary.actions.map((a) => a.type), ["file"], "a FRESH issue is filed, not a comment on the decoy");
  assert.deepEqual(summary.foreignMarkers, [{ number: 5, author: "not-the-guard", sha }],
    "and the forged marker is reported, so the attempt is visible");
  assert.ok(io._writes.some((w) => w.path === "/repos/o/r/issues"), "the real alert reached the inbox");
  assert.ok(!io._writes.some((w) => w.path.includes("/issues/5/")), "the decoy was never commented on");

  assert.equal(markedIssues([decoy]).size, 0, "a forged marker never enters the dedupe index");
  assert.deepEqual(foreignMarkedIssues([decoy]).map((f) => f.author), ["not-the-guard"]);
  // An issue with no marker at all is not "foreign" — it is simply none of this guard's business.
  assert.deepEqual(foreignMarkedIssues([{ number: 6, user: { login: "someone" }, body: "hand-filed" }]), []);
});

test("nothing is ever closed from here — a commit on main does not recover on its own", () => {
  const clean = classifyCommit({ sha: "f".repeat(40), author: "w", message: "m", paths: [".flow/tasks/a.md"] });
  const openIssues = [{ number: 3, user: { login: "github-actions[bot]" }, body: violationMarker("f".repeat(40)) }];
  const { actions } = planIssueActions({ repo: "o/r", violations: [], openIssues, now: 0 });
  assert.deepEqual(actions, [], "no close action exists: unlike a dead workflow, this never self-resolves");
  assert.equal(clean.violation, false);
});

test("parseArgs reads the range and repo from flags or the environment", () => {
  assert.equal(parseArgs(["--range", "a..b", "--repo", "o/r"]).range, "a..b");
  assert.equal(parseArgs(["--range", "a..b", "--repo", "o/r"]).repo, "o/r");
  assert.equal(parseArgs(["--file-issues"]).fileIssues, true);
  assert.equal(parseArgs([]).fileIssues, false);
  assert.equal(parseArgs(["--dry-run", "--json"]).dryRun, true);
  assert.equal(parseArgs(["--dry-run", "--json"]).json, true);
  assert.equal(issueTitle("abcdef1234"), "Plane violation: abcdef12 reached main without a PR");
});

// ── criterion 7 ──────────────────────────────────────────────────────────────────────────────
// "the workflow's permissions block grants no more than the check requires, and a test fails if
//  it is widened"
//
// TWO tests, deliberately. The YAML-parsed one is authoritative but needs `npm ci`, and
// `_flow-gates.yml`'s `flow-tooling` job runs `node --test .flow/bin/*.test.mjs` with no install
// step — so in that job it would SKIP, and a permissions widening would meet no check there at
// all. The regex backstop below needs nothing and therefore never skips.

const yamlMod = await import("yaml").then((m) => m, () => null);
const yamlSkip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";
const wfSrc = readFileSync(WORKFLOW, "utf8");

test("criterion 7: plane-guard.yml grants exactly contents:read, issues:write and pull-requests:read", { skip: yamlSkip }, () => {
  const doc = yamlMod.parse(wfSrc);
  const perms = doc?.jobs?.["plane-guard"]?.permissions;
  assert.ok(perms && typeof perms === "object", "the job declares an explicit permissions block");
  assert.equal(perms.contents, "read");
  assert.equal(perms.issues, "write");
  // Not optional and not defensive. Once a `permissions:` block exists every unlisted scope is
  // `none`, and `/commits/{sha}/pulls` — the question the entire check turns on — needs
  // `pull-requests: read`. Drop it and every offending commit 403s into `unresolved`: loud, but the
  // guard establishes nothing. Asserted so a future "tidy-up" cannot quietly disarm it.
  assert.equal(perms["pull-requests"], "read",
    "the commit->PR lookup needs pull-requests: read, or the guard 403s on every commit it must judge");
  assert.deepEqual(Object.entries(perms).filter(([, v]) => v === "write").map(([k]) => k), ["issues"],
    "issues is the ONLY write scope — a guard that could push to main is a larger blast radius than the violation");
  assert.deepEqual(Object.keys(perms).sort(), ["contents", "issues", "pull-requests"],
    "exactly the three scopes the check uses — no more, and no fewer");
  assert.equal(doc.permissions, undefined, "no repo-wide default permissions block");
});

test("criterion 7 (no-install backstop): the permissions block text grants nothing beyond contents:read and issues:write", () => {
  const block = wfSrc.match(/\n {4}permissions:\n((?: {6}\S[^\n]*\n)+)/);
  assert.ok(block, "the permissions block must be findable without a YAML loader");
  const lines = block[1].trim().split("\n").map((l) => l.trim()).sort();
  assert.deepEqual(lines, ["contents: read", "issues: write", "pull-requests: read"],
    "any added, widened or DROPPED scope fails here, in the job that has no npm install");
  assert.doesNotMatch(wfSrc, /^permissions:/m, "no repo-wide default permissions block");
});

test("criterion 7: no `run:` block in plane-guard.yml interpolates a GitHub Actions expression", { skip: yamlSkip }, () => {
  // `security.focus` in .flow/config.yml names "untrusted input reaching `run:` blocks" as one of
  // canonical's real risks, and `inputs.range` is a free-text workflow_dispatch string — exactly
  // that. Values reach the shell through `env:` instead. Asserted rather than documented, because
  // the safe form and the unsafe one look almost identical in a diff.
  const doc = yamlMod.parse(wfSrc);
  const steps = doc.jobs["plane-guard"].steps.filter((s) => typeof s.run === "string");
  assert.ok(steps.length > 0, "an empty check is a failure, not a pass — there are run: blocks to check");
  for (const step of steps) {
    assert.doesNotMatch(step.run, /\$\{\{/, `step "${step.name}" interpolates an expression into run:; pass it via env: instead`);
  }
});

// The shell lines of every `run: |` block, found by INDENTATION rather than by a regex over the
// whole file. The first attempt at this used a lookahead regex, it matched nothing, and the
// mutation below sailed through it — a check that silently examines zero lines is the exact
// failure mode flow-0008 exists for, so the extraction asserts it found something.
function runBlockLines(src) {
  const out = [];
  let indent = null;
  for (const line of String(src).split("\n")) {
    const opener = line.match(/^(\s*)(?:- )?run: \|/);
    if (opener) { indent = opener[1].length; continue; }
    if (indent === null) continue;
    if (line.trim() === "") continue;
    if (line.match(/^(\s*)/)[1].length <= indent) { indent = null; continue; }
    out.push(line);
  }
  return out;
}

test("criterion 7: no `run:` line wraps a shell backtick substitution inside a double-quoted string", () => {
  // NOT THEORETICAL. The first draft of this workflow wrote
  //     echo "::notice::push `before` sha is unusable …"
  // where backticks inside a double-quoted shell string are COMMAND SUBSTITUTION — the shell would
  // have tried to run `before`. YAML parsed it. `npm run build` parsed it. `node --check` never saw
  // it. Nothing in the gate looks at shell semantics inside a workflow, so this is the check.
  // Pure `#` comment lines are excluded, and that is precision rather than a loophole: the shell does
  // not evaluate a comment, so backticks in one are inert. A TRAILING comment on a command line is
  // still checked — the safer bias, since telling the two apart needs a shell parser. This exclusion
  // exists because the check flagged its own explanatory prose once the workflow started quoting the
  // rule it enforces.
  const lines = runBlockLines(wfSrc).filter((l) => !l.trim().startsWith("#"));
  assert.ok(lines.length > 10, `expected the run: blocks to yield shell lines, got ${lines.length}`);
  for (const line of lines) {
    assert.doesNotMatch(line, /"[^"\n]*`[^"\n]*`[^"\n]*"/,
      `a backtick pair inside a double-quoted shell string is command substitution:\n  ${line.trim()}`);
  }
});

test("criterion 7 (no-install backstop): no `run:` line interpolates a GitHub Actions expression", () => {
  // The YAML-parsed version of this check skips in `_flow-gates.yml`'s no-install job. This one
  // does not, so `security.focus`'s "untrusted input reaching `run:` blocks" is checked in both.
  const lines = runBlockLines(wfSrc);
  assert.ok(lines.length > 10);
  for (const line of lines) {
    assert.doesNotMatch(line, /\$\{\{/, `values must reach the shell via env:, not interpolation:\n  ${line.trim()}`);
  }
});

test("the workflow checks out full history, because a shallow clone cannot resolve the range", { skip: yamlSkip }, () => {
  const doc = yamlMod.parse(wfSrc);
  const checkout = doc.jobs["plane-guard"].steps.find((s) => String(s.uses ?? "").startsWith("actions/checkout@"));
  assert.ok(checkout, "there is a checkout step");
  assert.equal(checkout.with?.["fetch-depth"], 0, "fetch-depth: 0 — otherwise the push `before` sha is unreachable");
});

test("the workflow triggers on push to main and offers audit mode by dispatch", { skip: yamlSkip }, () => {
  const doc = yamlMod.parse(wfSrc);
  assert.deepEqual(doc.on.push.branches, ["main"], "the live check watches main");
  assert.ok(doc.on.workflow_dispatch?.inputs?.range, "audit mode takes a range");
  assert.equal(doc.on.workflow_dispatch.inputs.file_issues.default, false,
    "audit filing is opt-in — a long range would otherwise open one issue per finding");
});

test("plane-guard is canonical-only: no reusable and no template caller", () => {
  // Same asymmetry as flow-watchdog.yml, for the same reason: whether an adopting repo wants its
  // own `main` policed is that repo's decision, not one canonical makes by shipping a caller.
  for (const p of [".github/workflows/_flow-plane-guard.yml", "project-template/.github/workflows/plane-guard.yml"]) {
    assert.throws(() => readFileSync(join(REPO_ROOT, p)), /ENOENT/, `${p} must not exist`);
  }
});

test("the Markdown escaping is imported from watchdog.mjs, not reimplemented", () => {
  // One implementation of a subtle CommonMark rule. Two would be two answers to one question, in
  // the one place where a misrendered alert is a misleading alert.
  const src = readFileSync(join(import.meta.dirname, "plane-guard.mjs"), "utf8");
  assert.match(src, /import \{ codeSpan \} from "\.\.\/\.\.\/flightdeck\/bin\/watchdog\.mjs"/);
  assert.doesNotMatch(src, /export function codeSpan/, "codeSpan must not be forked into this file");

  // And it must actually hold: an author name carrying a backtick cannot escape its span.
  const body = renderIssueBody({ repo: "o/r", violation: { sha: "a".repeat(40), author: "a`b", message: "`c`", offending: ["x.md"] }, now: 0 });
  assert.ok(body.includes("``a`b``"), "a backtick in the author name is fenced, not spilled into live Markdown");
});

test("a range that looks like a git OPTION is rejected by git, not silently honoured", () => {
  // flow-review's security check spotted that `range` reaches `git log` as a positional argument with
  // nothing marking the end of options. `execFileSync` with an argv array stops shell injection; it
  // does nothing about GIT reading the value as a flag. And the workflow's allowlist does not catch
  // this class on its own: `--all` is letters and dashes. The CLI is also invocable directly with no
  // allowlist in front of it.
  //
  // Run against REAL git — the whole question is what git does — but in a fixture repo, so it holds
  // in a depth-1 CI checkout too. See `withFixtureRepo`.
  withFixtureRepo(({ dir, shas }) => {
    assert.throws(() => gitCommitsInRange("--all", { cwd: dir }),
      /could not resolve the range .--all./, "a flag-shaped range must fail loudly, not quietly widen the scan");

    // …and a legitimate range still resolves through the same code path — the half that breaks if
    // `--end-of-options` is swapped for `--`, which would make this return zero commits.
    const one = gitCommitsInRange(`${shas.D}^!`, { cwd: dir });
    assert.equal(one.length, 1, "a normal range must still resolve");
    assert.deepEqual(one[0].paths, ["d.md"]);
    assert.equal(one[0].author, "Fixture");
    assert.equal(one[0].message, "D: straight to main");

    const span = gitCommitsInRange(`${shas.A}..${shas.D}`, { cwd: dir });
    assert.ok(span.length >= 4, `a two-dot range must resolve too, got ${span.length}`);
  });
});

test("the git invocation uses --end-of-options and NOT `--`, which would silently return zero commits", () => {
  // `--` starts a pathspec: `git log ... -- a..b` looks for a FILE called `a..b`, finds none, and
  // returns nothing. Verified against real git — it turns the guard into a permanently empty scan,
  // worse than the flag-injection it would be closing. Pinned so the tempting one-character
  // "simplification" fails a test instead of disarming the guard.
  const src = readFileSync(join(import.meta.dirname, "plane-guard.mjs"), "utf8");
  const argv = src.match(/\["log",[^\]]*\]/);
  assert.ok(argv, "the git argv array must be findable");
  assert.match(argv[0], /"--end-of-options"/, "the range must be marked as not-an-option");
  assert.doesNotMatch(argv[0], /"--",/, "`--` would make the range a pathspec and the scan always empty");
});

test("the audit range is validated by an allowlist that RUNS, not just by a comment", () => {
  // flow-review's security check found that `echo "range=${AUDIT_RANGE}" >> "$GITHUB_OUTPUT"` lets a
  // newline in a `workflow_dispatch` string inject a second output key (`file_issues=true`, turning
  // a read-only audit into one that files). No privilege boundary is crossed — dispatch already needs
  // write access — but it is closed anyway.
  //
  // This test EXECUTES the `case` pattern from the workflow rather than asserting the text is
  // present, because a shell pattern is exactly the kind of thing that looks right and is not: the
  // first version of this allowlist rejected `<sha>^!`, the single-commit form the workflow's own
  // push fallback uses.
  const pattern = wfSrc.match(/^\s*"" \| (\*\[!.+?\]\*)\)$/m);
  assert.ok(pattern, "the allowlist case pattern must be findable in the workflow");
  // The second arm — a leading dash is a flag, not a range. Extracted too, so the test exercises the
  // whole `case`, not the half that is easier to find.
  assert.match(wfSrc, /^\s*-\*\)$/m, "the flag-shaped-range arm must be present");

  const script = `
    case "$1" in
      "" | ${pattern[1]}) echo REJECT ;;
      -*) echo REJECT ;;
      *) echo ACCEPT ;;
    esac
  `;
  const verdict = (value) => execFileSync("sh", ["-c", script, "sh", value], { encoding: "utf8" }).trim();

  for (const ok of ["v1.0.0..main", "d751e977^!", "7307e2ef..origin/main", "HEAD~20..HEAD", "main", "a/b..c/d"]) {
    assert.equal(verdict(ok), "ACCEPT", `${JSON.stringify(ok)} is a legitimate git range and must be accepted`);
  }
  for (const bad of ["", "a..b\nfile_issues=true", "a..b; rm -rf /", "a..b$(whoami)", "a..b`id`", "a..b|tee x", "a..b'x",
                     "--all", "--reverse", "-n5"]) {
    assert.equal(verdict(bad), "REJECT", `${JSON.stringify(bad)} must be rejected`);
  }
});

test("the audit range is written with the delimited form, not a bare key=value line", () => {
  assert.match(wfSrc, /echo "range<<PLANE_GUARD_RANGE_EOF"/,
    "the free-text range must use $GITHUB_OUTPUT's delimited form, so a newline cannot start a new key");
});

test("the workflow documents that the force-push fallback examines only the after-commit", () => {
  // A limitation stated in the file is a limitation; one left to be discovered is a bug. The
  // reviewer's point stands and the trade-off is recorded where the fallback lives.
  assert.match(wfSrc, /KNOWN LIMITATION/, "the single-commit fallback's gap must be stated where it is chosen");
  assert.match(wfSrc, /Audit mode over an explicit range is the tool/, "…along with the way to recover from it");
});

test("a full page of open issues is reported as a possibly-incomplete dedupe index, not silently trusted", async () => {
  // Past ISSUES_PER_PAGE concurrently-open findings the index is incomplete and the guard would
  // start filing duplicates. Mild, but it must not be SILENT.
  const sha = "a".repeat(40);
  const many = Array.from({ length: ISSUES_PER_PAGE }, (_, i) => ({ number: i + 1, user: { login: "github-actions[bot]" }, body: violationMarker(`other${i}`) }));
  const io = fakeIO({ commits: [{ sha, author: "Dan", message: "m", paths: ["x.md"] }], pulls: { [sha]: [] }, issues: many });

  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0, fileIssues: true });
  assert.equal(summary.dedupeIndexTruncated, true, "a full page means there may be more");

  // And it does NOT fail the job on its own: the consequence is a visible duplicate issue, whereas a
  // job that failed forever past 100 findings would simply be switched off.
  assert.equal(exitCodeFor({ violations: [], emptyScan: false, failures: [], dedupeIndexTruncated: true }), 0);
});

test("a short page of open issues is trusted as complete", async () => {
  const sha = "b".repeat(40);
  const io = fakeIO({ commits: [{ sha, author: "Dan", message: "m", paths: ["x.md"] }], pulls: { [sha]: [] }, issues: [{ number: 1, user: { login: "github-actions[bot]" }, body: "unrelated" }] });
  const summary = await runPlaneGuard({ io, repo: "o/r", range: "x..y", now: 0, fileIssues: true });
  assert.equal(summary.dedupeIndexTruncated, false);
});

// ── criterion 8 is the gate itself (build, lint, test, coverage) — proved by running it, and
//    recorded in the PR description with the numbers.
