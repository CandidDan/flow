// triage-allocate-id.test.mjs — the triage sweep may not choose a task id (flow-0110).
//
// WHAT WENT WRONG. On 2026-09-30 a local session allocated flow-0104 and flow-0105 through
// `allocate-task-id.mjs`, and forty seconds later the scheduled triage run committed its own
// flow-0104 and flow-0105. Nothing was refused: two tasks sharing an id have DIFFERENT filenames,
// so the pushes rebased cleanly and `main` simply held two files per id. flow-doctor found it
// afterwards, which meant every branch cut from `main` went red on a defect none of their authors
// could fix from a branch.
//
// WHY THE PROMPT WAS THE BUG. Step 3 said "create the ready task file in .flow/tasks/ with the
// next id ... commit it to main". The model therefore picked the id out of its own checkout, and
// that is the one allocation path with no arbiter: `allocate-task-id.mjs --write` is first-push-
// wins precisely because it RE-READS the store and re-allocates after a refused push, and triage
// never called it. Every triage run that overlaps a human session could repeat this.
//
// WHY THESE ASSERTIONS ARE ABOUT WORDING. The fix is prompt text, so the test has to be too —
// there is no function to call. That makes the phrasing load-bearing, which is a real cost, so
// each assertion below is pinned to the smallest phrase that carries the MEANING (the command,
// the prohibition, "the id the allocator printed") rather than to a sentence, and every failure
// message says what the wording is protecting so a rewording can be made deliberately.
//
// TEXT SCANNING, not YAML parsing, for everything that can be: the `flow-tooling` job in
// `_flow-gates.yml` runs `node --test .flow/bin/*.test.mjs` with no install step before it, so
// `yaml` is not importable there and a top-level `import yaml` would take the whole file down.
// The prompt block is therefore cut out of the source by indentation; ONE test, skipped when
// `yaml` is absent, proves that cut equals what a YAML parser reads, so the cheap extraction
// cannot quietly stop describing the real document.
//
// Canonical-only by location: it lives in `.flow/bin/`, not `project-template/.flow/bin/`, so
// flow-sync never copies it into a repo that has no reusable workflows to test.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { changelogEntry } from "./changelog-entry.mjs";
import test from "node:test";

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const REPO = resolve(import.meta.dirname, "..", "..");
const TRIAGE = join(REPO, ".github", "workflows", "_flow-triage.yml");
const GATES = join(REPO, ".github", "workflows", "_flow-gates.yml");
const TEMPLATE_BIN = join(REPO, "project-template", ".flow", "bin");

const triage = readFileSync(TRIAGE, "utf8");
const gates = readFileSync(GATES, "utf8");

// The helper this task is about, and the module it imports. Both must survive the sparse
// checkout the workflow performs, which is why the fetch step names both.
const HELPER = "allocate-task-id.mjs";
const HELPER_DEP = "flow-state.mjs";

// The invocation form `_flow-gates.yml` already uses for a materialised helper. The prompt must
// use the SAME form — that is what "resolve it the way the other helper calls do" means, and it
// is checked against the gates workflow rather than restated, so a change there is visible here.
const INVOCATION = `node "$FLOW_BIN"/`;

// A phrase from the prompt, matched across the hard wrap. The prompt is wrapped to ~90 columns
// and re-wraps whenever a sentence near it is edited, so a regex with a literal space in it fails
// for a reason that has nothing to do with the meaning it is protecting.
const phrase = (text, flags = "") => new RegExp(text.trim().split(/\s+/).join("\\s+"), flags);

// ─────────────────────────────────────────────────────────────────────────────────────────
// The prompt, cut out of the file
// ─────────────────────────────────────────────────────────────────────────────────────────

// Every `prompt: |` block scalar in `source`, dedented. A block scalar's content is every
// following line indented further than the key, plus the blank lines between them; that rule is
// the whole parser needed here, and it is the rule a YAML parser applies too — which the
// `yaml`-guarded test below confirms rather than assumes.
export function extractPromptBlocks(source) {
  const lines = source.split("\n");
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)prompt: \|-?\s*$/.exec(lines[i]);
    if (!m) continue;
    const keyIndent = m[1].length;

    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "") { body.push(""); continue; }
      const indent = line.length - line.trimStart().length;
      if (indent <= keyIndent) break;
      body.push(line);
    }
    // Trailing blank lines belong to whatever follows, not to the scalar.
    while (body.length && body[body.length - 1] === "") body.pop();

    const indents = body.filter((l) => l !== "").map((l) => l.length - l.trimStart().length);
    const base = Math.min(...indents);
    blocks.push(body.map((l) => (l === "" ? "" : l.slice(base))).join("\n"));
    i = j - 1;
  }

  return blocks;
}

