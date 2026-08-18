// flightdeck-state.test.mjs — proving tests for the cross-project state aggregator.
//
// Two layers, deliberately:
//
//   · Injected IO for the branch behaviour — every `unavailable` path, the enabled filter, the
//     project tagging. Fast, and it can exercise failures a real filesystem makes awkward.
//   · Real temporary git repositories for provenance and the end-to-end CLI. Provenance is the
//     claim this task exists to make trustworthy ("this number came from THIS commit"), and a
//     provenance test against a fake git is a test of the fake. So those build actual repos, with
//     an actual `origin/main` ref and an actual copy of `flow-state.mjs`, and run the real binary.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RESOLVER, aggregate, expandHome, gitProvenance, parseRegistry, resolveProject, unavailable,
} from "./flightdeck-state.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const SCRIPT = join(BIN, "flightdeck-state.mjs");
const FLOW_STATE_SRC = join(REPO, "project-template", ".flow", "bin", "flow-state.mjs");

const tmp = (n) => mkdtempSync(join(tmpdir(), `flow-fd-${n}-`));
const git = (cwd, ...args) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

// Build a real Flow project: a git repo with a task on `origin/main` and its own resolver.
function makeProject(root, { id = "demo-0001", status = "ready", withResolver = true } = {}) {
  mkdirSync(join(root, ".flow", "tasks"), { recursive: true });
  mkdirSync(join(root, ".flow", "bin"), { recursive: true });
  writeFileSync(join(root, ".flow", "tasks", `${id}.md`),
    `---\nid: "${id}"\ntitle: "A task"\nstatus: "${status}"\npriority: 2\ntouches: ["src/**"]\n---\n\n## Context\n`);
  if (withResolver) cpSync(FLOW_STATE_SRC, join(root, RESOLVER));

  git(root, "init", "--quiet");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "seed");
  // No remote is needed — flow-state and the aggregator both read the ref, not the network.
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  return root;
}

const registryFor = (entries) =>
  "projects:\n" + entries.map((e) =>
    `  - name: "${e.name}"\n    repo: "${e.repo ?? ""}"\n    path: "${e.path ?? ""}"\n` +
    `    enabled: ${e.enabled === false ? "false" : "true"}\n`).join("");

// A stub IO whose projects all resolve, unless overridden per-path.
const stubIo = (overrides = {}) => ({
  exists: (p) => overrides.missing !== p && !(overrides.noResolver && p === join(overrides.noResolver, RESOLVER)),
  // `in` rather than `??` — the interesting case is provenance: null, which ?? would swallow.
  provenance: () => ("provenance" in overrides
    ? overrides.provenance
    : { commit: "a".repeat(40), committed_at: "2026-08-18T00:00:00+00:00" }),
  flowState: (root) => overrides.flowState
    ? overrides.flowState(root)
    : { source: "origin/main @ abc1234", prReconciled: false, tasks: [{ id: "x-0001", status: "ready" }] },
});

// ── registry parsing ───────────────────────────────────────────────────────

test("parseRegistry reads name, repo, path and enabled", () => {
  const entries = parseRegistry(registryFor([
    { name: "alpha", repo: "o/alpha", path: "/tmp/alpha" },
    { name: "beta", repo: "o/beta", path: "/tmp/beta", enabled: false },
  ]));
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { name: "alpha", repo: "o/alpha", path: "/tmp/alpha", enabled: true });
  assert.equal(entries[1].enabled, false);
});

test("parseRegistry keeps a '#' inside a quoted value — the bug the .flow/bin readers shipped", () => {
  const [entry] = parseRegistry(`projects:\n  - name: "c#-app"\n    path: "/tmp/a#b"\n    enabled: true\n`);
  assert.equal(entry.name, "c#-app");
  assert.equal(entry.path, "/tmp/a#b", "a # inside quotes is data, not a comment");
});

