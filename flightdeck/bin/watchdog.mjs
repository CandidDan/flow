// watchdog.mjs — the half of "is the machinery alive?" that runs when nobody is looking.
//
// THE ASYMMETRY THIS EXISTS FOR. GitHub notifies on **failure**; it has no notion of **absence**.
// A scheduled workflow that quietly stops running — disabled, or silently never firing — produces
// no event, fails no check, and turns nothing red. `flightdeck/index.html` (flow-0019) answers
// "is the machinery alive?" the moment a human opens it. This answers it when they don't. Every
// other part of Flow can be event-driven; this one thing cannot, so it needs an active check, and
// confining the system's only polling loop to this file is what keeps that claim true.
//
// THE OUTPUT IS AN ISSUE, DELIBERATELY. Rather than invent a notification channel, a red files an
// issue in the affected repo: it lands in the capture inbox, counts as queue debt, shows up in
// mission control's "what needs me" cell, and pushes a phone notification through GitHub's own
// subscription machinery. **The inbox is the pager.**
//
// THE LIVENESS RULES ARE NOT RESTATED HERE. They are imported from `liveness.mjs`, the same
// module `flightdeck/index.html` renders from. One implementation, two consumers — a mirrored
// spec would drift, in the one component whose entire job is detecting drift. If a rule is
// missing, extend `liveness.mjs`; do not fork it into this file.
//
// IO IS INJECTED, exactly as `mission-control.mjs` does it, so every decision branch below is a
// table test with no network and no clock of its own. The one real IO implementation is at the
// bottom and is never reached from a test.

import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";

import { classifyWorkflowTrigger, eventLiveness, scheduledLiveness } from "./liveness.mjs";
import { buildDiscoveryQuery } from "./mission-control.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED. Reached
// through a symlink the two differ, the comparison is false, and the CLI below silently never
// runs — no output, exit 0, nothing to debug. Compare realpaths on both sides.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";

export const AUTOMATION_DOWN_LABEL = "automation-down";
export const LABEL_COLOR = "b60205";
export const LABEL_DESCRIPTION = "Filed by flow-watchdog: a workflow in this repo has stopped running or is failing.";

// ── which liveness states this watchdog acts on ─────────────────────────────────────────────
//
// `crit` is the obvious one. `off` is included because a DISABLED workflow is not a rest state —
// it is machinery that has stopped, which is precisely the silent death this file exists to
// catch, and flow-0020's first acceptance criterion names a disabled `queue-runner` explicitly.
//
// `warn` is a deliberate DEAD-BAND, and the hysteresis matters. `scheduledLiveness` returns
// `warn` between 1x and 2x a workflow's cron interval — late, but not yet dead. If `warn` filed,
// every ordinary schedule jitter would page. If `warn` also CLOSED, an issue would flap open and
// shut around the 2x boundary. So: file/comment on crit|off, close only on `good`, and let `warn`
// change nothing. An issue opened at crit stays open, silently, until the workflow is genuinely
// healthy again.
export const REPORTABLE_STATES = new Set(["crit", "off"]);
export const RECOVERED_STATE = "good";

// ── the dedupe key ───────────────────────────────────────────────────────────────────────────
// Keyed on the workflow's PATH, not its display name: `name:` inside a workflow file is editable
// prose and changing it would orphan the open issue and file a duplicate — the one failure mode
// "at most one open issue per workflow per repo" is meant to exclude. The marker is an HTML
// comment so it is invisible in rendered Markdown but exact to match.
export function workflowMarker(path) {
  return `<!-- flow-watchdog:workflow=${String(path ?? "")} -->`;
}

export function issueTitle(workflowName) {
  return `Automation down: ${String(workflowName ?? "unknown workflow")}`;
}

