#!/usr/bin/env node
// plane-guard.mjs — the `main` half of Flow's two-planes rule, which nothing was checking.
//
// THE INVARIANT. Every commit on `main` that touches a path outside `.flow/tasks/` must have an
// associated merged pull request. Store changes may arrive by direct push — the protocol requires
// it, because a claim, a `flow-status` sync and a `flow-done` all commit straight to `main`.
// Everything else may not.
//
// WHY THE BRANCH HALF IS NOT ENOUGH. `_flow-gates.yml` runs a store-guard that fails any PR whose
// diff touches `.flow/tasks/`. That is the branch side of the rule: a branch must not carry store
// state. The `main` side — that a direct push may carry ONLY store state — was enforced by
// nothing at all, and the gap is not theoretical. This repo's own `VISION.md`, the document every
// task's `serves:` resolves against, arrived through it: one commit, no PR, no review. It governed
// the backlog for weeks before anyone noticed. See `.flow/tasks/flow-0035-main-plane-guard.md`.
//
// WHY THE CHECK IS ON CONTENT, NOT ON ACCESS. The obvious fix — protect `main` — breaks Flow: the
// store plane *needs* direct pushes. So the question this file answers is never "who pushed?" but
// "what did the push contain, and did a pull request carry it?".
//
// THIS IS DETECTION, NOT PREVENTION, AND THE DISTINCTION IS NOT A QUIBBLE. A push-triggered
// workflow runs *after* the push has landed and cannot reject it. The honest claim is that it
// takes time-to-discovery from weeks to minutes. Do not describe it, in a PR or an issue body, as
// making the violation impossible — a repository push ruleset would do that, and is named as a
// follow-up rather than attempted here. It also never reverts anything: a guard that rewrites
// `main` on its own judgment is a larger blast radius than the problem it is policing.
//
// "ASSOCIATED WITH A PULL REQUEST" IS ASKED OF GITHUB, NOT INFERRED FROM THE COMMIT GRAPH. Squash,
// merge-commit and rebase merges leave three different shapes in history, and a check keyed on any
// one of them fires on the other two. `/repos/{owner}/{repo}/commits/{sha}/pulls` answers the
// question directly for all three, which is exactly why the rule is phrased as *has an associated
// merged PR* rather than as a property of the parents.
//
// IO IS INJECTED, in the same shape as `flightdeck/bin/watchdog.mjs`, so every decision branch
// below is a table test with no network, no clock and no git of its own. The one real IO
// implementation sits at the bottom and is never reached from a test.

import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Imported, not reimplemented. `codeSpan` encodes a subtle CommonMark rule — a span closes on the
// first backtick RUN of matching length, so a fixed pair is not enough — and this file writes
// commit subjects and author names into a Markdown issue body, both of which are supplied by
// whoever pushed. Two implementations of that rule is two answers to one question, in the one
// place where a misrendered alert is a misleading alert. See watchdog.mjs's header for the bug
// that produced it. Importing it also cannot fire watchdog's CLI: that block is `__isMain`-guarded.
import { codeSpan } from "../../flightdeck/bin/watchdog.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED. Reached
// through a symlink the two differ, the comparison is false, and the CLI below silently never
// runs — no output, exit 0, nothing to debug. For a guard that means failing OPEN: reporting
// enforcement it did not perform. Compare realpaths on both sides.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";

// The one path prefix a direct push to `main` may carry. Deliberately `.flow/tasks/` and not
// `.flow/` — `.flow/config.yml` is repo-owned config that travels on a branch when a task declares
// it, and `.flow/bin/**` is canonical's, adopted by PR. Only the store is a `main`-only plane.
export const STORE_PREFIX = ".flow/tasks/";

export const PLANE_GUARD_LABEL = "plane-violation";
export const LABEL_COLOR = "d93f0b";
export const LABEL_DESCRIPTION =
  "Filed by plane-guard: a commit reached main outside .flow/tasks/ with no associated pull request.";

