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

// Read the retag job's steps WITHOUT a YAML parser, on purpose. `_flow-gates.yml`'s flow-tooling
// job runs `node --test .flow/bin/*.test.mjs` with no `npm ci` in front of it, so a test in this
// directory that imports `yaml` cannot resolve it and the job dies before a single test runs —
// which is how this file first failed CI. `_flow-gates.yml` is flow-0008's to change, not this
// task's, so the dependency goes rather than the workflow.
//
// The assumption this makes, stated plainly: steps in this file are list items at six-space
// indent under a job at two-space indent. That holds because `npm run build` parses every
// workflow on every gate, so a malformed one never reaches here.
//
// Comment lines are dropped before blocks are cut. A comment ABOVE a step sits at the step's
// own indent, so keeping it would append it to the PREVIOUS step — and since the comment above
// the guard step names `release-guard.mjs`, every search below would match the setup-node step
// instead. That is not hypothetical: it is what these tests did on the first run.
function retagSteps() {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const job = lines.findIndex((l) => /^ {2}retag:/.test(l));
  assert.ok(job >= 0, "release-tag.yml must still have a `retag` job");
  const start = lines.findIndex((l, i) => i > job && /^ {4}steps:/.test(l));
  assert.ok(start >= 0, "the retag job must still have steps");

  const steps = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {0,2}\S/.test(lines[i])) break;            // a new job (or top-level key) — done
    if (/^\s*#/.test(lines[i])) continue;             // a comment belongs to no step (see below)
    if (/^ {6}- /.test(lines[i])) steps.push([]);      // a new list item at step indent
    if (steps.length) steps[steps.length - 1].push(lines[i]);
  }
  return steps.map((block) => block.join("\n"));
}

const stepWith = (steps, needle) => steps.findIndex((s) => s.includes(needle));

test("release-tag.yml runs the guard BEFORE it moves the edge tag", () => {
  const steps = retagSteps();
  const guard = stepWith(steps, ".flow/bin/release-guard.mjs");
  const move = stepWith(steps, "name: Move the edge tag to this commit");

  assert.ok(guard >= 0, "release-tag.yml must invoke the guard at all");
  assert.ok(move >= 0, "the retag step must still be there");
  assert.ok(guard < move,
    "a guard that runs after the retag publishes the lie and then complains about it");
});

test("the workflow only INVOKES the guard — no branching logic in YAML", () => {
  const steps = retagSteps();
  const guard = steps[stepWith(steps, "release-guard.mjs")];

  // The whole `run:` is one line and is exactly the invocation. An `if`, a `case`, or a second
  // command would all break this — four earlier tasks ended up with criteria unprovable outside
  // a workflow run because their logic lived in inline shell.
  const runLines = guard.split("\n").filter((l) => /^\s*run:/.test(l));
  assert.deepEqual(runLines.map((l) => l.trim()), ["run: node .flow/bin/release-guard.mjs"],
    "if this grows any logic, move it into the module");
  assert.ok(!/^\s+(if|for|while|case)\b/m.test(guard), "no shell branching in the step");
  assert.ok(guard.includes("GITHUB_REF_NAME: ${{ github.ref_name }}"),
    "the ref reaches the guard as an ENV VAR — never interpolated into a shell string");
});

test("the guard calls the ADAPTER, not the template's copy", () => {
  const steps = retagSteps();
  assert.ok(!steps[stepWith(steps, "release-guard.mjs")].includes("project-template"),
    "running the template's CLI would default the repo to process.cwd() and check nothing pinned");
});

test("the happy path is unchanged: the edge alias still moves, and v1 is still left alone", () => {
  const steps = retagSteps();
  const move = steps[stepWith(steps, "name: Move the edge tag to this commit")];
  assert.match(move, /git tag -f "\$EDGE"/, "the edge alias must still be moved");
  assert.match(move, /git push -f origin "refs\/tags\/\$EDGE"/, "and still pushed");
  assert.ok(!/git (tag|push)[^\n]*"\$STABLE"/.test(move),
    "the guard must not have turned the canary split into an automatic v1 move — that is the " +
    "decision release-tag.yml's header records, and this task must not reverse it");
});

test("the guard step has a node runtime to run on", () => {
  const steps = retagSteps();
  const setup = stepWith(steps, "uses: actions/setup-node");
  const guard = stepWith(steps, "release-guard.mjs");
  assert.ok(setup >= 0 && setup < guard, "setup-node must precede the guard step");
});

test("the step reader actually found the retag job's steps (guards the assertions above)", () => {
  // Every assertion above is a findIndex over this list. If the reader silently returned [] —
  // an indentation change, a renamed job — `stepWith` returns -1 and `guard < move` is false,
  // which would fail loudly. This pins the reader itself so a failure names the real cause.
  const steps = retagSteps();
  assert.ok(steps.length >= 4, `expected the retag job's steps, got ${steps.length}`);
  assert.ok(steps[0].includes("uses: actions/checkout"), "first step should still be the checkout");
});
