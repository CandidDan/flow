// acceptance.mjs — the human accepts a task before it can be worked (flow-0227).
//
// A task writer (an orchestrator session, a chat, the triage routine) writes a new task as
// `proposed` and shows it to the human. Only the human's yes turns it into `ready`, recorded as:
//
//   accepted_by:  "CandidDan"             # a GitHub login, or "label:approved" / "label:auto-ok"
//   accepted_at:  "2026-11-14T02:13:59Z"  # full UTC ISO datetime
//   accepted_via: "chat"                  # chat | inflight | issue-label | auto
//
// A "no" is `cancelled` with the human's reason in `cancelled_reason`.
//
// The rule is switched on per repo by a date in `.flow/config.yml`, the same way the intent rule
// is (`intents.required_from`), so turning it on never reddens tasks written before it existed:
//
//   tasks:
//     accept_from: "2026-11-14"
//
// Unset, or not a YYYY-MM-DD date, means the rule is off. This module is the one place that
// decides whether a task needs acceptance and has it. flow-doctor reports the gap; pick-task and
// flow-dispatch refuse to hand an unaccepted task to a worker.
//
// AUTO-ACCEPT. A repo may let small, low-risk tasks skip the human, judged on FACTS in the task
// file, never on a score the writer gives itself (Dan, 2026-11-14):
//
//   tasks:
//     accept_from: "2026-11-14"
//     auto_accept:
//       max_model: haiku        # the highest build tier that may skip the human (unset model = sonnet)
//       max_touches: 3          # at most this many `touches` entries, and at least one
//       never: [".github/**", ".flow/bin/**", "**/auth/**", "**/payments/**"]
//
// A qualifying task is written `ready` with `accepted_by: "auto"` and `accepted_via: "auto"`. It
// still shows in inflight as auto-accepted. flow-doctor re-checks every `auto` accept against the
// config, so a task that does not qualify cannot claim it. Without an `auto_accept` block nothing
// is auto-accepted.
//
// CLI, for the task writer:  node <bin>/acceptance.mjs auto <task-file> [--config .flow/config.yml]
//   exit 0 and prints "auto-accept: yes" when the task qualifies; exit 1 and the reasons when not.
//
// Zero dependencies on purpose: pick-task and flow-dispatch import it, and flow-doctor imports
// pick-task's neighbours, so this file must not import any of them.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ACCEPT_FROM_KEY = "tasks.accept_from";
export const ACCEPTED_VIA = ["chat", "inflight", "issue-label", "auto"];
export const AUTO = "auto";
export const MODEL_TIERS = ["haiku", "sonnet", "opus", "fable"];
export const DEFAULT_MODEL = "sonnet";
export const AUTO_DEFAULTS = Object.freeze({
  max_model: "haiku",
  max_touches: 3,
  never: [".github/**", ".flow/bin/**", "**/auth/**", "**/payments/**"],
});
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function unquote(raw) {
  let v = String(raw ?? "").trim();
  const quoted = v.match(/^"([^"]*)"|^'([^']*)'/);
  if (quoted) return quoted[1] ?? quoted[2];
  const hash = v.search(/\s#/);
  if (hash !== -1) v = v.slice(0, hash);
  return v.trim();
}

/**
 * `tasks.accept_from` from config text: the value as written (quotes and comment stripped), or
 * undefined when the `tasks:` block or the key is absent. Line-scanned, not YAML-parsed, because
 * these helpers run in jobs with no install step.
 */
export function parseAcceptFromText(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const i = lines.findIndex((l) => /^tasks:\s*(#.*)?$/.test(l));
  if (i === -1) return undefined;
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\S/.test(lines[j])) break;                 // dedent: the block is over
    const m = lines[j].match(/^\s+accept_from:\s*(.*)$/);
    if (m) return unquote(m[1]);
  }
  return undefined;
}

function parseInlineList(raw) {
  const v = String(raw ?? "").trim();
  if (!v.startsWith("[")) return null;
  const inner = v.slice(1, v.lastIndexOf("]"));
  return inner.split(",").map(unquote).filter(Boolean);
}

/**
 * The `tasks.auto_accept` block from config text, with defaults filled in, or null when there is
 * no such block (auto-accept off). `never` takes the inline form or a block list.
 */