// Every open `automation-down` issue this watchdog filed, as {path -> issue}. THE ONLY PLACE THE
// MARKER IS MATCHED — `findIssueForWorkflow` below delegates here rather than scanning again.
// That matters more than tidiness: the two used to match by different means (a substring test for
// the exact marker vs. this extraction), which is two answers to one question and a real chance of
// disagreeing on an odd body — an issue carrying two markers, or a path with regex-special
// characters. One parser, one answer.
//
// Issues carrying no marker are ignored entirely: a human may have hand-labelled something, and
// closing their issue because this file did not recognise it would be the watchdog corrupting the
// inbox it feeds.
export function markedIssues(openIssues) {
  const out = new Map();
  for (const issue of openIssues ?? []) {
    const m = String(issue.body ?? "").match(/<!-- flow-watchdog:workflow=(.*?) -->/);
    if (m) out.set(m[1], issue);
  }
  return out;
}

// Locate the ONE open issue already tracking a workflow. Returns null when none. A convenience
// over `markedIssues` for a single lookup; `planRepoActions` builds the index once and reads it
// directly, because it looks up every workflow in turn.
export function findIssueForWorkflow(openIssues, path) {
  return markedIssues(openIssues).get(String(path ?? "")) ?? null;
}

// ── issue bodies ─────────────────────────────────────────────────────────────────────────────

function formatWhen(iso) {
  if (!iso) return "never";
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : String(iso);
}

export function renderIssueBody({ fullName, workflow, now }) {
  const w = workflow ?? {};
  const lines = [
    workflowMarker(w.path),
    "",
    `**Workflow:** \`${w.path ?? "?"}\`${w.name && w.name !== w.path ? ` (${w.name})` : ""}`,
    `**Repository:** \`${fullName ?? "?"}\``,
    `**Trigger type:** ${w.kind ?? "?"}`,
    `**Last successful run:** ${formatWhen(w.lastSuccessAt)}`,
    `**State:** \`${w.state ?? "?"}\``,
    `**Rule that fired:** ${w.reason ?? "(no reason recorded)"}`,
    "",
    "GitHub notifies on failure, never on absence — a scheduled workflow that stops running emits",
    "no event at all. This issue is that missing event. It was filed by `flow-watchdog` in",
    "canonical and will be **closed automatically** when the workflow succeeds again.",
    "",
    `_First detected ${formatWhen(now ? new Date(now).toISOString() : null)}._`,
  ];
  return lines.join("\n");
}

export function renderRedetectionComment({ workflow, now }) {
  const w = workflow ?? {};
  return [
    `Still down as of ${formatWhen(now ? new Date(now).toISOString() : null)}.`,
    "",
    `**State:** \`${w.state ?? "?"}\` — ${w.reason ?? "(no reason recorded)"}`,
    `**Last successful run:** ${formatWhen(w.lastSuccessAt)}`,
    "",
    "_Re-detected by `flow-watchdog`. Commenting rather than filing again keeps this to one issue",
    "per workflow._",
  ].join("\n");
}

export function renderRecoveryComment({ workflow }) {
  const w = workflow ?? {};
  const link = w.runUrl ? `\n\n**Recovery run:** ${w.runUrl}` : "";
  return [
    `Recovered — \`${w.path ?? "?"}\` succeeded again at ${formatWhen(w.lastSuccessAt)}.${link}`,
    "",
    "_Closed automatically by `flow-watchdog`. A stale \"down\" alert is its own staleness bug._",
  ].join("\n");
}

