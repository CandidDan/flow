// changelog-fragments.test.mjs — proving tests for the fragment convention (flow-0069).
//
// What is actually being proved here is a CONCURRENCY property, not a changelog one. The
// changelog is the symptom: `touches` overlap is how `pick-task` keeps two sessions out of the
// same files, so a path every task declares makes almost every task ineligible the moment one is
// claimed. The criterion for that lives in `project-template/.flow/bin/pick-task.test.mjs`,
// against the selector itself. Everything below is the machinery that makes the rule livable —
// the assembler that folds fragments back into one document at release time, and the three
// documents that carry the rule.
//
// The assembler's tests are written against BYTES, not against a parsed changelog. A fold that
// reformats the numbered sections below `## Unreleased` would be rewriting shipped release
// history, which is exactly what `release-stamp.test.mjs` exists to forbid — so the assertions
// are `assert.equal` on the untouched remainder, not "it still parses".

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleUnreleased,
  canonicalRepoRoot,
  CHANGELOG_FILE,
  compareFragmentNames,
  defaultIO,
  fragmentBody,
  fragmentNames,
  FRAGMENT_DIR,
  FRAGMENT_NAME,
  main,
  MissingUnreleasedError,
  readFragments,
  reportAndExit,
  runAssemble,
  runCheck,
  UNRELEASED,
} from "./changelog-fragments.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const SELF = join(BIN, "changelog-fragments.mjs");

// ── fixtures ───────────────────────────────────────────────────────────────────────────

const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

// A changelog shaped like canonical's: a preamble, a populated `## Unreleased`, and numbered
// sections that are immutable history. The numbered half is the byte-identity assertion's target.
const HEAD = "# Flow — CHANGELOG\n\nPreamble that is not a section.\n\n";
const EXISTING = "\n- **An entry that was already here** (flow-0100).\n\n  A second paragraph.\n";
const RELEASED = "\n## 2.0.0 — 2026-09-01\n\n- **Shipped, and immutable** (flow-0001).\n";

function changelogText({ unreleased = EXISTING } = {}) {
  return `${HEAD}## Unreleased\n${unreleased}${RELEASED}`;
}

// A real tree on disk: `CHANGELOG.md` plus a `changes/` directory holding `fragments`
// ({ name -> text }) and always the README, which must survive assembly.
function makeTree({ changelog = changelogText(), fragments = {}, readme = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "flow-frag-"));
  dirs.push(root);
  if (changelog !== null) writeFileSync(join(root, CHANGELOG_FILE), changelog);
  if (readme || Object.keys(fragments).length) {
    mkdirSync(join(root, FRAGMENT_DIR), { recursive: true });
    if (readme) writeFileSync(join(root, FRAGMENT_DIR, "README.md"), "# the convention\n");
    for (const [name, text] of Object.entries(fragments)) {
      writeFileSync(join(root, FRAGMENT_DIR, name), text);
    }
  }
  return root;
}

const read = (root, ...p) => readFileSync(join(root, ...p), "utf8");

// ── Criterion: two fragments fold in ascending id order, above the existing entry, and the
//    rest of the file is byte-identical ────────────────────────────────────────────────

test("--assemble folds fragments under `## Unreleased` in ascending id order, above what is there", () => {
  const root = makeTree({
    fragments: {
      // Written out of order on purpose: the ORDER is the criterion, and readdir order is not it.
      "flow-0102.md": "- **Second by id** (flow-0102).\n",
      "flow-0101.md": "- **First by id** (flow-0101).\n",
    },
  });

  const result = runAssemble(root);
  assert.equal(result.assembled, true);
  const after = read(root, CHANGELOG_FILE);

  assert.equal(
    after,
    `${HEAD}## Unreleased\n\n- **First by id** (flow-0101).\n\n- **Second by id** (flow-0102).\n${EXISTING}${RELEASED}`,
    "fragments must land directly under the heading, 0101 before 0102, above the existing entry",
  );

  // The two halves the fold must not have touched, asserted as bytes rather than by re-parsing.
  assert.ok(after.endsWith(EXISTING + RELEASED),
    "the existing Unreleased entry and every numbered section must be byte-identical");
  assert.ok(after.startsWith(HEAD), "the preamble must be byte-identical");

  // Both fragments gone, README untouched.
  assert.equal(existsSync(join(root, FRAGMENT_DIR, "flow-0101.md")), false, "fragment 0101 must be deleted");
  assert.equal(existsSync(join(root, FRAGMENT_DIR, "flow-0102.md")), false, "fragment 0102 must be deleted");
  assert.equal(read(root, FRAGMENT_DIR, "README.md"), "# the convention\n",
    "README.md is documentation, not a fragment — assembly must leave it exactly as it found it");
});

