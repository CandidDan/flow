// acceptance.mjs — the human accepts a task before it can be worked (flow-0227).
//
// A task writer (an orchestrator session, a chat, the triage routine) writes a new task as
// `proposed` and shows it to the human. Only the human's yes turns it into `ready`, recorded as:
//
//   accepted_by:  "CandidDan"             # a GitHub login, or "label:approved" / "label:auto-ok"
//   accepted_at:  "2026-11-14T02:13:59Z"  # full UTC ISO datetime
//   accepted_via: "chat"                  # chat | inflight | issue-label
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
// Zero dependencies on purpose: pick-task and flow-dispatch import it, and flow-doctor imports
// pick-task's neighbours, so this file must not import any of them.

import { existsSync, readFileSync } from "node:fs";

export const ACCEPT_FROM_KEY = "tasks.accept_from";
export const ACCEPTED_VIA = ["chat", "inflight", "issue-label"];
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
  const lines = String(text ?? "").split("\n");
  const i = lines.findIndex((l) => /^tasks:\s*(#.*)?$/.test(l));
  if (i === -1) return undefined;
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\S/.test(lines[j])) break;                 // dedent: the block is over
    const m = lines[j].match(/^\s+accept_from:\s*(.*)$/);
    if (m) return unquote(m[1]);
  }
  return undefined;
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

export function isAccepted(task) {
  return !!String(task?.accepted_by ?? "").trim() && !!String(task?.accepted_at ?? "").trim();
}

/** True when a worker may be handed this task as far as acceptance goes. */
export function acceptanceAllowsWork(task, acceptFrom) {
  return !needsAcceptance(task, acceptFrom) || isAccepted(task);
}

/**
 * flow-doctor's findings. `tasks` carry id, status, created, accepted_by, accepted_at,
 * accepted_via. Returns { problems, warnings }.
 */
export function acceptanceFindings(tasks, acceptFrom) {
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
    if (!needsAcceptance(t, acceptFrom) || isAccepted(t)) continue;
    const missing = !String(t.accepted_by ?? "").trim() ? "accepted_by" : "accepted_at";
    problems.push(`${t.id}: ${t.status} with no ${missing} — a new task is written \`proposed\` and ` +
      "becomes ready only when the human accepts it (task-writer skill); set it back to proposed " +
      "and ask, or record who accepted it and when");
  }
  return { problems, warnings };
}
