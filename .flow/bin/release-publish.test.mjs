// release-publish.test.mjs — proving tests for flow-0029, one section per acceptance criterion.
//
// THE PROPERTY UNDER TEST IS ABSENCE. Every other helper in this repo is proved by what it
// produces; this one has to be proved by what it does not. A publisher that copies the right
// files and ALSO copies `.flow/tasks/` looks completely correct from the working tree, passes
// any "did the artefact arrive" check, and has permanently exported the planning record the
// split exists to withhold. So the assertions below are weighted towards what must be missing:
// the store, the ADRs, the flightdeck, canonical's own callers, and — the one nobody thinks to
// check — the git history.
//
// The tree tests run against a FIXTURE directory built here rather than against the live repo,
// on purpose (flow-0029's own note): a test that reads `../..` starts passing for the wrong
// reason the day someone deletes a task file, which is precisely the day it should scream.
//
// DEPENDENCY NOTE — see check-workflows.test.mjs. `_flow-gates.yml`'s `flow-tooling` job runs
// `node --test .flow/bin/*.test.mjs` with no install step, and the workflow section needs
// `yaml` to read the file the way GitHub does. Those tests skip visibly there and run for real
// in the per-stack job. Everything else has no dependencies and runs in both.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import {
  aliasTag,
  ALIAS_OUTCOME,
  auditEntries,
  checkTargetRepo,
  decideAliasMove,
  formatAliasReport,
  formatReport,
  globToRegExp,
  makeGitRunner,
  manifestAdmits,
  MANIFEST,
  neverPublishes,
  NEVER_PUBLISH,
  parseRefs,
  readTargetMeta,
  readVersion,
  releaseReadme,
  releaseTag,
  reportAndExit,
  resolveManifest,
  runAliasMirror,
  runPublish,
  tagIsFree,
} from "./release-publish.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const WORKFLOW = join(REPO, ".github/workflows/flow-release-publish.yml");

const git = makeGitRunner();
const tmp = (name) => mkdtempSync(join(tmpdir(), `flow-rp-${name}-`));
const put = (root, rel, body) => {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, "utf8");
};

// A miniature canonical: every category ADR-0005 names on BOTH sides of the boundary, so a
// manifest that is too wide has something to catch it and a manifest that is too narrow has
// something to miss.
const ARTEFACT = [
  "project-template/CLAUDE.md",
  "project-template/.flow/PROTOCOL.md",
  "project-template/.flow/bin/flow-doctor.mjs",
  "project-template/.flow/tasks/_TEMPLATE.md",
  "project-template/.github/workflows/flow-gates.yml",
  "project-template/.claude/skills/task-writer/SKILL.md",
  ".github/workflows/_flow-gates.yml",
  ".github/workflows/_flow-review.yml",
  "LICENSE",
  "NOTICE",
  "VERSION",
  "CHANGELOG.md",
  "docs/adopting-flow-cutover.md",
  "docs/flow-reusable-workflows.md",
  "docs/flow-versioning-policy.md",
  "docs/repinning-a-consuming-repo.md",
];

// What must never cross. Each line is a category, not an example.
const PRIVATE = [
  ".flow/tasks/flow-0029-publish-artefact-to-release-repo.md",  // the store — the whole motivation
  ".flow/tasks/flow-0001-flightdeck-state-aggregator.md",
  ".flow/bin/release-publish.mjs",                              // canonical's adapters
  ".flow/config.yml",                                           // canonical's gate calibration
  ".github/workflows/flow-gates.yml",                           // canonical's own callers
  ".github/workflows/flow-queue-runner.yml",                    // AI-invoking, secret-holding
  ".github/workflows/ci.yml",
  ".github/workflows/release-tag.yml",
  "flightdeck/bin/watchdog.mjs",
  "flightdeck/index.html",
  "docs/adr/0005-split-authoring-from-release.md",
  "docs/flow-infra-propagation-plan.md",                        // planning, not adoption
  "docs/handoff-vision-layer-review.md",
  "VISION.md",
  "CLAUDE.md",
  "package.json",
];

function fixtureTree(version = "1.2.0") {
  const root = tmp("src");
  for (const p of ARTEFACT) put(root, p, p === "VERSION" ? `${version}\n` : `# ${p}\n`);
  for (const p of PRIVATE) put(root, p, `# PRIVATE: ${p}\n`);
  return root;
}

// A bare repo standing in for the release repo. Local, so "no network write" is checkable by
// asserting the thing has no refs.
function fixtureRemote() {
  const dir = tmp("remote");
  const bare = join(dir, "remote.git");
  git(["init", "--quiet", "--bare", bare]);
  return bare;
}
// `git show-ref` exits 1 on a repository with NO refs — which is the state every "it must not
// have pushed" assertion below is looking for. Treat the non-zero exit as the empty list it is.
const refsIn = (bare) => {
  let out = "";
  try { out = git(["show-ref"], { cwd: bare }).trim(); } catch { return []; }
  return out === "" ? [] : out.split("\n").map((l) => l.split(" ")[1]);
};
const PUBLIC_TARGET = { private: false, visibility: "public", topics: ["automation"] };

// ── criterion 1: the tree contains every artefact path and nothing from the store ──

