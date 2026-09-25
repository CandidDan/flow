// sync-customised-caller.test.mjs — proving tests for flow-0076, criterion 4.
//
// WHAT THIS FILE IS ABOUT. `_flow-sync.yml` copies canonical's thin callers into the adopting repo,
// and for every release before this one it did so with a bare `cp` over whatever was there:
//
//     for f in "$CANON_TPL"/.github/workflows/flow-*.yml; do
//       [ -e "$f" ] && cp "$f" .github/workflows/
//     done
//
// A caller is *meant* to be thin, so that was defensible right up to the first repo that needed
// something the reusable cannot express. CandidDan/Nudge's `flow-gates.yml` carried three per-tree
// checks — `edge-parse`, `mcp-build`, `mobile-check` — and the 2.0.0 sync (Nudge#297) deleted all
// three. Nothing said so: the PR body listed the file under **Modified**, which is true and useless.
// `edge-parse` is the CAN-32 guard, and the last time it was missing a Deno parse error first
// surfaced as a production BOOT_ERROR, costing about seven days of dropped WhatsApp inbounds.
//
// The failure mode is the one this repo exists to prevent: a gate that stops checking while staying
// green. So the assertions here are about the SHAPE of the copy loop — that it asks before it
// overwrites, that it reports what it kept, and that it still copies everything else — and each one
// is proved to fail against a mutated copy of the shipped file. A structure test that cannot fail is
// the same gap one level up, which is the gap being closed.
//
// Why this is canonical's own test rather than the template's: it asserts facts about
// `.github/workflows/_flow-sync.yml`, which exists only here — an adopting repo has the thin caller,
// not the reusable. Same reasoning and the same directory as sync-surface.test.mjs and
// sync-permissions.test.mjs. The pure rule it calls (`extraJobs`) is the template's, and is
// unit-tested there.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE. Same posture as sync-surface.test.mjs: `_flow-gates.yml`'s flow-tooling job runs
// `node --test .flow/bin/*.test.mjs` with no install step, so when `yaml` is missing these skip
// *visibly* ("# skipped") rather than crashing the job. They run for real in the per-stack gate job,
// which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-sync.yml");
const CANON_BIN = join(REPO, "project-template/.flow/bin");
const SYNC_MJS = join(CANON_BIN, "flow-sync.mjs");

const readReusable = () => readFileSync(REUSABLE, "utf8");

/** Every `run:` script in a parsed workflow, concatenated. */
const runScripts = (wf) =>
  Object.values(wf?.jobs ?? {})
    .flatMap((job) => job?.steps ?? [])
    .map((step) => step?.run)
    .filter((run) => typeof run === "string")
    .join("\n");

// Lifted from the shipped `run:` block rather than reimplemented — a paraphrase would only prove the
// paraphrase. The region runs from the accumulator the loop writes to, through the loop, to the read
// that hands the result to `pr-body`, so the behavioural tests below execute the REAL loop. If this
// stops matching, the step was reshaped: re-read it and update the extractor, never relax the
// behaviour asserted below.
//
// The same loop is extracted a second way by sync-permissions.test.mjs, whose regex anchors on the
// `for f in …` line; both must keep matching, which is the point of leaving that line untouched.
const COPY_LOOP_REGION =
  /^\s*KEPT_FILE="\$\(mktemp\)"$[\s\S]*?^\s*KEPT="\$\(cat "\$KEPT_FILE"\)"$/m;

const extractLoopRegion = (text) => {
  const match = runScripts(yamlMod.parse(text)).match(COPY_LOOP_REGION);
  assert.ok(match, "could not find the caller-copy loop in _flow-sync.yml's run scripts — it was " +
    "reshaped; update this extractor and re-verify the behaviour below still holds");
  return match[0];
};

