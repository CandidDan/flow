// flow-pr-text.test.mjs — node --test. The proving tests for flow-0207: a task PR whose TL;DR is
// not in plain English fails the `flow-pr-text` check.
//
// The mechanical rules, the judge's verdict file and the model choice are tested here, directly
// and through the CLI. The workflow's own properties are tested in canonical only, by
// `.flow/bin/pr-text-workflow.test.mjs`, because an adopting repo has no reusable to read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  CHECK, DEFAULT_JUDGE_MODEL, MAX_WORDS, NO_VERDICT, configValue, decide, extractTldr,
  isPathToken, judgeModel, mechanicalReasons, parseJudgeReply, readVerdict, runCli,
  verdictFromExecution, wordCount,
} from "./flow-pr-text.mjs";
import { TIERS } from "./task-model.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const CLI = join(BIN, "flow-pr-text.mjs");

// PR #285's actual opening paragraph, as flow-0206's Context quotes it.
const PR_285 = "A flow-sync no longer drops a caller's own with: inputs. After it copies canonical's " +
  "caller and\npins it, the new flow-sync.mjs carry-inputs puts back every with: key the repo's " +
  "previous copy\nset on a Flow-reusable job, using the repo's value.";
// flow-0206's "good" rewrite of it.
const GOOD_0206 = "A Flow sync was deleting settings a repo had added to its own Flow config files — " +
  "in one repo, a pinned Node security fix. The sync now keeps them, and the sync PR lists them.";

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const sink = () => { let s = ""; return { write: (x) => { s += x; }, get text() { return s; } }; };
const passVerdict = JSON.stringify({ check: CHECK, verdict: "pass", summary: "Clear." });
const failVerdict = JSON.stringify({ check: CHECK, verdict: "fail", summary: "It never says who is affected." });

// ── extracting the TL;DR ────────────────────────────────────────────────────────────────

test("extractTldr: the first paragraph, up to the first blank line", () => {
  assert.equal(extractTldr("First line\nsecond line.\n\nSecond paragraph."), "First line\nsecond line.");
});

test("extractTldr: strips each TL;DR marker form", () => {
  for (const body of ["TL;DR: Plain text.", "**TL;DR** Plain text.", "TL;DR — Plain text.",
    "**TL;DR:** Plain text.", "TLDR - Plain text."]) {
    assert.equal(extractTldr(body), "Plain text.", body);
  }
});

test("extractTldr: skips an attribution comment, a byline and a heading before the summary", () => {
  const body = [
    '<!-- claude-projects-attribution: {"github_login":"someone"} -->',
    "_Requested by **Someone** · [project thread](https://example.com)_",
    "",
    "## TL;DR",
    "",
    "The real summary.",
    "",
    "## Details",
  ].join("\n");
  assert.equal(extractTldr(body), "The real summary.");
});

test("extractTldr: CRLF bodies split into paragraphs too", () => {
  assert.equal(extractTldr("One.\r\n\r\nTwo."), "One.");
});

// ── the mechanical rules: one test per rule ─────────────────────────────────────────────

test("rule: a missing TL;DR fails, saying it is missing", () => {
  for (const body of ["", "   \n\n  ", "<!-- only a comment -->", "## Only a heading"]) {
    const reasons = mechanicalReasons(extractTldr(body), { prefix: "flow" });
    assert.equal(reasons.length, 1, JSON.stringify(body));
    assert.match(reasons[0], /TL;DR is missing/);
  }
});

test("rule: an empty TL;DR after the marker is removed fails as missing", () => {
  const reasons = mechanicalReasons(extractTldr("**TL;DR:**\n\nThe rest."), { prefix: "flow" });
  // The marker paragraph is empty once stripped, so the TL;DR is "".
  assert.equal(extractTldr("**TL;DR:**"), "");
  assert.ok(reasons.length >= 1);
  const empty = mechanicalReasons(extractTldr("TL;DR:"), { prefix: "flow" });
  assert.deepEqual(empty.length, 1);
  assert.match(empty[0], /TL;DR is missing/);
});

test("rule: a backtick fails", () => {
  const r = mechanicalReasons("The `sync` step now keeps settings.", { prefix: "flow" });
  assert.equal(r.length, 1);
  assert.match(r[0], /backtick/);
});

test("rule: a task id in this repo's format fails, and names the id", () => {
  const r = mechanicalReasons("This finishes flow-0206 for everyone.", { prefix: "flow" });
  assert.equal(r.length, 1);
  assert.match(r[0], /task id flow-0206/);
  // The rule needs the prefix; another repo's prefix is not this repo's id.
  assert.deepEqual(mechanicalReasons("This finishes flow-0206 for everyone.", { prefix: "CAN" }), []);
  assert.equal(mechanicalReasons("Closes CAN-12 today.", { prefix: "CAN" }).length, 1);
});

