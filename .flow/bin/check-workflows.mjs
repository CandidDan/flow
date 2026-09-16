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
//
// PARSING IS NOT ENOUGH (flow-0060). A file can be perfectly valid YAML and still be a workflow
// GitHub refuses to read, because GitHub validates a *schema* on top of the YAML. flow-0051
// shipped `workflows: write` in a `permissions:` block — valid YAML, not a permission that
// exists — and this build parsed it happily, four repos adopted it, and GitHub's parser then
// rejected the whole file with "Unexpected value 'workflows'". So this check now also validates
// the one part of that schema which is short, closed, public and rarely changes: the set of keys
// GITHUB_TOKEN's `permissions:` may name. That is a deliberate single exception, not the start
// of a reimplementation of GitHub's parser — see flow-0060's Scope section.

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

// Both of canonical's workflow trees, because both ship. `.github/workflows/` holds the reusables
// other repos call by reference; `project-template/.github/workflows/` holds the thin callers they
// COPY. flow-0060's invalid key sat in the second one and `build` never looked at it — the caller
// is published API just as much as the reusable is, and it is the file adopting repos end up
// owning. An explicit directory argument still overrides both.
export const DEFAULT_WORKFLOW_DIRS = Object.freeze([
  ".github/workflows",
  "project-template/.github/workflows",
]);

// GITHUB_TOKEN's `permissions:` keys. This list is CLOSED and public — GitHub's own workflow
// syntax documentation enumerates it — and a key outside it is not "unsupported", it is a parse
// error that stops the whole workflow from starting.
//
// `workflows` is deliberately ABSENT and must stay absent: that scope belongs to GitHub Apps and
// fine-grained PATs, never to GITHUB_TOKEN. It is also the reason GITHUB_TOKEN cannot push a file
// under `.github/workflows/` at all — the permission it would need is not grantable to it. When a
// workflow needs to push there, the fix is a credential (a fine-grained PAT with Workflows:
// Write, passed to `actions/checkout` as `token:`), never an entry in this list.
//
// If GitHub genuinely adds a permission, add it here in the same commit as the workflow that
// needs it, with the doc link in the PR. Do not add one speculatively: an entry here is this
// repo asserting the key exists, and that assertion is exactly what flow-0051 got wrong.
export const GITHUB_TOKEN_PERMISSIONS = Object.freeze([
  "actions",
  "attestations",
  "checks",
  "contents",
  "deployments",
  "discussions",
  "id-token",
  "issues",
  "models",
  "packages",
  "pages",
  "pull-requests",
  "repository-projects",
  "security-events",
  "statuses",
]);

// `permissions: read-all` / `write-all` set every scope at once and name no keys. Valid, and not
// something this check has an opinion about.
const PERMISSION_SHORTHANDS = Object.freeze(["read-all", "write-all"]);

const VALID_SET = new Set(GITHUB_TOKEN_PERMISSIONS);

/**
 * Invalid `permissions:` keys in one parsed workflow document.
 *
 * Checks every block GitHub honours: the workflow-level one and each job's. Only KEYS are
 * validated — values, and the rest of the workflow schema, are out of scope on purpose.
 *
 * Returns [{ where, key }], where `where` is the YAML path the operator has to go and edit.
 */
export function invalidPermissionKeys(doc) {
  if (!doc || typeof doc !== "object") return [];

  const blocks = [["permissions", doc.permissions]];
  const jobs = doc.jobs;
  if (jobs && typeof jobs === "object") {
    for (const [id, job] of Object.entries(jobs)) {
      if (job && typeof job === "object") blocks.push([`jobs.${id}.permissions`, job.permissions]);
    }
  }

  const bad = [];
  for (const [where, block] of blocks) {
    // Absent, `permissions:` with nothing after it, or `{}` — all mean "no keys to check".
    if (block === undefined || block === null) continue;
    // The all-scopes shorthands are strings, not mappings.
    if (typeof block === "string") {
      if (!PERMISSION_SHORTHANDS.includes(block)) bad.push({ where, key: block });
      continue;
    }
    if (typeof block !== "object") continue;
    for (const key of Object.keys(block)) {
      if (!VALID_SET.has(key)) bad.push({ where, key });
    }
  }
  return bad;
}

const permissionFailure = ({ where, key }, file) => ({
  file,
  message:
    `${where}: '${key}' is not a GITHUB_TOKEN permission. GitHub's parser rejects the whole ` +
    `workflow with "Unexpected value '${key}'", so it does not start at all. Valid keys: ` +
    `${GITHUB_TOKEN_PERMISSIONS.join(", ")}` +
    (key === "workflows"
      ? ". `workflows` is a GitHub App / fine-grained-PAT scope and cannot be granted to " +
        "GITHUB_TOKEN — that is WHY it may not push under .github/workflows/. Pass a PAT that " +
        "carries it to actions/checkout as `token:` instead (flow-0060)."
      : "."),
});

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
    let doc;
    try {
      doc = parseYaml(readFileSync(file, "utf8"));
    } catch (e) {
      // First line only: the YAML loader's message carries a source excerpt underneath it,
      // and the file name is what the operator needs to act on.
      failures.push({ file, message: String(e.message).split("\n")[0] });
      continue;
    }

    // Parsed, but GitHub may still refuse it. A file with an invented permission key is NOT
    // counted as checked — it would not run.
    const bad = invalidPermissionKeys(doc);
    if (bad.length) {
      for (const problem of bad) failures.push(permissionFailure(problem, file));
      continue;
    }
    checked.push(file);
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
  const dirs = process.argv[2] ? [process.argv[2]] : DEFAULT_WORKFLOW_DIRS;
  const checked = [];
  const failures = [];
  for (const d of dirs) {
    const r = checkWorkflows(resolve(d));
    checked.push(...r.checked);
    failures.push(...r.failures);
  }

  console.log(`check-workflows: ${checked.length} workflow file(s) parsed in ${dirs.join(", ")}`);
  for (const f of failures) console.error(`::error file=${f.file}::${f.file}: ${f.message}`);
  if (failures.length) {
    console.error(`check-workflows: ${failures.length} check(s) failed — see above.`);
    process.exit(1);
  }
  process.exit(0);
}
