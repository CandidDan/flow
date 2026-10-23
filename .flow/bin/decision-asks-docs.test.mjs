// decision-asks-docs.test.mjs — proving tests for flow-0156's documentation criteria.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { changelogEntry } from "./changelog-entry.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const protocol = readFileSync(join(REPO, "project-template/.flow/PROTOCOL.md"), "utf8").replace(/\s+/g, " ");

test("criterion 1: check task, notes, intent and linked tasks before a decision; record the source", () => {
  assert.match(protocol, /Check the spec before you ask/);
  assert.match(protocol, /this task's body and `notes`, the intent it names, and the tasks in its `blocked_by`/);
  assert.match(protocol, /append a `notes` line citing where it came from/);
});

test("criterion 2: no open decision at hand-off; names fyi/follow-up or blocked", () => {
  assert.match(protocol, /does not open its PR for review with an open `decision` ask/);
  assert.match(protocol, /`fyi` \(or a `follow-up`/);
  assert.match(protocol, /the task is `blocked`/);
});

test("criterion 4: the changelog fragment states caller action none", () => {
  const f = changelogEntry(REPO, "flow-0156");
  assert.match(f, /No caller action/);
});
