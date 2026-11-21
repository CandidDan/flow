// intake-trust.mjs — who applied a lane label, and does that person count (ADR-0010 §2, flow-0201).
//
// The triage sweep acts on three labels: `approved` (a person accepted a proposal), `auto-ok` (a
// person pre-authorised the lane) and `flow:trusted` (an intake App vouched for the submitter). A
// label on its own says nothing about who put it there. Once an intake App can create issues it can
// label them too, and an App-applied `approved` would read as the maintainer's approval. So a lane
// label is honoured only when the issue's EVENT HISTORY shows the right actor applied it:
//
//   · `approved` / `auto-ok` — the most recent `labeled` event (after the label's last `unlabeled`
//     event) was made by an actor whose `type` is `User`, never `Bot`, AND who holds `write`,
//     `maintain` or `admin` on the repo. The events payload carries no association, so the
//     permission is looked up (`GET /repos/{o}/{r}/collaborators/{login}/permission`).
//   · `flow:trusted` — that event's actor login is in `intake.trusted_labelers` (read through
//     `readIntakeConfig`, flow-0200). An empty list honours nobody.
//
// Both the permission and `trusted_labelers` are read WHEN TRIAGE RUNS, not when the label was
// applied: an approver whose write access was since revoked, or a login since removed from the
// config, no longer counts. Every doubt resolves to "not honoured": a failed permission lookup is
// "no write", never "write"; a label with no `labeled` event behind it is not honoured.
//
// The pure functions are exported and tested; the CLI is the shell `_flow-triage.yml` runs from
// `$FLOW_BIN` (canonical's own copy, at the workflow's commit).

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readIntakeConfig } from "./intake-config.mjs";

// The labels this module verifies, and which rule each one follows.
export const APPROVAL_LABELS = Object.freeze(["approved", "auto-ok"]);
export const TRUSTED_LABEL = "flow:trusted";
export const LANE_LABELS = Object.freeze([...APPROVAL_LABELS, TRUSTED_LABEL]);

// Permissions that count as "write access or above". The REST `permission` field reports
// `maintain` as `write` and `triage` as `read`; `maintain` is listed in case that ever changes.
const WRITE = new Set(["write", "maintain", "admin"]);

// A GitHub login, optionally an App's `<slug>[bot]` — the same shape `intake-config.mjs` accepts.
// Anything else is never put into a URL and never echoed into a log.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}(?:\[bot\])?$/;

// The reasons a present label is not honoured. Single tokens, so the log line stays one
// `key=value` per field and a human or a grep can read it without guessing where a value ends.
export const REASONS = Object.freeze({
  noEvent: "no-labeled-event",
  notUser: "actor-not-user",
  lacksWrite: "actor-lacks-write",
  noTrustedLabelers: "no-trusted-labelers",
  notTrustedLabeler: "not-a-trusted-labeler",
});

const sameLabel = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

// Chronological order. The endpoint returns events oldest first, but that is an unstated default
// this decision should not rest on. `created_at` has one-second resolution, so a label removed and
// re-applied within the same second ties; the event `id` is monotonic and breaks the tie.
function chronological(events) {
  return events
    .map((e, index) => ({ e, index, t: Date.parse(e?.created_at), id: Number(e?.id) }))
    .sort((a, b) =>
      (Number.isFinite(a.t) && Number.isFinite(b.t) && a.t !== b.t ? a.t - b.t : 0) ||
      (Number.isFinite(a.id) && Number.isFinite(b.id) && a.id !== b.id ? a.id - b.id : 0) ||
      a.index - b.index)
    .map(({ e }) => e);
}

/**
 * The most recent `labeled` event for `label` that comes after the label's last `unlabeled`
 * event, or null when there is none (never applied, or removed after its last application).
 * @param {object[]} events issue events, any order; pages already flattened
 * @param {string} label
 * @returns {object|null}
 */
