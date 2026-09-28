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
  codeSpan,
  ensureLabel,
  UNPARSEABLE_STATE,
  declaredWorkflowName,
  evaluateWorkflows,
  findIssueForWorkflow,
  issueTitle,
  markedIssues,
  planRepoActions,
  renderIssueBody,
  reportRun,
  runWatchdog,
  startupFailure,
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
          // `apiName` is what GitHub REGISTERED, which is only the same as the file's `name:` when
          // GitHub could parse the file. An unparseable workflow registers under its own path, and
          // no amount of parsing the fixture text can produce that — so the fixture states it.
          name: w.apiName ?? parseYaml(w.text).name,
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

test("codeSpan: the fence always outruns the longest backtick run inside the value", () => {
  // The property, not a literal expectation. The first version of this test fed a name containing
  // a backtick and asserted the raw output verbatim — so it passed while the span was broken.
  for (const [input, longestRun] of [["plain", 0], ["one `tick", 1], ["a ``pair`` here", 2], ["```", 3]]) {
    const out = codeSpan(input);
    const fence = out.match(/^`+/)[0];
    assert.equal(fence.length, longestRun + 1, `fence for ${JSON.stringify(input)}`);
    assert.ok(out.endsWith(fence), "opens and closes with the same fence");
    // The decisive check: no run inside the body is long enough to close the fence early.
    const body = out.slice(fence.length, -fence.length);
    for (const m of body.matchAll(/`+/g)) {
      assert.ok(m[0].length < fence.length, `inner run ${m[0].length} would close a fence of ${fence.length}`);
    }
  }
});

test("codeSpan pads when the value itself starts or ends with a backtick", () => {
  assert.equal(codeSpan("`x"), "`` `x ``");
  assert.equal(codeSpan("x`"), "`` x` ``");
  assert.equal(codeSpan("x"), "`x`");
});

