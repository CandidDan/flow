#!/usr/bin/env node
// check-workflows.mjs — canonical's `build`: prove every GitHub Actions workflow parses.
//
// Canonical's product is not an application; it is `.mjs` helpers and reusable workflows that
// every other repo adopts by reference. A malformed reusable therefore breaks the whole fleet
// at once, and nothing catches it before it does: GitHub reports a broken workflow only when it
// tries to run one, in the consuming repo, after the bad ref has already been adopted.
//
// So canonical's `build` step is a parse of every file in `.github/workflows/`. It is the
// cheapest check that would have caught the failure class the reusables are most exposed to.
//
//   node .flow/bin/check-workflows.mjs [dir]     # default: .github/workflows
//
// Exits 0 when every file parsed, 1 otherwise — naming each offending file. An EMPTY directory
// is a failure, not a pass: a build that parses nothing and reports success is the silent-no-op
// failure the guards exist to prevent (see .flow/tasks/flow-0008).
//
// One dependency: `yaml`. Node has no YAML parser, and a hand-rolled indentation scan would be a
// parser that only looks like one — it would pass files a real loader rejects, which is worse
// than not checking. See the PR for flow-0004 for the justification.

import { readdirSync, readFileSync, realpathSync as __realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// --- main-module detection (do not simplify back to a string compare) -------------------
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED. When
// the script is reached through a symlink they differ, the comparison is false, and the CLI
// block below silently never runs — no output, exit 0, nothing to debug. Compare realpaths.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export const DEFAULT_WORKFLOW_DIR = ".github/workflows";

// Parse every *.yml / *.yaml in `dir`. Returns { checked: string[], failures: [{file, message}] }.
// Pure enough to test against a real temp directory — no process exit, no console.
export function checkWorkflows(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (e) {
    return { checked: [], failures: [{ file: dir, message: `cannot read workflow directory: ${e.message}` }] };
  }

  const files = names.filter((n) => /\.ya?ml$/.test(n)).sort();
  const checked = [];
  const failures = [];

  for (const name of files) {
    const file = join(dir, name);
    try {
      parseYaml(readFileSync(file, "utf8"));
      checked.push(file);
    } catch (e) {
      // First line only: the YAML loader's message carries a source excerpt underneath it,
      // and the file name is what the operator needs to act on.
      failures.push({ file, message: String(e.message).split("\n")[0] });
    }
  }

  if (files.length === 0) {
    failures.push({
      file: dir,
      message: "no workflow files found — build would report success having parsed nothing",
    });
  }

  return { checked, failures };
}

// ── CLI ──
if (__isMain) {
  const dir = resolve(process.argv[2] || DEFAULT_WORKFLOW_DIR);
  const { checked, failures } = checkWorkflows(dir);

  console.log(`check-workflows: ${checked.length} workflow file(s) parsed in ${dir}`);
  for (const f of failures) console.error(`::error file=${f.file}::${f.file}: ${f.message}`);
  if (failures.length) {
    console.error(`check-workflows: ${failures.length} file(s) failed to parse.`);
    process.exit(1);
  }
  process.exit(0);
}
