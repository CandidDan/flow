// flow-init-downstream.test.mjs — canonical-only proving test for flow-0078.
//
// `project-template/.flow/bin/` is COPIED into every adopting repo, and `flow-gates / flow-tooling`
// runs the copied `*.test.mjs` there. So each of those files has two homes, and canonical only
// ever exercised one of them: in place, where `<this dir>/../..` is `project-template/`. Downstream
// the same expression is the ADOPTER'S OWN REPO ROOT, and a fixture that reads from it stops
// testing flow-init and starts testing whoever adopted Flow.
//
// That is not hypothetical. It was permanently red in every adopter until flow-0078, and nothing
// in canonical's CI could see it — `CandidDan/Nudge#297` could not pass its own gate on a file
// canonical reported green. This harness is the missing half: it builds an adopter layout in a
// temp directory, copies the template's `.flow/bin/` into it, and runs the copied test from there.
//
// NO DEPENDENCIES, and no network. This file lives in canonical's `.flow/bin/`, which
// `flow-tooling` runs with no `npm ci` in front of it; and the test it spawns passes `--from` on
// every run, so flow-init's one network path (cloning canonical) is never taken.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const TEMPLATE = join(REPO, "project-template");

// The copied tests this harness runs from an adopter layout. One line per file: adding another
// is the whole cost of extending the harness, and running ALL of them is a separate task
// (flow-0078 scope note) because it may surface failures beyond the one this file exists for.
const COPIED_TESTS = [".flow/bin/flow-init.test.mjs"];

// ── the adopter layout, as data ────────────────────────────────────────────────────────
//
// What a repo that has adopted Flow actually holds — specifically, one part-way through the
// 1.x → 2.x sync that exposed this, which is the harshest honest case: `flow-sync` has already
// replaced `.flow/bin/` and bumped `.flow/VERSION`, but root files it never invented are still
// missing. Every entry is either copied from the template or written here; nothing is optional,
// so a failure is always about flow-init and never about how this machine happens to be set up.
//
//   kind: "dir"   — recursive copy of `from` (template-relative) to `to` (adopter-relative)
//   kind: "file"  — single file copy
//   kind: "glob"  — every `from`-directory entry matching `match`
//   kind: "write" — `text`, written verbatim
const LAYOUT = [
  { kind: "dir",   to: ".flow/bin",            from: ".flow/bin" },
  { kind: "dir",   to: ".claude",              from: ".claude" },
  { kind: "file",  to: ".flow/PROTOCOL.md",    from: ".flow/PROTOCOL.md" },
  { kind: "glob",  to: ".github/workflows",    from: ".github/workflows", match: /^flow-.+\.ya?ml$/ },
  { kind: "file",  to: "CLAUDE.md",            from: "CLAUDE.md" },
  // Both arrive in any repo flow-init touched, and the copied tests assert on their content.
  { kind: "file",  to: ".gitattributes",       from: ".gitattributes" },
  { kind: "file",  to: ".gitignore",           from: ".gitignore" },
  { kind: "write", to: ".flow/VERSION",        text: () => readFileSync(join(REPO, "VERSION"), "utf8") },
  { kind: "write", to: ".flow/config.yml",     text: () => ADOPTER_CONFIG },
  { kind: "write", to: ".flow/board.html",     text: () => ADOPTER_BOARD },
  { kind: "write", to: ".flow/tasks/APP-0042-something.md", text: () => ADOPTER_TASK },
];

// DELIBERATELY ABSENT. Each of these was, before flow-0078, read out of the adopter's tree by a
// fixture in the copied surface and asserted on as if it were canonical's. Their absence is what
// gives this harness teeth — see the negative-control test at the bottom.
const ABSENT = [
  // A repo on 1.x has no AGENTS.md: the vendor-neutral host file arrived in 2.0.0, and a sync
  // that only replaces tooling does not invent a new root file.
  "AGENTS.md",
];

// The adopter's `.flow/VERSION` is canonical's stamp, never a literal — the same derivation
// `flow-init.test.mjs` and `caller-pins.test.mjs` use, and for the same reason: `"1.4.0"` written
// here would quietly make this an assertion about a release nobody is on any more.

const ADOPTER_CONFIG = [
  "project:", '  name: "other-app"', '  language: "javascript"',
  '  description: "Some repo that adopted Flow."', "commands:", '  install: "npm ci"',
  '  build: "npm run build"', '  lint: "npm run lint"', '  test: "npm test"',
  '  coverage: "npm run coverage"', "coverage_min: 70", "", // eslint-disable-line
].join("\n");