test("parseRegistry strips a trailing comment from an UNQUOTED value", () => {
  const [entry] = parseRegistry(`projects:\n  - name: alpha   # the main one\n    path: /tmp/alpha\n`);
  assert.equal(entry.name, "alpha");
  assert.equal(entry.path, "/tmp/alpha");
});

test("parseRegistry tolerates an empty or commented-out registry", () => {
  assert.deepEqual(parseRegistry("projects:\n  # - name: \"x\"\n"), []);
  assert.deepEqual(parseRegistry(""), []);
  assert.deepEqual(parseRegistry("something_else:\n  - a\n"), []);
});

test("expandHome resolves the ~ the registry actually contains", () => {
  assert.equal(expandHome("~/Projects/x", "/home/u"), "/home/u/Projects/x");
  assert.equal(expandHome("~", "/home/u"), "/home/u");
  assert.equal(expandHome("/abs/path", "/home/u"), "/abs/path");
  assert.equal(expandHome("", "/home/u"), "");
});

// ── aggregation behaviour ──────────────────────────────────────────────────

test("two enabled projects produce ONE document carrying both projects' tasks, tagged by project", () => {
  const out = aggregate({
    registryText: registryFor([
      { name: "alpha", path: "/tmp/alpha" },
      { name: "beta", path: "/tmp/beta" },
    ]),
    io: stubIo(),
  });

  assert.equal(out.projects.length, 2);
  assert.deepEqual(out.projects.map((p) => p.name), ["alpha", "beta"]);
  for (const p of out.projects) {
    assert.equal(p.status, "ok");
    assert.ok(p.tasks.length > 0, "each project must contribute its tasks");
    for (const t of p.tasks) assert.equal(t.project, p.name, "every task must be tagged with its project");
  }
  assert.equal(out.summary.tasks, 2);
});

test("a project with enabled: false appears NOWHERE in the output", () => {
  const out = aggregate({
    registryText: registryFor([
      { name: "alpha", path: "/tmp/alpha" },
      { name: "hidden", path: "/tmp/hidden", enabled: false },
    ]),
    io: stubIo(),
  });

  assert.deepEqual(out.projects.map((p) => p.name), ["alpha"]);
  assert.doesNotMatch(JSON.stringify(out), /hidden/,
    "a disabled project must be absent entirely, not merely marked");
  assert.equal(out.summary.total, 1);
});

test("a project whose path does not exist is 'unavailable' with a reason, and does not affect the others", () => {
  const out = aggregate({
    registryText: registryFor([
      { name: "gone", path: "/tmp/gone" },
      { name: "fine", path: "/tmp/fine" },
    ]),
    io: stubIo({ missing: "/tmp/gone" }),
  });

  const gone = out.projects.find((p) => p.name === "gone");
  const fine = out.projects.find((p) => p.name === "fine");
  assert.equal(gone.status, "unavailable");
  assert.match(gone.reason, /path does not exist/);
  assert.equal(fine.status, "ok", "one unreachable project must not poison the rest");
  assert.equal(out.summary.unavailable, 1);
  assert.equal(out.summary.ok, 1);
});

test("a directory with no flow-state.mjs is 'unavailable', naming the missing resolver", () => {
  const out = aggregate({
    registryText: registryFor([{ name: "old", path: "/tmp/old" }]),
    io: stubIo({ noResolver: "/tmp/old" }),
  });

  const [old] = out.projects;
  assert.equal(old.status, "unavailable");
  assert.match(old.reason, /flow-state\.mjs/, "the reason must name the resolver that is missing");
  assert.deepEqual(old.tasks, [], "no tasks may be reported — there is no fallback source");
});

test("a project with no registered path is 'unavailable' rather than silently skipped", () => {
  const out = aggregate({
    registryText: registryFor([{ name: "remote-only", repo: "o/r", path: "" }]),
    io: stubIo(),
  });
  assert.equal(out.projects[0].status, "unavailable");
  assert.match(out.projects[0].reason, /path is required/);
});