test("a workflow's free-text `name:` cannot escape its code span in the issue body", () => {
  const hostile = "**bold** [link](http://x) `tick`` and ```three";
  const body = renderIssueBody({
    fullName: REPO,
    workflow: { path: ".github/workflows/q.yml", name: hostile, state: "crit", reason: "r" },
    now: NOW,
  });

  const span = codeSpan(hostile);
  assert.ok(body.includes(`(${span})`), "the name appears inside a computed-width span");
  // And prove the span actually contains the whole name — the failure mode of the first attempt
  // was the name being cut in half by its own backtick with the remainder rendering as Markdown.
  const fence = span.match(/^`+/)[0];
  assert.ok(fence.length > 3, "fence outruns the three-backtick run in the name");
  assert.ok(span.slice(fence.length, -fence.length).includes(hostile), "the whole name is inside");
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

// ── flow-0055: an unadopted repo is named for what it is, not called unreadable ───────────────
//
// Each criterion in `.flow/tasks/flow-0055-...md` is proved by name below. The pivot is the
// preceding `GET /repos/{owner}/{repo}`: a 200 turns an otherwise-ambiguous contents 404 into an
// unambiguous "no workflows directory". These stubs set `.status` on thrown errors exactly as the
// real `createGitHubIO` does, because the disambiguation keys on `err.status === 404`.

// A repo the token CAN read (repo GET 200) whose `.github/workflows` does not exist (contents 404).
function ioReadableNoWorkflows(fullName) {
  return {
    rest: async (path) => {
      if (path === `/repos/${fullName}`) return { full_name: fullName };
      if (/\/contents\/\.github\/workflows$/.test(path)) { const e = new Error(`404 Not Found — GET ${path}`); e.status = 404; throw e; }
      throw new Error(`unrouted GET ${path}`);
    },
    write: async () => {},
  };
}

test("flow-0055 criterion 1: a readable repo with no .github/workflows is classified not_adopted, with a message naming the topic, the missing directory, and both resolutions", async () => {
  const r = await watchRepo({ io: ioReadableNoWorkflows("CandidDan/inflight"), fullName: "CandidDan/inflight", now: NOW });

  assert.equal(r.status, "not_adopted");
  assert.notEqual(r.status, "unavailable");
  assert.notEqual(r.status, "ok");
  assert.match(r.reason, /flow/);
  assert.match(r.reason, /\.github\/workflows/);

  // "The message" the criterion names is the operator-facing line, which also names both resolutions.
  const line = reportRun({ discoveredNothing: false, results: [r] }).lines.join("\n");
  assert.match(line, /`flow` topic/);
  assert.match(line, /\.github\/workflows/);
  assert.match(line, /Drop the topic/);
  assert.match(line, /complete adoption/);
});

test("flow-0055 criterion 1 (contrast): a repo whose workflows directory exists but is empty stays a healthy ok/0, never not_adopted", async () => {
  const io = {
    rest: async (path) => {
      if (/\/contents\/\.github\/workflows$/.test(path)) return [];
      if (/\/actions\/workflows\?/.test(path)) return { workflows: [] };
      if (/\/issues\?labels=/.test(path)) return [];
      throw new Error(`unrouted GET ${path}`);
    },
    write: async () => {},
  };
  const r = await watchRepo({ io, fullName: REPO, now: NOW });
  assert.equal(r.status, "ok");
  assert.equal(r.watched, 0);
});

test("flow-0055 criterion 2: a not_adopted repo makes the run exit non-zero — the inconsistency stays loud, asserted on the exit path", () => {
  const { exitCode } = reportRun({ discoveredNothing: false, results: [{ repo: "CandidDan/inflight", status: "not_adopted", reason: "enrolled, not adopted" }] });
  assert.equal(exitCode, 1);
});

test("flow-0055 criterion 3: a repo the token genuinely cannot read stays unavailable and still says unreadable, separable from the not_adopted wording", async () => {
  const io = {
    rest: async (path) => {
      if (path === "/repos/CandidDan/secret") { const e = new Error(`404 Not Found — GET ${path}`); e.status = 404; throw e; }
      if (/\/contents\/\.github\/workflows$/.test(path)) { const e = new Error(`404 Not Found — GET ${path}`); e.status = 404; throw e; }
      throw new Error(`unrouted GET ${path}`);
    },
    write: async () => {},
  };
  const r = await watchRepo({ io, fullName: "CandidDan/secret", now: NOW });
  assert.equal(r.status, "unavailable");

  // Separable in the OUTPUT, not just internally: the old "unreadable — NOT watched" wording is
  // intact for a genuine failure and absent from the not_adopted line. A message test that passed
  // against the old behaviour would fail here.
  const unavailableLine = reportRun({ discoveredNothing: false, results: [{ repo: "x", status: "unavailable", reason: "404" }] }).lines[0];
  const notAdoptedLine = reportRun({ discoveredNothing: false, results: [{ repo: "x", status: "not_adopted", reason: "no workflows" }] }).lines[0];
  assert.match(unavailableLine, /unreadable — NOT watched/);
  assert.doesNotMatch(notAdoptedLine, /unreadable/, "the per-repo not_adopted line never borrows the unreadable wording");
});

test("flow-0055 criterion 4: readability is established by GET /repos/{owner}/{repo}, not inferred from the discovery search — a search hit whose repo GET 404s is unavailable", async () => {
  const reads = [];
  const io = {
    rest: async (path) => {
      reads.push(path);
      if (/^\/search\/repositories/.test(path)) return { items: [{ full_name: "CandidDan/inflight" }] };
      if (path === "/repos/CandidDan/inflight") { const e = new Error(`404 Not Found — GET ${path}`); e.status = 404; throw e; }
      if (/\/contents\/\.github\/workflows$/.test(path)) { const e = new Error(`404 Not Found — GET ${path}`); e.status = 404; throw e; }
      throw new Error(`unrouted GET ${path}`);
    },
    write: async () => {},
  };
  const summary = await runWatchdog({ io, owner: "CandidDan", now: NOW });
  const r = summary.results[0];
  assert.equal(r.status, "unavailable", "search visibility alone did not make it readable");
  assert.notEqual(r.status, "not_adopted", "a public search hit must not be read as adopted-but-empty");
  assert.ok(reads.includes("/repos/CandidDan/inflight"), "the disambiguating repo GET was actually made");
});

test("flow-0055 criterion 5: when the repo GET itself fails for a non-404 reason (rate limit / 5xx), the repo is unavailable with the status surfaced, never folded into not_adopted", async () => {
  const io = {
    rest: async (path) => {
      if (path === "/repos/CandidDan/inflight") { const e = new Error(`429 Too Many Requests — GET ${path}`); e.status = 429; throw e; }
      if (/\/contents\/\.github\/workflows$/.test(path)) { const e = new Error(`404 Not Found — GET ${path}`); e.status = 404; throw e; }
      throw new Error(`unrouted GET ${path}`);
    },
    write: async () => {},
  };
  const r = await watchRepo({ io, fullName: "CandidDan/inflight", now: NOW });
  assert.equal(r.status, "unavailable");
  assert.notEqual(r.status, "not_adopted");
  assert.match(r.reason, /429/, "the real status is surfaced, not silently folded into not-adopted");
});

test("flow-0055 criterion 6: the stderr tally counts not_adopted in its own bucket and never as unreadable", () => {
  const { exitCode, lines } = reportRun({
    discoveredNothing: false,
    results: [
      { repo: "CandidDan/inflight", status: "not_adopted", reason: "no workflows" },
      { repo: "CandidDan/borders", status: "not_adopted", reason: "no workflows" },
    ],
  });
  assert.equal(exitCode, 1);
  const tally = lines.find((l) => /repo\(s\) unreadable/.test(l));
  assert.ok(tally, "a tally line is printed");
  assert.match(tally, /0 repo\(s\) unreadable/, "not-adopted repos are NOT counted as unreadable");
  assert.match(tally, /2 enrolled but not adopted/, "they are counted in their own bucket");
});

test("flow-0055: reportRun on an empty fleet is terminal — exits non-zero with enrolment guidance and no per-repo tally", () => {
  const { exitCode, lines } = reportRun({ discoveredNothing: true, query: "user:CandidDan topic:flow", results: [] });
  assert.equal(exitCode, 1);
  const joined = lines.join("\n");
  assert.match(joined, /ZERO repositories/);
  assert.match(joined, /topic `flow`/);
  assert.doesNotMatch(joined, /repo\(s\) unreadable/, "the empty-fleet path returns before the tally");
});

test("flow-0055: reportRun on an all-ok fleet exits zero and prints nothing", () => {
  const { exitCode, lines } = reportRun({ discoveredNothing: false, results: [{ repo: "o/a", status: "ok" }] });
  assert.equal(exitCode, 0);
  assert.deepEqual(lines, []);
});

test("flow-0055: reportRun prints all three failure buckets and tallies them independently", () => {
  const { exitCode, lines } = reportRun({
    discoveredNothing: false,
    results: [
      { repo: "o/unreadable", status: "unavailable", reason: "404" },
      { repo: "o/empty", status: "not_adopted", reason: "no workflows" },
      { repo: "o/broke", status: "incomplete", failures: [{ type: "file", path: "x.yml", reason: "500" }] },
    ],
  });
  assert.equal(exitCode, 1);
  const joined = lines.join("\n");
  assert.match(joined, /o\/unreadable unreadable — NOT watched/);
  assert.match(joined, /o\/empty enrolled but not adopted/);
  assert.match(joined, /o\/broke file failed for x\.yml: 500/);
  assert.match(joined, /1 repo\(s\) unreadable, 1 enrolled but not adopted, 1 with failed writes/);
});


// ── flow-0061: the watchdog cannot see a workflow that never starts ──────────────────────────
//
// Every criterion in `.flow/tasks/flow-0061-watchdog-blind-to-startup-failures.md` is proved by
// name below. The fixtures matter as much as the assertions: an unparseable workflow is one whose
// REGISTERED name (what GitHub recorded) differs from what its file declares, and only the fake's
// `apiName` override can express that — parsing the fixture text can never produce it, which is
// precisely why the defect was invisible.

// The flow-0060 shape, verbatim in structure: a scheduled workflow with an invalid `permissions:`
// value. The YAML is well-formed; GitHub's SCHEMA rejects it, so the workflow registers under its
// own path and never starts. `apiName` is that registration.
const BROKEN_SCHEDULED = `name: flow-sync\non:\n  schedule:\n    - cron: "0 6 * * 1"\n  workflow_dispatch:\npermissions:\n  workflows: write\n`;
const BROKEN_EVENT = `name: gates\non:\n  pull_request:\npermissions:\n  workflows: write\n`;
const BROKEN_MANUAL = `name: release\non:\n  workflow_dispatch:\npermissions:\n  workflows: write\n`;

// The false-positive fixtures. Both register with `name` equal to `path` for entirely legitimate
// reasons, and neither may be reported.
const SELF_NAMED = `name: .github/workflows/odd.yml\non:\n  pull_request:\n`;       // author genuinely did this
const NAMELESS = `on:\n  pull_request:\n`;                                          // GitHub defaults to the path

// A zero-duration failed `push` run: what GitHub records for the push that carried a file it could
// not parse. `created_at` equals `updated_at` because nothing executed.
const STARTUP_RUN = { conclusion: "failure", html_url: "https://x/startup", event: "push", created_at: "2026-08-28T07:55:00Z", updated_at: "2026-08-28T07:55:00Z" };

test("flow-0061 criterion 1: a workflow GitHub could not parse is reported in its own state, and the reason names the PARSE failure rather than the staleness symptom", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "flow-sync.yml", text: BROKEN_SCHEDULED, apiName: ".github/workflows/flow-sync.yml", lastSuccessAt: new Date(NOW - 673 * HOUR).toISOString(), latestRun: STARTUP_RUN }],
  });

  const result = await watchRepo({ io, fullName: REPO, now: NOW });

  assert.equal(result.down.length, 1);
  assert.equal(result.down[0].state, UNPARSEABLE_STATE, "a state of its own");
  assert.notEqual(result.down[0].state, "crit");
  assert.notEqual(result.down[0].state, "good");
  // The defect this closes was a TRUE sentence naming the wrong thing. The old reason for this
  // exact fixture was `last success 673.2h ago, cron interval ~168.0h` — a reader concludes the
  // staleness bug is back. Neither that nor "no successful run recorded" may be the reason now.
  assert.match(result.down[0].reason, /could not parse this workflow file/);
  assert.doesNotMatch(result.down[0].reason, /last success/);
  assert.doesNotMatch(result.down[0].reason, /no successful run recorded/);

  const body = filings(state)[0].body.body;
  assert.match(body, /\.github\/workflows\/flow-sync\.yml/, "names the file");
  assert.match(body, /State:.*`unparseable`/);
});

test("flow-0061 criterion 2: a workflow broken five minutes ago — last success well inside its cron interval — is reported, the case BOTH existing rules call healthy", async () => {
  // A weekly cron with a success 30 minutes ago. `scheduledLiveness` is emphatically right that
  // this is on time; the file has been unparseable for five of those minutes.
  const broken = { file: "flow-sync.yml", text: BROKEN_SCHEDULED, lastSuccessAt: new Date(NOW - 0.5 * HOUR).toISOString() };

  // Contrast FIRST, so the claim "both rules call this healthy" is proved and not asserted: the
  // identical fixture, with GitHub having taken the file's name (i.e. it parsed), is silent.
  const parsed = fakeGitHub({ workflows: [{ ...broken }] });
  const parsedResult = await watchRepo({ io: parsed.io, fullName: REPO, now: NOW });
  assert.deepEqual(parsedResult.down, [], "with the file parsing, the cadence rule reports it healthy");
  assert.equal(filings(parsed.state).length, 0);

  // Same timings, same cron, same last success — only the registration differs.
  const { io, state } = fakeGitHub({ workflows: [{ ...broken, apiName: ".github/workflows/flow-sync.yml", latestRun: STARTUP_RUN }] });
  const result = await watchRepo({ io, fullName: REPO, now: NOW });
  assert.equal(result.down[0]?.state, UNPARSEABLE_STATE, "reported despite being perfectly on schedule");
  assert.equal(filings(state).length, 1, "and an issue is filed, so a human hears about it");
});

test("flow-0061 criterion 2 (event shape): an unparseable EVENT workflow is reported, where eventLiveness reads an empty run list as good", () => {
  const out = evaluateWorkflows([
    { path: ".github/workflows/gates.yml", name: ".github/workflows/gates.yml", text: BROKEN_EVENT, disabled: false, latestRun: null },
  ], NOW);

  assert.equal(out.length, 1);
  assert.equal(out[0].state, UNPARSEABLE_STATE);
  // Prove the contrast in the same breath: the only difference is the registered name.
  const parsed = evaluateWorkflows([
    { path: ".github/workflows/gates.yml", name: "gates", text: BROKEN_EVENT, disabled: false, latestRun: null },
  ], NOW);
  assert.equal(parsed[0].state, "good", "eventLiveness calls a workflow with no runs good — unchanged");
});

test("flow-0061 criterion 2 (manual shape): a manual workflow that cannot parse is reported, even though the cadence rules rightly skip it", () => {
  // The manual drop is a statement about CADENCE, not about parseability: a dispatch-only workflow
  // cannot be late, but it can certainly fail to start when someone dispatches it.
  const out = evaluateWorkflows([
    { path: ".github/workflows/release.yml", name: ".github/workflows/release.yml", text: BROKEN_MANUAL, disabled: false },
  ], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].state, UNPARSEABLE_STATE);
  assert.equal(out[0].kind, "manual", "still classified manual — the drop is skipped, not the classification");
});

test("flow-0061 criterion 3: the detection adds NO API call — the read set for an unparseable repo is identical to the same repo with the file parsing", async () => {
  const wf = { file: "flow-sync.yml", text: BROKEN_SCHEDULED, lastSuccessAt: new Date(NOW - 0.5 * HOUR).toISOString(), latestRun: STARTUP_RUN };

  // `--dry-run` isolates the question. It plans and writes nothing, so the read set is exactly the
  // cost of DETECTING — the label GET a filing performs is the cost of reacting, and it is the same
  // GET any `crit` filing already made.
  const healthy = fakeGitHub({ workflows: [{ ...wf }] });
  await watchRepo({ io: healthy.io, fullName: REPO, now: NOW, dryRun: true });

  const broken = fakeGitHub({ workflows: [{ ...wf, apiName: ".github/workflows/flow-sync.yml" }] });
  const brokenResult = await watchRepo({ io: broken.io, fullName: REPO, now: NOW, dryRun: true });

  assert.equal(brokenResult.down[0]?.state, UNPARSEABLE_STATE, "the detection did fire, on the same reads");
  assert.deepEqual(broken.state.reads, healthy.state.reads, "same GET sequence, in the same order");

  // And reacting costs no more than reacting to a stale schedule already did: both file one issue
  // after the one label GET, so nothing new is spent per unparseable workflow either.
  const staleFiling = fakeGitHub({ workflows: [{ file: "q.yml", text: SCHEDULED_6H, lastSuccessAt: new Date(NOW - 20 * HOUR).toISOString() }] });
  await watchRepo({ io: staleFiling.io, fullName: REPO, now: NOW });
  const brokenFiling = fakeGitHub({ workflows: [{ ...wf, apiName: ".github/workflows/flow-sync.yml" }] });
  await watchRepo({ io: brokenFiling.io, fullName: REPO, now: NOW });
  assert.equal(brokenFiling.state.reads.length, staleFiling.state.reads.length, "one filing, the same reads");
  // And the tell itself is a comparison of two values the workflows listing already returns.
  const src = readFileSync(join(import.meta.dirname, "watchdog.mjs"), "utf8");
  const fn = src.match(/export function startupFailure\(entry\) \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(fn, /io\b/, "startupFailure is pure — it cannot reach the network to ask");
  assert.doesNotMatch(fn, /await/, "nor await one");
});

test("flow-0061 criterion 3 (corroboration): the run-level tell uses the run data already read, and is never required for detection", () => {
  const entry = { path: ".github/workflows/flow-sync.yml", name: ".github/workflows/flow-sync.yml", text: BROKEN_SCHEDULED };

  // Present: the zero-duration push run is quoted as corroboration.
  const withRun = startupFailure({ ...entry, latestRun: { conclusion: "failure", event: "push", createdAt: "2026-08-28T07:55:00Z", updatedAt: "2026-08-28T07:55:00Z" } });
  assert.match(withRun.reason, /zero duration/);
  assert.match(withRun.reason, /`push`/);

  // Absent (the latest-run read is allowed to fail): the reason is weaker, the detection is not.
  const withoutRun = startupFailure({ ...entry, latestRun: null });
  assert.equal(withoutRun.state, UNPARSEABLE_STATE);
  assert.doesNotMatch(withoutRun.reason, /zero duration/);

  // An ordinary failing run HAS a duration, so it never corroborates anything.
  const ordinary = startupFailure({ ...entry, latestRun: { conclusion: "failure", event: "push", createdAt: "2026-08-28T07:50:00Z", updatedAt: "2026-08-28T07:55:00Z" } });
  assert.doesNotMatch(ordinary.reason, /zero duration/);
});

test("flow-0061: a declared name carrying backticks and a link stays inside a code span in the reason and the issue", () => {
  // The declared name is written by whoever pushed the unparseable file. A hand-rolled backtick
  // pair let a backtick in it close the span early, so the rest rendered as a live link in the
  // auto-filed issue.
  const path = ".github/workflows/flow-sync.yml";
  const evil = "x` and [click here](https://evil.example/phish) `";
  const text = BROKEN_SCHEDULED.replace(/^name:.*$/m, `name: ${evil}`);
  assert.equal(declaredWorkflowName(text), evil, "fixture: the parser must hand back the hostile name intact");

  const verdict = startupFailure({ path, name: path, text, latestRun: null });
  assert.equal(verdict.state, UNPARSEABLE_STATE);
  assert.ok(verdict.reason.includes(codeSpan(`name: ${evil}`)), "the name must be rendered through codeSpan");

  // Outcome, not mechanism: with every code span removed (CommonMark: a run of N backticks closes
  // only on a run of exactly N), no Markdown link is left to render.
  const outsideSpans = (md) => md.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, "");
  assert.doesNotMatch(outsideSpans(verdict.reason), /\]\(https?:/, "a link escaped the code span in the reason");
  const body = renderIssueBody({
    fullName: "CandidDan/flow",
    workflow: { path, name: path, state: verdict.state, reason: verdict.reason },
    now: new Date("2026-09-28T00:00:00Z"),
  });
  assert.doesNotMatch(outsideSpans(body), /\]\(https:\/\/evil/, "a link escaped the code span in the issue body");
});

test("flow-0061 criterion 4: a workflow whose author genuinely named it after its own path is NOT reported", async () => {
  const { io, state } = fakeGitHub({
    // GitHub parsed this file perfectly and registered exactly the name it declares, which happens
    // to be the path. A pure `name === path` comparison would alarm here.
    workflows: [{ file: "odd.yml", text: SELF_NAMED, apiName: ".github/workflows/odd.yml", latestRun: { conclusion: "success" } }],
  });

  const result = await watchRepo({ io, fullName: REPO, now: NOW });
  assert.deepEqual(result.down, [], "not reported");
  assert.equal(filings(state).length, 0, "and nothing filed");
});

test("flow-0061 criterion 4 (the other false positive): a file declaring no `name:` at all registers under its path by GitHub's own default and is NOT reported", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "nameless.yml", text: NAMELESS, apiName: ".github/workflows/nameless.yml", latestRun: { conclusion: "success" } }],
  });
  const result = await watchRepo({ io, fullName: REPO, now: NOW });
  assert.deepEqual(result.down, []);
  assert.equal(filings(state).length, 0);
});

