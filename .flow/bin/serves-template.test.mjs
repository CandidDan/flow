// serves-template.test.mjs — proving tests for the `serves` field on the task template and the
// task-writer guidance that fills it in (flow-0012).
//
// Two prose documents, and the same reasoning as vision-template.test.mjs (flow-0011): what is
// asserted here is that a *rule is stated* and that a *shape parses*, never that a sentence is
// worded a particular way. The task's own notes warn against pinning prose to a regex, and that
// warning is honoured — every skill assertion below is section-scoped, whitespace-normalised and
// concept-level, so an honest rewrite survives it and a deleted rule does not.
//
// The template half is not prose at all. `_TEMPLATE.md` is the frontmatter every adopting repo's
// tasks are cut from, and flow-0010's doctor check reads `serves` out of exactly that shape. If
// the key loses its name, its position or its empty-list default, the check does not fail — it
// goes quiet, and every downstream repo's tasks stop being anchored while the gate stays green.
// That is the failure this file exists to catch, so the template's shape is proved by running
// flow-doctor over a task built from the shipped frontmatter rather than by reading it.
//
// Criteria proved here (flow-0012): all of them except the final "npm test and npm run lint
// pass" criterion, which the gate proves by running.

import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { runDoctor } from "../../project-template/.flow/bin/flow-doctor.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");

const TASK_TEMPLATE = readFileSync(join(TEMPLATE, ".flow/tasks/_TEMPLATE.md"), "utf8");
const SKILL = readFileSync(join(TEMPLATE, ".claude/skills/task-writer/SKILL.md"), "utf8");

// The frontmatter between the opening `---` and its closing fence.
const FRONTMATTER = TASK_TEMPLATE.slice(3, TASK_TEMPLATE.indexOf("\n---", 3));

// Frontmatter keys in file order. Column-0 only, so the continuation comment lines that hang
// under `started:` and `serves:` are not mistaken for keys.
const KEY_ORDER = FRONTMATTER.split("\n")
  .map((l) => l.match(/^([a-z_]+):/))
  .filter(Boolean)
  .map((m) => m[1]);

// Read the skill as one whitespace-normalised string: these assertions are about whether a rule
// is *stated*, and a rule must not stop being findable because a sentence was rewrapped.
const skillFlat = SKILL.replace(/\s+/g, " ");

// The named section of the skill, so "pre-flight says X" cannot be satisfied by the same
// sentence appearing in the procedure instead.
function skillSection(heading) {
  const lines = SKILL.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## ") && l.toLowerCase().includes(heading));
  assert.notEqual(start, -1, `task-writer SKILL.md has no "## …${heading}…" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join(" ").replace(/\s+/g, " ");
}

// ── criterion 1: the key exists, defaults empty, sits in the right place, disturbs nothing ──

// Written out literally rather than derived from the file, so a key that is renamed or dropped
// shows up as a mismatch instead of quietly shrinking both sides of the comparison.
const INTENDED_KEYS = [
  "id", "title", "status", "priority", "project", "owner", "created", "started",
  "branch", "pr", "issue", "blocked_reason", "serves", "touches", "labels", "notes",
];

test("_TEMPLATE.md carries `serves` between blocked_reason and touches, with the other keys unchanged", () => {
  assert.deepEqual(KEY_ORDER, INTENDED_KEYS,
    "the template's frontmatter keys are not the intended set in the intended order — `serves` is " +
    "meant to be inserted between blocked_reason and touches and to change nothing else");
});

test("the template's `serves` defaults to an empty list, in the inline form flow-doctor reads", () => {
  const line = FRONTMATTER.split("\n").find((l) => l.startsWith("serves:"));
  assert.ok(line, "no `serves:` line at column 0 of the template frontmatter");
  const value = line.replace(/^serves:\s*/, "").split("#")[0].trim();
  assert.equal(value, "[]",
    `template ships \`serves: ${value}\` — it must default to an empty list, so a task that has not ` +
    "named its goal is visibly unanchored rather than inheriting a plausible-looking one");
});

