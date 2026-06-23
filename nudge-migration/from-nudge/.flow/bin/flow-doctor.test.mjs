// Tests for flow-doctor — the store validator validates itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDoctor, findUncommittedTasks, parseSourceRoots, checkSourceRoots } from "./flow-doctor.mjs";

function fixture(files) {
  const flowDir = mkdtempSync(join(tmpdir(), "flow-doc-"));
  mkdirSync(join(flowDir, "tasks"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(flowDir, "tasks", name), body);
  return flowDir;
}
const task = (id, f = {}) => `---
id: "${id}"
title: "${f.title ?? "x"}"
status: "${f.status ?? "ready"}"
priority: ${f.priority ?? 3}
owner: "${f.owner ?? ""}"
started: "${f.started ?? ""}"
branch: "${f.branch ?? ""}"
pr: "${f.pr ?? ""}"
blocked_reason: "${f.blocked_reason ?? ""}"
touches: ${f.touches ?? '["src/**"]'}
---
body
`;

test("healthy store: no problems, no warnings", () => {
  const d = fixture({ "0001-a.md": task("P-0001") });
  const r = runDoctor({ flowDir: d });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.count, 1);
  rmSync(d, { recursive: true, force: true });
});

test("duplicate ids and illegal status are problems", () => {
  const d = fixture({
    "0001-a.md": task("P-0001"),
    "0002-b.md": task("P-0001"),
    "0003-c.md": task("P-0003", { status: "shipping" }),
  });
  const r = runDoctor({ flowDir: d });
  assert.ok(r.problems.some((p) => p.includes("duplicate id")));
  assert.ok(r.problems.some((p) => p.includes('illegal status "shipping"')));
  rmSync(d, { recursive: true, force: true });
});

test("in_review without pr, blocked without reason, incomplete claim — all problems", () => {
  const d = fixture({
    "0001-a.md": task("P-0001", { status: "in_review", branch: "flow/P-0001-x" }),       // no pr
    "0002-b.md": task("P-0002", { status: "blocked" }),                                   // no reason
    "0003-c.md": task("P-0003", { status: "in_progress", owner: "sess" }),                // no started
  });
  const r = runDoctor({ flowDir: d });
  assert.equal(r.problems.length, 3);
  rmSync(d, { recursive: true, force: true });
});

test("ready with stale owner or empty touches — warnings, not problems", () => {
  const d = fixture({
    "0001-a.md": task("P-0001", { owner: "sess-old" }),
    "0002-b.md": task("P-0002", { touches: "[]" }),
  });
  const r = runDoctor({ flowDir: d });
  assert.deepEqual(r.problems, []);
  assert.equal(r.warnings.length, 2);
  rmSync(d, { recursive: true, force: true });
});

test("board snapshot drift is a warning", () => {
  const d = fixture({ "0001-a.md": task("P-0001", { status: "in_progress", owner: "s", started: "2026-06-05" }) });
  writeFileSync(join(d, "board.html"),
    `<script>\nconst TASKS = [\n  {id:"P-0001", title:"x", status:"ready", priority:3},\n  {id:"P-9999", title:"ghost", status:"done", priority:3},\n];\n</script>`);
  const r = runDoctor({ flowDir: d });
  assert.deepEqual(r.problems, []);
  assert.ok(r.warnings.some((w) => w.includes("P-0001=ready, files say in_progress")));
  assert.ok(r.warnings.some((w) => w.includes("P-9999 but no task file")));
  rmSync(d, { recursive: true, force: true });
});

test("malformed frontmatter and missing fields are problems", () => {
  const d = fixture({
    "0001-a.md": "no frontmatter at all\n",
    "0002-b.md": `---\nid: "P-0002"\nstatus: "ready"\npriority: 3\n---\nbody\n`,   // no title
  });
  const r = runDoctor({ flowDir: d });
  assert.ok(r.problems.some((p) => p.includes("malformed frontmatter")));
  assert.ok(r.problems.some((p) => p.includes("missing required field(s): title")));
  rmSync(d, { recursive: true, force: true });
});

// ── CAN-41: uncommitted-task guard ──

test("findUncommittedTasks: untracked task file is offending", () => {
  const porcelain = "?? .flow/tasks/0099-x.md\n M src/app.ts\n";
  assert.deepEqual(findUncommittedTasks(porcelain), [".flow/tasks/0099-x.md"]);
});