test("rule: a file path fails", () => {
  for (const text of ["It edits docs/guide.md now.", "It reads ./config first.", "It writes ~/notes daily.",
    "It reads /etc/hosts first.", "It changes .flow/config.yml today."]) {
    const r = mechanicalReasons(text, { prefix: "flow" });
    assert.equal(r.length, 1, text);
    assert.match(r[0], /file path or file name/, text);
  }
});

test("rule: more than 60 words fails, and 60 words passes", () => {
  assert.deepEqual(mechanicalReasons(words(MAX_WORDS), { prefix: "flow" }), []);
  const r = mechanicalReasons(words(MAX_WORDS + 1), { prefix: "flow" });
  assert.equal(r.length, 1);
  assert.match(r[0], /61 words long; the limit is 60/);
});

test("rule: a body breaking two rules gets both reasons", () => {
  const r = mechanicalReasons("The `carry` fix for flow-0197 keeps settings.", { prefix: "flow" });
  assert.equal(r.length, 2);
  assert.match(r[0], /backtick/);
  assert.match(r[1], /task id flow-0197/);
});

test("PR #285's opening paragraph fails the mechanical rules", () => {
  const r = mechanicalReasons(extractTldr(PR_285), { prefix: "flow" });
  assert.ok(r.length >= 1);
  assert.ok(r.some((x) => /flow-sync\.mjs/.test(x)), r.join(" | "));
});

test("flow-0206's good example passes the mechanical rules", () => {
  assert.deepEqual(mechanicalReasons(extractTldr(GOOD_0206), { prefix: "flow" }), []);
});

test("isPathToken: file names and paths count, ordinary words and URLs-like prose do not", () => {
  for (const t of ["flow-sync.mjs", "README.md", "(docs/a.md)", "src/x.ts,", ".env", "~/bin", "./a"]) {
    assert.equal(isPathToken(t), true, t);
  }
  for (const t of ["sync", "e.g.", "Node", "it.", "and/or", "3.5", "", "U.S."]) {
    assert.equal(isPathToken(t), false, t);
  }
});

test("wordCount: counts tokens holding a letter or digit, not dashes or bullets", () => {
  assert.equal(wordCount("one — two - three"), 3);
  assert.equal(wordCount(""), 0);
});

// ── the judge's model ───────────────────────────────────────────────────────────────────

test("judge model: unset defaults to the haiku tier from task-model", () => {
  assert.equal(DEFAULT_JUDGE_MODEL, TIERS.haiku);
  assert.equal(judgeModel(""), TIERS.haiku);
  assert.equal(judgeModel("review:\n  model: other\n"), TIERS.haiku);
  assert.equal(judgeModel("review:\n  # pr_text_model: x\n"), TIERS.haiku);
});

test("judge model: a configured value is used, quoted or not", () => {
  assert.equal(judgeModel("review:\n  pr_text_model: my-model-1\n"), "my-model-1");
  assert.equal(judgeModel('review:\n  pr_text_model: "my-model-2"  # why\n'), "my-model-2");
  assert.equal(judgeModel("review:\n  pr_text_model: my-model-3 # why\nother:\n  pr_text_model: no\n"), "my-model-3");
});

test("judge model: a value that is not a bare identifier throws", () => {
  assert.throws(() => judgeModel("review:\n  pr_text_model: a b; rm\n"), /not a usable model name/);
});

test("configValue: reads only directly under the named section", () => {
  const cfg = "project:\n  name: flow\nreview:\n  model: x\n";
  assert.equal(configValue(cfg, "project", "name"), "flow");
  assert.equal(configValue(cfg, "review", "name"), "");
  assert.equal(configValue(cfg, "missing", "name"), "");
});

// ── the judge's reply and the verdict file ──────────────────────────────────────────────

test("parseJudgeReply: PASS, FAIL with a reason, and anything else is no verdict", () => {
  assert.equal(parseJudgeReply("PASS").verdict, "pass");
  assert.deepEqual(parseJudgeReply("FAIL: it never says who is affected.\nmore"),
    { verdict: "fail", summary: "it never says who is affected." });
  assert.equal(parseJudgeReply("**FAIL** — vague").summary, "vague");
  assert.equal(parseJudgeReply("FAIL"), null);
  assert.equal(parseJudgeReply("I think it passes."), null);
  assert.equal(parseJudgeReply(""), null);
});