// ── pure: workflow files + run history -> liveness verdicts ──────────────────────────────────
//
// `entries` is what the IO layer assembled, one per workflow FILE that GitHub also knows as a
// registered workflow: `{ path, name, text, disabled, lastSuccessAt, lastSuccessUrl, latestRun }`.
// Manual (`workflow_dispatch`-only) workflows carry no cadence expectation and are dropped here,
// the same call `mission-control.mjs` makes — a manual workflow that has not run is not dead.
export function evaluateWorkflows(entries, now) {
  const out = [];
  for (const e of entries ?? []) {
    const trigger = classifyWorkflowTrigger(e.text);
    if (trigger.kind === "manual") continue;

    if (trigger.kind === "scheduled") {
      out.push({
        path: e.path,
        name: e.name || e.path,
        kind: "scheduled",
        lastSuccessAt: e.lastSuccessAt ?? null,
        runUrl: e.lastSuccessUrl ?? null,
        ...scheduledLiveness({ crons: trigger.crons, lastSuccessAt: e.lastSuccessAt, now, disabled: e.disabled }),
      });
    } else {
      out.push({
        path: e.path,
        name: e.name || e.path,
        kind: "event",
        lastSuccessAt: e.lastSuccessAt ?? null,
        runUrl: e.latestRun?.html_url ?? null,
        ...eventLiveness({ disabled: e.disabled, latestRun: e.latestRun }),
      });
    }
  }
  return out;
}

// ── pure: verdicts + open issues -> the actions to take ──────────────────────────────────────
//
// This is the whole decision layer, and it is deliberately free of IO so "exactly one open issue
// per workflow" is a table test rather than something proved by running it against GitHub twice.
//
// One-per-workflow, never one aggregate: two dead workflows in a repo produce two `file` actions.
// An aggregate issue would make the label meaningless the moment one of the two recovered.
export function planRepoActions({ fullName, machinery, openIssues, now }) {
  const actions = [];
  const tracked = markedIssues(openIssues);

  for (const w of machinery ?? []) {
    // Read the index built once above rather than re-deriving per workflow. `markedIssues` is the
    // single marker parser both this and `findIssueForWorkflow` resolve through.
    const existing = tracked.get(w.path) ?? null;

    if (REPORTABLE_STATES.has(w.state)) {
      if (existing) {
        actions.push({ type: "comment", path: w.path, issueNumber: existing.number, body: renderRedetectionComment({ workflow: w, now }) });
      } else {
        actions.push({ type: "file", path: w.path, title: issueTitle(w.name), body: renderIssueBody({ fullName, workflow: w, now }) });
      }
      continue;
    }

    // Close ONLY on an observed `good`. Not on `warn` (see REPORTABLE_STATES above), and not on
    // absence: a workflow missing from `machinery` may simply have failed to fetch this run, and
    // closing a real "down" issue because of a transient read error is the one mistake that makes
    // this whole layer untrustworthy. An orphaned issue (workflow genuinely deleted) is left for a
    // human — visible and wrong-in-the-safe-direction.
    if (w.state === RECOVERED_STATE && existing) {
      actions.push({ type: "close", path: w.path, issueNumber: existing.number, body: renderRecoveryComment({ workflow: w }) });
    }
  }

  // Anything tracked but not evaluated this run is reported, not acted on, so a silently shrinking
  // workflow set is visible rather than inferred.
  const seen = new Set((machinery ?? []).map((w) => w.path));
  const orphaned = [...tracked.keys()].filter((p) => !seen.has(p));

  return { actions, orphaned };
}

// ── IO: assemble one repo's entries ──────────────────────────────────────────────────────────

async function listWorkflowFiles(io, fullName) {
  const dir = await io.rest(`/repos/${fullName}/contents/.github/workflows`);
  const files = (Array.isArray(dir) ? dir : []).filter((f) => f.type === "file" && /\.ya?ml$/.test(f.name));
  const out = [];
  for (const f of files) {
    const blob = await io.rest(`/repos/${fullName}/contents/.github/workflows/${f.name}`);
    out.push({ name: f.name, text: Buffer.from(String(blob.content ?? ""), "base64").toString("utf8") });
  }
  return out;
}

