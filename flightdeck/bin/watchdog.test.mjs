// watchdog.test.mjs — proving tests for flightdeck/bin/watchdog.mjs (flow-0020).
//
// Every acceptance criterion in `.flow/tasks/flow-0020-flow-watchdog.md` is proved by name in a
// test title below, so `qa-verifier` maps criterion -> test without guessing.
//
// Criteria 1-5 are proved END TO END through `watchRepo` against an in-memory GitHub, not against
// `planRepoActions` alone. That is deliberate: "exactly one open issue on the second and third
// run" is a statement about state carried BETWEEN runs, and a pure-function test of the planner
// would prove the plan while leaving the thing that actually re-reads GitHub untested. The fake
// mutates on write, so run N genuinely sees what run N-1 did.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import {
  AUTOMATION_DOWN_LABEL,
  applyActions,
  ensureLabel,
  evaluateWorkflows,
  findIssueForWorkflow,
  issueTitle,
  markedIssues,
  planRepoActions,
  renderIssueBody,
  runWatchdog,
  watchRepo,
  workflowMarker,
} from "./watchdog.mjs";

const NOW = Date.parse("2026-08-28T08:00:00Z");
const HOUR = 3600000;
const REPO = "CandidDan/flow";

const SCHEDULED_6H = `name: queue-runner\non:\n  schedule:\n    - cron: "0 */6 * * *"\n  workflow_dispatch:\n`;
const SCHEDULED_DAILY = `name: triage\non:\n  schedule:\n    - cron: "0 8 * * *"\n`;
const EVENT_WF = `name: gates\non:\n  pull_request:\n`;
const MANUAL_WF = `name: release\non:\n  workflow_dispatch:\n`;

// ── an in-memory GitHub ─────────────────────────────────────────────────────────────────────
// `workflows` entries: { file, text, state, lastSuccessAt, lastSuccessUrl, latestRun }.
function fakeGitHub({ workflows = [], openIssues = [], labelExists = true }) {
  const state = {
    issues: openIssues.map((i) => ({ ...i })),
    labelExists,
    writes: [],
    reads: [],
    nextIssueNumber: 100,
  };
  const byId = new Map(workflows.map((w, idx) => [idx + 1, w]));

  async function rest(path) {
    state.reads.push(path);

    if (/\/contents\/\.github\/workflows$/.test(path)) {
      return workflows.map((w) => ({ type: "file", name: w.file }));
    }
    const blob = path.match(/\/contents\/\.github\/workflows\/(.+)$/);
    if (blob) {
      const wf = workflows.find((w) => w.file === blob[1]);
      if (!wf) { const e = new Error("404 not found"); e.status = 404; throw e; }
      return { content: Buffer.from(wf.text, "utf8").toString("base64") };
    }
    if (/\/actions\/workflows\?/.test(path)) {
      return {
        workflows: workflows.map((w, idx) => ({
          id: idx + 1,
          name: parseYaml(w.text).name,
          path: `.github/workflows/${w.file}`,
          state: w.state ?? "active",
        })),
      };
    }
    const runs = path.match(/\/actions\/workflows\/(\d+)\/runs\?(.*)$/);
    if (runs) {
      const wf = byId.get(Number(runs[1]));
      if (runs[2].includes("status=success")) {
        return wf.lastSuccessAt
          ? { workflow_runs: [{ run_started_at: wf.lastSuccessAt, html_url: wf.lastSuccessUrl ?? null }] }
          : { workflow_runs: [] };
      }
      return wf.latestRun ? { workflow_runs: [wf.latestRun] } : { workflow_runs: [] };
    }
    if (/\/issues\?labels=/.test(path)) return state.issues.filter((i) => i.state !== "closed");
    if (/\/labels\//.test(path)) {
      if (state.labelExists) return { name: AUTOMATION_DOWN_LABEL };
      const e = new Error("404 label not found"); e.status = 404; throw e;
    }
    if (/^\/search\/repositories/.test(path)) return { items: [{ full_name: REPO }] };
    throw new Error(`fakeGitHub: unrouted GET ${path}`);
  }

  async function write(method, path, body) {
    state.writes.push({ method, path, body });
    if (method === "POST" && /\/labels$/.test(path)) { state.labelExists = true; return { name: body.name }; }
    if (method === "POST" && /\/issues$/.test(path)) {
      const issue = { number: state.nextIssueNumber++, title: body.title, body: body.body, labels: body.labels, state: "open" };
      state.issues.push(issue);
      return issue;
    }
    if (method === "POST" && /\/issues\/\d+\/comments$/.test(path)) return { id: 1 };
    if (method === "PATCH" && /\/issues\/\d+$/.test(path)) {
      const n = Number(path.match(/\/issues\/(\d+)$/)[1]);
      const issue = state.issues.find((i) => i.number === n);
      if (issue) issue.state = body.state;
      return issue;
    }
    throw new Error(`fakeGitHub: unrouted ${method} ${path}`);
  }

  return { io: { rest, write }, state };
}