test("flow-0061 criterion 4 (how the two are told apart): the rule is GitHub's registration DISAGREEING with the file, so it is not a string comparison on the path", () => {
  const path = ".github/workflows/x.yml";
  // Identical registered name in all three. Only the FILE differs, and only the file decides.
  assert.equal(startupFailure({ path, name: path, text: `name: something-else\non:\n  pull_request:\n` })?.state, UNPARSEABLE_STATE);
  assert.equal(startupFailure({ path, name: path, text: `name: ${path}\non:\n  pull_request:\n` }), null);
  assert.equal(startupFailure({ path, name: path, text: `on:\n  pull_request:\n` }), null);
  // And a registration that took the file's name is never a parse failure, whatever else is true.
  assert.equal(startupFailure({ path, name: "something-else", text: `name: something-else\non:\n  pull_request:\n` }), null);
});

test("flow-0061 criterion 4 (the declared name is read as YAML reads it): quotes are stripped and an unquoted trailing comment is not part of the name", () => {
  // Without the comment handling, a self-named file carrying a trailing comment would read as a
  // disagreement and alarm — a false positive manufactured by the parser rather than by GitHub.
  assert.equal(declaredWorkflowName(`name: flow-sync\n`), "flow-sync");
  assert.equal(declaredWorkflowName(`name: "flow sync"\n`), "flow sync");
  assert.equal(declaredWorkflowName(`name: 'flow sync'\n`), "flow sync");
  assert.equal(declaredWorkflowName(`name: .github/workflows/x.yml # self-named on purpose\n`), ".github/workflows/x.yml");
  assert.equal(declaredWorkflowName(`on:\n  push:\n`), null, "declares none");
  assert.equal(declaredWorkflowName(`name:\non:\n  push:\n`), null, "an empty value declares none");
  // A step's or a job's `name:` is indented and can never be mistaken for the workflow's own.
  assert.equal(declaredWorkflowName(`on:\n  push:\njobs:\n  build:\n    name: not the workflow\n`), null);

  const path = ".github/workflows/x.yml";
  assert.equal(startupFailure({ path, name: path, text: `name: ${path} # deliberate\non:\n  push:\n` }), null, "the comment does not manufacture a disagreement");
});

