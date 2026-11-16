// intake-trust.test.mjs — a lane label counts only when the right actor applied it (flow-0201).
//
// Each test names the acceptance criterion it proves. The fixtures are shaped like the real
// `GET /repos/{o}/{r}/issues/{n}/events` payload: `event`, `label.name`, `actor.{login,type}`,
// `created_at`, `id`.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  LANE_LABELS, REASONS, ghPermissionOf, latestLabeledEvent, main, notHonouredLine, verifyIssue,
  verifyLane,
} from "./intake-trust.mjs";

const SCRIPT = join(import.meta.dirname, "intake-trust.mjs");

let clock = Date.parse("2026-11-01T10:00:00Z");
let nextId = 1000;
const ev = (event, label, login, type = "User") => ({
  id: nextId++,
  event,
  label: { name: label },
  actor: { login, type },
  created_at: new Date((clock += 60_000)).toISOString(),
});
const labeled = (label, login, type) => ev("labeled", label, login, type);
const unlabeled = (label, login = "dan") => ev("unlabeled", label, login);

const perms = (table) => (login) => {
  if (!(login in table)) throw new Error("404 Not Found");
  return table[login];
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// `approved` / `auto-ok`
// ─────────────────────────────────────────────────────────────────────────────────────────

test("AC1: `approved` applied by a User with write permission is honoured", () => {
  const events = [labeled("approved", "dan")];
  const v = verifyLane(events, "approved", { permissionOf: perms({ dan: "write" }) });
  assert.deepEqual(v, { honoured: true, actor: "dan", reason: "user-with-write" });
  for (const p of ["maintain", "admin"]) {
    assert.equal(verifyLane(events, "approved", { permissionOf: () => p }).honoured, true, p);
  }
  assert.equal(verifyLane([labeled("auto-ok", "dan")], "auto-ok",
    { permissionOf: () => "admin" }).honoured, true, "`auto-ok` follows the same rule");
});

test("AC2: `approved` applied by a Bot is not honoured, even if trusted_labelers lists it and the lookup says admin", () => {
  const events = [labeled("approved", "inflight-flow[bot]", "Bot")];
  let asked = false;
  const v = verifyLane(events, "approved", {
    trustedLabelers: ["inflight-flow[bot]"],
    permissionOf: () => { asked = true; return "admin"; },
  });
  assert.equal(v.honoured, false);
  assert.equal(v.reason, REASONS.notUser);
  assert.equal(v.actor, "inflight-flow[bot]");
  assert.equal(asked, false, "a Bot is refused before its permission is consulted");
  // Any non-User type (Organization, Mannequin, missing) is refused the same way.
  for (const type of ["Organization", "Mannequin", undefined]) {
    const e = labeled("auto-ok", "someone");
    e.actor.type = type;
    assert.equal(verifyLane([e], "auto-ok", { permissionOf: () => "admin" }).honoured, false, String(type));
  }
});

test("AC3: revoked write — a User whose permission is now `read` (or 404) is not honoured, and the reason says the actor lacks write", () => {
  const events = [labeled("approved", "former-maintainer")];
  const read = verifyLane(events, "approved", { permissionOf: perms({ "former-maintainer": "read" }) });
  assert.deepEqual(read, { honoured: false, actor: "former-maintainer", reason: REASONS.lacksWrite });
  assert.match(read.reason, /lacks-write/);

  const gone = verifyLane(events, "approved", { permissionOf: perms({}) }); // throws: 404
  assert.deepEqual(gone, { honoured: false, actor: "former-maintainer", reason: REASONS.lacksWrite },
    "a lookup that errors is 'no write', never 'write'");

  for (const p of ["none", "triage", "", null, undefined]) {
    assert.equal(verifyLane(events, "approved", { permissionOf: () => p }).honoured, false, String(p));
  }
  assert.equal(verifyLane(events, "approved").honoured, false,
    "with no lookup supplied, nobody has write");
});

test("AC3: permission is read when triage runs — the same events flip once write is revoked", () => {
  const events = [labeled("approved", "dan")];
  const table = { dan: "write" };
  assert.equal(verifyLane(events, "approved", { permissionOf: perms(table) }).honoured, true);
  table.dan = "read";
  assert.equal(verifyLane(events, "approved", { permissionOf: perms(table) }).honoured, false);
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Event ordering
// ─────────────────────────────────────────────────────────────────────────────────────────

test("AC4: labeled(trusted user), unlabeled, labeled(Bot) → not honoured; the reverse order → honoured", () => {
  const opts = { permissionOf: perms({ dan: "admin" }) };
  const botLast = [labeled("approved", "dan"), unlabeled("approved"), labeled("approved", "app[bot]", "Bot")];
  const v1 = verifyLane(botLast, "approved", opts);
  assert.equal(v1.honoured, false);
  assert.equal(v1.actor, "app[bot]");

  const userLast = [labeled("approved", "app[bot]", "Bot"), unlabeled("approved"), labeled("approved", "dan")];
  assert.equal(verifyLane(userLast, "approved", opts).honoured, true);
});

test("AC4: order comes from created_at then id, not from the array position", () => {
  const opts = { permissionOf: perms({ dan: "admin" }) };
  const userLast = [labeled("approved", "app[bot]", "Bot"), unlabeled("approved"), labeled("approved", "dan")];
  assert.equal(verifyLane([...userLast].reverse(), "approved", opts).honoured, true,
    "reversed input, same history");

  // Same second: the monotonic event id breaks the tie.
  const t = "2026-11-02T00:00:00Z";
  const sameSecond = [
    { id: 3, event: "labeled", label: { name: "approved" }, actor: { login: "app[bot]", type: "Bot" }, created_at: t },
    { id: 1, event: "labeled", label: { name: "approved" }, actor: { login: "dan", type: "User" }, created_at: t },
    { id: 2, event: "unlabeled", label: { name: "approved" }, actor: { login: "dan", type: "User" }, created_at: t },
  ];
  assert.equal(verifyLane(sameSecond, "approved", opts).honoured, false);
  assert.equal(latestLabeledEvent(sameSecond, "approved").id, 3);
});

test("AC5: a label removed after its last `labeled` event is not honoured", () => {
  const events = [labeled("approved", "dan"), unlabeled("approved")];
  assert.equal(latestLabeledEvent(events, "approved"), null);
  const v = verifyLane(events, "approved", { permissionOf: () => "admin" });
  assert.deepEqual(v, { honoured: false, actor: "unknown", reason: REASONS.noEvent });
});

test("latestLabeledEvent ignores other labels and other event kinds, and tolerates junk", () => {
  const mine = labeled("approved", "dan");
  const events = [
    mine, labeled("bug", "x"), unlabeled("bug"),
    { id: nextId++, event: "commented", created_at: new Date((clock += 60_000)).toISOString() },
    null, "junk",
  ];
  assert.equal(latestLabeledEvent(events, "approved"), mine);
  assert.equal(latestLabeledEvent(events, "APPROVED"), mine, "label names compare case-insensitively, as GitHub's do");
  assert.equal(latestLabeledEvent(null, "approved"), null);
  assert.equal(latestLabeledEvent([], "approved"), null);
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// `flow:trusted`
// ─────────────────────────────────────────────────────────────────────────────────────────

test("AC6: `flow:trusted` by a listed login is honoured; any other login is not; an empty list honours nobody", () => {
  const byApp = [labeled("flow:trusted", "inflight-flow[bot]", "Bot")];
  assert.deepEqual(verifyLane(byApp, "flow:trusted", { trustedLabelers: ["inflight-flow[bot]"] }),
    { honoured: true, actor: "inflight-flow[bot]", reason: "trusted-labeler" });

  const byWriter = [labeled("flow:trusted", "dan")];
  const v = verifyLane(byWriter, "flow:trusted",
    { trustedLabelers: ["inflight-flow[bot]"], permissionOf: () => "admin" });
  assert.deepEqual(v, { honoured: false, actor: "dan", reason: REASONS.notTrustedLabeler },
    "write access does not make a person a trusted labeler");

  assert.deepEqual(verifyLane(byApp, "flow:trusted", { trustedLabelers: [] }),
    { honoured: false, actor: "inflight-flow[bot]", reason: REASONS.noTrustedLabelers });
  assert.equal(verifyLane(byApp, "flow:trusted").honoured, false, "no list at all honours nobody");
  assert.equal(verifyLane(byApp, "flow:trusted", { trustedLabelers: "inflight-flow[bot]" }).honoured, false,
    "a list that is not an array is not a list");
});

test("AC6: an actor with no readable login is never matched, even against a list naming 'unknown'", () => {
  const events = [{ id: 1, event: "labeled", label: { name: "flow:trusted" }, actor: { login: "has space", type: "Bot" }, created_at: "2026-11-01T00:00:00Z" }];
  const v = verifyLane(events, "flow:trusted", { trustedLabelers: ["unknown"] });
  assert.deepEqual(v, { honoured: false, actor: "unknown", reason: REASONS.notTrustedLabeler });
  const ghost = [{ id: 2, event: "labeled", label: { name: "approved" }, actor: null, created_at: "2026-11-01T00:00:00Z" }];
  assert.equal(verifyLane(ghost, "approved", { permissionOf: () => "admin" }).reason, REASONS.notUser);
});

test("AC7: a login removed from trusted_labelers after applying `flow:trusted` is no longer honoured on the next run", () => {
  const events = [labeled("flow:trusted", "old-app[bot]", "Bot")];
  const dir = mkdtempSync(join(tmpdir(), "intake-trust-"));
  try {
    writeIssue(dir, 7, ["flow:trusted"], events);
    const config = join(dir, "config.yml");
    const run = () => main(["--numbers", "7", "--raw-dir", dir, "--config", config, "--out", join(dir, "lanes.json")],
      { permissionOf: () => "none", log: () => {}, env: {} });

    writeFileSync(config, "intake:\n  trusted_labelers: [\"old-app[bot]\"]\n");
    assert.equal(run().lanes["7"]["flow:trusted"], true, "first run: listed, honoured");

    writeFileSync(config, "intake:\n  trusted_labelers: [\"new-app[bot]\"]\n");
    assert.equal(run().lanes["7"]["flow:trusted"], false, "next run: removed from config, not honoured");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// The log line
// ─────────────────────────────────────────────────────────────────────────────────────────

test("AC9: an unhonoured label produces exactly the label-not-honoured line, with issue, label, actor and reason", () => {
  const events = [labeled("approved", "app[bot]", "Bot"), labeled("auto-ok", "dan")];
  const { lanes, log } = verifyIssue(42, ["approved", "auto-ok", "bug"], events,
    { permissionOf: perms({ dan: "write" }) });
  assert.deepEqual(lanes, { approved: false, "auto-ok": true, "flow:trusted": false });
  assert.deepEqual(log, [
    "flow-triage: label-not-honoured issue=42 label=approved actor=app[bot] reason=actor-not-user",
  ], "one line per present-but-unhonoured label; an honoured or absent label logs nothing");
  assert.equal(notHonouredLine(5, "flow:trusted", { actor: "x", reason: "not-a-trusted-labeler" }),
    "flow-triage: label-not-honoured issue=5 label=flow:trusted actor=x reason=not-a-trusted-labeler");
});

test("verifyIssue: a lane label that is absent is false and silent, whatever the events say", () => {
  const { lanes, log } = verifyIssue(1, [], [labeled("approved", "dan")], { permissionOf: () => "admin" });
  assert.deepEqual(lanes, Object.fromEntries(LANE_LABELS.map((l) => [l, false])));
  assert.deepEqual(log, []);
  assert.equal(verifyIssue(1, undefined, [], {}).log.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// The CLI, run whole
// ─────────────────────────────────────────────────────────────────────────────────────────

function writeIssue(dir, n, labels, events, pages = null) {
  writeFileSync(join(dir, `issue-${n}.json`), JSON.stringify({ number: n, labels: labels.map((name) => ({ name })) }));
  writeFileSync(join(dir, `events-${n}.json`), JSON.stringify(pages ?? [events]));
}

test("main: writes verified lanes per issue, logs each unhonoured label, and asks for each login once", () => {
  const dir = mkdtempSync(join(tmpdir(), "intake-trust-"));
  try {
    // Issue 1: two pages of events — the deciding `unlabeled` is on page 2.
    const p1 = [labeled("approved", "dan")];
    const p2 = [unlabeled("approved")];
    writeIssue(dir, 1, ["approved"], null, [p1, p2]);
    writeIssue(dir, 2, ["approved", "auto-ok"], [labeled("approved", "dan"), labeled("auto-ok", "dan")]);
    writeIssue(dir, 3, ["approved"], [labeled("approved", "app[bot]", "Bot")]);
    // Issue 4 has no files at all: no labels, no lanes.
    writeFileSync(join(dir, "config.yml"), "intake:\n  trusted_labelers: []\n");
    const summary = join(dir, "summary.md");
    writeFileSync(summary, "");
    const out = join(dir, "lanes.json");
    const lines = [];
    const asked = [];

    const res = main(["--numbers", "1,2,3,4", "--raw-dir", dir, "--config", join(dir, "config.yml"), "--out", out], {
      permissionOf: (l) => { asked.push(l); return "write"; },
      log: (l) => lines.push(l),
      env: { GITHUB_STEP_SUMMARY: summary },
    });

    const written = JSON.parse(readFileSync(out, "utf8"));
    assert.deepEqual(written, res.lanes);
    assert.deepEqual(written, {
      1: { approved: false, "auto-ok": false, "flow:trusted": false },
      2: { approved: true, "auto-ok": true, "flow:trusted": false },
      3: { approved: false, "auto-ok": false, "flow:trusted": false },
      4: { approved: false, "auto-ok": false, "flow:trusted": false },
    });
    assert.deepEqual(asked, ["dan"], "one permission lookup per login per run");
    assert.deepEqual(res.notHonoured, [
      "flow-triage: label-not-honoured issue=1 label=approved actor=unknown reason=no-labeled-event",
      "flow-triage: label-not-honoured issue=3 label=approved actor=app[bot] reason=actor-not-user",
    ]);
    for (const l of res.notHonoured) assert.ok(lines.includes(l), `logged: ${l}`);
    assert.match(readFileSync(summary, "utf8"), /2 lane label\(s\) honoured, 2 not honoured/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("main: a failing lookup is cached as a failure and never becomes write", () => {
  const dir = mkdtempSync(join(tmpdir(), "intake-trust-"));
  try {
    writeIssue(dir, 1, ["approved"], [labeled("approved", "dan")]);
    writeIssue(dir, 2, ["auto-ok"], [labeled("auto-ok", "dan")]);
    let calls = 0;
    const res = main(["--numbers", "1,2", "--raw-dir", dir, "--config", join(dir, "missing.yml"), "--out", join(dir, "o.json")], {
      permissionOf: () => { calls++; throw new Error("HTTP 502"); }, log: () => {}, env: {},
    });
    assert.equal(calls, 1);
    assert.equal(res.lanes["1"].approved, false);
    assert.equal(res.lanes["2"]["auto-ok"], false);
    assert.match(res.notHonoured[0], /reason=actor-lacks-write$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("main: refuses a missing argument, an unknown flag and a non-numeric issue", () => {
  const base = ["--raw-dir", "/x", "--config", "/x", "--out", "/x"];
  assert.throws(() => main(base, { permissionOf: () => "none" }), /--numbers is required/);
  assert.throws(() => main(["--numbers"], {}), /unexpected argument/);
  assert.throws(() => main(["numbers", "1"], {}), /unexpected argument/);
  assert.throws(() => main(["--numbers", "1,x", ...base], { permissionOf: () => "none" }), /non-numeric/);
});

test("ghPermissionOf: reads `.permission` from the collaborator endpoint and refuses anything it cannot trust", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, ...args]); return JSON.stringify({ permission: "admin", role_name: "admin" }); };
  assert.equal(ghPermissionOf("acme/widgets", exec)("dan"), "admin");
  assert.deepEqual(calls, [["gh", "api", "repos/acme/widgets/collaborators/dan/permission"]]);

  assert.throws(() => ghPermissionOf("acme/widgets", exec)("../../evil"), /not a GitHub login/);
  assert.throws(() => ghPermissionOf("acme/widgets", () => "{}")("dan"), /no permission field/);
  assert.throws(() => ghPermissionOf("acme/widgets", () => { throw new Error("gh: Not Found (HTTP 404)"); })("dan"), /404/);
  assert.throws(() => ghPermissionOf("not a repo", exec), /expected owner\/name/);
  assert.throws(() => ghPermissionOf(undefined, exec), /expected owner\/name/);
});

test("the CLI entry point runs as a script and exits 2 on a bad invocation", () => {
  const dir = mkdtempSync(join(tmpdir(), "intake-trust-"));
  try {
    writeIssue(dir, 9, [], []);
    const ok = spawnSync(process.execPath, [SCRIPT, "--numbers", "9", "--raw-dir", dir, "--config", join(dir, "none.yml"),
      "--out", join(dir, "o.json"), "--repo", "acme/widgets"], { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /triage lanes: 1 issue\(s\) checked, 0 lane label\(s\) honoured, 0 not honoured\./);
    const bad = spawnSync(process.execPath, [SCRIPT, "--numbers"], { encoding: "utf8" });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /unexpected argument/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