// ── criterion 2: the comment block teaches all four rules ──

// The `serves:` line's trailing comment plus the indented comment lines hanging under it, which
// is what a human filling the template actually reads.
const SERVES_COMMENT = (() => {
  const lines = FRONTMATTER.split("\n");
  const i = lines.findIndex((l) => l.startsWith("serves:"));
  assert.notEqual(i, -1, "no `serves:` line in the template frontmatter");
  const out = [lines[i].split("#").slice(1).join("#")];
  for (let j = i + 1; j < lines.length; j++) {
    if (!/^\s+#/.test(lines[j])) break;
    out.push(lines[j].replace(/^\s*#\s?/, ""));
  }
  return out.join(" ").replace(/\s+/g, " ");
})();

test("the template's `serves` comment says goal ids come from VISION.md", () => {
  assert.match(SERVES_COMMENT, /VISION\.md/,
    "the comment never names VISION.md — an orchestrator has nowhere to get an id from");
});

test("the template's `serves` comment says `maintenance` is a reserved id", () => {
  assert.match(SERVES_COMMENT, /`?maintenance`?/,
    "the comment never names the `maintenance` id, so work no product goal covers has no honest home");
  assert.match(SERVES_COMMENT, /reserved/i,
    "the comment does not say `maintenance` is RESERVED — without that it reads as a goal id " +
    "someone is expected to have declared");
});

test("the template's `serves` comment says a ready task needs an entry once a VISION.md exists", () => {
  assert.match(SERVES_COMMENT, /ready/i, "the comment does not tie the requirement to `ready`");
  assert.match(SERVES_COMMENT, /at least one/i,
    "the comment does not state that at least one entry is required — the field reads as optional");
});

test("the template's `serves` comment carries the three-way test for a task that can't name a goal", () => {
  assert.match(SERVES_COMMENT, /three|\(a\)/i,
    "the comment does not present the can't-name-a-goal case as an enumerated set of options");
  assert.match(SERVES_COMMENT, /maintenance/, "branch 1 (maintenance) is missing from the three-way test");
  assert.match(SERVES_COMMENT, /amend|missing a goal/i,
    "branch 2 (the vision is missing a goal — amend it) is missing from the three-way test");
  assert.match(SERVES_COMMENT, /drift/i, "branch 3 (drift being born) is missing from the three-way test");
  assert.match(SERVES_COMMENT, /[Nn]ever reach|plausible/,
    "the comment does not forbid reaching for the nearest plausible id, which is the whole point " +
    "of stating the test rather than the syntax");
});

// ── criterion 1, proved end to end: flow-0010's check reads the shape flow-0012 ships ──
//
// The two halves of the vision layer only exist once they meet. This builds a task out of the
// SHIPPED frontmatter — substituting only the placeholder values an orchestrator would fill —
// and runs the real doctor over it, so the template's `serves` is proved parseable by the code
// that enforces it rather than by a second parser written here that could agree while both are wrong.

const VISION = `# Vision — the fixture repo

## Goals

### G1 — Ship the thing
Because the thing is the point.

## Non-goals

### NG1 — Become a project-management product
`;

const READY_BODY = `
## Context

Why this task exists, in enough detail that a fresh session doesn't have to ask.

## Scope

What it changes, and what it deliberately leaves alone.

## Acceptance criteria

- [ ] Given the shipped template, when flow-doctor reads it, then serves resolves.

## Notes / open questions

None.
`;

// The shipped frontmatter with the placeholders an orchestrator fills in, filled in. `serves`
// is left for the caller to set, which is the single variable under test.
function taskFromTemplate(servesValue) {
  const head = FRONTMATTER
    .replace(/^id: .*$/m, 'id: "P-0001"')
    .replace(/^title: .*$/m, 'title: "A task cut from the shipped template"')
    .replace(/^project: .*$/m, 'project: "p"')
    .replace(/^created: .*$/m, 'created: "2026-08-21"')
    .replace(/^serves: \[\]/m, `serves: ${servesValue}`)
    .replace(/^touches: \[\]/m, 'touches: ["src/**"]');
  return `---${head}\n---\n${READY_BODY}`;
}

function fixture(taskBody) {
  const repo = mkdtempSync(join(tmpdir(), "flow-serves-"));
  mkdirSync(join(repo, ".flow", "tasks"), { recursive: true });
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "VISION.md"), VISION);
  writeFileSync(join(repo, ".flow", "tasks", "0001-a.md"), taskBody);
  return join(repo, ".flow");
}
const cleanup = (flowDir) => rmSync(dirname(flowDir), { recursive: true, force: true });

test("a ready task cut from the shipped template resolves its serves against VISION.md", () => {
  const d = fixture(taskFromTemplate('["G1"]'));
  try {
    const r = runDoctor({ flowDir: d });
    assert.deepEqual(r.problems.filter((p) => /serves|VISION/i.test(p)), [],
      "flow-doctor cannot read `serves` out of the shipped template's frontmatter shape");
  } finally { cleanup(d); }
});

test("the reserved `maintenance` id resolves without VISION.md declaring it", () => {
  const d = fixture(taskFromTemplate('["maintenance"]'));
  try {
    const r = runDoctor({ flowDir: d });
    assert.deepEqual(r.problems.filter((p) => /serves|VISION/i.test(p)), [],
      "the template documents `maintenance` as always resolving, but flow-doctor rejects it");
  } finally { cleanup(d); }
});

test("the template's empty default is what flow-doctor flags on a ready task — the check is not vacuous", () => {
  const d = fixture(taskFromTemplate("[]"));
  try {
    const r = runDoctor({ flowDir: d });
    assert.ok(r.problems.some((p) => /ready with no serves/.test(p)),
      "a ready task left at the template's `serves: []` default passes flow-doctor — the field is " +
      "shipped in a form the check cannot see, so every task above would pass vacuously too");
  } finally { cleanup(d); }
});

// ── criterion 3: step 1 requires VISION.md, and says what to do when it is absent ──

test("the procedure's step 1 names VISION.md alongside _TEMPLATE.md and config.yml", () => {
  const step1 = skillSection("procedure").match(/1\..*?(?=\s2\.\s)/s)?.[0] ?? "";
  assert.match(step1, /_TEMPLATE\.md/, "step 1 no longer names _TEMPLATE.md");
  assert.match(step1, /config\.yml/, "step 1 no longer names .flow/config.yml");
  assert.match(step1, /VISION\.md/, "step 1 does not name VISION.md as required reading");
});

test("step 1 instructs the orchestrator to tell the human when there is no VISION.md", () => {
  const step1 = skillSection("procedure").match(/1\..*?(?=\s2\.\s)/s)?.[0] ?? "";
  assert.match(step1, /no `?VISION\.md`?|absent|if there is no/i,
    "step 1 does not handle the absent-VISION.md case at all");
  assert.match(step1, /tell|say so/i,
    "step 1 does not instruct the orchestrator to TELL the human — going quiet about an inactive " +
    "vision layer is the failure this line exists to prevent");
  assert.match(step1, /inactive|unanchored/i,
    "step 1 does not say what the absence means (the layer is inactive, the tasks are unanchored)");
});

// ── criterion 4: a step that sets `serves`, carrying the three-way test ──

test("the procedure has a step that sets `serves` after the acceptance criteria are written", () => {
  const proc = skillSection("procedure");
  const step = proc.match(/5\..*?(?=\s6\.\s)/s)?.[0] ?? "";
  assert.match(step, /serves/,
    "step 5 does not set `serves` — the field must be set once the criteria exist, not before");
  assert.match(step, /criteria/i,
    "step 5 does not tie setting `serves` to the acceptance criteria already being written");
});

test("the serves step states the three-way test instead of telling the orchestrator to pick a goal", () => {
  const step = skillSection("procedure").match(/5\..*?(?=\s6\.\s)/s)?.[0] ?? "";
  assert.match(step, /three/i, "the step does not present three options");
  assert.match(step, /maintenance/, "branch 1 (maintenance) is missing");
  assert.match(step, /amend|missing a goal/i, "branch 2 (the vision is missing a goal) is missing");
  assert.match(step, /drift/i, "branch 3 (drift being born) is missing");
  assert.match(step, /plausible/i,
    "the step does not forbid reaching for the nearest plausible id — without that it reads as " +
    "permission to fill the field with whatever fits");
});

// ── criterion 5: the readiness test extends to the goal ──

test("the readiness test asks whether a fresh session could name the served goal from the task alone", () => {
  const readiness = skillSection("readiness test");
  assert.match(readiness, /goal/i, "the readiness test never mentions the goal");
  assert.match(readiness, /fresh session|brand-new session/i,
    "the goal question is not posed from the fresh-session standpoint, which is what makes it a readiness test");
  assert.match(readiness, /from the task alone|didn't write down|in your head/i,
    "the readiness test does not make the point that an anchor held only by this session dies with it");
});

// ── criterion 6: pre-flight checks serves mechanically, and defers to the doctor ──

test("pre-flight includes a mechanical `serves`-resolves check", () => {
  const preflight = skillSection("pre-flight");
  assert.match(preflight, /serves/, "pre-flight has no `serves` item at all");
  assert.match(preflight, /VISION\.md/, "the pre-flight serves check does not resolve ids against VISION.md");
  assert.match(preflight, /don't recall|check the id|against the file/i,
    "the pre-flight serves check is not mechanical — recalling an id is exactly what it must forbid");
});

test("pre-flight flags a mostly-maintenance batch to the human", () => {
  const preflight = skillSection("pre-flight");
  assert.match(preflight, /mostly.{0,20}maintenance|maintenance.{0,40}batch/i,
    "pre-flight does not mention a batch that is mostly `maintenance`");
  assert.match(preflight, /before you save|say so/i,
    "pre-flight does not require saying so to the human before saving");
});

test("pre-flight names flow-doctor as the backstop rather than restating its rules", () => {
  const preflight = skillSection("pre-flight");
  assert.match(preflight, /flow-doctor/, "pre-flight no longer names flow-doctor");
  assert.match(preflight, /backstop/i,
    "pre-flight does not frame the doctor as the BACKSTOP — the checklist is the method, the doctor is the net");
  assert.match(preflight, /don't restate|owns those rules|don't argue/i,
    "pre-flight does not say the doctor owns the rules, so the skill will drift into duplicating them");
});

// ── criterion 7: triage carries serves in both directions ──

test("the triage Propose lane includes `serves` in the proposed spec", () => {
  const triage = skillSection("triaging the inbox");
  const propose = triage.match(/- \*\*Propose\*\*.*?(?=- \*\*Convert\*\*)/s)?.[0] ?? "";
  assert.ok(propose, "the Propose lane is no longer findable in the triage section");
  assert.match(propose, /serves/,
    "a proposed spec does not include `serves` — the anchor would be added only after the human approved");
});

test("the triage close lane cites 'no goal serves it' as a valid reason", () => {
  const triage = skillSection("triaging the inbox");
  assert.match(triage, /no goal serves it/i,
    "the close-with-one-line-saying-why lane does not offer 'no goal serves it' as a citable reason");
});

// ── criterion 8: the Don't list forbids retrofitting ──

test("the Don't list forbids retrofitting `serves` onto in-flight or finished tasks", () => {
  const donts = skillSection("don't");
  assert.match(donts, /retrofit|back-?fill/i, "the Don't list does not forbid retrofitting `serves`");
  assert.match(donts, /serves/, "the retrofit prohibition does not name `serves`");
  assert.match(donts, /in_progress|in flight|in_review|done/i,
    "the prohibition does not name the statuses it applies to, so it reads as advice rather than a rule");
});

test("the retrofit prohibition explains why, so it survives someone deciding it looks untidy", () => {
  assert.match(skillFlat, /inventing a history|drift/i,
    "the Don't entry gives no reason — an unexplained rule about tidiness is the first one dropped");
});
