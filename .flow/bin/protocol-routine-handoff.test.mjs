// protocol-routine-handoff.test.mjs — proving tests for flow-0172's criteria.
//
// A Claude Code cloud routine can run the whole worker loop except the two steps that go through
// GraphQL: `gh pr create` (step 7) and `gh pr ready` (step 8). flow-0172 writes the REST
// replacements into PROTOCOL.md and adds docs/flow-routines.md, the setup a human follows. Prose
// has no natural failure mode, so these give it one.
//
// Canonical-only by placement: it reads project-template/ and docs/, which an adopting repo does
// not have (see adopter-layout.test.mjs).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROTOCOL = readFileSync(join(REPO, "project-template", ".flow", "PROTOCOL.md"), "utf8");
const ROUTINES = readFileSync(join(REPO, "docs", "flow-routines.md"), "utf8");

// Collapse line wrapping so a phrase can be matched however the paragraph is filled.
const flat = (s) => s.replace(/\s+/g, " ");
// The text of numbered step `n` of "The loop you run", up to step n+1 (or the next section).
function step(n) {
  const loop = PROTOCOL.slice(PROTOCOL.indexOf("## The loop you run"));
  const end = loop.indexOf("\n## ", 4);
  const body = loop.slice(0, end === -1 ? undefined : end);
  const start = body.indexOf(`\n${n}. `);
  assert.notEqual(start, -1, `the loop has no step ${n}`);
  const next = body.indexOf(`\n${n + 1}. `, start);
  return flat(body.slice(start, next === -1 ? undefined : next));
}

// ── criterion 1: step 8 names both hand-offs and says which applies in a cloud session ──

test("step 8 names gh pr ready and the ccr/ready_for_review REST route", () => {
  const s = step(8);
  assert.match(s, /`gh pr ready`/, "step 8 must still name `gh pr ready`");
  assert.match(s, /POST repos\/\{owner\}\/\{repo\}\/pulls\/\{n\}\/ccr\/ready_for_review/,
    "step 8 must name POST repos/{owner}/{repo}/pulls/{n}/ccr/ready_for_review");
});

test("step 8 says the REST hand-off is for a Claude Code cloud session, keyed on the GraphQL 403", () => {
  const s = step(8);
  assert.match(s, /Claude Code cloud session/, "step 8 must say which session the REST route is for");
  assert.match(s, /GitHub GraphQL is not available from Claude Code sessions/,
    "step 8 must quote the 403 text that is the signal to fall back");
  assert.match(s, /try the `gh pr` command first/i,
    "step 8 must write down which way the worker tells the cases apart (try first, then fall back)");
});

// ── criterion 2: step 7 names the REST route for opening a PR ──

test("step 7 names repos/{owner}/{repo}/pulls for opening a PR without GraphQL", () => {
  const s = step(7);
  assert.match(s, /gh api repos\/\{owner\}\/\{repo\}\/pulls /, "step 7 must name the REST pulls route");
  assert.match(s, /without GraphQL/, "step 7 must say when that route applies");
  assert.match(s, /no PR exists for the branch yet/, "step 7 must say it only opens one when none exists");
});

// ── criterion 3: a worker started with no task id picks, and stops on empty ──

test("the loop says a worker with no task id runs pick-task.mjs and stops on an empty result", () => {
  const s = step(1);
  assert.match(s, /without a task id/i);
  assert.match(s, /node \.flow\/bin\/pick-task\.mjs/);
  assert.match(s, /empty result means stop/);
});

// ── criterion 4: docs/flow-routines.md, one assertion each ──

test("flow-routines.md holds the saved prompt in a fenced block, pointing at the protocol", () => {
  const fenced = [...ROUTINES.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const prompt = fenced.find((b) => /\.flow\/PROTOCOL\.md/.test(b) && /pick-task\.mjs/.test(b));
  assert.ok(prompt, "no fenced block holds a saved prompt naming .flow/PROTOCOL.md and pick-task.mjs");
});

test("flow-routines.md says to attach no connectors", () => {
  assert.match(flat(ROUTINES), /Attach no connectors/i);
});

test("flow-routines.md states the hourly scheduling limit", () => {
  assert.match(flat(ROUTINES), /no more often than \*\*hourly\*\*/);
});

test("flow-routines.md states one routine per model tier", () => {
  assert.match(flat(ROUTINES), /One routine per model tier/i);
});
