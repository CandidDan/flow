// config.test.mjs — proving tests for canonical's `.flow/config.yml` calibration.
//
// config.yml is the file INIT.md warns hardest about: "a guessed test command produces a green
// gate that proves nothing — the single worst failure mode in this system." Nothing enforced
// that warning, because config.yml is read by CI (via yq) and by humans, and neither notices a
// command that names a script which does not exist, or a coverage floor that drifted away from
// the threshold actually enforced.
//
// These tests close that gap for canonical itself.
//
// Criteria proved here (flow-0004):
//   · "npm ci succeeds against a committed lockfile with c8 as the only dependency"
//   · "the coverage command prints a percentage and exits non-zero if below coverage_min, and
//      the committed coverage_min equals the measured value minus the stated margin"

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const FLOW = resolve(BIN, "..");
const REPO = resolve(FLOW, "..");

// DEPENDENCY NOTE — see check-workflows.test.mjs for the full reasoning. `_flow-gates.yml`'s
// `flow-tooling` job runs `node --test .flow/bin/*.test.mjs` with no install step; these tests
// need `yaml` (to parse config.yml the way CI does) and `c8` (to prove the floor is enforced).
// They skip visibly there and run for real in the per-stack job, after `npm ci`.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml, c8) — runs in the per-stack gate job";

const config = yamlMod ? yamlMod.parse(readFileSync(join(FLOW, "config.yml"), "utf8")) : {};
const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));

test("config.yml itself parses — the file CI reads with yq must be valid YAML", { skip }, () => {
  assert.ok(config.project?.name, "project.name must be set");
  assert.ok(config.commands, "commands block must be present");
  assert.equal(config.project.name, "flow");
});

test("no REPLACE-ME survives — a placeholder here is a gate that proves nothing", { skip }, () => {
  assert.doesNotMatch(readFileSync(join(FLOW, "config.yml"), "utf8"), /REPLACE-ME/);
});

test("every command in config.yml names a script that actually exists", { skip }, () => {
  for (const key of ["install", "build", "lint", "test", "coverage"]) {
    const cmd = config.commands[key];
    assert.ok(cmd, `commands.${key} must be set`);
    const m = cmd.match(/^npm (?:run )?(\S+)$/);
    assert.ok(m, `commands.${key} = "${cmd}" must be an npm invocation`);
    if (m[1] === "ci") continue;                       // npm ci is built in, not a script
    assert.ok(pkg.scripts[m[1]],
      `commands.${key} runs "${cmd}" but package.json has no "${m[1]}" script — ` +
      `the gate would fail at startup, or worse, pass having run nothing`);
  }
});

test("coverage_min matches the threshold c8 actually enforces", { skip }, () => {
  // The gate runs the coverage COMMAND, so c8's own threshold is what fails a PR. If it drifts
  // below config.yml's declared floor, the repo advertises a floor it does not hold.
  assert.equal(pkg.c8.lines, config.coverage_min,
    "package.json c8.lines and .flow/config.yml coverage_min must agree");
  assert.equal(pkg.c8["check-coverage"], true,
    "without check-coverage, c8 prints a percentage and exits 0 no matter how low it is");
});

test("the coverage floor sits below the measured value, with the margin the config states", { skip }, () => {
  const text = readFileSync(join(FLOW, "config.yml"), "utf8");
  const measured = Number(text.match(/reported ([\d.]+)% line coverage/)[1]);
  const margin = Number(text.match(/Margin: ([\d.]+) points/)[1]);

  assert.ok(measured > 0, "the config must record what was actually measured");
  assert.equal(
    Number((measured - margin).toFixed(2)), config.coverage_min,
    "coverage_min must equal the measured value minus the stated margin — not a round number picked by hand",
  );
  assert.ok(config.coverage_min < measured, "a floor at or above the measured value fails the gate on day one");
});

test("c8 exits non-zero when line coverage is below the floor", { skip }, () => {
  // Proves the enforcement half of the criterion without re-running the whole suite: a file
  // with a deliberately unexercised branch, checked against an unreachable floor.
  const dir = mkdtempSync(join(tmpdir(), "flow-cov-"));
  try {
    const src = join(dir, "half.mjs");
    writeFileSync(src, "export function f(x) {\n  if (x) { return 1; }\n  return 2;\n}\n");
    const entry = join(dir, "run.mjs");
    writeFileSync(entry, `import { f } from "./half.mjs";\nf(1);\n`);

    // `--include` is matched relative to cwd; an absolute path matches nothing, c8 finds no
    // files to check, and the threshold passes vacuously — which is why this test asserts on
    // the printed percentage as well as the exit code.
    const c8 = join(REPO, "node_modules", ".bin", "c8");
    const r = spawnSync(c8, [
      "--check-coverage", "--lines", "100",
      "--include", "half.mjs", "--reporter", "text-summary",
      "--temp-directory", join(dir, "tmp"), "--report-dir", join(dir, "report"),
      process.execPath, entry,
    ], { cwd: dir, encoding: "utf8" });
    const out = r.stdout + r.stderr;

    assert.match(out, /Lines\s+:\s+[\d.]+%/, "the coverage command must print a percentage");
    assert.doesNotMatch(out, /Lines\s+:\s+100% \( 0\/0 \)/,
      "0/0 means the include matched nothing and the threshold passed vacuously");
    assert.notEqual(r.status, 0, "c8 must fail the gate when coverage is below the threshold");
    assert.match(out, /does not meet global threshold/, "the failure must name the threshold it missed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the lockfile is committed and npm ci has something to install against", { skip }, () => {
  const lock = join(REPO, "package-lock.json");
  assert.ok(existsSync(lock), "npm ci fails outright without a committed lockfile");
  const parsed = JSON.parse(readFileSync(lock, "utf8"));
  assert.equal(parsed.lockfileVersion >= 3, true, "npm >= 7 lockfile expected");
  assert.ok(parsed.packages?.[""], "the lockfile must describe the root package");
});

test("the dependency footprint stays at c8 plus the one justified addition", { skip }, () => {
  // Canonical ships as source that other repos copy, so every dependency added here is a
  // dependency imposed downstream. c8 buys the coverage floor; yaml buys a real workflow parse
  // (Node has none, and a hand-rolled scan would only look like a parser). A third needs the
  // same justification in its PR.
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ["c8", "yaml"]);
  assert.equal(pkg.dependencies, undefined, "nothing here is a runtime dependency");
  assert.equal(pkg.private, true, "canonical is not a published package");
});

test("every declared source_root exists on disk and names a check", { skip }, () => {
  assert.ok(config.source_roots?.length, "source_roots must be declared");
  for (const root of config.source_roots) {
    assert.ok(root.path, "a source_root with no path fails flow-doctor");
    assert.ok(root.check, `source_root "${root.path}" must name the command that parses it`);
    assert.ok(existsSync(join(REPO, root.path)),
      `source_root "${root.path}" does not exist — a stale declaration fails the gate`);
  }
});

test("the trees holding canonical's actual code are all declared", { skip }, () => {
  const declared = config.source_roots.map((r) => r.path.replace(/\/+$/, ""));
  for (const required of [".flow/bin", "project-template/.flow/bin", ".github/workflows"]) {
    assert.ok(declared.includes(required), `${required}/ holds source and must be declared`);
  }
});
