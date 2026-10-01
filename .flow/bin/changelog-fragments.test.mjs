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
import { changelogEntry } from "./changelog-entry.mjs";

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
  // Pending, the entry is `changes/flow-0069.md`; once a release has run `--assemble`, the
  // fragment is deleted by design and the entry lives in CHANGELOG.md. Either is the convention
  // working. Asserting only the file would make every release's own gate red.
  const pending = existsSync(join(REPO, FRAGMENT_DIR, "flow-0069.md"));
  const assembled = readFileSync(join(REPO, "CHANGELOG.md"), "utf8").includes("flow-0069). **No caller action**");
  assert.ok(pending || assembled,
    "flow-0069's own changelog entry must be a fragment (or an assembled one), or the convention starts with an exception");
  assert.ok(existsSync(join(REPO, FRAGMENT_DIR, "README.md")), "the convention must be documented where it lives");
  assert.equal(UNRELEASED, "## Unreleased");
});

// ── flow-0107: ONE test proves every task's changelog entry ────────────────────────────
//
// WHY THIS IS ONE TEST AND NOT ONE PER TASK. Almost every canonical task that ships something
// user-visible carries the same criterion — "`changes/<id>.md` exists and states the caller
// action" — and qa, rightly, wants a proving test for it. Nothing told the worker a test was
// owed, so flow-0098 (#129), flow-0101 (#134) and flow-0102 (#135) each failed qa on it and each
// fix was a near-identical hand-written one-off (they stay where they are; removing them is
// churn). The per-task copy IS the bug: the criterion is a property of the STORE, so it is
// provable once, for every task at once. The task-writer skill now names this test, by file and
// by the exact name below, as the proof — so a task declares the criterion and owes no new test.
//
// Entries are read through `changelogEntry` rather than by opening the fragment, because a
// release runs `--assemble`, which folds the fragment into `CHANGELOG.md` and DELETES it. A check
// that stats the file is green until the next release and red on the release's own PR.

const TASKS_DIR = join(REPO, ".flow", "tasks");

// The exact name the task-writer skill cites. Held as a constant and used as the test's name
// below, so the citation cannot drift from the test it names — the skill assertion compares
// against this same string.
const STORE_WIDE_TEST = "every claimed task that declares a changelog fragment has an entry stating its caller action";

// What a fragment has to say. Every entry in `changes/README.md`'s format states the caller
// action — "**No caller action**", or exactly what a caller must do — because that line is what
// a reader of the release notes scans for. An entry without it is an entry nobody can act on.
const CALLER_ACTION = /caller action/i;

// The statuses this check applies to, and the two it does not:
//   `ready`   — nothing has been written yet; the fragment is the worker's to write.
//   `blocked` — the work stopped before it shipped anything, and `blocked_reason` is its record.
// Everything else has been claimed and has either shipped or is about to. On a feature branch the
// task file is the frozen `in_progress` snapshot, which is exactly the state that makes the check
// apply: the PR that forgets its fragment is the one this catches.
//
// flow-0116: `done` is checked store-wide, because merged work has its fragment on main. The two
// in-flight statuses are checked ONLY for the task this checkout belongs to. Every PR's checkout
// carries main's store, where other tasks are claimed while their fragments still sit on their
// own branches, so checking those here failed every open PR whenever any task was in flight
// (#146 went red on flow-0114's missing fragment).
const IN_FLIGHT_STATUSES = new Set(["in_progress", "in_review"]);
const DONE_STATUS = "done";

// The task this checkout belongs to, from the `flow/<id>-<slug>` branch convention. The PR head
// branch first (a pull_request checkout is a detached merge commit), then the local branch.
// Neither, or a branch that names no task: "" — and only `done` tasks are checked.
function ownTaskId({ headRef = process.env.GITHUB_HEAD_REF, localBranch } = {}) {
  const fromBranch = (b) => (b || "").match(/^flow\/([a-z][a-z0-9]*-\d{4})(?:-|$)/)?.[1] ?? "";
  if (headRef) return fromBranch(headRef);
  if (localBranch === undefined) {
    try {
      localBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      localBranch = "";
    }
  }
  return fromBranch(localBranch);
}

