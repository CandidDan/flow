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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  STORE_PREFIX,
  PLANE_GUARD_LABEL,
  checkCommits,
  classifyCommit,
  collectCommits,
  exitCodeFor,
  formatViolation,
  isStorePath,
  markedIssues,
  mergedPulls,
  offendingPaths,
  parseGitLog,
  planIssueActions,
  renderIssueBody,
  applyActions,
  ensureLabel,
  runPlaneGuard,
  gitCommitsInRange,
  violationMarker,
  issueTitle,
  parseArgs,
} from "./plane-guard.mjs";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const WORKFLOW = join(REPO_ROOT, ".github", "workflows", "plane-guard.yml");

// A merged PR, as GitHub's `/commits/{sha}/pulls` returns it — only the two fields that decide
// anything, so a fixture cannot accidentally depend on a field the code does not read.
const MERGED = (number) => [{ number, merged_at: "2026-09-01T00:00:00Z" }];
const OPEN = (number) => [{ number, merged_at: null }];

// A no-network IO. `commits` returns what it was given; `pullsFor` reads a map keyed by sha, and
// THROWS for a sha it does not know — so a test that forgets to supply an answer fails loudly
// rather than silently taking the fail-closed path and looking like it proved something.
function fakeIO({ commits = [], pulls = {}, issues = [], writes = [], failWrites = false } = {}) {
  return {
    commits: async () => commits,
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
  const openIssues = [{ number: 7, body: `${violationMarker(sha)}\n\nolder report` }];

  const { actions } = planIssueActions({ repo: "o/r", violations: [violation], openIssues, now: 0 });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "comment");
  assert.equal(actions[0].issueNumber, 7);

  assert.deepEqual([...markedIssues(openIssues).keys()], [sha]);
  assert.equal(markedIssues([{ number: 8, body: "a human filed this by hand" }]).size, 0,
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
    assert.ok(["merged-pr", "store-only"].includes(r.verdict), `${style} verdict was ${r.verdict}`);
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

test("a merge commit parses to zero paths, which is the right answer and not an omission", () => {
  const parsed = parseGitLog(`\x1e${"8".repeat(40)}\x1fGitHub\x1fMerge pull request #63 from CandidDan/x\x1f\n`);
  assert.deepEqual(parsed[0].paths, [], "git prints an empty combined diff for an ordinary merge");
  assert.equal(classifyCommit(parsed[0]).verdict, "store-only", "so it introduces nothing to police");
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

test("nothing is ever closed from here — a commit on main does not recover on its own", () => {
  const clean = classifyCommit({ sha: "f".repeat(40), author: "w", message: "m", paths: [".flow/tasks/a.md"] });
  const openIssues = [{ number: 3, body: violationMarker("f".repeat(40)) }];
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

test("criterion 7: plane-guard.yml grants exactly contents:read and issues:write", { skip: yamlSkip }, () => {
  const doc = yamlMod.parse(wfSrc);
  const perms = doc?.jobs?.["plane-guard"]?.permissions;
  assert.ok(perms && typeof perms === "object", "the job declares an explicit permissions block");
  assert.equal(perms.contents, "read");
  assert.equal(perms.issues, "write");
  assert.deepEqual(Object.entries(perms).filter(([, v]) => v === "write").map(([k]) => k), ["issues"],
    "issues is the ONLY write scope — a guard that could push to main is a larger blast radius than the violation");
  assert.deepEqual(Object.keys(perms).sort(), ["contents", "issues"], "no scope beyond the two the check uses");
  assert.equal(doc.permissions, undefined, "no repo-wide default permissions block");
});

test("criterion 7 (no-install backstop): the permissions block text grants nothing beyond contents:read and issues:write", () => {
  const block = wfSrc.match(/\n {4}permissions:\n((?: {6}\S[^\n]*\n)+)/);
  assert.ok(block, "the permissions block must be findable without a YAML loader");
  const lines = block[1].trim().split("\n").map((l) => l.trim()).sort();
  assert.deepEqual(lines, ["contents: read", "issues: write"],
    "any added or widened scope fails here, in the job that has no npm install");
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
  const lines = runBlockLines(wfSrc);
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

// ── criterion 8 is the gate itself (build, lint, test, coverage) — proved by running it, and
//    recorded in the PR description with the numbers.
