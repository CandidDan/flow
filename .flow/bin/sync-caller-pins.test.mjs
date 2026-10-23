// sync-caller-pins.test.mjs — proving tests for flow-0158, criteria 4 and 5.
//
// WHAT THIS FILE IS ABOUT. `_flow-sync.yml` copies canonical's thin callers into the adopting repo,
// and the template pins them `@v3`. Until flow-0158 the copy was verbatim, so a repo synced at any
// other ref ran that ref's `.flow/bin/` against `@v3`'s reusables. On the 3.4.0 rollout the canary
// was synced at `v3.4.0`: it got 3.4.0's callers, which pass `runner` (flow-0149), calling the 3.3.2
// reusables `v3` still pointed at, which do not declare it. Every Flow workflow failed at startup,
// no Flow check reported, and the PR merged on the host's checks alone.
//
// The fix is one line in the copy loop: after `cp`, `flow-sync.mjs pin-callers` moves each copied
// caller's reusable pin to `$CANONICAL_REF`. The rule itself (`pinCallers`) is the template's and is
// unit-tested in project-template/.flow/bin/flow-sync.test.mjs. What is proved HERE is the loop: it
// is the REAL shipped shell, lifted from the workflow and executed, the way
// sync-customised-caller.test.mjs does it, so a loop that stopped calling `pin-callers`, called it
// on the wrong file, or called it on a kept caller fails below.
//
// Canonical's own test, not the template's: `_flow-sync.yml` exists only here.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { pinCallers } from "../../project-template/.flow/bin/flow-sync.mjs";

// Same dependency posture as sync-customised-caller.test.mjs: the flow-tooling job runs these with
// no install step, so without `yaml` they skip visibly; the per-stack gate job runs them for real.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const REUSABLE = join(REPO, ".github/workflows/_flow-sync.yml");
const CANON_TPL_REAL = join(REPO, "project-template");
const CANON_BIN = join(CANON_TPL_REAL, ".flow/bin");

const readReusable = () => readFileSync(REUSABLE, "utf8");

const runScripts = (wf) =>
  Object.values(wf?.jobs ?? {})
    .flatMap((job) => job?.steps ?? [])
    .map((step) => step?.run)
    .filter((run) => typeof run === "string")
    .join("\n");

// The same region sync-customised-caller.test.mjs extracts: the accumulator, the loop, and the read
// that hands the kept list to `pr-body`. If this stops matching, the step was reshaped — update the
// extractor, never relax the behaviour asserted below.
const COPY_LOOP_REGION =
  /^\s*KEPT_FILE="\$\(mktemp\)"$[\s\S]*?^\s*KEPT="\$\(cat "\$KEPT_FILE"\)"$/m;

const extractLoopRegion = () => {
  const match = runScripts(yamlMod.parse(readReusable())).match(COPY_LOOP_REGION);
  assert.ok(match, "could not find the caller-copy loop in _flow-sync.yml's run scripts");
  return match[0];
};

// Fixture owner `OWNER/flow`, as in sync-customised-caller.test.mjs: adr-split-authoring.test.mjs
// pins how many files spell out canonical's real owner/repo, and the pin rule is owner-agnostic.
const caller = (name, extra = "") => `name: flow-${name}
on:
  workflow_dispatch:

jobs:
  ${name}:
    uses: OWNER/flow/.github/workflows/_flow-${name}.yml@v3   # moves with the release
    with:
      runner: \${{ vars.FLOW_RUNNER }}
${extra}`;

const TPL = {
  "flow-gates.yml": caller("gates"),
  "flow-doctor.yml": caller("doctor"),
  "flow-sync.yml": caller("sync"),
};

// A customised caller: canonical's job plus one of the repo's own, still pinned `@v3`. The
// flow-0076 guard keeps it whole, and flow-0158 must not rewrite it either.
const CUSTOM_GATES = caller("gates", `
  edge-parse:
    runs-on: ubuntu-latest
    steps:
      - run: deno check supabase/functions/**/*.ts
`);

const fixture = (t, { template = TPL, local = {}, canonTplDir } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "flow-0158-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const canonTpl = join(root, "canon");
  const repo = join(root, "repo");
  mkdirSync(join(repo, ".github/workflows"), { recursive: true });
  if (canonTplDir) {
    cpSync(join(canonTplDir, ".github/workflows"), join(canonTpl, ".github/workflows"), { recursive: true });
  } else {
    mkdirSync(join(canonTpl, ".github/workflows"), { recursive: true });
    for (const [name, body] of Object.entries(template)) writeFileSync(join(canonTpl, ".github/workflows", name), body);
  }
  // The REAL helper, at the path the loop invokes it from in CI.
  cpSync(CANON_BIN, join(canonTpl, ".flow/bin"), { recursive: true });
  for (const [name, body] of Object.entries(local)) writeFileSync(join(repo, ".github/workflows", name), body);
  return { canonTpl, repo };
};

/** Run the shipped loop in `repo` with `CANONICAL_REF` set (or removed, when `ref` is undefined). */
const runLoop = ({ repo, canonTpl }, ref) => {
  const env = { ...process.env, CANON_TPL: canonTpl };
  delete env.CANONICAL_REF;
  if (ref !== undefined) env.CANONICAL_REF = ref;
  return execFileSync("bash", ["-euo", "pipefail", "-c", extractLoopRegion()],
    { cwd: repo, encoding: "utf8", env });
};

