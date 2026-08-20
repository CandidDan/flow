#!/usr/bin/env node
// release-guard.mjs — canonical's adapter over the template's release-guard.
//
// `.github/workflows/release-tag.yml` runs `node .flow/bin/release-guard.mjs` before it moves
// the edge alias. See parse-task-id.mjs in this directory for why canonical adapts rather than
// copies, and flow-doctor.mjs for why the paths have to be supplied here.
//
// The one thing this file supplies that the template's CLI cannot is WHICH repo and WHICH two
// stamps. The template resolves nothing from its own location on purpose (it defaults to
// `process.cwd()`), so run from the wrong directory it would happily check some other tree.
// Resolving the repo root from *this* file's realpath pins it to canonical — the only repo
// that has both a root `VERSION` and a `project-template/.flow/VERSION` to hold together.
//
// Not a copy and NOT a symlink: a symlink resolves the root two levels up from the *template's*
// bin directory, which is `project-template/` — the fixture store, which has a `.flow/VERSION`
// and no root `VERSION` at all. Every command would still exit 0. That is the failure mode
// CLAUDE.md names, and for a guard it means failing open.
//
//   node .flow/bin/release-guard.mjs [--tag <name>] [--main <ref>] [--json]
//
// Exits 1 on problems, 0 otherwise. Warnings report and never fail — moving `v1` is a
// deliberate human step, and a release gate that fails on one just gets bypassed.

import { realpathSync as __realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import {
  makeGitRunner,
  parseFlags,
  reportAndExit,
  runReleaseGuard,
  ROOT_VERSION_PATH,
  TEMPLATE_VERSION_PATH,
} from "../../project-template/.flow/bin/release-guard.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// A guard whose CLI block never runs reports enforcement it did not perform. See the template
// file's header for the full mechanism.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// The public surface, re-exported rather than reimplemented — same posture as the other
// adapters. Deliberately not the low-level git helpers: nothing here needs them, and an
// adapter that re-exports everything invites a second implementation drifting in later.
export {
  checkRelease,
  collectFacts,
  formatReport,
  runReleaseGuard,
  RELEASE_TAG,
  SEMVER,
} from "../../project-template/.flow/bin/release-guard.mjs";

// Canonical's repo root — two levels up from this `bin/` directory (`.flow/bin` -> `.flow` -> repo).
export function canonicalRepoRoot(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..", "..");
}

// The two stamps canonical must hold together, as repo-relative paths (every read goes through
// `git show <ref>:<path>`) and as absolute files (so a test can assert which tree they are in).
export function canonicalVersionFiles(root = canonicalRepoRoot()) {
  return {
    root,
    rootPath: ROOT_VERSION_PATH,
    templatePath: TEMPLATE_VERSION_PATH,
    rootFile: join(root, ROOT_VERSION_PATH),
    templateFile: join(root, TEMPLATE_VERSION_PATH),
  };
}

// ── CLI ──
if (__isMain) {
  const f = parseFlags(process.argv.slice(2));
  const { root, rootPath, templatePath } = canonicalVersionFiles();
  reportAndExit(runReleaseGuard({
    git: makeGitRunner(root),
    tag: typeof f.tag === "string" ? f.tag : (process.env.GITHUB_REF_NAME || ""),
    mainRef: typeof f.main === "string" ? f.main : "HEAD",
    aliasRef: typeof f.alias === "string" ? f.alias : null,
    rootPath,
    templatePath,
  }), { json: f.json === true });
}
