// release-assemble.test.mjs — canonical's own gate is green on a release's own PR.
//
// THE FAILURE THIS EXISTS FOR. A task proves its changelog criterion by reading its fragment,
// `changes/<id>.md`. That is correct while the task is open and wrong forever after the next
// release: `changelog-fragments.mjs --assemble` folds every fragment into `CHANGELOG.md` and
// DELETES it. So the test is green on the task's own PR and red on the release's PR, for a reason
// that has nothing to do with the release. It happened three times in three releases — flow-0069
// and flow-0073 broke 2.1.0, flow-0050 broke 2.1.1, flow-0093/0094/0095 broke 2.1.2 — and each
// one was patched by hand on the release branch, after the gate had already gone red.
//
// WHY THIS IS A GATE AND NOT A LINT. A grep for `changes/flow-` in test sources is a heuristic:
// it misses `join("changes", id + ".md")`, and it fires on prose. The real property is "after
// `--assemble`, the suite still passes", so it is tested directly — in a scratch copy, in the
// state a release actually leaves the tree in. Bounded on purpose: only the test files whose
// source mentions `changes` or `CHANGELOG`, which is 27 of 90 here and runs in about seven
// seconds, not the whole suite a second time.
//
// Canonical-only by location AND by subject: `changes/` and `CHANGELOG.md` are canonical's, so
// flow-sync never carries this file to an adopting repo. It excludes itself from the files it
// selects (see SELF_EXCLUDED) — it mentions `changes` in every other line, and selecting itself
// would fork a scratch copy of itself forever.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import test from "node:test";

import { FRAGMENT_DIR, FRAGMENT_NAME } from "./changelog-fragments.mjs";

const BIN = import.meta.dirname;
const REPO = resolve(BIN, "..", "..");
const SELF_EXCLUDED = basename(import.meta.filename);

// Where canonical's tests live, repo-relative. `flightdeck/bin/` is in `npm test` too but holds no
// changelog-aware test; it is listed so a future one is picked up rather than silently skipped.
export const TEST_ROOTS = [join(".flow", "bin"), join("project-template", ".flow", "bin"), join("flightdeck", "bin")];

// "mentions `changes` or `CHANGELOG`" — the same substring test a human would grep for, kept
// deliberately loose. A false positive costs a second of runtime; a false negative is the bug.
export const MENTIONS_CHANGELOG = /changes|CHANGELOG/;

const ASSEMBLER = join(".flow", "bin", "changelog-fragments.mjs");

// A fragment id no task will ever have: task ids are allocated in sequence from 0001, and this is
// four digits so `FRAGMENT_NAME` and `compareFragmentNames` treat it exactly like a real one.
export const SYNTHETIC_ID = "flow-9000";
const SYNTHETIC_TEXT =
  "- **Synthetic fragment, written by release-assemble.test.mjs** (`.flow/bin/release-assemble.test.mjs`, " +
  `${SYNTHETIC_ID}). **Caller action: none** — this file only ever exists inside a scratch copy.\n`;

const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

// ── the pieces, each exported so the criteria are proved against a function and not a grep ──────

// The test files to re-run after assembly: every `*.test.mjs` under TEST_ROOTS whose source
// mentions `changes` or `CHANGELOG`, minus this file. Returned repo-relative, so the list can be
// handed straight to `node --test` with the scratch copy as cwd.
export function selectTestFiles(root, { roots = TEST_ROOTS, exclude = SELF_EXCLUDED } = {}) {
  const out = [];
  for (const rel of roots) {
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".test.mjs") || name === exclude) continue;
      if (MENTIONS_CHANGELOG.test(readFileSync(join(dir, name), "utf8"))) out.push(join(rel, name));
    }
  }
  return out;
}

