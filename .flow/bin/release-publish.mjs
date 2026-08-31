#!/usr/bin/env node
// release-publish.mjs — canonical's release publisher: what crosses to the public repo, and
// nothing else.
//
// NOT AN ADAPTER. Every other file in this directory is a thin shell over
// `project-template/.flow/bin/` (see parse-task-id.mjs for why). This one is canonical-only,
// like check-workflows.mjs: an adopting repo consumes Flow, it never publishes it, so there is
// no template counterpart for this to adapt and shipping one would hand every adopter a
// publisher aimed at a repository that is not theirs.
//
// WHAT THIS EXISTS TO PREVENT. ADR-0005 splits canonical into a private authoring repo and a
// public release repo, because the task store — every `blocked_reason`, every handoff note,
// every rejected approach — is a planning record that only got published as a side effect of
// the reusable workflows needing to be resolvable by reference. A history-preserving transfer
// (`git subtree push`, a filtered branch, a mirror) defeats that entirely: it carries the
// commits the split withholds, permanently and publicly, while the working tree still looks
// correct. So publication is a SNAPSHOT — a fresh repository whose first commit has no parent
// from canonical's history — and the property under test is what is ABSENT, not what is present.
//
// THE MANIFEST LIVES HERE, and that was decided by scope rather than taste. flow-0029's
// `touches` admits three files: this one, its test, and the workflow. `.flow/config.yml` (the
// established home for per-repo calibration) and a file beside `VERSION` are both outside it,
// and the protocol is explicit that an undeclared path is out of scope even when it is the
// tidier home. So `MANIFEST` is exported data in this module and the tests read it from here
// rather than restating it — a second copy of the artefact list is the one thing guaranteed to
// drift, and it would drift towards publishing more.
//
// The manifest's content is not invented here: it is ADR-0005's Decision section, plus its
// boundary rule for the files the two lists do not name — a file crosses only if an adopting
// repo needs it at RUN time or at ADOPTION time; anything that exists to author, plan or
// operate canonical stays private.
//
//   node .flow/bin/release-publish.mjs --dry-run
//   node .flow/bin/release-publish.mjs --remote <url> --target-meta <file.json>
//
// Exits 1 on any problem, 0 otherwise. Zero dependencies.

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync as __realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, resolve, sep } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { parseFlags, ROOT_VERSION_PATH, SEMVER } from "../../project-template/.flow/bin/release-guard.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED. Reached
// through a symlink they differ, the comparison is false, and the CLI block below silently
// never runs — no output, exit 0, nothing to debug. For a publisher that is the worst possible
// failure: the release job goes green having published nothing, and the fleet keeps resolving
// the previous snapshot with nobody aware the release did not happen. Compare realpaths.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

// ── the manifest ───────────────────────────────────────────────────────────────────────
// ADR-0005's Decision section, expressed as data. Three include shapes, deliberately kept
// distinct rather than collapsed into one glob language:
//
//   trees     — copied whole, dotfiles included. Use for a directory that IS the artefact.
//   globs     — a single `*` within ONE path segment. There is no `**` and there is not going
//               to be: a half-implemented glob engine matches things its author did not intend,
//               and in this file "matched something unintended" means "published it".
//   files     — exact repo-relative paths.
//   generated — written from a string in this module rather than copied from the source tree.
//
// Anything not named here does not cross. That is the whole safety property, so read an
// addition to this list as a decision to make a file permanently public.
export const MANIFEST = Object.freeze({
  // What an adopter gets when it adopts Flow: the protocol, the helpers, the thin callers,
  // the skills, the fixture store. All of it is adoption-time material.
  trees: ["project-template/"],

  // THE PRIMARY ARTEFACT. `uses: owner/repo/.github/workflows/_flow-gates.yml@ref` is resolved
  // by repository reference at run time, which is the entire reason the release repo has to be
  // public. Note the leading underscore: canonical's OWN callers are `flow-*.yml` and are
  // AI-invoking, secret-holding, and none of an adopter's business.
  globs: [".github/workflows/_flow-*.yml"],

  files: [
    // Apache-2.0 §4(d) obliges a redistributor to carry NOTICE, and the snapshot REPLACES the
    // release repo's tree — so if these are not in the manifest they are not in the repo, and
    // hand-adding them there would be overwritten by the next publish.
    "LICENSE",
    "NOTICE",
    // The stamp an adopting repo compares itself against (`flow-doctor`, `flow-sync`).
    "VERSION",
    // Provenance, published deliberately. ADR-0005 sends traceability here precisely BECAUSE
    // the git history does not cross.
    "CHANGELOG.md",
    // The documentation an adopter reads. Enumerated file by file rather than shipping `docs/`
    // whole: `docs/` also holds the ADRs, the propagation plan and the handoff notes, which
    // ADR-0005 names as never crossing. A directory include here would export them.
    "docs/adopting-flow-cutover.md",
    "docs/flow-reusable-workflows.md",
    "docs/flow-versioning-policy.md",
    "docs/repinning-a-consuming-repo.md",
  ],

  // The release repo's own README. GENERATED, not copied: canonical's root README describes the
  // authoring repo, and ADR-0005 asks for "a short README.md of its own, marking it as a
  // published mirror and pointing contributions at the issue tracker rather than at pull
  // requests against generated content". A file that says "do not send pull requests against
  // generated content" should itself be generated.
  generated: ["README.md"],
});