test("flow-0061 criterion 5: an ordinary failing run — a workflow that starts and exits non-zero — reports exactly what it reported before, never unparseable", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "gates.yml", text: EVENT_WF, latestRun: { conclusion: "failure", html_url: "https://x/9", event: "pull_request", created_at: "2026-08-28T07:50:00Z", updated_at: "2026-08-28T07:55:00Z" } }],
  });

  const result = await watchRepo({ io, fullName: REPO, now: NOW });
  assert.equal(result.down.length, 1);
  assert.equal(result.down[0].state, "crit", "still the pre-existing eventLiveness verdict");
  assert.equal(result.down[0].reason, "latest run failed");
  assert.equal(filings(state).length, 1, "one issue, the same one as before — nothing new is added");
  assert.doesNotMatch(filings(state)[0].body.body, /could not parse/);
});

test("flow-0061 criterion 6: for a repo with no unparseable workflow the output is BYTE-identical to the pre-change implementation — pinned from it", async () => {
  // Captured by running the implementation as it stood before this rule existed, over a mixed repo:
  // a scheduled workflow past its cadence (files an issue), a healthy event workflow, and a manual
  // one (dropped). Pinned as text, not as a structure, so key order and wording are both held.
  const PRE_CHANGE_JSON = "{\n  \"repo\": \"CandidDan/flow\",\n  \"status\": \"ok\",\n  \"failures\": [],\n  \"watched\": 2,\n  \"down\": [\n    {\n      \"path\": \".github/workflows/flow-queue-runner.yml\",\n      \"state\": \"crit\",\n      \"reason\": \"last success 20.0h ago, cron interval ~6.0h, longest scheduled gap ~6.0h \u2014 past that gap plus one interval of slack\"\n    }\n  ],\n  \"actions\": [\n    {\n      \"type\": \"file\",\n      \"path\": \".github/workflows/flow-queue-runner.yml\",\n      \"issueNumber\": 100\n    }\n  ],\n  \"orphaned\": []\n}";
  const PRE_CHANGE_TITLE = "Automation down: queue-runner";
  const PRE_CHANGE_BODY = "<!-- flow-watchdog:workflow=.github/workflows/flow-queue-runner.yml -->\n\n**Workflow:** `.github/workflows/flow-queue-runner.yml` (`queue-runner`)\n**Repository:** `CandidDan/flow`\n**Trigger type:** scheduled\n**Last successful run:** 2026-08-27T12:00:00.000Z\n**State:** `crit`\n**Rule that fired:** last success 20.0h ago, cron interval ~6.0h, longest scheduled gap ~6.0h — past that gap plus one interval of slack\n\nGitHub notifies on failure, never on absence — a scheduled workflow that stops running emits\nno event at all. This issue is that missing event. It was filed by `flow-watchdog` in\ncanonical and will be **closed automatically** when the workflow succeeds again.\n\n_First detected 2026-08-28T08:00:00.000Z._";

  const { io, state } = fakeGitHub({
    workflows: [
      { file: "flow-queue-runner.yml", text: SCHEDULED_6H, lastSuccessAt: new Date(NOW - 20 * HOUR).toISOString(), lastSuccessUrl: "https://x/1" },
      { file: "gates.yml", text: EVENT_WF, latestRun: { conclusion: "success", html_url: "https://x/2", event: "pull_request", created_at: "2026-08-28T07:00:00Z", updated_at: "2026-08-28T07:02:00Z" } },
      { file: "release.yml", text: MANUAL_WF },
    ],
  });

  const result = await watchRepo({ io, fullName: REPO, now: NOW });
  assert.equal(JSON.stringify(result, null, 2), PRE_CHANGE_JSON, "the run summary is unchanged, byte for byte");
  assert.equal(filings(state)[0].body.title, PRE_CHANGE_TITLE);
  assert.equal(filings(state)[0].body.body, PRE_CHANGE_BODY, "and so is the issue body — the new paragraph is conditional");
});