test("verdictFromExecution: the last result message, parsed; junk gives null", () => {
  const exec = JSON.stringify([
    { type: "system" },
    { type: "result", result: "FAIL: first" },
    { type: "result", result: "PASS" },
  ]);
  assert.deepEqual(verdictFromExecution(exec), { check: CHECK, verdict: "pass", summary: parseJudgeReply("PASS").summary });
  assert.equal(verdictFromExecution("not json"), null);
  assert.equal(verdictFromExecution("{}"), null);
  assert.equal(verdictFromExecution(JSON.stringify([{ type: "assistant" }])), null);
  assert.equal(verdictFromExecution(JSON.stringify([{ type: "result", result: "maybe" }])), null);
});

test("readVerdict: only a well-formed flow-pr-text verdict counts", () => {
  assert.equal(readVerdict(passVerdict).verdict, "pass");
  assert.equal(readVerdict("{"), null);
  assert.equal(readVerdict(JSON.stringify({ check: "qa", verdict: "pass", summary: "x" })), null);
  assert.equal(readVerdict(JSON.stringify({ check: CHECK, verdict: "maybe", summary: "x" })), null);
  assert.equal(readVerdict(JSON.stringify({ check: CHECK, verdict: "pass" })), null);
});

// ── the decision ────────────────────────────────────────────────────────────────────────

test("decide: mechanical failures fail, list every reason, quote the TL;DR, and the judge was not asked", () => {
  const d = decide({ tldr: "bad `x`", reasons: ["r1", "r2"], judged: false, verdictText: null });
  assert.equal(d.pass, false);
  assert.match(d.summary, /- r1\n- r2/);
  assert.match(d.summary, /> bad `x`/);
  assert.match(d.summary, /judge was not asked/);
});

test("decide: a FAIL verdict file fails with the judge's sentence", () => {
  const d = decide({ tldr: "t", reasons: [], judged: true, verdictText: failVerdict });
  assert.equal(d.pass, false);
  assert.match(d.summary, /never says who is affected/);
  assert.doesNotMatch(d.summary, /no verdict/);
});

test("decide: a missing verdict file fails, saying the judge returned no verdict", () => {
  const d = decide({ tldr: "t", reasons: [], judged: true, verdictText: null });
  assert.equal(d.pass, false);
  assert.ok(d.summary.includes(NO_VERDICT));
});

test("decide: an unparseable verdict file fails, saying the judge returned no verdict", () => {
  for (const v of ["", "garbage", JSON.stringify({ verdict: "pass" })]) {
    const d = decide({ tldr: "t", reasons: [], judged: true, verdictText: v });
    assert.equal(d.pass, false, v);
    assert.ok(d.summary.includes(NO_VERDICT), v);
  }
});

test("decide: a PASS verdict file passes", () => {
  const d = decide({ tldr: "t", reasons: [], judged: true, verdictText: passVerdict });
  assert.equal(d.pass, true);
  assert.match(d.summary, /\*\*PASS\*\* — Clear\./);
});

test("decide: mechanical pass with no judge run passes and says the judge did not run", () => {
  const d = decide({ tldr: "", reasons: [], judged: false, verdictText: null });
  assert.equal(d.pass, true);
  assert.match(d.summary, /judge did not run/);
  assert.match(d.summary, /> \(empty\)/);
});

// ── the CLI ─────────────────────────────────────────────────────────────────────────────

function fixture({ body = GOOD_0206, title = "[flow-0207] A title", config = "project:\n  name: flow\n" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pr-text-"));
  writeFileSync(join(dir, "body.md"), body);
  writeFileSync(join(dir, "title.txt"), title);
  writeFileSync(join(dir, "config.yml"), config);
  return dir;
}
const rulesArgs = (dir, headRef = "claude/x") => ["rules", "--body-file", join(dir, "body.md"),
  "--title-file", join(dir, "title.txt"), "--head-ref", headRef, "--config", join(dir, "config.yml"),
  "--out-dir", dir];

test("CLI rules: a passing task PR reports mechanical=pass and the judge's model, and makes no model call", () => {
  const dir = fixture();
  const out = sink();
  assert.equal(runCli(rulesArgs(dir), { out }), 0);
  assert.equal(out.text, `skip=false\nmechanical=pass\nmodel=${TIERS.haiku}\n`);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "reasons.json"), "utf8")), []);
  assert.equal(readFileSync(join(dir, "tldr.txt"), "utf8"), GOOD_0206);
});

