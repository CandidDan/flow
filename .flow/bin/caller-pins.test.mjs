// caller-pins.test.mjs — proving tests for flow-0056.
//
// THE DEFECT. The 2.0.0 re-cut moved `VERSION` and `project-template/.flow/VERSION` to 2.0.0 and
// left every published caller pinned at `@v1`. A repo that adopts 2.0.0 therefore receives 2.0.0's
// copied surface — `.flow/bin/`, the callers, the version stamp — wired to the **v1** reusables.
// The two halves disagree about which major they are, silently, because a caller pinned at a tag
// that still resolves is indistinguishable from a correct one.
//
// The sharp edge is `flow-sync` itself. Its copied surface includes `.github/workflows/flow-*.yml`,
// so the first sync into a repo overwrites that repo's `flow-sync.yml` with the template's. A repo
// hand-edited to escape flow-0051 (adding `workflows: write`) and then synced gets back a
// `flow-sync.yml` pinned to `_flow-sync.yml@v1` — the version WITHOUT that grant. The fix reverts
// itself on first use.
//
// TWO REFS, NOT ONE. The ten `uses:` pins are the obvious half. The other is
// `_flow-sync.yml`'s canonical checkout, `${{ inputs.canonical_ref || 'v1' }}` — and the thin
// caller passes an EMPTY `canonical_ref` on a scheduled run, so that fallback is what a real
// weekly sync uses. Fixing the pins alone leaves the adopt source on v1: v2 workflows adopting
// v1 content, every Wednesday, with both halves working and only disagreeing about the release.
// flow-init.mjs already names this the split-brain trap for the v1-edge case; this is the same
// trap across a major.
//
// WHAT THIS CHECKS, AND AGAINST WHAT. The expected ref is DERIVED from the major component of
// root `VERSION`, never hard-coded. A check that asserted the literal `v2` would pass today and
// stop meaning anything the moment 3.0.0 is cut — which is exactly how the tree arrived in the
// state this task fixes. One source of truth, and it is the same file the release stamp reads.
//
// WHAT IT DELIBERATELY DOES NOT CHECK. Canonical's OWN `.github/workflows/flow-*.yml` pin `@main`
// on purpose: canonical dogfoods its own tip, and gating it against a tagged version of itself
// would gate it against a version it has already moved past (see `adapters.test.mjs`). A sweep
// that caught them would be a bug, so the scan is scoped to the published artefact and a case
// below pins that scoping down.
//
// LINE-BASED, NOT YAML-PARSED — same posture as `action-pins.test.mjs`. `_flow-gates.yml`'s
// flow-tooling job runs `node --test .flow/bin/*.test.mjs` with no install step, so a check that
// imported `yaml` would skip in precisely the job that guards the fleet. It also lets a violation
// name its LINE; a parsed document has none.
//
// Why canonical's own test rather than the template's: it asserts facts about the published
// artefact and about `.github/workflows/_flow-sync.yml`, which exists only here. An adopting repo
// has the thin caller, not the reusable.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");

const VERSION_FILE = join(REPO, "VERSION");
const TEMPLATE_DIR = "project-template/.github/workflows";
const OWN_DIR = ".github/workflows";
const SYNC_REUSABLE = ".github/workflows/_flow-sync.yml";
const SYNC_CALLER = `${TEMPLATE_DIR}/flow-sync.yml`;

// ---------------------------------------------------------------------------------------------
// The check, written over file CONTENT rather than paths, so a case can hand it a mutated copy
// or a fixture VERSION. Returns human-readable problems; empty means the artefact is coherent.
// ---------------------------------------------------------------------------------------------

/** `2.0.0` → `v2`. The whole check hangs off this one derivation. */
export const expectedRef = (version) => {
  const major = String(version).trim().split(".")[0];
  assert.match(major, /^\d+$/, `VERSION must start with a numeric major, got ${JSON.stringify(version)}`);
  return `v${major}`;
};

// A `uses:` of one of canonical's OWN reusables. Third-party actions
// (`actions/checkout@<sha>`) never match: `action-pins.test.mjs` owns those, and the two checks
// must not both claim the same line.
const USES_REUSABLE = /^\s*uses:\s*(\S+\/\.github\/workflows\/_flow-[a-z-]+\.yml)@(\S+?)\s*$/;