test("unreadable origin/main is 'unavailable' — provenance cannot be faked from HEAD", () => {
  const out = aggregate({
    registryText: registryFor([{ name: "noref", path: "/tmp/noref" }]),
    io: stubIo({ provenance: null }),
  });
  assert.equal(out.projects[0].status, "unavailable");
  assert.match(out.projects[0].reason, /origin\/main is unreadable/);
});

test("flow-state falling back to the WORKING TREE is refused, not accepted as state", () => {
  // This is the whole point of the task: stale data that looks fresh is worse than no data.
  const out = aggregate({
    registryText: registryFor([{ name: "stale", path: "/tmp/stale" }]),
    io: stubIo({
      flowState: () => ({
        source: "WORKING TREE (origin/main unreadable — may be STALE)",
        prReconciled: false,
        tasks: [{ id: "x-0001", status: "ready" }],
      }),
    }),
  });

  assert.equal(out.projects[0].status, "unavailable");
  assert.match(out.projects[0].reason, /working tree/i);
  assert.deepEqual(out.projects[0].tasks, [], "working-tree tasks must not leak into the output");
});

test("unavailable() always carries an empty task list", () => {
  const u = unavailable({ name: "x", repo: "o/x", path: "/p" }, "because");
  assert.deepEqual(u.tasks, []);
  assert.equal(u.status, "unavailable");
  assert.equal(u.reason, "because");
});

test("pr_reconciled is a boolean, mirroring what flow-state actually reported", () => {
  const on = resolveProject({ name: "a", path: "/tmp/a" },
    stubIo({ flowState: () => ({ source: "origin/main @ x", prReconciled: true, tasks: [] }) }));
  const off = resolveProject({ name: "a", path: "/tmp/a" },
    stubIo({ flowState: () => ({ source: "origin/main @ x", prReconciled: undefined, tasks: [] }) }));

  assert.equal(on.provenance.pr_reconciled, true);
  assert.equal(off.provenance.pr_reconciled, false, "a missing flag must become false, never undefined");
});

// ── provenance, against real git ───────────────────────────────────────────