// The child's environment. `NODE_TEST_CONTEXT` is exported by the runner to its children; left in
// place the inner run reports into THIS process instead of printing its own TAP, and its exit code
// stops meaning anything (see adopter-layout.test.mjs, which hit it first).
//
// `GITHUB_HEAD_REF` is deliberately kept: `changelog-fragments.test.mjs` reads it to decide which
// in-flight task this checkout belongs to, and keeping it means the scratch run asks the question
// a release PR's own gate would ask.
export function childEnv(base = process.env) {
  const env = { ...base };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

// The pending fragments in `root`, and a synthetic one written first if there are none. Canonical
// sits fragment-less for the whole window between a release and the next task, and a check that
// quietly assembles nothing in that window is a check that has stopped running.
export function ensureFragment(root, { text = SYNTHETIC_TEXT, id = SYNTHETIC_ID } = {}) {
  const dir = join(root, FRAGMENT_DIR);
  mkdirSync(dir, { recursive: true });
  const pending = readdirSync(dir).filter((n) => FRAGMENT_NAME.test(n)).sort();
  if (pending.length) return { names: pending, synthetic: false };
  writeFileSync(join(dir, `${id}.md`), text);
  return { names: [`${id}.md`], synthetic: true };
}

// ── the scratch copy ────────────────────────────────────────────────────────────────────────────

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

// TRACKED files, from the WORKING TREE — the same pair of rules `npm run lint` follows. Tracked,
// because an untracked helper is not part of the release; working tree, because the point is to
// test the change in hand, which is not committed yet when the gate runs locally.
function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
}

function buildScratch() {
  const dir = mkdtempSync(join(tmpdir(), "flow-release-assemble-"));
  dirs.push(dir);
  for (const rel of trackedFiles(REPO)) {
    const src = join(REPO, rel);
    if (!existsSync(src)) continue;                 // tracked but deleted in the working tree
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    cpSync(src, join(dir, rel));
  }
  // A real git repo, because the tests being re-run shell out to git (`changelog-fragments.test.mjs`
  // resolves its own branch that way) and a bare directory makes them take the no-git path.
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=flow", "-c", "user.email=flow@example.invalid", "commit", "-qm", "scratch");
  return dir;
}

function assemble(dir) {
  const r = spawnSync(process.execPath, [ASSEMBLER, "--assemble"], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, `--assemble failed in the scratch copy:\n${r.stdout}\n${r.stderr}`);
  return r.stdout || "";
}

function runSelected(dir) {
  const files = selectTestFiles(dir);
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...files], {
    cwd: dir,
    env: childEnv(),
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = r.stdout || "";
  return {
    files,
    status: r.status,
    stdout,
    stderr: r.stderr || "",
    // Every failing test, named. "the suite failed" sends the reader to re-run it by hand.
    failed: stdout.split("\n").filter((l) => /^\s*not ok /.test(l)).map((l) => l.trim()),
  };
}

// ── criteria ────────────────────────────────────────────────────────────────────────────────────