// ── the store reader (local on purpose) ───────────────────────────────────────────────
// flow-doctor's `parseListField` is module-private and this task's `touches` do not include it,
// so the two tolerant readers below are deliberately duplicated rather than exported from there.
// Same two YAML forms, same `#`-comment and quote handling.

function frontmatter(text) {
  if (!text.startsWith("---")) return "";
  const end = text.indexOf("\n---", 3);
  return end === -1 ? "" : text.slice(3, end);
}

function scalarField(head, key) {
  const m = head.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return m ? m[1].replace(/\s+#.*$/, "").trim().replace(/^["'](.*)["']$/, "$1") : "";
}

// Both list forms: `touches: ["a", "b"]` and a `- ` block under `touches:`.
function listField(head, key) {
  const lines = head.split("\n");
  const i = lines.findIndex((l) => new RegExp(`^\\s*${key}:`).test(l));
  if (i === -1) return [];
  const inline = lines[i].replace(new RegExp(`^\\s*${key}:\\s*`), "").split("#")[0].trim();
  if (inline.startsWith("[")) return [...inline.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t === "" || t.startsWith("#")) continue;
    const m = t.match(/^-\s*(.+)$/);
    if (!m) break; // dedent to the next key → the list is done
    out.push(m[1].split("#")[0].trim().replace(/^["'](.*)["']$/, "$1"));
  }
  return out.filter(Boolean);
}

// Every finding, one line each, NAMING THE TASK ID — a failure that says "some task is missing a
// changelog entry" sends the reader back through the whole store to find out which.
// `tasksDir` and `repo` are arguments rather than constants so the criteria below can be proved
// against a fixture store, not only against the checkout the test happens to run in.
function changelogEntryFindings(tasksDir, repo, ownId = "") {
  const findings = [];
  const names = readdirSync(tasksDir).filter((n) => n.endsWith(".md") && n !== "_TEMPLATE.md").sort();

  for (const name of names) {
    const head = frontmatter(readFileSync(join(tasksDir, name), "utf8"));
    const id = scalarField(head, "id");
    if (!id) continue;
    const status = scalarField(head, "status");
    if (status !== DONE_STATUS && !(IN_FLIGHT_STATUSES.has(status) && id === ownId)) continue;
    if (!listField(head, "touches").includes(`${FRAGMENT_DIR}/${id}.md`)) continue;

    const entry = changelogEntry(repo, id);
    if (!entry.trim()) {
      findings.push(
        `${id}: declares ${FRAGMENT_DIR}/${id}.md in touches but has no changelog entry — ` +
        `neither the fragment nor an assembled entry in ${CHANGELOG_FILE}`,
      );
    } else if (!CALLER_ACTION.test(entry)) {
      findings.push(
        `${id}: has a changelog entry that never states a caller action — write ` +
        `"**No caller action**", or exactly what a caller must do`,
      );
    }
  }
  return findings;
}

// ── fixtures: a store and a repo that are not this checkout ───────────────────────────

function taskFileText({ id, status, touches = [] }) {
  return [
    "---",
    `id: "${id}"`,
    `title: "a task"`,
    `status: "${status}"`,
    "touches:",
    ...touches.map((t) => `  - "${t}"`),
    // A key AFTER the list: the reader must stop at the dedent, not swallow the rest of the block.
    "labels: [changelog]",
    "---",
    "",
    "## Context",
    "",
  ].join("\n");
}

// A tree with a `.flow/tasks/` store beside the `changes/` + CHANGELOG.md that `makeTree` builds.
// The `_TEMPLATE.md` it always writes is shaped to FAIL if it were ever read as a task, so
// "skip the template" is proved by every fixture rather than by one test.
function makeStore({ tasks = [], ...tree } = {}) {
  const root = makeTree(tree);
  const dir = join(root, ".flow", "tasks");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "_TEMPLATE.md"), taskFileText({
    id: "PROJ-0000", status: "in_progress", touches: ["changes/PROJ-0000.md"],
  }));
  for (const t of tasks) writeFileSync(join(dir, `${t.id}-slug.md`), taskFileText(t));
  return { root, tasksDir: dir };
}

test("a claimed task that declares a fragment and has no entry at all fails, naming the task id", () => {
  const { root, tasksDir } = makeStore({
    changelog: changelogText({ unreleased: "" }),
    tasks: [{ id: "flow-0500", status: "in_progress", touches: ["src/a.mjs", "changes/flow-0500.md"] }],
  });

  const findings = changelogEntryFindings(tasksDir, root, "flow-0500");
  assert.equal(findings.length, 1, `expected exactly one finding, got: ${findings.join(" | ")}`);
  assert.match(findings[0], /flow-0500/, "a finding that does not name the id sends the reader back through the store");
  assert.match(findings[0], /changes\/flow-0500\.md/);
  assert.match(findings[0], /no changelog entry/);

  // And it is the assertion the live test makes, not just a list someone could ignore.
  assert.throws(() => assert.deepEqual(findings, []), /flow-0500/);
});

test("a claimed task whose entry exists but never mentions a caller action fails", () => {
  const { root, tasksDir } = makeStore({
    tasks: [{ id: "flow-0501", status: "in_review", touches: ["changes/flow-0501.md"] }],
    fragments: { "flow-0501.md": "- **Something shipped** (`src/a.mjs`, flow-0501).\n\n  What it does.\n" },
  });

  const findings = changelogEntryFindings(tasksDir, root, "flow-0501");
  assert.equal(findings.length, 1, `expected exactly one finding, got: ${findings.join(" | ")}`);
  assert.match(findings[0], /flow-0501/);
  assert.match(findings[0], /never states a caller action/,
    "an entry with no caller-action line is an entry a reader of the release notes cannot act on");
});

test("flow-0116: another task in flight with no fragment is not a finding on this checkout", () => {
  // Its fragment is on its own branch until it merges; this PR cannot write it and should not owe it.
  const { root, tasksDir } = makeStore({
    tasks: [
      { id: "flow-0510", status: "in_progress", touches: ["changes/flow-0510.md"] },
      { id: "flow-0511", status: "in_review", touches: ["changes/flow-0511.md"] },
    ],
  });
  assert.deepEqual(changelogEntryFindings(tasksDir, root, "flow-0599"), []);
  assert.deepEqual(changelogEntryFindings(tasksDir, root, ""), [],
    "with no own task (a push to main, a local run off-branch) nothing in flight is checked");
});

test("flow-0116: a done task with no entry is a finding whichever checkout runs it", () => {
  const { root, tasksDir } = makeStore({
    tasks: [{ id: "flow-0512", status: "done", touches: ["changes/flow-0512.md"] }],
  });
  for (const own of ["", "flow-0599", "flow-0512"]) {
    const findings = changelogEntryFindings(tasksDir, root, own);
    assert.equal(findings.length, 1, `own=${JSON.stringify(own)}: ${findings.join(" | ")}`);
    assert.match(findings[0], /flow-0512/);
  }
});

test("flow-0116: the own task id comes from GITHUB_HEAD_REF first, then the local branch", () => {
  assert.equal(ownTaskId({ headRef: "flow/flow-0116-changelog-test-own-task-only", localBranch: "x" }), "flow-0116");
  assert.equal(ownTaskId({ headRef: "", localBranch: "flow/tanplan-0026-no-replit" }), "tanplan-0026");
  assert.equal(ownTaskId({ headRef: "release/v2.3.0", localBranch: "flow/flow-0001-x" }), "",
    "a PR head ref that names no task wins over the local branch: the checkout is that PR's");
  assert.equal(ownTaskId({ headRef: "", localBranch: "HEAD" }), "");
  assert.equal(ownTaskId({ headRef: "", localBranch: "main" }), "");
});

test("a `ready` task declaring a fragment that does not exist yet passes — nothing is written yet", () => {
  const { root, tasksDir } = makeStore({
    tasks: [{ id: "flow-0502", status: "ready", touches: ["changes/flow-0502.md"] }],
  });
  assert.deepEqual(changelogEntryFindings(tasksDir, root), [],
    "the fragment is the worker's to write; demanding it of a `ready` task would fail every task in the queue");
});

test("a task whose fragment a release already assembled into CHANGELOG.md passes", () => {
  // The release deleted `changes/flow-0503.md`; the entry now lives under a numbered section.
  // This is the case that makes a fragment-stat check red on the release's own PR, and it is why
  // the findings go through `changelogEntry`.
  const assembled =
    `${HEAD}## Unreleased\n${EXISTING}\n## 2.1.0 — 2026-09-20\n\n` +
    `- **Shipped and folded in** (\`src/a.mjs\`, flow-0503). **No caller action**.\n`;
  const { root, tasksDir } = makeStore({
    changelog: assembled,
    tasks: [{ id: "flow-0503", status: "done", touches: ["changes/flow-0503.md"] }],
  });

  assert.equal(existsSync(join(root, FRAGMENT_DIR, "flow-0503.md")), false, "the fixture must have no fragment left");
  assert.deepEqual(changelogEntryFindings(tasksDir, root), [],
    "an assembled entry is the convention working, not a missing one");
});

test("`_TEMPLATE.md` and a task with no id are skipped, and a task that declares no fragment is not asked for one", () => {
  // Every fixture's `_TEMPLATE.md` is in_progress and declares `changes/PROJ-0000.md`, so reading
  // it as a task would produce a finding for a file that is not a task.
  const { root, tasksDir } = makeStore({
    tasks: [{ id: "flow-0504", status: "done", touches: ["src/a.mjs"] }],
  });
  writeFileSync(join(tasksDir, "notes.md"), "no frontmatter here\n");
  writeFileSync(join(tasksDir, "headless.md"), "---\nstatus: \"done\"\ntouches:\n  - \"changes/x.md\"\n---\n");

  assert.deepEqual(changelogEntryFindings(tasksDir, root), [],
    "the template, an un-parseable file, and a task that ships nothing user-visible owe no entry");
});

test("the tolerant reader sees an inline `touches` array as well as a block list", () => {
  const { root, tasksDir } = makeStore({ tasks: [] });
  writeFileSync(join(tasksDir, "flow-0505-slug.md"),
    `---\nid: "flow-0505"\nstatus: "done"   # shipped\ntouches: ["src/a.mjs", "changes/flow-0505.md"]\nlabels: [x]\n---\n`);

  const findings = changelogEntryFindings(tasksDir, root);
  assert.equal(findings.length, 1, "the inline form is legal YAML and flow-doctor reads it; so must this");
  assert.match(findings[0], /flow-0505/);
});

// ── the criterion itself, against canonical's live store ──────────────────────────────

test(STORE_WIDE_TEST, () => {
  const findings = changelogEntryFindings(TASKS_DIR, REPO, ownTaskId());
  assert.deepEqual(findings, [],
    `${findings.length} task(s) declare a changelog fragment they never wrote, or wrote without a ` +
    `caller action:\n  ${findings.join("\n  ")}\n` +
    `Write ${FRAGMENT_DIR}/<id>.md (see ${FRAGMENT_DIR}/README.md for the format) — one bullet, ` +
    `naming the files and the task id, ending in "**No caller action**" or exactly what a caller must do.`);
});

test("the task-writer skill names this test, by file and by exact name, as the changelog proof", () => {
  const skill = readFileSync(join(REPO, "project-template/.claude/skills/task-writer/SKILL.md"), "utf8");

  assert.ok(skill.includes(".flow/bin/changelog-fragments.test.mjs"),
    "the skill must name the FILE — an orchestrator that cannot find the test writes a criterion with no proof");
  assert.ok(skill.includes(STORE_WIDE_TEST),
    `the skill must cite the test's exact name ("${STORE_WIDE_TEST}") — qa maps a criterion to its ` +
    `proving test BY NAME, so a paraphrase is the same miss this task exists to close`);

  // Stated conditionally, and about canonical specifically: an adopting repo has no `changes/`
  // directory and no such test, so an unconditional claim would be false for the whole fleet.
  assert.match(skill, /where the repo keeps a `changes\/` directory/i,
    "the instruction has to stay true in a repo with no changes/ directory");
  assert.ok(!/every repo has this test|this test exists in your repo/i.test(skill),
    "the skill must not claim the test exists in an adopting repo");
});
