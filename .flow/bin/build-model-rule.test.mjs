// build-model-rule.test.mjs — pins the text of flow-0228's rules.
import { readFileSync } from "node:fs";
import { changelogEntry } from "./changelog-entry.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const proto = read("project-template/.flow/PROTOCOL.md");
const flat = (s) => s.replace(/\s+/g, " ");

const step4 = flat(proto.slice(proto.indexOf("4. **Build.**"), proto.indexOf("5. **Gate**")));
const hygiene = flat(proto.slice(proto.indexOf("**Trip conditions"), proto.indexOf("**What is not a trip condition")));

test("step 4 hands the build to a subagent on the task's tier and effort", () => {
  for (const p of ["task-model.mjs resolve --task-id", "unset means `sonnet` / `medium`",
    "one subagent on the task's tier and effort", "Agent tool", "`model` set to the tier name",
    "`effort` set to the task's effort", "keeps steps 1 to 3", "steps 7 to 8", "`fyi` ask"]) {
    assert.ok(step4.includes(p), `missing: ${p}`);
  }
});

test("step 4 overrides host defaults and is not the forbidden review subagent", () => {
  assert.ok(step4.includes("overrides any host default against starting subagents"));
  assert.ok(step4.includes("not the review subagent"));
});

test("session hygiene trips on a second task and says what to do", () => {
  assert.ok(hygiene.includes("asked to build a second task"));
  assert.ok(hygiene.includes("start one for the next task"));
  assert.ok(hygiene.includes("tell the human in one line"));
  assert.ok(hygiene.includes("with a PR already open, asked for more work"));
});

test("task-writer says the model field is honoured by any builder", () => {
  const t = flat(read("project-template/.claude/skills/task-writer/SKILL.md"));
  assert.ok(t.includes("honoured whoever builds the task"));
  assert.ok(t.includes("subagent on that model"));
});

test("canonical CLAUDE.md says a build subagent is required", () => {
  const t = flat(read("CLAUDE.md"));
  assert.ok(t.includes("A build subagent on the task's model is the opposite case and is required, not forbidden"));
});

test("changelog entry exists", () => {
  assert.ok(changelogEntry(root, "flow-0228").includes("flow-0228"));
});
