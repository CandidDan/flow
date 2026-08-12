// main-module.test.mjs — the CLI entry points must run when reached through a SYMLINK.
//
// The bug this pins down (2026-08-11): every bin helper gated its CLI on
//   import.meta.url === `file://${process.argv[1]}`
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED. Reach the
// script through a symlink and they differ, the comparison is false, and the CLI block silently
// never runs — no output, no error, exit 0.
//
// Why it hid for so long: macOS `os.tmpdir()` is /var/folders/... symlinked to /private/var/...,
// so it fired on every local test run — while Linux CI checks out to a real path and never saw it.
// A platform-specific test would have stayed invisible to CI, so these tests build the symlink
// EXPLICITLY and therefore fail on any platform if the guard regresses.
//
// Why it matters more than a broken test: touches-guard FAILS OPEN. When the CLI block doesn't
// run, the scope check silently doesn't happen and the gate goes green — enforcement off, nothing
// reported. parse-task-id fails the same way, and it feeds flow-status / flow-done, so a lost id
// means the PR-event transition never fires and the task strands on `main`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Build <root>/real/.flow/bin/<files> and <root>/link -> <root>/real, so a path through `link`
// is a genuine symlink on every platform, not just where the OS happens to provide one.
function symlinkedFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "flow-symlink-"));
  const bin = join(root, "real", ".flow", "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, "real", ".flow", "tasks"), { recursive: true });
  for (const f of files) copyFileSync(join(import.meta.dirname, f), join(bin, f));
  symlinkSync(join(root, "real"), join(root, "link"), "dir");
  return { root, viaReal: join(root, "real"), viaLink: join(root, "link") };
}

test("parse-task-id CLI resolves an id when invoked through a symlink", () => {
  const fx = symlinkedFixture(["parse-task-id.mjs"]);
  const run = (base) =>
    execFileSync("node", [join(base, ".flow", "bin", "parse-task-id.mjs"), "flow/CAN-30-x", ""],
      { encoding: "utf8", stdio: "pipe" }).trim();

  assert.equal(run(fx.viaReal), "CAN-30", "sanity: works via the real path");
  assert.equal(run(fx.viaLink), "CAN-30",
    "REGRESSION: the CLI block did not run through the symlink — main-module detection is comparing " +
    "an as-invoked path against a resolved one. Every helper silently no-ops in this state.");
  rmSync(fx.root, { recursive: true, force: true });
});

test("touches-guard still ENFORCES scope when invoked through a symlink (fails open otherwise)", () => {
  const fx = symlinkedFixture(["touches-guard.mjs", "parse-task-id.mjs"]);
  writeFileSync(join(fx.viaReal, ".flow", "tasks", "0030-x.md"),
    '---\nid: "CAN-30"\ntouches: ["src/**"]\n---\nbody\n');

  const git = (...a) => execFileSync("git", a, { cwd: fx.viaReal, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  writeFileSync(join(fx.viaReal, "seed.txt"), "seed\n");
  git("add", "-A"); git("commit", "-qm", "base");
  mkdirSync(join(fx.viaReal, "docs"), { recursive: true });
  writeFileSync(join(fx.viaReal, "docs", "drift.md"), "drift\n");   // outside the declared src/**
  git("add", "-A"); git("commit", "-qm", "drift");

  let code = 0;
  try {
    execFileSync("node", [join(fx.viaLink, ".flow", "bin", "touches-guard.mjs")], {
      cwd: fx.viaLink, encoding: "utf8", stdio: "pipe",
      env: { ...process.env, BASE_REF: "HEAD~1", HEAD_REF: "flow/CAN-30-x", PR_TITLE: "" },
    });
  } catch (e) { code = e.status; }

  assert.equal(code, 1,
    "REGRESSION AND FAIL-OPEN: drift outside `touches` was not caught when the guard was reached " +
    "through a symlink. The gate would go green with scope enforcement silently disabled.");
  rmSync(fx.root, { recursive: true, force: true });
});