// ── pure: is this path in the store plane? ───────────────────────────────────────────────────
//
// `git log --name-only` emits repo-relative paths with forward slashes on every platform, so no
// separator normalisation is needed. A leading `./` is stripped anyway because the GitHub push
// payload and a hand-typed `--paths` fixture can both carry one, and a prefix test is the kind of
// check that fails open on a shape it did not expect.
export function isStorePath(path) {
  const p = String(path ?? "").replace(/^\.\//, "");
  return p.startsWith(STORE_PREFIX);
}

// The paths in a commit that the store plane does not excuse. A commit touching BOTH a task file
// and something else is a violation on the something else: a store change does not launder the
// rest of the commit, which is the whole reason this returns the offending subset rather than a
// boolean over the commit.
export function offendingPaths(paths) {
  return (paths ?? []).map((p) => String(p ?? "").replace(/^\.\//, "")).filter((p) => p && !isStorePath(p));
}

// A commit is excused by a pull request only when that PR actually MERGED. An open PR whose head
// happens to contain the sha proves nothing about how the commit reached `main` — it is the state
// a direct push plus a later PR from `main` would leave behind, which is precisely the case this
// guard must still catch. `merged_at` is the field GitHub sets on merge for all three merge styles.
export function mergedPulls(pulls) {
  return (pulls ?? []).filter((p) => !!p?.merged_at);
}

// ── pure: one commit -> one verdict ──────────────────────────────────────────────────────────
//
// `commit` is `{ sha, author, message, paths, pulls }` — whatever the IO layer assembled. `pulls`
// may be absent, which is not the same as an empty array: `undefined` means "not asked" (the
// caller skips the API call for a commit with no offending paths, to spend rate limit only where
// the answer can change the outcome), `[]` means "asked, and there are none".
export function classifyCommit(commit) {
  const c = commit ?? {};
  const offending = offendingPaths(c.paths);
  const base = {
    sha: String(c.sha ?? ""),
    author: c.author ?? "unknown",
    message: c.message ?? "",
    paths: (c.paths ?? []).map(String),
    offending,
    // Carried through DELIBERATELY. `collectCommits` fails closed when the PR lookup errors, so
    // such a commit is reported as a violation — and if this field were dropped here, that report
    // would be indistinguishable from a genuine one. The first version of this file dropped it,
    // and the audit run in flow-0035's PR is where that showed up: 121 of 121 commits reported as
    // violations because every lookup had 401'd, with nothing in the output saying so.
    ...(c.pullLookupError ? { pullLookupError: c.pullLookupError } : {}),
  };

  if (offending.length === 0) return { ...base, verdict: "store-only", violation: false };

  const merged = mergedPulls(c.pulls);
  if (merged.length > 0) {
    return { ...base, verdict: "merged-pr", violation: false, pulls: merged.map((p) => p.number) };
  }
  return { ...base, verdict: c.pullLookupError ? "unresolved" : "violation", violation: true, pulls: [] };
}

// ── pure: a set of commits -> the whole finding ──────────────────────────────────────────────
//
// EXAMINING NOTHING IS A FAILURE, NOT A QUIET SUCCESS. A run that scanned zero commits and
// reported green is the silent no-op every guard in this repo exists to prevent (flow-0008): a
// mis-computed range, a bad `--range`, a `before` sha the runner's shallow clone cannot reach —
// all of them produce an empty scan that is indistinguishable from a clean one. So it is a
// distinct, reported outcome the CLI exits non-zero on, never folded into "no violations".
export function checkCommits(commits) {
  const results = (commits ?? []).map(classifyCommit);
  return {
    examined: results.length,
    results,
    violations: results.filter((r) => r.violation),
    emptyScan: results.length === 0,
  };
}

// ── reporting ────────────────────────────────────────────────────────────────────────────────

// One console line per violation, naming the commit, its author, its subject and the offending
// paths — the four things needed to act, on one line so a log scan finds them all.
export function formatViolation(v) {
  const paths = (v?.offending ?? []).join(", ");
  const why = v?.pullLookupError
    ? `and its PR lookup FAILED (${v.pullLookupError}) — reported because this guard fails closed`
    : "with no merged PR";
  return `plane-guard: ${String(v?.sha ?? "").slice(0, 8)} by ${v?.author ?? "unknown"} — "${v?.message ?? ""}" touches ${paths} ${why}`;
}

// Keyed on the full sha, so a re-run over the same range (a re-dispatch, an overlapping audit)
// comments rather than files a second issue. An HTML comment: invisible in rendered Markdown,
// exact to match.
export function violationMarker(sha) {
  return `<!-- plane-guard:commit=${String(sha ?? "")} -->`;
}

export function issueTitle(sha) {
  return `Plane violation: ${String(sha ?? "unknown").slice(0, 8)} reached main without a PR`;
}

// Every open plane-guard issue, as {sha -> issue}. THE ONLY PLACE THE MARKER IS PARSED — issues
// carrying no marker are ignored entirely, because a human may have hand-labelled something and
// this file acting on their issue would corrupt the inbox it feeds.
export function markedIssues(openIssues) {
  const out = new Map();
  for (const issue of openIssues ?? []) {
    const m = String(issue?.body ?? "").match(/<!-- plane-guard:commit=(.*?) -->/);
    if (m) out.set(m[1], issue);
  }
  return out;
}

export function renderIssueBody({ repo, violation, now }) {
  const v = violation ?? {};
  const detected = Number.isFinite(now) ? new Date(now).toISOString() : null;
  return [
    violationMarker(v.sha),
    "",
    `**Commit:** ${codeSpan(v.sha ?? "?")}`,
    `**Repository:** ${codeSpan(repo ?? "?")}`,
    // Author and subject both go through codeSpan: they are supplied by whoever pushed, and this
    // body is Markdown. An alert that can be made to misrender is an alert that can be made to
    // mislead, and being trustworthy is the entire asset a guard has.
    `**Author:** ${codeSpan(v.author ?? "unknown")}`,
    `**Subject:** ${codeSpan(v.message ?? "")}`,
    `**Paths outside ${codeSpan(STORE_PREFIX)}:**`,
    ...(v.offending ?? []).map((p) => `- ${codeSpan(p)}`),
    "",
    "Flow's two-planes rule: task state commits straight to `main`; code and docs go through a",
    "branch and a pull request. `_flow-gates.yml` enforces the branch half (a PR may not touch",
    "`.flow/tasks/`). This is the `main` half — a direct push may touch **only** the store.",
    "",
    "This is **detection, not prevention**: a push-triggered workflow runs after the push has",
    "landed. Nothing has been reverted, and nothing will be automatically — deciding what to do",
    "with the commit is a human call.",
    "",
    ...(detected ? [`_First detected ${detected} by \`plane-guard\`._`] : []),
  ].join("\n");
}

export function renderRedetectionComment({ violation, now }) {
  const detected = Number.isFinite(now) ? new Date(now).toISOString() : null;
  return [
    `Still unresolved as of ${detected ?? "this run"} — ${codeSpan(String(violation?.sha ?? "?"))} remains on \`main\` with no merged pull request.`,
    "",
    "_Re-detected by `plane-guard`. Commenting rather than filing again keeps this to one issue per commit._",
  ].join("\n");
}

// ── pure: violations + open issues -> the actions to take ────────────────────────────────────
//
// One issue per violating COMMIT, never one aggregate: an aggregate goes stale the moment one of
// its commits is dealt with, and the label stops meaning anything. Nothing is ever CLOSED from
// here — unlike a dead workflow, a commit that reached `main` without a PR does not recover on its
// own, so there is no observation that would justify closing the issue. A human resolves it.
export function planIssueActions({ repo, violations, openIssues, now }) {
  const tracked = markedIssues(openIssues);
  const actions = [];
  for (const v of violations ?? []) {
    // An `unresolved` commit FAILS THE JOB but files NOTHING. The guard fails closed, so a commit
    // whose PR lookup errored is counted as a violation — but that is a statement about the API
    // call, not about the commit, and an issue asserting a violation this run could not establish
    // is a false record in the capture inbox that a human then has to un-file. The red tick and
    // the stderr line are the signal; the next run resolves it properly.
    if (v.verdict === "unresolved") continue;

    const existing = tracked.get(v.sha) ?? null;
    if (existing) {
      actions.push({ type: "comment", sha: v.sha, issueNumber: existing.number, body: renderRedetectionComment({ violation: v, now }) });
    } else {
      actions.push({ type: "file", sha: v.sha, title: issueTitle(v.sha), body: renderIssueBody({ repo, violation: v, now }) });
    }
  }
  return { actions };
}

// ── pure: `git log` output -> commits ────────────────────────────────────────────────────────
//
// The format is fixed by `gitCommitsInRange` below: RS (\x1e) before each commit, US (\x1f)
// between its three header fields, then one path per line. Control characters rather than a
// printable delimiter because a commit subject may contain any printable text, `|` and `::`
// included — a delimiter a subject can contain is a parser that reports the wrong author on the
// one commit that matters. `%s` is the SUBJECT, single-line by construction, so a field can never
// swallow the path list that follows it.
//
// A merge commit yields NO paths under `--name-only` (git prints the combined diff, which is empty
// for an ordinary merge). That is the right answer, not an omission: the merge introduces nothing
// its parents did not already carry, and the parents are examined on their own.
export function parseGitLog(stdout) {
  const commits = [];
  for (const chunk of String(stdout ?? "").split("\x1e")) {
    if (!chunk.trim()) continue;
    const [sha = "", author = "", message = "", rest = ""] = chunk.split("\x1f");
    commits.push({
      sha: sha.trim(),
      author: author.trim(),
      message: message.trim(),
      paths: rest.split("\n").map((l) => l.trim()).filter(Boolean),
    });
  }
  return commits;
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────
//
// `io.commits(range)` returns the commits to examine; `io.pullsFor(sha)` answers the PR question.
// The second is called ONLY for a commit with offending paths — for every other commit the answer
// cannot change the verdict, and a full-history audit that asked anyway would spend one API call
// per store commit for nothing.
export async function collectCommits({ io, range }) {
  const commits = await io.commits(range);
  const out = [];
  for (const c of commits ?? []) {
    if (offendingPaths(c.paths).length === 0) { out.push(c); continue; }
    try {
      out.push({ ...c, pulls: await io.pullsFor(c.sha) });
    } catch (err) {
      // FAIL CLOSED. An unanswerable PR question must not silently excuse the commit: with no
      // `pulls` the classifier would read `undefined` as "not asked" and — because the commit HAS
      // offending paths — report a violation. That is the safe direction, and the reason is
      // recorded on the commit so the operator can tell a real finding from an API failure.
      out.push({ ...c, pulls: [], pullLookupError: `${err?.message || err}` });
    }
  }
  return out;
}

export async function applyActions({ io, repo, actions, dryRun = false }) {
  const applied = [];
  const failures = [];
  const needsLabel = (actions ?? []).some((a) => a.type === "file");

  if (needsLabel && !dryRun) {
    try {
      await ensureLabel({ io, repo });
    } catch (err) {
      // A failed label ensure does not skip the filings — GitHub may still accept the issue, and
      // if it does not, the per-action catch below records that separately.
      failures.push({ type: "label", sha: null, reason: `${err?.message || err}` });
    }
  }

  for (const a of actions ?? []) {
    if (dryRun) { applied.push({ ...a, dryRun: true }); continue; }
    try {
      if (a.type === "file") {
        const issue = await io.write("POST", `/repos/${repo}/issues`, { title: a.title, body: a.body, labels: [PLANE_GUARD_LABEL] });
        applied.push({ type: a.type, sha: a.sha, issueNumber: issue?.number ?? null });
      } else {
        await io.write("POST", `/repos/${repo}/issues/${a.issueNumber}/comments`, { body: a.body });
        applied.push({ type: a.type, sha: a.sha, issueNumber: a.issueNumber });
      }
    } catch (err) {
      // Collected, never raised: one failing write must not abort the remaining findings. Nothing
      // is swallowed — the CLI exits non-zero on any failure, so the run is still loud.
      failures.push({ type: a.type, sha: a.sha ?? null, reason: `${err?.message || err}` });
    }
  }
  return { applied, failures };
}

// Idempotent by construction: a first run against a fresh repo must not fail on a missing label,
// and a second must not fail because it exists. GitHub returns 422 for a duplicate, which is
// success for our purposes.
export async function ensureLabel({ io, repo }) {
  try {
    await io.rest(`/repos/${repo}/labels/${PLANE_GUARD_LABEL}`);
    return "exists";
  } catch {
    try {
      await io.write("POST", `/repos/${repo}/labels`, { name: PLANE_GUARD_LABEL, color: LABEL_COLOR, description: LABEL_DESCRIPTION });
      return "created";
    } catch (err) {
      if (err?.status === 422) return "exists";
      throw err;
    }
  }
}

// `fileIssues` defaults to FALSE, and audit mode is the reason. The live push check turns it on;
// an audit over a long range must not open thirty issues for history the operator is reading in
// one report. Filing is opt-in, reporting always happens.
export async function runPlaneGuard({ io, repo, range, now = Date.now(), fileIssues = false, dryRun = false }) {
  const commits = await collectCommits({ io, range });
  const { examined, results, violations, emptyScan } = checkCommits(commits);

  let actions = [];
  let failures = [];
  if (fileIssues && violations.length > 0) {
    let openIssues = [];
    try {
      const r = await io.rest(`/repos/${repo}/issues?labels=${PLANE_GUARD_LABEL}&state=open&per_page=100`);
      openIssues = (Array.isArray(r) ? r : []).filter((i) => !i.pull_request);
    } catch (err) {
      failures.push({ type: "read-issues", sha: null, reason: `${err?.message || err}` });
    }
    const planned = planIssueActions({ repo, violations, openIssues, now });
    const outcome = await applyActions({ io, repo, actions: planned.actions, dryRun });
    actions = outcome.applied;
    failures = failures.concat(outcome.failures);
  }

  return { repo, range, examined, results, violations, emptyScan, actions, failures };
}

// The exit code, as a pure function of the summary, so the rule is a table test rather than
// something only observable by running the CLI. Any of three things fails the job: a violation,
// an empty scan, or a write that did not land.
export function exitCodeFor(summary) {
  const s = summary ?? {};
  if (s.emptyScan) return 1;
  if ((s.violations ?? []).length > 0) return 1;
  if ((s.failures ?? []).length > 0) return 1;
  return 0;
}

// ── the one real IO implementation — never called from a test ────────────────────────────────

// A range git cannot resolve is a CONFIGURATION failure, not an empty scan, and the two must not
// look alike: an empty scan says "the guard ran and found nothing to check", which is a claim about
// `main`. So an unresolvable ref throws with the range named, rather than being swallowed into a
// zero-commit result — the CLI turns it into one readable line instead of a stack trace.
export function gitCommitsInRange(range, { cwd, exec = execFileSync } = {}) {
  let out;
  try {
    out = exec(
      "git",
      ["log", "--format=%x1e%H%x1f%an%x1f%s%x1f", "--name-only", "--no-color", range],
      { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (err) {
    const detail = String(err?.stderr || err?.message || err).split("\n")[0];
    throw new Error(`git could not resolve the range \`${range}\`: ${detail}`);
  }
  return parseGitLog(out);
}

export function createIO({ token, cwd, repo } = {}) {
  async function request(method, path, body) {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const err = new Error(`${res.status} ${res.statusText} — ${method} ${path}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  return {
    commits: async (range) => gitCommitsInRange(range, { cwd }),
    pullsFor: async (sha) => request("GET", `/repos/${repo}/commits/${sha}/pulls`),
    rest: (path) => request("GET", path),
    write: (method, path, body) => request(method, path, body),
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
//
//   node .flow/bin/plane-guard.mjs --range <before>..<after> [--file-issues] [--dry-run]
//   node .flow/bin/plane-guard.mjs --range <tag>..main --json          # audit mode
//
// Exits 1 on a violation, on an empty scan, or on a failed write; 0 otherwise.
export function parseArgs(argv) {
  const a = argv ?? [];
  const value = (flag) => { const i = a.indexOf(flag); return i !== -1 ? a[i + 1] : undefined; };
  return {
    range: value("--range") ?? process.env.PLANE_GUARD_RANGE,
    repo: value("--repo") ?? process.env.GITHUB_REPOSITORY,
    fileIssues: a.includes("--file-issues"),
    dryRun: a.includes("--dry-run"),
    json: a.includes("--json"),
  };
}

if (__isMain) {
  const { range, repo, fileIssues, dryRun, json } = parseArgs(process.argv.slice(2));

  if (!range) {
    console.error("plane-guard: no range — pass --range <before>..<after> or set PLANE_GUARD_RANGE");
    process.exit(1);
  }
  if (!repo) {
    console.error("plane-guard: no repository — pass --repo <owner/name> or set GITHUB_REPOSITORY");
    process.exit(1);
  }

  const io = createIO({ token: process.env.GITHUB_TOKEN, repo });
  let summary;
  try {
    summary = await runPlaneGuard({ io, repo, range, fileIssues, dryRun });
  } catch (err) {
    console.error(`plane-guard: ${err?.message || err}`);
    console.error("Nothing was checked, so this is a failure and not a pass.");
    process.exit(1);
  }

  if (json) {
    process.stdout.write(JSON.stringify({ ...summary, results: undefined }, null, 2) + "\n");
  }

  if (summary.emptyScan) {
    console.error(`plane-guard: examined ZERO commits for range \`${range}\` — a scan that checked nothing is not a pass.`);
    console.error("Check the range resolves in this checkout: a shallow clone cannot reach the `before` sha.");
    process.exit(1);
  }

  console.log(`plane-guard: examined ${summary.examined} commit(s) in \`${range}\`.`);
  for (const v of summary.violations) console.error(formatViolation(v));
  for (const r of summary.results) {
    if (r.pullLookupError) console.error(`plane-guard: could not resolve PRs for ${r.sha.slice(0, 8)} — treated as a violation: ${r.pullLookupError}`);
  }
  for (const f of summary.failures) console.error(`plane-guard: ${f.type} failed${f.sha ? ` for ${f.sha.slice(0, 8)}` : ""}: ${f.reason}`);

  if (summary.violations.length > 0) {
    console.error(`plane-guard: ${summary.violations.length} commit(s) reached main outside \`${STORE_PREFIX}\` with no merged PR.`);
    console.error("This is detection: the commits are still there. Decide what to do with them — nothing was reverted.");
  }

  process.exit(exitCodeFor(summary));
}
