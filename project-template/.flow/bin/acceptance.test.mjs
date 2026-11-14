// Tests for acceptance.mjs — a new task needs the human's accept before it can be worked (flow-0227).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseAcceptFromText, parseAcceptFrom, acceptCutoff, needsAcceptance, isAccepted,
  acceptanceAllowsWork, acceptanceFindings, ACCEPT_FROM_KEY,
  parseAutoAcceptText, parseAutoAccept, AUTO_DEFAULTS, globToRegex, touchesReachesNever,
  autoAcceptReasons, readTaskFacts, runAutoCli,
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

test("CRLF line endings parse the same", () => {
  assert.equal(parseAcceptFromText('tasks:\r\n  accept_from: "2026-11-14"\r\n'), "2026-11-14");
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
  assert.match(problems[0], /^F-9: ready with no accepted_by or accepted_at/);
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

// ── the written rule: protocol and task-writer skill (flow-0227 criterion 7) ──
// Read from this file's own location, so the test holds in canonical's template and in an
// adopting repo alike: `.flow/bin/` → `.flow/PROTOCOL.md` and `.claude/skills/task-writer/`.

const read = (rel) => readFileSync(join(import.meta.dirname, rel), "utf8");
const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `no "## ${heading}" section`);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
};

test("the protocol's Status lifecycle names `proposed` in its diagram and gives it a bullet", () => {
  const body = section(read("../PROTOCOL.md"), "Status lifecycle");
  const diagram = body.slice(body.indexOf("```"), body.indexOf("```", body.indexOf("```") + 3));
  assert.match(diagram, /proposed[\s\S]*human accepts[\s\S]*ready/);
  assert.match(diagram, /human rejects[\s\S]*cancelled/);
  assert.match(body, /^- `proposed` — /m);
  assert.match(body, /tasks\.accept_from/);
});

