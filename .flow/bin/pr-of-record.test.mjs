// pr-of-record.test.mjs — flow-0162: the adapter, and the structural proof that all three
// decision points (open-pr, status sync, escalation) call the guard against origin/main.
// The pure logic is proved in project-template/.flow/bin/pr-of-record.test.mjs.
//
// Mutation map — removing the guard from: _flow-open-pr.yml -> "open-pr passes --record-pr…"
// and "…reads pr: from origin/main"; the status transition -> "status sync guards before any
// edit is written"; the escalation step -> "escalation step applies the same check".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prOfRecord, main } from "./pr-of-record.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const wf = (n) => readFileSync(join(REPO, ".github/workflows", n), "utf8");

test("adapter re-exports the template's logic", () => {
  assert.equal(prOfRecord({ prField: "#5", recordState: "OPEN", eventPr: 6 }).verdict, "foreign");
  assert.equal(main([]).code, 0);
});

const GUARD = /node \.flow\/bin\/pr-of-record\.mjs --id "\$id" --event-pr "\$PR_NUM"/;

test("status sync guards before any edit is written, and exits 0 on foreign", () => {
  const s = wf("_flow-status.yml");
  const guard = s.search(GUARD);
  assert.ok(guard > 0, "transition step calls pr-of-record");
  assert.ok(guard < s.indexOf("> .flow/board-edits.json"), "guard precedes the first edits write");
  assert.match(s.slice(s.lastIndexOf("git fetch -q origin main", guard), guard), /git fetch -q origin main/);
  assert.match(s.slice(guard, guard + 200), /\[ "\$rc" = "3" \]; then exit 0/);
});

test("escalation step applies the same check before task-model escalate", () => {
  const s = wf("_flow-status.yml");
  const step = s.slice(s.indexOf("- name: Escalate the model of a task whose PR closed unmerged"));
  const guard = step.search(GUARD);
  assert.ok(guard > 0, "escalation step calls pr-of-record");
  assert.ok(guard < step.indexOf("task-model.mjs escalate"), "guard precedes escalate");
  assert.match(step.slice(guard, guard + 200), /\[ "\$rc" = "3" \]; then exit 0/);
});

test("every workflow step that calls pr-of-record gives gh a token", () => {
  for (const name of ["_flow-status.yml", "_flow-open-pr.yml"]) {
    const s = wf(name);
    const steps = s.split(/\n      - (?=name:|uses:)/).filter((st) => st.includes("node .flow/bin/pr-of-record.mjs"));
    assert.ok(steps.length > 0, `${name} calls pr-of-record`);
    for (const st of steps) {
      const env = st.slice(0, st.indexOf("run: |"));
      assert.match(env, /\n {10}GH_TOKEN: \$\{\{ github\.token \}\}/, `${name}: ${st.split("\n")[0]} sets GH_TOKEN`);
    }
  }
  assert.equal(wf("_flow-status.yml").split(/\n      - (?=name:|uses:)/).filter((st) => st.includes("node .flow/bin/pr-of-record.mjs")).length, 2,
    "both _flow-status.yml guard steps are checked");
});

test("open-pr passes --record-pr, read from origin/main by pr-of-record", () => {
  const s = wf("_flow-open-pr.yml");
  assert.match(s, /--record-pr "\$record_pr"/);
  const fetch = s.indexOf("git fetch -q origin main");
  const call = s.indexOf("node .flow/bin/pr-of-record.mjs --id");
  assert.ok(fetch > 0 && call > fetch, "origin/main is fetched before pr-of-record reads pr:");
  assert.ok(call < s.indexOf("node .flow/bin/flow-open-pr.mjs"), "record computed before the decision");
  assert.doesNotMatch(s, /^pr:/m);
});
