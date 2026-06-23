#!/usr/bin/env node
// pick-task.mjs — the queue-runner's brain. Prints the id of the task a fresh worker should
// claim next, or nothing if the queue is dry. Implements the protocol's selection rule:
// the highest-priority `ready` task (priority 1 = most urgent) whose `touches` globs DON'T
// overlap any currently `in_progress` task's `touches` — so the runner never dispatches work
// that would collide with work already in flight. (First-push-wins is still the real safety
// net for races; this just avoids obvious collisions up front.)
//
//   node .flow/bin/pick-task.mjs            # prints e.g. "CAN-32" or nothing
//
// Zero deps (Node >= 18). Exported pickTask() is unit-tested.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function field(head, k) {
  const m = head.match(new RegExp(`^${k}:\\s*(.*)$`, "m"));
  return m ? m[1].split("#")[0].trim().replace(/^"(.*)"$/, "$1") : "";
}
function touchesOf(head) {
  const m = head.match(/^touches:\s*\[(.*?)\]/m);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2]).filter(Boolean);
}
// Literal prefix of a glob (portion before the first wildcard).
const litPrefix = (g) => g.split(/[*?]/)[0];
// Two globs overlap if one literal prefix contains the other.
function globsOverlap(a, b) {
  const pa = litPrefix(a), pb = litPrefix(b);
  return pa.startsWith(pb) || pb.startsWith(pa);
}
function listsOverlap(a, b) {
  return a.some((x) => b.some((y) => globsOverlap(x, y)));
}

export function pickTask({ tasksDir }) {
  const ready = [], inProgress = [];
  for (const name of readdirSync(tasksDir)) {
    if (!name.endsWith(".md") || name === "_TEMPLATE.md") continue;
    const src = readFileSync(join(tasksDir, name), "utf8");
    if (!src.startsWith("---")) continue;
    const end = src.indexOf("\n---", 3);
    if (end === -1) continue;
    const head = src.slice(0, end);
    const t = { id: field(head, "id"), status: field(head, "status"),
                priority: parseInt(field(head, "priority")) || 3, touches: touchesOf(head) };
    if (t.status === "ready") ready.push(t);
    else if (t.status === "in_progress") inProgress.push(t);
  }
  ready.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const busy = inProgress.flatMap((t) => t.touches);
  for (const t of ready) {
    if (!listsOverlap(t.touches, busy)) return t.id;
  }
  return "";   // queue dry, or every ready task overlaps something in flight
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tasksDir = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "tasks");
  const id = pickTask({ tasksDir });
  if (id) process.stdout.write(id);   // bare id, no newline — easy to capture in CI
}