export function parseAutoAcceptText(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const t = lines.findIndex((l) => /^tasks:\s*(#.*)?$/.test(l));
  if (t === -1) return null;
  let a = -1, indent = 0;
  for (let j = t + 1; j < lines.length; j++) {
    if (/^\S/.test(lines[j])) break;
    const m = lines[j].match(/^(\s+)auto_accept:\s*(#.*)?$/);
    if (m) { a = j; indent = m[1].length; break; }
  }
  if (a === -1) return null;
  const out = { ...AUTO_DEFAULTS, never: [...AUTO_DEFAULTS.never] };
  let listKey = null;
  for (let j = a + 1; j < lines.length; j++) {
    const line = lines[j];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const lead = line.match(/^(\s*)/)[1].length;
    if (lead <= indent && !/^\s*-\s/.test(line)) break;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) { out[listKey].push(unquote(item[1])); continue; }
    const kv = line.match(/^\s+(\w+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    listKey = null;
    if (key === "never") {
      const inline = parseInlineList(raw);
      if (inline) out.never = inline;
      else { out.never = []; listKey = "never"; }
    } else if (key === "max_model") {
      out.max_model = unquote(raw);
    } else if (key === "max_touches") {
      out.max_touches = Number(unquote(raw));
    }
  }
  return out;
}

export function parseAcceptFrom(configPath) {
  if (!configPath || !existsSync(configPath)) return undefined;
  return parseAcceptFromText(readFileSync(configPath, "utf8"));
}

/** The cutoff date when the rule is on, else null. */
export function acceptCutoff(raw) {
  return typeof raw === "string" && ISO_DATE.test(raw) ? raw : null;
}

/**
 * True when the rule covers this task: the rule is on, the task was created on or after the
 * cutoff, and the task is neither `proposed` (waiting for the human) nor `cancelled` (rejected,
 * or dropped). A task with no readable `created` date is treated as covered: an undated task is
 * exactly the kind that slips past a date rule.
 */
export function needsAcceptance(task, acceptFrom) {
  const cutoff = acceptCutoff(acceptFrom);
  if (!cutoff || !task) return false;
  if (task.status === "proposed" || task.status === "cancelled") return false;
  const created = String(task.created ?? "").slice(0, 10);
  if (ISO_DATE.test(created) && created < cutoff) return false;
  return true;
}

// ── auto-accept: facts, not scores ──

const escapeRe = (c) => c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
/** A path glob as a whole-string regex: `**\/` any directories, `**` anything, `*` one segment. */
export function globToRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    if (glob.startsWith("**/", i)) { re += "(?:.*/)?"; i += 2; }
    else if (glob.startsWith("**", i)) { re += ".*"; i += 1; }
    else if (glob[i] === "*") re += "[^/]*";
    else if (glob[i] === "?") re += "[^/]";
    else re += escapeRe(glob[i]);
  }
  return new RegExp(`^${re}$`);
}
const staticPrefix = (g) => { const i = g.search(/[*?]/); return i === -1 ? g : g.slice(0, i); };

/**
 * Could a `touches` entry reach a path a `never` glob protects? Conservative, because a wrong
 * "no" lets a risky task skip the human: true when the never glob matches the entry as written,
 * when the entry is a wildcard over a directory that contains the protected one, or when the
 * entry is a `**` wildcard and the protected glob can match at any depth.
 */
export function touchesReachesNever(entry, never) {
  if (globToRegex(never).test(entry)) return true;
  if (!/[*?]/.test(entry)) return false;
  const pe = staticPrefix(entry), pn = staticPrefix(never);
  if (pn && pn.startsWith(pe)) return true;
  return entry.includes("**") && never.startsWith("**");
}

/** Why a task does not qualify for auto-accept: [] when it does. */
export function autoAcceptReasons(task, policy) {
  if (!policy) return ["auto_accept is not set in .flow/config.yml"];
  const reasons = [];
  const model = String(task?.model ?? "").trim() || DEFAULT_MODEL;
  const tier = MODEL_TIERS.indexOf(model), cap = MODEL_TIERS.indexOf(policy.max_model);
  if (cap === -1) reasons.push(`auto_accept.max_model "${policy.max_model}" is not one of ${MODEL_TIERS.join(" | ")}`);
  else if (tier === -1 || tier > cap) reasons.push(`model ${model} is above ${policy.max_model}`);
  const touches = Array.isArray(task?.touchesList) ? task.touchesList : Array.isArray(task?.touches) ? task.touches : [];
  if (!touches.length) reasons.push("touches is empty, so its reach is unknown");
  if (!(Number.isInteger(policy.max_touches) && policy.max_touches > 0))
    reasons.push(`auto_accept.max_touches "${policy.max_touches}" is not a positive whole number`);
  else if (touches.length > policy.max_touches) reasons.push(`touches has ${touches.length} entries, over ${policy.max_touches}`);
  for (const e of touches) {
    const hit = policy.never.find((n) => touchesReachesNever(e, n));
    if (hit) reasons.push(`touches "${e}" can reach "${hit}"`);
  }
  return reasons;
}

export function isAccepted(task) {
  return !!String(task?.accepted_by ?? "").trim() && !!String(task?.accepted_at ?? "").trim();
}

/** True when a worker may be handed this task as far as acceptance goes. */
export function acceptanceAllowsWork(task, acceptFrom) {
  return !needsAcceptance(task, acceptFrom) || isAccepted(task);
}

/**
 * flow-doctor's findings. `tasks` carry id, status, created, accepted_by, accepted_at,
 * accepted_via, and for the auto-accept re-check model and touchesList (or touches). `autoAccept`
 * is parseAutoAcceptText's result. Returns { problems, warnings }.
 */
export function acceptanceFindings(tasks, acceptFrom, autoAccept = null) {
  const problems = [], warnings = [];
  if (acceptFrom !== undefined && acceptFrom !== "" && !acceptCutoff(acceptFrom)) {
    warnings.push(`${ACCEPT_FROM_KEY} is "${acceptFrom}", not a YYYY-MM-DD date — the accept rule ` +
      "is off until it parses");
    return { problems, warnings };
  }
  for (const t of tasks ?? []) {
    const via = String(t.accepted_via ?? "").trim();
    if (via && !ACCEPTED_VIA.includes(via)) {
      warnings.push(`${t.id}: accepted_via "${via}" is not one of ${ACCEPTED_VIA.join(" | ")}`);
    }
    // An auto accept is a claim about the task's facts, so it is checked, not trusted. Only a
    // task that is still waiting for work: once claimed, its touches may legitimately widen.
    const auto = via === AUTO || String(t.accepted_by ?? "").trim() === AUTO;
    if (auto && t.status === "ready") {
      const why = autoAcceptReasons(t, autoAccept);
      if (why.length) problems.push(`${t.id}: auto-accepted but does not qualify (${why.join("; ")}) — ` +
        "set it back to proposed and ask the human");
    }
    if (!needsAcceptance(t, acceptFrom) || isAccepted(t)) continue;
    const missing = ["accepted_by", "accepted_at"].filter((k) => !String(t[k] ?? "").trim()).join(" or ");
    problems.push(`${t.id}: ${t.status} with no ${missing} — a new task is written \`proposed\` and ` +
      "becomes ready only when the human accepts it (task-writer skill); set it back to proposed " +
      "and ask, or record who accepted it and when");
  }
  return { problems, warnings };
}

export function parseAutoAccept(configPath) {
  if (!configPath || !existsSync(configPath)) return null;
  return parseAutoAcceptText(readFileSync(configPath, "utf8"));
}

// Minimal frontmatter read for the CLI: model and touches (inline or block list).
export function readTaskFacts(text) {
  const src = String(text ?? "");
  const end = src.indexOf("\n---", 3);
  const head = src.startsWith("---") && end !== -1 ? src.slice(3, end) : "";
  const get = (k) => { const m = head.match(new RegExp(`^${k}:\\s*(.*)$`, "m")); return m ? unquote(m[1]) : ""; };
  const lines = head.split(/\r?\n/);
  const i = lines.findIndex((l) => /^touches:/.test(l));
  let touches = [];
  if (i !== -1) {
    const inline = parseInlineList(lines[i].replace(/^touches:\s*/, "").replace(/\s+#.*$/, ""));
    if (inline) touches = inline;
    else for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*(#.*)?$/.test(lines[j])) continue;     // a blank or comment line inside the list
      if (!/^\s*-\s/.test(lines[j])) break;
      touches.push(unquote(lines[j].replace(/^\s*-\s+/, "")));
    }
  }
  return { model: get("model"), touches };
}

export function runAutoCli(argv, { read = (p) => readFileSync(p, "utf8"), log = console.log } = {}) {
  const [cmd, file, ...rest] = argv;
  if (cmd !== "auto" || !file) {
    log("usage: acceptance.mjs auto <task-file> [--config .flow/config.yml]");
    return 2;
  }
  const c = rest.indexOf("--config");
  const config = c !== -1 && rest[c + 1] ? rest[c + 1] : ".flow/config.yml";
  const policy = parseAutoAccept(config);
  const why = autoAcceptReasons(readTaskFacts(read(file)), policy);
  if (!why.length) { log("auto-accept: yes"); return 0; }
  log(`auto-accept: no — ${why.join("; ")}`);
  return 1;
}

const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch { return false; }
})();
if (isMain) process.exit(runAutoCli(process.argv.slice(2)));
