// Tests for flow-recover — the stranded-task classifier grades its own homework.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  classifyStranded, buildResetEdit, minutesSince, readTasks, DEFAULT_THRESHOLD_MINUTES,
} from "./flow-recover.mjs";

const TH = 75;
const inProgress = { status: "in_progress" };

// ── classifyStranded: the four acceptance cases ──

test("in_progress, branch ahead of base, no open PR, older than threshold -> reopen-pr", () => {
  const d = classifyStranded(
    inProgress,
    { branchExists: true, aheadOfBase: true, hasOpenPr: false, ageMinutes: 90 },
    TH,
  );
  assert.equal(d, "reopen-pr");
});

test("in_progress, no branch/commits, older than threshold -> reset-to-ready", () => {
  const d = classifyStranded(
    inProgress,
    { branchExists: false, aheadOfBase: false, hasOpenPr: false, ageMinutes: 90 },
    TH,
  );
  assert.equal(d, "reset-to-ready");
});

test("in_progress with an open PR -> ok (never disturbed), even when old", () => {
  const d = classifyStranded(
    inProgress,
    { branchExists: true, aheadOfBase: true, hasOpenPr: true, ageMinutes: 9999 },
    TH,
  );
  assert.equal(d, "ok");
});

test("in_progress younger than threshold -> ok (no premature rescue)", () => {
  const d = classifyStranded(
    inProgress,
    { branchExists: true, aheadOfBase: true, hasOpenPr: false, ageMinutes: 10 },
    TH,
  );
  assert.equal(d, "ok");
});

// ── classifyStranded: edges ──

test("only in_progress tasks are ever swept", () => {
  for (const status of ["ready", "in_review", "done", "blocked"]) {
    const d = classifyStranded(
      { status },
      { branchExists: false, aheadOfBase: false, hasOpenPr: false, ageMinutes: 99999 },
      TH,
    );
    assert.equal(d, "ok", `${status} must never be swept`);
  }
});

test("a branch that exists but is not ahead of base resets (no commits to recover)", () => {
  const d = classifyStranded(
    inProgress,
    { branchExists: true, aheadOfBase: false, hasOpenPr: false, ageMinutes: 90 },
    TH,
  );
  assert.equal(d, "reset-to-ready");
});

test("default threshold applies when none is passed", () => {
  assert.equal(DEFAULT_THRESHOLD_MINUTES > 0, true);
  const young = classifyStranded(inProgress, { ageMinutes: DEFAULT_THRESHOLD_MINUTES - 1 });
  assert.equal(young, "ok");
  const old = classifyStranded(inProgress, { ageMinutes: DEFAULT_THRESHOLD_MINUTES + 1 });
  assert.equal(old, "reset-to-ready");
});

// ── buildResetEdit ──

test("buildResetEdit clears the claim and returns to ready", () => {
  assert.deepEqual(buildResetEdit("CAN-51"), {
    id: "CAN-51", status: "ready", owner: "", branch: "", pr: "",
  });
});

// ── minutesSince ──

test("minutesSince computes whole minutes, clamps negatives, nulls on bad input", () => {
  const now = Date.parse("2026-06-18T12:00:00Z");
  assert.equal(minutesSince("2026-06-18T10:30:00Z", now), 90);
  assert.equal(minutesSince("2026-06-18T13:00:00Z", now), 0); // future clamps to 0
  assert.equal(minutesSince("", now), null);
  assert.equal(minutesSince("not-a-date", now), null);
  assert.equal(minutesSince(undefined, now), null);
});

// ── readTasks: only in_progress surfaces for the sweep ──

test("readTasks parses id/status/started and skips the template", () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-recover-"));
  try {
    writeFileSync(
      join(dir, "0051-x.md"),
      '---\nid: "CAN-51"\nstatus: "in_progress"\nstarted: "2026-06-18"\n---\nbody\n',
    );
    writeFileSync(join(dir, "0050-y.md"), '---\nid: "CAN-50"\nstatus: "done"\n---\nbody\n');
    writeFileSync(join(dir, "_TEMPLATE.md"), '---\nid: "TEMPLATE"\nstatus: "ready"\n---\n');
    const tasks = readTasks(dir);
    const ids = tasks.map((t) => t.id);
    assert.deepEqual(ids, ["CAN-50", "CAN-51"]);
    const inProg = tasks.find((t) => t.status === "in_progress");
    assert.equal(inProg.id, "CAN-51");
    assert.equal(inProg.started, "2026-06-18");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
