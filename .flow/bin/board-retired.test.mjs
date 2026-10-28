// board-retired.test.mjs — proving tests for flow-0164: the board is retired fleet-wide.
//
// Two halves, and they fail in different places:
//
//   * THE TEMPLATE. Nothing under `project-template/` may still tell a session to regenerate,
//     read or edit a board. The scan is over every TRACKED file (the store excepted), so a stale
//     pointer in a doc fails here, naming the file, instead of in some adopter's next session.
//   * THE SYNC. flow-sync mirrors only canonical-named skill directories, so deleting the skill in
//     the template leaves a stale copy in every adopter. `_flow-sync.yml` therefore deletes a
//     short, literal list of retired paths. Because that step runs in every adopter, it is held to
//     two things: the list is exactly what this task retires, and the step can delete nothing
//     else — no glob, no variable, no path outside the checkout. The region is lifted out of the
//     shipped workflow and EXECUTED, so the behaviour asserted is the real step's, not a paraphrase.
//
// Canonical's own test: `_flow-sync.yml` exists only here. Reads the workflow as text, so it needs
// no `yaml` install and runs in the flow-tooling job too.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { prContent } from "../../project-template/.flow/bin/flow-sync.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-sync.yml");

// What flow-0164 retires, written out rather than read from the workflow: a pin derived from the
// thing it pins moves with it and pins nothing. flow-0174 appended the retired queue-runner's
// caller to the same list — one mechanism, not two; its own tests are in flow-sync.test.mjs.
const BOARD = [".claude/skills/board-builder/", ".flow/board.html"];
const RETIRED = [...BOARD, ".github/workflows/flow-queue-runner.yml"];

// Built from parts so this file's own source is not a match for the strings it forbids.
const FORBIDDEN = new RegExp(["board" + "-builder", "board\\." + "html", "regenerate the " + "board"].join("|"), "i");

const readReusable = () => readFileSync(REUSABLE, "utf8");

// ── the template ──────────────────────────────────────────────────────────────────────────

