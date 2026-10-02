// sync-default-ref.test.mjs — proving tests for flow-0105.
//
// THE DEFECT. `_flow-sync.yml` adopted from `${{ inputs.canonical_ref || 'v2' }}`. The thin caller
// forwards `canonical_ref: ${{ inputs.canonical_ref }}`, and on the weekly `schedule` that input is
// EMPTY — only a `workflow_dispatch` human ever filled it in. So the literal `'v2'` was the ref
// every real, unattended sync used, whatever the repo's own callers were pinned to. A repo on
// `@v2-edge` had its cron pull `v2` content on top of edge workflows; the caller's own comment told
// the human to "Bump `canonical_ref` if your other callers pin a tag other than v2", which is advice
// a scheduled run has no input to receive.
//
// NOTHING FAILS WHEN IT HAPPENS. That is the whole character of the bug, and it is why the last
// three defects on issue #55 read the same way: both halves work, they merely disagree about which
// release the repo is on. Latent while the entire fleet pins `@v2` and the default IS `v2` — which
// is exactly why it needs a test rather than a watchful eye. It bites the first repo pinned to
// anything else, silently, once a week.
//
// WHAT IS TESTED, AND HOW. The resolution is shell inside a workflow step, so the behavioural half
// EXTRACTS the shipped step and runs it for real under `bash`, in a fixture repo whose
// `.github/workflows/` holds the callers each scenario is about. Same posture as
// sync-existing-branch.test.mjs: a paraphrase of the shell would only prove the paraphrase, and the
// thing under test is precisely what the shell reads off disk.
//
// The static half is written over file CONTENT so each check can be handed a MUTATED copy of the
// real file and shown to fail against the pre-flow-0105 shape. A structure check that cannot fail
// is the same silent no-op one level up.
//
// Why canonical's own test rather than the template's: it asserts facts about
// `.github/workflows/_flow-sync.yml`, which exists only here — an adopting repo has the thin caller,
// not the reusable. Same reasoning and the same directory as sync-surface.test.mjs,
// sync-permissions.test.mjs and sync-existing-branch.test.mjs.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { changelogEntry } from "./changelog-entry.mjs";

// DEPENDENCY NOTE. Same posture as the other sync-*.test.mjs files: `_flow-gates.yml`'s
// flow-tooling job runs `node --test .flow/bin/*.test.mjs` with no install step, so when `yaml` is
// missing these skip *visibly* ("# skipped") rather than crashing the job. They run for real in the
// per-stack gate job, which does `npm ci` first.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-sync.yml");
const TEMPLATE_CALLER = join(REPO, "project-template/.github/workflows/flow-sync.yml");

const RESOLVE_STEP = "Resolve canonical ref";
const CLONE_STEP = "Clone canonical (outside the working tree)";

// The fallback the resolution falls back TO. Not a free choice: `caller-pins.test.mjs` derives the
// expected canonical ref from root VERSION's major, and this must stay the same value.
const FALLBACK_REF = `v${readFileSync(join(REPO, "VERSION"), "utf8").trim().split(".")[0]}`;

const readReusable = () => readFileSync(REUSABLE, "utf8");

const stepsOf = (text) =>
  Object.values(yamlMod.parse(text)?.jobs ?? {}).flatMap((job) => job?.steps ?? []);

/** The `run:` script of the named step, as shipped. */
const stepRun = (text, name) => {
  const step = stepsOf(text).find((s) => s?.name === name);
  assert.ok(step, `_flow-sync.yml has no step named ${JSON.stringify(name)} — it was renamed; ` +
    `update this extractor and re-verify the behaviour below still holds`);
  assert.equal(typeof step.run, "string", `step ${JSON.stringify(name)} carries no run: script`);
  return step.run;
};

/** The `env:` map of the named step, as shipped. */
const stepEnv = (text, name) => {
  const step = stepsOf(text).find((s) => s?.name === name);
  assert.ok(step, `_flow-sync.yml has no step named ${JSON.stringify(name)}`);
  return step.env ?? {};
};