// A second, independent opinion — NOT a restatement of the manifest. `resolveManifest` only
// ever emits manifest paths, so on its own it cannot publish something unlisted; this list is
// what catches the case where the MANIFEST ITSELF is wrong (a `trees` entry widened to `.flow/`,
// a glob that loses its underscore). Anchored prefixes, matched against repo-relative POSIX
// paths from the root — so `.flow/` denies canonical's store while leaving
// `project-template/.flow/` alone, which is the distinction the whole split turns on.
export const NEVER_PUBLISH = Object.freeze([
  ".flow/",                          // the store, canonical's adapters, canonical's gate config
  ".github/workflows/flow-",         // canonical's own callers: AI-invoking, secret-holding
  ".github/workflows/ci.yml",
  ".github/workflows/release-tag.yml",
  "flightdeck/",                     // cross-project rollup — operating canonical, not adopting it
  "docs/adr/",                       // the decisions, including the rejected alternatives
  "docs/handoff-",                   // handoff notes — planning, and a prefix so new ones inherit it
  "docs/flow-infra-propagation-plan.md",
  "VISION.md",
  "package.json",                    // canonical's own gate manifest; `private: true` and not shipped
  "package-lock.json",
]);

// A DELIBERATE ABSENCE, so the next reader does not "fix" it. Canonical's root host file — the
// one the coding agent auto-loads — is not named on the list above, even though it must never
// cross. flow-0006 made that filename a CONVENTION rather than a dependency (it is one name for
// Claude Code and another for agents following the AGENTS.md convention), and
// `protocol-portability.test.mjs` fails any non-test helper in this directory whose executable
// code names it. Writing it here to gain a backstop would re-introduce the vendor binding that
// task removed, in the one file whose whole job is deciding what becomes permanently public.
//
// Nothing is lost by the omission: the manifest is an ALLOW list, so a root file crosses only
// if somebody adds it to `MANIFEST.files` by hand — a deliberate, reviewable, one-line act,
// not the accidental widening this deny list exists to catch. `auditEntries` reports it as
// "outside the manifest" either way. The template's own host files are a different question
// and DO cross: they are what an adopting repo is handed.

// How the flightdeck and the watchdog enrol a repository into the fleet
// (`flightdeck/bin/mission-control.mjs`, `flightdeck/bin/watchdog.mjs` both search `topic:flow`).
// The release repo holds no store, so tagging it would enrol a phantom project that every
// liveness sweep then reports on forever.
export const FLEET_TOPIC = "flow";

// The branch the snapshot lands on in the release repo.
export const RELEASE_BRANCH = "main";

// ── pure: paths ────────────────────────────────────────────────────────────────────────

