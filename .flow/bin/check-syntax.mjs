#!/usr/bin/env node
// check-syntax.mjs — canonical's `lint`: `node --check` over every tracked `.mjs`.
//
// Canonical ships helper scripts that consuming repos copy into their own `.flow/bin/`. A
// syntax error here does not fail in canonical (nothing imports these on push) — it fails in
// every repo that adopted the bad version, one PR at a time. `node --check` is the cheapest
// thing that catches it, needs no dependency, and cannot disagree with the runtime, because it
// IS the runtime's parser.
//
//   node .flow/bin/check-syntax.mjs [file ...]   # default: every tracked *.mjs
//
// Exits 0 when every file parsed, 1 otherwise — naming each offending file with the parse
// error. An EMPTY file list is a failure, not a pass: a lint that checks nothing and reports
// success is the silent-no-op failure the guards exist to prevent (see .flow/tasks/flow-0008).
//
// Tracked files only (`git ls-files`), deliberately. An untracked scratch file is not something
// canonical ships, and `flow-validation/` and `flow-plugin/` are untracked after the public
// split — linting them would fail the gate on directories git no longer knows about.

import { spawnSync } from "node:child_process";
import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";

// --- main-module detection (do not simplify back to a string compare) -------------------
// See check-workflows.mjs for why this compares realpaths on both sides.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// Every `.mjs` git knows about, relative to `cwd`. Returns [] outside a work tree rather than
// throwing — the caller turns "nothing to check" into a failure, which is the honest outcome.
export function trackedMjs(cwd = process.cwd()) {
  const r = spawnSync("git", ["ls-files", "-z", "*.mjs"], { cwd, encoding: "utf8" });
  if (r.status !== 0) return [];
  return r.stdout.split("\0").map((s) => s.trim()).filter(Boolean).sort();
}

// Syntax-check each file with the running Node binary. Returns
// { checked: string[], failures: [{file, message}] }. No process exit, no console.
export function checkSyntax(files, { cwd = process.cwd() } = {}) {
  const checked = [];
  const failures = [];

  for (const file of files) {
    const r = spawnSync(process.execPath, ["--check", file], { cwd, encoding: "utf8" });
    if (r.status === 0) {
      checked.push(file);
      continue;
    }
    // node --check prints the offending source line, a caret, then the error. The error line
    // is the actionable one; the file name is added by the caller so it is never lost.
    const message = String(r.stderr || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .find((l) => /Error/.test(l)) || `node --check exited ${r.status}`;
    failures.push({ file, message });
  }

  if (files.length === 0) {
    failures.push({
      file: "(none)",
      message: "no .mjs files to check — lint would report success having parsed nothing",
    });
  }

  return { checked, failures };
}

// ── CLI ──
if (__isMain) {
  const explicit = process.argv.slice(2);
  const files = explicit.length ? explicit : trackedMjs();
  const { checked, failures } = checkSyntax(files);

  console.log(`check-syntax: ${checked.length} .mjs file(s) parsed`);
  for (const f of failures) console.error(`::error file=${f.file}::${f.file}: ${f.message}`);
  if (failures.length) {
    console.error(`check-syntax: ${failures.length} file(s) failed to parse.`);
    process.exit(1);
  }
  process.exit(0);
}