const filings = (s) => s.writes.filter((w) => w.method === "POST" && /\/issues$/.test(w.path));
const comments = (s) => s.writes.filter((w) => w.method === "POST" && /\/issues\/\d+\/comments$/.test(w.path));
const patches = (s) => s.writes.filter((w) => w.method === "PATCH");

// ── criterion 1 ──────────────────────────────────────────────────────────────────────────────

test("criterion 1: a disabled queue-runner files an automation-down issue in THAT repo naming the workflow, its last success and the rule that fired", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "flow-queue-runner.yml", text: SCHEDULED_6H, state: "disabled_manually", lastSuccessAt: "2026-08-28T05:00:00Z" }],
  });

  const result = await watchRepo({ io, fullName: REPO, now: NOW });

  const filed = filings(state);
  assert.equal(filed.length, 1, "exactly one issue filed");
  assert.equal(filed[0].path, `/repos/${REPO}/issues`, "filed in the AFFECTED repo, not in canonical");
  assert.deepEqual(filed[0].body.labels, [AUTOMATION_DOWN_LABEL]);

  const body = filed[0].body.body;
  assert.match(body, /\.github\/workflows\/flow-queue-runner\.yml/, "names the workflow");
  assert.match(body, /2026-08-28T05:00:00/, "names the last successful run");
  assert.match(body, /workflow disabled/, "names the rule that fired");
  assert.equal(result.down[0].state, "off", "a disabled workflow reports `off`, never a blank");
});

test("criterion 1 (rule text): a scheduled workflow silently past 2x its cron interval reports crit and the body carries the interval maths", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "flow-queue-runner.yml", text: SCHEDULED_6H, lastSuccessAt: new Date(NOW - 13 * HOUR).toISOString() }],
  });

  await watchRepo({ io, fullName: REPO, now: NOW });
  const body = filings(state)[0].body.body;
  assert.match(body, /last success 13\.0h ago, cron interval ~6\.0h/);
  assert.match(body, /State:.*`crit`/);
});