test("flow-0061 criterion 7: the filed issue names the file, says GITHUB could not parse it, and says a startup-failure run is not attached to a pull request as a check", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "flow-sync.yml", text: BROKEN_SCHEDULED, apiName: ".github/workflows/flow-sync.yml", latestRun: STARTUP_RUN }],
  });

  await watchRepo({ io, fullName: REPO, now: NOW });
  const body = filings(state)[0].body.body;

  assert.match(body, /`\.github\/workflows\/flow-sync\.yml`/, "names the file");
  assert.match(body, /GitHub could not parse/, "attributes the failure to GitHub's parser, not to a test");
  assert.match(body, /not attached to a pull request as a check/, "the reason this class survives review");
  assert.match(body, /Actions tab/, "and where it IS visible instead");
  assert.match(body, /shows all green and\nmerges/, "states the consequence plainly");
});

test("flow-0061: an unparseable workflow dedupes like any other — a second run comments on the one open issue rather than filing again", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "flow-sync.yml", text: BROKEN_SCHEDULED, apiName: ".github/workflows/flow-sync.yml", latestRun: STARTUP_RUN }],
  });

  await watchRepo({ io, fullName: REPO, now: NOW });
  await watchRepo({ io, fullName: REPO, now: NOW + HOUR });

  assert.equal(filings(state).length, 1, "exactly one issue");
  assert.equal(comments(state).length, 1, "re-detection is a comment");
  assert.equal(state.issues.filter((i) => i.state === "open").length, 1);
});