test("ordering is numeric, not lexical — flow-9999 folds before flow-10000", () => {
  const root = makeTree({
    fragments: { "flow-10000.md": "- ten thousand\n", "flow-9999.md": "- nine nine nine nine\n" },
  });
  runAssemble(root);
  const after = read(root, CHANGELOG_FILE);
  assert.ok(after.indexOf("nine nine") < after.indexOf("ten thousand"),
    "a lexical sort puts flow-10000 first; the ids are what make the order stable");
});

// ── Criterion: no fragments → byte-identical, and it says so ──────────────────────────

test("--assemble with no fragments leaves CHANGELOG.md byte-identical and reports nothing assembled", () => {
  const before = changelogText();
  const root = makeTree({ changelog: before });

  const result = runAssemble(root);

  assert.equal(read(root, CHANGELOG_FILE), before, "an empty fold must not rewrite a single byte");
  assert.equal(result.assembled, false);
  assert.deepEqual(result.fragments, []);
  assert.match(result.lines.join("\n"), /no pending fragments/,
    "silence would read as 'assembled' — it has to say nothing was");
});

test("a repo with no `changes/` directory at all assembles cleanly and says nothing was pending", () => {
  const root = makeTree({ readme: false });
  const result = runAssemble(root);
  assert.equal(result.assembled, false);
  assert.equal(read(root, CHANGELOG_FILE), changelogText());
});

// ── Criterion: missing `## Unreleased` → non-zero, nothing modified, nothing deleted ──

test("--assemble on a changelog with no `## Unreleased` writes nothing and deletes nothing", () => {
  const noHeading = `${HEAD}## 2.0.0 — 2026-09-01\n\n- shipped\n`;
  const root = makeTree({
    changelog: noHeading,
    fragments: { "flow-0101.md": "- **First** (flow-0101).\n" },
  });

  assert.throws(() => runAssemble(root), MissingUnreleasedError,
    "inventing the heading would put the notes where the release fold never looks");

  assert.equal(read(root, CHANGELOG_FILE), noHeading, "the changelog must be untouched");
  assert.equal(read(root, FRAGMENT_DIR, "flow-0101.md"), "- **First** (flow-0101).\n",
    "a half-assembled release — fragments deleted, no entries to show for them — is unrecoverable");
});