export async function collectRepoEntries({ io, fullName }) {
  const files = await listWorkflowFiles(io, fullName);
  const meta = await io.rest(`/repos/${fullName}/actions/workflows?per_page=100`);
  const byPath = new Map((meta.workflows ?? []).map((w) => [w.path, w]));

  const entries = [];
  for (const f of files) {
    const path = `.github/workflows/${f.name}`;
    const registered = byPath.get(path);
    if (!registered) continue; // a file GitHub has not registered as a workflow: nothing to report on

    const entry = {
      path,
      name: registered.name || f.name,
      text: f.text,
      disabled: registered.state !== "active",
      lastSuccessAt: null,
      lastSuccessUrl: null,
      latestRun: null,
    };

    try {
      const ok = await io.rest(`/repos/${fullName}/actions/workflows/${registered.id}/runs?status=success&per_page=1`);
      const run = (ok.workflow_runs ?? [])[0];
      entry.lastSuccessAt = run?.run_started_at ?? run?.created_at ?? null;
      entry.lastSuccessUrl = run?.html_url ?? null;
    } catch { /* leave null — scheduledLiveness correctly reports crit, never a blank */ }

    try {
      const latest = await io.rest(`/repos/${fullName}/actions/workflows/${registered.id}/runs?per_page=1`);
      const run = (latest.workflow_runs ?? [])[0];
      if (run) entry.latestRun = { conclusion: run.conclusion, html_url: run.html_url };
    } catch { /* eventLiveness treats a missing latest run as "no runs yet", which is `good` */ }

    entries.push(entry);
  }
  return entries;
}

// ── IO: apply the plan ───────────────────────────────────────────────────────────────────────
//
// The label is ensured BEFORE any filing, and ensured idempotently: a first run against a fresh
// repo must not fail on a missing label, and a second run must not fail because the label already
// exists. GitHub returns 422 for a duplicate label, which is success for our purposes.
export async function ensureLabel({ io, fullName }) {
  try {
    await io.rest(`/repos/${fullName}/labels/${AUTOMATION_DOWN_LABEL}`);
    return "exists";
  } catch {
    try {
      await io.write("POST", `/repos/${fullName}/labels`, {
        name: AUTOMATION_DOWN_LABEL, color: LABEL_COLOR, description: LABEL_DESCRIPTION,
      });
      return "created";
    } catch (err) {
      if (err?.status === 422) return "exists"; // raced with another run, or already present
      throw err;
    }
  }
}