test("flow-0061: once the file parses again the issue closes, because the workflow returns to a normal verdict", async () => {
  const { io, state } = fakeGitHub({
    workflows: [{ file: "gates.yml", text: BROKEN_EVENT, apiName: ".github/workflows/gates.yml", latestRun: STARTUP_RUN }],
  });
  await watchRepo({ io, fullName: REPO, now: NOW });
  assert.equal(filings(state).length, 1);

  // The fix: GitHub now registers the name the file declares, and the workflow runs green.
  const fixed = fakeGitHub({
    workflows: [{ file: "gates.yml", text: BROKEN_EVENT, latestRun: { conclusion: "success", html_url: "https://x/ok" } }],
    openIssues: state.issues.filter((i) => i.state === "open"),
  });
  const result = await watchRepo({ io: fixed.io, fullName: REPO, now: NOW + HOUR });
  assert.deepEqual(result.down, []);
  assert.equal(patches(fixed.state).length, 1, "the issue is closed");
  assert.equal(patches(fixed.state)[0].body.state, "closed");
});

test("flow-0061: unparseable is in the reportable set and is not treated as a recovery", () => {
  // Guards the two ways a new state goes wrong silently: never filed, or filed and then instantly
  // closed by the recovery branch.
  const machinery = [{ path: ".github/workflows/x.yml", name: ".github/workflows/x.yml", state: UNPARSEABLE_STATE, reason: "r" }];
  const { actions } = planRepoActions({ fullName: REPO, machinery, openIssues: [], now: NOW });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "file");

  const tracked = [{ number: 7, body: workflowMarker(".github/workflows/x.yml") }];
  const again = planRepoActions({ fullName: REPO, machinery, openIssues: tracked, now: NOW });
  assert.equal(again.actions[0].type, "comment", "never `close` — the workflow still cannot start");
});