// `_flow-sync.yml`'s canonical checkout. The `|| '…'` fallback is the ref a scheduled sync uses,
// because the thin caller forwards an empty `inputs.canonical_ref`.
const CANONICAL_REF_FALLBACK = /\$\{\{\s*inputs\.canonical_ref\s*\|\|\s*'([^']*)'\s*\}\}/;

// The dispatch input's advertised default. Prose, but prose a human copies a ref out of.
const ADVERTISED_DEFAULT = /description:\s*"Canonical ref[^"\n]*\bDefault\s+([^"\n.]+)\."/;

/**
 * @param {object} input
 * @param {string} input.version           contents of root VERSION
 * @param {{name: string, text: string}[]} input.callers   published thin callers
 * @param {{name: string, text: string}[]} input.refFiles  files carrying a canonical_ref default
 */
export function checkCallerPins({ version, callers, refFiles }) {
  const want = expectedRef(version);
  const problems = [];
  let seen = 0;

  for (const { name, text } of callers) {
    text.split("\n").forEach((line, i) => {
      const m = line.match(USES_REUSABLE);
      if (!m) return;
      seen += 1;
      const [, path, ref] = m;
      if (ref !== want) {
        problems.push(
          `${name}:${i + 1}: ${path} is pinned @${ref}, expected @${want} (root VERSION is ` +
          `${String(version).trim()}). A published caller pinned at the previous major ships a ` +
          `repo 2.0.0's copied tooling wired to the v1 reusables — and because the stale tag ` +
          `still resolves, nothing in that repo ever says so.`,
        );
      }
    });
  }

  for (const { name, text } of refFiles) {
    const fallback = text.match(CANONICAL_REF_FALLBACK);
    if (fallback && fallback[1] !== want) {
      seen += 1;
      problems.push(
        `${name}: the canonical_ref fallback is '${fallback[1]}', expected '${want}'. The thin ` +
        `caller forwards an EMPTY canonical_ref on a scheduled run, so this fallback is the ref a ` +
        `real weekly sync adopts from — leaving it behind gives a v${want.slice(1)} repo v1 ` +
        `content on a cron, which is the split brain flow-init.mjs already warns about.`,
      );
    } else if (fallback) {
      seen += 1;
    }

    const advertised = text.match(ADVERTISED_DEFAULT);
    if (advertised && advertised[1] !== want) {
      problems.push(
        `${name}: the canonical_ref input advertises "Default ${advertised[1]}", expected ` +
        `"Default ${want}". A description a human copies a ref out of is how the stale pin gets ` +
        `re-introduced by hand after the code was fixed.`,
      );
    }
  }

  if (seen === 0) {
    problems.push(
      "no canonical ref was found to check at all — no `uses:` of a _flow-*.yml reusable and no " +
      "canonical_ref fallback. An empty check is a failure, not a pass: it is the silent no-op " +
      "this file exists to prevent.",
    );
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Reading the real tree.
// ---------------------------------------------------------------------------------------------

const read = (rel) => ({ name: rel, text: readFileSync(join(REPO, rel), "utf8") });

const workflowsIn = (dir) =>
  readdirSync(join(REPO, dir))
    .filter((f) => /^flow-[a-z-]+\.ya?ml$/.test(f))
    .sort()
    .map((f) => read(`${dir}/${f}`));

const realInput = () => ({
  version: readFileSync(VERSION_FILE, "utf8"),
  callers: workflowsIn(TEMPLATE_DIR),
  refFiles: [read(SYNC_REUSABLE), read(SYNC_CALLER)],
});

// ---------------------------------------------------------------------------------------------
// Criterion: every published caller pins the major root VERSION declares.
// ---------------------------------------------------------------------------------------------

test("every template caller pins the major root VERSION declares", () => {
  const input = realInput();
  assert.ok(input.callers.length > 0, "an empty check is a failure, not a pass — no template callers found");
  assert.deepEqual(checkCallerPins(input), [],
    "the published callers and the version stamp are the two halves of one release; a repo that " +
    "adopts the stamp must get the reusables that go with it");
});

test("all ten callers are covered, and each carries exactly one resolved reusable pin", () => {
  // The count is the part a hand-sweep gets wrong: ten files edited by hand is exactly where one
  // gets missed, and a missed pin is invisible until that repo's CI fails weeks later.
  const callers = workflowsIn(TEMPLATE_DIR);
  const pins = callers.map(({ name, text }) => {
    const found = text.split("\n").map((l) => l.match(USES_REUSABLE)).filter(Boolean);
    assert.equal(found.length, 1, `${name} should reference exactly one canonical reusable`);
    return `${name} -> @${found[0][2]}`;
  });
  assert.equal(pins.length, 10, `expected ten published callers, got:\n${pins.join("\n")}`);
  const want = expectedRef(readFileSync(VERSION_FILE, "utf8"));
  for (const pin of pins) assert.ok(pin.endsWith(`@${want}`), pin);
});

// ---------------------------------------------------------------------------------------------
// Criterion: a caller mutated back to @v1 fails, naming the file and BOTH refs — demonstrated by
// mutating a copy of the real file, the way sync-permissions.test.mjs demonstrates its removals.
// ---------------------------------------------------------------------------------------------

test("a template caller mutated back to @v1 fails, naming the file and both refs", () => {
  const input = realInput();
  const want = expectedRef(input.version);
  const target = input.callers.find((c) => c.name.endsWith("flow-gates.yml"));
  assert.ok(target, "flow-gates.yml is the caller every adopting repo has; it must be in the scan");

  const mutated = target.text.replace(
    new RegExp(`(_flow-[a-z-]+\\.yml)@${want}$`, "m"), "$1@v1");
  assert.notEqual(mutated, target.text, "the mutation must actually move the pin back");

  const problems = checkCallerPins({
    ...input,
    callers: input.callers.map((c) => (c === target ? { ...c, text: mutated } : c)),
  });
  assert.equal(problems.length, 1, `exactly one caller regressed: ${problems.join(" | ")}`);
  assert.match(problems[0], /^project-template\/\.github\/workflows\/flow-gates\.yml:\d+:/,
    "the failure must name the file AND the line, so the fix is obvious from the log rather " +
    "than a count that sends someone hunting through ten files");
  assert.match(problems[0], /@v1/, "the failure must name the ref that is there");
  assert.match(problems[0], new RegExp(`@${want}`), "…and the ref that should be");
});

test("the _flow-sync canonical_ref fallback left at v1 fails on its own — the second ref", () => {
  // The one that survives a pin sweep: fixing the ten `uses:` lines and stopping there leaves a
  // v2 repo adopting v1 content on the weekly cron.
  const input = realInput();
  const want = expectedRef(input.version);
  const reusable = input.refFiles.find((f) => f.name === SYNC_REUSABLE);
  const mutated = reusable.text.replace(`inputs.canonical_ref || '${want}'`, "inputs.canonical_ref || 'v1'");
  assert.notEqual(mutated, reusable.text, "the mutation must actually move the fallback back");

  const problems = checkCallerPins({
    ...input,
    refFiles: input.refFiles.map((f) => (f === reusable ? { ...f, text: mutated } : f)),
  });
  assert.equal(problems.length, 1, `only the fallback regressed: ${problems.join(" | ")}`);
  assert.match(problems[0], /^\.github\/workflows\/_flow-sync\.yml: the canonical_ref fallback is 'v1'/);
  assert.match(problems[0], /EMPTY canonical_ref on a scheduled run/,
    "the failure has to say WHY an unused-looking default matters, or the next person deletes " +
    "the check instead of the bug");
});

test("an input description still advertising the old default fails too", () => {
  const input = realInput();
  const want = expectedRef(input.version);
  const caller = input.refFiles.find((f) => f.name === SYNC_CALLER);
  const mutated = caller.text.replace(`Default ${want}.`, "Default v1.");
  assert.notEqual(mutated, caller.text, "the mutation must actually stale the description");

  const problems = checkCallerPins({
    ...input,
    refFiles: input.refFiles.map((f) => (f === caller ? { ...f, text: mutated } : f)),
  });
  assert.equal(problems.length, 1, `only the description regressed: ${problems.join(" | ")}`);
  assert.match(problems[0], /advertises "Default v1"/);
});

// ---------------------------------------------------------------------------------------------
// Criterion: the check tracks the stamp, it does not hard-code v2.
// ---------------------------------------------------------------------------------------------

test("a hypothetical VERSION 3.0.0 fails the real @v2 callers — the check follows the stamp", () => {
  // Without this case the check passes today and quietly stops working at the next major, which
  // is precisely the failure mode that produced flow-0056: 2.0.0 shipped with v1 callers and
  // nothing noticed.
  const problems = checkCallerPins({ ...realInput(), version: "3.0.0\n" });
  assert.ok(problems.length >= 10,
    `every caller must be reported against the bumped stamp, got ${problems.length}: ` +
    problems.join(" | "));
  for (const p of problems) assert.match(p, /expected @v3|expected 'v3'|"Default v3"/, p);
});

test("expectedRef reads the major and nothing else", () => {
  assert.equal(expectedRef("2.0.0\n"), "v2");
  assert.equal(expectedRef("2.14.3"), "v2");
  assert.equal(expectedRef("10.0.0\n"), "v10", "a two-digit major must not become 'v1'");
  assert.throws(() => expectedRef("v2.0.0"), /numeric major/,
    "a stamp that already carries the alias prefix is a different file's bug; fail loudly here");
});

test("an empty scan is a failure, not a pass", () => {
  const problems = checkCallerPins({ version: "2.0.0\n", callers: [], refFiles: [] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /empty check is a failure/);
});

// ---------------------------------------------------------------------------------------------
// Criterion: canonical's own callers still pin @main, and the sweep does not reach them.
// ---------------------------------------------------------------------------------------------

test("canonical's own callers still pin @main — a sweep that caught them would be a bug", () => {
  const own = workflowsIn(OWN_DIR);
  assert.ok(own.length > 0, "an empty check is a failure, not a pass — no canonical callers found");
  const pinned = own.flatMap(({ name, text }) =>
    text.split("\n")
      .map((l) => l.match(USES_REUSABLE))
      .filter(Boolean)
      .map((m) => ({ name, ref: m[2] })));
  assert.ok(pinned.length > 0, "canonical dogfoods its own reusables via thin callers; none found");
  for (const { name, ref } of pinned) {
    assert.equal(ref, "main",
      `${name} pins @${ref}. Canonical tracks its own tip deliberately: pinning it at a tagged ` +
      "version would gate it against a version of itself it has already moved past.");
  }
});

test("the scan is scoped to the published artefact, so @main never reaches the pin check", () => {
  // Scoping proved by construction rather than asserted: feed canonical's own callers to the same
  // check and every one of them is reported. That is what makes running it over TEMPLATE_DIR only
  // a deliberate choice rather than an accident nobody would notice if it changed.
  const problems = checkCallerPins({
    version: readFileSync(VERSION_FILE, "utf8"),
    callers: workflowsIn(OWN_DIR),
    refFiles: [],
  });
  assert.ok(problems.length > 0 && problems.every((p) => /@main/.test(p)),
    `canonical's own @main callers must be out of scope, not silently tolerated: ${problems.join(" | ")}`);
  assert.deepEqual(checkCallerPins(realInput()), [], "…and the real, scoped run is still clean");
});

// ---------------------------------------------------------------------------------------------
// Criterion: the CHANGELOG tells an adopter the three things they cannot derive from the diff.
// ---------------------------------------------------------------------------------------------

test("the 2.0.0 changelog section states the pin requirement, the delivery, and the overwrite", () => {
  const changelog = readFileSync(join(REPO, "CHANGELOG.md"), "utf8");
  const section = changelog.split(/^## /m).find((s) => s.startsWith("2.0.0"));
  assert.ok(section, "the 2.0.0 section must exist — it is the release an adopting repo reads");

  assert.match(section, /@v2/,
    "adopting v2 requires the callers to pin @v2; a section that never says so leaves the reader " +
    "with a version stamp and no idea the reusables move with it");
  assert.match(section, /flow-sync/,
    "…and it must say that flow-sync delivers that pin once flow-0056 lands, or every repo " +
    "hand-edits ten files");
  assert.match(section, /overwrit/i,
    "…and it must warn that a repo hand-edited BEFORE this lands has its caller overwritten by " +
    "its first sync — the flow-0051 fix reverting itself is the whole reason this is priority 1");
});
