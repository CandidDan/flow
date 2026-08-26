#!/usr/bin/env node
// allocate-task-id.mjs — canonical's adapter over the template's allocate-task-id.
//
// See parse-task-id.mjs in this directory for why canonical adapts rather than copies, and
// flow-doctor.mjs for why the store location has to be supplied here.
//
// The one thing this file supplies that the template's CLI cannot is WHICH repo to allocate
// against: `allocateTaskId` takes `repoRoot` as a required argument (never defaults it — see
// the template file for why a wrong default here is silent and expensive), and this adapter
// resolves it to canonical's own root rather than `project-template/`. It also fills in
// `--prefix` from THIS repo's `.flow/config.yml` (`project.name: "flow"`) when the caller
// omits it, so `node .flow/bin/allocate-task-id.mjs --dry-run` works with no flags at all.
//
//   node .flow/bin/allocate-task-id.mjs --dry-run
//   node .flow/bin/allocate-task-id.mjs --write --content-file draft.md --slug my-new-task
//
// WRITES TO `main` BY DESIGN, exactly like the template — never invoke --write from a branch.

import { realpathSync as __realpathSync } from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { runCli } from "../../project-template/.flow/bin/allocate-task-id.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export {
  AllocationError, SLUG_RE, allocateTaskId, assertInsideTasksDir, buildContentFromFile, idWidth,
  nextId, readIdsFromOrigin, runCli,
} from "../../project-template/.flow/bin/allocate-task-id.mjs";

// Canonical's repo root — two levels up from this `bin/` directory (`.flow/bin` -> `.flow` -> repo).
export function canonicalRepoRoot(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..", "..");
}

// The `project.name` line out of canonical's own `.flow/config.yml`, without a YAML dependency
// — same tolerant-line-scan house style as flow-doctor's `parseSourceRoots`. Returns "" (not a
// guess) when the file or the field is missing, so a caller that needs it can fail loudly
// rather than allocate under a silently wrong prefix.
export function canonicalProjectName(root = canonicalRepoRoot()) {
  const configPath = join(root, ".flow", "config.yml");
  if (!existsSync(configPath)) return "";
  const lines = readFileSync(configPath, "utf8").split("\n");
  const start = lines.findIndex((l) => /^project:/.test(l));
  if (start === -1) return "";
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break; // dedent to a new top-level key -> block done
    const m = lines[i].trim().match(/^name:\s*(.+)$/);
    if (m) return m[1].split("#")[0].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return "";
}

// ── CLI ──
if (__isMain) {
  const repoRoot = canonicalRepoRoot();
  const argv = process.argv.slice(2);
  if (!argv.includes("--prefix")) {
    const name = canonicalProjectName(repoRoot);
    if (name) argv.push("--prefix", name);
  }
  process.exit(runCli(argv, { cwd: repoRoot }));
}
