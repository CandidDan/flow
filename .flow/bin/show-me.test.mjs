// flow-0117: the "show, don't tell" response rule and the show-me skill it points at.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE = join(REPO, "project-template");
const SKILL_PATH = ".claude/skills/show-me/SKILL.md";
const read = (p) => readFileSync(join(TEMPLATE, p), "utf8");

const protocol = read(".flow/PROTOCOL.md");
const responseStyle = protocol.split(/^## /m).find((s) => s.startsWith("Response style"));

test("the response-style section requires visuals for structured content and names the skill", () => {
  assert.ok(responseStyle, "PROTOCOL.md has no Response style section");
  assert.match(responseStyle, /Show, don't tell/);
  assert.match(responseStyle, /fewest words/);
  assert.match(responseStyle, /structure[\s\S]*visual/);
  assert.ok(responseStyle.includes(SKILL_PATH), `response style must name ${SKILL_PATH}`);
});

test("the response TL;DR is conditional on length, not always", () => {
  assert.doesNotMatch(protocol, /always TL;DR/);
  assert.doesNotMatch(responseStyle, /even short ones/);
  assert.match(responseStyle, /TL;DR\*\* only when it runs past about 15 lines/);
});

test("the PR description order is TL;DR, visual, captures, criteria checklist, to-dos", () => {
  const pr = responseStyle.slice(responseStyle.indexOf("**PR description**"));
  const parts = ["TL;DR", "visual", "captures", "criteria checklist", "to-dos"];
  const order = parts.map((w) => pr.indexOf(w));
  assert.ok(order.every((i) => i >= 0), `PR description must mention each part: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "PR description parts out of order");
});

// flow-0221: the captures part is always present; captures or a stated `Not captured:` line.
const flatResponseStyle = responseStyle.replace(/\s+/g, " ");
const prOrder = flatResponseStyle.slice(flatResponseStyle.indexOf("**PR description**"));

test("PROTOCOL: the captures part is always present, with Not captured as the alternative, and no run condition", () => {
  assert.match(prOrder, /The captures part is always present\./);
  assert.match(prOrder, /otherwise it is one `Not captured: <reason>` line/);
  assert.doesNotMatch(prOrder, /session can run it/);
  assert.ok(prOrder.includes("`show-me`'s `## Captures`"), "the captures clause must point at show-me");
});

test("PROTOCOL: captures cover a change to what a person sees and to what happens when they act", () => {
  assert.match(prOrder, /when the change alters what a person sees or what happens to them when they act/);
});

// flow-0141: captures in the PR description, and the show-me procedure for them.
const skill = read(SKILL_PATH);
const section = (name) => {
  const s = skill.split(/^## /m).find((x) => x.startsWith(`${name}\n`));
  assert.ok(s, `show-me SKILL.md has no ## ${name} section`);
  return s;
};

test("show-me's PR description lists Captures as step 3, and a Captures section exists", () => {
  const steps = [...section("PR description").matchAll(/^(\d+)\. \*\*([^*]+)\*\*/gm)];
  assert.deepEqual(
    steps.map((m) => [Number(m[1]), m[2]]),
    [[1, "TL;DR"], [2, "The change, shown"], [3, "Captures"], [4, "Criteria"], [5, "To-dos for the human"]],
  );
  section("Captures");
});

test("show-me's Captures section states its condition, branch, SHA links, skip line, data and tooling rules", () => {
  const c = section("Captures").replace(/\s+/g, " ");
  // the orphan branch, and never the feature branch
  assert.match(c, /orphan branch named `captures\/<task-id>`/);
  assert.match(c, /never go on the feature branch/);
  // links pinned to a commit SHA
  assert.match(c, /link by that commit's SHA/);
  assert.match(c, /blob\/<sha>\/[^)\s]+\?raw=true/);
  // the stated skip
  assert.match(c, /Not captured: <reason>/);
  // synthetic data only
  assert.match(c, /Synthetic data only/);
  // the tool is never a repo dependency
  assert.match(c, /Never add it to the repo's dependencies/);
});

test("the show-me skill has frontmatter and covers the core formats", () => {
  const skill = read(SKILL_PATH);
  const front = skill.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(front, "show-me SKILL.md has no frontmatter");
  assert.match(front[1], /^name: show-me$/m);
  assert.match(front[1], /^description: \S/m);
  for (const fmt of ["Table", "Tree", "Call stack", "Mermaid", "Diff"]) {
    assert.match(skill, new RegExp(`^### ${fmt}$`, "m"), `show-me skill missing a ${fmt} example`);
  }
});

test("AGENTS.md names the show-me skill path", () => {
  assert.ok(read("AGENTS.md").includes(SKILL_PATH), `AGENTS.md must name ${SKILL_PATH}`);
});

test("protocol and skill both say terse is not cryptic, and the skill lists over-terse anti-patterns", () => {
  assert.match(responseStyle, /Terse is not cryptic/);
  const skill = read(SKILL_PATH);
  assert.match(skill, /Terse is not cryptic/);
  const anti = skill.slice(skill.indexOf("## Anti-patterns"));
  assert.match(anti, /Too much:/);
  assert.match(anti, /Too little:[\s\S]*jargon/);
});

// flow-0168: the plain-language rule covers everything written about the work, not only replies.
const flatStyle = responseStyle.replace(/\s+/g, " ");

test("Response style requires plain, unambiguous English in specs, comments, commits and PRs", () => {
  assert.match(flatStyle, /Plain, literal, unambiguous English — in everything written about the work/);
  for (const kind of ["task specs", "intents", "design notes", "code comments", "commit messages", "PR descriptions"]) {
    assert.ok(flatStyle.includes(kind), `the plain-language rule must cover ${kind}`);
  }
  assert.match(flatStyle, /Name things literally, never by metaphor/);
  assert.match(flatStyle, /A sentence that can be read two ways gets rewritten/);
  assert.match(flatStyle, /\| Bad \| Good \|/, "the rule carries one bad/good example");
});

test("Response style puts a product's own user-facing text out of scope of the plain-language rule", () => {
  assert.match(flatStyle, /Out of scope: the product's own user-facing text\. Its voice is the project's decision\./);
});

test("Response style still says terse is not cryptic after the plain-language rule was added", () => {
  assert.match(flatStyle, /Terse is not cryptic: plain words, full sentences, no unexplained jargon\./);
});

test("show-me rule 6 points at the protocol's plain-language rule", () => {
  const rule6 = read(SKILL_PATH).match(/^6\. \*\*Terse is not cryptic\.\*\*[\s\S]*?(?=\n\n)/m);
  assert.ok(rule6, "show-me has no rule 6");
  assert.match(rule6[0].replace(/\s+/g, " "), /protocol's plain-language rule \(`\.flow\/PROTOCOL\.md`, \*\*Response style\*\*\)/);
});

test("task-writer requires a spec to name things literally, not by metaphor", () => {
  const tw = read(".claude/skills/task-writer/SKILL.md");
  const procedure = tw.slice(tw.indexOf("## Procedure"), tw.indexOf("## Triaging")).replace(/\s+/g, " ");
  assert.match(procedure, /\*\*Write the spec in plain, literal language\.\*\* Name things literally, not by metaphor/);
  assert.match(procedure, /rewrite any sentence that can be read two ways/);
});

// flow-0206: a PR description opens with the problem it fixes, in words a stranger understands.
test("Response style defines the PR TL;DR as the first paragraph with four requirements", () => {
  assert.match(flatStyle, /A PR description's \*\*TL;DR is its first paragraph\*\*/);
  assert.match(flatStyle, /says what was wrong or missing, and what is different after the merge, and for whom/);
  assert.match(flatStyle, /reads correctly to a person who has not read the code or the task/);
  assert.match(flatStyle, /contains no backticks, no file paths, no task ids and no code names/);
  assert.match(flatStyle, /is at most 60 words/);
});

test("the PR #285 bad/good row exists and its good text meets requirement 3 and the word limit", () => {
  const row = responseStyle.split("\n").find((l) => l.includes("A Flow sync was deleting settings"));
  assert.ok(row, "the PR #285 bad/good row is missing");
  const cells = row.split(/\s\|\s/).map((c) => c.replace(/^\|\s*|\s*\|$/g, "").trim());
  assert.equal(cells.length, 2, "row must have a bad cell and a good cell");
  assert.match(cells[0], /carry-inputs/, "bad cell must be the original TL;DR");
  const good = cells[1].replace(/^"|"$/g, "");
  assert.doesNotMatch(good, /`/, "good text has a backtick");
  assert.doesNotMatch(good, /\//, "good text has a file path");
  assert.doesNotMatch(good, /\bflow-\d+\b/i, "good text has a task id");
  assert.doesNotMatch(good, /\.m?js\b|\(\)|_|--/, "good text has a code name");
  assert.ok(good.split(/\s+/).length <= 60, "good text exceeds 60 words");
});

test("show-me rule 6 points at the PR TL;DR requirements without copying them", () => {
  const rule6 = read(SKILL_PATH).match(/^6\. \*\*Terse is not cryptic\.\*\*[\s\S]*?(?=\n\n)/m)[0].replace(/\s+/g, " ");
  assert.match(rule6, /PR TL;DR requirements/);
  assert.doesNotMatch(rule6, /60 words/);
});

// flow-0221: the Captures section is always present, covers felt changes, and a reason is required.
const captureRow = (name) => {
  const row = section("Captures").split("\n").find((l) => l.startsWith(`| **${name}** |`));
  assert.ok(row, `show-me ## Captures has no ${name} row`);
  return row;
};

test("show-me Captures When row: always present, default for seen or felt changes, old exemptions gone", () => {
  const when = captureRow("When");
  assert.match(when, /The section is always present in a PR description\./);
  assert.match(when, /to what a person sees \(screen, rendered page, email, SMS, generated visual\)/);
  assert.match(when, /to what happens to them when they act/);
  const c = section("Captures").replace(/\s+/g, " ");
  assert.ok(!c.includes("Not for backend, infra, docs or tooling-only diffs"), "old exemption still present");
  assert.ok(!c.includes("the session can run it"), "old run condition still present");
});

test("show-me Captures What row: a before/after table of real responses from base and head is the capture when no screen shows it", () => {
  const what = captureRow("What");
  assert.match(
    what,
    /For a change no screen shows yet, the capture is a before\/after table of real responses, made by running the same request or test against the base commit and the PR head\./,
  );
  assert.match(what, /before\/after when an existing screen changed, and after only for a new one/);
});

test("show-me skip line: the reason names what is missing, and an empty reason or n/a is not a reason", () => {
  const c = section("Captures").replace(/\s+/g, " ");
  assert.match(c, /The reason names what is missing or why nothing is visible/);
  assert.match(c, /A stated reason is what the reviewer can disagree with, so an empty reason or "n\/a" is not a reason\./);
  assert.match(c, /no visible change · no runnable preview · no browser in the environment/);
});
