#!/usr/bin/env bash
# Flow canonical — what is actually workable in the task store, and what is only pretending to be.
#
#   bash flow-backlog.sh           # the buckets, plus anything that needs a human
#   bash flow-backlog.sh --full    # also every task's title and touches
#   bash flow-backlog.sh --help
#
# READ-ONLY. It writes nothing, and the only git it runs is
# `git --no-optional-locks status --porcelain` — `--no-optional-locks` is deliberate: a plain
# `git status` may refresh and rewrite `.git/index`, and a sandboxed session dying mid-write is
# what strands `.git/index.lock` and blocks every later write. This script must never be the
# thing that does that.
#
# WHY THIS EXISTS, given `flow-doctor` already runs in the gate: the doctor answers "is the store
# VALID" and exits non-zero when it is not. This answers "what can I actually WORK ON", which is a
# different question with a different audience. A store can be perfectly valid and still have
# nothing dispatchable in it.
#
# It reimplements NO judgement. Every decision below is imported from the shipped helpers, so this
# file cannot drift from what the queue runner and the gate actually do:
#
#   pickTask, touchesOverlap, readTasks  <- project-template/.flow/bin/pick-task.mjs
#   readinessFindings                    <- project-template/.flow/bin/flow-doctor.mjs
#
# If a verdict here disagrees with the runner, that is a bug in the helpers, not in this script —
# which is the point of not writing a second copy of the bar in bash regex.

set -uo pipefail

FULL=0
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    --help|-h) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'unknown argument: %s (try --help)\n' "$arg" >&2; exit 2 ;;
  esac
done

# Default to the directory this script lives in, not a hardcoded ~/Projects/flow: the sibling
# scripts assume one checkout on one machine, and that assumption is why they only work on Dan's
# Mac. FLOW_REPO still overrides.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO="${FLOW_REPO:-$HERE}"

[ -d "$REPO/.flow/tasks" ] || { printf '!! no .flow/tasks under %s (set FLOW_REPO)\n' "$REPO" >&2; exit 1; }
BIN="$REPO/project-template/.flow/bin"
[ -f "$BIN/pick-task.mjs" ] || { printf '!! no helpers at %s\n' "$BIN" >&2; exit 1; }
command -v node >/dev/null || { printf '!! node not on PATH\n' >&2; exit 1; }

# Colour only when stdout is a terminal, so piping or pasting the output stays clean.
if [ -t 1 ]; then B=$'\033[1m'; R=$'\033[0m'; DIM=$'\033[2m'; else B=""; R=""; DIM=""; fi

# Read-only, lock-free. Empty (and harmless) if this is not a git checkout.
GIT_PORCELAIN="$(cd "$REPO" && git --no-optional-locks status --porcelain -- .flow/tasks 2>/dev/null || true)"

FLOW_REPO="$REPO" FLOW_BIN="$BIN" FLOW_FULL="$FULL" \
FLOW_B="$B" FLOW_R="$R" FLOW_DIM="$DIM" FLOW_PORCELAIN="$GIT_PORCELAIN" \
node --input-type=module <<'NODE'
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = process.env.FLOW_REPO;
const BIN  = process.env.FLOW_BIN;
const FULL = process.env.FLOW_FULL === "1";
const { FLOW_B: B, FLOW_R: R, FLOW_DIM: DIM } = process.env;

const binUrl = (f) => new URL(f, `file://${BIN}/`).href;
const { readTasks, pickTask, touchesOverlap } = await import(binUrl("pick-task.mjs"));
const { readinessFindings } = await import(binUrl("flow-doctor.mjs"));

const TASKS = join(REPO, ".flow", "tasks");