test("after a release assembles the fragments, every changelog-aware test still passes", () => {
  const dir = buildScratch();
  const { names } = ensureFragment(dir);

  assemble(dir);
  for (const name of names) {
    assert.equal(existsSync(join(dir, FRAGMENT_DIR, name)), false,
      `--assemble left ${name} in place, so the scratch copy is not in a post-release state`);
  }

  const run = runSelected(dir);
  assert.ok(run.files.length >= 5,
    `only ${run.files.length} changelog-aware test file(s) selected — a check that runs nothing passes for free`);
  assert.equal(run.status, 0,
    `these tests pass here but would fail on the release PR that assembles the changelog. Read the\n` +
    `entry through .flow/bin/changelog-entry.mjs instead of reading changes/<id>.md:\n` +
    `${run.failed.join("\n") || run.stderr.slice(0, 2000)}`);
  assert.match(run.stdout, /^# pass [1-9]/m, "the inner run passed nothing — it did not really run");
});

test("a test that reads its fragment directly fails the check, and the failure names it", () => {
  const dir = buildScratch();
  const { names } = ensureFragment(dir);
  const id = basename(names[0], ".md");

  // The failing case is built here, inside the scratch copy, rather than left in the tree: a
  // deliberately broken test committed to canonical would fail the real gate for everyone.
  const probe = "a fragment-reading test, as written by every task that got this wrong";
  writeFileSync(join(dir, ".flow", "bin", "zz-fragment-probe.test.mjs"), [
    'import { existsSync } from "node:fs";',
    'import { join } from "node:path";',
    'import assert from "node:assert/strict";',
    'import test from "node:test";',
    `test(${JSON.stringify(probe)}, () => {`,
    `  assert.ok(existsSync(join(import.meta.dirname, "..", "..", "changes", ${JSON.stringify(`${id}.md`)})));`,
    "});",
    "",
  ].join("\n"));

  assemble(dir);
  const run = runSelected(dir);

  assert.ok(run.files.includes(join(".flow", "bin", "zz-fragment-probe.test.mjs")),
    "the probe mentions `changes`, so the selection must have picked it up");
  assert.notEqual(run.status, 0, "a test reading a deleted fragment must fail the check, not be tolerated");
  assert.ok(run.failed.some((l) => l.includes(probe)),
    `the check must name the failing test. It reported: ${run.failed.join(" | ") || "(nothing)"}`);
});

test("with no fragment pending, a synthetic one is written so assembly runs on every gate", () => {
  const root = mkdtempSync(join(tmpdir(), "flow-ensure-fragment-"));
  dirs.push(root);
  mkdirSync(join(root, FRAGMENT_DIR), { recursive: true });
  writeFileSync(join(root, FRAGMENT_DIR, "README.md"), "# the convention, not a fragment\n");

  const first = ensureFragment(root);
  assert.equal(first.synthetic, true, "an empty `changes/` must be given a fragment, not skipped");
  assert.deepEqual(first.names, [`${SYNTHETIC_ID}.md`]);
  assert.match(readFileSync(join(root, FRAGMENT_DIR, `${SYNTHETIC_ID}.md`), "utf8"), /caller action/i);

  // README.md is documentation that lives there permanently; it is never a fragment.
  assert.equal(ensureFragment(root).synthetic, false, "a real pending fragment must be used as-is");
  assert.deepEqual(ensureFragment(root).names, [`${SYNTHETIC_ID}.md`]);
});

test("the selection is exactly the changelog-aware test files, and never this file", () => {
  const files = selectTestFiles(REPO);
  assert.ok(files.length >= 5, `expected canonical to have changelog-aware tests; found ${files.length}`);

  for (const rel of files) {
    assert.match(readFileSync(join(REPO, rel), "utf8"), MENTIONS_CHANGELOG,
      `${rel} was selected but mentions neither \`changes\` nor \`CHANGELOG\``);
  }
  assert.ok(files.includes(join(".flow", "bin", "changelog-fragments.test.mjs")),
    "the store-wide changelog test is the one this check exists to protect");
  assert.ok(files.every((rel) => basename(rel) !== SELF_EXCLUDED),
    "selecting itself would make this test spawn a scratch copy of itself");

  // And the files it leaves out really are silent about the changelog.
  const skipped = readdirSync(join(REPO, ".flow", "bin"))
    .filter((n) => n.endsWith(".test.mjs") && n !== SELF_EXCLUDED && !files.includes(join(".flow", "bin", n)));
  assert.ok(skipped.length > 0, "canonical has non-changelog tests; selecting all of them is not a bounded run");
  for (const name of skipped) {
    assert.doesNotMatch(readFileSync(join(REPO, ".flow", "bin", name), "utf8"), MENTIONS_CHANGELOG,
      `${name} mentions the changelog but was skipped`);
  }
});

test("the child run drops NODE_TEST_CONTEXT and keeps GITHUB_HEAD_REF", () => {
  const env = childEnv({ NODE_TEST_CONTEXT: "child", GITHUB_HEAD_REF: "flow/flow-0090-x", PATH: "/usr/bin" });
  assert.equal("NODE_TEST_CONTEXT" in env, false,
    "left in place, the inner run reports into this process and its exit code stops meaning anything");
  assert.equal(env.GITHUB_HEAD_REF, "flow/flow-0090-x",
    "the scratch run must ask the same which-task-is-this question the real gate asks");
  assert.equal(env.PATH, "/usr/bin", "everything else is passed through — node must still be findable");
});