const prompts = extractPromptBlocks(triage);

test("the extraction found exactly the one prompt an empty scan would have missed", () => {
  // An empty scan is a failure, not a pass — the rule `check-workflows.mjs` states and this file
  // inherits. Every assertion below reads `prompt`; extracting nothing would make all of them
  // vacuous at once.
  assert.equal(prompts.length, 1,
    `expected exactly one prompt: block in _flow-triage.yml, found ${prompts.length}`);
});

const prompt = prompts[0] ?? "";

test("the by-indentation cut is what a YAML parser reads", { skip }, () => {
  const doc = yamlMod.parse(triage);
  const parsed = doc.jobs.triage.steps
    .map((s) => s?.with?.prompt)
    .filter((p) => typeof p === "string");
  assert.equal(parsed.length, 1, "the workflow must carry exactly one prompt");
  assert.equal(prompt.trimEnd(), parsed[0].trimEnd(),
    "the dependency-free extraction has diverged from the real document, so every assertion " +
    "in this file is now about a string the workflow does not contain");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AC1 — the allocator is the ONLY way a task file is created
// ─────────────────────────────────────────────────────────────────────────────────────────

test("the task-creation step names allocate-task-id.mjs --write as the way to create the file", () => {
  assert.ok(prompt.includes(`${INVOCATION}${HELPER} --write`),
    `the prompt must invoke the allocator as \`${INVOCATION}${HELPER} --write\`. Anything else ` +
    "is a model choosing an id from its own checkout, which is the flow-0104/flow-0105 duplicate.");
  for (const flag of ["--repo-root", "--prefix", "--content-file", "--slug"]) {
    assert.ok(prompt.includes(flag),
      `the invocation must pass ${flag} — the allocator refuses --write without it, and a ` +
      "refusal inside the agent is a sweep that silently creates nothing");
  }
});

test("the prompt says the allocator is the ONLY path, not merely an available one", () => {
  assert.match(prompt, phrase("create it ONLY by running the allocator"),
    "an instruction that merely offers the allocator leaves hand-allocation available, and the " +
    "bug was never that the allocator was unknown — it was that nothing forbade the alternative");
  assert.match(prompt, phrase("do not create the task file any other way", "i"),
    "…and the alternative has to be closed in words, because there is no mechanism closing it");
});

test("no other way of creating or committing a task file is left open", () => {
  assert.match(prompt, phrase("do not write, `git add`, `git commit` or `git push` a task file"),
    "the four verbs are named individually on purpose: 'use the allocator' does not read as a " +
    "prohibition on `git commit` to a model that has just watched the allocator fail");
  assert.match(prompt, phrase("not as a fallback, not if the allocator fails"),
    "the dangerous moment is the allocator failing — that is exactly when hand-allocation looks " +
    "like helpfulness, and it is when a duplicate is most likely");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AC2 — "the next id" is gone, and forbidden
// ─────────────────────────────────────────────────────────────────────────────────────────

test("the old instruction to create the file with the next id is gone", () => {
  assert.ok(!/create the ready task file in \.flow\/tasks\/ with/.test(prompt),
    "this is the literal instruction that caused the duplicate: it told the model to write the " +
    "file itself, into the store, with an id of its own choosing");
  assert.ok(!/\b(?:with|using|choose|choosing|pick|picking|take|taking) the next (?:free )?id\b/
    .test(prompt.replace(/do not[^.]*?\bthe next id\b/gi, "")),
    "'the next id' may appear only inside a prohibition. An instruction phrased as 'use the next " +
    "free id' is the same bug with different words.");
});

test("the prohibition on choosing an id is present and unmissable", () => {
  assert.match(prompt, phrase("DO NOT CHOOSE AN ID YOURSELF"),
    "the one sentence a skimming model must not miss");
  assert.match(prompt, phrase("do not read the store and take the next id", "i"),
    "…naming the specific move that failed, because 'do not choose an id' reads as satisfied by " +
    "'I read the store, so I did not choose'");
  assert.match(prompt, phrase("do not reuse an id from a proposal comment", "i"),
    "a proposal comment drafted days earlier carries an id that was free then and is not now");
  assert.match(prompt, phrase("re-derives the id after a refused push"),
    "the WHY has to travel with the rule: a model that knows the push is the arbiter will not " +
    "invent a fallback that bypasses it");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AC3 — the id the allocator printed is the id used afterwards
// ─────────────────────────────────────────────────────────────────────────────────────────

test("the prompt says to use the id the allocator PRINTED, everywhere the task is named", () => {
  assert.match(prompt, phrase("USE THE ID THE ALLOCATOR PRINTED"),
    "the allocator may land on a different id from the one the model expected — that is the " +
    "whole point of re-allocating after a refused push, and it is worthless if the model then " +
    "labels the issue with the id it first had in mind");
  assert.match(prompt, phrase("first word of its output"),
    "…and the model has to be told where to read it, or it will guess");

  assert.match(prompt, /`flow: allocate <id>`/,
    "the commit message must be named, so it is clear the allocator already made the commit and " +
    "that it already carries the printed id");
  assert.match(prompt, phrase("do not reword or amend that commit", "i"),
    "re-wording it means a second commit touching the store, which is the hand-committing this " +
    "task exists to stop");

  assert.match(prompt, /comment on the issue[\s\S]{0,120}quoting the printed id/,
    "the issue comment is the human-visible record of which task an issue became; quoting an id " +
    "the allocator did not allocate points at a task that does not exist");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AC4 — the helper comes from canonical, at this workflow's commit
// ─────────────────────────────────────────────────────────────────────────────────────────

// The materialise step, from its `- name:` to the line exporting the fetched directory — the same
// cut `canonical-helpers-workflow.test.mjs` makes, so the two can be compared.
const FETCH_NAME = "      - name: Materialise canonical's helpers at this workflow's commit\n";
const FETCH_END = 'echo "FLOW_BIN=$bin" >> "$GITHUB_ENV"';

function fetchStep(source, label) {
  const i = source.indexOf(FETCH_NAME);
  assert.notEqual(i, -1, `${label} has no "Materialise canonical's helpers" step`);
  const end = source.indexOf(FETCH_END, i);
  assert.notEqual(end, -1, `${label}'s fetch step never exports FLOW_BIN`);
  return source.slice(i, end + FETCH_END.length);
}

test("the prompt never points at the calling repo's own copy of the helper", () => {
  assert.ok(!prompt.includes(`.flow/bin/${HELPER}`),
    "`.flow/bin/` in a consuming repo only changes when its flow-sync PR merges, while this " +
    "workflow changes the instant an alias moves. A repo that has never synced has no allocator " +
    "there at all — and a sweep that cannot find its allocator falls straight back to the bug.");
  assert.ok(prompt.includes(`${INVOCATION}${HELPER}`),
    `the prompt must use the materialised-helper form \`${INVOCATION}${HELPER}\`, the same form ` +
    "_flow-gates.yml uses for every helper it runs");
  assert.ok(gates.includes(INVOCATION),
    `\`${INVOCATION}\` must still be how _flow-gates.yml invokes a materialised helper — if that ` +
    "changed, the form pinned above is no longer 'the same way the other helper calls do'");
});

test("the triage workflow materialises canonical at this workflow's own commit", () => {
  const step = fetchStep(triage, "_flow-triage.yml");
  assert.match(step, /\$\{\{ job\.workflow_sha \}\}/,
    "the ref must be THIS reusable's commit — `github.workflow_sha` is the caller's 3-line caller");
  assert.match(step, /\$\{\{ job\.workflow_repository \}\}/,
    "and the repo from the same context, so a fork triages against itself");
  assert.match(step, /main\|master\|HEAD\|refs\/heads\/\*/,
    "a moving ref must be refused: a sweep whose allocator came from `main` cannot be reproduced " +
    "from its run log");
  assert.match(step, /inputs\.flow_ref/, "the documented GHES fallback must be wired up");
  assert.match(step, new RegExp(`for helper in .*\\b${HELPER.replace(".", "\\.")}\\b`),
    "the presence check must name the allocator, or a canonical commit that lost it would be " +
    "discovered inside the agent, where nothing reports a failure");
  assert.match(step, new RegExp(`for helper in .*\\b${HELPER_DEP.replace(".", "\\.")}\\b`),
    `${HELPER_DEP} is imported by the allocator; without it the run fails at import time`);
});

test("the fetch step is the gates workflow's, differing only in which helpers it checks for", () => {
  // A copy is unavoidable — a reusable workflow cannot share a step between jobs, let alone
  // between files, without a composite action that would itself have to be fetched first. So the
  // copies are pinned instead, exactly as `canonical-helpers-workflow.test.mjs` pins the four
  // inside `_flow-gates.yml`. Anything beyond the helper list drifting here means one workflow is
  // resolving canonical differently from the other.
  const forLine = /^ *for helper in .*$/m;
  const mine = fetchStep(triage, "_flow-triage.yml");
  const theirs = fetchStep(gates, "_flow-gates.yml");

  assert.match(mine, forLine, "sanity: the triage copy must have a helper-presence loop");
  assert.match(theirs, forLine, "sanity: the gates copy must have a helper-presence loop");
  assert.notEqual(mine.match(forLine)[0], theirs.match(forLine)[0],
    "the two copies check for the same helpers — triage does not need the gate's three, and the " +
    "one it does need would then be unchecked");
  assert.equal(mine.replace(forLine, "HELPERS"), theirs.replace(forLine, "HELPERS"),
    "the fetch steps have drifted beyond their helper lists. Re-copy from _flow-gates.yml rather " +
    "than hand-editing: a difference here means triage and the gate can resolve canonical at " +
    "two different commits, or with two different refusals.");
});

test("the flow_ref input exists and defaults to empty, never to a branch", () => {
  const block = triage.slice(triage.indexOf("on:"), triage.indexOf("jobs:"));
  assert.match(block, /flow_ref:/, "the GHES fallback the fetch step reads must be a declared input");
  assert.match(block, /default: ""/,
    "defaulting it to a branch would make the moving-ref refusal unreachable");
  assert.match(block, /required: false/,
    "every existing caller passes no inputs at all; a required one breaks the fleet on the next " +
    "alias move");
});

test("the helpers the fetch insists on are really in canonical's template tree", () => {
  for (const helper of [HELPER, HELPER_DEP]) {
    assert.ok(existsSync(join(TEMPLATE_BIN, helper)),
      `project-template/.flow/bin/${helper} is what the fetch sparse-checks out. Missing here, ` +
      "every triage run in the fleet fails its materialise step.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AC5 — nothing broader was granted
// ─────────────────────────────────────────────────────────────────────────────────────────

test("no permission and no tool allowlist was widened to let the allocator run", () => {
  // The job already holds `contents: write` (it committed task files before this change) and the
  // agent already runs `--permission-mode bypassPermissions`, so running one more command needed
  // nothing added. This test is the record of that: it fails if a later change quietly widens the
  // posture and attributes it to the allocator.
  const header = triage.slice(0, triage.indexOf("jobs:"));
  const perms = header.slice(header.indexOf("permissions:"));
  const granted = [...perms.matchAll(/^ {2}([a-z-]+): (\w+)/gm)].map((m) => `${m[1]}: ${m[2]}`);
  assert.deepEqual(granted, ["contents: write", "issues: write", "id-token: write"],
    "the triage job's permissions are unchanged by flow-0110 — the allocator commits and pushes " +
    "with the `contents: write` the sweep already had. A new scope here needs its own reason.");

  assert.match(triage, /claude_args: "--max-turns 150 --permission-mode bypassPermissions"/,
    "the agent's arguments are unchanged: bypassPermissions already allows the command, so no " +
    "allowlist entry was needed");
  for (const flag of ["--allowedTools", "--disallowedTools", "--add-dir"]) {
    assert.ok(!triage.includes(flag),
      `${flag} appeared in claude_args. Nothing about running one more command requires it, so ` +
      "it is either unnecessary or a widening that belongs in its own task.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AC6 — the changelog entry
// ─────────────────────────────────────────────────────────────────────────────────────────

test("changes/flow-0110.md exists and states that a caller need do nothing", () => {
  // Fragment while pending; assembled CHANGELOG entry after a release (flow-0098) — hence
  // `changelogEntry` rather than reading the file.
  const text = changelogEntry(REPO, "flow-0110");
  assert.ok(text,
    "a task that changes what every adopting repo's triage sweep executes owes the changelog an " +
    "entry");
  assert.match(text, /No caller action/,
    "the caller-action line is what a reader of the release notes scans for; the reusable changes " +
    "under them and they pick it up with the release");
  assert.ok(!/^#/m.test(text),
    "a fragment is assembled verbatim under `## Unreleased` — it carries no heading of its own");
});
