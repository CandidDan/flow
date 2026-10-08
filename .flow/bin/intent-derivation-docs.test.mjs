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

// flow-0139: the requirement binds only a repo that has ADOPTED intents. flow-0074 shipped it
// unconditionally, so in every repo on 3.2.x task-writer refused all product work, because no
// adopter had intents yet. These tests now pin the condition, both signals, and the fallback.
test("flow-0139: task-writer's intent step applies only once the repo has adopted intents, naming both signals", () => {
  assert.match(PROCEDURE, /only if this repo has adopted intents/);
  assert.match(PROCEDURE, /`\.flow\/intents\/` exists, \*\*and\*\* `\.flow\/config\.yml` sets `intents\.required_from`/);
  assert.match(PROCEDURE, /If either is missing, skip this step: leave `intent: ""` and write the task as before/);
});

test("flow-0139: no document points at an intent-writer skill that does not exist yet", () => {
  for (const [name, text] of [["task-writer SKILL.md", SKILL], ["PROTOCOL.md", PROTOCOL], ["README.md", README]]) {
    assert.doesNotMatch(text, /intent-writer/, `${name} references intent-writer, which is not shipped (flow-0072)`);
  }
});

test("criterion 10: task-writer's Procedure requires an intent already on main for product work", () => {
  assert.match(PROCEDURE, /intent already on `main`/);
  assert.match(PROCEDURE, /Set `intent` to that intent's `id`/);
  assert.match(PROCEDURE, /If no such intent exists, say so to the human and stop/);
});

test("criterion 10: task-writer's Procedure forbids writing the intent in the same session", () => {
  assert.match(PROCEDURE, /written and merged in its own PR, by the human or in a separate session/);
  assert.match(PROCEDURE, /Do not write the intent yourself/);
  assert.match(PROCEDURE, /authorship and approval in the same context/);
});

test("criterion 10: task-writer's Procedure exempts maintenance work", () => {
  assert.match(PROCEDURE, /`serves: \["maintenance"\]` work needs no intent/);
});

test("criterion 10: task-writer's Pre-flight checks that `intent` resolves", () => {
  assert.match(flat(section(SKILL, "Pre-flight")), /`intent` resolves\*\* \(adopted repos only.*`\.flow\/intents\/` on `main`/);
});

test("task-writer's procedure steps stay numbered 1..n, with the cross-reference following its step", () => {
  const nums = [...section(SKILL, "Procedure").matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
  const sequence = nums.find((n) => new RegExp(`^${n}\\. Sequence:`, "m").test(SKILL));
  assert.match(PROCEDURE, new RegExp(`Step ${sequence}'s "never runs dry"`));
});

// ── criterion 11: PROTOCOL.md and README.md ──
const INTRO = flat(PROTOCOL.slice(0, PROTOCOL.indexOf("\n## ")));

test("criterion 11 / flow-0139: PROTOCOL.md states touchpoint 1 as the intent in an adopted repo, the spec otherwise", () => {
  assert.match(INTRO, /The human approves work up front and the PR at the end/);
  assert.match(INTRO, /In a repo that has \*\*adopted intents\*\* \(`\.flow\/intents\/` exists and `\.flow\/config\.yml` sets `intents\.required_from`\), the up-front approval is the \*\*intent\*\*/);
  assert.match(INTRO, /Until a repo adopts intents, the human approves the task spec/);
});

test("criterion 11: PROTOCOL.md's Hard rules carry the derive-from-an-intent rule", () => {
  const rules = flat(section(PROTOCOL, "Hard rules"));
  assert.match(rules, /\*\*Product work derives from an approved intent, once the repo has adopted intents\*\*/);
  assert.match(rules, /until then this rule does not\s+apply/);
  assert.match(rules, /never writes the intent it derives from/);
  assert.match(rules, /`maintenance` work needs no intent/);
});

test("criterion 11: README.md states touchpoint 1 as approving the intent, and keeps the triage lane", () => {
  const r = flat(README);
  assert.match(r, /In a repo that has adopted intents .* touchpoint 1 is approving the \*\*intent\*\*/);
  assert.match(r, /until then it is approving the task spec/);
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