// A single `*` inside one path segment. See MANIFEST's comment for why this is not a real glob
// engine: the blast radius of an over-eager match here is a permanent public disclosure.
export function globToRegExp(glob) {
  const escaped = String(glob).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, "[^/]*")}$`);
}

// Is this repo-relative path admitted by the manifest? Every include shape, one answer.
export function manifestAdmits(path, manifest = MANIFEST) {
  if ((manifest.generated ?? []).includes(path)) return true;
  if ((manifest.files ?? []).includes(path)) return true;
  if ((manifest.trees ?? []).some((t) => path.startsWith(t.endsWith("/") ? t : `${t}/`))) return true;
  return (manifest.globs ?? []).some((g) => globToRegExp(g).test(path));
}

// Anchored-prefix deny. Exact match counts too, so a bare filename entry works.
export function neverPublishes(path, deny = NEVER_PUBLISH) {
  return deny.some((p) => path === p || path.startsWith(p));
}

// Walk a directory into repo-relative POSIX paths. `.git` is skipped: a nested repository
// inside a published tree is not a file list problem, it is a history leak.
export function walkTree(root, rel = "", out = []) {
  const abs = rel ? join(root, rel) : root;
  for (const name of readdirSync(abs).sort()) {
    if (name === ".git") continue;
    const child = rel ? posix.join(rel, name) : name;
    if (statSync(join(root, child.split(posix.sep).join(sep))).isDirectory()) walkTree(root, child, out);
    else out.push(child);
  }
  return out;
}

// ── pure-ish: what would be published ──────────────────────────────────────────────────
// Reads the source tree (and nothing else) and returns the exact publish set, plus every
// manifest entry that named a path the tree does not have. A manifest that has gone stale
// because a doc was renamed must FAIL rather than quietly ship a smaller artefact — an adopter
// discovering a missing runbook has no way to tell a deletion from a publish bug.
export function resolveManifest(sourceRoot, manifest = MANIFEST) {
  const entries = [];
  const missing = [];
  const seen = new Set();
  const add = (path, from) => {
    if (seen.has(path)) return;
    seen.add(path);
    entries.push(from === null ? { path, generated: true } : { path, from });
  };

  for (const tree of manifest.trees ?? []) {
    const relDir = tree.endsWith("/") ? tree.slice(0, -1) : tree;
    const absDir = join(sourceRoot, relDir);
    if (!existsSync(absDir)) { missing.push(tree); continue; }
    for (const child of walkTree(absDir)) add(posix.join(relDir, child), posix.join(relDir, child));
  }

  for (const glob of manifest.globs ?? []) {
    const relDir = posix.dirname(glob);
    const absDir = join(sourceRoot, relDir);
    const re = globToRegExp(glob);
    const hits = existsSync(absDir)
      ? walkTree(absDir).map((c) => posix.join(relDir, c)).filter((p) => re.test(p))
      : [];
    if (hits.length === 0) { missing.push(glob); continue; }
    for (const hit of hits) add(hit, hit);
  }

  for (const file of manifest.files ?? []) {
    if (!existsSync(join(sourceRoot, file))) { missing.push(file); continue; }
    add(file, file);
  }

  for (const file of manifest.generated ?? []) add(file, null);

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { entries, missing: missing.sort() };
}

// The redundant check the Scope calls for: "a publisher that trusts its own manifest is one bug
// away from the failure this whole split is meant to prevent". Runs against the RESOLVED set,
// so it catches a bad manifest, a bad walk, and anything a future edit adds between the two.
export function auditEntries(entries, manifest = MANIFEST, deny = NEVER_PUBLISH) {
  const offenders = [];
  for (const { path } of entries) {
    if (neverPublishes(path, deny)) offenders.push({ path, reason: "on the never-publish list" });
    else if (!manifestAdmits(path, manifest)) offenders.push({ path, reason: "outside the manifest" });
  }
  return offenders;
}

// ── pure: version, tag, target ─────────────────────────────────────────────────────────

export function readVersion(sourceRoot, versionPath = ROOT_VERSION_PATH) {
  const file = join(sourceRoot, versionPath);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8").trim();
  return text === "" ? null : text;
}

// One version, one tag. Criterion: a pinned adopter and the stamp inside the artefact cannot
// disagree, which holds only because the tag is DERIVED from `VERSION` rather than passed in.
export function releaseTag(version) {
  return SEMVER.test(String(version ?? "")) ? `v${version}` : null;
}

// `git ls-remote --tags <url>` output -> is this tag absent? Parsed rather than shelled out to
// twice, so the decision is testable without a network or a fixture repo.
export function tagIsFree(lsRemoteOutput, tag) {
  const refs = new Set(
    String(lsRemoteOutput ?? "")
      .split("\n")
      .map((line) => line.split("\t")[1] ?? "")
      .map((ref) => ref.replace(/\^\{\}$/, ""))
      .filter(Boolean),
  );
  return !refs.has(`refs/tags/${tag}`);
}

// The two properties of the target repository that would each silently defeat the split, and
// which cannot be checked from the authoring session (`flow-protocol` is outside its GitHub
// scope). Mechanical here so it is checked on every publish rather than eyeballed once.
export function checkTargetRepo(meta) {
  const problems = [];
  if (meta.private === true || meta.visibility === "private") {
    problems.push(
      "target repository is PRIVATE — a private repo's reusable workflows cannot be resolved " +
      "by an outside adopter's `uses:`, which is the only reason the release repo exists",
    );
  }
  if ((meta.topics ?? []).includes(FLEET_TOPIC)) {
    problems.push(
      `target repository carries the "${FLEET_TOPIC}" GitHub topic — that is how the flightdeck ` +
      "and the watchdog enrol a repo, and the release repo holds no task store, so it would be " +
      "enrolled as a phantom project",
    );
  }
  return problems;
}

// ── the snapshot ───────────────────────────────────────────────────────────────────────
// Materialise the publish set into `workDir`. The caller owns the directory; this only writes
// inside it.
export function materialise(sourceRoot, entries, workDir, generate) {
  for (const entry of entries) {
    const dest = join(workDir, entry.path.split(posix.sep).join(sep));
    mkdirSync(dirname(dest), { recursive: true });
    if (entry.generated) writeFileSync(dest, generate(entry.path), "utf8");
    else copyFileSync(join(sourceRoot, entry.from.split(posix.sep).join(sep)), dest);
  }
}

// The release repo's README. Short on purpose: it exists to stop someone opening a pull request
// against a tree that is regenerated wholesale on the next release.
export function releaseReadme({ version, tag, sourceRepo = "CandidDan/flow" } = {}) {
  return `# Flow — published artefact