/** Every tracked file under project-template/, minus the store. */
const templateFiles = () =>
  execFileSync("git", ["ls-files", "-z", "--", "project-template"], { cwd: REPO, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((p) => !p.startsWith("project-template/.flow/tasks/"))
    .filter((p) => existsSync(join(REPO, p)));

/** The files whose content still names the board. Pure, so a mutated input proves it can fail. */
export const boardMentions = (files) =>
  files.filter(({ text }) => FORBIDDEN.test(text)).map(({ path }) => path);

test("no tracked file under project-template/ names the retired board", () => {
  const files = templateFiles();
  assert.ok(files.length > 50, `the scan found only ${files.length} files — an empty scan is not a pass`);
  const offenders = boardMentions(files.map((path) => ({ path, text: readFileSync(join(REPO, path), "utf8") })));
  assert.deepEqual(offenders, [],
    `these still mention the retired board (board-builder, the board file, or "regenerate the board"): ` +
    offenders.join(", "));
});

test("the scan catches each forbidden phrase, case-insensitively", () => {
  for (const text of ["see BOARD" + "-BUILDER", "open .flow/board" + ".html", "Then Regenerate The " + "Board."])
    assert.deepEqual(boardMentions([{ path: "x.md", text }]), ["x.md"], `missed: ${text}`);
  assert.deepEqual(boardMentions([{ path: "y.md", text: "apply-board-edits.mjs is the store writer" }]), [],
    "the store writer keeps its name and must not be flagged");
});

test("the template no longer ships the skill or the board", () => {
  assert.ok(!existsSync(join(REPO, "project-template/.claude/skills", "board" + "-builder")));
  assert.ok(!existsSync(join(REPO, "project-template/.flow", "board" + ".html")));
  assert.ok(existsSync(join(REPO, "project-template/.flow/bin/apply-board-edits.mjs")),
    "apply-board-edits.mjs is the store writer, not the board — it stays");
});

// ── the sync's retired-paths step ─────────────────────────────────────────────────────────

const REGION = /^[ \t]*# THE RETIRED PATHS \(flow-0164\)[\s\S]*?^[ \t]*done[ \t]*$/m;
const LIST = /^[ \t]*for RETIRED in (.+); do[ \t]*$/m;

const extractRegion = (text = readReusable()) => {
  const m = text.match(REGION);
  assert.ok(m, "could not find the retired-paths step in _flow-sync.yml — it was reshaped; update " +
    "this extractor and re-verify the behaviour below still holds");
  return m[0];
};

/** The command lines of the region: comments and blanks dropped. */
const commands = (region) =>
  region.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

/** The retired list, parsed. Each entry must be a plain double-quoted literal. */
export const parseRetired = (region) => {
  const m = region.match(LIST);
  if (!m) return null;
  return m[1].trim().split(/\s+/);
};

test("the retired-paths list holds exactly the board skill, the board and the queue-runner caller", () => {
  const tokens = parseRetired(extractRegion());
  assert.ok(tokens, "the step must iterate a literal `for RETIRED in … ; do` list");
  for (const t of tokens)
    assert.match(t, /^"[A-Za-z0-9._\/-]+"$/, `${t} is not a plain quoted literal — no glob, no variable, no escape`);
  const paths = tokens.map((t) => t.slice(1, -1));
  assert.deepEqual(paths, RETIRED);
  for (const p of paths) {
    assert.ok(!p.startsWith("/") && !p.split("/").includes(".."), `${p} must stay inside the checkout`);
    assert.doesNotMatch(p, /[*?[\]{}$`~]/, `${p} must not expand`);
  }
  assert.equal(readReusable().match(/for RETIRED in /g)?.length, 1, "exactly one retired-paths list");
});

test("the step's only deletion is the loop variable, quoted, and nothing else is referenced", () => {
  const cmds = commands(extractRegion());
  const deletes = cmds.filter((c) => /\brm\b|\bgit rm\b|\brsync\b|\bfind\b|\bunlink\b/.test(c));
  assert.deepEqual(deletes, ['rm -rf -- "${RETIRED%/}"'], "one delete, of the list entry, and no other");
  const vars = new Set(cmds.join("\n").match(/\$\{?[A-Za-z_][A-Za-z0-9_]*/g).map((v) => v.replace(/^\$\{?/, "")));
  assert.deepEqual([...vars], ["RETIRED"], "the step must read no variable but its own loop variable");
  assert.doesNotMatch(cmds.join("\n"), /\$\{\{/, "no workflow expression is interpolated into the step");
});

test("the step sits inside the copy region, before the commit stages the tree", () => {
  const text = readReusable();
  const at = text.indexOf("# THE RETIRED PATHS (flow-0164)");
  const skills = text.indexOf("rsync -a --delete --filter='P LOCAL.md'");
  const stamp = text.indexOf(`printf '%s\\n' "$CANON_VER" > .flow/VERSION`);
  const add = text.indexOf("git add -A", stamp);
  assert.ok(skills > 0 && stamp > 0 && add > 0, "landmarks moved; re-read the step");
  assert.ok(skills < at && at < stamp && stamp < add,
    "the deletion must run after the skill mirror and before `git add -A`, so it lands in the sync commit");
});

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
const write = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

/** An adopter checkout, committed, so the staged diff afterwards is the one the sync PR carries. */
const adopter = (t, { retired }) => {
  const root = mkdtempSync(join(tmpdir(), "flow-0164-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(root, ".claude/skills/task-writer/SKILL.md", "task-writer\n");
  write(root, ".flow/bin/apply-board-edits.mjs", "// store writer\n");
  write(root, ".flow/board-edits.json", "{}\n");
  if (retired) {
    write(root, ".claude/skills/board" + "-builder/SKILL.md", "stale\n");
    write(root, ".claude/skills/board" + "-builder/LOCAL.md", "stale overlay\n");
    write(root, ".flow/board" + ".html", "<html></html>\n");
  }
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "flow-bot@users.noreply.github.com");
  git(root, "config", "user.name", "flow-bot");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture: an adopter behind canonical");
  return root;
};

/** Run the shipped region with nothing supplied — it must need nothing. */
const runRegion = (cwd) =>
  execFileSync("bash", ["-euo", "pipefail", "-c", extractRegion()], { cwd, encoding: "utf8", env: { PATH: process.env.PATH } });

test("an adopter with both retired paths loses both, and nothing beside them", (t) => {
  const root = adopter(t, { retired: true });
  runRegion(root);
  for (const p of BOARD) assert.ok(!existsSync(join(root, p)), `${p} must be gone`);
  for (const p of [".claude/skills/task-writer/SKILL.md", ".flow/bin/apply-board-edits.mjs", ".flow/board-edits.json"])
    assert.ok(existsSync(join(root, p)), `${p} is a sibling and must be untouched`);
  assert.equal(readFileSync(join(root, ".claude/skills/task-writer/SKILL.md"), "utf8"), "task-writer\n");

  git(root, "add", "-A");
  const changed = git(root, "diff", "--cached", "--no-renames", "--name-status");
  assert.deepEqual(changed.trim().split("\n").sort(), [
    "D\t.claude/skills/board" + "-builder/LOCAL.md",
    "D\t.claude/skills/board" + "-builder/SKILL.md",
    "D\t.flow/board" + ".html",
  ]);
  const { body } = prContent({ local: "3.5.0", canonical: "3.6.0", files: changed });
  assert.match(body, /\*\*Removed\*\* \(3\)/, "the deletions appear under Removed in the sync PR body");
  assert.match(body, /- `\.flow\/board\.html`/);
});

test("an adopter with neither retired path is a no-op that exits 0", (t) => {
  const root = adopter(t, { retired: false });
  runRegion(root);   // throws on a non-zero exit
  git(root, "add", "-A");
  assert.equal(git(root, "status", "--porcelain"), "", "nothing may change when there is nothing to retire");
});

test("a retired path that is a symlink is removed as a link, never followed", (t) => {
  const root = adopter(t, { retired: false });
  const outside = mkdtempSync(join(tmpdir(), "flow-0164-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "keep.md"), "not the adopter's to lose\n");
  symlinkSync(outside, join(root, ".claude/skills", "board" + "-builder"));
  runRegion(root);
  assert.ok(!existsSync(join(root, ".claude/skills", "board" + "-builder")), "the link is gone");
  assert.equal(readFileSync(join(outside, "keep.md"), "utf8"), "not the adopter's to lose\n",
    "the link's target, outside the checkout, is untouched");
});
