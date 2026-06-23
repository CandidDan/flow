#!/usr/bin/env node
// touches-guard.mjs — enforces the task's declared blast radius.
//
// `touches` was added for concurrency (skip a ready task whose globs overlap an in_progress
// one), but nothing mechanically checked that a PR's diff actually STAYS within it — only the
// fallible code-reviewer agent. This guard closes that gap: on a flow/<id>-… PR, every changed
// file must match the task's `touches` globs, or the gate fails. (Found on CAN-30's first run:
// the worker drifted into a file the task said not to touch and only the agent might have
// caught it.)
//
// Companion to the store-guard (which owns `.flow/`): this guard ignores `.flow/**` and judges
// only feature files. A task that legitimately needs a wider radius declares it in `touches`
// (or `touches: ["**"]` to opt out entirely). Discovering mid-build that you need more is a
// scope signal — block and let the orchestrator widen `touches` on main, don't drift silently.
//
//   node .flow/bin/touches-guard.mjs                 # CI: derives branch, base, changed files
//   BASE_REF=origin/main HEAD_REF=flow/CAN-30-x node .flow/bin/touches-guard.mjs
//
// Zero deps (Node >= 18). Exits non-zero when a changed file is outside touches.

import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

// Read a task file's `touches` list from YAML frontmatter (tolerant of inline-array form).
function readTouches(file) {
  const src = readFileSync(file, "utf8");
  const m = src.match(/^touches:\s*\[(.*?)\]/m);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2]).filter(Boolean);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const flowDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const tasksDir = join(flowDir, "tasks");
  const headRef = process.env.HEAD_REF
    || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"]).toString().trim();

  const idMatch = headRef.match(/^flow\/(.+?-\d{1,4})(?=-)/);
  if (!idMatch) { console.log(`touches-guard: '${headRef}' is not a flow/<id>-… branch — skipping.`); process.exit(0); }
  const id = idMatch[1];

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