test("the CLI exits non-zero on a missing `## Unreleased`, and zero on a good tree", () => {
  const bad = makeTree({
    changelog: `${HEAD}## 2.0.0\n\n- shipped\n`,
    fragments: { "flow-0101.md": "- x\n" },
  });
  const errs = [];
  let code = null;
  main(["--assemble"], { root: bad, log: () => {}, error: (m) => errs.push(m), exit: (c) => { code = c; } });
  assert.equal(code, 1, "a guard that exits 0 having refused to act reports enforcement it did not perform");
  assert.match(errs.join("\n"), /## Unreleased/);

  const good = makeTree({ fragments: { "flow-0101.md": "- x\n" } });
  code = null;
  main(["--assemble"], { root: good, log: () => {}, error: () => {}, exit: (c) => { code = c; } });
  assert.equal(code, 0);
});

// ── Criterion: --check lists the pending fragments and modifies no file ───────────────

test("--check lists each pending fragment path and modifies no file", () => {
  const before = changelogText();
  const root = makeTree({
    changelog: before,
    fragments: { "flow-0102.md": "- b\n", "flow-0101.md": "- a\n" },
  });
  const snapshot = readdirSync(join(root, FRAGMENT_DIR)).sort();

  const result = runCheck(root);
  const out = result.lines.join("\n");

  assert.match(out, /changes\/flow-0101\.md/);
  assert.match(out, /changes\/flow-0102\.md/);
  assert.match(out, /2 pending fragment\(s\)/);
  assert.equal(result.fragments.length, 2);

  assert.equal(read(root, CHANGELOG_FILE), before, "--check must never write");
  assert.deepEqual(readdirSync(join(root, FRAGMENT_DIR)).sort(), snapshot, "--check must never delete");
});

test("--check on a clean tree says there is nothing to assemble, and never opens the changelog", () => {
  // No CHANGELOG.md at all: --check must not depend on it, or a changelog problem would be
  // reported by the command whose whole job is to say what is pending.
  const root = makeTree({ changelog: null });
  const result = runCheck(root);
  assert.deepEqual(result.fragments, []);
  assert.match(result.lines.join("\n"), /no pending fragments/);
});

// ── the pure core, and the pieces the criteria lean on ────────────────────────────────

test("README.md is not a fragment — a looser pattern would delete the documentation", () => {
  assert.equal(FRAGMENT_NAME.test("README.md"), false);
  assert.equal(FRAGMENT_NAME.test("notes.md"), false);
  assert.equal(FRAGMENT_NAME.test("flow-0069.md"), true);
  assert.equal(FRAGMENT_NAME.test("CAN-42.md"), true, "the convention is any repo's task-id shape");
  assert.equal(FRAGMENT_NAME.test("flow-0069.txt"), false);
  assert.deepEqual(
    fragmentNames(["README.md", "flow-0102.md", "notes.md", "flow-0101.md"]),
    ["flow-0101.md", "flow-0102.md"],
  );
});

test("compareFragmentNames orders by the id's number, then breaks ties lexically", () => {
  assert.ok(compareFragmentNames("flow-0101.md", "flow-0102.md") < 0);
  assert.ok(compareFragmentNames("flow-10000.md", "flow-9999.md") > 0);
  assert.ok(compareFragmentNames("a-7.md", "b-7.md") < 0);
});

test("fragmentBody collapses trailing blank lines to exactly one newline", () => {
  assert.equal(fragmentBody("- entry\n\n\n"), "- entry\n");
  assert.equal(fragmentBody("- entry"), "- entry\n");
  assert.equal(fragmentBody("  - indented\n"), "  - indented\n", "the author's own indentation is theirs");
});

test("assembleUnreleased returns the input unchanged when there is nothing to insert", () => {
  const text = changelogText();
  assert.equal(assembleUnreleased(text, []), text);
});

test("assembleUnreleased handles an EMPTY `## Unreleased` and one that ends the file", () => {
  const empty = `${HEAD}## Unreleased\n${RELEASED}`;
  assert.equal(
    assembleUnreleased(empty, [{ text: "- new\n" }]),
    `${HEAD}## Unreleased\n\n- new\n${RELEASED}`,
    "the state right after a release is legal and must still take a fold",
  );

  const atEof = `${HEAD}## Unreleased`;
  assert.equal(assembleUnreleased(atEof, [{ text: "- new\n" }]), `${HEAD}## Unreleased\n\n- new\n`,
    "an unterminated heading line must be terminated before inserting, not concatenated onto");
});

test("`## Unreleased` inside an entry is not mistaken for the section heading", () => {
  const quoted = `${HEAD}Talking about \`## Unreleased\` mid-sentence.\n\n## Unreleased\n${EXISTING}`;
  const out = assembleUnreleased(quoted, [{ text: "- new\n" }]);
  assert.ok(out.startsWith(`${HEAD}Talking about \`## Unreleased\` mid-sentence.\n\n## Unreleased\n\n- new\n`),
    "the heading is matched as a whole line; a mention inside prose must not attract the fold");
});

test("readFragments returns [] for a missing directory rather than crashing", () => {
  const root = makeTree({ readme: false });
  assert.deepEqual(readFragments(root), []);
});

test("defaultIO is the real filesystem, and runAssemble accepts an injected one", () => {
  const io = defaultIO();
  assert.equal(typeof io.readdir, "function");

  // Injected IO, no filesystem at all: proves the branches above are reachable without a tree.
  const files = new Map([["/x/CHANGELOG.md", changelogText()], ["/x/changes/flow-0101.md", "- injected\n"]]);
  const removed = [];
  const fake = {
    readdir: () => ["README.md", "flow-0101.md"],
    read: (f) => files.get(f.split("\\").join("/")),
    write: (f, t) => files.set(f.split("\\").join("/"), t),
    remove: (f) => removed.push(f.split("\\").join("/")),
  };
  const result = runAssemble("/x", { io: fake });
  assert.equal(result.assembled, true);
  assert.match(files.get("/x/CHANGELOG.md"), /- injected/);
  assert.deepEqual(removed, ["/x/changes/flow-0101.md"]);
});

test("reportAndExit prints every line and exits 0", () => {
  const lines = [];
  let code = null;
  reportAndExit({ lines: ["a", "b"] }, { log: (l) => lines.push(l), exit: (c) => { code = c; } });
  assert.deepEqual(lines, ["a", "b"]);
  assert.equal(code, 0);
});

test("the CLI refuses to guess: neither flag is a usage error, not a silent assembly", () => {
  const errs = [];
  let code = null;
  main([], { root: makeTree(), log: () => {}, error: (m) => errs.push(m), exit: (c) => { code = c; } });
  assert.equal(code, 1);
  assert.match(errs.join("\n"), /--check \| --assemble/);
});

test("canonicalRepoRoot resolves THIS repo — the store beside it must be canonical's", () => {
  assert.equal(canonicalRepoRoot(), REPO);
  assert.ok(existsSync(join(canonicalRepoRoot(), CHANGELOG_FILE)),
    "canonical is the only repo with a CHANGELOG.md for this command to assemble");
});

test("the CLI block actually runs against this checkout — silence is the symlink failure", () => {
  // A main-module check done as a string compare goes false through a symlink, the CLI never
  // runs, and `--assemble` exits 0 having folded nothing. Spawn it and require real output.
  const out = execFileSync(process.execPath, [SELF, "--check"], { cwd: tmpdir(), encoding: "utf8" });
  assert.match(out, /changelog-fragments:/,
    "no output means the CLI block did not run — see the main-module comment in the module");
});

// ── the rule is carried by the three documents, and cannot be silently edited out ─────

test("the release policy names the fragment path and the --assemble step", () => {
  const policy = readFileSync(join(REPO, "docs/flow-versioning-policy.md"), "utf8");
  assert.match(policy, /changes\/<task-id>\.md/,
    "the release procedure must name the fragment path, or step 2 sends people back to CHANGELOG.md");
  assert.match(policy, /changelog-fragments\.mjs --assemble/,
    "a fragment convention with no documented assembly step loses the notes at the next release");
});

test("PROTOCOL.md carries the fragment rule, stated conditionally", () => {
  const protocol = readFileSync(join(REPO, "project-template/.flow/PROTOCOL.md"), "utf8");
  assert.match(protocol, /changes\/<task-id>\.md/,
    "the protocol is the one file every worker reads; the rule has to be in it");
  assert.match(protocol, /no `changes\/` directory/,
    "consuming repos have no changes/ directory — an unconditional rule would be false for the fleet");
});

test("the task-writer skill tells the orchestrator to declare the fragment, never CHANGELOG.md", () => {
  const skill = readFileSync(join(REPO, "project-template/.claude/skills/task-writer/SKILL.md"), "utf8");
  assert.match(skill, /changes\/<id>\.md/,
    "the orchestrator writes `touches`; if the skill does not say this, every new task re-creates the jam");
  assert.match(skill, /never `CHANGELOG\.md`/);
});

test("canonical dogfoods its own convention: this change's entry is a fragment", () => {
  assert.ok(existsSync(join(REPO, FRAGMENT_DIR, "flow-0069.md")),
    "flow-0069's own changelog entry must be a fragment, or the convention starts with an exception");
  assert.ok(existsSync(join(REPO, FRAGMENT_DIR, "README.md")), "the convention must be documented where it lives");
  assert.equal(UNRELEASED, "## Unreleased");
});
