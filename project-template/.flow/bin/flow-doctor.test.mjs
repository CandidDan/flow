// Tests for flow-doctor — the store validator validates itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDoctor } from "./flow-doctor.mjs";

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

// ── touches overlap (false "parallel-safe" detection) ──

test("overlapping touches on two ready tasks → warning naming both, not a problem", () => {
  const d = fixture({
    "0001-a.md": task("P-0001", { touches: '["app/x/**", "app/shared/page.ts"]' }),
    "0002-b.md": task("P-0002", { touches: '["app/y/**", "app/shared/page.ts"]' }),
  });
  const r = runDoctor({ flowDir: d });
  assert.deepEqual(r.problems, []);
  assert.ok(r.warnings.some((w) => w.includes("P-0001") && w.includes("P-0002") && w.includes("overlapping touches")));
  rmSync(d, { recursive: true, force: true });
});

test("overlapping touches on two in_progress tasks → problem (atomic-claim bypassed)", () => {
  const d = fixture({
    "0001-a.md": task("P-0001", { status: "in_progress", owner: "s1", started: "2026-06-05", touches: '["app/shared/**"]' }),
    "0002-b.md": task("P-0002", { status: "in_progress", owner: "s2", started: "2026-06-05", touches: '["app/shared/util.ts"]' }),
  });
  const r = runDoctor({ flowDir: d });
  assert.ok(r.problems.some((p) => p.includes("P-0001") && p.includes("P-0002") && p.includes("in_progress")));
  rmSync(d, { recursive: true, force: true });
});

test("disjoint touches → no overlap warning (different trees are genuinely parallel-safe)", () => {
  const d = fixture({
    "0001-a.md": task("P-0001", { touches: '["app/whisper/**"]' }),
    "0002-b.md": task("P-0002", { touches: '["app/meetings/**"]' }),
  });
  const r = runDoctor({ flowDir: d });
  assert.ok(!r.warnings.some((w) => w.includes("overlapping touches")));
  rmSync(d, { recursive: true, force: true });
});

test("multi-line touches form parses (not misread as empty) AND feeds overlap — the CAN-42/43 case", () => {
  const ml = (id, p) => `---
id: "${id}"
title: "x"
status: "ready"
priority: 3
owner: ""
started: ""
branch: ""
pr: ""
blocked_reason: ""
touches:
  - "${p}"
labels: [x]
---
body
`;
  const d = fixture({ "0001-a.md": ml("P-0001", "app/focus/page.tsx"), "0002-b.md": ml("P-0002", "app/focus/page.tsx") });
  const r = runDoctor({ flowDir: d });
  assert.ok(!r.warnings.some((w) => w.includes("empty touches")), "multi-line touches must not read as empty");
  assert.ok(r.warnings.some((w) => w.includes("P-0001") && w.includes("P-0002") && w.includes("overlapping")), "shared file must be flagged");
  rmSync(d, { recursive: true, force: true });
});

// ── gate-coverage floor (source_roots) ──
// Repo-shaped fixture: a clean root holding .flow/ + arbitrary source trees, so the scan
// (which keys off dirname(flowDir)) sees only what we create.
function repoFixture({ config, trees = {} }) {
  const repo = mkdtempSync(join(tmpdir(), "flow-repo-"));
  mkdirSync(join(repo, ".flow", "tasks"), { recursive: true });
  writeFileSync(join(repo, ".flow", "tasks", "0001-a.md"), task("P-0001"));
  if (config !== undefined) writeFileSync(join(repo, ".flow", "config.yml"), config);
  for (const [path, file] of Object.entries(trees)) {
    mkdirSync(join(repo, path), { recursive: true });
    writeFileSync(join(repo, path, file), "export const x = 1;\n");
  }
  return { repo, flowDir: join(repo, ".flow") };
}
const cfg = (roots) =>
  "source_roots:\n" + roots.map((r) => `  - path: "${r.path}"\n    check: "${r.check ?? ""}"`).join("\n") + "\n";

test("source_roots: every tree declared + covered → clean", () => {
  const { repo, flowDir } = repoFixture({
    config: cfg([{ path: "app/", check: "npm run lint" }, { path: "supabase/functions/", check: "deno check supabase/functions/**/*.ts" }]),
    trees: { "app/src": "index.ts", "supabase/functions/process-inbound": "index.ts" },
  });
  const r = runDoctor({ flowDir });
  assert.deepEqual(r.problems, []);
  rmSync(repo, { recursive: true, force: true });
});

test("source_roots: an UNDECLARED top-level source tree FAILS (the BOOT_ERROR class)", () => {
  const { repo, flowDir } = repoFixture({
    config: cfg([{ path: "app/", check: "npm run lint" }]),               // declares app only
    trees: { "app/src": "index.ts", "supabase/functions/x": "index.ts" }, // supabase/ undeclared
  });
  const r = runDoctor({ flowDir });
  assert.ok(r.problems.some((p) => p.includes('"supabase/"') && p.includes("not covered")));
  rmSync(repo, { recursive: true, force: true });
});

test("source_roots: declared root missing on disk, or with no check → problems", () => {
  const { repo, flowDir } = repoFixture({
    config: cfg([{ path: "app/", check: "" }, { path: "ghost/", check: "x" }]),
    trees: { "app/src": "index.ts" },
  });
  const r = runDoctor({ flowDir });
  assert.ok(r.problems.some((p) => p.includes('"app/" has no check')));
  assert.ok(r.problems.some((p) => p.includes('"ghost/" does not exist')));
  rmSync(repo, { recursive: true, force: true });
});

test("source_roots: config present but none declared → adoption warning, not failure", () => {
  const { repo, flowDir } = repoFixture({ config: "project:\n  name: x\n", trees: { "app/src": "index.ts" } });
  const r = runDoctor({ flowDir });
  assert.ok(r.warnings.some((w) => w.includes("no source_roots declared")));
  assert.ok(!r.problems.some((p) => p.includes("source")));
  rmSync(repo, { recursive: true, force: true });
});
