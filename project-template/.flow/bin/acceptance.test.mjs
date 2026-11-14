// Tests for acceptance.mjs — a new task needs the human's accept before it can be worked (flow-0227).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseAcceptFromText, parseAcceptFrom, acceptCutoff, needsAcceptance, isAccepted,
  acceptanceAllowsWork, acceptanceFindings, ACCEPT_FROM_KEY,
} from "./acceptance.mjs";

const T = (id, f = {}) => ({
  id, status: f.status ?? "ready", created: f.created ?? "2026-11-14",
  accepted_by: f.accepted_by ?? "", accepted_at: f.accepted_at ?? "", accepted_via: f.accepted_via ?? "",
});
const ACCEPTED = { accepted_by: "CandidDan", accepted_at: "2026-11-14T02:13:59Z", accepted_via: "chat" };

// ── config ──

test("parses tasks.accept_from, quoted or bare, with a trailing comment", () => {
  assert.equal(parseAcceptFromText('tasks:\n  accept_from: "2026-11-14"  # on\n'), "2026-11-14");
  assert.equal(parseAcceptFromText("tasks:\n  accept_from: 2026-11-14 # on\n"), "2026-11-14");
});

test("unset when the block or the key is absent, and the block ends at a dedent", () => {
  assert.equal(parseAcceptFromText("project:\n  name: x\n"), undefined);
  assert.equal(parseAcceptFromText("tasks:\n  other: 1\nintents:\n  accept_from: \"2026-01-01\"\n"), undefined);
  assert.equal(parseAcceptFromText(""), undefined);
  assert.equal(parseAcceptFromText(undefined), undefined);
});

test("parseAcceptFrom reads the file, and a missing file is unset", () => {
  const dir = mkdtempSync(join(tmpdir(), "accept-"));
  try {
    const p = join(dir, "config.yml");
    writeFileSync(p, "tasks:\n  accept_from: '2026-11-14'\n");
    assert.equal(parseAcceptFrom(p), "2026-11-14");
    assert.equal(parseAcceptFrom(join(dir, "nope.yml")), undefined);
    assert.equal(parseAcceptFrom(undefined), undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the rule is off unless accept_from is a YYYY-MM-DD date", () => {
  assert.equal(acceptCutoff("2026-11-14"), "2026-11-14");
  for (const v of [undefined, "", "soon", "14/11/2026", 20261114]) assert.equal(acceptCutoff(v), null);
  assert.equal(needsAcceptance(T("F-1"), undefined), false);
  assert.equal(needsAcceptance(T("F-1"), "next week"), false);
});

// ── which tasks need it ──

test("a ready task created on or after the cutoff needs acceptance", () => {
  assert.equal(needsAcceptance(T("F-1", { created: "2026-11-14" }), "2026-11-14"), true);
  assert.equal(needsAcceptance(T("F-1", { created: "2026-12-01" }), "2026-11-14"), true);
});

test("proposed, cancelled, and tasks created before the cutoff never need it", () => {
  assert.equal(needsAcceptance(T("F-1", { status: "proposed" }), "2026-11-14"), false);
  assert.equal(needsAcceptance(T("F-1", { status: "cancelled" }), "2026-11-14"), false);
  assert.equal(needsAcceptance(T("F-1", { created: "2026-11-13" }), "2026-11-14"), false);
  assert.equal(needsAcceptance(null, "2026-11-14"), false);
});

test("a task with no readable created date is covered, not waved through", () => {
  assert.equal(needsAcceptance(T("F-1", { created: "" }), "2026-11-14"), true);
});

test("accepted means both accepted_by and accepted_at are set", () => {
  assert.equal(isAccepted(T("F-1", ACCEPTED)), true);
  assert.equal(isAccepted(T("F-1", { accepted_by: "CandidDan" })), false);
  assert.equal(isAccepted(T("F-1", { accepted_at: "2026-11-14T00:00:00Z" })), false);
  assert.equal(isAccepted(undefined), false);
});

test("acceptanceAllowsWork: unaccepted new work is refused, accepted or old work is allowed", () => {
  assert.equal(acceptanceAllowsWork(T("F-1"), "2026-11-14"), false);
  assert.equal(acceptanceAllowsWork(T("F-1", ACCEPTED), "2026-11-14"), true);
  assert.equal(acceptanceAllowsWork(T("F-1", { created: "2026-11-01" }), "2026-11-14"), true);
  assert.equal(acceptanceAllowsWork(T("F-1"), undefined), true);
});

// ── flow-doctor findings ──

test("reports a ready task with no accepted_by, naming the task", () => {
  const { problems } = acceptanceFindings([T("F-9")], "2026-11-14");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^F-9: ready with no accepted_by/);
});

test("reports a missing accepted_at when accepted_by is set", () => {
  const { problems } = acceptanceFindings([T("F-9", { accepted_by: "CandidDan" })], "2026-11-14");
  assert.match(problems[0], /no accepted_at/);
});

test("covers blocked and in_progress tasks too, not only ready", () => {
  const { problems } = acceptanceFindings(
    [T("F-1", { status: "blocked" }), T("F-2", { status: "in_progress" })], "2026-11-14");
  assert.equal(problems.length, 2);
});

test("never reports proposed, cancelled, accepted, pre-cutoff tasks, or anything when off", () => {
  const tasks = [
    T("F-1", { status: "proposed" }), T("F-2", { status: "cancelled" }),
    T("F-3", ACCEPTED), T("F-4", { created: "2026-10-01" }),
  ];
  assert.deepEqual(acceptanceFindings(tasks, "2026-11-14"), { problems: [], warnings: [] });
  assert.deepEqual(acceptanceFindings([T("F-5")], undefined), { problems: [], warnings: [] });
  assert.deepEqual(acceptanceFindings([T("F-5")], ""), { problems: [], warnings: [] });
});

test("a malformed accept_from is one warning naming the key, and no task findings", () => {
  const { problems, warnings } = acceptanceFindings([T("F-1")], "soon");
  assert.equal(problems.length, 0);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes(ACCEPT_FROM_KEY));
});

test("an unknown accepted_via is a warning", () => {
  const { problems, warnings } = acceptanceFindings([T("F-1", { ...ACCEPTED, accepted_via: "telepathy" })], "2026-11-14");
  assert.equal(problems.length, 0);
  assert.match(warnings[0], /accepted_via "telepathy"/);
});

test("tolerates a missing task list", () => {
  assert.deepEqual(acceptanceFindings(undefined, "2026-11-14"), { problems: [], warnings: [] });
});