// ---------------------------------------------------------------------------------------------
// Fixture callers. A thin caller is a handful of lines; what matters to the scan is the one
// `uses:` line, so these are the smallest thing that is still a real caller.
// ---------------------------------------------------------------------------------------------

// The default slug is deliberately a FOREIGN one, not canonical's own. Two reasons, and both are
// about not lying to another check: the scan under test is owner/repo-agnostic by design, so a slug
// that is nobody's real repo proves more here than the real one does; and
// `adr-split-authoring.test.mjs` takes a census of the files naming canonical's bare slug to pin an
// ADR's repin-exposure figure — a fixture string inflating that count would make the number mean
// less than it does today.
const syncCaller = (ref, slug = "acme/infra") => [
  "name: flow-sync",
  "on:",
  "  schedule:",
  '    - cron: "27 6 * * 1"',
  "jobs:",
  "  flow-sync:",
  `    uses: ${slug}/.github/workflows/_flow-sync.yml@${ref}`,
  "    with:",
  "      canonical_ref: ${{ inputs.canonical_ref }}",
].join("\n");

const gatesCaller = (ref) => [
  "name: flow-gates",
  "on: { pull_request: {} }",
  "jobs:",
  "  flow-gates:",
  `    uses: acme/infra/.github/workflows/_flow-gates.yml@${ref}`,
].join("\n");

// ---------------------------------------------------------------------------------------------
// The behavioural harness: the shipped step, run for real against a fixture repo.
// ---------------------------------------------------------------------------------------------

/**
 * @param {import("node:test").TestContext} t
 * @param {{requestedRef?: string, callers?: Record<string, string>}} scenario
 */
const runResolve = (t, { requestedRef = "", callers = {} } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "flow-0105-repo-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  for (const [name, text] of Object.entries(callers)) {
    writeFileSync(join(dir, ".github/workflows", name), `${text}\n`);
  }
  const outFile = join(dir, "step-output");
  writeFileSync(outFile, "");

  const res = spawnSync("bash", ["-c", stepRun(readReusable(), RESOLVE_STEP)], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, REQUESTED_REF: requestedRef, GITHUB_OUTPUT: outFile },
  });
  return { ...res, outputs: readFileSync(outFile, "utf8") };
};

/** The `ref=` value the step wrote to $GITHUB_OUTPUT, or undefined if it wrote none. */
const resolvedRef = (res) => res.outputs.match(/^ref=(.*)$/m)?.[1];

// ---------------------------------------------------------------------------------------------
// Criterion: a non-empty canonical_ref input wins, whatever the callers pin.
// ---------------------------------------------------------------------------------------------

test("a non-empty canonical_ref input is used whatever the callers pin", { skip }, (t) => {
  const res = runResolve(t, {
    requestedRef: "v9.9.9",
    callers: { "flow-sync.yml": syncCaller("v2-edge") },
  });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resolvedRef(res), "v9.9.9",
    "an explicit input is an override — a human dispatching the workflow is overriding the pins on purpose");
  assert.match(res.stdout, /Caller pins are not consulted/,
    "the log must say the pins were skipped, so an override never looks like a resolution");
});

// ---------------------------------------------------------------------------------------------
// Criterion: an empty input resolves from the caller's pin, and names the file.
// ---------------------------------------------------------------------------------------------

test("an empty input resolves from the caller pinning _flow-sync.yml@v2-edge, naming the file", { skip }, (t) => {
  const res = runResolve(t, { callers: { "flow-sync.yml": syncCaller("v2-edge") } });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resolvedRef(res), "v2-edge",
    "THE DEFECT: this resolved to the literal 'v2' before flow-0105, on every scheduled run");
  assert.match(res.stdout, /canonical_ref resolved from \.github\/workflows\/flow-sync\.yml: v2-edge/,
    "the log must name the file the ref came from — a resolution a reader cannot check is a guess " +
    "with better manners");
  assert.doesNotMatch(res.stdout, /::warning/, "a successful resolution warns about nothing");
});