test("the protocol says nothing enters the queue without the human's yes", () => {
  const text = read("../PROTOCOL.md");
  assert.match(text, /Nothing enters the queue without the human's yes/);
  assert.match(text, /writes it `proposed` and\s+shows it to the human/);
});

test("the task-writer skill writes `proposed`, never `ready`, and asks Accept or Reject", () => {
  const skill = read("../../.claude/skills/task-writer/SKILL.md");
  assert.match(skill, /id number; set `status: proposed`/, "step 3 writes a new task as proposed");
  assert.doesNotMatch(skill, /id number; set `status: ready`/, "step 3 must not write a new task as ready");
  assert.match(skill, /\*\*Show it to the human and get Accept or Reject before it is `ready`\.\*\*/);
  assert.match(skill, /\*\*Accept\*\* → set `status: ready`, `accepted_by`/);
  assert.match(skill, /\*\*Reject\*\* → set `status: cancelled`/);
});


// ── auto-accept: facts, not scores (Dan, 2026-11-14) ──

const POLICY = { max_model: "haiku", max_touches: 3, never: [...AUTO_DEFAULTS.never] };
const small = (f = {}) => ({ model: f.model ?? "haiku", touches: f.touches ?? ["docs/guide.md"] });

test("auto_accept parses inline and block lists, fills defaults, and is off without the block", () => {
  assert.equal(parseAutoAcceptText('tasks:\n  accept_from: "2026-11-14"\n'), null);
  assert.equal(parseAutoAcceptText("project:\n  name: x\n"), null);
  assert.deepEqual(parseAutoAcceptText("tasks:\n  auto_accept:\n"), { ...AUTO_DEFAULTS, never: [...AUTO_DEFAULTS.never] });
  assert.deepEqual(parseAutoAcceptText(
    'tasks:\n  auto_accept:\n    max_model: sonnet # up to\n    max_touches: 2\n    never: ["a/**", \'b/**\']\nother: 1\n'),
    { max_model: "sonnet", max_touches: 2, never: ["a/**", "b/**"] });
  assert.deepEqual(parseAutoAcceptText(
    'tasks:\r\n  auto_accept:\r\n    # protected\r\n    never:\r\n      - "x/**"\r\n      - y.ts\r\n    max_touches: 1\r\n'),
    { max_model: "haiku", max_touches: 1, never: ["x/**", "y.ts"] });
});

test("parseAutoAccept reads a config file, and a missing file is off", () => {
  const dir = mkdtempSync(join(tmpdir(), "accept-auto-"));
  try {
    const p = join(dir, "config.yml");
    writeFileSync(p, "tasks:\n  auto_accept:\n    max_model: sonnet\n");
    assert.equal(parseAutoAccept(p).max_model, "sonnet");
    assert.equal(parseAutoAccept(join(dir, "nope.yml")), null);
    assert.equal(parseAutoAccept(undefined), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("globToRegex: ** spans directories, * stays in one segment", () => {
  assert.ok(globToRegex("**/auth/**").test("src/auth/login.ts"));
  assert.ok(globToRegex("**/auth/**").test("auth/x"));
  assert.ok(!globToRegex("src/*.ts").test("src/a/b.ts"));
  assert.ok(globToRegex("src/?.ts").test("src/a.ts"));
  assert.ok(globToRegex(".github/**").test(".github/workflows/ci.yml"));
});

test("touchesReachesNever is conservative about wildcards", () => {
  assert.equal(touchesReachesNever("src/auth/login.ts", "**/auth/**"), true);
  assert.equal(touchesReachesNever("src/**", "**/auth/**"), true, "a ** wildcard can reach auth/ anywhere");
  assert.equal(touchesReachesNever(".github/**", ".github/workflows/**"), true, "a wildcard over the protected dir");
  assert.equal(touchesReachesNever("src/*.ts", "src/secret/**"), true);
  assert.equal(touchesReachesNever("docs/guide.md", "**/auth/**"), false);
  assert.equal(touchesReachesNever("docs/*.md", ".github/**"), false);
});

test("a haiku task touching up to 3 safe paths qualifies", () => {
  assert.deepEqual(autoAcceptReasons(small(), POLICY), []);
  assert.deepEqual(autoAcceptReasons(small({ touches: ["a.md", "b.md", "c.md"] }), POLICY), []);
  assert.deepEqual(autoAcceptReasons({ model: "haiku", touchesList: ["a.md"] }, POLICY), [], "flow-doctor's shape");
});

test("too big a model, too many paths, no paths, or a protected path each disqualify, with the reason", () => {
  assert.match(autoAcceptReasons(small({ model: "opus" }), POLICY)[0], /model opus is above haiku/);
  assert.match(autoAcceptReasons(small({ model: "" }), POLICY)[0], /model sonnet is above haiku/, "unset model is sonnet");
  assert.match(autoAcceptReasons(small({ model: "gpt" }), POLICY)[0], /model gpt/);
  assert.match(autoAcceptReasons(small({ touches: ["a", "b", "c", "d"] }), POLICY)[0], /4 entries, over 3/);
  assert.match(autoAcceptReasons(small({ touches: [] }), POLICY)[0], /touches is empty/);
  assert.match(autoAcceptReasons(small({ touches: [".flow/bin/x.mjs"] }), POLICY)[0], /can reach ".flow\/bin\/\*\*"/);
  assert.match(autoAcceptReasons(small(), null)[0], /auto_accept is not set/);
  assert.match(autoAcceptReasons(small(), { ...POLICY, max_model: "huge" })[0], /max_model "huge"/);
  assert.match(autoAcceptReasons(small(), { ...POLICY, max_touches: 0 })[0], /max_touches "0"/);
});

test("flow-doctor re-checks an auto accept: a qualifying one passes, a false one is a problem", () => {
  const base = { id: "F-1", status: "ready", created: "2026-11-14", accepted_by: "auto",
    accepted_at: "2026-11-14T03:00:00Z", accepted_via: "auto" };
  const ok = acceptanceFindings([{ ...base, model: "haiku", touchesList: ["docs/a.md"] }], "2026-11-14", POLICY);
  assert.deepEqual(ok, { problems: [], warnings: [] });
  const bad = acceptanceFindings([{ ...base, model: "opus", touchesList: ["docs/a.md"] }], "2026-11-14", POLICY);
  assert.match(bad.problems[0], /^F-1: auto-accepted but does not qualify \(model opus is above haiku\)/);
  const off = acceptanceFindings([{ ...base, model: "haiku", touchesList: ["docs/a.md"] }], "2026-11-14", null);
  assert.match(off.problems[0], /auto_accept is not set/, "no policy means no auto accept is valid");
  const claimed = acceptanceFindings([{ ...base, status: "in_progress", model: "opus", touchesList: ["x"] }], "2026-11-14", POLICY);
  assert.deepEqual(claimed.problems, [], "only a task still waiting for work is re-checked");
});

test("readTaskFacts reads model and touches in both list forms", () => {
  assert.deepEqual(readTaskFacts('---\nmodel: "haiku"\ntouches: ["a.md", "b.md"] # two\n---\nbody'), { model: "haiku", touches: ["a.md", "b.md"] });
  assert.deepEqual(readTaskFacts('---\ntouches:\n  - "a.md"\n  - b.md\nlabels: []\n---\n'), { model: "", touches: ["a.md", "b.md"] });
  assert.deepEqual(readTaskFacts("no frontmatter"), { model: "", touches: [] });
  assert.deepEqual(readTaskFacts('---\ntouches:\n  - "a.md"\n  # the protected one\n  - ".github/x.yml"\n---\n').touches,
    ["a.md", ".github/x.yml"], "a comment inside the list does not cut it short");
});

test("the auto CLI says yes with exit 0, no with the reasons and exit 1, and usage with exit 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "accept-cli-"));
  try {
    const cfg = join(dir, "config.yml");
    writeFileSync(cfg, "tasks:\n  auto_accept:\n    max_touches: 2\n");
    const out = [];
    const log = (l) => out.push(l);
    const yes = '---\nmodel: "haiku"\ntouches: ["docs/a.md"]\n---\n';
    const no = '---\nmodel: "opus"\ntouches: ["src/auth/x.ts"]\n---\n';
    assert.equal(runAutoCli(["auto", "t.md", "--config", cfg], { read: () => yes, log }), 0);
    assert.equal(out.pop(), "auto-accept: yes");
    assert.equal(runAutoCli(["auto", "t.md", "--config", cfg], { read: () => no, log }), 1);
    assert.match(out.pop(), /^auto-accept: no — model opus is above haiku; touches "src\/auth\/x.ts" can reach/);
    assert.equal(runAutoCli(["auto"], { log }), 2);
    assert.match(out.pop(), /^usage:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
