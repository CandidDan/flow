// release-guard.test.mjs — proving tests for canonical's release-guard adapter (flow-0024).
//
// The verdict logic and the git reads are the template's, with their own proving tests behind
// them (project-template/.flow/bin/release-guard.test.mjs). The only new behaviour here is
// (a) WHICH repo and which two stamps the adapter pins itself to, and (b) that `release-tag.yml`
// actually calls it before it moves anything. Both fail silently if wrong:
//
//   · The template's CLI defaults its repo to `process.cwd()`. An adapter that inherited that
//     would check whatever tree the job happened to be standing in — and exit 0.
//   · A symlink instead of an adapter resolves the root two levels up from the TEMPLATE's bin
//     directory, which is `project-template/` — a tree with a `.flow/VERSION` and no root
//     `VERSION` at all. Every command still exits 0. That is failing open, in a guard.
//   · A workflow that runs the guard AFTER the retag step publishes the lie and then complains.
//
// Deliberately not in adapters.test.mjs — that file is flow-0015's.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { canonicalRepoRoot, canonicalVersionFiles, checkRelease, RELEASE_TAG } from "./release-guard.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const FLOW = resolve(BIN, "..");
const REPO = resolve(FLOW, "..");
const TEMPLATE = join(REPO, "project-template");
const WORKFLOW = join(REPO, ".github", "workflows", "release-tag.yml");

// ── which tree the adapter pins itself to ──────────────────────────────────────────────

test("the adapter resolves CANONICAL's root, not the template's fixture tree", () => {
  assert.equal(canonicalRepoRoot(), REPO);
  assert.notEqual(canonicalRepoRoot(), TEMPLATE,
    "project-template/ has a .flow/VERSION and no root VERSION — a guard pointed there would " +
    "find one stamp, compare it against nothing, and exit 0 while checking the wrong tree");
});

test("the adapter names canonical's two real stamp files", () => {
  const { rootFile, templateFile, rootPath, templatePath } = canonicalVersionFiles();
  assert.equal(rootFile, join(REPO, "VERSION"));
  assert.equal(templateFile, join(REPO, "project-template", ".flow", "VERSION"));
  assert.equal(rootPath, "VERSION", "repo-relative: every read goes through `git show <ref>:<path>`");
  assert.equal(templatePath, "project-template/.flow/VERSION");

  // Both must exist and both must be readable as stamps — this is the pair the guard holds
  // together, and canonical is the only repo that has both.
  for (const file of [rootFile, templateFile]) {
    assert.match(readFileSync(file, "utf8").trim(), /^\d+\.\d+\.\d+$/, `${file} must be a stamp`);
  }
});

test("canonical's two stamps agree right now — the guard's own precondition", () => {
  const { rootFile, templateFile } = canonicalVersionFiles();
  const { problems } = checkRelease({
    rootVersion: readFileSync(rootFile, "utf8"),
    templateVersion: readFileSync(templateFile, "utf8"),
  });
  assert.deepEqual(problems, [],
    "the repo that authors the guard must not be the one violating it");
});

test("the adapter re-exports the template's logic rather than reimplementing it", () => {
  assert.ok(RELEASE_TAG.test("v1.2.0") && !RELEASE_TAG.test("v1"),
    "the re-exported matcher must be the template's, aliases and all");
});

// ── the adapter's CLI, run against a stand-in canonical with a lying stamp ──────────────
//
// The adapter pins its repo to its own realpath on purpose, so it cannot be pointed at a
// fixture with a flag. The fixture therefore reproduces canonical's LAYOUT — root VERSION,
// project-template/.flow/VERSION, both bin directories — and runs the copied adapter from
// inside it. Running it with a cwd somewhere else entirely is the point: if the adapter ever
// regressed to the template's `process.cwd()` default, this test would go green against the
// wrong tree, so the cwd is chosen to make that impossible.

function canonicalLikeRepo(rootVersion, templateVersion) {
  const dir = mkdtempSync(join(tmpdir(), "flow-rg-adapter-"));
  mkdirSync(join(dir, ".flow", "bin"), { recursive: true });
  mkdirSync(join(dir, "project-template", ".flow"), { recursive: true });
  cpSync(join(TEMPLATE, ".flow", "bin"), join(dir, "project-template", ".flow", "bin"),
    { recursive: true });
  cpSync(join(BIN, "release-guard.mjs"), join(dir, ".flow", "bin", "release-guard.mjs"));
  writeFileSync(join(dir, "VERSION"), rootVersion);
  writeFileSync(join(dir, "project-template", ".flow", "VERSION"), templateVersion);

  const git = (...a) =>
    execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "guard@flow.test");
  git("config", "user.name", "release guard fixture");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  git("add", "-A");
  git("commit", "-qm", "stand-in canonical");
  return { dir, git };
}

const runAdapter = (fixture, env = {}) =>
  spawnSync(process.execPath, [join(fixture.dir, ".flow", "bin", "release-guard.mjs")], {
    cwd: tmpdir(),                       // deliberately NOT the repo — see the note above
    encoding: "utf8",
    env: { ...process.env, GITHUB_REF_NAME: "main", ...env },
  });

