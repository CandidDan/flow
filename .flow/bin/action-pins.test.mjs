// action-pins.test.mjs — the check that every third-party action canonical's workflows run is
// pinned to a commit SHA, plus the proving tests for flow-0031.
//
// WHY THIS EXISTS. A `uses: owner/repo@v4` line is a pointer, and whoever controls `owner/repo`
// can move it. The next run then executes different code with no PR, no diff and nothing in the
// log. In canonical that pointer sits inside reusables every adopting repo calls, in steps that
// hold `contents: write`, CLAUDE_CODE_OAUTH_TOKEN and FLOW_PAT — so a moved tag lands in the
// whole fleet at once, inside the trust boundary. `docs/flow-versioning-policy.md` already
// applies immutable-ref discipline to what canonical *publishes*; this applies it to what
// canonical *consumes*. The pins are the fix; this check is the half that keeps them fixed.
//
// WHY THE CHECK LIVES IN A .test.mjs AND NOT A HELPER + TEST PAIR. Same reason as
// `workflow-prompt-paths.test.mjs`: flow-0031's `touches` declares exactly one path under
// `.flow/bin/` — this file — and the protocol's rule on an undeclared path is "block, don't
// drift". The logic is exported so a later task can lift it into a helper without rewriting it.
// It costs nothing in coverage: `package.json` excludes `**/*.test.mjs` from c8's include set.
//
// TWO KINDS OF REF, told apart on purpose. A third-party action (`owner/repo[/path]@ref`) must
// be a 40-hex commit SHA with a trailing `# vX.Y.Z` comment so a reviewer can read the version
// without resolving it. A reference to canonical's OWN reusables
// (`CandidDan/flow/.github/workflows/_flow-*.yml@main`, or `@v1` in the template) is governed
// by the versioning policy, which chose a moving alias plus a canary deliberately — forcing
// those to a SHA would pin a repo to itself and defeat that decision. The allow-list is ONE
// named constant (`FIRST_PARTY_PREFIXES`) because the release-repo split (flow-0028/29/30) may
// change the owner, and this is one of the places that has to move with it. `uses: ./local`
// path refs are neither third-party nor tagged and are ignored.
//
// FILES ARE READ FROM THE DIRECTORY, never from a hardcoded list, so a workflow added tomorrow
// is covered without anyone remembering. The scan is line-based rather than YAML-based so it
// runs in `_flow-gates.yml`'s `flow-tooling` job (no `npm ci`, so no `yaml` module) and so a
// violation can name its LINE — a parsed document has no line numbers.
//
// AN EMPTY SCAN IS A FAILURE, NOT A PASS — the same rule `check-workflows.mjs` states for
// `build`. No workflow files, or no `uses:` ref extracted from any of them, means the check
// verified nothing; reporting success there is the silent no-op the guards exist to prevent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
export const DEFAULT_WORKFLOW_DIR = ".github/workflows";

// ─────────────────────────────────────────────────────────────────────────────────────────
// The check
// ─────────────────────────────────────────────────────────────────────────────────────────

// Canonical's own reusables. A `uses:` whose action path starts with one of these is
// first-party and is governed by docs/flow-versioning-policy.md, not by this check. When the
// release repo (ADR-0005, `CandidDan/flow-protocol`) starts serving the fleet, its prefix is
// added HERE and nowhere else.
export const FIRST_PARTY_PREFIXES = Object.freeze(["CandidDan/flow/"]);

export const SHA_RE = /^[0-9a-f]{40}$/;