test("gitProvenance returns the origin/main tip as a full SHA and strict ISO-8601", () => {
  const dir = tmp("prov");
  try {
    makeProject(dir);
    const prov = gitProvenance(dir);

    assert.ok(prov, "origin/main must be readable in a seeded repo");
    assert.match(prov.commit, /^[0-9a-f]{40}$/, "the full commit SHA, not an abbreviation");
    assert.match(prov.committed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(prov.committed_at)), "committed_at must actually parse as a date");
    assert.equal(prov.commit, git(dir, "rev-parse", "origin/main").trim(), "it must be origin/main's tip");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gitProvenance returns null outside a repo and when origin/main is absent", () => {
  const dir = tmp("noprov");
  try {
    assert.equal(gitProvenance(dir), null, "not a git repo");
    mkdirSync(join(dir, "r"));
    git(join(dir, "r"), "init", "--quiet");
    assert.equal(gitProvenance(join(dir, "r")), null, "a repo with no origin/main ref");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gitProvenance reads origin/main, NOT the working tree or HEAD", () => {
  const dir = tmp("divergent");
  try {
    makeProject(dir);
    const atOrigin = gitProvenance(dir).commit;

    // Advance HEAD past origin/main, exactly as a local clone drifts ahead of the ref.
    writeFileSync(join(dir, "drift.txt"), "local only\n");
    git(dir, "add", "-A");
    git(dir, "commit", "--quiet", "-m", "local drift");

    assert.notEqual(git(dir, "rev-parse", "HEAD").trim(), atOrigin, "the fixture must actually diverge");
    assert.equal(gitProvenance(dir).commit, atOrigin,
      "provenance must stay pinned to origin/main even when HEAD has moved on");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── the source itself ──────────────────────────────────────────────────────

test("the aggregator source contains no working-tree read path", () => {
  const src = readFileSync(SCRIPT, "utf8");
  assert.doesNotMatch(src, /readdirSync/,
    "directory walking is how a working-tree fallback gets reintroduced");
  assert.doesNotMatch(src, /\.flow\/tasks/,
    "task files must only ever be reached through flow-state, never by path from this file");
  assert.match(src, /flow-state\.mjs/, "the resolver must be the single source");
});

// ── end to end, real repos, real binary ────────────────────────────────────

test("end to end: two real projects aggregate, with provenance, and gh being absent is not a failure", () => {
  const base = tmp("e2e");
  try {
    const alpha = makeProject(join(base, "alpha"), { id: "alpha-0001", status: "ready" });
    const beta = makeProject(join(base, "beta"), { id: "beta-0001", status: "in_progress" });
    mkdirSync(join(base, "bare"));                                    // exists, but no resolver
    const registry = join(base, "projects.yml");
    writeFileSync(registry, registryFor([
      { name: "alpha", repo: "o/alpha", path: alpha },
      { name: "beta", repo: "o/beta", path: beta },
      { name: "bare", repo: "o/bare", path: join(base, "bare") },
      { name: "ghost", repo: "o/ghost", path: join(base, "does-not-exist") },
      { name: "hidden", repo: "o/hidden", path: alpha, enabled: false },
    ]));

    const r = execFileSync(process.execPath, [SCRIPT, "--registry", registry], { encoding: "utf8" });
    const out = JSON.parse(r);

    assert.deepEqual(out.projects.map((p) => p.name), ["alpha", "beta", "bare", "ghost"],
      "disabled projects are dropped; unavailable ones are kept");

    for (const name of ["alpha", "beta"]) {
      const p = out.projects.find((x) => x.name === name);
      assert.equal(p.status, "ok", `${name}: ${p.reason ?? ""}`);
      assert.match(p.provenance.commit, /^[0-9a-f]{40}$/);
      assert.ok(!Number.isNaN(Date.parse(p.provenance.committed_at)));
      // gh is not installed in CI, so reconciliation is skipped — and that must still succeed.
      assert.equal(p.provenance.pr_reconciled, false);
      assert.equal(p.tasks.length, 1);
      assert.equal(p.tasks[0].project, name);
      assert.equal(p.tasks[0].id, `${name}-0001`);
    }

    assert.match(out.projects.find((p) => p.name === "bare").reason, /flow-state\.mjs/);
    assert.match(out.projects.find((p) => p.name === "ghost").reason, /path does not exist/);
    assert.equal(out.summary.ok, 2);
    assert.equal(out.summary.unavailable, 2);
    assert.equal(out.registry, registry);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("end to end: the CLI exits 0 even when every project is unavailable", () => {
  const base = tmp("allbad");
  try {
    const registry = join(base, "projects.yml");
    writeFileSync(registry, registryFor([{ name: "ghost", path: join(base, "nope") }]));

    const r = execFileSync(process.execPath, [SCRIPT, "--registry", registry], { encoding: "utf8" });
    const out = JSON.parse(r);
    assert.equal(out.summary.ok, 0);
    assert.equal(out.summary.unavailable, 1);
    assert.equal(out.projects[0].status, "unavailable");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("end to end: a missing registry file fails loudly rather than reporting an empty portfolio", () => {
  // An empty portfolio and an unreadable registry look identical in the output but mean opposite
  // things, so this is the one case that must exit non-zero rather than print `projects: []`.
  const r = spawnSync(process.execPath,
    [SCRIPT, "--registry", join(tmpdir(), "flow-no-such-registry.yml")], { encoding: "utf8" });

  assert.notEqual(r.status, 0, "a missing registry must not be reported as zero projects");
  assert.match(r.stderr, /no registry at/);
  assert.equal(r.stdout.trim(), "", "nothing that could be parsed as a portfolio may be printed");
});
