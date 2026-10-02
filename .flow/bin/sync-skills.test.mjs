// sync-skills.test.mjs — proving tests for flow-0081.
//
// WHAT THIS FILE IS ABOUT. The template ships procedures as skills — `project-template/.claude/
// skills/<name>/SKILL.md` — and both `AGENTS.md` and `PROTOCOL.md` instruct agents to read them
// *by path*. `flow-init` copies them once, at adoption. Nothing refreshed them afterwards: for
// every release up to this one, flow-sync's copied surface was `.flow/bin/`, the thin callers,
// `.flow/PROTOCOL.md` and the `.flow/VERSION` stamp, and `.claude/skills/` was not on it.
//
// Two consequences, both seen during a 1.x → 2.0.0 migration, and reported as "AGENTS.md points at
// a skill that doesn't exist":
//
//   * a repo adopted before a skill existed never gets it. `vision-writer` is missing in every
//     repo that predates it, and the pointer in AGENTS.md resolves to nothing — the agent reads
//     the instruction, cannot follow it, and improvises the procedure instead.
//   * a skill FIXED in canonical never reaches the fleet. The task-writer changelog-fragment rule
//     is the live example: written in canonical, correct there, absent everywhere else.
//
// This is the same shape as flow-0048 (the protocol fell off the same surface) and it is the same
// kind of defect: not a wrong line, an ABSENT one, with nothing to fail. So the assertions split
// in two, deliberately:
//
//   * a STRUCTURE check (`checkSkillSurface`) over the shipped file's content, each clause proved
//     to fail against a mutated copy — a surface test that cannot fail is the gap one level up;
//   * BEHAVIOUR tests that execute the real copy region, lifted out of the shipped `run:` block,
//     against fixture repos shaped like real adopters. A paraphrase would only prove itself.
//
// Why this is canonical's own test rather than the template's: it asserts facts about
// `.github/workflows/_flow-sync.yml`, which exists only here — an adopting repo has the thin
// caller, not the reusable. Same reasoning and the same directory as sync-surface.test.mjs,
// sync-customised-caller.test.mjs and sync-permissions.test.mjs.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { prContent } from "../../project-template/.flow/bin/flow-sync.mjs";
import { changelogEntry } from "./changelog-entry.mjs";

// DEPENDENCY NOTE. Same posture as sync-surface.test.mjs: `_flow-gates.yml`'s flow-tooling job
// runs `node --test .flow/bin/*.test.mjs` with no install step, so when `yaml` is missing these
// skip *visibly* ("# skipped") rather than crashing the job. They run for real in the per-stack
// gate job, which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-sync.yml");
const CANON_TPL = join(REPO, "project-template");
const CANON_SKILLS = join(CANON_TPL, ".claude/skills");

// The two project-owned files under `.claude/` that this sync must never write. Permissions and
// hooks are a repo's own decision; canonical has no business replacing them, and the scope rule is
// worth a test because the copy step now writes inside `.claude/` at all for the first time.
const PROJECT_OWNED = [".claude/settings.json", ".claude/settings.local.json"];

const readReusable = () => readFileSync(REUSABLE, "utf8");

/** Canonical's skill directory names, read off disk — never a hardcoded list that can go stale. */
const canonicalSkills = () =>
  readdirSync(CANON_SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

/** Every file under `dir`, as paths relative to it. Used to compare two trees byte for byte. */
const treeFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath ?? e.path, e.name)))
    .sort();

// ---------------------------------------------------------------------------------------------
// The structure check, written over file CONTENT rather than a path, so a test can hand it a
// mutated copy and prove the check would have caught the real defect. Returns human-readable
// problems; an empty list means the copied surface carries the skills and leaves the
// project-owned files alone.
// ---------------------------------------------------------------------------------------------

/** Every `run:` script in a parsed workflow, concatenated. */
const runScripts = (wf) =>
  Object.values(wf?.jobs ?? {})
    .flatMap((job) => job?.steps ?? [])
    .map((step) => step?.run)
    .filter((run) => typeof run === "string")
    .join("\n");

/**
 * Shell line continuations make one logical command span several lines, and a regex written with
 * `[^\n]*` silently stops at the first of them. Join them before matching command shapes.
 */