export function latestLabeledEvent(events, label) {
  let latest = null;
  for (const e of chronological(Array.isArray(events) ? events.filter((x) => x && typeof x === "object") : [])) {
    if (!sameLabel(e.label?.name, label)) continue;
    if (e.event === "labeled") latest = e;
    else if (e.event === "unlabeled") latest = null;
  }
  return latest;
}

const loginOf = (event) => {
  const login = String(event?.actor?.login ?? "");
  return LOGIN.test(login) ? login : null;
};

/**
 * Whether a lane label counts, decided from the issue's events.
 * @param {object[]} events
 * @param {string} label one of LANE_LABELS
 * @param {{ trustedLabelers?: string[], permissionOf?: (login: string) => string }} opts
 *   `permissionOf` returns the actor's repo permission NOW (`admin`, `write`, `read`, `none`…);
 *   it is called only for a `User` who applied `approved` or `auto-ok`, and may throw.
 * @returns {{ honoured: boolean, actor: string, reason: string }}
 */
export function verifyLane(events, label, { trustedLabelers = [], permissionOf = () => "none" } = {}) {
  const event = latestLabeledEvent(events, label);
  if (!event) return { honoured: false, actor: "unknown", reason: REASONS.noEvent };
  const login = loginOf(event);
  // What the log line shows. `login` stays null when the payload carried nothing readable, so a
  // real account that happens to be named "unknown" can never be confused with a missing one.
  const actor = login ?? "unknown";

  if (sameLabel(label, TRUSTED_LABEL)) {
    const list = Array.isArray(trustedLabelers) ? trustedLabelers : [];
    if (list.length === 0) return { honoured: false, actor, reason: REASONS.noTrustedLabelers };
    // Exact match on a validated login. GitHub logins are case-insensitive, so compare that way.
    const ok = login !== null && list.some((l) => sameLabel(l, login));
    return ok
      ? { honoured: true, actor, reason: "trusted-labeler" }
      : { honoured: false, actor, reason: REASONS.notTrustedLabeler };
  }

  // `approved` / `auto-ok`. An App can vouch for who sent something; it can never approve what was
  // sent — so a Bot is refused before its permission is even asked about.
  if (event.actor?.type !== "User" || login === null) {
    return { honoured: false, actor, reason: REASONS.notUser };
  }
  let permission = "none";
  try { permission = String(permissionOf(login) ?? "none").trim().toLowerCase(); } catch { permission = "none"; }
  return WRITE.has(permission)
    ? { honoured: true, actor, reason: `user-with-${permission}` }
    : { honoured: false, actor, reason: REASONS.lacksWrite };
}

/** The exact line a present-but-not-honoured label prints to the run log. */
export function notHonouredLine(issue, label, { actor, reason }) {
  return `flow-triage: label-not-honoured issue=${issue} label=${label} actor=${actor} reason=${reason}`;
}

/**
 * Verify every lane label present on one issue.
 * @param {number} issue the issue number (for the log lines)
 * @param {string[]} presentLabels the issue's current label names
 * @param {object[]} events
 * @param {object} opts as for verifyLane
 * @returns {{ lanes: Record<string, boolean>, log: string[] }}
 *   `lanes` has every LANE_LABELS key; a label that is absent is simply false and logs nothing.
 */
export function verifyIssue(issue, presentLabels, events, opts) {
  const lanes = {};
  const log = [];
  for (const label of LANE_LABELS) {
    const present = (presentLabels ?? []).some((l) => sameLabel(l, label));
    if (!present) { lanes[label] = false; continue; }
    const verdict = verifyLane(events, label, opts);
    lanes[label] = verdict.honoured;
    if (!verdict.honoured) log.push(notHonouredLine(issue, label, verdict));
  }
  return { lanes, log };
}

/**
 * The permission lookup the workflow uses: `gh api …/collaborators/{login}/permission`.
 * A login that is not a plain GitHub login is never put into a URL. Any failure — 404 for a
 * non-collaborator, a network error, unparseable output — is thrown, and verifyLane reads a
 * throw as "no write".
 */