// A `uses:` step line. Optional list dash, optional quotes around the ref, then an optional
// trailing `# comment`. Anchored at line start (after indentation) so a `uses:` mentioned in a
// `#` comment or mid-sentence in a prompt does not match.
const USES_LINE_RE = /^\s*(?:-\s+)?uses:\s*["']?([^\s"'#]+)["']?\s*(?:#\s*(.*?))?\s*$/;
const ACTION_REF_RE = /^([^@]+)@(.+)$/;
// What the trailing comment must carry: something a human reads as a version — `v4.4.0`,
// `v1.0.219`, `4.2`. It is a label for the reviewer, not a second source of truth.
const VERSION_COMMENT_RE = /\bv?\d+(?:\.\d+)*\b/;

export function classifyUses(target) {
  if (target.startsWith("./")) return { kind: "local" };
  if (target.startsWith("docker://")) return { kind: "docker" };
  const m = ACTION_REF_RE.exec(target);
  if (!m) return { kind: "unparseable" };
  const [, action, ref] = m;
  const firstParty = FIRST_PARTY_PREFIXES.some((p) => action.startsWith(p));
  return { kind: firstParty ? "first-party" : "third-party", action, ref };
}

// Every `uses:` ref in every YAML file of `dir`, with its file, 1-based line and trailing comment.
export function extractUses(dir) {
  if (!existsSync(dir)) return { files: [], refs: [] };
  const files = readdirSync(dir).filter((n) => /\.ya?ml$/.test(n)).sort();
  const refs = [];
  for (const name of files) {
    const file = join(dir, name);
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((text, i) => {
      const m = USES_LINE_RE.exec(text);
      if (!m) return;
      const [, target, comment = ""] = m;
      refs.push({ file, name, line: i + 1, target, comment: comment.trim(), ...classifyUses(target) });
    });
  }
  return { files, refs };
}

// The verdict. `ok` is true only when at least one file and one ref were examined AND there is
// no violation. `violations` name file, line, ref and reason; `failures` are the empty-scan cases.
export function checkActionPins(dir) {
  const { files, refs } = extractUses(dir);
  const failures = [];
  if (files.length === 0) failures.push(`no workflow files found in ${dir} — an empty scan verifies nothing`);
  else if (refs.length === 0) failures.push(`no \`uses:\` refs found in ${files.length} workflow file(s) — an empty scan verifies nothing`);

  const violations = [];
  for (const r of refs) {
    const where = `${r.name}:${r.line}`;
    if (r.kind === "third-party") {
      if (!SHA_RE.test(r.ref)) {
        violations.push({ ...r, reason: "third-party ref is not a 40-hex commit SHA",
          message: `${where}: uses: ${r.action}@${r.ref} — third-party ref is not a 40-hex commit SHA (a tag or branch can be moved)` });
      } else if (!VERSION_COMMENT_RE.test(r.comment)) {
        violations.push({ ...r, reason: "pinned ref has no trailing version comment",
          message: `${where}: uses: ${r.action}@${r.ref} — pinned, but no trailing \`# vX.Y.Z\` comment naming the version` });
      }
    } else if (r.kind === "docker" || r.kind === "unparseable") {
      violations.push({ ...r, reason: `unsupported \`uses:\` shape (${r.kind})`,
        message: `${where}: uses: ${r.target} — unsupported \`uses:\` shape (${r.kind}); decide how to pin it before adding it` });
    }
    // "local" and "first-party" pass unconditionally.
  }
  return { files, refs, violations, failures, ok: failures.length === 0 && violations.length === 0 };
}

export function report(result) {
  return [...result.failures, ...result.violations.map((v) => v.message)].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────────────────

const WORKFLOWS = join(REPO, DEFAULT_WORKFLOW_DIR);
const tmp = (name) => mkdtempSync(join(tmpdir(), `flow-pins-${name}-`));
const withDir = (name, fn) => {
  const dir = tmp(name);
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const SHA_A = "0123456789abcdef0123456789abcdef01234567";
const stepsWorkflow = (uses) => `name: fixture\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n${uses.map((u) => `      - uses: ${u}\n`).join("")}`;

// The thirteen files flow-0031 names. The CHECK reads the directory; this list exists so the
// task's own promise — every one of these, pinned — is asserted by name rather than implied.
const FLOW_0031_FILES = [
  "_flow-compass.yml", "_flow-done.yml", "_flow-gates.yml", "_flow-open-pr.yml",
  "_flow-queue-runner.yml", "_flow-recover.yml", "_flow-review.yml", "_flow-status.yml",
  "_flow-sync.yml", "_flow-triage.yml", "ci.yml", "flow-watchdog.yml", "release-tag.yml",
];
const THIRD_PARTY_ACTIONS = ["actions/checkout", "actions/setup-node", "anthropics/claude-code-action"];

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: every third-party ref in .github/workflows/ is a 40-hex commit SHA
// ─────────────────────────────────────────────────────────────────────────────────────────

test("the repo as-is: every third-party `uses:` ref in .github/workflows/ is a 40-hex commit SHA", () => {
  const result = checkActionPins(WORKFLOWS);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.violations.map((v) => v.message), [], report(result));
  assert.ok(result.ok);

  const onDisk = readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n));
  assert.equal(result.files.length, onDisk.length, "every YAML file in the directory must be scanned, not a subset");

  const third = result.refs.filter((r) => r.kind === "third-party");
  assert.ok(third.length > 0, "the fixture is meaningless if canonical uses no third-party action");
  for (const r of third) assert.match(r.ref, SHA_RE, `${r.name}:${r.line} ${r.target}`);
});

