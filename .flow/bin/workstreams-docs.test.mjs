// workstreams-docs.test.mjs — proving tests for flow-0112's criteria (ADR-0009 §4).
//
// flow-0112 lays down the workstream layer's files and prose and changes no behaviour: the store's
// template, the `workstream:` field on both intent templates, one protocol paragraph, one README
// line, one vision-writer paragraph and a changelog fragment. Prose has no natural failure mode,
// so these give it one.
//
// Canonical-only by placement: it reads project-template/ and canonical's own copy of the intent
// template, which an adopting repo does not have (the 2.1.1 lesson; see adopter-layout.test.mjs).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { changelogEntry } from "./changelog-entry.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE = join(REPO, "project-template");
const read = (...p) => readFileSync(join(...p), "utf8");

const WORKSTREAM = read(TEMPLATE, ".flow", "workstreams", "_TEMPLATE.md");
const INTENT_TEMPLATE = read(TEMPLATE, ".flow", "intents", "_TEMPLATE.md");
const INTENT_CANONICAL = read(REPO, ".flow", "intents", "_TEMPLATE.md");
const PROTOCOL = read(TEMPLATE, ".flow", "PROTOCOL.md");
const README = read(TEMPLATE, "README.md");
const SKILL = read(TEMPLATE, ".claude", "skills", "vision-writer", "SKILL.md");