test("a workflow's free-text `name:` is code-spanned in the issue body, so it cannot reshape the Markdown", () => {
  const body = renderIssueBody({
    fullName: REPO,
    workflow: { path: ".github/workflows/q.yml", name: "**bold** [link](http://x) `tick", state: "crit", reason: "r" },
    now: NOW,
  });
  assert.match(body, /\(`\*\*bold\*\* \[link\]\(http:\/\/x\) `tick`\)/, "the name sits inside a code span");
});

// ── criterion 2 ──────────────────────────────────────────────────────────────────────────────

test("criterion 2: on a second and third run with the workflow still down, exactly ONE open issue exists and re-detection is a comment", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "flow-queue-runner.yml", text: SCHEDULED_6H, lastSuccessAt: new Date(NOW - 20 * HOUR).toISOString() }],
  });

  await watchRepo({ io, fullName: REPO, now: NOW });
  await watchRepo({ io, fullName: REPO, now: NOW + HOUR });
  const third = await watchRepo({ io, fullName: REPO, now: NOW + 2 * HOUR });

  assert.equal(filings(state).length, 1, "filed once across three runs");
  assert.equal(state.issues.filter((i) => i.state === "open").length, 1, "exactly one open issue");
  assert.equal(comments(state).length, 2, "runs two and three each commented");
  assert.match(comments(state)[1].body.body, /Still down as of/);
  assert.equal(third.actions[0].type, "comment");
});

// ── criterion 3 ──────────────────────────────────────────────────────────────────────────────

test("criterion 3: once the workflow has run successfully the open issue is closed with a comment linking the recovery run", async () => {
  const wf = { file: "flow-queue-runner.yml", text: SCHEDULED_6H, lastSuccessAt: new Date(NOW - 20 * HOUR).toISOString() };
  const { io, state } = fakeGitHub({ workflows: [wf] });

  await watchRepo({ io, fullName: REPO, now: NOW });
  assert.equal(state.issues[0].state, "open");

  // The workflow recovers: a fresh success, well inside one cron interval.
  wf.lastSuccessAt = new Date(NOW - HOUR).toISOString();
  wf.lastSuccessUrl = "https://github.com/CandidDan/flow/actions/runs/999";
  const after = await watchRepo({ io, fullName: REPO, now: NOW });

  assert.equal(after.actions[0].type, "close");
  assert.equal(patches(state).length, 1);
  assert.equal(patches(state)[0].body.state, "closed");
  assert.equal(state.issues[0].state, "closed");
  const recovery = comments(state).at(-1).body.body;
  assert.match(recovery, /Recovered/);
  assert.match(recovery, /actions\/runs\/999/, "links the recovery run");
});

test("criterion 3 (hysteresis): `warn` neither files nor closes — an issue opened at crit stays open through the dead-band", async () => {
  const wf = { file: "flow-queue-runner.yml", text: SCHEDULED_6H, lastSuccessAt: new Date(NOW - 20 * HOUR).toISOString() };
  const { io, state } = fakeGitHub({ workflows: [wf] });
  await watchRepo({ io, fullName: REPO, now: NOW });

  wf.lastSuccessAt = new Date(NOW - 7 * HOUR).toISOString(); // between 1x and 2x -> warn
  const after = await watchRepo({ io, fullName: REPO, now: NOW });

  assert.deepEqual(after.actions, [], "warn takes no action at all");
  assert.equal(state.issues[0].state, "open", "the issue is not closed on a warn");
  assert.equal(filings(state).length, 1, "and no second issue is filed");
});

// ── criterion 4 ──────────────────────────────────────────────────────────────────────────────

test("criterion 4: with no automation-down label present, the label is created BEFORE the issue and the filing succeeds", async () => {
  const { io, state } = fakeGitHub({
    labelExists: false,
    workflows: [{ file: "flow-queue-runner.yml", text: SCHEDULED_6H, lastSuccessAt: null }],
  });

  await watchRepo({ io, fullName: REPO, now: NOW });

  const labelWrite = state.writes.findIndex((w) => /\/labels$/.test(w.path));
  const issueWrite = state.writes.findIndex((w) => /\/issues$/.test(w.path));
  assert.notEqual(labelWrite, -1, "the label was created");
  assert.ok(labelWrite < issueWrite, "label creation precedes the filing");
  assert.equal(filings(state).length, 1, "and the filing succeeded");
});

test("criterion 4 (idempotent): ensureLabel treats an existing label and a 422 duplicate as success, never an error", async () => {
  const { io } = fakeGitHub({ workflows: [], labelExists: true });
  assert.equal(await ensureLabel({ io, fullName: REPO }), "exists");

  const raced = {
    rest: async () => { const e = new Error("404"); e.status = 404; throw e; },
    write: async () => { const e = new Error("422 already_exists"); e.status = 422; throw e; },
  };
  assert.equal(await ensureLabel({ io: raced, fullName: REPO }), "exists");
});

// ── criterion 5 ──────────────────────────────────────────────────────────────────────────────

test("criterion 5: two different workflows down in one repo produce TWO issues, one per workflow, never one aggregate", async () => {
  const { io, state } = fakeGitHub({
    workflows: [
      { file: "flow-queue-runner.yml", text: SCHEDULED_6H, lastSuccessAt: new Date(NOW - 20 * HOUR).toISOString() },
      { file: "flow-triage.yml", text: SCHEDULED_DAILY, state: "disabled_manually", lastSuccessAt: null },
    ],
  });

  await watchRepo({ io, fullName: REPO, now: NOW });

  const filed = filings(state);
  assert.equal(filed.length, 2, "one issue per dead workflow");
  const markers = filed.map((f) => f.body.body.match(/<!-- flow-watchdog:workflow=(.*?) -->/)[1]).sort();
  assert.deepEqual(markers, [".github/workflows/flow-queue-runner.yml", ".github/workflows/flow-triage.yml"]);
  assert.notEqual(filed[0].body.title, filed[1].body.title, "distinct titles, not one aggregate");
});

test("criterion 5 (independence): when one of the two recovers, only its issue closes", async () => {
  const runner = { file: "flow-queue-runner.yml", text: SCHEDULED_6H, lastSuccessAt: new Date(NOW - 20 * HOUR).toISOString() };
  const triage = { file: "flow-triage.yml", text: SCHEDULED_DAILY, lastSuccessAt: new Date(NOW - 200 * HOUR).toISOString() };
  const { io, state } = fakeGitHub({ workflows: [runner, triage] });

  await watchRepo({ io, fullName: REPO, now: NOW });
  runner.lastSuccessAt = new Date(NOW - HOUR).toISOString();
  await watchRepo({ io, fullName: REPO, now: NOW });

  const open = state.issues.filter((i) => i.state === "open");
  assert.equal(open.length, 1);
  assert.match(open[0].body, /flow-triage\.yml/);
});

// ── criterion 6 ──────────────────────────────────────────────────────────────────────────────

test("criterion 6: flow-watchdog.yml grants issues: write and NO other write scope, and fails if contents is ever raised to write", () => {
  const repoRoot = join(import.meta.dirname, "..", "..");
  const doc = parseYaml(readFileSync(join(repoRoot, ".github/workflows/flow-watchdog.yml"), "utf8"));

  const perms = doc?.jobs?.watchdog?.permissions;
  assert.ok(perms && typeof perms === "object", "the job declares an explicit permissions block");
  assert.equal(perms.issues, "write", "issues: write is granted");
  assert.notEqual(perms.contents, "write", "contents must never be raised to write");

  const writable = Object.entries(perms).filter(([, v]) => v === "write").map(([k]) => k);
  assert.deepEqual(writable, ["issues"], "issues is the ONLY write scope");

  assert.equal(doc.permissions, undefined, "no repo-wide default permissions block");
});

test("criterion 6 (canonical-only): there is no _flow-watchdog reusable and no template caller — the asymmetry is deliberate", () => {
  const repoRoot = join(import.meta.dirname, "..", "..");
  for (const p of [".github/workflows/_flow-watchdog.yml", "project-template/.github/workflows/flow-watchdog.yml"]) {
    assert.throws(() => readFileSync(join(repoRoot, p)), /ENOENT/, `${p} must not exist — one watchdog, one schedule, one place`);
  }
});

test("no `run:` block in flow-watchdog.yml interpolates a GitHub Actions expression", () => {
  // `security.focus` in .flow/config.yml names "untrusted input reaching `run:` blocks" as one of
  // canonical's real risks. Values reach the shell through `env:` instead, so an input can never
  // become script text — asserted rather than documented, because the safe form and the unsafe one
  // look almost identical in a diff.
  const repoRoot = join(import.meta.dirname, "..", "..");
  const doc = parseYaml(readFileSync(join(repoRoot, ".github/workflows/flow-watchdog.yml"), "utf8"));

  const steps = doc.jobs.watchdog.steps.filter((s) => typeof s.run === "string");
  assert.ok(steps.length > 0, "an empty scan is a failure, not a pass — there are run: blocks to check");
  for (const step of steps) {
    assert.doesNotMatch(step.run, /\$\{\{/, `step "${step.name}" interpolates an expression into run:; pass it via env: instead`);
  }
});

// ── criterion 7 ──────────────────────────────────────────────────────────────────────────────

test("criterion 7: the liveness rules come from liveness.mjs and are not reimplemented in watchdog.mjs", () => {
  const src = readFileSync(join(import.meta.dirname, "watchdog.mjs"), "utf8");

  const importLine = src.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/liveness\.mjs"/);
  assert.ok(importLine, "watchdog.mjs imports from ./liveness.mjs");
  const imported = importLine[1].split(",").map((s) => s.trim()).filter(Boolean);
  for (const fn of ["classifyWorkflowTrigger", "eventLiveness", "scheduledLiveness"]) {
    assert.ok(imported.includes(fn), `${fn} is imported, not redefined`);
  }

  // A local definition of any imported rule would shadow the import and silently fork the spec.
  for (const fn of ["scheduledLiveness", "eventLiveness", "classifyWorkflowTrigger", "cronIntervalHours", "parseCronExpr", "extractCronExpressions"]) {
    assert.doesNotMatch(src, new RegExp(`function\\s+${fn}\\b`), `${fn} must not be defined locally`);
  }
  // Nor may the cron maths be re-derived under another name.
  assert.doesNotMatch(src, /\bcron\s*:\s*\\?["']/, "no cron parsing of its own");
});

// ── discovery, and the bare-topic trap ───────────────────────────────────────────────────────

test("discovery is owner-scoped — a bare `topic:flow` is never issued", async () => {
  const { io, state } = fakeGitHub({ workflows: [{ file: "gates.yml", text: EVENT_WF, latestRun: { conclusion: "success" } }] });
  const summary = await runWatchdog({ io, owner: "CandidDan", now: NOW });

  assert.equal(summary.query, "user:CandidDan topic:flow");
  const search = state.reads.find((p) => p.startsWith("/search/repositories"));
  assert.match(search, /user%3ACandidDan/, "the owner qualifier reaches the wire");
  assert.equal(summary.repos, 1);
});

test("discovering ZERO repos is flagged as a failure, not reported as a healthy fleet", async () => {
  // The watchdog's own version of the bug it hunts: an empty result set is indistinguishable from
  // "everything is fine" unless something says so. Enrolment is the `flow` topic, so a fleet where
  // nobody added the topic — or an org account queried with the `user:` qualifier — watches nothing.
  const io = { rest: async () => ({ items: [] }), write: async () => {} };
  const summary = await runWatchdog({ io, owner: "CandidDan", now: NOW });

  assert.equal(summary.repos, 0);
  assert.equal(summary.discoveredNothing, true, "the empty discovery is flagged, not silently green");
  assert.deepEqual(summary.results, []);
});

test("a non-empty discovery is not flagged", async () => {
  const { io } = fakeGitHub({ workflows: [{ file: "gates.yml", text: EVENT_WF, latestRun: { conclusion: "success" } }] });
  const summary = await runWatchdog({ io, owner: "CandidDan", now: NOW });
  assert.equal(summary.discoveredNothing, false);
});

test("ownerType: 'org' switches the discovery qualifier, so an org account does not silently match zero repos", async () => {
  const { io, state } = fakeGitHub({ workflows: [{ file: "gates.yml", text: EVENT_WF, latestRun: { conclusion: "success" } }] });
  const summary = await runWatchdog({ io, owner: "SomeOrg", ownerType: "org", now: NOW });

  assert.equal(summary.query, "org:SomeOrg topic:flow");
  assert.match(state.reads.find((p) => p.startsWith("/search/repositories")), /org%3ASomeOrg/);
});

test("the workflow wires FLOW_WATCHDOG_OWNER_TYPE through to the CLI, not just the owner", () => {
  const repoRoot = join(import.meta.dirname, "..", "..");
  const doc = parseYaml(readFileSync(join(repoRoot, ".github/workflows/flow-watchdog.yml"), "utf8"));

  assert.ok(doc.env?.FLOW_WATCHDOG_OWNER_TYPE, "the owner type is defined at workflow level");
  const runStep = doc.jobs.watchdog.steps.find((s) => s.name === "Run the watchdog");
  assert.ok(runStep.env.FLOW_WATCHDOG_OWNER, "owner reaches the step");
  assert.ok(runStep.env.FLOW_WATCHDOG_OWNER_TYPE, "owner TYPE reaches the step too");
});

// ── the smaller pure pieces ──────────────────────────────────────────────────────────────────

test("evaluateWorkflows drops manual workflows — a workflow_dispatch-only file has no cadence to be late for", () => {
  const out = evaluateWorkflows([
    { path: "a.yml", name: "release", text: MANUAL_WF, disabled: true },
    { path: "b.yml", name: "gates", text: EVENT_WF, disabled: false, latestRun: { conclusion: "failure" } },
  ], NOW);

  assert.equal(out.length, 1);
  assert.equal(out[0].path, "b.yml");
  assert.equal(out[0].state, "crit");
});

test("the dedupe key is the workflow PATH, so renaming a workflow's `name:` cannot orphan its issue", () => {
  const issues = [{ number: 7, body: `${workflowMarker(".github/workflows/x.yml")}\n\nbody` }];
  assert.equal(findIssueForWorkflow(issues, ".github/workflows/x.yml").number, 7);
  assert.equal(findIssueForWorkflow(issues, ".github/workflows/other.yml"), null);
  assert.deepEqual([...markedIssues(issues).keys()], [".github/workflows/x.yml"]);
});

test("findIssueForWorkflow and markedIssues cannot disagree — one marker parser, one answer", () => {
  // They used to match by different means (substring test vs regex extraction). A body carrying
  // two markers is the case where that could diverge: whichever the planner trusted would decide
  // whether an issue is filed or commented on, so the two must resolve identically.
  const issues = [
    { number: 1, body: `${workflowMarker(".github/workflows/a.yml")}\n\nfirst` },
    { number: 2, body: `${workflowMarker(".github/workflows/b+c.yml")}\n\nregex-special path` },
  ];
  const index = markedIssues(issues);

  for (const path of [".github/workflows/a.yml", ".github/workflows/b+c.yml", ".github/workflows/missing.yml"]) {
    assert.equal(findIssueForWorkflow(issues, path)?.number ?? null, index.get(path)?.number ?? null, path);
  }
  assert.equal(findIssueForWorkflow(issues, ".github/workflows/b+c.yml").number, 2, "a regex-special path still resolves");
});

test("an automation-down issue with no watchdog marker is left alone — a human's issue is not this file's to close", () => {
  const openIssues = [{ number: 5, body: "queue runner looks dead to me" }];
  const machinery = [{ path: ".github/workflows/q.yml", name: "q", state: "good" }];
  const { actions } = planRepoActions({ fullName: REPO, machinery, openIssues, now: NOW });
  assert.deepEqual(actions, []);
});

test("a tracked workflow that vanished is reported as orphaned, never closed on absence", () => {
  const openIssues = [{ number: 9, body: workflowMarker(".github/workflows/gone.yml") }];
  const { actions, orphaned } = planRepoActions({ fullName: REPO, machinery: [], openIssues, now: NOW });
  assert.deepEqual(actions, []);
  assert.deepEqual(orphaned, [".github/workflows/gone.yml"]);
});

test("a repo the token cannot read is reported unavailable, never silently omitted", async () => {
  const io = { rest: async () => { throw new Error("404 Not Found"); }, write: async () => {} };
  const r = await watchRepo({ io, fullName: "CandidDan/private", now: NOW });
  assert.equal(r.status, "unavailable");
  assert.match(r.reason, /404/);
});

test("--dry-run plans everything and writes nothing", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "flow-queue-runner.yml", text: SCHEDULED_6H, lastSuccessAt: null }],
  });
  const r = await watchRepo({ io, fullName: REPO, now: NOW, dryRun: true });

  assert.equal(r.actions.length, 1);
  assert.deepEqual(state.writes, [], "no write call of any kind");
});

test("a failed write on one repo does not abort the rest of the fleet scan", async () => {
  // The regression this pins: writes used to throw straight out of watchRepo, so a transient 5xx
  // filing one issue aborted the whole run and left every remaining repo unchecked for a day.
  const io = {
    rest: async (path) => {
      if (/^\/search\/repositories/.test(path)) return { items: [{ full_name: "o/a" }, { full_name: "o/b" }] };
      if (/\/contents\/\.github\/workflows$/.test(path)) return [{ type: "file", name: "flow-queue-runner.yml" }];
      if (/\/contents\/\.github\/workflows\//.test(path)) return { content: Buffer.from(SCHEDULED_6H, "utf8").toString("base64") };
      if (/\/actions\/workflows\?/.test(path)) return { workflows: [{ id: 1, name: "queue-runner", path: ".github/workflows/flow-queue-runner.yml", state: "active" }] };
      if (/\/runs\?/.test(path)) return { workflow_runs: [] };
      if (/\/issues\?labels=/.test(path)) return [];
      if (/\/labels\//.test(path)) return { name: AUTOMATION_DOWN_LABEL };
      throw new Error(`unrouted GET ${path}`);
    },
    // Every filing fails, for both repos.
    write: async () => { const e = new Error("500 Internal Server Error"); e.status = 500; throw e; },
  };

  const summary = await runWatchdog({ io, owner: "o", now: NOW });

  assert.equal(summary.results.length, 2, "the second repo was still scanned after the first failed to write");
  for (const r of summary.results) {
    assert.equal(r.status, "incomplete", "reported as incomplete, not ok and not unavailable");
    assert.equal(r.failures.length, 1);
    assert.match(r.failures[0].reason, /500/, "the real cause is carried, not swallowed");
    assert.equal(r.failures[0].type, "file");
  }
});

test("applyActions isolates per-action failures and still applies the rest", async () => {
  let calls = 0;
  const io = {
    rest: async () => ({ name: AUTOMATION_DOWN_LABEL }),
    write: async (method, path) => {
      calls += 1;
      if (/\/issues$/.test(path)) { const e = new Error("422 unprocessable"); e.status = 422; throw e; }
      return { number: 7 };
    },
  };

  const { applied, failures } = await applyActions({
    io, fullName: REPO,
    actions: [
      { type: "file", path: "a.yml", title: "t", body: "b" },
      { type: "comment", path: "b.yml", issueNumber: 2, body: "x" },
    ],
  });

  assert.equal(failures.length, 1, "the filing failed");
  assert.equal(failures[0].path, "a.yml");
  assert.equal(applied.length, 1, "the comment still went out");
  assert.equal(applied[0].type, "comment");
  assert.ok(calls >= 2, "the second action was attempted despite the first throwing");
});

test("applyActions files, comments and closes through the injected writer only", async () => {
  const seen = [];
  const io = { rest: async () => ({ name: AUTOMATION_DOWN_LABEL }), write: async (m, p, b) => { seen.push([m, p]); return { number: 1 }; } };
  await applyActions({
    io, fullName: REPO,
    actions: [
      { type: "file", path: "a.yml", title: issueTitle("a"), body: renderIssueBody({ fullName: REPO, workflow: { path: "a.yml" }, now: NOW }) },
      { type: "comment", path: "b.yml", issueNumber: 2, body: "x" },
      { type: "close", path: "c.yml", issueNumber: 3, body: "y" },
    ],
  });
  assert.deepEqual(seen, [
    ["POST", `/repos/${REPO}/issues`],
    ["POST", `/repos/${REPO}/issues/2/comments`],
    ["POST", `/repos/${REPO}/issues/3/comments`],
    ["PATCH", `/repos/${REPO}/issues/3`],
  ]);
});