const read = (dir, name) => readFileSync(join(dir, ".github/workflows", name), "utf8");

const reusablePins = (text) =>
  [...text.matchAll(/^[ \t]*uses:[ \t]*\S+\/\.github\/workflows\/_flow-[^@\s]+@(\S+)/gm)].map((m) => m[1]);

test("flow-0158: at CANONICAL_REF=v3.4.0 every copied caller is pinned @v3.4.0 and a kept customised caller is byte-identical", { skip }, (t) => {
  // gates is customised (kept), doctor exists and is thin (overwritten), sync is new (added).
  const fx = fixture(t, { local: { "flow-gates.yml": CUSTOM_GATES, "flow-doctor.yml": caller("doctor") } });

  const out = runLoop(fx, "v3.4.0");

  for (const name of ["flow-doctor.yml", "flow-sync.yml"]) {
    const copied = read(fx.repo, name);
    assert.deepEqual(reusablePins(copied), ["v3.4.0"],
      `${name}: a copied caller must call the release its .flow/bin/ came from, not whatever v3 points at`);
    assert.equal(copied, TPL[name].replace("@v3 ", "@v3.4.0 "),
      `${name}: only the ref moves — the trailing comment, inputs and every other byte are canonical's`);
  }

  assert.equal(read(fx.repo, "flow-gates.yml"), CUSTOM_GATES,
    "a caller kept by the flow-0076 guard is left exactly as it was — pin included");
  assert.match(out, /::warning title=Customised caller kept::/, "and its warning is unchanged");
});

test("flow-0158: at CANONICAL_REF=v3 every copied caller is byte-identical to the template's", { skip }, (t) => {
  const fx = fixture(t, { local: { "flow-doctor.yml": caller("doctor").replace("@v3 ", "@v2 ") } });

  runLoop(fx, "v3");

  for (const name of Object.keys(TPL)) {
    assert.equal(read(fx.repo, name), TPL[name], `${name}: a sync at the template's own ref changes nothing`);
  }
});

test("flow-0158: the shipped template's callers, synced at v3.4.0, all call @v3.4.0 with nothing else changed", { skip }, (t) => {
  // The real surface, not a fixture: every caller canonical ships today. If a new caller's `uses:`
  // took a shape pinCallers does not match, the canary would run it against the old reusables again.
  const fx = fixture(t, { canonTplDir: CANON_TPL_REAL });

  runLoop(fx, "v3.4.0");

  const names = readdirSync(join(CANON_TPL_REAL, ".github/workflows")).filter((n) => /^flow-.*\.yml$/.test(n));
  assert.ok(names.length > 0, "the template ships callers");
  for (const name of names) {
    const tpl = read(CANON_TPL_REAL, name);
    const copied = read(fx.repo, name);
    assert.ok(reusablePins(tpl).length > 0, `${name}: the template caller calls a Flow reusable`);
    assert.deepEqual([...new Set(reusablePins(copied))], ["v3.4.0"], `${name}: every reusable pin moved`);
    assert.equal(copied, pinCallers(tpl, "v3.4.0"), `${name}: and nothing but the pins moved`);
  }
});

test("flow-0158: with CANONICAL_REF unset the loop still copies byte for byte (it runs isolated in other tests)", { skip }, (t) => {
  // sync-customised-caller.test.mjs and sync-permissions.test.mjs execute this loop with only
  // $CANON_TPL supplied. The guard keeps it runnable there under `set -u`; in CI the clone step has
  // already exported a non-empty ref, so this branch is never the production path.
  const fx = fixture(t);
  runLoop(fx, undefined);
  for (const name of Object.keys(TPL)) assert.equal(read(fx.repo, name), TPL[name]);
});

test("flow-0158: the loop pins the copied file from $CANONICAL_REF in the environment, never a ${{ }} interpolation", { skip }, () => {
  const region = extractLoopRegion();
  const lines = region.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const cp = lines.indexOf('cp "$f" .github/workflows/');
  const pin = lines.findIndex((l) => /\bpin-callers\b/.test(l));
  assert.ok(cp >= 0 && pin > cp, "pin-callers runs after the copy, on the copied file");
  assert.match(lines[pin], /node "\$CANON_TPL\/\.flow\/bin\/flow-sync\.mjs" pin-callers --file "\$DEST" --ref "\$CANONICAL_REF"/,
    "canonical's own helper, on $DEST, with the resolved ref — self-contained on $CANON_TPL like the extra-jobs call");
  assert.ok(lines.indexOf("continue") >= 0 && lines.indexOf("continue") < cp, "a kept caller `continue`s before the copy, so it is never pinned");
  assert.doesNotMatch(region, /\$\{\{/, "a ref is never interpolated into the shell source");
  // CANONICAL_REF reaches this step through $GITHUB_ENV, exported by the clone step from the
  // `Resolve canonical ref` output — one definition of the adopted ref, not a second resolution.
  assert.match(readReusable(), /echo "CANONICAL_REF=\$\{CANONICAL_REF\}" >> "\$GITHUB_ENV"/);
  assert.match(readReusable(), /CANONICAL_REF: \$\{\{ steps\.canonical-ref\.outputs\.ref \}\}/);
});