This repository is a **published mirror**, not a working repository. Everything here is a
snapshot of the Flow artefact at \`${tag ?? "v0.0.0"}\` (\`VERSION\` = \`${version ?? "0.0.0"}\`),
copied mechanically from the authoring repository on release.

## What is here

| Path | What it is |
|---|---|
| \`.github/workflows/_flow-*.yml\` | The reusable workflows an adopting repo calls by reference. |
| \`project-template/\` | What a repo gets when it adopts Flow, including the protocol. |
| \`docs/\` | The adoption and versioning documentation. |
| \`VERSION\` | The stamp an adopting repo compares itself against. |

## Do not send pull requests here

Every file in this repository is generated by the publish step and is **replaced in full on the
next release** — a change made here is discarded, silently, whenever the next version ships.
The snapshot carries no history from the authoring repository, so there is nothing to rebase
onto either.

Raise bugs and proposals as **issues** on this repository. They are triaged into the authoring
repository, where the fix is made and from where it is published back here.

## Versioning

Adopting repos pin a tag. See \`docs/flow-versioning-policy.md\` for what \`v1\`, \`v1-edge\` and
the exact version tags mean and which one you should be on. Tags are never moved once published.

## Licence

Apache-2.0. See \`LICENSE\`, and \`NOTICE\` for the attributions it requires you to carry.
`;
}