// `parseTask` returns only what the runner needs (id/status/priority/touches). Title, body and
// blocked_reason are read here — presentation fields the selector has no reason to carry.
const extras = new Map();
for (const name of readdirSync(TASKS).sort()) {
  if (!name.endsWith(".md") || name === "_TEMPLATE.md") continue;
  const text = readFileSync(join(TASKS, name), "utf8");
  const end = text.indexOf("\n---", 3);
  const head = end === -1 ? "" : text.slice(3, end);
  const body = end === -1 ? text : text.slice(end + 4);
  const field = (k) => {
    const m = head.match(new RegExp(`^${k}:\\s*(.*)$`, "m"));
    return m ? m[1].split(" #")[0].trim().replace(/^"(.*)"$/, "$1") : "";
  };
  const id = field("id");
  if (id) extras.set(id, { file: name, title: field("title"), body,
                           blocked: field("blocked_reason"), owner: field("owner"),
                           started: field("started") });
}

const tasks = readTasks(TASKS);
const meta  = (t) => extras.get(t.id) ??
  { file: "?", title: "", body: "", blocked: "", owner: "", started: "" };

// An `in_progress` task with no owner or no `started` is a claim that did not complete. It still
// shadows every task its touches overlap, so a dead claim quietly starves the queue — and the
// symptom ("nothing is workable") points nowhere near the cause. flow-doctor calls this a problem;
// surfaced here because this is the report where its consequence is visible.
const suspectClaim = (t) =>
  (t.status === "in_progress") && (!meta(t).owner || !meta(t).started);
const say   = (s) => console.log(`\n${B}==> ${s}${R}`);
const pri   = (t) => (Number.isFinite(t.priority) ? `P${t.priority}` : "P?");
const line  = (t, extra = "") => {
  const m = meta(t);
  console.log(`    ${pri(t).padEnd(3)} ${t.id}  ${m.title || DIM + "(no title)" + R}${extra}`);
  if (FULL) console.log(`        ${DIM}touches: ${t.touches.length ? t.touches.join(", ") : "(none)"}${R}`);
};

// ── classify ────────────────────────────────────────────────────────────────────────────
// "Needs a human" is this script's own bucket, not a status: STATUSES is
// ready|in_progress|in_review|done|blocked — there is no "proposed"/"awaiting approval" state.
// A task nobody has vetted still lands as `ready`, so the honest mechanical proxy for
// unapproved is *claims to be ready but is not dispatchable* — which is exactly what the two
// flags below detect.
const inFlight = tasks.filter((t) => t.status === "in_progress" || t.status === "in_review");
const blocked  = tasks.filter((t) => t.status === "blocked");
const done     = tasks.filter((t) => t.status === "done");
const ready    = tasks.filter((t) => t.status === "ready");
const illegal  = tasks.filter((t) => !["ready", "in_progress", "in_review", "done", "blocked"].includes(t.status));

const needsHuman = [], workable = [], shadowed = [];
for (const t of ready) {
  const findings = readinessFindings({ id: t.id, body: meta(t).body });
  const reasons = [];
  if (findings.some((f) => /acceptance criteria/i.test(f)))
    reasons.push("no acceptance criteria — cannot be verified, so cannot be finished");
  else if (findings.length)
    reasons.push(findings[0].replace(`${t.id}: `, ""));
  if (t.touches.length === 0)
    reasons.push("no usable touches — the runner will skip it or let it collide with everything");

  if (reasons.length) { needsHuman.push([t, reasons]); continue; }

  const clash = inFlight.filter((p) => touchesOverlap(t.touches, p.touches));
  if (clash.length) shadowed.push([t, clash]); else workable.push(t);
}

// ── report ──────────────────────────────────────────────────────────────────────────────
console.log(`${B}Flow backlog${R} — ${REPO}`);
console.log(`${DIM}    ${tasks.length} task(s) in .flow/tasks${R}`);

say(`Workable now (${workable.length})`);
if (workable.length) {
  workable.sort((a, b) => (a.priority || 999) - (b.priority || 999) || a.id.localeCompare(b.id)).forEach((t) => line(t));
  const next = pickTask(tasks);
  console.log(`\n    ${DIM}the queue runner would dispatch:${R} ${next ?? "(nothing)"}`);
} else {
  console.log("    (nothing — see the buckets below for why)");
}