// Split a Markdown file into its frontmatter and its body. The frontmatter is read with a
// deliberately small parser — top-level `key: value  # comment` lines, scalars and `[]` only —
// rather than the `yaml` package: the release-assemble check re-runs this file in a scratch copy
// of the tracked tree, where no node_modules exists. Every template this reads is that simple.
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(m, "file has no frontmatter block");
  const data = {};
  for (const line of m[1].split("\n")) {
    const f = /^([a-z_]+):\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (!f) continue;
    const v = f[2];
    data[f[1]] = v === "[]" ? [] : v.replace(/^"(.*)"$/, "$1");
  }
  return { data, raw: m[1], body: m[2] };
}
// Collapse line wrapping so a phrase can be matched however the paragraph is filled — including
// the `#` of a continued frontmatter comment and the `>` of a continued blockquote line.
const flat = (s) => s.replace(/\n\s*[#>]+ ?/g, " ").replace(/\s+/g, " ");
// The text of one `## <name>` section, up to the next `## ` heading.
function section(text, name) {
  const start = text.indexOf(`\n## ${name}`);
  assert.notEqual(start, -1, `no "## ${name}" section`);
  const next = text.indexOf("\n## ", start + 4);
  return text.slice(start, next === -1 ? undefined : next);
}
// Every documented field has a `#` comment on its own line.
function documented(raw, field) {
  return new RegExp(`^${field}:[^\\n]*#`, "m").test(raw);
}

// ── criterion 1: the workstream template's frontmatter ──
test("criterion 1: the workstream template declares id, title, created, serves, status and owner", () => {
  const { data, raw } = frontmatter(WORKSTREAM);
  assert.deepEqual(Object.keys(data), ["id", "title", "created", "serves", "status", "owner"]);
  for (const f of Object.keys(data)) assert.ok(documented(raw, f), `${f} is not commented`);
});

test("criterion 1: status defaults to active, and the three values are documented", () => {
  const { data, raw } = frontmatter(WORKSTREAM);
  assert.equal(data.status, "active");
  assert.match(raw, /active \| done \| retired/);
  assert.match(flat(raw), /SET BY HAND/);
  assert.match(flat(raw), /DERIVED by flow-state and never stored/);
});

test("criterion 1: id, serves and owner are documented the way the intent template documents its fields", () => {
  const { data, raw } = frontmatter(WORKSTREAM);
  assert.equal(data.id, "");
  assert.match(raw, /^id: ""\s+# kebab-case slug, identical to the filename/m);
  assert.deepEqual(data.serves, []);
  assert.match(flat(raw), /Same ids and the same resolution rules as an intent's `serves`/);
  assert.match(flat(raw), /`\[\]` is allowed for exploration and is flagged/);
  assert.match(raw, /^owner: ""\s+# optional/m);
});

// ── criterion 2: the workstream template's body ──
test("criterion 2: the body has exactly Purpose, Constraints, Dependencies and Open questions, in that order", () => {
  const { body } = frontmatter(WORKSTREAM);
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(headings, ["Purpose", "Constraints", "Dependencies", "Open questions"]);
  assert.equal(body.match(/^#+ /gm).length, 4, "no headings other than the four sections");
});

test("criterion 2: each section carries its instruction", () => {
  const { body } = frontmatter(WORKSTREAM);
  assert.match(flat(section(body, "Purpose")), /What this workstream delivers and when it is done, in the human's words/);
  assert.match(flat(section(body, "Constraints")), /A constraint true of only one intent belongs on that intent/);
  assert.match(flat(section(body, "Constraints")), /citing the decision/);
  assert.match(flat(section(body, "Dependencies")), /with a date and what slips if the date is missed/);
  assert.match(flat(section(body, "Open questions")), /Surfaced here, never resolved here/);
});

test("criterion 2: the Dependencies section documents the `workstream: <id>` bullet form", () => {
  const { body } = frontmatter(WORKSTREAM);
  assert.match(flat(section(body, "Dependencies")), /A dependency on another workstream is a bullet starting `workstream: <id>`/);
});

test("the workstream template says membership lives on the intent and that merging its PR is its approval", () => {
  const { body } = frontmatter(WORKSTREAM);
  const f = flat(body);
  assert.match(f, /Membership lives on the intent, not here/);
  assert.match(f, /This file never lists its intents/);
  assert.match(f, /Tasks never name a workstream/);
  assert.match(f, /Merging the PR that adds this file is its approval/);
});

// ── criterion 3: the `workstream` field on both intent templates ──
test("criterion 3: the two intent templates are byte-identical", () => {
  assert.equal(INTENT_TEMPLATE, INTENT_CANONICAL);
});

test("criterion 3: each intent template declares a documented `workstream` field beside `serves`", () => {
  for (const [name, text] of [["template", INTENT_TEMPLATE], ["canonical", INTENT_CANONICAL]]) {
    const { data, raw } = frontmatter(text);
    assert.ok("workstream" in data, `${name}: no workstream field`);
    assert.equal(data.workstream, "", `${name}: workstream is not empty by default`);
    assert.ok(documented(raw, "workstream"), `${name}: workstream is not commented`);
    const keys = Object.keys(data);
    assert.equal(keys.indexOf("workstream"), keys.indexOf("serves") + 1, `${name}: workstream is not beside serves`);
    const f = flat(raw);
    assert.match(f, /One workstream per intent at most/);
    assert.match(f, /Empty means ungrouped and is never a finding/);
    assert.match(f, /a workstream never lists its intents/);
  }
});

// ── criterion 4: PROTOCOL.md ──
// The paragraph sits in the protocol's intro, beside the intents paragraph, not in a `## ` section:
// protocol-portability.test.mjs pins every section's digest, and the intro is where the layer
// above it (intents) is already introduced.
test("criterion 4: PROTOCOL.md's intro carries the workstreams paragraph", () => {
  const store = flat(PROTOCOL.slice(0, PROTOCOL.indexOf("\n## ")));
  assert.match(store, /\*\*Workstreams, where a repo has them \(ADR-0009\)\.\*\*/);
  assert.match(store, /\*\*merging its PR is its approval\*\*/);
  assert.match(store, /\*\*Tasks never name a workstream\*\*/);
  assert.match(store, /never as a list on the workstream/);
  assert.match(store, /`status` \(`active \| done \| retired`\) is set by hand/);
  assert.match(store, /\*\*progress is derived\*\* by `flow-state` and never stored/);
  assert.match(store, /A repo with no `\.flow\/workstreams\/` is valid/);
});

test("the protocol paragraph is one paragraph, not a section", () => {
  assert.doesNotMatch(PROTOCOL, /^#+ .*[Ww]orkstream/m);
  const para = PROTOCOL.split("\n\n").find((p) => p.startsWith("**Workstreams, where a repo has them"));
  assert.ok(para);
  assert.ok(para.split("\n").length <= 10, "the paragraph stays short");
});

// ── README.md: one line beside the store ──
test("README.md lists .flow/workstreams/ in the layout, beside .flow/intents/", () => {
  const layout = section(README, "What's in here");
  assert.match(layout, /^  workstreams\/ +Optional, beside \.flow\/intents\//m);
  assert.match(flat(layout), /workstreams\/ .*_TEMPLATE\.md/);
});

// ── criterion 5: vision-writer ──
test("criterion 5: vision-writer says a workstream no goal covers adds the goal in the same PR, citing ADR-0009", () => {
  const amend = flat(section(SKILL, "Amend mode — when direction genuinely changes"));
  assert.match(amend, /\*\*A workstream no goal covers is case \(b\) of the three-way test\*\*/);
  assert.match(amend, /\*\*in the same PR as the workstream file\*\*/);
  assert.match(amend, /merging that PR approves both/);
  assert.match(amend, /ADR-0009 §3/);
});

// ── criterion 7: the changelog fragment ──
test("criterion 7: the flow-0112 changelog entry exists and states caller action: none", () => {
  const f = flat(changelogEntry(REPO, "flow-0112"));
  assert.ok(f.trim(), "changes/flow-0112.md must exist (or be assembled into CHANGELOG.md)");
  assert.match(f, /\*\*Caller action: none\.\*\*/);
  assert.match(f, /`workstream:`/);
  assert.match(f, /\.flow\/workstreams\/_TEMPLATE\.md/);
});

// ── flow-0150 criterion 8: its changelog fragment (canonical-only, so it lives here, not in
// flow-doctor.test.mjs, which ships to adopting repos that have no changes/ for this task) ──
test("flow-0150 criterion 8: the flow-0150 changelog entry exists and states caller action: none", () => {
  const f = flat(changelogEntry(REPO, "flow-0150"));
  assert.ok(f.trim(), "changes/flow-0150.md must exist (or be assembled into CHANGELOG.md)");
  assert.match(f, /\*\*Caller action: none\*\*/);
  assert.match(f, /flow-doctor/);
});