// ── the run ────────────────────────────────────────────────────────────────────────────
// Ordered so that every reason to refuse is found BEFORE anything is written or pushed. The
// dry run stops after the decisions; the real run continues into git.
export function runPublish({
  sourceRoot,
  workDir = null,
  remote = null,
  git = null,
  manifest = MANIFEST,
  deny = NEVER_PUBLISH,
  dryRun = false,
  targetMeta = null,
  branch = RELEASE_BRANCH,
  readme = releaseReadme,
} = {}) {
  const problems = [];
  const notes = [];

  const version = readVersion(sourceRoot);
  const tag = releaseTag(version);
  if (version === null) problems.push(`no readable ${ROOT_VERSION_PATH} at ${sourceRoot}`);
  else if (tag === null) problems.push(`${ROOT_VERSION_PATH} is "${version}", expected MAJOR.MINOR.PATCH`);

  const { entries, missing } = resolveManifest(sourceRoot, manifest);
  for (const m of missing) problems.push(`manifest names "${m}" but the source tree has no such path`);

  for (const o of auditEntries(entries, manifest, deny)) {
    problems.push(`refusing to publish "${o.path}" — ${o.reason}`);
  }

  if (targetMeta) problems.push(...checkTargetRepo(targetMeta));
  else if (!dryRun) problems.push("target repository metadata was not supplied — refusing to publish unchecked");

  // The tag check is a network READ, so a dry run does it too: a dry run that hides the one
  // condition which will stop the real run is a dry run that lies.
  if (remote && git && tag && problems.length === 0) {
    let ls = null;
    try { ls = git(["ls-remote", "--tags", remote], { cwd: sourceRoot }); }
    catch (err) { problems.push(`could not read tags from ${remote}: ${err?.message ?? err}`); }
    if (ls !== null && !tagIsFree(ls, tag)) {
      problems.push(
        `${tag} already exists on the target — refusing to move it. A moved tag silently changes ` +
        "what every pinned adopter runs. Bump VERSION instead.",
      );
    }
  } else if (!remote && !dryRun) {
    problems.push("no --remote given — nothing to publish to");
  }

  const verdict = { version, tag, branch, files: entries.map((e) => e.path), problems, notes, published: false };
  if (problems.length) return verdict;
  if (dryRun) { notes.push("dry run — nothing was written and nothing was pushed"); return verdict; }

  // From here on it is git, and every step is on the fresh staging repo. The snapshot's
  // parentlessness is structural, not a flag: `git init` into an empty directory means the
  // first commit HAS no parent to inherit. There is nothing here that could accidentally
  // graft canonical's history on, which is the point.
  mkdirSync(workDir, { recursive: true });
  git(["init", "--quiet", "--initial-branch", branch], { cwd: workDir });
  materialise(sourceRoot, entries, workDir, () => readme({ version, tag }));
  git(["add", "--all"], { cwd: workDir });
  git(["-c", "user.name=flow-release", "-c", "user.email=flow-release@users.noreply.github.com",
       "commit", "--quiet", "-m", `Flow ${tag}\n\nPublished snapshot. No history crosses from the authoring repository.`],
      { cwd: workDir });
  git(["tag", tag], { cwd: workDir });

  // Branch first, then tag. The branch is forced because consecutive snapshots share no
  // ancestry by construction; the tag is NEVER forced, and we already refused above if it
  // existed. Every superseded snapshot stays reachable through its own tag.
  git(["push", "--force", remote, `HEAD:refs/heads/${branch}`], { cwd: workDir });
  git(["push", remote, `refs/tags/${tag}`], { cwd: workDir });

  verdict.published = true;
  return verdict;
}

// ── report ─────────────────────────────────────────────────────────────────────────────

export function formatReport(v) {
  const lines = [];
  lines.push(`release-publish: version=${v.version ?? "?"} tag=${v.tag ?? "?"} files=${v.files.length}`);
  for (const f of v.files) lines.push(`  + ${f}`);
  for (const n of v.notes) lines.push(`note: ${n}`);
  for (const p of v.problems) lines.push(`PROBLEM: ${p}`);
  lines.push(v.problems.length
    ? `release-publish: decision=refused problems=${v.problems.length}`
    : `release-publish: decision=${v.published ? "published" : "dry-run"} tag=${v.tag}`);
  return lines;
}

export function reportAndExit(verdict, { json = false, log = console.log, exit = process.exit } = {}) {
  if (json) log(JSON.stringify(verdict, null, 2));
  else for (const line of formatReport(verdict)) log(line);
  exit(verdict.problems.length ? 1 : 0);
}

export function makeGitRunner() {
  return (args, { cwd } = {}) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// Canonical's repo root — two levels up from this `bin/` directory (`.flow/bin` -> `.flow` -> repo).
export function canonicalRepoRoot(here = __fileURLToPath(import.meta.url)) {
  return resolve(dirname(here), "..", "..");
}

// ── CLI ──
if (__isMain) {
  const f = parseFlags(process.argv.slice(2));
  const meta = typeof f["target-meta"] === "string"
    ? JSON.parse(readFileSync(f["target-meta"], "utf8"))
    : null;
  reportAndExit(runPublish({
    sourceRoot: typeof f.source === "string" ? f.source : canonicalRepoRoot(),
    workDir: typeof f["work-dir"] === "string" ? f["work-dir"] : null,
    remote: typeof f.remote === "string" ? f.remote : null,
    git: makeGitRunner(),
    dryRun: f["dry-run"] === true,
    targetMeta: meta,
    branch: typeof f.branch === "string" ? f.branch : RELEASE_BRANCH,
  }), { json: f.json === true });
}