test("the adapter FAILS when the tree about to be published carries a stamp that lies", () => {
  const fx = canonicalLikeRepo("1.1.0", "1.1.0");
  fx.git("tag", "-a", "v1.1.1", "-m", "1.1.1");   // annotated, stamped 1.1.0 — the incident

  const r = runAdapter(fx);
  assert.equal(r.status, 1, "a tag push publishing a disagreeing stamp must fail the release path");
  assert.match(r.stdout, /::error::release-guard: v1\.1\.1 tags a tree/);
  rmSync(fx.dir, { recursive: true, force: true });
});

test("the adapter FAILS on stamp drift between canonical's two VERSION files", () => {
  const fx = canonicalLikeRepo("1.2.0", "1.1.0");
  const r = runAdapter(fx);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::release-guard: stamp drift/);
  assert.match(r.stdout, /project-template\/\.flow\/VERSION/);
  rmSync(fx.dir, { recursive: true, force: true });
});

test("the adapter PASSES, and stays silent, when the stamps tell the truth", () => {
  const fx = canonicalLikeRepo("1.2.0", "1.2.0");
  fx.git("tag", "-a", "v1.2.0", "-m", "1.2.0");
  fx.git("tag", "v1");
  fx.git("tag", "v1-edge");

  const r = runAdapter(fx);
  assert.equal(r.status, 0, `expected a clean pass, got:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /0 problem\(s\), 0 warning\(s\)/);
  rmSync(fx.dir, { recursive: true, force: true });
});

test("alias rot is reported with a number and still exits 0", () => {
  const fx = canonicalLikeRepo("1.2.0", "1.2.0");
  fx.git("tag", "-a", "v1.2.0", "-m", "1.2.0");
  fx.git("tag", "v1");                              // the fleet's pin, parked here
  writeFileSync(join(fx.dir, "later.txt"), "more work\n");
  fx.git("add", "-A");
  fx.git("commit", "-qm", "work after the release");

  const r = runAdapter(fx);
  assert.equal(r.status, 0, "moving v1 is a human step — never a release failure");
  assert.match(r.stdout, /::warning::release-guard: v1 is 1 commit\(s\) behind main/);
  rmSync(fx.dir, { recursive: true, force: true });
});

test("the adapter runs against canonical itself without crashing", () => {
  const r = spawnSync(process.execPath, [join(BIN, "release-guard.mjs")],
    { cwd: REPO, encoding: "utf8", env: { ...process.env, GITHUB_REF_NAME: "main" } });
  assert.ok(r.status === 0 || r.status === 1,
    `the adapter must report, not crash — status ${r.status}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /release-guard: .* problem\(s\), .* warning\(s\)/);
});

// ── the workflow wiring ────────────────────────────────────────────────────────────────

function retagSteps() {
  const wf = parseYaml(readFileSync(WORKFLOW, "utf8"));
  return wf.jobs.retag.steps;
}

test("release-tag.yml runs the guard BEFORE it moves the edge tag", () => {
  const steps = retagSteps();
  const guard = steps.findIndex((s) => String(s.run ?? "").includes(".flow/bin/release-guard.mjs"));
  const move = steps.findIndex((s) => s.name === "Move the edge tag to this commit");

  assert.ok(guard >= 0, "release-tag.yml must invoke the guard at all");
  assert.ok(move >= 0, "the retag step must still be there");
  assert.ok(guard < move,
    "a guard that runs after the retag publishes the lie and then complains about it");
});

test("the workflow only INVOKES the guard — no branching logic in YAML", () => {
  const steps = retagSteps();
  const guard = steps.find((s) => String(s.run ?? "").includes("release-guard.mjs"));
  assert.equal(guard.run.trim(), "node .flow/bin/release-guard.mjs",
    "four earlier tasks ended up with criteria unprovable outside a workflow run because their " +
    "logic lived in inline shell; if this grows an `if`, move it into the module");
  assert.deepEqual(guard.env, { GITHUB_REF_NAME: "${{ github.ref_name }}" },
    "argument passing only");
});

test("the guard calls the ADAPTER, not the template's copy", () => {
  const steps = retagSteps();
  const guard = steps.find((s) => String(s.run ?? "").includes("release-guard.mjs"));
  assert.ok(!guard.run.includes("project-template"),
    "running the template's CLI would default the repo to process.cwd() and check nothing pinned");
});

test("the happy path is unchanged: the edge alias still moves, and v1 is still left alone", () => {
  const move = retagSteps().find((s) => s.name === "Move the edge tag to this commit").run;
  assert.match(move, /git tag -f "\$EDGE"/, "the edge alias must still be moved");
  assert.match(move, /git push -f origin "refs\/tags\/\$EDGE"/, "and still pushed");
  assert.ok(!/git (tag|push).*"\$STABLE"/.test(move),
    "the guard must not have turned the canary split into an automatic v1 move — that is the " +
    "decision release-tag.yml's header records, and this task must not reverse it");
});

test("the guard step has a node runtime to run on", () => {
  const steps = retagSteps();
  const setup = steps.findIndex((s) => String(s.uses ?? "").startsWith("actions/setup-node"));
  const guard = steps.findIndex((s) => String(s.run ?? "").includes("release-guard.mjs"));
  assert.ok(setup >= 0 && setup < guard, "setup-node must precede the guard step");
});
