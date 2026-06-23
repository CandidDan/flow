// Tests for pick-task — the queue-runner's selection rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pickTask } from "./pick-task.mjs";

function dir(tasks) {
  const d = mkdtempSync(join(tmpdir(), "flow-pick-"));
  mkdirSync(d, { recursive: true });
  let n = 1;
  for (const t of tasks) {
    const touches = JSON.stringify(t.touches ?? ["src/**"]);
    writeFileSync(join(d, `${String(n).padStart(4, "0")}-${t.id}.md`),
      `---\nid: "${t.id}"\nstatus: "${t.status}"\npriority: ${t.priority ?? 3}\ntouches: ${touches}\n---\nx\n`);
    n++;
  }
  return d;
}

test("picks the highest-priority ready task", () => {
  const d = dir([
    { id: "A-1", status: "ready", priority: 3, touches: ["a/**"] },
    { id: "A-2", status: "ready", priority: 1, touches: ["b/**"] },
    { id: "A-3", status: "ready", priority: 2, touches: ["c/**"] },
  ]);
  assert.equal(pickTask({ tasksDir: d }), "A-2");
  rmSync(d, { recursive: true, force: true });
});

test("skips a ready task whose touches overlap an in_progress task", () => {
  const d = dir([
    { id: "A-1", status: "in_progress", priority: 1, touches: ["app/**"] },
    { id: "A-2", status: "ready", priority: 1, touches: ["app/api/x.ts"] },  // overlaps app/** → skip
    { id: "A-3", status: "ready", priority: 2, touches: ["worker/**"] },     // clear → pick
  ]);
  assert.equal(pickTask({ tasksDir: d }), "A-3");
  rmSync(d, { recursive: true, force: true });
});

test("returns empty when the queue is dry", () => {
  const d = dir([{ id: "A-1", status: "done", priority: 1 }, { id: "A-2", status: "in_review", priority: 1 }]);
  assert.equal(pickTask({ tasksDir: d }), "");
  rmSync(d, { recursive: true, force: true });
});

test("returns empty when every ready task overlaps something in flight", () => {
  const d = dir([
    { id: "A-1", status: "in_progress", priority: 1, touches: ["app/**"] },
    { id: "A-2", status: "ready", priority: 1, touches: ["app/x"] },
  ]);
  assert.equal(pickTask({ tasksDir: d }), "");
  rmSync(d, { recursive: true, force: true });
});

test("ties broken by id for determinism", () => {
  const d = dir([
    { id: "A-9", status: "ready", priority: 2, touches: ["x/**"] },
    { id: "A-2", status: "ready", priority: 2, touches: ["y/**"] },
  ]);
  assert.equal(pickTask({ tasksDir: d }), "A-2");
  rmSync(d, { recursive: true, force: true });
});
