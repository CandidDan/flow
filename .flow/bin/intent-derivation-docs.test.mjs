// intent-derivation-docs.test.mjs — proving tests for flow-0074's documentation criteria.
//
// flow-0074 (ADR-0007 slice 2) moves the human's first touchpoint from approving a task spec to
// approving the intent the task derives from. The mechanical half is flow-doctor, tested beside
// it. This half is prose: the task-writer skill, the protocol and the README must each say the
// new thing and stop saying the old one. Prose has no natural failure mode, so these give it one.
//
// Canonical-only by placement: it reads project-template/, which an adopting repo does not have
// under that name (the 2.1.1 lesson; see adopter-layout.test.mjs).
//
// Criteria proved here: 10 (task-writer), 11 (PROTOCOL.md + README.md) and 13 (the fragment).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { changelogEntry } from "./changelog-entry.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE = join(REPO, "project-template");
const read = (...p) => readFileSync(join(...p), "utf8");

const SKILL = read(TEMPLATE, ".claude", "skills", "task-writer", "SKILL.md");
const PROTOCOL = read(TEMPLATE, ".flow", "PROTOCOL.md");
const README = read(TEMPLATE, "README.md");

// The text of one `## <name>` section, up to the next `## ` heading.
function section(text, name) {
  const start = text.indexOf(`\n## ${name}`);
  assert.notEqual(start, -1, `no "## ${name}" section`);
  const next = text.indexOf("\n## ", start + 4);
  return text.slice(start, next === -1 ? undefined : next);
}
// Collapse line wrapping so a phrase can be matched however the paragraph is filled.
const flat = (s) => s.replace(/\s+/g, " ");

// ── criterion 10: task-writer ──
const PROCEDURE = flat(section(SKILL, "Procedure"));

test("criterion 10: task-writer's Procedure requires an intent already on main for product work", () => {
  assert.match(PROCEDURE, /intent already on `main`/);
  assert.match(PROCEDURE, /Set `intent` to that intent's `id`/);
  assert.match(PROCEDURE, /If no such intent exists, say so to the human and stop/);
});

test("criterion 10: task-writer's Procedure forbids writing the intent in the same session, naming intent-writer", () => {
  assert.match(PROCEDURE, /\*\*intent-writer\*\* skill/);
  assert.match(PROCEDURE, /Do not write the intent yourself/);
  assert.match(PROCEDURE, /authorship and approval in the same context/);
});

test("criterion 10: task-writer's Procedure exempts maintenance work", () => {
  assert.match(PROCEDURE, /`serves: \["maintenance"\]` work needs no intent/);
});

test("criterion 10: task-writer's Pre-flight checks that `intent` resolves", () => {
  assert.match(flat(section(SKILL, "Pre-flight")), /`intent` resolves\..*`\.flow\/intents\/` on `main`/);
});

test("task-writer's procedure steps stay numbered 1..n, with the cross-reference following its step", () => {
  const nums = [...section(SKILL, "Procedure").matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
  const sequence = nums.find((n) => new RegExp(`^${n}\\. Sequence:`, "m").test(SKILL));
  assert.match(PROCEDURE, new RegExp(`Step ${sequence}'s "never runs dry"`));
});

// ── criterion 11: PROTOCOL.md and README.md ──
const INTRO = flat(PROTOCOL.slice(0, PROTOCOL.indexOf("\n## ")));

test("criterion 11: PROTOCOL.md states touchpoint 1 as approving the intent, and the PR at the end", () => {
  assert.match(INTRO, /The human approves the \*\*intent\*\* up front/);
  assert.match(INTRO, /and the PR at the end/);
});

test("criterion 11: PROTOCOL.md no longer says the human approves the task spec up front", () => {
  assert.doesNotMatch(flat(PROTOCOL), /approves the spec/i);
  assert.doesNotMatch(flat(PROTOCOL), /spec up front/i);
});

test("criterion 11: PROTOCOL.md's Hard rules carry the derive-from-an-intent rule", () => {
  const rules = flat(section(PROTOCOL, "Hard rules"));
  assert.match(rules, /\*\*Product work derives from an approved intent\.\*\*/);
  assert.match(rules, /never writes the intent it derives from/);
  assert.match(rules, /`maintenance` work needs no intent/);
});

test("criterion 11: README.md states touchpoint 1 as approving the intent, and keeps the triage lane", () => {
  const r = flat(README);
  assert.match(r, /Touchpoint 1 is approving the \*\*intent\*\*/);
  assert.match(r, /\*\*Triage proposes; you approve\.\*\*/, "the triage description stays");
});

test("criterion 11: README.md no longer claims triage approval is touchpoint 1", () => {
  assert.doesNotMatch(flat(README), /un-approved, so touchpoint 1 survives automation/);
  assert.doesNotMatch(flat(README), /approves? the (task )?spec up front/i);
});

// ── criterion 13: the changelog fragment ──
test("criterion 13: the flow-0074 changelog entry exists and describes the change and its caller action", () => {
  // changelogEntry reads changes/flow-0074.md, or the assembled entry in CHANGELOG.md once a
  // release has folded the fragment in and deleted it — so this survives the release PR.
  const f = flat(changelogEntry(REPO, "flow-0074"));
  assert.ok(f.trim(), "changes/flow-0074.md must exist (or be assembled into CHANGELOG.md)");
  assert.match(f, /`intent:`/);
  assert.match(f, /intents\.required_from/);
  assert.match(f, /\*\*Caller action, optional:\*\*/);
});
