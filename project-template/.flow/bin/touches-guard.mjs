#!/usr/bin/env node
// touches-guard.mjs — enforces the task's declared blast radius.
//
// `touches` was added for concurrency (skip a ready task whose globs overlap an in_progress
// one), but nothing mechanically checked that a PR's diff actually STAYS within it — only the
// fallible code-reviewer agent. This guard closes that gap: on a task-carrying PR, every changed
// file must match the task's `touches` globs, or the gate fails. (Found on CAN-30's first run:
// the worker drifted into a file the task said not to touch and only the agent might have
// caught it.)
//
// Companion to the store-guard (which owns `.flow/`): this guard ignores `.flow/**` and judges
// only feature files. A task that legitimately needs a wider radius declares it in `touches`
// (or `touches: ["**"]` to opt out entirely). Discovering mid-build that you need more is a
// scope signal — block and let the orchestrator widen `touches` on main, don't drift silently.
//
// The task id is resolved from the branch OR the PR title (`[<id>] …`), so a PR from a cloud
// session forced onto a non-`flow/` branch is still scope-checked rather than waved through.
//
//   node .flow/bin/touches-guard.mjs                 # CI: derives branch, base, changed files
//   BASE_REF=origin/main HEAD_REF=flow/CAN-30-x node .flow/bin/touches-guard.mjs
//   BASE_REF=origin/main HEAD_REF=claude/xyz PR_TITLE='[CAN-30] …' node .flow/bin/touches-guard.mjs
//
// Zero deps (Node >= 18). Exits non-zero when a changed file is outside touches.

import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTaskId } from "./parse-task-id.mjs";


import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";

// --- main-module detection (do not simplify back to a string compare) -------------------
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED.
// When the script is reached through a symlink they differ, the comparison is false, and the
// CLI block below silently never runs — no output, exit 0, nothing to debug. macOS hits this
// routinely because os.tmpdir() (/var/folders/...) is a symlink to /private/var/folders/...,
// and any symlinked checkout or bind-mount does the same. For touches-guard that means the
// scope check silently does not run and the gate goes green: it fails OPEN, which is the
// wrong direction for a guard. Compare realpaths on both sides.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------
// Translate a path glob to an anchored RegExp. Supports: `**` (any path span, incl. /),
// `*` (anything except /), and literal `.`/path chars. Mirrors the globs used in task files
// (e.g. "src/components/signup/**", "src/lib/validation/email.*", "app/vercel.json").
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if ("\\^$+?.()|{}[]".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

// Pure core: which changed files fall outside the declared touches globs.
// `.flow/**` is excluded (the store-guard's domain). `["**"]` allows everything.
export function checkTouches({ changedFiles, touches }) {
  const candidates = changedFiles.filter((f) => !f.startsWith(".flow/"));
  if (touches.includes("**")) return { outside: [], checked: candidates.length };
  const res = touches.map(globToRegExp);
  const outside = candidates.filter((f) => !res.some((r) => r.test(f)));
  return { outside, checked: candidates.length };
}

// Parse a task file's `touches` from its YAML frontmatter. Handles BOTH shapes the
// store actually uses, returning the same string[]:
//   inline:      touches: ["a/**", "b.json"]
//   multi-line:  touches:
//                  - "a/**"
//                  - 'b.json'
// A genuinely empty declaration (`touches: []`, or no key) returns []. Dependency-free
// (no YAML lib) — a tolerant scan of the two shapes the task files use is enough.
// (CAN-57: the multi-line form previously never matched, silently disabling the guard
// for the entire dashboard task family.)
export function parseTouches(src) {
  // Only look inside the YAML frontmatter (between the first two `---` fences), never the
  // body — a task's prose can legitimately contain a `touches:` line (e.g. a code example,
  // as CAN-57's own task file does). Falls back to the whole string if no fence is found.
  const fence = src.match(/^---\n([\s\S]*?)\n---/);
  const fm = fence ? fence[1] : src;

  // Inline array — the `s` flag lets the bracket span lines (`touches: [\n "a",\n ]`).
  const inline = fm.match(/^touches:\s*\[(.*?)\]/ms);
  if (inline) {
    return [...inline[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2]).filter(Boolean);
  }
  // Multi-line YAML list: a bare `touches:` line followed by `  - <glob>` items.
  const lines = fm.split(/\r?\n/);
  const start = lines.findIndex((l) => /^touches:\s*$/.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue; // tolerate blank + full-line comments
    const item = line.match(/^\s*-\s+(.*\S)\s*$/);
    if (!item) break; // a non-item line is the next key — the list has ended
    const raw = item[1];
    // Quoted value: take what's inside the quotes, ignoring any trailing ` # comment`.
    // Unquoted value: strip a trailing YAML comment (whitespace + `#…`).
    const quoted = raw.match(/^"([^"]*)"|^'([^']*)'/);
    const value = quoted ? (quoted[1] ?? quoted[2]) : raw.replace(/\s+#.*$/, "").trim();
    if (value) out.push(value);
  }
  return out;
}

// Read a task file's `touches` list from YAML frontmatter (both inline + multi-line forms).
function readTouches(file) {
  return parseTouches(readFileSync(file, "utf8"));
}

function findTaskFile(tasksDir, id) {
  for (const name of readdirSync(tasksDir)) {
    if (!name.endsWith(".md") || name === "_TEMPLATE.md") continue;
    const file = join(tasksDir, name);
    const m = readFileSync(file, "utf8").match(/^id:\s*"?([^"\n]+)"?/m);
    if (m && m[1].trim() === id) return file;
  }
  return null;
}

if (__isMain) {
  const flowDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const tasksDir = join(flowDir, "tasks");
  const headRef = process.env.HEAD_REF
    || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"]).toString().trim();
  const prTitle = process.env.PR_TITLE || "";

  // Branch first, PR title second — the same resolution flow-status/flow-done use (CAN-52).
  // Matching on the branch alone meant every cloud-session PR (forced onto `claude/…` by the
  // platform) skipped the guard silently: scope enforcement was off for exactly the sessions
  // most likely to drift, and the gate went green saying nothing.
  const id = parseTaskId(headRef, prTitle);
  if (!id) {
    console.log(`touches-guard: no task id in branch '${headRef}' or title '${prTitle}' — skipping.`);
    process.exit(0);
  }

  const file = findTaskFile(tasksDir, id);
  if (!file) { console.log(`touches-guard: no task file for ${id} — skipping (store-guard / review will catch oddities).`); process.exit(0); }

  const touches = readTouches(file);
  if (touches.length === 0) {
    console.warn(`touches-guard: ${id} declares no touches — cannot enforce a blast radius. ` +
      `flow-doctor flags this; add touches to make scope checkable. Passing for now.`);
    process.exit(0);
  }

  const base = process.env.BASE_REF || "origin/main";
  const changedFiles = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`])
    .toString().split("\n").map((s) => s.trim()).filter(Boolean);

  const { outside, checked } = checkTouches({ changedFiles, touches });
  console.log(`touches-guard: ${id} — ${checked} feature file(s) checked against ${touches.length} glob(s).`);
  if (outside.length) {
    console.error("::error::Changed files fall outside this task's declared `touches`:");
    for (const f of outside) console.error(`  outside touches: ${f}`);
    console.error("Either narrow the change to the declared scope, or — if the wider radius is " +
      "real — block the task and have the orchestrator update `touches` on main before continuing. " +
      "Do not widen scope silently.");
    process.exit(1);
  }
  console.log("touches-guard: all changed files are within scope ✓");
}