/** Command lines only: continuations joined, comments dropped (the loop explains itself in prose). */
const commandLines = (script) =>
  script.replace(/\\\n\s*/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

// ---------------------------------------------------------------------------------------------
// The check, written over file CONTENT so a test can hand it a mutated copy and prove the check
// would have caught the real defect. Returns human-readable problems; empty means the copy loop
// asks before it overwrites, reports what it kept, and still copies everything else.
// ---------------------------------------------------------------------------------------------
export function checkCustomisedCallerGuard(text, yaml) {
  const problems = [];
  const script = runScripts(yaml.parse(text));
  const loop = (script.match(COPY_LOOP_REGION) ?? [""])[0];
  const lines = commandLines(loop);

  // 1. The loop ASKS. Both halves of the question must be there: the local file that would be
  //    overwritten, and the incoming one it is compared against. Asking about the wrong pair is
  //    how a guard passes a structure test and protects nothing.
  const asks = lines.some((l) =>
    /\bextra-jobs\b/.test(l) && /--local\s+"\$DEST"/.test(l) && /--incoming\s+"\$f"/.test(l));
  // …and it must be reachable when the loop runs on its own: the region is extracted and executed
  // by three test files, and a `$SYNC` defined a hundred lines up is unbound under `set -u` in all
  // of them. That is not style — it is what makes the behaviour below provable.
  const selfContained = lines.some((l) => /\bextra-jobs\b/.test(l) && /\$CANON_TPL/.test(l));
  if (asks && !selfContained) {
    problems.push(
      "the `extra-jobs` call reaches for a variable defined outside the copy loop (`$SYNC`). The " +
      "loop is extracted and run in isolation by this file, sync-permissions.test.mjs and " +
      "sync-surface.test.mjs, where only $CANON_TPL is supplied — so `set -u` aborts it and the " +
      "guard's behaviour becomes unprovable. Invoke `node \"$CANON_TPL/.flow/bin/flow-sync.mjs\"`.");
  }
  if (!asks) {
    problems.push(
      "the caller-copy loop never runs `flow-sync.mjs extra-jobs --local \"$DEST\" --incoming " +
      "\"$f\"`. Without that question every sync overwrites a customised caller with canonical's " +
      "thin one and DELETES its extra jobs (Nudge#297 lost `edge-parse`, `mcp-build` and " +
      "`mobile-check` that way, and the PR body called it 'Modified').");
  }

  // 2. The answer CHANGES WHAT HAPPENS. A non-empty result must skip the copy — the `continue` is
  //    the whole fix. An invocation whose result is not acted on is decoration.
  const acts = /\[ -n "\$EXTRA" \]/.test(loop) && lines.includes("continue");
  if (!acts) {
    problems.push(
      "the loop does not skip the copy when `extra-jobs` reports anything: it needs a " +
      "`[ -n \"$EXTRA\" ]` test whose branch `continue`s past the `cp`. Running the check and " +
      "copying anyway is the original bug with an extra log line.");
  }

  // 3. It SAYS SO, as an annotation, naming both the file and the jobs. A warning that names
  //    neither is unactionable, and this is the only place the fact is ever reported at the moment
  //    it happens.
  const warning = loop.split("\n").find((l) => /::warning/.test(l)) ?? "";
  if (!/\$\{?DEST\}?/.test(warning) || !/\$\{?EXTRA_JOBS\}?/.test(warning)) {
    problems.push(
      "the kept caller is not reported by a `::warning` naming both `${DEST}` and `${EXTRA_JOBS}`. " +
      "A silent skip swaps one invisible outcome for another: the jobs survive, and nobody learns " +
      "that the caller no longer receives canonical's changes.");
  }

  // 4. And it STILL COPIES otherwise — including a caller new to the repo, which has no local file
  //    to lose. A guard that stopped copying would freeze every caller in the fleet at the version
  //    it adopted, which is a bigger outage than the one being fixed.
  if (!lines.some((l) => /^cp "\$f" \.github\/workflows\/$/.test(l))) {
    problems.push(
      "the loop no longer copies `cp \"$f\" .github/workflows/` at all. Keeping a customised " +
      "caller must not stop canonical shipping every other caller, or adopting repos never " +
      "receive a workflow again (flow-0051, note 4).");
  }

  // 5. The kept list reaches the PR body. The warning is in a log nobody reads after the fact; the
  //    body is what the reviewer of the sync PR actually sees.
  if (!/pr-body[^\n]*--kept "\$KEPT"/.test(script)) {
    problems.push(
      "`pr-body` is not passed `--kept \"$KEPT\"`, so the sync PR does not say which callers it " +
      "deliberately did not update. The reviewer then has the same information they had before " +
      "flow-0076: none.");
  }

  return problems;
}

// ---------------------------------------------------------------------------------------------
// Criterion 4, part 1 — read off the shipped workflow.
// ---------------------------------------------------------------------------------------------

test("the shipped _flow-sync.yml guards the caller copy, reports it, and still copies the rest", { skip }, () => {
  const problems = checkCustomisedCallerGuard(readReusable(), yamlMod);
  assert.deepEqual(problems, [], `_flow-sync.yml: ${problems.join(" | ")}`);
});

test("the header's documented surface records that a customised caller is kept", { skip }, () => {
  // The comment block at the top is what a maintainer reads to learn what a sync carries. An
  // inventory that still promises to refresh every caller contradicts the code, and flow-0048 is
  // the record of what a stale inventory costs.
  const header = readReusable().split("\njobs:")[0];
  assert.match(header, /What it syncs/);
  assert.match(header, /flow-0076/, "the exception must be documented where the surface is listed");
});

// ---------------------------------------------------------------------------------------------
// Criterion 4, part 2 — each assertion FAILS against a mutated copy. Demonstrated, not claimed.
// ---------------------------------------------------------------------------------------------

/** Replace a line of the shipped block scalar, keeping its indentation so the mutant is valid YAML. */
const mutateLine = (text, pattern, replacement) => {
  const mutated = text.replace(pattern, (line) => line.match(/^[ \t]*/)[0] + replacement);
  assert.notEqual(mutated, text, `the mutation must actually change the file: ${pattern}`);
  return mutated;
};

test("removing the extra-jobs question fails, by name", { skip }, () => {
  const mutated = mutateLine(readReusable(), /^ *EXTRA="\$\(node "\$CANON_TPL[^\n]*$/m, 'EXTRA=""');
  const problems = checkCustomisedCallerGuard(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the question is gone: ${problems.join(" | ")}`);
  assert.match(problems[0], /never runs `flow-sync\.mjs extra-jobs/);
  assert.match(problems[0], /DELETES its extra jobs/,
    "the message must name the consequence, not just the missing line");
});

test("asking but copying anyway fails — an unacted-on check is decoration", { skip }, () => {
  // The cheapest false green: keep the invocation, drop the `continue` that makes it matter.
  const mutated = mutateLine(readReusable(), /^ *continue$\n(?= *fi)/m, 'echo "(kept)"\n');
  const problems = checkCustomisedCallerGuard(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the skip is gone: ${problems.join(" | ")}`);
  assert.match(problems[0], /does not skip the copy/);
  assert.match(problems[0], /original bug with an extra log line/);
});

test("a warning that names neither the file nor the jobs fails", { skip }, () => {
  const mutated = mutateLine(readReusable(), /^ *echo "::warning title=Customised caller kept[^\n]*$/m,
    'echo "::warning::a caller was kept"');
  const problems = checkCustomisedCallerGuard(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the annotation is degraded: ${problems.join(" | ")}`);
  assert.match(problems[0], /naming both/);
});

test("dropping the `cp` fails too — keeping one caller must not freeze them all", { skip }, () => {
  const mutated = mutateLine(readReusable(), /^ *cp "\$f" \.github\/workflows\/$/m,
    "# (caller copy removed)");
  const problems = checkCustomisedCallerGuard(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the copy is gone: ${problems.join(" | ")}`);
  assert.match(problems[0], /no longer copies/);
});

test("dropping `--kept` from pr-body fails — the log is not the record", { skip }, () => {
  const mutated = readReusable().replace(' --kept "$KEPT"', "");
  assert.notEqual(mutated, readReusable(), "the mutation must actually remove the flag");
  const problems = checkCustomisedCallerGuard(mutated, yamlMod);
  assert.equal(problems.length, 1, `only the body flag is gone: ${problems.join(" | ")}`);
  assert.match(problems[0], /not passed `--kept/);
});

// ---------------------------------------------------------------------------------------------
// Criterion 4, part 3 — the shipped loop, executed. Three callers in one run: one customised
// (kept), one thin (copied), one absent locally (added).
// ---------------------------------------------------------------------------------------------

// FIXTURE OWNER. The `uses:` owner is the placeholder `OWNER/flow` rather than canonical's real
// owner/repo, and deliberately so: `docs/adr/` carries a rename-cutover amendment whose count of
// files naming that reference is pinned to the working tree by `adr-split-authoring.test.mjs`, so a
// new file spelling it out fails that test — and the ADR is not this task's to edit. Nothing here
// parses the value anyway; only the job KEYS are under test.
const CANON_GATES = `name: flow-gates
on:
  pull_request:

jobs:
  gate:
    uses: OWNER/flow/.github/workflows/_flow-gates.yml@v2
    with:
      node_version: "22"
`;

// The shape that was being destroyed: canonical's thin job plus this repo's own per-tree checks.
const NUDGE_GATES = `name: flow-gates
on:
  pull_request:

jobs:
  gate:
    uses: OWNER/flow/.github/workflows/_flow-gates.yml@v2
    with:
      node_version: "20"

  # ── this repo's own checks; the reusable cannot express them ──
  edge-parse:
    runs-on: ubuntu-latest
    steps:
      - run: deno check supabase/functions/**/*.ts

  mcp-build:
    runs-on: ubuntu-latest
    steps:
      - run: npm --prefix mcp run build
`;

const CANON_DOCTOR = `name: flow-doctor
on:
  schedule:
    - cron: "17 6 * * *"

jobs:
  doctor:
    uses: OWNER/flow/.github/workflows/_flow-doctor.yml@v2
`;

const CANON_COMPASS = `name: flow-compass
on:
  workflow_dispatch:

jobs:
  compass:
    uses: OWNER/flow/.github/workflows/_flow-compass.yml@v2
`;

/**
 * A fake canonical template holding only what the loop reads, and a repo holding the local callers.
 * The template is synthetic on purpose: the assertion is about which files move, so the fixture has
 * to control the job sets on both sides rather than inherit whatever canonical ships today.
 */
const fixture = (t, localCallers) => {
  const root = mkdtempSync(join(tmpdir(), "flow-0076-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const canonTpl = join(root, "canon");
  const repo = join(root, "repo");
  mkdirSync(join(canonTpl, ".github/workflows"), { recursive: true });
  // The loop invokes `node "$CANON_TPL/.flow/bin/flow-sync.mjs"`, exactly as CI's clone of canonical
  // presents it, so the fake template carries the REAL helper — the rule under test is the shipped
  // one, not a stub of it.
  cpSync(CANON_BIN, join(canonTpl, ".flow/bin"), { recursive: true });
  mkdirSync(join(repo, ".github/workflows"), { recursive: true });
  writeFileSync(join(canonTpl, ".github/workflows/flow-gates.yml"), CANON_GATES);
  writeFileSync(join(canonTpl, ".github/workflows/flow-doctor.yml"), CANON_DOCTOR);
  writeFileSync(join(canonTpl, ".github/workflows/flow-compass.yml"), CANON_COMPASS);
  // A non-caller in the same directory: the glob is `flow-*.yml`, so this must never be copied.
  writeFileSync(join(canonTpl, ".github/workflows/_flow-gates.yml"), "name: reusable\n");
  for (const [name, body] of Object.entries(localCallers)) {
    writeFileSync(join(repo, ".github/workflows", name), body);
  }
  return { canonTpl, repo };
};

/** Run the shipped loop in `repo`, exactly as the workflow's shell runs it, and report $KEPT. */
const runLoop = ({ repo, canonTpl }) => {
  const region = extractLoopRegion(readReusable());
  const out = execFileSync("bash", ["-euo", "pipefail", "-c",
    `${region}\nprintf 'KEPT_BEGIN\\n%s\\nKEPT_END\\n' "$KEPT"`], {
    cwd: repo,
    encoding: "utf8",
    // CANON_TPL alone, deliberately: the region must be executable with nothing else supplied,
    // which is the property `selfContained` above asserts statically.
    env: { ...process.env, CANON_TPL: canonTpl },
  });
  const kept = out.split("KEPT_BEGIN\n")[1].split("\nKEPT_END")[0];
  return { out, kept };
};

test("a customised caller is kept byte for byte while every other caller still syncs", { skip }, (t) => {
  const fx = fixture(t, { "flow-gates.yml": NUDGE_GATES, "flow-doctor.yml": "name: stale\njobs:\n  doctor:\n    uses: old@v1\n" });

  const { out, kept } = runLoop(fx);

  // The whole point: the three jobs still exist.
  assert.equal(readFileSync(join(fx.repo, ".github/workflows/flow-gates.yml"), "utf8"), NUDGE_GATES,
    "the customised caller must be left exactly as it was — `edge-parse` is a production guard, " +
    "and a sync that deletes it leaves a green gate that stopped checking");

  // …and the rest of the surface is unaffected, in both directions.
  assert.equal(readFileSync(join(fx.repo, ".github/workflows/flow-doctor.yml"), "utf8"), CANON_DOCTOR,
    "a caller with no extra jobs is still overwritten, stale pin and all");
  assert.equal(readFileSync(join(fx.repo, ".github/workflows/flow-compass.yml"), "utf8"), CANON_COMPASS,
    "a caller NEW to this repo is still added — that is how canonical ships a workflow to a repo " +
    "that has never heard of it");
  assert.throws(() => readFileSync(join(fx.repo, ".github/workflows/_flow-gates.yml"), "utf8"),
    /ENOENT/, "the glob is `flow-*.yml`; a reusable in the same directory is not a caller");

  // The report, at the moment it happens.
  assert.match(out, /::warning title=Customised caller kept::/);
  assert.match(out, /flow-gates\.yml declares job\(s\) edge-parse mcp-build/,
    "the warning must name the file and every job that would have been deleted");
  assert.match(out, /does NOT receive this version's changes/,
    "…and the cost of keeping it, which is the part a reader would otherwise have to infer");
  assert.match(out, /source_roots/, "…and the way out, which is flow-0077's migration");

  // And the same fact in the shape `pr-body` consumes.
  assert.equal(kept, ".github/workflows/flow-gates.yml\tedge-parse mcp-build");
});

test("a sync that keeps nothing produces an empty $KEPT and copies everything", { skip }, (t) => {
  // The normal case, and the one that must stay unchanged: every local caller is thin, so all three
  // are overwritten and the PR body gains no section.
  const fx = fixture(t, { "flow-gates.yml": CANON_GATES.replace("@v2", "@v1.4.0") });

  const { out, kept } = runLoop(fx);

  assert.equal(kept, "", "nothing was kept, so `pr-body` must receive an empty list");
  assert.doesNotMatch(out, /::warning/, "and nothing is reported — there is nothing to report");
  assert.equal(readFileSync(join(fx.repo, ".github/workflows/flow-gates.yml"), "utf8"), CANON_GATES,
    "a pin-only difference is exactly what a sync exists to update");
});

test("two customised callers are both kept and both listed", { skip }, (t) => {
  const fx = fixture(t, {
    "flow-gates.yml": NUDGE_GATES,
    "flow-compass.yml": CANON_COMPASS + "\n  nightly:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ./nightly.sh\n",
  });

  const { out, kept } = runLoop(fx);

  assert.deepEqual(kept.split("\n").sort(), [
    ".github/workflows/flow-compass.yml\tnightly",
    ".github/workflows/flow-gates.yml\tedge-parse mcp-build",
  ], "the accumulator must carry one line per kept caller, not just the last one");
  assert.equal(out.match(/::warning title=Customised caller kept::/g).length, 2,
    "each kept caller is its own annotation, so each is actionable on its own");
  assert.equal(readFileSync(join(fx.repo, ".github/workflows/flow-doctor.yml"), "utf8"), CANON_DOCTOR);
});

test("the accumulator file lives outside the worktree, so the sync cannot commit it", { skip }, () => {
  // `git add -A` stages the whole tree a few lines below the loop. A kept-caller list written into
  // the repo would be committed onto the sync branch and land in the PR's diff.
  const region = extractLoopRegion(readReusable());
  assert.match(region, /KEPT_FILE="\$\(mktemp\)"/,
    "the list must go to a mktemp path, not a file inside the repo being synced");
});

test("an unreadable caller stops the run rather than reading as 'no extra jobs'", { skip }, (t) => {
  // The failure that must not be quiet. `extra-jobs` printing nothing means "safe to overwrite", so
  // a read error that degraded to empty output would delete exactly the jobs this guard protects.
  // Asserted against the subcommand the loop invokes, because that is where the read happens and
  // `set -e` in the step turns its exit code into a stopped sync.
  const fx = fixture(t, { "flow-gates.yml": NUDGE_GATES });
  const incoming = join(fx.canonTpl, ".github/workflows/flow-gates.yml");
  assert.throws(
    () => execFileSync("node", [SYNC_MJS, "extra-jobs", "--local", join(fx.repo, "nope.yml"), "--incoming", incoming],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    (err) => {
      assert.notEqual(err.status, 0, "a file that could not be read must exit non-zero");
      assert.equal(err.stdout, "", "…and must print NOTHING, because empty output means 'copy it'");
      assert.match(String(err.stderr), /ENOENT/);
      return true;
    });

  // And the same posture for a missing argument: exit 2, not a silent empty answer.
  assert.throws(
    () => execFileSync("node", [SYNC_MJS, "extra-jobs", "--local", incoming],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    (err) => {
      assert.equal(err.status, 2);
      assert.match(String(err.stderr), /usage: flow-sync\.mjs extra-jobs/);
      return true;
    });
});