test("a caller pinning a different owner/repo resolves the same way", { skip }, (t) => {
  // flow-0030 repins the fleet at a release repo. A scan hard-coded to canonical's current slug
  // would stop resolving the moment that lands, while still reporting a confident 'v2'.
  const res = runResolve(t, {
    callers: { "flow-sync.yml": syncCaller("v2", "CandidDan/flow-protocol") },
  });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resolvedRef(res), "v2");
  assert.match(res.stdout, /canonical_ref resolved from \.github\/workflows\/flow-sync\.yml: v2/);
});

test("the pin is read from a .yaml caller too, not only .yml", { skip }, (t) => {
  const res = runResolve(t, { callers: { "flow-sync.yaml": syncCaller("v3") } });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resolvedRef(res), "v3");
});

// ---------------------------------------------------------------------------------------------
// Criterion: no caller calling _flow-sync.yml → the v2 fallback, with a warning.
// ---------------------------------------------------------------------------------------------

test("no file calling _flow-sync.yml falls back to v2 and emits a ::warning::", { skip }, (t) => {
  const res = runResolve(t, { callers: { "flow-gates.yml": gatesCaller("v2-edge") } });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resolvedRef(res), FALLBACK_REF,
    "today's behaviour is kept as the fallback; what changes is that it is now reported");
  assert.match(res.stdout, /::warning title=No pinned flow-sync caller found::/,
    "a fallback nobody is told about is how this defect stayed invisible for three releases");
  assert.match(res.stdout, new RegExp(`'${FALLBACK_REF}'`),
    "the warning must name the ref it fell back to, not merely that it fell back");
  assert.notEqual(resolvedRef(res), "v2-edge",
    "only a _flow-sync.yml caller may decide this — flow-gates' pin is a different question");
});

test("an empty .github/workflows/ falls back rather than failing", { skip }, (t) => {
  // The absent-`*.yaml`-glob case: grep exits 2 on a non-existent path, and a bare call under
  // `set -euo pipefail` would abort the whole sync instead of reaching the fallback.
  const res = runResolve(t, { callers: {} });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resolvedRef(res), FALLBACK_REF);
  assert.match(res.stdout, /::warning title=No pinned flow-sync caller found::/);
});

test("a commented-out caller is not read as a live pin", { skip }, (t) => {
  const res = runResolve(t, {
    callers: { "flow-sync.yml": `# uses: acme/infra/.github/workflows/_flow-sync.yml@v1-edge\n${syncCaller("v2-edge")}` },
  });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resolvedRef(res), "v2-edge",
    "a commented pin is documentation; counting it would make this a two-ref conflict and fail " +
    "the sync of a perfectly coherent repo");
});

// ---------------------------------------------------------------------------------------------
// Criterion: two callers pinning different refs → non-zero, with an ::error:: naming both.
// ---------------------------------------------------------------------------------------------

test("two files pinning different refs exit non-zero with an ::error:: naming both files and refs", { skip }, (t) => {
  const res = runResolve(t, {
    callers: {
      "flow-sync.yml": syncCaller("v2"),
      "flow-sync-canary.yml": syncCaller("v2-edge"),
    },
  });
  assert.notEqual(res.status, 0, "a half-finished repin has no safe reading — it must stop the job");
  const error = res.stdout.split("\n").find((l) => l.includes("::error title=Conflicting flow-sync caller pins::"));
  assert.ok(error, `no conflict annotation found in:\n${res.stdout}`);
  // ONE annotation, not one per file: GitHub renders an annotation as a single line, so a list
  // echoed across several lines would leave the summary naming none of them.
  for (const fragment of [
    ".github/workflows/flow-sync-canary.yml",
    ".github/workflows/flow-sync.yml",
    "v2-edge",
  ]) {
    assert.ok(error.includes(fragment),
      `the conflict annotation must name ${fragment}; got: ${error}`);
  }
  assert.match(error, /pins v2[^-]/, "…and the other ref, so neither side has to be looked up");
  assert.equal(resolvedRef(res), undefined, "a failed resolution must publish no ref at all");
});

