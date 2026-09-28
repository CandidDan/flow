// adopter-layout.test.mjs — the synced tests must pass in a repo that ADOPTED Flow, not only here.
//
// flow-sync copies `project-template/.flow/bin/` (tests included) into every adopting repo, and
// each repo's `flow-tooling` job runs `node --test .flow/bin/*.test.mjs` with nothing installed.
// Canonical's own gate only ever ran those tests from `project-template/.flow/bin/`, inside
// canonical, where every canonical-only file they might read is present. So a test that reads
// canonical's config, or a template file flow-sync never delivers, is green here and red in the
// whole fleet. 2.1.0 shipped five of them (flow-0063, flow-0073, flow-0077) and they reached the
// fleet the day `v2` moved.
//
// This builds the closest cheap stand-in for a synced repo and runs the synced tests in it:
//   · a copy of the published template, which is what `flow-init` gave every adopter;
//   · minus `.flow/intents/`, which `flow-sync` does not carry (see `_flow-sync.yml`'s header);
//   · with every REPLACE-ME in `.flow/config.yml` filled in, as a calibrated repo's would be.
// Known limit: it does not model a repo that adopted an OLDER template and has since deleted or
// edited files. It catches the class that broke 2.1.0: a synced test reading something only
// canonical, or only a fresh template, has.
//
// Canonical-only by location: it lives in `.flow/bin/`, not `project-template/.flow/bin/`, so
// flow-sync never copies it, and it cannot recurse into itself.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import test from "node:test";

const REPO = resolve(import.meta.dirname, "..", "..");
const TEMPLATE = join(REPO, "project-template");

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

function buildAdopter() {
  const dir = mkdtempSync(join(tmpdir(), "flow-adopter-"));
  cpSync(TEMPLATE, dir, { recursive: true });
  rmSync(join(dir, ".flow", "intents"), { recursive: true, force: true });
  const cfgPath = join(dir, ".flow", "config.yml");
  writeFileSync(cfgPath, readFileSync(cfgPath, "utf8").replaceAll("REPLACE-ME", "demo"));
  mkdirSync(join(dir, "demo"), { recursive: true });
  writeFileSync(join(dir, "demo", "index.js"), "export const ok = true;\n");
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=flow", "-c", "user.email=flow@example.invalid", "commit", "-qm", "adopt");
  return dir;
}

test("the stand-in really is an adopter: no intent template, no placeholder left in its config", () => {
  const dir = buildAdopter();
  try {
    assert.equal(existsSync(join(dir, ".flow", "intents")), false);
    assert.doesNotMatch(readFileSync(join(dir, ".flow", "config.yml"), "utf8"), /REPLACE-ME/);
    assert.ok(readdirSync(join(dir, ".flow", "bin")).some((f) => f.endsWith(".test.mjs")),
      "a stand-in with no synced tests would pass by testing nothing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every synced test passes (or skips) in an adopting repo's layout", () => {
  const dir = buildAdopter();
  try {
    const files = readdirSync(join(dir, ".flow", "bin"))
      .filter((f) => f.endsWith(".test.mjs"))
      .map((f) => join(".flow", "bin", f));
    // The outer runner exports NODE_TEST_CONTEXT to children; left in place, the inner run would
    // report into this process instead of printing its own TAP, and its exit code would lie.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...files],
      { cwd: dir, env, encoding: "utf8", timeout: 240_000, maxBuffer: 64 * 1024 * 1024 });
    const failed = (r.stdout || "").split("\n").filter((l) => /^\s*not ok /.test(l));
    assert.equal(r.status, 0,
      `synced tests fail in an adopter layout — a fleet repo's flow-tooling job would be red:\n` +
      `${failed.join("\n") || (r.stderr || "").slice(0, 2000)}`);
    assert.match(r.stdout, /^# pass [1-9]/m, "the inner run passed nothing — it did not really run");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