test("CLI rules: a failing TL;DR reports mechanical=fail with every reason on file", () => {
  const dir = fixture({ body: PR_285 });
  const out = sink();
  assert.equal(runCli(rulesArgs(dir), { out }), 0);
  assert.match(out.text, /mechanical=fail/);
  assert.ok(JSON.parse(readFileSync(join(dir, "reasons.json"), "utf8")).length >= 1);
});

test("CLI rules: a PR with no task id, or a sync or release PR, is skipped", () => {
  for (const [headRef, title, why] of [
    ["claude/x", "No id here", /no task id/],
    ["intent/new-thing", "Add an intent", /no task id/],
    ["flow-sync/v5.1.0", "[flow-0001] sync", /flow-sync PR is not a task PR/],
    ["release/v5.1.0", "[flow-0001] release", /release PR is not a task PR/],
  ]) {
    const dir = fixture({ title });
    const out = sink();
    assert.equal(runCli(rulesArgs(dir, headRef), { out }), 0);
    assert.match(out.text, /^skip=true\nskip_reason=/);
    assert.match(out.text, why);
    assert.equal(existsSync(join(dir, "reasons.json")), false);
  }
});

test("CLI rules: a task id on a flow/ branch is enough without one in the title", () => {
  const dir = fixture({ title: "No id" });
  const out = sink();
  runCli(rulesArgs(dir, "flow/flow-0207-x"), { out });
  assert.match(out.text, /^skip=false/);
});

test("CLI rules: a malformed model value or a missing --out-dir exits 2", () => {
  const dir = fixture({ config: "review:\n  pr_text_model: a;b\n" });
  const err = sink();
  assert.equal(runCli(rulesArgs(dir), { out: sink(), err }), 2);
  assert.match(err.text, /not a usable model name/);
  assert.equal(runCli(["rules"], { out: sink(), err: sink() }), 2);
});

test("CLI extract: writes the verdict file only when the reply parses", () => {
  const dir = fixture();
  const exec = join(dir, "exec.json");
  const dest = join(dir, "verdict.json");
  writeFileSync(exec, JSON.stringify([{ type: "result", result: "FAIL: unclear who benefits" }]));
  const out = sink();
  assert.equal(runCli(["extract", "--execution-file", exec, "--verdict-out", dest], { out }), 0);
  assert.equal(readVerdict(readFileSync(dest, "utf8")).verdict, "fail");
  assert.match(out.text, /judge said FAIL/);

  const dir2 = fixture();
  const out2 = sink();
  const dest2 = join(dir2, "verdict.json");
  assert.equal(runCli(["extract", "--execution-file", join(dir2, "none.json"), "--verdict-out", dest2], { out: out2 }), 0);
  assert.equal(existsSync(dest2), false);
  assert.ok(out2.text.includes(NO_VERDICT));
  assert.equal(runCli(["extract"], { out: sink(), err: sink() }), 2);
});

test("CLI enforce: exits 1 on a failing verdict, 0 on a passing one, 1 with no verdict file", () => {
  const dir = fixture();
  runCli(rulesArgs(dir), { out: sink() });
  const vf = join(dir, "verdict.json");

  const outMissing = sink();
  assert.equal(runCli(["enforce", "--out-dir", dir, "--judged", "true"], { out: outMissing }), 1);
  assert.ok(outMissing.text.includes(NO_VERDICT));

  writeFileSync(vf, failVerdict);
  assert.equal(runCli(["enforce", "--out-dir", dir, "--judged", "true"], { out: sink() }), 1);

  writeFileSync(vf, passVerdict);
  assert.equal(runCli(["enforce", "--out-dir", dir, "--judged", "true"], { out: sink() }), 0);

  // Not judged: the verdict file is not read at all.
  writeFileSync(vf, failVerdict);
  assert.equal(runCli(["enforce", "--out-dir", dir, "--judged", "false"], { out: sink() }), 0);
});

test("CLI enforce: no or malformed mechanical result fails closed", () => {
  const dir = fixture();
  const out = sink();
  assert.equal(runCli(["enforce", "--out-dir", dir, "--judged", "false"], { out }), 1);
  assert.match(out.text, /produced no result/);
  writeFileSync(join(dir, "reasons.json"), "{}");
  const out2 = sink();
  assert.equal(runCli(["enforce", "--out-dir", dir, "--judged", "false"], { out: out2 }), 1);
  assert.match(out2.text, /malformed/);
  assert.equal(runCli(["enforce"], { out: sink(), err: sink() }), 2);
});

test("CLI: an unknown subcommand prints usage and exits 2; the script runs as a program", () => {
  const err = sink();
  assert.equal(runCli(["nope"], { out: sink(), err }), 2);
  assert.match(err.text, /usage/);
  const r = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/);
});