test("findUncommittedTasks: staged-but-uncommitted change to a tracked task is offending", () => {
  const porcelain = "M  .flow/tasks/0030-slim.md\n";
  assert.deepEqual(findUncommittedTasks(porcelain), [".flow/tasks/0030-slim.md"]);
});

test("findUncommittedTasks: unstaged worktree change to a tracked task is offending", () => {
  const porcelain = " M .flow/tasks/0030-slim.md\n";
  assert.deepEqual(findUncommittedTasks(porcelain), [".flow/tasks/0030-slim.md"]);
});

test("findUncommittedTasks: clean tree (no .flow/tasks entries) returns empty", () => {
  assert.deepEqual(findUncommittedTasks(" M src/app.ts\n?? README.md\n"), []);
  assert.deepEqual(findUncommittedTasks(""), []);
});

test("findUncommittedTasks: ignores _TEMPLATE.md and staged deletions not on disk", () => {
  assert.deepEqual(findUncommittedTasks("?? .flow/tasks/_TEMPLATE.md\n"), []);
  // a deletion: porcelain lists it but it's not in the on-disk files list
  assert.deepEqual(
    findUncommittedTasks(" D .flow/tasks/0099-gone.md\n", [".flow/tasks/0001-a.md"]),
    [],
  );
});

test("runDoctor: an uncommitted task file fails the run with a clear message", () => {
  const d = fixture({ "0099-x.md": task("P-0099") });
  const r = runDoctor({
    flowDir: d,
    gitStatus: () => ({ inRepo: true, porcelain: "?? .flow/tasks/0099-x.md\n" }),
  });
  const hit = r.problems.find((p) => p.includes(".flow/tasks/0099-x.md"));
  assert.ok(hit, "expected a problem naming the uncommitted task file");
  assert.ok(hit.includes("committed to main"));
  rmSync(d, { recursive: true, force: true });
});

test("runDoctor: not a git work tree → check skipped (note), other checks still run", () => {
  const d = fixture({ "0001-a.md": task("P-0001") });
  const r = runDoctor({ flowDir: d, gitStatus: () => ({ inRepo: false, porcelain: "" }) });
  assert.deepEqual(r.problems, []);
  assert.equal(r.count, 1);
  assert.ok(r.notes.some((n) => n.includes("skipped")));
  rmSync(d, { recursive: true, force: true });
});

// ── CAN-33: source_roots gate-coverage check ──

function rootFixture(sourceRootsYaml, extraTopDirs = []) {
  // Creates a mini-repo: tmpdir/repoRoot/.flow/tasks/ (flowDir = repoRoot/.flow)
  // so that resolve(flowDir, "..") yields repoRoot and readdirSync sees extraTopDirs.
  const repoRoot = mkdtempSync(join(tmpdir(), "flow-roots-"));
  const flowDir = join(repoRoot, ".flow");
  mkdirSync(join(flowDir, "tasks"), { recursive: true });
  if (sourceRootsYaml !== null) {
    writeFileSync(join(flowDir, "config.yml"), sourceRootsYaml);
  }
  for (const dir of extraTopDirs) {
    mkdirSync(join(repoRoot, dir), { recursive: true });
  }
  return { repoRoot, flowDir };
}

function configYml(roots) {
  if (!roots.length) return "source_roots:\n";
  let out = "source_roots:\n";
  for (const { path, check } of roots) {
    out += `  - path: "${path}"\n    check: "${check}"\n`;
  }
  return out;
}

test("parseSourceRoots: returns null when config file missing", () => {
  const result = parseSourceRoots("/nonexistent/config.yml");
  assert.equal(result, null);
});

test("parseSourceRoots: returns undefined when config exists but has no source_roots block", () => {
  const d = mkdtempSync(join(tmpdir(), "flow-cfg-"));
  writeFileSync(join(d, "config.yml"), "commands:\n  build: npm run build\n");
  const result = parseSourceRoots(join(d, "config.yml"));
  assert.equal(result, undefined);
  rmSync(d, { recursive: true, force: true });
});

test("parseSourceRoots: parses path and check for each entry", () => {
  const d = mkdtempSync(join(tmpdir(), "flow-cfg-"));
  writeFileSync(join(d, "config.yml"),
    "source_roots:\n  - path: \"app/\"\n    check: \"npm run lint\"\n  - path: \"supabase/functions/\"\n    check: \"deno check\"\n");
  const result = parseSourceRoots(join(d, "config.yml"));
  assert.equal(result.length, 2);
  assert.equal(result[0].path, "app/");
  assert.equal(result[0].check, "npm run lint");
  assert.equal(result[1].path, "supabase/functions/");
  assert.equal(result[1].check, "deno check");
  rmSync(d, { recursive: true, force: true });
});