export function ghPermissionOf(repo, exec = execFileSync) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo ?? ""))) {
    throw new Error(`intake-trust: refusing repo '${repo}' — expected owner/name`);
  }
  return (login) => {
    if (!LOGIN.test(String(login ?? ""))) throw new Error("not a GitHub login");
    const out = exec("gh", ["api", `repos/${repo}/collaborators/${login}/permission`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const permission = JSON.parse(String(out)).permission;
    if (typeof permission !== "string") throw new Error("no permission field");
    return permission;
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)$/.exec(argv[i]);
    if (!m || i + 1 >= argv.length) throw new Error(`intake-trust: unexpected argument '${argv[i]}'`);
    args[m[1]] = argv[++i];
  }
  for (const k of ["numbers", "raw-dir", "config", "out"]) {
    if (!args[k]) throw new Error(`intake-trust: --${k} is required`);
  }
  return args;
}

const readJson = (file, fallback) => {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
};

/**
 * The CLI, with its effects injected so the tests can run it whole.
 *
 *   node intake-trust.mjs --numbers 12,15 --raw-dir <dir> --config .flow/config.yml \
 *     --out <lanes.json> [--repo owner/name]
 *
 * `<dir>` holds `issue-<n>.json` (the issue object) and `events-<n>.json` (the events, as
 * `gh api --paginate --slurp` writes them: an array of pages). Writes `{ "<n>": { approved,
 * "auto-ok", "flow:trusted" } }` to `--out`. A missing or unreadable file reads as "no labels" /
 * "no events", so it can only ever withhold a lane, never grant one.
 */
export function main(argv, { permissionOf, log = console.log, env = process.env } = {}) {
  const args = parseArgs(argv);
  const numbers = String(args.numbers).split(",").map((s) => s.trim()).filter(Boolean);
  for (const n of numbers) {
    if (!/^[0-9]+$/.test(n)) throw new Error(`intake-trust: refusing a non-numeric issue reference: '${n}'`);
  }
  let configText = "";
  try { configText = readFileSync(args.config, "utf8"); } catch { configText = ""; }
  const { trustedLabelers } = readIntakeConfig(configText);
  const lookup = permissionOf ?? ghPermissionOf(args.repo ?? env.GITHUB_REPOSITORY);

  // One lookup per login per run: the answer cannot change inside a sweep, and an inbox with ten
  // approved issues should not cost ten identical requests.
  const cache = new Map();
  const cached = (login) => {
    if (!cache.has(login)) {
      try { cache.set(login, { value: lookup(login) }); } catch (error) { cache.set(login, { error }); }
    }
    const hit = cache.get(login);
    if (hit.error) throw hit.error;
    return hit.value;
  };

  const result = {};
  const lines = [];
  for (const n of numbers) {
    const issue = readJson(join(args["raw-dir"], `issue-${n}.json`), {});
    const labels = (Array.isArray(issue?.labels) ? issue.labels : [])
      .map((l) => (typeof l === "string" ? l : l?.name)).filter((l) => typeof l === "string");
    const pages = readJson(join(args["raw-dir"], `events-${n}.json`), []);
    const events = Array.isArray(pages) ? pages.flat() : [];
    const { lanes, log: notHonoured } = verifyIssue(Number(n), labels, events,
      { trustedLabelers, permissionOf: cached });
    result[n] = lanes;
    lines.push(...notHonoured);
  }

  writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
  const honoured = Object.entries(result)
    .flatMap(([n, lanes]) => Object.entries(lanes).filter(([, v]) => v).map(([l]) => `#${n} ${l}`));
  const summary = [
    `triage lanes: ${numbers.length} issue(s) checked, ${honoured.length} lane label(s) honoured, ` +
      `${lines.length} not honoured.`,
    ...honoured.map((h) => `  honoured: ${h}`),
    ...lines,
  ];
  for (const line of summary) log(line);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`);
  return { lanes: result, notHonoured: lines };
}

const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch { return false; }
})();

if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