const ADOPTER_TASK = [
  '---', 'id: "APP-0042"', 'title: "A task belonging to the adopting repo"', 'status: "ready"',
  'priority: 2', '---', '', '## Context', 'x', '',
].join("\n");

// The adopter's LIVE board: pointed at its own repo, holding its own tasks — and with no
// `const REPO = "…";` declaration at all. That last part is not invented for effect: it is the
// shape of `CandidDan/Nudge`'s board, and it is why the copied board assertion failed downstream.
// `prepareBoard`'s patterns are anchored, so there is simply nothing here for it to rewrite.
const ADOPTER_BOARD = [
  "<!doctype html>", "<title>other-app — Flow board</title>", "<script>",
  'const ISSUE_BASE = "https://github.com/other-co/other-app/issues";',
  "const TASKS = [",
  '  { id: "APP-0042", title: "A task belonging to the adopting repo", status: "ready" },',
  "];",
  "</script>", "",
].join("\n");

// The child is a test runner spawned BY a test runner, and node passes `NODE_TEST_CONTEXT` down
// to mark a process as a runner's child. Inherited, it switches the grandchild to the
// v8-serialised reporter — the run still exits 0, but its summary never reaches this stdout, so
// the count assertions below would be reading an empty string. `--test-reporter` cannot override
// it. Coverage plumbing (`NODE_V8_COVERAGE`, set by c8) goes too: this child's coverage is
// canonical's template tooling measured through a copy in a temp directory, which is noise.
function childEnv() {
  const env = { ...process.env };
  for (const k of ["NODE_TEST_CONTEXT", "NODE_V8_COVERAGE", "NODE_OPTIONS"]) delete env[k];
  return env;
}

function adopterFixture() {
  const root = mkdtempSync(join(tmpdir(), "flow-adopter-"));
  for (const e of LAYOUT) {
    const dest = join(root, e.to);
    if (e.kind === "dir") { cpSync(join(TEMPLATE, e.from), dest, { recursive: true }); continue; }
    if (e.kind === "glob") {
      mkdirSync(dest, { recursive: true });
      const src = join(TEMPLATE, e.from);
      const names = readdirSync(src).filter((n) => e.match.test(n));
      assert.ok(names.length, `the template ships no ${e.match} under ${e.from} — an empty copy is a hole, not a pass`);
      for (const n of names) cpSync(join(src, n), join(dest, n));
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    if (e.kind === "file") cpSync(join(TEMPLATE, e.from), dest);
    else writeFileSync(dest, e.text());
  }
  for (const name of ABSENT)
    assert.ok(!existsSync(join(root, name)), `${name} must not exist in the adopter layout`);
  return root;
}

// ── criterion 1 ────────────────────────────────────────────────────────────────────────
for (const rel of COPIED_TESTS) {
  test(`${rel} passes when run from an adopting repo's layout, not just in place`, () => {
    const root = adopterFixture();
    try {
      const r = spawnSync(process.execPath, ["--test", rel],
        { cwd: root, encoding: "utf8", stdio: "pipe", env: childEnv() });
      assert.equal(r.status, 0,
        `${rel} is red in every adopting repo, which is where it actually gates:\n${r.stdout}\n${r.stderr}`);
      // An empty run exits 0 too. The count is whatever the file ships, never a literal here.
      assert.match(r.stdout, /^# pass (\d+)$/m, "the child must report a test count");
      assert.ok(Number(r.stdout.match(/^# pass (\d+)$/m)[1]) > 0, "a run that executed nothing is not a pass");
      assert.match(r.stdout, /^# fail 0$/m);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// The harness only proves something if the layout can still fail. Both of these were true of the
// tree that broke — drop either and the run above goes green for the wrong reason, because the
// copied fixture would find a usable file where an adopter has none.
test("the adopter layout keeps the two properties that made the copied test fail", () => {
  const root = adopterFixture();
  try {
    assert.ok(!existsSync(join(root, "AGENTS.md")),
      "an adopter layout that already has AGENTS.md cannot catch a fixture that reads it from there");
    const board = readFileSync(join(root, ".flow", "board.html"), "utf8");
    assert.doesNotMatch(board, /^const REPO = "[^"]*";/m,
      "the adopter's board must have nothing for prepareBoard to rewrite — that is the downstream shape");
    assert.match(board, /APP-0042/, "the adopter's board holds its own tasks");
    assert.ok(existsSync(join(root, ".flow", "bin", "flow-init.mjs")),
      "the layout must carry the template's tooling, or the child has nothing to import");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