if (shadowed.length) {
  say(`Shadowed (${shadowed.length}) — specified and ready, but touches collide with live work`);
  console.log(`    ${DIM}not a defect: this is the concurrency guard doing its job. Sequence, don't force.${R}`);
  shadowed.forEach(([t, clash]) => {
    line(t, `  ${DIM}← collides with ${clash.map((c) => c.id + (suspectClaim(c) ? " (suspect)" : "")).join(", ")}${R}`);
    if (clash.some(suspectClaim))
      console.log(`        ${DIM}· blocked by a claim that may be dead — check it before waiting on it (flow-recover)${R}`);
  });
}

if (inFlight.length) {
  say(`In flight (${inFlight.length})`);
  inFlight.forEach((t) => {
    line(t, `  ${DIM}[${t.status}${meta(t).owner ? " · " + meta(t).owner : ""}]${R}`);
    if (suspectClaim(t))
      console.log(`        ${DIM}· suspect claim: ${!meta(t).owner ? "no owner" : "no started timestamp"}` +
                  ` — it may be dead, and it is still shadowing anything its touches overlap${R}`);
  });
}

if (blocked.length) {
  say(`Blocked (${blocked.length})`);
  blocked.forEach((t) => {
    line(t);
    const why = meta(t).blocked;
    console.log(`        ${DIM}${why || "(no blocked_reason recorded — that is itself the problem)"}${R}`);
  });
}

if (needsHuman.length) {
  say(`Needs a human before the runner can see it (${needsHuman.length})`);
  console.log(`    ${DIM}status says ready; the readiness bar disagrees. The runner filters on status alone,${R}`);
  console.log(`    ${DIM}so these sit in the queue looking available and never get picked.${R}`);
  needsHuman.forEach(([t, reasons]) => { line(t); reasons.forEach((r) => console.log(`        ${DIM}· ${r}${R}`)); });
}

if (illegal.length) {
  say(`Illegal status (${illegal.length}) — flow-doctor fails the gate on these`);
  illegal.forEach((t) => line(t, `  ${DIM}status="${t.status}"${R}`));
}

// Uncommitted task files: the store is `main`, so a file on disk is not in it yet.
const uncommitted = (process.env.FLOW_PORCELAIN || "").split("\n")
  .map((l) => l.trim()).filter(Boolean)
  .filter((l) => l.startsWith("??") || l.startsWith("A "));
if (uncommitted.length) {
  say(`Not in the store yet (${uncommitted.length})`);
  console.log(`    ${DIM}the store is main — a task file is not real until it is committed and pushed there${R}`);
  uncommitted.forEach((l) => console.log(`    ${l}`));
}

// Retirement candidates: ready, no criteria AND no touches. Both flags together is the
// signature of invented adjacent work — a title and nothing a worker or the gate can act on.
// One flag alone is a task that needs finishing, not deleting, so it is deliberately not listed.
const retire = needsHuman.filter(([t, rs]) => rs.length >= 2 && t.touches.length === 0);
if (retire.length) {
  say(`Retirement candidates (${retire.length}) — REVIEW, then paste if you agree`);
  console.log(`    ${DIM}neither verifiable nor dispatchable. Nothing below is run by this script.${R}`);
  console.log(`    ${DIM}No trailing comments on these lines: zsh has interactive_comments off and${R}`);
  console.log(`    ${DIM}would pass a trailing # as an argument to git.${R}\n`);
  retire.forEach(([t]) => console.log(`    git rm .flow/tasks/${meta(t).file}`));
}

say("Summary");
console.log(`    workable ${workable.length} · shadowed ${shadowed.length} · in flight ${inFlight.length}` +
            ` · blocked ${blocked.length} · needs a human ${needsHuman.length} · done ${done.length}`);
if (!workable.length && (needsHuman.length || shadowed.length))
  console.log(`    ${DIM}Nothing is dispatchable. A queue only drains if it is stocked with approved,${R}\n` +
              `    ${DIM}specified ready tasks — faster dispatch would change nothing here.${R}`);
NODE
