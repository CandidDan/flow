// vision-template.test.mjs — proving tests for the shipped vision artefacts (flow-0011).
//
// Two documents with no natural failure mode. `project-template/VISION.md` is the shape every
// adopting repo starts from: if its headings drift out of the form flow-doctor's regex reads,
// the check goes quiet and every downstream repo's `serves` field silently stops being verified
// — a green gate that checked nothing, which is the exact failure the vision layer exists to
// prevent. And `vision-writer/SKILL.md` is the procedure that fills it in: the rules that make
// evolution distinguishable from drift (append-only ids, retire-don't-delete, branch + PR) are
// load-bearing precisely because nothing enforces them at runtime — the skill text IS the
// enforcement, so it needs a test that fails when a rule goes missing.
//
// Criteria proved here (flow-0011): all of them except the final gate-passes criterion, which
// the gate proves by running.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { parseVisionGoals } from "../../project-template/.flow/bin/flow-doctor.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");

const VISION = readFileSync(join(TEMPLATE, "VISION.md"), "utf8");
const SKILL = readFileSync(join(TEMPLATE, ".claude/skills/vision-writer/SKILL.md"), "utf8");
const SAMPLE_TASK = readFileSync(join(TEMPLATE, ".flow/tasks/0001-newsletter-signup.md"), "utf8");

// Every id the template *intends* to declare, and what it intends each to be. Written out
// literally rather than derived from the file, so a heading that stops parsing shows up as a
// missing id instead of quietly shrinking both sides of the comparison to nothing.
const INTENDED = [
  { id: "G1", kind: "goal", retired: false },
  { id: "G2", kind: "goal", retired: false },
  { id: "G3", kind: "goal", retired: true },      // the worked example under ## Retired
  { id: "NG1", kind: "non-goal", retired: false },
  { id: "NG2", kind: "non-goal", retired: false },
];

// Read the skill as one whitespace-normalised string: these assertions are about whether a rule
// is *stated*, and a rule must not stop being findable because a sentence was rewrapped.
const skillFlat = SKILL.replace(/\s+/g, " ");

