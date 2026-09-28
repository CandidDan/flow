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
// ONE PREDICATE IS DELIBERATELY LOCAL, AND IT IS NOT A LIVENESS RULE. `startupFailure` (flow-0061)
// asks *can this workflow start at all*, which is a different question from *is it running on
// time* and is answered from different inputs: GitHub's own workflow REGISTRATION versus the text
// of the file, never run history or cadence. It lives here because its inputs are this file's IO
// shape — `liveness.mjs` is handed liveness facts, not a registration — and because nothing in it
// forks a rule that module owns. It is not an exception to the paragraph above; it is a rule that
// paragraph does not cover.
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
//
// `unparseable` (flow-0061) joins the reportable set rather than reusing `crit`, because the whole
// defect it fixes was a true sentence naming the wrong thing: a workflow GitHub cannot start was
// already being reported `crit` with reason "no successful run recorded", which reads as the
// staleness bug and sends a human looking for an outage. A distinct state is what makes the two
// tellable apart at a glance, and it is never a *degree* of crit — it is a different question.
export const REPORTABLE_STATES = new Set(["crit", "off", "unparseable"]);
export const RECOVERED_STATE = "good";

// The state a workflow GitHub could not parse is reported in. Exported so a consumer can match it
// without restating the literal.
export const UNPARSEABLE_STATE = "unparseable";

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