export async function applyActions({ io, fullName, actions, dryRun = false }) {
  const applied = [];
  const needsLabel = (actions ?? []).some((a) => a.type === "file");

  if (needsLabel && !dryRun) await ensureLabel({ io, fullName });

  for (const a of actions ?? []) {
    if (dryRun) { applied.push({ ...a, dryRun: true }); continue; }
    if (a.type === "file") {
      const issue = await io.write("POST", `/repos/${fullName}/issues`, {
        title: a.title, body: a.body, labels: [AUTOMATION_DOWN_LABEL],
      });
      applied.push({ ...a, issueNumber: issue?.number ?? null });
    } else if (a.type === "comment") {
      await io.write("POST", `/repos/${fullName}/issues/${a.issueNumber}/comments`, { body: a.body });
      applied.push({ ...a });
    } else if (a.type === "close") {
      await io.write("POST", `/repos/${fullName}/issues/${a.issueNumber}/comments`, { body: a.body });
      await io.write("PATCH", `/repos/${fullName}/issues/${a.issueNumber}`, { state: "closed", state_reason: "completed" });
      applied.push({ ...a });
    }
  }
  return applied;
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────

export async function watchRepo({ io, fullName, now, dryRun }) {
  let entries;
  try {
    entries = await collectRepoEntries({ io, fullName });
  } catch (err) {
    // Never silently omitted — the same rule the aggregator and mission control both hold. A repo
    // this watchdog could not read is a repo it is NOT watching, and saying so is the point.
    return { repo: fullName, status: "unavailable", reason: `${err?.message || err}` };
  }

  const machinery = evaluateWorkflows(entries, now);

  let openIssues = [];
  try {
    const r = await io.rest(`/repos/${fullName}/issues?labels=${AUTOMATION_DOWN_LABEL}&state=open&per_page=100`);
    openIssues = (Array.isArray(r) ? r : []).filter((i) => !i.pull_request);
  } catch (err) {
    return { repo: fullName, status: "unavailable", reason: `could not read open issues: ${err?.message || err}` };
  }

  const { actions, orphaned } = planRepoActions({ fullName, machinery, openIssues, now });
  const applied = await applyActions({ io, fullName, actions, dryRun });

  return {
    repo: fullName,
    status: "ok",
    watched: machinery.length,
    down: machinery.filter((w) => REPORTABLE_STATES.has(w.state)).map((w) => ({ path: w.path, state: w.state, reason: w.reason })),
    actions: applied.map((a) => ({ type: a.type, path: a.path, issueNumber: a.issueNumber ?? null })),
    orphaned,
  };
}

export async function runWatchdog({ io, owner, ownerType = "user", now = Date.now(), dryRun = false }) {
  const q = buildDiscoveryQuery(owner, { ownerType });
  const found = await io.rest(`/search/repositories?q=${encodeURIComponent(q)}&per_page=100`);
  const repos = (found.items ?? []).map((r) => r.full_name);

  const results = [];
  for (const fullName of repos) results.push(await watchRepo({ io, fullName, now, dryRun }));

  // DISCOVERING NOTHING IS A FAILURE, NOT A QUIET SUCCESS. Enrolment is the `flow` GitHub topic,
  // and a repo that never had the topic added — or an owner whose account became an organization,
  // making the `user:` qualifier match zero repos — produces an empty result set that is
  // indistinguishable from "the whole fleet is healthy". A watchdog reporting green while
  // watching nothing is the exact failure it exists to detect, one level up. So it is flagged
  // here and the CLI exits non-zero on it.
  return { query: q, repos: repos.length, results, discoveredNothing: repos.length === 0 };
}

// ── the one real IO implementation — never called from a test ────────────────────────────────
export function createGitHubIO(token) {
  async function request(method, path, body) {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
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
    rest: (path) => request("GET", path),
    write: (method, path, body) => request(method, path, body),
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
if (__isMain) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const ownerFlag = argv.indexOf("--owner");
  const typeFlag = argv.indexOf("--owner-type");
  const owner = ownerFlag !== -1 ? argv[ownerFlag + 1] : process.env.FLOW_WATCHDOG_OWNER;
  const ownerType = typeFlag !== -1 ? argv[typeFlag + 1] : (process.env.FLOW_WATCHDOG_OWNER_TYPE || "user");
  const token = process.env.FLOW_WATCHDOG_TOKEN;

  if (!token) {
    console.error("flow-watchdog: no token — set FLOW_WATCHDOG_TOKEN (see .github/workflows/flow-watchdog.yml)");
    process.exit(1);
  }
  if (!owner) {
    console.error("flow-watchdog: no owner — pass --owner <login> or set FLOW_WATCHDOG_OWNER");
    process.exit(1);
  }

  const summary = await runWatchdog({ io: createGitHubIO(token), owner, ownerType, dryRun });
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

  // An unreachable repo is REPORTED, not fatal — one repo the token cannot see must not stop the
  // watchdog watching the rest. But it is not silent either: the run fails so the operator sees a
  // red tick, because "the watchdog is only watching some of the fleet" is exactly the kind of
  // partial death this file exists to make loud.
  if (summary.discoveredNothing) {
    console.error(`flow-watchdog: discovery matched ZERO repositories for \`${summary.query}\` — nothing is being watched.`);
    console.error("Enrolment is the GitHub topic `flow`: add it to each repo (repo home -> About -> Topics).");
    console.error("If the account is an organization rather than a user, set FLOW_WATCHDOG_OWNER_TYPE=org.");
    process.exit(1);
  }

  const unavailable = summary.results.filter((r) => r.status === "unavailable");
  if (unavailable.length > 0) {
    console.error(`flow-watchdog: ${unavailable.length} repo(s) unreadable — not watched:`);
    for (const r of unavailable) console.error(`  ${r.repo}: ${r.reason}`);
    process.exit(1);
  }
  process.exit(0);
}