test("two callers agreeing on one ref is not a conflict", { skip }, (t) => {
  // The ordinary state of a repo that has more than one flow-sync caller. Distinctness is the
  // question, not the number of files.
  const res = runResolve(t, {
    callers: {
      "flow-sync.yml": syncCaller("v2-edge"),
      "flow-sync-extra.yml": syncCaller("v2-edge"),
    },
  });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resolvedRef(res), "v2-edge");
  assert.match(res.stdout, /canonical_ref resolved from \.github\/workflows\/flow-sync-extra\.yml: v2-edge/);
  assert.match(res.stdout, /canonical_ref resolved from \.github\/workflows\/flow-sync\.yml: v2-edge/);
});

// ---------------------------------------------------------------------------------------------
// Criterion: the existing leading-dash refusal fires on the RESOLVED value.
//
// The guard lives in the clone step and reads `$CANONICAL_REF`; what flow-0105 changes is where
// that value comes from. Both halves are proved: the wiring (the clone step reads this step's
// output) and the refusal itself, run for real.
// ---------------------------------------------------------------------------------------------

test("the clone step's CANONICAL_REF is the resolve step's output, so the refusal covers it", { skip }, () => {
  const text = readReusable();
  const env = stepEnv(text, CLONE_STEP);
  const resolveStep = stepsOf(text).find((s) => s?.name === RESOLVE_STEP);
  assert.ok(resolveStep?.id, `the ${JSON.stringify(RESOLVE_STEP)} step needs an id: for its output to be readable`);
  assert.equal(env.CANONICAL_REF, `\${{ steps.${resolveStep.id}.outputs.ref }}`,
    "the clone step must read the RESOLVED ref. Reading the input again would leave the scheduled " +
    "run on the old literal while the resolution logged a different answer beside it — worse than " +
    "the bug, because the log would then be wrong too.");
});

test("a resolved ref starting with '-' is refused before any git command runs", { skip }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), "flow-0105-dash-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // A `git` that shouts if it is reached at all, so "the guard fired" is proved rather than assumed.
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "git"), '#!/usr/bin/env bash\necho "GIT-WAS-CALLED $*"\nexit 1\n');
  chmodSync(join(bin, "git"), 0o755);

  const res = spawnSync("bash", ["-c", stepRun(readReusable(), CLONE_STEP)], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      GITHUB_ENV: join(dir, "github-env"),
      GITHUB_WORKSPACE: dir,
      CANONICAL_REF: "--upload-pack=touch /tmp/pwned",
    },
  });
  assert.notEqual(res.status, 0, "the refusal must stop the job");
  assert.match(res.stdout, /::error title=Invalid canonical_ref::/,
    "flow-0064's guard still fires — it now guards a value read off a caller pin as well as an input");
  assert.doesNotMatch(`${res.stdout}${res.stderr}`, /GIT-WAS-CALLED/,
    "the refusal is up front, not per-command: no git may run with a dash-leading ref");
});

// ---------------------------------------------------------------------------------------------
// Criterion: no `inputs.canonical_ref || 'v2'` expression remains.
//
// Written over content, and proved by mutation: the check is handed the pre-flow-0105 line and must
// report it. `canonical_ref` is still read ONCE, as the override, which is why the check is about
// the `||` fallback specifically rather than about the input's name.
// ---------------------------------------------------------------------------------------------

