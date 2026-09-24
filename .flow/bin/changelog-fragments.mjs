#!/usr/bin/env node
// changelog-fragments.mjs — fold `changes/<task-id>.md` into `CHANGELOG.md`, and nothing else.
//
// NOT AN ADAPTER. Most files in this directory are thin shells over `project-template/.flow/bin/`
// (see parse-task-id.mjs for why). This one is canonical-only, like release-publish.mjs and
// check-workflows.mjs: `CHANGELOG.md` is canonical's own file, an adopting repo has neither it nor
// a `changes/` directory, and shipping every adopter an assembler aimed at a changelog they do not
// have would be handing them a command that can only ever fail.
//
// WHAT IT EXISTS TO PREVENT, and it is not a changelog problem. `touches` is how `pick-task` keeps
// two sessions out of the same files: a `ready` task whose `touches` overlap an `in_progress`
// task's is skipped. `CHANGELOG.md` is append-only, so every task that changed anything declared
// it — and a path in every task's `touches` makes almost every task ineligible the moment any one
// of them is claimed. Measured on canonical on 2026-09-23: 12 of 23 open tasks listed it,
// including 9 of the 13 `ready` ones. The queue was serialised behind a file nobody ever edits in
// conflict with anyone, only appends to. One fragment per task removes the overlap entirely.
//
// WHY IT INSERTS RATHER THAN WRITING A SECTION. Assembly puts the fragments under the EXISTING
// `## Unreleased` heading, above whatever is already there. It does not create a numbered section
// and it does not touch `## Unreleased` itself. Two things depend on that: the release fold in
// `docs/flow-versioning-policy.md` is still the human's step, and `release-stamp.test.mjs` pins
// `## Unreleased` as a permanent property of the file. A missing heading is therefore a hard
// failure, not something to synthesise — synthesising it would put the notes somewhere the
// release fold never looks.
//
//   node .flow/bin/changelog-fragments.mjs --check      # list pending fragments; writes nothing
//   node .flow/bin/changelog-fragments.mjs --assemble   # fold them in, then delete them
//
// `--assemble` edits a doc, so it belongs on a release branch and goes through a PR like any
// other code change — never a direct commit to `main`. Exits 1 on failure, 0 otherwise.
// Zero dependencies.