const joinContinuations = (script) => script.replace(/\\\n\s*/g, " ");

/**
 * The command lines of a shell script: continuations joined, comments dropped. Comments MUST be
 * dropped, because the copy step explains in prose why `.claude/settings.json` is untouched — a
 * naive scan would match that sentence and conclude the file was being written.
 */
const commandLines = (script) =>
  joinContinuations(script)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

/** Just the comment lines, which is where the overwrite contract has to be stated. */
const commentLines = (script) =>
  script.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("#"));

const COPY_CMD = /(^|[^\w-])(cp|rsync|install)\b/;

/**
 * A shell command's arguments: quotes stripped, flags dropped. Enough to answer "what is this
 * command's destination", which is the question every clause below turns on — and it has to be
 * answered structurally, because the shipped step copies ONE SKILL AT A TIME inside a loop, so
 * neither the source nor the destination is a literal path on the copy line alone.
 */
const argsOf = (line) =>
  (line.match(/"[^"]*"|'[^']*'|\S+/g) ?? [])
    .map((t) => t.replace(/^["']|["']$/g, ""))
    .filter((t) => !t.startsWith("-"));

/** The last non-flag argument — `cp`, `rsync` and `install` all take the destination last. */
const destOf = (line) => argsOf(line).at(-1) ?? "";

export function checkSkillSurface(text, yaml) {
  const problems = [];
  const script = runScripts(yaml.parse(text));
  const commands = commandLines(script);

  // 1. Something copies canonical's skills into the repo being synced. Matched on BOTH halves —
  //    a command whose DESTINATION is under `.claude/skills/`, and somewhere in the same script a
  //    command that reads `$CANON_TPL`'s skills — so a line that merely mentions the directory
  //    does not count, and neither does a copy from nowhere. This is the whole bug.
  const copies = commands.filter((line) =>
    COPY_CMD.test(line) && destOf(line).startsWith(".claude/skills"));
  const sourced = commands.some((line) =>
    /\$\{?CANON_TPL\}?[^\s"']*\/\.claude\/skills/.test(line));
  if (copies.length === 0 || !sourced) {
    problems.push(
      "the copy step does not copy .claude/skills/ from $CANON_TPL. An adopting repo's skills are " +
      "then frozen at adoption: a skill added to canonical later never arrives (AGENTS.md points " +
      "at a file that is not there) and a skill fixed in canonical never reaches the fleet " +
      "(flow-0081).",
    );
  }

  // 2. The copy MIRRORS, so a file canonical deleted from a skill goes away downstream too. A
  //    plain recursive `cp` leaves the deleted file behind forever, which is the half-synced state
  //    that makes a skill's procedure contradict itself. `.flow/bin/` has mirrored since day one;
  //    a skill is the same class of canonical-owned tree.
  if (copies.length > 0 && !copies.some((line) => /--delete\b/.test(line))) {
    problems.push(
      "the skills are copied but not MIRRORED (no --delete). A file canonical removed from a skill " +
      "would survive downstream forever, leaving the adopter running a procedure that is partly " +
      "the old one — the same half-applied state flow-0048 found in the protocol.",
    );
  }

  // 3. The copy is scoped to canonical-NAMED directories, not to `.claude/skills/` as a whole. A
  //    `--delete` mirror of the parent would delete a project's own skills, which is a far worse
  //    bug than the one being fixed. Checked by requiring the destination be a path BELOW
  //    `.claude/skills/` rather than the directory itself.
  const wholesaleWipe = copies.some((line) =>
    /--delete\b/.test(line) && /^\.claude\/skills\/?$/.test(destOf(line)));
  if (wholesaleWipe) {
    problems.push(
      "the skills copy mirrors `.claude/skills/` wholesale, which would DELETE skills the adopting " +
      "repo wrote itself. Only canonical-named directories are canonical's to replace — mirror " +
      "each one individually.",
    );
  }

  // 4. Nothing writes the project-owned files under `.claude/`. They carry permissions and hooks,
  //    which are the repo's decision; this step writes inside `.claude/` for the first time, so
  //    the boundary is asserted rather than assumed.
  for (const file of PROJECT_OWNED) {
    if (commands.some((line) => line.includes(file))) {
      problems.push(
        `${file} appears in a command in the copy step. It is project-owned — permissions and ` +
        `hooks are never canonical's to overwrite — and the skills copy must not reach it.`,
      );
    }
  }

  // 5. The overwrite contract is STATED where the copying happens. A canonical-named skill is
  //    replaced wholesale, so a local edit to one is silently lost at the next sync. That is the
  //    `.flow/bin/` bargain and it is acceptable only if someone is told; the task asks for the
  //    comment for exactly that reason.
  const saysOverwritten = commentLines(script).some((l) => /overwritten by the next sync/i.test(l));
  const saysCanonicalNamed = commentLines(script).some((l) => /canonical-named/i.test(l));
  if (!(saysOverwritten && saysCanonicalNamed)) {
    problems.push(
      "the copy step does not state the overwrite contract next to the skills copy: that " +
      "canonical-named skill directories are canonical's, and a local edit to one is overwritten " +
      "by the next sync, in the same way as .flow/bin/.",
    );
  }

  return problems;
}

// ---------------------------------------------------------------------------------------------
// Lifted from the shipped `run:` block rather than reimplemented. The whole copy region is
// extracted, from the `mkdir -p` that opens it to the stamp write that closes it, so the tests
// below run the REAL surface. If this stops matching, the step was reshaped: re-read it and update
// the extractor, never relax the behaviour asserted below.
// ---------------------------------------------------------------------------------------------
const COPY_REGION =
  /^\s*mkdir -p \.flow\/bin \.github\/workflows$[\s\S]*?^\s*printf '%s\\n' "\$CANON_VER" > \.flow\/VERSION$/m;

const extractCopyRegion = (text) => {
  const match = runScripts(yamlMod.parse(text)).match(COPY_REGION);
  assert.ok(match, "could not find the copied-surface block in _flow-sync.yml's run scripts — it " +
    "was reshaped; update this extractor and re-verify the behaviour below still holds");
  return match[0];
};

/** The shipped line that mirrors one skill directory. Used to mutate it away. */
const SKILL_RSYNC = /^\s*rsync -a --delete "\$d" "\.claude\/skills\/\$SKILL\/"$/m;

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });

/**
 * A fixture repo shaped like a real adopting repo mid-drift. `skills` maps a path under
 * `.claude/skills/` to its content, so a test can stage a missing skill, a stale canonical one, or
 * one the project wrote itself. Everything is committed, so `git diff` afterwards is the diff the
 * sync PR carries.
 */
const fixtureRepo = (t, { skills = {}, settings = null } = {}) => {
  const repo = mkdtempSync(join(tmpdir(), "flow-0081-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, ".flow/bin"), { recursive: true });
  mkdirSync(join(repo, ".github/workflows"), { recursive: true });
  for (const [path, content] of Object.entries(skills)) {
    const dest = join(repo, ".claude/skills", path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
  if (settings !== null) {
    mkdirSync(join(repo, ".claude"), { recursive: true });
    writeFileSync(join(repo, ".claude/settings.json"), settings);
  }
  writeFileSync(join(repo, ".flow/PROTOCOL.md"), "# The Flow protocol\n\nstale\n");
  writeFileSync(join(repo, ".flow/VERSION"), "1.3.0\n");
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "flow-bot@users.noreply.github.com");
  git(repo, "config", "user.name", "flow-bot");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "fixture: an adopting repo, behind canonical");
  return repo;
};

/** Run the shipped copy region in `repo`, exactly as the workflow's shell runs it. */
const runCopyRegion = (repo, { canonTpl = CANON_TPL, canonVer = "2.0.0", ref = "v2", text } = {}) =>
  execFileSync("bash", ["-euo", "pipefail", "-c", extractCopyRegion(text ?? readReusable())], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, CANON_TPL: canonTpl, CANON_VER: canonVer, CANONICAL_REF: ref },
  });

// ---------------------------------------------------------------------------------------------
// The surface, read off the shipped workflow — and the documented inventory beside it, because a
// correct copy step under a stale inventory is how the next maintainer concludes the omission was
// deliberate. That is precisely how flow-0048 went unnoticed for four releases.
// ---------------------------------------------------------------------------------------------

test("the shipped _flow-sync.yml copies canonical's .claude/skills/ directories", { skip }, () => {
  const problems = checkSkillSurface(readReusable(), yamlMod);
  assert.deepEqual(problems, [], `_flow-sync.yml: ${problems.join(" | ")}`);
});

test("the header's documented surface lists the skills too", { skip }, () => {
  const header = readReusable().split("\njobs:")[0];
  assert.match(header, /What it syncs/);
  assert.match(header, /\.claude\/skills/,
    "the documented copied surface must name the skills, or the inventory contradicts the code");
  assert.match(header, /\.claude\/settings\.json/,
    "…and must name the project-owned files it still never touches, so the boundary is on record");
});

// ---------------------------------------------------------------------------------------------
// The structure check FAILS when the copy is removed or weakened. Demonstrated, not asserted.
// ---------------------------------------------------------------------------------------------

test("removing the skills copy fails the check, by name", { skip }, () => {
  const text = readReusable();
  // Keep the block scalar's indentation, or the mutant is malformed YAML and proves nothing about
  // the check. A comment is left in its place so the `for` around it stays syntactically whole —
  // this mutation removes the COPY, not the loop.
  const mutated = text.replace(SKILL_RSYNC, (line) =>
    line.match(/^[ \t]*/)[0] + "# (skills copy removed)");
  assert.notEqual(mutated, text, "the mutation must actually remove the copy line");

  const problems = checkSkillSurface(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the skills copy is gone: ${problems.join(" | ")}`);
  assert.match(problems[0], /does not copy \.claude\/skills\//);
  assert.match(problems[0], /frozen at adoption/,
    "the message must name the consequence, not just the missing line");
});

test("the check is not satisfied by a mere mention of the skills directory", { skip }, () => {
  // The cheapest false green: a line that names the path without copying anything.
  const mutated = readReusable().replace(SKILL_RSYNC, (line) =>
    line.match(/^[ \t]*/)[0] + 'echo "$CANON_TPL/.claude/skills -> .claude/skills"');
  const problems = checkSkillSurface(mutated, yamlMod);
  assert.equal(problems.length, 1, `expected the missing-copy problem: ${problems.join(" | ")}`);
  assert.match(problems[0], /does not copy/);
});

test("a non-mirroring copy fails the check", { skip }, () => {
  // `cp -a` leaves behind files canonical deleted from a skill — a half-synced procedure.
  const mutated = readReusable().replace(SKILL_RSYNC, (line) =>
    line.match(/^[ \t]*/)[0] + 'cp -a "$d." ".claude/skills/$SKILL/"');
  const problems = checkSkillSurface(mutated, yamlMod);
  assert.equal(problems.length, 1, `expected the mirroring problem: ${problems.join(" | ")}`);
  assert.match(problems[0], /not MIRRORED/);
});

test("mirroring the whole skills directory fails the check", { skip }, () => {
  // The dangerous over-correction: one `--delete` over the parent, which deletes the project's own
  // skills. This must be as loud a failure as the original bug.
  const mutated = readReusable().replace(SKILL_RSYNC, (line) =>
    line.match(/^[ \t]*/)[0] + 'rsync -a --delete "$CANON_TPL/.claude/skills/" ".claude/skills/"');
  const problems = checkSkillSurface(mutated, yamlMod);
  assert.ok(problems.some((p) => /wholesale/.test(p)), `expected the wholesale-wipe problem: ${problems.join(" | ")}`);
});

test("writing a project-owned .claude file fails the check", { skip }, () => {
  const mutated = readReusable().replace(SKILL_RSYNC, (line) =>
    line.match(/^[ \t]*/)[0] + 'cp "$CANON_TPL/.claude/settings.json" .claude/settings.json');
  const problems = checkSkillSurface(mutated, yamlMod);
  assert.ok(problems.some((p) => p.startsWith(".claude/settings.json")),
    `expected the project-owned problem: ${problems.join(" | ")}`);
});

test("dropping the overwrite-contract comment fails the check", { skip }, () => {
  // Strip the comment lines that carry the contract, leaving the code untouched. The surface is
  // then identical and the REASONING is gone — the state flow-0048 was found in.
  const text = readReusable();
  const mutated = text
    .split("\n")
    .filter((l) => !(l.trim().startsWith("#") && /overwritten by the next sync/i.test(l)))
    .join("\n");
  assert.notEqual(mutated, text, "the mutation must actually remove the contract comment");

  const problems = checkSkillSurface(mutated, yamlMod);
  assert.equal(problems.length, 1, `expected the contract problem: ${problems.join(" | ")}`);
  assert.match(problems[0], /overwritten by the next sync/);
});

// ---------------------------------------------------------------------------------------------
// Criterion 1 — an adopter with no `.claude/skills/` gets every canonical skill, byte-identical.
// ---------------------------------------------------------------------------------------------

test("an adopter with no .claude/skills/ gets every canonical skill, byte for byte", { skip }, (t) => {
  const repo = fixtureRepo(t, {});
  assert.ok(!existsSync(join(repo, ".claude/skills")), "the fixture must start without any skills");

  runCopyRegion(repo);

  const skills = canonicalSkills();
  assert.ok(skills.length > 0, "canonical must ship at least one skill, or this proves nothing");
  for (const name of skills) {
    const src = join(CANON_SKILLS, name);
    const dest = join(repo, ".claude/skills", name);
    assert.ok(existsSync(dest), `${name}/ must be synced into the adopter`);
    assert.deepEqual(treeFiles(dest), treeFiles(src),
      `${name}/ must carry exactly canonical's files — a skill is copied whole, not cherry-picked`);
    for (const file of treeFiles(src)) {
      assert.equal(readFileSync(join(dest, file), "utf8"), readFileSync(join(src, file), "utf8"),
        `${name}/${file} must be byte-identical to canonical's — this is a copy, not a patch`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Criterion 2 — a skill the project wrote itself is left alone. This is the clause that makes the
// per-directory mirror necessary, and the one a careless `--delete` over the parent would break.
// ---------------------------------------------------------------------------------------------

test("an adopter's own .claude/skills/my-skill/ is untouched", { skip }, (t) => {
  const own = "# my-skill\n\nThis repo's own procedure. Canonical has never heard of it.\n";
  const repo = fixtureRepo(t, { skills: {
    "my-skill/SKILL.md": own,
    "my-skill/reference/notes.md": "project notes\n",
  } });

  runCopyRegion(repo);

  assert.equal(readFileSync(join(repo, ".claude/skills/my-skill/SKILL.md"), "utf8"), own,
    "a project's own skills are its own — canonical never replaces one it did not author");
  assert.ok(existsSync(join(repo, ".claude/skills/my-skill/reference/notes.md")),
    "and nothing inside it is deleted either — the mirror is scoped to one directory at a time");
  const changed = git(repo, "diff", "--name-only").split("\n").filter(Boolean);
  assert.deepEqual(changed.filter((p) => p.startsWith(".claude/skills/my-skill/")), [],
    `my-skill/ must produce no diff; got ${JSON.stringify(changed)}`);
});

// ---------------------------------------------------------------------------------------------
// Criterion 3 — a stale canonical skill is replaced, and the path shows up in the PR body. This is
// the "a fix in canonical never reaches the fleet" half of the bug.
// ---------------------------------------------------------------------------------------------

test("a stale task-writer is replaced by canonical's and listed in the sync PR", { skip }, (t) => {
  const repo = fixtureRepo(t, { skills: {
    // The observed shape of the defect: an old task-writer without the changelog-fragment rule.
    "task-writer/SKILL.md": "# task-writer\n\nAn older procedure, missing the fragment rule.\n",
  } });

  runCopyRegion(repo);

  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "flow: adopt canonical Flow infra 2.0.0");
  // The workflow's own form — `git diff --cached --no-renames --name-status` after `git add -A` —
  // so the list handed to `pr-body` here is the list the real run hands it, additions included.
  const changed = git(repo, "diff", "--no-renames", "--name-status", "HEAD~1", "HEAD")
    .split("\n").filter(Boolean);

  const target = ".claude/skills/task-writer/SKILL.md";
  assert.equal(
    readFileSync(join(repo, target), "utf8"),
    readFileSync(join(CANON_SKILLS, "task-writer/SKILL.md"), "utf8"),
    "the synced skill must be canonical's, byte for byte",
  );
  assert.ok(changed.some((l) => l.endsWith(`\t${target}`)),
    `the sync commit must carry ${target}. Got: ${JSON.stringify(changed)}`);

  // The other half of the criterion: the PR body is generated from that same changed-file list
  // (`$SYNC pr-body --files "$CHANGED"`), so the file the diff carries is the file the body lists.
  // Asserted through the real generator, never a copy of its format — a reviewer who cannot see
  // that a procedure changed has no way to know the instructions agents follow just changed.
  const { body } = prContent({ local: "1.3.0", canonical: "2.0.0", files: changed });
  const synced = body.split("### Synced from canonical")[1] ?? "";
  assert.match(synced, /- `\.claude\/skills\/task-writer\/SKILL\.md`/,
    "the skill must appear under 'Synced from canonical'");
});

// ---------------------------------------------------------------------------------------------
// Criterion 4 — `.claude/settings.json` is project-owned and never written.
// ---------------------------------------------------------------------------------------------

test("an adopter's .claude/settings.json is unchanged", { skip }, (t) => {
  const settings = JSON.stringify({ permissions: { allow: ["Bash(npm run test:*)"] } }, null, 2) + "\n";
  const repo = fixtureRepo(t, { skills: { "task-writer/SKILL.md": "stale\n" }, settings });

  runCopyRegion(repo);

  assert.equal(readFileSync(join(repo, ".claude/settings.json"), "utf8"), settings,
    "permissions and hooks are the project's decision; a sync must never rewrite them");
  const changed = git(repo, "diff", "--name-only").split("\n").filter(Boolean);
  assert.ok(!changed.includes(".claude/settings.json"),
    `settings.json must produce no diff; got ${JSON.stringify(changed)}`);
  assert.ok(!existsSync(join(repo, ".claude/settings.local.json")),
    "and the local override is not created either — canonical does not author one");
});

// ---------------------------------------------------------------------------------------------
// Criterion 5 — every skill path the template's AGENTS.md names is on the synced surface. This is
// the regression guard the task asks for: a FUTURE pointer at an unsynced skill fails the gate,
// rather than being discovered by an adopter whose agent cannot find the file.
// ---------------------------------------------------------------------------------------------

/** The `.claude/skills/<name>/SKILL.md` paths a doc instructs agents to read. */
const skillPathsIn = (file) => [
  ...new Set(readFileSync(file, "utf8").match(/\.claude\/skills\/[A-Za-z0-9._-]+\/SKILL\.md/g) ?? []),
].sort();

test("every skill AGENTS.md points at is present after a sync", { skip }, (t) => {
  // PROTOCOL.md is read alongside it: it names skills by path for the same reason and reaches the
  // adopter by the same sync, so a pointer added there has the identical failure mode. Neither
  // file is modified by this task — they are read, as the source of the claim being checked.
  const named = [
    ...new Set([
      ...skillPathsIn(join(CANON_TPL, "AGENTS.md")),
      ...skillPathsIn(join(CANON_TPL, ".flow/PROTOCOL.md")),
    ]),
  ].sort();
  assert.ok(named.length > 0,
    "AGENTS.md and PROTOCOL.md must name at least one skill by path, or this guard is vacuous");

  const repo = fixtureRepo(t, {});
  runCopyRegion(repo);

  for (const path of named) {
    assert.ok(existsSync(join(repo, path)),
      `${path} is named in the template's host docs but is not on flow-sync's copied surface. ` +
      `An adopter's agent reads that instruction and finds nothing — the exact report flow-0081 ` +
      `was raised from. Ship the skill in project-template/.claude/skills/, or stop pointing at it.`);
  }
});

// ---------------------------------------------------------------------------------------------
// Idempotence and the guard. Both are properties a sync is re-run against constantly: the
// scheduled caller fires on every repo, most runs change nothing, and a pinned `canonical_ref`
// may predate the skills entirely.
// ---------------------------------------------------------------------------------------------

test("a repo already carrying canonical's skills sees no skills diff", { skip }, (t) => {
  const repo = fixtureRepo(t, { skills: Object.fromEntries(
    canonicalSkills().flatMap((name) =>
      treeFiles(join(CANON_SKILLS, name)).map((file) =>
        [join(name, file), readFileSync(join(CANON_SKILLS, name, file), "utf8")])),
  ) });

  runCopyRegion(repo);

  const changed = git(repo, "status", "--porcelain").split("\n").filter(Boolean);
  assert.deepEqual(changed.filter((l) => l.includes(".claude/skills/")), [],
    `identical skills must produce no diff; got ${JSON.stringify(changed)}`);

  // Running it twice is the same as running it once — the property that makes a re-run safe.
  runCopyRegion(repo);
  const again = git(repo, "status", "--porcelain").split("\n").filter(Boolean);
  assert.deepEqual(again, changed, "the copy step must be idempotent across runs");
});

test("a canonical-named skill's deleted file goes away downstream too", { skip }, (t) => {
  const name = canonicalSkills()[0];
  const repo = fixtureRepo(t, { skills: {
    [join(name, "SKILL.md")]: "stale\n",
    // A file canonical never had, or had and removed. Either way it must not survive the mirror:
    // half of an old procedure beside half of a new one is worse than either.
    [join(name, "retired-reference.md")]: "a file canonical no longer ships\n",
  } });

  runCopyRegion(repo);

  assert.ok(!existsSync(join(repo, ".claude/skills", name, "retired-reference.md")),
    `a file canonical does not ship must be removed from ${name}/ — the mirror is --delete, the ` +
    `same contract as .flow/bin/`);
});

test("a canonical without skills warns and still completes the sync", { skip }, (t) => {
  const own = "# my-skill\n\nuntouched\n";
  const repo = fixtureRepo(t, { skills: { "my-skill/SKILL.md": own } });

  // A template shaped like canonical before the skills existed: bin dir and callers, no `.claude/`.
  const oldCanon = mkdtempSync(join(tmpdir(), "flow-0081-canon-"));
  t.after(() => rmSync(oldCanon, { recursive: true, force: true }));
  mkdirSync(join(oldCanon, ".flow/bin"), { recursive: true });
  mkdirSync(join(oldCanon, ".github/workflows"), { recursive: true });
  writeFileSync(join(oldCanon, ".flow/bin/flow-doctor.mjs"), "// old\n");
  writeFileSync(join(oldCanon, ".github/workflows/flow-gates.yml"), "name: flow-gates\n");

  const out = runCopyRegion(repo, { canonTpl: oldCanon, canonVer: "1.1.1", ref: "v1.1.1" });

  assert.match(out, /::warning title=No skills to adopt::/,
    "an absent skills tree must be REPORTED — a silent skip is how flow-0081 went unnoticed");
  assert.match(out, /v1\.1\.1/, "…naming the ref that has none, so the fix is the pin");
  assert.equal(readFileSync(join(repo, ".claude/skills/my-skill/SKILL.md"), "utf8"), own,
    "and the repo's own skills are left exactly as they were");
  assert.equal(readFileSync(join(repo, ".flow/VERSION"), "utf8"), "1.1.1\n",
    "the rest of the surface still syncs — the guard must not abort the run");
});

// ---------------------------------------------------------------------------------------------
// Criterion 6 — the changelog fragment. An adopting repo's maintainer learns from the sync PR body
// what changed and whether they must act; the fragment is what puts this change in that sentence.
// ---------------------------------------------------------------------------------------------

test("changes/flow-0081.md exists and states that no caller action is needed", () => {
  // Through changelog-entry.mjs: a release folds the fragment into CHANGELOG.md and deletes it.
  const text = changelogEntry(REPO, "flow-0081");
  assert.ok(text, "flow-0081's changelog entry must exist, as a fragment or in CHANGELOG.md");
  assert.match(text, /caller action:\*\*\s*none/i,
    "the surface is in the reusable, so a caller needs no edit — the fragment must say so");
  assert.match(text, /flow-0081/, "the fragment must name its task id");
});
