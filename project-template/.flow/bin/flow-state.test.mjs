// flow-state.test.mjs — node --test. Exercises the pure resolution core: parsing, PR
// matching, and every store-vs-PR resolution branch including the disagreement signals.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTask, idNum, branchMatchesTask, resolveState, pickPrForTask, reconcile,
} from "./flow-state.mjs";

const task = (o) => ({ id: "CAN-1", title: "", status: "ready", owner: "", branch: "", pr: "", blocked_reason: "", issue: "", ...o });

test("parseTask reads the lifecycle fields it needs", () => {
  const text = `---\nid: "CAN-94"\ntitle: "Do the thing"\nstatus: "in_progress"\npriority: 2\nowner: "session-x"\nbranch: "flow/CAN-94-thing"\npr: "https://github.com/o/r/pull/131"\nblocked_reason: ""\nissue: "#157"\n---\nbody`;
  const t = parseTask(text);
  assert.equal(t.id, "CAN-94");
  assert.equal(t.status, "in_progress");
  assert.equal(t.owner, "session-x");
  assert.equal(t.branch, "flow/CAN-94-thing");
  assert.equal(t.pr, "https://github.com/o/r/pull/131");
  assert.equal(t.issue, "#157");
});

test("parseTask returns null without frontmatter", () => {
  assert.equal(parseTask("no frontmatter here"), null);
  assert.equal(parseTask(""), null);
});

test("idNum extracts the numeric suffix", () => {
  assert.equal(idNum("CAN-94"), 94);
  assert.equal(idNum("MEAD-0007"), 7);
  assert.equal(idNum("weird"), Infinity);
});

test("branchMatchesTask anchors on the id token (CAN-9 does not match CAN-94)", () => {
  assert.ok(branchMatchesTask("flow/CAN-94-thing", "CAN-94"));
  assert.ok(branchMatchesTask("flow/CAN-94", "CAN-94"));
  assert.ok(!branchMatchesTask("flow/CAN-9-other", "CAN-94"));
  assert.ok(!branchMatchesTask("flow/CAN-940-other", "CAN-94"));
  assert.ok(!branchMatchesTask("", "CAN-94"));
});

// ── resolveState: PR reality wins, disagreements surface ──
test("merged PR resolves to done", () => {
  const r = resolveState(task({ status: "in_review" }), { number: 5, state: "MERGED" });
  assert.equal(r.resolved, "done");
  assert.match(r.detail, /merged in #5/);
  assert.ok(r.disagreement, "in_review + merged PR should flag a writeback lag");
});

test("merged PR with store already done => no disagreement", () => {
  const r = resolveState(task({ status: "done" }), { number: 5, state: "MERGED" });
  assert.equal(r.resolved, "done");
  assert.equal(r.disagreement, null);
});

test("open PR resolves to in_review; store not in_review disagrees", () => {
  const r = resolveState(task({ status: "in_progress" }), { number: 7, state: "OPEN" });
  assert.equal(r.resolved, "in_review");
  assert.match(r.detail, /PR #7 open/);
  assert.ok(r.disagreement);
});

test("closed-unmerged PR resolves back to ready", () => {
  const r = resolveState(task({ status: "in_review" }), { number: 9, state: "CLOSED" });
  assert.equal(r.resolved, "ready");
  assert.ok(r.disagreement);
});

test("no PR + ready => unclaimed, no disagreement (the CAN-94 case)", () => {
  const r = resolveState(task({ id: "CAN-94", status: "ready" }), null);
  assert.equal(r.resolved, "ready");
  assert.match(r.detail, /unclaimed/);
  assert.equal(r.disagreement, null);
});

test("no PR + in_progress reports the owner", () => {
  const r = resolveState(task({ status: "in_progress", owner: "session-x" }), null);
  assert.equal(r.resolved, "in_progress");
  assert.match(r.detail, /session-x/);
  assert.equal(r.disagreement, null);
});

test("no PR + in_review is a disagreement (implies a PR that isn't there)", () => {
  const r = resolveState(task({ status: "in_review" }), null);
  assert.equal(r.resolved, "in_review");
  assert.ok(r.disagreement);
});

test("no PR + blocked surfaces the reason", () => {
  const r = resolveState(task({ status: "blocked", blocked_reason: "needs API key" }), null);
  assert.equal(r.resolved, "blocked");
  assert.match(r.detail, /needs API key/);
});

// ── pickPrForTask ──
test("pickPrForTask prefers an explicit pr URL match", () => {
  const t = task({ id: "CAN-3", pr: "https://github.com/o/r/pull/12", branch: "flow/CAN-3-x" });
  const prs = [
    { number: 12, state: "MERGED", headRefName: "flow/CAN-3-x", url: "https://github.com/o/r/pull/12" },
    { number: 99, state: "OPEN", headRefName: "flow/CAN-3-later", url: "https://github.com/o/r/pull/99" },
  ];
  assert.equal(pickPrForTask(t, prs).number, 12);
});

test("pickPrForTask falls back to branch match, preferring merged/open over closed", () => {
  const t = task({ id: "CAN-3", pr: "", branch: "" });
  const prs = [
    { number: 40, state: "CLOSED", headRefName: "flow/CAN-3-first", url: "u40" },
    { number: 41, state: "OPEN", headRefName: "flow/CAN-3-second", url: "u41" },
  ];
  assert.equal(pickPrForTask(t, prs).number, 41);
});

test("pickPrForTask returns null when nothing matches", () => {
  assert.equal(pickPrForTask(task({ id: "CAN-3" }), [{ number: 1, state: "OPEN", headRefName: "flow/CAN-9-x", url: "u" }]), null);
});

// ── reconcile end-to-end (pure) ──
test("reconcile sorts by id number and resolves each", () => {
  const tasks = [task({ id: "CAN-10", status: "ready" }), task({ id: "CAN-2", status: "in_progress", owner: "s" })];
  const rows = reconcile(tasks, []);
  assert.deepEqual(rows.map((r) => r.id), ["CAN-2", "CAN-10"]);
  assert.equal(rows[0].resolved, "in_progress");
  assert.equal(rows[1].resolved, "ready");
});