export function checkNoHardCodedFallback(text) {
  const problems = [];
  for (const [i, line] of text.split("\n").entries()) {
    const m = line.match(/\$\{\{\s*inputs\.canonical_ref\s*\|\|\s*'([^']*)'\s*\}\}/);
    if (m) {
      problems.push(
        `line ${i + 1}: \`inputs.canonical_ref || '${m[1]}'\` is back. That expression IS the ` +
        `flow-0105 defect: the thin caller forwards an empty canonical_ref and the weekly schedule ` +
        `cannot fill it in, so the literal '${m[1]}' is the ref every unattended sync adopts from — ` +
        `whatever the repo's own callers pin. Resolve it from the caller's pin instead.`,
      );
    }
  }
  return problems;
}

test("no `inputs.canonical_ref || 'v2'` expression remains in _flow-sync.yml", { skip }, () => {
  const problems = checkNoHardCodedFallback(readReusable());
  assert.deepEqual(problems, [], `_flow-sync.yml: ${problems.join(" | ")}`);
});

test("restoring the pre-flow-0105 expression fails the check, naming the line and the literal", { skip }, () => {
  const text = readReusable();
  const mutated = text.replace(
    /^(\s*)CANONICAL_REF: \$\{\{ steps\.[a-z-]+\.outputs\.ref \}\}$/m,
    "$1CANONICAL_REF: ${{ inputs.canonical_ref || 'v2' }}",
  );
  assert.notEqual(mutated, text, "the mutation must actually restore the old expression");

  const problems = checkNoHardCodedFallback(mutated);
  assert.equal(problems.length, 1, `exactly the restored line: ${problems.join(" | ")}`);
  assert.match(problems[0], /^line \d+: `inputs\.canonical_ref \|\| 'v2'` is back\./,
    "the failure must name the line, so the fix is obvious from the log");
  assert.match(problems[0], /the weekly schedule\s*\n?\s*cannot fill it in|cannot fill it in/,
    "…and WHY an unused-looking default matters, or the next person deletes the check not the bug");
});

test("the resolve step runs before the clone step — the ref must exist by the time it is used", { skip }, () => {
  const names = stepsOf(readReusable()).map((s) => s?.name);
  const at = (name) => {
    const i = names.indexOf(name);
    assert.notEqual(i, -1, `no step named ${JSON.stringify(name)}`);
    return i;
  };
  assert.ok(at("Checkout this repo") < at(RESOLVE_STEP),
    "the pin is read off disk, so this repo must be checked out first");
  assert.ok(at(RESOLVE_STEP) < at(CLONE_STEP),
    "and the ref must be resolved before the clone that consumes it");
});

// ---------------------------------------------------------------------------------------------
// Criterion: the template caller no longer tells the human to bump canonical_ref by hand.
// ---------------------------------------------------------------------------------------------

test("the template caller no longer says to bump canonical_ref by hand", { skip }, () => {
  const text = readFileSync(TEMPLATE_CALLER, "utf8");
  const offenders = text.split("\n").filter((l) => /bump\b/i.test(l) && /canonical_ref/.test(l));
  assert.deepEqual(offenders, [],
    "that instruction was only ever reachable by a workflow_dispatch human; a scheduled run has no " +
    "input to receive it, which is the defect. Leaving the sentence in place would keep sending " +
    "people to do by hand the thing the reusable now does for them.");
  assert.match(text, /uses:.*_flow-sync\.yml@/, "the caller still pins a ref — that pin IS the answer now");
  assert.match(text, /reads the ref off the `@<ref>` on THIS/,
    "and the comment must say so, so the pin is understood as load-bearing rather than cosmetic");
});

// ---------------------------------------------------------------------------------------------
// Criterion: the changelog fragment exists and says no caller action is needed.
// ---------------------------------------------------------------------------------------------

test("flow-0105's changelog entry exists and says no caller action is needed", { skip: skip || undefined }, () => {
  // Read through changelog-entry.mjs: the fragment is folded into CHANGELOG.md at release (flow-0126).
  const text = changelogEntry(REPO, "flow-0105");
  assert.ok(text, "flow-0105 has no changelog entry (changes/flow-0105.md or CHANGELOG.md) — the entry IS the release note");
  assert.match(text, /\*\*No caller action\.\*\*/,
    "the fix is transparent to every repo that pins @v2; say so in the words the other fragments use");
  assert.match(text, /flow-0105/, "a fragment names its task, so a release note traces back to the work");
  assert.match(text, /drop it/,
    "and it must mention that a caller carrying a customised canonical_ref default can drop it — " +
    "that is the only thing a reader of this release might want to change");
});
