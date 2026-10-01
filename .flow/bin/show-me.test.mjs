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

test("the PR description order is TL;DR, visual, criteria checklist, to-dos", () => {
  const pr = responseStyle.slice(responseStyle.indexOf("PR description"));
  const order = ["TL;DR", "visual", "criteria checklist", "to-dos"].map((w) => pr.indexOf(w));
  assert.ok(order.every((i) => i >= 0), `PR description must mention each part: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "PR description parts out of order");
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