// The named section of the skill, so "the create-mode procedure says X" can't be satisfied by
// the same sentence appearing in the amend-mode section (or the other way round).
function skillSection(heading) {
  const lines = SKILL.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## ") && l.toLowerCase().includes(heading));
  assert.notEqual(start, -1, `vision-writer SKILL.md has no "## …${heading}…" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join(" ").replace(/\s+/g, " ");
}

// ── criterion 1: the template carries the required structure, in exactly the required form ──

test("VISION.md declares at least one goal and one non-goal in the `### G<n> — ` form", () => {
  const goalHeads = VISION.split("\n").filter((l) => /^###\s+G\d+\s*[—–-]\s*\S/.test(l));
  const nonGoalHeads = VISION.split("\n").filter((l) => /^###\s+NG\d+\s*[—–-]\s*\S/.test(l));
  assert.ok(goalHeads.length >= 1, "no `### G<n> — <title>` goal heading — nothing can serve this vision");
  assert.ok(nonGoalHeads.length >= 1, "no `### NG<n> — <title>` non-goal heading — the half that does the rejecting is missing");
});

test("VISION.md has a ## Retired section and a change-log table with dated rows", () => {
  assert.match(VISION, /^##\s+Retired\s*$/m,
    "no `## Retired` section — retiring a goal would have nowhere to go but deletion, and ids must stay reserved");
  assert.match(VISION, /^##\s+Change log\s*$/m, "no `## Change log` section");
  const rows = VISION.split("\n").filter((l) => /^\|\s*(<YYYY-MM-DD>|\d{4}-\d{2}-\d{2})\s*\|/.test(l));
  assert.ok(rows.length >= 1,
    "the change-log table has no dated row — an amendment with nowhere to record itself is drift by default");
  assert.match(VISION, /^\|\s*Date\s*\|\s*Change\s*\|\s*Why\s*\|/m, "change-log table is missing the Date | Change | Why header");
});

test("VISION.md documents the append-only id rules it depends on", () => {
  const flat = VISION.replace(/\s+/g, " ");
  assert.match(flat, /[Nn]ever renumber/, "the never-renumber rule is not stated");
  assert.match(flat, /[Nn]ever reuse/, "the never-reuse rule is not stated");
  assert.match(flat, /reserved/, "retired ids staying reserved is not stated");
});

// ── criterion 2: flow-0010's extraction regex reads the shipped shape, and misses nothing ──

test("flow-0010's goal-id regex extracts every intended id from the template, and none is malformed", () => {
  const { goals, malformed } = parseVisionGoals(VISION);
  assert.deepEqual(malformed, [],
    `a heading looks like a goal but does not parse — it would vanish from the check: ${malformed.join(" / ")}`);
  assert.deepEqual([...goals.keys()].sort(), INTENDED.map((g) => g.id).sort(),
    "the ids the template intends to declare and the ids the checker extracts disagree");
  for (const want of INTENDED) {
    const got = goals.get(want.id);
    assert.equal(got.kind, want.kind, `${want.id} should be a ${want.kind}`);
    assert.equal(got.retired, want.retired, `${want.id} retired flag should be ${want.retired}`);
    assert.ok(got.title.trim().length > 0, `${want.id} has an empty title — the regex requires one`);
  }
});

// ── criterion 3: the sample task's `serves` resolves against the shipped vision ──

test("the sample task serves a goal id that VISION.md actually declares", () => {
  const serves = [...(SAMPLE_TASK.match(/^serves:\s*\[([^\]]*)\]/m)?.[1] ?? "").matchAll(/["']([^"']+)["']/g)]
    .map((m) => m[1]);
  assert.ok(serves.length >= 1, "the sample task declares no `serves` — with a VISION.md present, flow-doctor fails it as ready");
  const { goals } = parseVisionGoals(VISION);
  for (const id of serves) {
    const goal = goals.get(id.toUpperCase());
    assert.ok(goal, `sample task serves "${id}", which VISION.md does not declare`);
    assert.equal(goal.kind, "goal", `sample task serves "${id}", which is a non-goal`);
    assert.equal(goal.retired, false, `sample task serves "${id}", which is retired`);
  }
});

// ── criterion 4: the shipped fixture is self-consistent under the template's own doctor ──
//
// The CLI is run for real rather than through runDoctor(), because the fixture's self-consistency
// is a property of how it ships, not of how a test wires it up. It cannot yet exit 0: the
// template's config.yml ships `source_roots: [{ path: "REPLACE-ME/" }]` on purpose — a
// placeholder an adopting repo fills in — and a declared root that isn't on disk is a
// flow-doctor PROBLEM. That failure predates this task and fixing it (by naming a real tree in
// the shipped template) would defeat the placeholder. So the assertion is the strongest one that
// is true and still catches what this task could break: the placeholder is the ONLY problem, and
// nothing about the vision layer is among them.
test("the template store's only flow-doctor problem is the REPLACE-ME source_root placeholder", () => {
  let stdout = "", stderr = "";
  try {
    stdout = execFileSync(process.execPath, [join(TEMPLATE, ".flow/bin/flow-doctor.mjs")],
      { encoding: "utf8", cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    stdout = e.stdout?.toString() ?? "";
    stderr = e.stderr?.toString() ?? "";
  }
  assert.match(stdout, /flow-doctor: \d+ task\(s\) checked/, "flow-doctor produced no report");

  const problems = stderr.split("\n").filter((l) => l.includes("FAIL")).map((l) => l.trim());
  const unexpected = problems.filter((p) => !/source_root "REPLACE-ME\//.test(p));
  assert.deepEqual(unexpected, [],
    `the shipped fixture is not self-consistent — problems beyond the known config placeholder:\n${unexpected.join("\n")}`);
  assert.deepEqual(problems.filter((p) => /VISION|serves/i.test(p)), [],
    "the vision layer reports a problem against the shipped fixture");

  // The vision layer is ACTIVE over the fixture — the inactive-layer warning must be gone, which
  // is what proves the checks above ran against something rather than passing vacuously.
  assert.doesNotMatch(stderr, /no VISION\.md at the repo root/,
    "the template ships a VISION.md, so flow-doctor must no longer report the vision layer inactive");
});

// ── criteria 5–7: what the skill's create mode and output step must require ──

test("create mode requires the audience to be recorded as a decision, including the multi-user option", () => {
  const create = skillSection("create mode");
  assert.match(create, /audience/i, "create mode never mentions the audience");
  assert.match(create, /decision, not an assumption|as a decision/i,
    "create mode does not require the audience to be recorded as a DECISION");
  assert.match(create, /preserved/i, "create mode does not name the preserved option");
  assert.match(create, /foreclosed/i, "create mode does not name the foreclosed option");
  assert.match(create, /multi-user|second user/i, "create mode does not put the multi-user question explicitly");
});

test("create mode asks the interview questions the task requires", () => {
  const create = skillSection("create mode");
  assert.match(create, /who (is )?it (is )?for|who is this for/i, "no 'what is this and who for' question");
  assert.match(create, /three to six|3[–-]6/i, "the 3–6 outcomes question is not bounded");
  assert.match(create, /under-supply/i,
    "non-goals are not pushed on explicitly — the reason humans under-supply them is why the push exists");
  assert.match(create, /six weeks/i, "no 'what would off course look like in six weeks' question");
});

test("the skill states the retrofit warning as an instruction, not an aside", () => {
  assert.match(skillFlat, /write the vision the human intends, not a description of what the repo currently is/i,
    "the retrofit warning is missing or reworded — it must be an instruction");
  assert.match(skillFlat, /[Dd]o not read the code to derive goals/,
    "the retrofit section does not forbid deriving goals from the code");
});

test("the skill states the rejection test as an instruction, not an aside", () => {
  assert.match(skillFlat, /could a stranger/i, "the rejection test is not posed");
  assert.match(skillFlat, /reject a plausible-but-wrong feature idea/i, "the rejection test is not stated in full");
  assert.match(skillFlat, /sharpen/i, "the rejection test names no remedy for failing it");
});

test("the output step requires a branch and an [vision] PR and forbids committing to main", () => {
  const out = skillSection("output");
  assert.match(out, /branch/i, "the output step does not require a branch");
  assert.match(out, /\[vision\]/, "the output step does not require the `[vision] …` PR title");
  assert.match(out, /never commit it directly to `main`|never.{0,40}directly to `main`/i,
    "the output step does not forbid committing VISION.md straight to main");
});

// ── criterion 8: the amend-mode rules that make drift distinguishable from evolution ──

test("amend mode states the append-only, retire, promote and change-log rules", () => {
  const amend = skillSection("amend mode");
  assert.match(amend, /append-only/i, "amend mode does not say ids are append-only");
  assert.match(amend, /[Nn]ever renumber/, "amend mode does not forbid renumbering");
  assert.match(amend, /[Nn]ever reuse/, "amend mode does not forbid reusing an id");
  assert.match(amend, /Retiring is a move, not a delete/i,
    "amend mode does not say retiring moves the goal to Retired rather than deleting it");
  assert.match(amend, /reason/i, "retiring does not require a reason");
  assert.match(amend, /reserved/i, "amend mode does not say a retired id stays reserved");
  assert.match(amend, /[Pp]romoting a non-goal is not an edit in place/,
    "amend mode does not forbid converting an NG heading into a G heading in place");
  assert.match(amend, /[Rr]etire the `NG<n>` id/, "promotion does not require retiring the NG id");
  assert.match(amend, /[Ee]very material edit appends a change-log row/,
    "amend mode does not require a change-log row on every material edit");
});

test("the skill's frontmatter names it and describes when to use it", () => {
  assert.match(SKILL, /^---\nname: vision-writer\n/, "SKILL.md must open with `name: vision-writer` frontmatter");
  const desc = SKILL.match(/^description: (.+)$/m)?.[1] ?? "";
  assert.ok(desc.length > 80, "the description is what makes the skill discoverable — it must say when to use it");
});