// Wrap free text in a Markdown code span that the text cannot escape. CommonMark closes a span
// on the first backtick RUN of matching length, so a fixed pair of backticks is not enough: a name
// containing one backtick closes the span early and spills the rest into live Markdown. The fence
// is therefore one longer than the longest backtick run inside the value, and padded with a space
// when the value itself starts or ends with a backtick (the renderer strips one leading and one
// trailing space, so the padding does not show).
//
// This exists because the first attempt shipped a fixed single-backtick pair with a test that
// asserted the broken output verbatim — it pinned the bug rather than proving the property. The
// test below now asserts the property.
export function codeSpan(text) {
  const s = String(text ?? "");
  const runs = [...s.matchAll(/`+/g)].map((m) => m[0].length);
  const fence = "`".repeat(Math.max(0, ...runs) + 1);
  const pad = s.startsWith("`") || s.endsWith("`") ? " " : "";
  return `${fence}${pad}${s}${pad}${fence}`;
}

function formatWhen(iso) {
  if (!iso) return "never";
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : String(iso);
}

// The extra paragraph an unparseable workflow's issue carries, and nothing else does — empty for
// every other state, so a repo with no unparseable workflow gets a byte-identical body to before
// (flow-0061 criterion 6). It says the three things a reader needs and cannot get from the fields
// above: which file, that GITHUB could not parse it (so it is not a test failure to go hunting for),
// and — the reason this class survives review at all — that the failed run GitHub records for it is
// NOT a check on the pull request. A green check list is what let flow-0060 merge.
function startupFailureNote(w) {
  if (w.state !== UNPARSEABLE_STATE) return [];
  return [
    "",
    `**GitHub could not parse ${codeSpan(w.path ?? "?")}, so this workflow cannot start at all.** It is`,
    "not a job that ran and failed: nothing ran. Until the file parses, the workflow has no run",
    "history, which is why the cadence rules describe it as merely stale — or, if it broke recently,",
    "as healthy.",
    "",
    "**A startup failure is not attached to a pull request as a check.** GitHub records a failed,",
    "zero-duration run against the push that carried the file — visible in the Actions tab and",
    "nowhere else. It is not in the PR's check list, so a PR carrying this defect shows all green and",
    "merges. That is how this class of breakage reaches `main`, and why this issue exists.",
    "",
    "Fix the workflow file and push. Validate it before you do: GitHub's parser is the authority, and",
    "canonical's `npm run build` parses every file under `.github/workflows/` for exactly this reason.",
  ];
}

export function renderIssueBody({ fullName, workflow, now }) {
  const w = workflow ?? {};
  const lines = [
    workflowMarker(w.path),
    "",
    // Both the path and the NAME go through codeSpan. `name:` is free text from the watched repo's
    // own workflow file, and this body is Markdown — text that escapes its span reshapes the
    // issue. Not cross-tenant (the issue lands in the same repo whose workflow carries the name),
    // but a watchdog whose alert can be made to misrender is one whose alert can be made to
    // mislead, and that is the whole asset this component has.
    `**Workflow:** ${codeSpan(w.path ?? "?")}${w.name && w.name !== w.path ? ` (${codeSpan(w.name)})` : ""}`,
    `**Repository:** ${codeSpan(fullName ?? "?")}`,
    `**Trigger type:** ${w.kind ?? "?"}`,
    `**Last successful run:** ${formatWhen(w.lastSuccessAt)}`,
    `**State:** ${codeSpan(w.state ?? "?")}`,
    `**Rule that fired:** ${w.reason ?? "(no reason recorded)"}`,
    ...startupFailureNote(w),
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
    `**State:** ${codeSpan(w.state ?? "?")} — ${w.reason ?? "(no reason recorded)"}`,
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
    `Recovered — ${codeSpan(w.path ?? "?")} succeeded again at ${formatWhen(w.lastSuccessAt)}.${link}`,
    "",
    "_Closed automatically by `flow-watchdog`. A stale \"down\" alert is its own staleness bug._",
  ].join("\n");
}

// ── pure: can this workflow START at all? (flow-0061) ────────────────────────────────────────
//
// THE BLIND SPOT THIS CLOSES. Both liveness rules answer "is it running on time" from run history.
// A workflow whose file GitHub cannot parse never reaches a run history at all, so `scheduled`
// reports whatever its last success implies — `crit` with a staleness reason if it broke long ago,
// and `good` if it broke five minutes ago — while `event` treats an empty run list as `good`. Every
// one of those answers is true and every one of them names the wrong thing. This asks the other
// question, and the answer is the only fact that tells a human what to do: the file does not parse.
//
// WHAT IT READS, AND WHAT IT COSTS. Nothing new. `/repos/{}/actions/workflows` — already fetched
// once per repo — returns both `name` and `path` for every registered workflow, and for a workflow
// GitHub could not parse **`name` is the path**, because the registration never took a name from
// the file. So the tell is a comparison between two values already in hand. Zero extra API calls,
// per workflow or per repo; `collectRepoEntries` widens the fields it keeps off the latest-run
// response it already requests, and requests nothing more.
//
// WHY IT IS NOT A STRING COMPARISON ON THE PATH. Two entirely ordinary workflows also register
// with `name` equal to `path`, and reporting either would be a false alarm in the one channel that
// must never cry wolf:
//
//   1. A file that declares no `name:` at all. GitHub's documented default is the file's path, so
//      the path IS that workflow's real, correct name. Very common.
//   2. A file whose author genuinely wrote `name: .github/workflows/thing.yml`. Rare, legal, and
//      indistinguishable from case 1 by the API alone.
//
// Both are excluded by asking the FILE, whose text this watchdog already has: a startup failure is
// GitHub's registered name DISAGREEING with the name the file declares. Case 1 declares nothing to
// disagree with; case 2 declares exactly what GitHub registered. Only a file that says "call me X"
// while GitHub says "I know this as its path" has had its `name:` discarded — and the only thing
// that discards it is a failure to parse.
//
// The one case this cannot separate is a file that fails to parse AND declares a name equal to its
// own path. It is reported as healthy-named rather than risk case 2, which is the safe direction:
// a missed alarm in a vanishingly rare shape, not a false one in a common shape.

// The top-level `name:` the file declares, or null when it declares none. Column-anchored, so a
// step's or a job's `name:` (always indented) can never be mistaken for the workflow's own. Quotes
// are stripped; an unquoted scalar ends at a ` #` comment, the way YAML ends it — without that, a
// self-naming file carrying a trailing comment would read as a disagreement and alarm.
export function declaredWorkflowName(text) {
  const m = String(text ?? "").match(/^name:[ \t]*(\S.*?)[ \t]*$/m);
  if (!m) return null;
  const raw = m[1];
  const quote = raw[0];
  if ((quote === '"' || quote === "'") && raw.length >= 2) {
    const end = raw.lastIndexOf(quote);
    if (end > 0) return raw.slice(1, end);
  }
  return raw.replace(/\s+#.*$/, "").trim();
}

// Corroboration, never the trigger. GitHub synthesises a run for the push that carried an
// unparseable file: it is attributed to `push` whatever the workflow's declared triggers, it fails,
// and `created_at` equals `updated_at` to the second because nothing executed. A run that ran and
// failed has a duration, so this cannot fire on an ordinary failure — and because it only ever
// appends to a reason that has already been decided, an ordinary failure cannot be reported by this
// predicate at all. Silent when the run data is absent (the read is allowed to fail): the reason is
// weaker, the detection is not.
function startupRunTell(latestRun) {
  const r = latestRun ?? null;
  if (!r || r.conclusion !== "failure") return "";
  if (!r.createdAt || !r.updatedAt || r.createdAt !== r.updatedAt) return "";
  return `. Corroborated by the latest run: a ${codeSpan(r.event ?? "?")} run that failed with zero duration` +
    " (created_at equals updated_at), which is GitHub reporting a workflow it could not start rather" +
    " than a job that ran and failed";
}

// `{ state, reason }` when GitHub could not parse this workflow file, or null. Takes one entry in
// the shape `collectRepoEntries` assembles.
export function startupFailure(entry) {
  const e = entry ?? {};
  const path = String(e.path ?? "");
  if (!path || String(e.name ?? "") !== path) return null; // GitHub took a name from the file: it parsed

  const declared = declaredWorkflowName(e.text);
  if (declared === null) return null; // declares no name, so the path is legitimately its name
  if (declared === path) return null; // named after its own path on purpose — see case 2 above

  // `declared` is text from the pushed file, so it goes through codeSpan like every other
  // workflow-controlled string here: a backtick in it must not close the span and let the rest
  // render as live Markdown in the auto-filed issue.
  return {
    state: UNPARSEABLE_STATE,
    reason: `GitHub could not parse this workflow file — it registered the workflow under its own ` +
      `path, discarding the ${codeSpan(`name: ${declared}`)} the file declares, so the workflow cannot start ` +
      `at all${startupRunTell(e.latestRun)}`,
  };
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

    // CAN IT START is asked FIRST, and it short-circuits: a workflow GitHub cannot parse has no run
    // history for either rule below to reason about, so letting one of them answer anyway is what
    // produced the wrong-cause report. One verdict per workflow, so which rule fired is legible in
    // the `state` alone — and a single `path` still maps to a single issue.
    //
    // It is also asked BEFORE the manual drop, on purpose. The drop is a statement about CADENCE —
    // a `workflow_dispatch`-only workflow cannot be late because it was never due. It is not a
    // statement about parseability: a manual workflow that will not parse fails the moment someone
    // dispatches it, which is exactly when they are relying on it. `can it start` applies to every
    // workflow; `is it on time` does not.
    const startup = startupFailure(e);
    if (startup) {
      out.push({
        path: e.path,
        name: e.name || e.path,
        kind: trigger.kind,
        lastSuccessAt: e.lastSuccessAt ?? null,
        runUrl: e.latestRun?.html_url ?? null,
        ...startup,
      });
      continue;
    }

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

// Raised when a repo the token CAN read simply has no `.github/workflows` directory: it is
// enrolled (carries the `flow` topic, so discovery found it) but has not adopted Flow. This is
// NOT the same failure as `unavailable`, and conflating them is the exact misdirection flow-0055
// exists to end — see the `.notAdopted` branch in `watchRepo`.
export class RepoNotAdopted extends Error {
  constructor(fullName) {
    super(`${fullName} carries the \`flow\` topic but has no .github/workflows — enrolled, not adopted`);
    this.name = "RepoNotAdopted";
    this.notAdopted = true;
  }
}

// Prove the token can read `fullName` with a bare `GET /repos/{owner}/{repo}`. A 200 returns
// quietly; ANY failure re-throws, carrying the original status. This is the discriminator a
// contents 404 needs: search visibility does not establish readability, because
// `/search/repositories` returns PUBLIC repos regardless of a fine-grained token's access list.
async function assertRepoReadable(io, fullName) {
  await io.rest(`/repos/${fullName}`);
}

async function listWorkflowFiles(io, fullName) {
  let dir;
  try {
    dir = await io.rest(`/repos/${fullName}/contents/.github/workflows`);
  } catch (err) {
    // A fine-grained PAT returns 404 — never 403 — for a repo outside its access list, so a 404
    // here is genuinely ambiguous read alone: "no such directory" or "no access". Disambiguate
    // with a repo GET. A 200 proves the token reads the repo, so the contents 404 is unambiguously
    // a missing directory (not adopted). If the repo GET fails — a 404 (truly unreadable) or a
    // rate limit / 5xx — that error propagates and `watchRepo` reports the repo `unavailable`,
    // status surfaced, never silently folded into the not-adopted case. A non-404 on contents
    // (a 5xx on the directory read itself) is not this ambiguity and propagates unchanged.
    if (err?.status === 404) {
      await assertRepoReadable(io, fullName);
      throw new RepoNotAdopted(fullName);
    }
    throw err;
  }
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
      // `event` and the created/updated pair come from THIS response, which was already being
      // requested — they are the run-level corroboration `startupFailure` appends to its reason
      // (flow-0061), and keeping a field off a payload already in hand costs no API call.
      if (run) entry.latestRun = {
        conclusion: run.conclusion,
        html_url: run.html_url,
        event: run.event ?? null,
        createdAt: run.created_at ?? null,
        updatedAt: run.updated_at ?? null,
      };
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

// A FAILING WRITE MUST NOT BLIND THE REST OF THE FLEET. Reads already degrade per-repo (see
// `watchRepo`); writes used to throw straight out, so a transient 5xx filing one issue would abort
// the whole scan and leave every remaining repo unchecked until the next run — a day later, for a
// component whose entire job is noticing that something stopped. Each action is attempted
// independently and failures are collected, not raised. Nothing is swallowed: `watchRepo` reports
// them and the CLI exits non-zero, so the run is still loud — just no longer all-or-nothing.
export async function applyActions({ io, fullName, actions, dryRun = false }) {
  const applied = [];
  const failures = [];
  const needsLabel = (actions ?? []).some((a) => a.type === "file");

  if (needsLabel && !dryRun) {
    // A failed label ensure does not skip the filings: GitHub may still accept the issue, and if
    // it does not, the per-action catch below records that separately rather than guessing here.
    try {
      await ensureLabel({ io, fullName });
    } catch (err) {
      failures.push({ type: "label", path: null, reason: `${err?.message || err}` });
    }
  }

  for (const a of actions ?? []) {
    if (dryRun) { applied.push({ ...a, dryRun: true }); continue; }
    try {
      if (a.type === "file") {
        const issue = await io.write("POST", `/repos/${fullName}/issues`, {
          title: a.title, body: a.body, labels: [AUTOMATION_DOWN_LABEL],
        });
        applied.push({ ...a, issueNumber: issue?.number ?? null });
      } else if (a.type === "comment") {
        await io.write("POST", `/repos/${fullName}/issues/${a.issueNumber}/comments`, { body: a.body });
        applied.push({ ...a });
      } else if (a.type === "close") {
        // The comment is posted before the close so a reader never meets a closed issue with no
        // explanation. If the PATCH fails the issue stays open with a recovery comment on it —
        // visible and wrong in the safe direction, which is the same bias as the rest of this file.
        await io.write("POST", `/repos/${fullName}/issues/${a.issueNumber}/comments`, { body: a.body });
        await io.write("PATCH", `/repos/${fullName}/issues/${a.issueNumber}`, { state: "closed", state_reason: "completed" });
        applied.push({ ...a });
      }
    } catch (err) {
      failures.push({ type: a.type, path: a.path ?? null, reason: `${err?.message || err}` });
    }
  }
  return { applied, failures };
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────

export async function watchRepo({ io, fullName, now, dryRun }) {
  let entries;
  try {
    entries = await collectRepoEntries({ io, fullName });
  } catch (err) {
    // A repo the token CAN read but that has never adopted Flow is not unreadable — it is
    // enrolled-but-not-adopted, a distinct status with its own message. Naming it `unavailable`
    // is the wrong-cause report this task removes. Everything else is a genuine read failure.
    if (err?.notAdopted) {
      return { repo: fullName, status: "not_adopted", reason: `${err?.message || err}` };
    }
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
  const { applied, failures } = await applyActions({ io, fullName, actions, dryRun });

  return {
    repo: fullName,
    // `incomplete` is distinct from `unavailable` on purpose: the repo was read fine and the plan
    // was computed, but not every action landed. Both are failures the CLI exits non-zero on;
    // collapsing them would lose which half broke.
    status: failures.length > 0 ? "incomplete" : "ok",
    failures,
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

// ── operator-facing report ─────────────────────────────────────────────────────────────────
//
// Turn a run summary into the stderr lines and the process exit code. Extracted from the CLI so
// both the wording and the exit decision are table-testable without spawning a subprocess or
// touching the network — the CLI below is a thin shell over this. Ordering matches the old inline
// block exactly: `discoveredNothing` is terminal and returns before the per-repo tally.
export function reportRun(summary) {
  const lines = [];

  // An empty fleet is its own terminal failure, unchanged from before: report and exit non-zero
  // without falling through to the per-repo tally (there are no repos to tally).
  if (summary.discoveredNothing) {
    lines.push(`flow-watchdog: discovery matched ZERO repositories for \`${summary.query}\` — nothing is being watched.`);
    lines.push("Enrolment is the GitHub topic `flow`: add it to each repo (repo home -> About -> Topics).");
    lines.push("If the account is an organization rather than a user, set FLOW_WATCHDOG_OWNER_TYPE=org.");
    return { exitCode: 1, lines };
  }

  const unavailable = summary.results.filter((r) => r.status === "unavailable");
  const notAdopted = summary.results.filter((r) => r.status === "not_adopted");
  const incomplete = summary.results.filter((r) => r.status === "incomplete");

  for (const r of unavailable) lines.push(`flow-watchdog: ${r.repo} unreadable — NOT watched: ${r.reason}`);
  // Enrolled-but-not-adopted is loud but NOT called unreadable: the repo reads fine, it just has
  // nothing to watch. The message names the two human resolutions, the same shape the empty-fleet
  // message above uses.
  for (const r of notAdopted) lines.push(`flow-watchdog: ${r.repo} enrolled but not adopted — carries the \`flow\` topic but has no .github/workflows. Drop the topic (repo home -> About -> Topics) or complete adoption.`);
  for (const r of incomplete) {
    for (const f of r.failures) lines.push(`flow-watchdog: ${r.repo} ${f.type} failed${f.path ? ` for ${f.path}` : ""}: ${f.reason}`);
  }

  if (unavailable.length + notAdopted.length + incomplete.length > 0) {
    // The tally counts each class separately: a not-adopted repo must never be tallied as
    // unreadable — that miscount was itself part of the original misdirection.
    lines.push(`flow-watchdog: ${unavailable.length} repo(s) unreadable, ${notAdopted.length} enrolled but not adopted, ${incomplete.length} with failed writes.`);
    return { exitCode: 1, lines };
  }
  return { exitCode: 0, lines };
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
  // partial death this file exists to make loud. `reportRun` owns that decision; the CLI only
  // prints its lines and adopts its exit code.
  const { exitCode, lines } = reportRun(summary);
  for (const line of lines) console.error(line);
  process.exit(exitCode);
}