test("the repo as-is: all thirteen files flow-0031 names are present, and each of the three actions is pinned wherever it appears", () => {
  const { refs } = extractUses(WORKFLOWS);
  for (const name of FLOW_0031_FILES) {
    assert.ok(existsSync(join(WORKFLOWS, name)), `${name} must exist — the task pins it by name`);
    const inFile = refs.filter((r) => r.name === name && r.kind === "third-party");
    assert.ok(inFile.length > 0, `${name} must reference at least one third-party action to have been in scope`);
    for (const r of inFile) assert.match(r.ref, SHA_RE, `${name}:${r.line} ${r.target} is not pinned`);
  }
  for (const action of THIRD_PARTY_ACTIONS) {
    const uses = refs.filter((r) => r.action === action);
    assert.ok(uses.length > 0, `${action} must still be in use — this task pins, it does not remove`);
    assert.equal(new Set(uses.map((r) => r.ref)).size, 1,
      `${action} must resolve to ONE commit everywhere — a split pin is a version bump in disguise`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: each pinned ref carries a trailing comment naming the human-readable version
// ─────────────────────────────────────────────────────────────────────────────────────────

test("the repo as-is: every pinned third-party ref carries a trailing comment naming its version", () => {
  const { refs } = extractUses(WORKFLOWS);
  const third = refs.filter((r) => r.kind === "third-party");
  assert.ok(third.length > 0);
  for (const r of third) {
    assert.match(r.comment, VERSION_COMMENT_RE,
      `${r.name}:${r.line} uses: ${r.target} has no \`# vX.Y.Z\` comment — a reviewer cannot tell what the SHA is`);
  }
});

test("a pinned ref with no version comment is a violation that names file, line and ref", () => {
  withDir("nocomment", (dir) => {
    writeFileSync(join(dir, "a.yml"), stepsWorkflow([`actions/checkout@${SHA_A}`]));
    const result = checkActionPins(dir);
    assert.equal(result.ok, false);
    assert.equal(result.violations.length, 1);
    const [v] = result.violations;
    assert.equal(v.name, "a.yml");
    assert.equal(v.line, 7);
    assert.equal(v.ref, SHA_A);
    assert.match(v.reason, /no trailing version comment/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: a third-party ref changed back to a tag fails, naming file, ref and line
// ─────────────────────────────────────────────────────────────────────────────────────────

test("a third-party ref edited back to a tag in a copy of the real tree fails and names the file, ref and line", () => {
  withDir("regress", (dir) => {
    // Copy the real directory, then unpin ONE ref in one file — the edit a well-meaning
    // "bump to v5" PR would make — and check the violation points at exactly that line.
    for (const name of readdirSync(WORKFLOWS)) writeFileSync(join(dir, name), readFileSync(join(WORKFLOWS, name)));
    const target = join(dir, "_flow-gates.yml");
    const lines = readFileSync(target, "utf8").split("\n");
    const idx = lines.findIndex((l) => /uses: actions\/checkout@[0-9a-f]{40}/.test(l));
    assert.ok(idx >= 0, "fixture needs a pinned checkout in _flow-gates.yml");
    lines[idx] = lines[idx].replace(/@[0-9a-f]{40}\s*#.*$/, "@v4");
    writeFileSync(target, lines.join("\n"));

    const result = checkActionPins(dir);
    assert.equal(result.ok, false, "an unpinned ref must fail the check");
    assert.equal(result.violations.length, 1, report(result));
    const [v] = result.violations;
    assert.equal(v.name, "_flow-gates.yml", "the offending file must be named");
    assert.equal(v.line, idx + 1, "the offending line must be named");
    assert.equal(v.action, "actions/checkout");
    assert.equal(v.ref, "v4", "the offending ref must be named");
    assert.match(v.message, /_flow-gates\.yml:\d+: uses: actions\/checkout@v4/);
    assert.match(report(result), /_flow-gates\.yml/);
  });
});

test("a branch ref, a short SHA and an upper-case SHA are all rejected — only a full lower-case 40-hex commit passes", () => {
  withDir("shapes", (dir) => {
    writeFileSync(join(dir, "a.yml"), stepsWorkflow([
      "actions/checkout@main",
      `actions/setup-node@${SHA_A.slice(0, 7)} # v4`,
      `actions/setup-node@${SHA_A.toUpperCase()} # v4`,
      `anthropics/claude-code-action@${SHA_A} # v1.0.219`,
    ]));
    const result = checkActionPins(dir);
    assert.deepEqual(result.violations.map((v) => v.ref), ["main", SHA_A.slice(0, 7), SHA_A.toUpperCase()]);
    assert.deepEqual(result.violations.map((v) => v.line), [7, 8, 9]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: canonical's own reusables (@main / @v1) are NOT forced to a SHA
// ─────────────────────────────────────────────────────────────────────────────────────────

test("a `uses:` of canonical's own reusable at @main or @v1 passes — the moving alias is deliberate", () => {
  withDir("firstparty", (dir) => {
    writeFileSync(join(dir, "caller.yml"),
      "name: caller\non: push\njobs:\n  gates:\n    uses: CandidDan/flow/.github/workflows/_flow-gates.yml@main\n" +
      "  review:\n    uses: CandidDan/flow/.github/workflows/_flow-review.yml@v1\n");
    const result = checkActionPins(dir);
    assert.deepEqual(result.violations, [], report(result));
    assert.ok(result.ok);
    assert.deepEqual(result.refs.map((r) => r.kind), ["first-party", "first-party"]);
  });
});

test("the repo as-is: canonical's thin callers reference its reusables by moving alias, and the check leaves them alone", () => {
  const { refs } = extractUses(WORKFLOWS);
  const own = refs.filter((r) => r.kind === "first-party");
  assert.ok(own.length > 0, "canonical dogfoods its own reusables via thin callers; none found");
  for (const r of own) assert.doesNotMatch(r.ref, SHA_RE, `${r.name}:${r.line} pins canonical to a SHA of itself — see docs/flow-versioning-policy.md`);
  assert.equal(checkActionPins(WORKFLOWS).violations.filter((v) => v.kind === "first-party").length, 0);
});

test("the first-party allow-list is a single named constant, not an inline literal", () => {
  assert.ok(Array.isArray(FIRST_PARTY_PREFIXES) && FIRST_PARTY_PREFIXES.length > 0);
  assert.ok(Object.isFrozen(FIRST_PARTY_PREFIXES));
  assert.ok(FIRST_PARTY_PREFIXES.includes("CandidDan/flow/"));
  // A prefix that is a bare owner would classify EVERY action by that owner as first-party.
  for (const p of FIRST_PARTY_PREFIXES) assert.match(p, /^[^/]+\/[^/]+\/$/, `${p} must be owner/repo/, nothing looser`);
});

test("`uses: ./local` path refs are ignored; a docker:// ref is a violation rather than a silent pass", () => {
  withDir("local", (dir) => {
    writeFileSync(join(dir, "a.yml"), stepsWorkflow(["./.github/actions/thing", `actions/checkout@${SHA_A} # v4`]));
    const result = checkActionPins(dir);
    assert.ok(result.ok, report(result));
    assert.deepEqual(result.refs.map((r) => r.kind), ["local", "third-party"]);
  });
  withDir("docker", (dir) => {
    writeFileSync(join(dir, "a.yml"), stepsWorkflow(["docker://alpine:3.20"]));
    const result = checkActionPins(dir);
    assert.equal(result.ok, false);
    assert.match(result.violations[0].reason, /unsupported/);
  });
});

test("a `uses:` mentioned in a comment or prose does not count as a ref", () => {
  withDir("prose", (dir) => {
    writeFileSync(join(dir, "a.yml"),
      "name: x\non: push\n# the concern .flow/config.yml lists under `uses:` pins.\njobs:\n  a:\n    runs-on: ubuntu-latest\n" +
      "    steps:\n      - run: |\n          echo 'never uses: foo/bar@v1 as a step'\n" +
      `      - uses: actions/checkout@${SHA_A} # v4.4.0\n`);
    const { refs } = extractUses(dir);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].action, "actions/checkout");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Criterion: an empty scan fails rather than reporting success
// ─────────────────────────────────────────────────────────────────────────────────────────

test("an empty workflow directory fails — it verified nothing", () => {
  withDir("empty", (dir) => {
    const result = checkActionPins(dir);
    assert.equal(result.ok, false);
    assert.equal(result.violations.length, 0);
    assert.match(result.failures[0], /no workflow files found/);
  });
  const missing = join(tmpdir(), `flow-pins-missing-${process.pid}`);
  assert.ok(!existsSync(missing));
  assert.equal(checkActionPins(missing).ok, false, "a directory that does not exist is an empty scan, not a pass");
});

test("a workflow directory whose files contain no `uses:` refs at all fails — it verified nothing", () => {
  withDir("nouses", (dir) => {
    mkdirSync(join(dir, "ignored-subdir"));
    writeFileSync(join(dir, "a.yml"), "name: a\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n");
    writeFileSync(join(dir, "b.yaml"), "name: b\non: push\njobs: {}\n");
    writeFileSync(join(dir, "README.md"), "uses: not/a-workflow@v1\n");
    const result = checkActionPins(dir);
    assert.equal(result.ok, false);
    assert.equal(result.files.length, 2, "only .yml/.yaml files are workflows");
    assert.match(result.failures[0], /no `uses:` refs found in 2 workflow file\(s\)/);
  });
});