test("criterion 1 — the computed tree carries every artefact path", () => {
  const root = fixtureTree();
  try {
    const { entries, missing } = resolveManifest(root);
    assert.deepEqual(missing, [], "no manifest entry may name a path the source tree lacks");
    const got = new Set(entries.map((e) => e.path));
    for (const p of ARTEFACT) assert.ok(got.has(p), `artefact path "${p}" must be published`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("criterion 1 — no path under .flow/tasks/, and nothing else private, is in the tree", () => {
  const root = fixtureTree();
  try {
    const paths = resolveManifest(root).entries.map((e) => e.path);
    assert.equal(paths.filter((p) => p.startsWith(".flow/tasks/")).length, 0,
      "the task store is the entire reason ADR-0005 exists — it must never be in the publish set");
    for (const p of PRIVATE) {
      assert.ok(!paths.includes(p), `"${p}" must not cross the boundary`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("criterion 1 — the template's own .flow/tasks/ still crosses; the deny list is root-anchored", () => {
  // The distinction the whole split turns on: `.flow/tasks/` is canonical's private store,
  // `project-template/.flow/tasks/` is the fixture store an adopter is handed. A substring
  // match instead of an anchored prefix would silently drop half the template.
  assert.ok(neverPublishes(".flow/tasks/flow-0001.md"));
  assert.ok(!neverPublishes("project-template/.flow/tasks/_TEMPLATE.md"));
  assert.ok(manifestAdmits("project-template/.flow/tasks/_TEMPLATE.md"));
  assert.ok(!manifestAdmits(".flow/tasks/flow-0001.md"));
});

test("criterion 1 — a renamed or deleted artefact path fails rather than shipping a smaller tree", () => {
  const root = fixtureTree();
  try {
    rmSync(join(root, "docs/flow-versioning-policy.md"));
    const { missing } = resolveManifest(root);
    assert.deepEqual(missing, ["docs/flow-versioning-policy.md"]);
    const v = runPublish({ sourceRoot: root, dryRun: true });
    assert.ok(v.problems.some((p) => p.includes("docs/flow-versioning-policy.md")),
      "an adopter cannot tell a missing runbook from a publish bug — so this must be loud");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("criterion 1 — the manifest publishes reusables only, never canonical's own callers", () => {
  assert.ok(manifestAdmits(".github/workflows/_flow-gates.yml"));
  assert.ok(!manifestAdmits(".github/workflows/flow-gates.yml"),
    "the leading underscore is the whole distinction: `flow-*.yml` are canonical's AI-invoking callers");
  assert.ok(neverPublishes(".github/workflows/flow-queue-runner.yml"));
  // The glob is single-segment by design; prove it does not reach into subdirectories.
  assert.ok(!globToRegExp(".github/workflows/_flow-*.yml").test(".github/workflows/nested/_flow-x.yml"));
});

// ── criterion 2: a manifest error fails before any push, and names the path ──

test("criterion 2 — a widened manifest is refused before any push, naming the offending path", () => {
  const root = fixtureTree();
  const bare = fixtureRemote();
  const work = join(tmp("work"), "stage");
  try {
    // The realistic manifest error: someone writes `.flow/` where they meant the template's.
    const broken = { ...MANIFEST, trees: ["project-template/", ".flow/"] };
    const v = runPublish({
      sourceRoot: root, workDir: work, remote: bare, git,
      manifest: broken, targetMeta: PUBLIC_TARGET,
    });

    assert.equal(v.published, false);
    assert.ok(v.problems.length > 0, "the audit is a second opinion on the manifest, not a restatement of it");
    assert.ok(
      v.problems.some((p) => p.includes(".flow/tasks/flow-0029-publish-artefact-to-release-repo.md")),
      `the offending path must be named; got: ${v.problems.join(" | ")}`,
    );
    assert.deepEqual(refsIn(bare), [], "it must fail BEFORE any push — a refused publish leaves no refs");
    assert.equal(existsSync(work), false, "and before writing a staging tree");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 2 — the audit also rejects a path the manifest admits nothing about", () => {
  const offenders = auditEntries([{ path: "secrets/prod.env", from: "secrets/prod.env" }]);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].reason, "outside the manifest");
});

test("criterion 2 — the never-publish list covers every category ADR-0005 names", () => {
  // Canonical's root host file is the one exclusion, and it is deliberate: naming it in this
  // directory's executable code fails protocol-portability.test.mjs, which is flow-0006's
  // vendor-neutrality guard. The allow-list is what keeps it out — asserted separately below.
  for (const p of PRIVATE.filter((p) => p !== "CLAUDE.md")) {
    assert.ok(neverPublishes(p), `"${p}" must be on the never-publish list`);
  }
  assert.ok(NEVER_PUBLISH.includes(".flow/"), "the store, the adapters and the gate config in one prefix");
});

test("criterion 2 — canonical's root host file is kept out by the allow-list, not by name", () => {
  const hostFile = ["CLAUDE", "md"].join(".");   // assembled, so this file states the rule without binding to it
  assert.ok(!manifestAdmits(hostFile), "canonical's own host file is not artefact");
  assert.ok(manifestAdmits(`project-template/${hostFile}`), "the TEMPLATE's host file is what an adopter is handed");
  assert.equal(auditEntries([{ path: hostFile, from: hostFile }])[0].reason, "outside the manifest");
});

test("criterion 2 — a symlink cannot smuggle a tree past the audit under an admitted prefix", () => {
  const root = fixtureTree();
  const bare = fixtureRemote();
  const work = join(tmp("work"), "stage");
  try {
    // The bypass the deny list cannot see on its own: every path this would publish begins
    // `project-template/`, which the manifest admits, so following the link would export the
    // store with a clean audit. Raised as a non-blocking note on PR #48; fixed because it
    // reaches the one outcome this module exists to prevent.
    symlinkSync(join(root, ".flow/tasks"), join(root, "project-template/notes"));

    const { symlinks, entries } = resolveManifest(root);
    assert.deepEqual(symlinks, ["project-template/notes"], "the link is reported, not followed");
    assert.equal(entries.filter((e) => e.path.startsWith("project-template/notes")).length, 0);

    const v = runPublish({ sourceRoot: root, workDir: work, remote: bare, git, targetMeta: PUBLIC_TARGET });
    assert.equal(v.published, false);
    assert.ok(v.problems.some((p) => p.includes("project-template/notes") && p.includes("symlink")),
      `the link must be named; got: ${v.problems.join(" | ")}`);
    assert.deepEqual(refsIn(bare), [], "refused before any push");
    // And the smuggled content never reached the file list at all.
    assert.equal(v.files.filter((f) => f.includes("flow-0029")).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 2 — a symlinked `files` entry is refused too, not just one inside a tree", () => {
  // The gap the first symlink fix left, caught by the security check on PR #48: `manifest.files`
  // does not go through walkTree, so it had only an existsSync. `copyFileSync` dereferences,
  // which would have published the store's content under a trusted artefact filename — and the
  // audit sees only `docs/repinning-a-consuming-repo.md`, which it admits.
  const root = fixtureTree();
  const bare = fixtureRemote();
  const work = join(tmp("work"), "stage");
  try {
    const victim = "docs/repinning-a-consuming-repo.md";
    rmSync(join(root, victim));
    symlinkSync(join(root, ".flow/tasks/flow-0029-publish-artefact-to-release-repo.md"), join(root, victim));

    const { symlinks, entries } = resolveManifest(root);
    assert.deepEqual(symlinks, [victim], "the link is reported, not dereferenced");
    assert.equal(entries.filter((e) => e.path === victim).length, 0);

    const v = runPublish({ sourceRoot: root, workDir: work, remote: bare, git, targetMeta: PUBLIC_TARGET });
    assert.equal(v.published, false);
    assert.ok(v.problems.some((p) => p.includes(victim) && p.includes("symlink")));
    assert.deepEqual(refsIn(bare), [], "refused before any push");
    assert.equal(existsSync(work), false, "and before writing a staging tree");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 2 — every manifest category is symlink-guarded, so a new one cannot forget", () => {
  // A guard applied per-category is a guard someone adds a category around. Assert the property
  // over the whole resolved set rather than over the two categories that happen to exist.
  const root = fixtureTree();
  try {
    symlinkSync(join(root, ".flow/tasks"), join(root, "project-template/.claude/leak"));
    rmSync(join(root, "NOTICE"));
    symlinkSync(join(root, ".flow/config.yml"), join(root, "NOTICE"));
    // The third category. Flagged on PR #48: the comment above claimed the whole resolved set
    // while the assertions covered two of three, which is the same overclaiming this file
    // exists to catch elsewhere.
    rmSync(join(root, ".github/workflows/_flow-review.yml"));
    symlinkSync(join(root, ".flow/tasks/flow-0001-flightdeck-state-aggregator.md"),
                join(root, ".github/workflows/_flow-review.yml"));

    const { entries, symlinks } = resolveManifest(root);
    assert.ok(symlinks.includes("NOTICE"), "a files entry");
    assert.ok(symlinks.includes("project-template/.claude/leak"), "a trees entry");
    assert.ok(symlinks.includes(".github/workflows/_flow-review.yml"), "a globs entry");
    assert.equal(entries.filter((e) => e.path === ".github/workflows/_flow-review.yml").length, 0,
      "a symlink matching the glob must not reach the publish set");
    for (const e of entries) {
      if (e.generated) continue;
      assert.equal(lstatSync(join(root, e.from)).isSymbolicLink(), false,
        `"${e.path}" reached the publish set as a symlink — copyFileSync would dereference it`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("globToRegExp escapes every regex metacharacter it could meet in a path", () => {
  // `?` is a metacharacter and was missing from the escape set — harmless for today's single
  // glob, but a future one carrying a literal `?` would have silently changed match semantics.
  assert.ok(globToRegExp("docs/what?.md").test("docs/what?.md"));
  assert.ok(!globToRegExp("docs/what?.md").test("docs/whatx.md"));
  assert.ok(globToRegExp("docs/a+b.md").test("docs/a+b.md"));
  assert.ok(!globToRegExp("docs/a.md").test("docs/aXmd"), "the dot is a literal, not a wildcard");
});

// ── criterion 3: the published commit has no parent from canonical's history ──

test("criterion 3 — the published commit is parentless, and the repo holds exactly one commit", () => {
  const root = fixtureTree();
  const bare = fixtureRemote();
  const work = join(tmp("work"), "stage");
  try {
    const v = runPublish({ sourceRoot: root, workDir: work, remote: bare, git, targetMeta: PUBLIC_TARGET });
    assert.deepEqual(v.problems, []);
    assert.equal(v.published, true);

    const parents = git(["log", "-1", "--format=%P", "v1.2.0"], { cwd: bare }).trim();
    assert.equal(parents, "", "a parent is a history leak — every task-state commit rides along with it");
    const count = git(["rev-list", "--count", "v1.2.0"], { cwd: bare }).trim();
    assert.equal(count, "1", "one squashed commit per release (ADR-0005), not a filtered history");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 3 — the pushed tree itself carries the artefact and none of the store", () => {
  const root = fixtureTree();
  const bare = fixtureRemote();
  const work = join(tmp("work"), "stage");
  try {
    runPublish({ sourceRoot: root, workDir: work, remote: bare, git, targetMeta: PUBLIC_TARGET });
    const tree = git(["ls-tree", "-r", "--name-only", "v1.2.0"], { cwd: bare }).trim().split("\n");
    for (const p of ARTEFACT) assert.ok(tree.includes(p), `"${p}" must be in the published tree`);
    for (const p of PRIVATE) assert.ok(!tree.includes(p), `"${p}" must NOT be in the published tree`);
    assert.ok(tree.includes("README.md"), "ADR-0005 asks the release repo to carry a README of its own");
    // Apache-2.0 §4(d): a redistributor carries NOTICE. The snapshot replaces the tree, so a
    // hand-added copy in the release repo would be destroyed by the next publish.
    assert.ok(tree.includes("LICENSE") && tree.includes("NOTICE"));
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 3 — the release README is generated, not copied from canonical's own", () => {
  const root = fixtureTree();
  const bare = fixtureRemote();
  const work = join(tmp("work"), "stage");
  try {
    put(root, "README.md", "# Canonical Flow — the AUTHORING repo\n");
    runPublish({ sourceRoot: root, workDir: work, remote: bare, git, targetMeta: PUBLIC_TARGET });
    const published = git(["show", "v1.2.0:README.md"], { cwd: bare });
    assert.ok(!published.includes("AUTHORING"), "canonical's own README describes the wrong repository");
    assert.match(published, /published mirror/i);
    assert.match(published, /Do not send pull requests/i);
    assert.ok(published.includes("v1.2.0"), "the README states the version it is a snapshot of");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

// ── criterion 4: the dry run reports, writes nothing, and exits zero ──

test("criterion 4 — a dry run reports the file list and the tag, writes nothing, and exits 0", () => {
  const root = fixtureTree();
  const bare = fixtureRemote();
  const work = join(tmp("work"), "stage");
  try {
    const v = runPublish({ sourceRoot: root, workDir: work, remote: bare, git, dryRun: true });

    assert.deepEqual(v.problems, [], "a clean dry run has nothing to report as a problem");
    assert.equal(v.published, false);
    assert.equal(v.tag, "v1.2.0", "the dry run states the tag it WOULD create");
    for (const p of ARTEFACT) assert.ok(v.files.includes(p), `the dry run must list "${p}"`);

    assert.deepEqual(refsIn(bare), [], "no network write: the target still has no refs");
    assert.equal(existsSync(work), false, "and no staging tree was written");

    const lines = formatReport(v);
    assert.ok(lines.some((l) => l.includes("+ LICENSE")), "the report is the file list");
    assert.ok(lines.at(-1).includes("decision=dry-run") && lines.at(-1).includes("v1.2.0"));

    // "exits zero" through the real exit path, not a shim: reportAndExit is what the CLI calls.
    let code = null;
    const logged = [];
    reportAndExit(v, { log: (l) => logged.push(l), exit: (c) => { code = c; } });
    assert.equal(code, 0, "a clean dry run exits zero");
    assert.ok(logged.some((l) => l.includes("+ VERSION")));
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 4 — a refused publish exits non-zero, and --json emits the whole verdict", () => {
  let code = null;
  const logged = [];
  const verdict = { version: "1.2.0", tag: "v1.2.0", files: [], problems: ["nope"], notes: [], published: false };
  reportAndExit(verdict, { json: true, log: (l) => logged.push(l), exit: (c) => { code = c; } });
  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(logged.join("\n")).problems, ["nope"]);
});

test("criterion 4 — a dry run still reports the blocker that would stop the real run", () => {
  const root = fixtureTree();
  const bare = fixtureRemote();
  try {
    runPublish({ sourceRoot: root, workDir: join(tmp("w1"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET });
    const v = runPublish({ sourceRoot: root, workDir: join(tmp("w2"), "s"), remote: bare, git, dryRun: true });
    assert.ok(v.problems.some((p) => p.includes("already exists on the target")),
      "a dry run that hides the one condition which will stop the real run is a dry run that lies");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

// ── criterion 5: an existing tag is refused, never moved ──

test("criterion 5 — a second publish of the same version is refused and the tag does not move", () => {
  const root = fixtureTree();
  const bare = fixtureRemote();
  try {
    const first = runPublish({ sourceRoot: root, workDir: join(tmp("w1"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET });
    assert.equal(first.published, true);
    const before = git(["rev-parse", "v1.2.0"], { cwd: bare }).trim();

    // Change the tree, so a publish that DID move the tag would be visibly different.
    put(root, "CHANGELOG.md", "# changed after the first release\n");
    const second = runPublish({ sourceRoot: root, workDir: join(tmp("w2"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET });

    assert.equal(second.published, false);
    assert.ok(second.problems.some((p) => p.includes("v1.2.0 already exists on the target")));
    assert.equal(git(["rev-parse", "v1.2.0"], { cwd: bare }).trim(), before,
      "a moved tag silently changes what every pinned adopter runs");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 5 — tagIsFree reads ls-remote output, peeled annotated refs included", () => {
  const ls = [
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/tags/v1.1.0",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\trefs/tags/v1.2.0^{}",
  ].join("\n");
  assert.equal(tagIsFree(ls, "v1.3.0"), true);
  assert.equal(tagIsFree(ls, "v1.1.0"), false);
  assert.equal(tagIsFree(ls, "v1.2.0"), false, "an annotated tag's peeled ref still means the tag exists");
  assert.equal(tagIsFree("", "v1.0.0"), true, "an empty target has every tag free");
});

// ── criterion 6: the tag is derived from VERSION ──

test("criterion 6 — the tag published is the one VERSION produces, so the stamp cannot disagree", () => {
  const root = fixtureTree("2.5.1");
  const bare = fixtureRemote();
  try {
    assert.equal(readVersion(root), "2.5.1");
    const v = runPublish({ sourceRoot: root, workDir: join(tmp("w"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET });
    assert.equal(v.tag, "v2.5.1");
    assert.equal(git(["show", "v2.5.1:VERSION"], { cwd: bare }).trim(), "2.5.1",
      "the tag and the VERSION inside the tree it points at are the same release, by construction");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 6 — a VERSION that is not MAJOR.MINOR.PATCH is refused, not coerced", () => {
  assert.equal(releaseTag("1.2.0"), "v1.2.0");
  assert.equal(releaseTag("v1.2.0"), null);
  assert.equal(releaseTag("1.2"), null);
  assert.equal(releaseTag("1.2.0-rc1"), null);
  assert.equal(releaseTag(undefined), null);

  const root = fixtureTree();
  try {
    put(root, "VERSION", "not-a-version\n");
    const v = runPublish({ sourceRoot: root, dryRun: true });
    assert.ok(v.problems.some((p) => p.includes("expected MAJOR.MINOR.PATCH")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── criterion 7: the workflow's permissions block, and the pins it carries ──

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";
const wf = yamlMod && existsSync(WORKFLOW) ? yamlMod.parse(readFileSync(WORKFLOW, "utf8")) : { jobs: {} };

test("criterion 7 — the workflow grants contents: read and nothing else", { skip }, () => {
  assert.deepEqual(wf.permissions, { contents: "read" },
    "GITHUB_TOKEN reaches CANONICAL here and canonical is only read — the push uses a separate PAT. " +
    "If this assertion is failing because a scope was added, the scope is the thing to justify.");
  for (const [name, job] of Object.entries(wf.jobs)) {
    assert.equal(job.permissions, undefined,
      `job "${name}" must not re-declare permissions — a job-level block silently replaces the top-level one`);
  }
});

test("criterion 7 — the publish never writes to canonical and never echoes the credential", { skip }, () => {
  const steps = wf.jobs.publish.steps.map((s) => String(s.run ?? ""));
  const all = steps.join("\n");
  assert.ok(!/echo[^\n]*FLOW_RELEASE_PAT/.test(all), "the PAT must never be echoed");
  assert.ok(!/https:\/\/[^\s"']*\$\{?FLOW_RELEASE_PAT/.test(all),
    "the PAT must not be interpolated into a remote URL — git echoes a failing remote into stderr");
  assert.ok(all.includes("::add-mask::"), "the derived auth header must be masked in the run log");

  // Raised as a Low by the security check on PR #48: `git config --global` would leave the
  // header configured for the rest of the runner's life. Scope it to the publish command's
  // process tree instead — which also has to survive being inherited by the git processes the
  // PUBLISHER spawns, so a per-invocation `git -c` in this file cannot do the job.
  assert.ok(!/git config --global/.test(all),
    "the credential must not be written to the runner's global git config");
  assert.ok(all.includes("GIT_CONFIG_COUNT=1") && all.includes("GIT_CONFIG_KEY_0"),
    "the auth header is scoped to the publish command via GIT_CONFIG_*, inherited by its git children");

  // The header of the workflow claims the credential never reaches argv. It did, once, in the
  // metadata fetch — a curl header flag puts it in a process's argv for the life of the
  // request. Raised as a Low on PR #48; pinned here so the claim and the file cannot diverge.
  assert.ok(!/(^|\s)(-H|--header)\s+\S*FLOW_RELEASE_PAT/.test(all),
    "the PAT must not be passed through a command-line flag — it lands in argv, readable by ps");
  assert.ok(all.includes("--config -"), "curl reads the auth header from stdin instead");

  // Nothing after checkout reaches canonical through git, and this job runs `git push`.
  assert.equal(wf.jobs.publish.steps[0].with?.["persist-credentials"], false,
    "GITHUB_TOKEN must not be left configured in the checkout for the rest of the job");
});

test("criterion 7 — every third-party action is pinned to a 40-character commit SHA", { skip }, () => {
  const uses = wf.jobs.publish.steps.map((s) => s.uses).filter(Boolean);
  assert.ok(uses.length > 0, "an assertion over an empty list is not a check");
  for (const u of uses) {
    assert.match(u, /@[0-9a-f]{40}$/,
      `"${u}" must be pinned to a commit SHA: a tag is a mutable pointer, and this job holds a ` +
      "credential that can write the repository the whole fleet resolves");
  }
});

test("criterion 7 — the job is dormant until a human turns it on", { skip }, () => {
  assert.match(String(wf.jobs.publish.if), /vars\.FLOW_RELEASE_PUBLISH/,
    "creating the release repo and minting the PAT are human-only steps — merging this must turn nothing on");
});

test("criterion 7 — the release trigger and a dispatchable dry run both exist", { skip }, () => {
  const on = wf.on ?? wf[true];   // `on:` is YAML 1.1 boolean-true when unquoted
  assert.deepEqual(on.release?.types, ["published"]);
  assert.equal(on.workflow_dispatch?.inputs?.dry_run?.default, true,
    "the dispatchable default must be the harmless one");
});

// ── the target-repository preconditions (the two the authoring session could not check) ──

test("a private target is refused — its reusables cannot be resolved by an adopter's uses:", () => {
  const problems = checkTargetRepo({ private: true, topics: [] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /PRIVATE/);
  assert.deepEqual(checkTargetRepo(PUBLIC_TARGET), []);
});

test("a target carrying the `flow` topic is refused — it would enrol as a phantom project", () => {
  const problems = checkTargetRepo({ private: false, topics: ["flow", "automation"] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /phantom project/);
});

test("a real publish with no target metadata is refused rather than run unchecked", () => {
  const root = fixtureTree();
  const bare = fixtureRemote();
  try {
    const v = runPublish({ sourceRoot: root, workDir: join(tmp("w"), "s"), remote: bare, git, targetMeta: null });
    assert.ok(v.problems.some((p) => p.includes("was not supplied")),
      "a failed metadata fetch must not degrade into an unchecked publish");
    assert.deepEqual(refsIn(bare), []);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("a real publish with no remote is refused", () => {
  const root = fixtureTree();
  try {
    const v = runPublish({ sourceRoot: root, targetMeta: PUBLIC_TARGET });
    assert.ok(v.problems.some((p) => p.includes("no --remote given")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("malformed target metadata is a named problem, not an unhandled parse error", () => {
  // Fails closed either way — runPublish refuses without metadata — but a parse trace does not
  // say which file it was reading. Raised as non-blocking on PR #48.
  const bad = readTargetMeta("/some/target.json", () => "{ not json");
  assert.equal(bad.meta, null);
  assert.match(bad.problem, /could not read target metadata from "\/some\/target\.json"/);

  assert.deepEqual(readTargetMeta(undefined), { meta: null, problem: null },
    "no --target-meta at all is a different case: runPublish reports it, and a dry run allows it");
  assert.deepEqual(readTargetMeta("/t.json", () => '{"private":false,"topics":[]}').meta,
    { private: false, topics: [] });

  // Valid JSON that is not an object used to FAIL OPEN: checkTargetRepo reads `.private` and
  // `.topics` off it, both come back empty on a number or a string, and the publish proceeds
  // with the target unchecked. That is the one thing a guard must never do.
  for (const shape of ["123", '"ok"', "null", "[]"]) {
    const r = readTargetMeta("/t.json", () => shape);
    assert.equal(r.meta, null, `metadata \`${shape}\` must not be accepted as a target`);
    assert.match(r.problem, /is not a JSON object/);
  }

  // One cause, one message — the specific reason replaces the generic one rather than stacking
  // on top of it. Raised as non-blocking on PR #48.
  const root = fixtureTree();
  try {
    const v = runPublish({ sourceRoot: root, remote: "/nowhere.git", targetMeta: null, targetMetaProblem: bad.problem });
    const meta = v.problems.filter((p) => p.includes("metadata"));
    assert.equal(meta.length, 1, `one problem for one cause; got: ${meta.join(" | ")}`);
    assert.equal(meta[0], bad.problem);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a missing VERSION is a problem, not a crash", () => {
  const root = tmp("empty");
  try {
    assert.equal(readVersion(root), null);
    const v = runPublish({ sourceRoot: root, dryRun: true });
    assert.ok(v.problems.some((p) => p.includes("no readable VERSION")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the report names the version, the tag, the count and a machine-readable decision", () => {
  const lines = formatReport({ version: "1.2.0", tag: "v1.2.0", files: ["LICENSE"], problems: [], notes: [], published: true });
  assert.match(lines[0], /version=1\.2\.0 tag=v1\.2\.0 files=1/);
  assert.equal(lines.at(-1), "release-publish: decision=published tag=v1.2.0");

  const refused = formatReport({ version: "1.2.0", tag: "v1.2.0", files: [], problems: ["nope"], notes: [], published: false });
  assert.equal(refused.at(-1), "release-publish: decision=refused problems=1");
});

test("releaseReadme points contributions at issues and never links the private authoring repo", () => {
  const md = releaseReadme({ version: "1.2.0", tag: "v1.2.0" });
  // After the split the authoring repo is private, so a link to it would 404 for every reader.
  assert.ok(!md.includes("CandidDan/flow"), "the public README must not point at a private repo");
  assert.match(md, /issues/i);
  assert.match(md, /Apache-2\.0/);
  assert.match(md, /NOTICE/);
  assert.match(md, /carries no history/i);
});

// ── flow-0045: the floating alias the fleet actually pins ───────────────────────────────
//
// THE PROPERTY UNDER TEST IS AN ASYMMETRY. `vX.Y.Z` and `vX` are both tags on the same remote
// and the rules for them are opposites: the release tag is REFUSED when it already exists, the
// alias is moved BECAUSE it already exists. A later simplification that notices "two tag checks,
// surely one function" breaks the fleet in whichever direction it picks — either the alias stops
// moving (every adopting repo silently frozen on the previous release) or the immutable tag
// starts moving (every pinned adopter silently running different code). So the two rules are
// asserted against the SAME ls-remote output, in the same file, deliberately adjacent.
//
// The decisions are proved as pure functions over `ls-remote` output and the stamp, as
// `tagIsFree` already is — not by a live push. A live push proves a fixture; the bare-repo
// tests below are the belt to that braces, not the proof.

// One target's refs: the release repo after v1.2.0 and v1.3.0 have been published and `v1`
// still points at the older of the two. This is the exact state canonical was in on 2026-09-15,
// minus the `v1` that did not exist at all.
const TARGET_REFS = [
  "1111111111111111111111111111111111111111\trefs/heads/main",
  "2222222222222222222222222222222222222222\trefs/tags/v1.2.0",
  "3333333333333333333333333333333333333333\trefs/tags/v1.3.0",
  "2222222222222222222222222222222222222222\trefs/tags/v1",
].join("\n");

test("criterion 1 — the alias is decided onto the same commit as the release tag it names", () => {
  const d = decideAliasMove({ lsRemoteOutput: TARGET_REFS, version: "1.3.0", pushedRef: "v1" });
  assert.deepEqual(d.problems, []);
  assert.equal(d.alias, "v1");
  assert.equal(d.tag, "v1.3.0");
  assert.equal(d.target, "3333333333333333333333333333333333333333",
    "the alias must land on the commit v1.3.0 points at — that is what `@v1` resolving to this release means");
  assert.equal(d.current, "2222222222222222222222222222222222222222");
  assert.equal(d.move, true);
  assert.deepEqual(d.refsTouched, ["refs/tags/v1"], "one ref moves, and it is the alias");
});

test("criterion 1 — after the mirror, vX and vX.Y.Z are the same commit on the target", () => {
  const root = fixtureTree("1.3.0");
  const bare = fixtureRemote();
  const work = join(tmp("alias"), "a");
  try {
    assert.equal(runPublish({ sourceRoot: root, workDir: join(tmp("w"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET }).published, true);
    assert.ok(!refsIn(bare).includes("refs/tags/v1"),
      "publishing must NOT create the alias — that is the canary-preserving half of this task");

    const v = runAliasMirror({ sourceRoot: root, remote: bare, git, workDir: work, pushedRef: "v1" });
    assert.deepEqual(v.problems, []);
    assert.equal(v.outcome, ALIAS_OUTCOME.moved);
    assert.equal(v.moved, true);
    assert.ok(refsIn(bare).includes("refs/tags/v1"), "the ref the fleet pins now exists on the release repo");
    assert.equal(git(["rev-parse", "v1^{commit}"], { cwd: bare }).trim(),
                 git(["rev-parse", "v1.3.0^{commit}"], { cwd: bare }).trim());
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 1 — a mirror that has nothing to do says so and pushes nothing", () => {
  const d = decideAliasMove({ lsRemoteOutput: TARGET_REFS, version: "1.2.0", pushedRef: "v1" });
  assert.deepEqual(d.problems, []);
  assert.equal(d.move, false, "v1 already points at v1.2.0's commit");
  assert.deepEqual(d.refsTouched, [], "a no-op must not claim to have written a ref");
});

test("criterion 1 — the alias is refused when the release it names is not on the target", () => {
  const d = decideAliasMove({ lsRemoteOutput: TARGET_REFS, version: "1.4.0", pushedRef: "v1" });
  assert.equal(d.move, false);
  assert.ok(d.problems.some((p) => p.includes("does not carry v1.4.0")),
    "pointing the fleet's alias at a release nobody published is worse than not moving it");
  assert.deepEqual(d.refsTouched, []);
});

test("criterion 1 — a ref the stamp does not name is refused, not mirrored", () => {
  const d = decideAliasMove({ lsRemoteOutput: TARGET_REFS, version: "1.3.0", pushedRef: "v2" });
  assert.equal(d.move, false);
  assert.ok(d.problems.some((p) => p.includes('the ref that moved is "v2"')),
    "a v2 pushed onto a tree stamped 1.3.0 would point the fleet's v2 at a 1.x release");
});

test("criterion 2 — the SAME target state refuses the release tag and moves the alias", () => {
  // Both rules, one ls-remote output, one test. This is the assertion that stops a later
  // "surely these two tag checks are the same function" from shipping.
  assert.equal(tagIsFree(TARGET_REFS, "v1.3.0"), false,
    "v1.3.0 exists on the target — a publish must refuse it");
  assert.equal(decideAliasMove({ lsRemoteOutput: TARGET_REFS, version: "1.3.0" }).move, true,
    "v1 exists on the target too — and is moved anyway, because an alias's whole job is to move");
});

test("criterion 2 — a re-publish still refuses the immutable tag while the alias stays movable", () => {
  const root = fixtureTree("1.3.0");
  const bare = fixtureRemote();
  try {
    runPublish({ sourceRoot: root, workDir: join(tmp("w1"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET });
    const frozen = git(["rev-parse", "v1.3.0"], { cwd: bare }).trim();

    put(root, "CHANGELOG.md", "# changed after the first release\n");
    const second = runPublish({ sourceRoot: root, workDir: join(tmp("w2"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET });
    assert.equal(second.published, false);
    assert.ok(second.problems.some((p) => p.includes("refusing to move it")),
      "the existing 'refusing to move it' problem must survive this change verbatim");
    assert.equal(git(["rev-parse", "v1.3.0"], { cwd: bare }).trim(), frozen);

    // Same repo, same moment: the alias moves. Twice, to prove the second move is not refused.
    for (const _ of [0, 1]) {
      const v = runAliasMirror({ sourceRoot: root, remote: bare, git, workDir: join(tmp("a"), "a") });
      assert.ok([ALIAS_OUTCOME.moved, ALIAS_OUTCOME.current].includes(v.outcome), v.problems.join(" | "));
    }
    assert.equal(git(["rev-parse", "v1^{commit}"], { cwd: bare }).trim(),
                 git(["rev-parse", "v1.3.0^{commit}"], { cwd: bare }).trim());
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 3 — the alias is derived from the stamp, so 2.0.0 touches v2 and never v1", () => {
  assert.equal(aliasTag("1.3.0"), "v1");
  assert.equal(aliasTag("2.0.0"), "v2");
  assert.equal(aliasTag("10.4.2"), "v10", "the major is a segment, not a character");
  assert.equal(aliasTag("v1.3.0"), null);
  assert.equal(aliasTag("1.3"), null);
  assert.equal(aliasTag("1.3.0-rc1"), null);
  assert.equal(aliasTag(undefined), null);

  const refs = `${TARGET_REFS}\n4444444444444444444444444444444444444444\trefs/tags/v2.0.0`;
  const d = decideAliasMove({ lsRemoteOutput: refs, version: "2.0.0", pushedRef: "v2" });
  assert.equal(d.alias, "v2");
  assert.equal(d.tag, "v2.0.0");
  assert.equal(d.target, "4444444444444444444444444444444444444444");
  assert.deepEqual(d.refsTouched, ["refs/tags/v2"]);
  assert.ok(!d.refsTouched.includes("refs/tags/v1"),
    "a major bump must leave the 1.x fleet exactly where it is — nothing moves until it opts in");

  // And the refusal path, so a bad stamp cannot be coerced into an alias.
  const bad = decideAliasMove({ lsRemoteOutput: refs, version: "not-a-version" });
  assert.equal(bad.alias, null);
  assert.deepEqual(bad.refsTouched, []);
  assert.ok(bad.problems.some((p) => p.includes("expected MAJOR.MINOR.PATCH")));
});

test("criterion 4 — a release whose tag lands and whose alias does not FAILS, and is named", () => {
  // A git runner that reads happily and refuses exactly the alias push: the partial state.
  const failing = (args, opts) => {
    if (args[0] === "push") throw new Error("remote: Permission to CandidDan/flow-protocol.git denied");
    return git(args, opts);
  };
  const root = fixtureTree("1.3.0");
  const bare = fixtureRemote();
  try {
    runPublish({ sourceRoot: root, workDir: join(tmp("w"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET });
    const v = runAliasMirror({ sourceRoot: root, remote: bare, git: failing, workDir: join(tmp("a"), "a"), pushedRef: "v1" });

    assert.equal(v.moved, false);
    assert.equal(v.outcome, ALIAS_OUTCOME.orphaned);
    assert.equal(v.outcome, "published-without-its-alias",
      "the verdict must distinguish this from a success — the tag list looks healthy either way");
    assert.ok(v.problems.length > 0, "problems drive the non-zero exit; an empty list would exit 0");
    assert.ok(v.problems.some((p) => p.includes("PUBLISHED WITHOUT ITS ALIAS") && p.includes("v1")));

    // The job summary is the publisher's stdout, so the distinction has to survive formatting.
    const lines = formatAliasReport(v);
    assert.equal(lines.at(-1), "release-alias: decision=published-without-its-alias alias=v1");
    assert.ok(lines.some((l) => l.startsWith("PROBLEM:")));

    // And the exit code, which is what actually reddens the job.
    let code = null;
    reportAndExit(v, { log: () => {}, exit: (c) => { code = c; }, format: formatAliasReport });
    assert.equal(code, 1, "a run that published without the ref the fleet pins must not report success");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 4 — a successful mirror and a dry run are each distinguishable in the report", () => {
  const moved = formatAliasReport({
    version: "1.3.0", alias: "v1", tag: "v1.3.0", target: "3".repeat(40), current: "2".repeat(40),
    outcome: ALIAS_OUTCOME.moved, moved: true, refsTouched: ["refs/tags/v1"], problems: [], notes: ["moved"],
  });
  assert.match(moved[0], /version=1\.3\.0 alias=v1 release-tag=v1\.3\.0/);
  assert.equal(moved.at(-1), "release-alias: decision=alias-moved alias=v1");

  const root = fixtureTree("1.3.0");
  const bare = fixtureRemote();
  try {
    runPublish({ sourceRoot: root, workDir: join(tmp("w"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET });
    const dry = runAliasMirror({ sourceRoot: root, remote: bare, git, workDir: join(tmp("a"), "a"), dryRun: true });
    assert.equal(dry.outcome, ALIAS_OUTCOME.dryRun);
    assert.equal(dry.moved, false);
    assert.ok(!refsIn(bare).includes("refs/tags/v1"), "a dry run must push nothing");
    assert.ok(dry.notes.some((n) => n.includes("would move v1")));
    // The one condition that would stop the real run is still reported by the dry run.
    assert.deepEqual(dry.problems, []);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("criterion 4 — a publish names the alias it deliberately did not move", () => {
  const root = fixtureTree("1.3.0");
  const bare = fixtureRemote();
  try {
    const v = runPublish({ sourceRoot: root, workDir: join(tmp("w"), "s"), remote: bare, git, targetMeta: PUBLIC_TARGET });
    assert.equal(v.published, true);
    assert.equal(v.alias, "v1");
    assert.ok(v.notes.some((n) => n.includes("deliberately NOT moved")),
      "'published' and 'published, alias still on the previous release' must be readable apart");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test("a mirror run refuses rather than crashing when it has nothing to work with", () => {
  const empty = tmp("empty");
  try {
    const v = runAliasMirror({ sourceRoot: empty, remote: "/nowhere.git", git });
    assert.equal(v.outcome, ALIAS_OUTCOME.refused);
    assert.ok(v.problems.some((p) => p.includes("no readable VERSION")));

    const root = fixtureTree("1.3.0");
    const noRemote = runAliasMirror({ sourceRoot: root, git });
    assert.ok(noRemote.problems.some((p) => p.includes("nothing to mirror to")));
    const noGit = runAliasMirror({ sourceRoot: root, remote: "/nowhere.git" });
    assert.ok(noGit.problems.some((p) => p.includes("no git runner")));
    const unreadable = runAliasMirror({ sourceRoot: root, remote: "/nowhere.git", git });
    assert.ok(unreadable.problems.some((p) => p.includes("could not read tags from")));
    rmSync(root, { recursive: true, force: true });
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("parseRefs resolves an annotated tag to its commit, not to the tag object", () => {
  const ls = [
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/tags/v1.3.0",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\trefs/tags/v1.3.0^{}",
  ].join("\n");
  assert.equal(parseRefs(ls).get("refs/tags/v1.3.0"), "b".repeat(40),
    "the alias must point at the commit — an alias on a tag object is not what `@v1` resolves for a caller");
  // Order-independent: the peeled line wins wherever it appears.
  assert.equal(parseRefs(ls.split("\n").reverse().join("\n")).get("refs/tags/v1.3.0"), "b".repeat(40));
  assert.equal(parseRefs("").size, 0);
  assert.equal(parseRefs(null).size, 0);
  assert.equal(parseRefs("garbage with no tab").size, 0);
});

// ── criterion 5: the policy document and the code agree ──

const POLICY = readFileSync(join(REPO, "docs/flow-versioning-policy.md"), "utf8");

test("criterion 5 — the policy says which refs the release repo carries, who moves them and when", () => {
  const section = POLICY.split("## What the release repo carries")[1];
  assert.ok(section, "the policy must have a section about the release repo's refs at all");
  const body = section.split("\n## ")[0];

  // Which refs.
  for (const ref of ["`main`", "`vMAJOR.MINOR.PATCH`", "`vMAJOR`", "`vMAJOR-edge`"]) {
    assert.ok(body.includes(ref), `the section must say what happens to ${ref}`);
  }
  // Who moves the alias, and at what point in the procedure. Both named, not implied.
  assert.match(body, /mirror-alias/, "the job that moves it must be named, so the doc is checkable against the code");
  assert.match(body, /step 6/, "the alias move must be tied to a numbered step of the release procedure");
  assert.match(body, /published-without-its-alias/, "the failure mode the code emits must be the one the doc names");
  // And the canary reason, which is the rule a later simplification would break.
  assert.match(body, /never when a release is published/i);
});

test("criterion 5 — the doc's claims match what the code actually does", () => {
  const body = POLICY.split("## What the release repo carries")[1].split("\n## ")[0];

  // The doc names a job. It has to exist, or the doc is describing a resolution path nobody has.
  assert.ok(existsSync(WORKFLOW));
  const wfText = readFileSync(WORKFLOW, "utf8");
  assert.ok(wfText.includes("mirror-alias:"), "the doc names `mirror-alias`; the workflow must define it");

  // The doc names a verdict string. It has to be the one the module emits.
  assert.equal(ALIAS_OUTCOME.orphaned, "published-without-its-alias");
  assert.ok(body.includes(ALIAS_OUTCOME.orphaned));

  // The doc says v1-edge is NOT published to the release repo. The manifest must agree — the
  // module has no edge alias at all, and aliasTag never produces one.
  assert.ok(!aliasTag("1.3.0").includes("edge"));
  assert.match(body, /`vMAJOR-edge` \| nobody/);

  // The doc says the mirror refuses a release the target does not carry. That is asserted as
  // behaviour above; here we only check the doc has not drifted into promising the opposite.
  assert.match(body, /refuses to point `vX` at a release the target does not carry/);
});

// ── the workflow half: two entry points that must never be the same event ──

test("criterion 1 — the alias mirror is a separate job on a separate trigger", { skip }, () => {
  const on = wf.on ?? wf[true];
  assert.deepEqual(on.push?.tags, ["v[0-9]*", "!v*.*", "!v*-edge"],
    "only the bare vMAJOR alias: every exact version and the edge channel are excluded");
  assert.ok(wf.jobs["mirror-alias"], "the alias move must be its own job, not a step of the publish");

  const mirrorRun = wf.jobs["mirror-alias"].steps.map((s) => String(s.run ?? "")).join("\n");
  assert.ok(mirrorRun.includes("--mirror-alias"), "the job must invoke the mirror, not the publisher");

  const publishRun = wf.jobs.publish.steps.map((s) => String(s.run ?? "")).join("\n");
  assert.ok(!publishRun.includes("--mirror-alias"),
    "publishing must never move the alias — that would delete the canary the two-alias split exists for");
});

test("criterion 1 — the publish and the mirror never fire on each other's event", { skip }, () => {
  assert.match(String(wf.jobs.publish.if), /github\.event_name != 'push'/,
    "a tag push must not trigger a second publish of an already-released version");
  assert.match(String(wf.jobs["mirror-alias"].if), /github\.event_name == 'push'/);
  assert.ok(!/event_name == 'release'/.test(String(wf.jobs["mirror-alias"].if)),
    "the alias must not move as a side effect of a release being published");
});

test("criterion 6 — the mirror job is dormant, unprivileged and handles the PAT as the publish does", { skip }, () => {
  const job = wf.jobs["mirror-alias"];
  assert.match(String(job.if), /vars\.FLOW_RELEASE_PUBLISH/, "merging this must turn nothing on");
  assert.equal(job.permissions, undefined, "the top-level contents: read is the whole grant");

  const steps = job.steps.map((s) => String(s.run ?? ""));
  const all = steps.join("\n");
  assert.ok(!/echo[^\n]*FLOW_RELEASE_PAT/.test(all), "the PAT must never be echoed");
  assert.ok(!/https:\/\/[^\s"']*\$\{?FLOW_RELEASE_PAT/.test(all),
    "the PAT must not be interpolated into a remote URL — git echoes a failing remote into stderr");
  assert.ok(!/(^|\s)(-H|--header)\s+\S*FLOW_RELEASE_PAT/.test(all), "the PAT must not land in argv");
  assert.ok(!/git config --global/.test(all), "the credential must not outlive this command's process tree");
  assert.ok(all.includes("::add-mask::") && all.includes("GIT_CONFIG_COUNT=1"));
  assert.equal(job.steps[0].with?.["persist-credentials"], false,
    "this job runs `git push` to another remote; GITHUB_TOKEN must not be left configured");

  const uses = job.steps.map((s) => s.uses).filter(Boolean);
  assert.ok(uses.length > 0, "an assertion over an empty list is not a check");
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `"${u}" must be pinned to a commit SHA`);

  // `if: always()` on the summary, because the run this matters most for is the failed one.
  const summary = job.steps.at(-1);
  assert.equal(summary.if, "always()", "the published-without-its-alias verdict must reach the job summary");
  assert.ok(String(summary.run).includes("GITHUB_STEP_SUMMARY"));
});