test("checkSourceRoots: no problems when all top-level dirs are covered or ignored", () => {
  const roots = [
    { path: "app/", check: "npm run lint" },
    { path: "supabase/functions/", check: "deno bundle" },
  ];
  // app/ → direct match; supabase/ → transitively covered; docs/tests/scripts/holding/node_modules → ROOT_IGNORE; .git → hidden
  const topDirs = [
    { name: "app", isDirectory: () => true },
    { name: "supabase", isDirectory: () => true },
    { name: "docs", isDirectory: () => true },
    { name: "tests", isDirectory: () => true },
    { name: "scripts", isDirectory: () => true },
    { name: "holding", isDirectory: () => true },
    { name: "node_modules", isDirectory: () => true },
    { name: ".git", isDirectory: () => true },
    { name: "README.md", isDirectory: () => false },
  ];
  const problems = checkSourceRoots("/repo", roots, topDirs);
  assert.deepEqual(problems, []);
});

test("checkSourceRoots: undeclared top-level dir produces a problem", () => {
  const roots = [{ path: "app/", check: "npm run lint" }];
  const topDirs = [
    { name: "app", isDirectory: () => true },
    { name: "scratch", isDirectory: () => true }, // new uncovered dir
  ];
  const problems = checkSourceRoots("/repo", roots, topDirs);
  assert.ok(problems.some((p) => p.includes("scratch") && p.includes("no gate coverage")));
});

test("checkSourceRoots: node_modules is silently ignored even when undeclared", () => {
  const roots = [{ path: "app/", check: "npm run lint" }];
  const topDirs = [
    { name: "app", isDirectory: () => true },
    { name: "node_modules", isDirectory: () => true },
  ];
  const problems = checkSourceRoots("/repo", roots, topDirs);
  assert.deepEqual(problems, []);
});

test("checkSourceRoots: declared root with empty check is a problem", () => {
  const roots = [
    { path: "app/", check: "" },
  ];
  const topDirs = [{ name: "app", isDirectory: () => true }];
  const problems = checkSourceRoots("/repo", roots, topDirs);
  assert.ok(problems.some((p) => p.includes("app/") && p.includes("empty")));
});

test("runDoctor: no config.yml → source_roots check skipped with a note", () => {
  // Using a plain fixture (no config.yml in the flow dir's parent).
  const d = fixture({ "0001-a.md": task("P-0001") });
  const r = runDoctor({ flowDir: d, gitStatus: () => ({ inRepo: false, porcelain: "" }) });
  assert.deepEqual(r.problems, []);
  assert.ok(r.notes.some((n) => n.includes("source_roots") && n.includes("skipped")));
  rmSync(d, { recursive: true, force: true });
});

test("runDoctor: source_roots declared and all dirs covered → no problems", () => {
  const { flowDir, repoRoot } = rootFixture(
    configYml([
      { path: "app/", check: "npm run lint" },
      { path: "supabase/functions/", check: "deno bundle" },
    ]),
    ["app", "supabase"],
  );
  // Inject topDirsOverride so we don't depend on repoRoot's actual contents.
  const topDirs = [
    { name: "app", isDirectory: () => true },
    { name: "supabase", isDirectory: () => true },
  ];
  // Need a task file so runDoctor doesn't fail on empty tasks dir.
  writeFileSync(join(flowDir, "tasks", "0001-a.md"), task("P-0001"));
  const r = runDoctor({ flowDir, gitStatus: () => ({ inRepo: false, porcelain: "" }), topDirsOverride: topDirs });
  assert.deepEqual(r.problems, []);
  rmSync(repoRoot, { recursive: true, force: true });
});

test("runDoctor: undeclared top-level dir → FAIL with 'not covered' message", () => {
  const { flowDir, repoRoot } = rootFixture(
    configYml([{ path: "app/", check: "npm run lint" }]),
    ["app"],
  );
  writeFileSync(join(flowDir, "tasks", "0001-a.md"), task("P-0001"));
  const topDirs = [
    { name: "app", isDirectory: () => true },
    { name: "scratch", isDirectory: () => true },
  ];
  const r = runDoctor({ flowDir, gitStatus: () => ({ inRepo: false, porcelain: "" }), topDirsOverride: topDirs });
  assert.ok(r.problems.some((p) => p.includes("scratch")));
  rmSync(repoRoot, { recursive: true, force: true });
});