import {
  readdirSync as __readdirSync,
  readFileSync as __readFileSync,
  realpathSync as __realpathSync,
  rmSync as __rmSync,
  writeFileSync as __writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import {
  compareFragmentNames,
  FRAGMENT_DIR,
  FRAGMENT_NAME,
  parseFlags,
} from "../../project-template/.flow/bin/release-guard.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED. Reached
// through a symlink they differ, the comparison is false, and the CLI block silently never runs —
// no output, exit 0, nothing to debug. Here that means `--assemble` reports success having folded
// nothing, and the release is then cut on a tree the guard will refuse. Compare realpaths.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export { FRAGMENT_DIR, FRAGMENT_NAME, compareFragmentNames };

// The heading fragments are folded under. Matched as a whole line so a mention of `## Unreleased`
// inside an entry cannot be mistaken for the section itself.
export const UNRELEASED = "## Unreleased";
const UNRELEASED_LINE = /^## Unreleased[ \t]*(\r?\n|$)/m;

export const CHANGELOG_FILE = "CHANGELOG.md";

// Thrown when the changelog has no `## Unreleased` heading. A distinct type so the CLI can report
// it as the one recoverable failure ("add the heading back") rather than as a crash, and so a test
// can assert the failure mode without matching on message text.
export class MissingUnreleasedError extends Error {
  constructor(path = CHANGELOG_FILE) {
    super(
      `${path} has no \`${UNRELEASED}\` heading, so there is nowhere to fold the fragments that ` +
      `would not invent a section. Nothing was written and no fragment was deleted. Restore the ` +
      `heading (release-stamp.test.mjs pins it as a permanent property of the file) and re-run.`,
    );
    this.name = "MissingUnreleasedError";
    this.path = path;
  }
}

// ── pure ───────────────────────────────────────────────────────────────────────────────

// The fragment files among a directory listing, ascending by task id. `README.md` documents the
// convention and lives in that directory permanently; it is not a fragment and is never returned.
export function fragmentNames(entries = []) {
  return entries.filter((n) => FRAGMENT_NAME.test(n)).sort(compareFragmentNames);
}

// A fragment's body as it will appear in the changelog: trailing blank lines collapsed to exactly
// one newline. Leading whitespace is left alone — a fragment is a top-level bullet and its own
// indentation is the author's, not ours to normalise.
export function fragmentBody(text = "") {
  return `${String(text).replace(/\s+$/, "")}\n`;
}

// Insert `fragments` (in the order given) directly under `## Unreleased`, above anything already
// there. Returns the new text. Throws MissingUnreleasedError when the heading is absent, and
// returns the input UNCHANGED — the identical string object — when there is nothing to insert.
//
// Index arithmetic rather than split/join on purpose: every byte outside the inserted block is
// carried across verbatim, so the numbered sections below cannot be reformatted by accident.
export function assembleUnreleased(changelog, fragments = [], path = CHANGELOG_FILE) {
  const m = UNRELEASED_LINE.exec(changelog);
  if (!m) throw new MissingUnreleasedError(path);
  if (!fragments.length) return changelog;

  const nl = m[1] && m[1].includes("\r") ? "\r\n" : "\n";
  const at = m.index + m[0].length;
  // When the heading is the very last line with no terminator, supply one before inserting.
  const terminator = m[1] ? "" : nl;
  const block = nl + fragments.map((f) => fragmentBody(f.text)).join(nl);

  return changelog.slice(0, at) + terminator + block + changelog.slice(at);
}

// ── IO, injected so every branch above is exercisable without a filesystem ──────────────

export function defaultIO() {
  return {
    readdir: (dir) => __readdirSync(dir),
    read: (file) => __readFileSync(file, "utf8"),
    write: (file, text) => __writeFileSync(file, text),
    remove: (file) => __rmSync(file),
  };
}

// Every pending fragment, as `{ name, path, text }`, ascending by task id. A missing `changes/`
// directory is an empty list, not a crash: that is what a consuming repo looks like, and what
// canonical looks like immediately after a release.
export function readFragments(root, { io = defaultIO(), dir = FRAGMENT_DIR } = {}) {
  const full = join(root, dir);
  let entries;
  try {
    entries = io.readdir(full);
  } catch {
    return [];
  }
  return fragmentNames(entries).map((name) => ({
    name,
    path: `${dir}/${name}`,
    file: join(full, name),
    text: io.read(join(full, name)),
  }));
}

// `--check`: what is pending. Reads the fragments and nothing else — it never opens the changelog,
// so it cannot fail on a changelog problem it is not being asked about.
export function runCheck(root, { io = defaultIO(), dir = FRAGMENT_DIR } = {}) {
  const fragments = readFragments(root, { io, dir });
  const lines = fragments.length
    ? [
      `changelog-fragments: ${fragments.length} pending fragment(s) in \`${dir}/\``,
      ...fragments.map((f) => `  ${f.path}`),
    ]
    : [`changelog-fragments: no pending fragments in \`${dir}/\` — nothing to assemble.`];
  return { fragments, lines, ok: true };
}

// `--assemble`: fold, then delete. Reads everything and computes the whole new changelog BEFORE
// writing a single byte, so the missing-heading failure leaves the tree exactly as it found it —
// a half-assembled release, with some fragments deleted and no entries to show for them, is not
// recoverable from the working tree.
export function runAssemble(root, {
  io = defaultIO(),
  dir = FRAGMENT_DIR,
  changelog = CHANGELOG_FILE,
} = {}) {
  const changelogFile = join(root, changelog);
  const fragments = readFragments(root, { io, dir });
  const before = io.read(changelogFile);

  const after = assembleUnreleased(before, fragments, changelog);   // throws before any write

  if (!fragments.length) {
    return {
      fragments,
      assembled: false,
      lines: [`changelog-fragments: no pending fragments in \`${dir}/\` — ${changelog} unchanged.`],
    };
  }

  io.write(changelogFile, after);
  for (const f of fragments) io.remove(f.file);

  return {
    fragments,
    assembled: true,
    lines: [
      `changelog-fragments: folded ${fragments.length} fragment(s) into \`${UNRELEASED}\` and ` +
      `removed them`,
      ...fragments.map((f) => `  ${f.path}`),
    ],
  };
}

// Canonical's repo root — two levels up from this `bin/` directory (`.flow/bin` -> `.flow` -> repo).
// Resolved from this file's realpath so the command is correct from any working directory.
export function canonicalRepoRoot(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..", "..");
}

// Print the report and exit. Kept out of the CLI block so the wording is assertable without
// spawning a process.
export function reportAndExit(result, { log = console.log, exit = process.exit } = {}) {
  for (const line of result.lines) log(line);
  exit(0);
}

// ── CLI ── argument passing only; every decision above is in an exported, tested function.
export function main(argv, { root = canonicalRepoRoot(), io = defaultIO(), log = console.log, error = console.error, exit = process.exit } = {}) {
  const f = parseFlags(argv);
  if (f.assemble !== true && f.check !== true) {
    error("usage: changelog-fragments.mjs --check | --assemble");
    return exit(1);
  }
  try {
    const result = f.assemble === true ? runAssemble(root, { io }) : runCheck(root, { io });
    return reportAndExit(result, { log, exit });
  } catch (err) {
    error(`::error::changelog-fragments: ${err.message}`);
    return exit(1);
  }
}

if (__isMain) main(process.argv.slice(2));
