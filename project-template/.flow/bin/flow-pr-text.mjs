#!/usr/bin/env node
// flow-pr-text.mjs — the `flow-pr-text` check: is a task PR's TL;DR in plain English? (flow-0207)
//
// The protocol (flow-0206) says a PR description's first paragraph, its TL;DR, says what was wrong
// and what changes, for whom, in words a person who has not read the code understands: no
// backticks, no file paths, no task ids, no code names, at most 60 words. The qa, security and
// code-review checks judge the code, not the description, so until this check the session that
// wrote the code was the only judge of its own description.
//
// Two halves, cheapest first:
//   1. MECHANICAL RULES, in code, no model. Every rule that fails is reported, not only the first.
//   2. THE JUDGE, a single model call on a low-cost model, made only when every mechanical rule
//      passes. It sees the TL;DR and the PR title and nothing else, gets no tools and one turn,
//      and answers PASS, or FAIL with one sentence saying what a reader would not understand.
//
// The judge has no tools, so it cannot write a file. Its reply comes back in claude-code-action's
// execution file, and `extract` (code, not a model) turns that reply into the verdict file. The
// step that decides pass or fail, `enforce`, reads the verdict file and nothing else from the
// model step: the flow-0186 pattern the review checks use. A missing or unparseable verdict fails
// the check and says the judge returned no verdict, which is a different message from "the text
// failed".
//
//   node flow-pr-text.mjs rules   --body-file B --title-file T --head-ref R --config C --out-dir D
//   node flow-pr-text.mjs extract --execution-file E --verdict-out V
//   node flow-pr-text.mjs enforce --out-dir D --judged true|false
//
// The PR body is attacker-controlled text, so it only ever arrives by file, never on a command
// line. This file runs from canonical's tree, fetched at the reusable's own commit, so every path
// it reads is passed in; nothing is resolved relative to this file.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { parseTaskId } from "./parse-task-id.mjs";
import { TIERS } from "./task-model.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export const CHECK = "flow-pr-text";
export const MAX_WORDS = 60;
/** The judge's model when `review.pr_text_model` is unset: the haiku tier, from the one table. */
export const DEFAULT_JUDGE_MODEL = TIERS.haiku;
export const NO_VERDICT =
  "The judge returned no verdict (no reply, or a reply that was not PASS or FAIL). This says " +
  "nothing about the text: re-run the check.";
/** Branch prefixes of PRs that are not task PRs, even if a title happens to carry an id. */
export const NOT_TASK_BRANCHES = Object.freeze(["flow-sync/", "release/"]);

// ── extracting the TL;DR ────────────────────────────────────────────────────────────────

/**
 * A paragraph that is not prose: only HTML comments, a heading, or a byline (every line wholly in
 * `_…_` or `*…*`). A PR opened from a Claude project thread starts with an attribution comment and
 * an italic "Requested by" line, and a description may open with a `## TL;DR` heading. None of
 * those is the summary, so they are skipped before the first paragraph is taken.
 */
function isPreamble(paragraph) {
  const withoutComments = paragraph.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (withoutComments === "") return true;
  const lines = withoutComments.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.every((l) => /^#{1,6}\s/.test(l))) return true;
  return lines.every((l) => /^_[^_].*_$/.test(l) || /^\*[^*].*\*$/.test(l));
}

const MARKER = /^\s*(?:\*\*|__)?TL;?DR(?:\*\*|__)?\s*(?:\*\*|__)?\s*[:—–-]?\s*(?:\*\*|__)?\s*/i;

/** The TL;DR: the first prose paragraph, with a leading `TL;DR` marker removed. "" if none. */
export function extractTldr(body) {
  const text = String(body ?? "").replace(/\r\n?/g, "\n");
  const paragraphs = text.split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);
  const first = paragraphs.find((p) => !isPreamble(p));
  if (!first) return "";
  return first.replace(MARKER, "").trim();
}

// ── the mechanical rules ────────────────────────────────────────────────────────────────

// File extensions that make a bare file name (no `/`) a code name. The spec's path rule is a
// token with a `/` and an extension, or one starting with `.`, `/` or `~/`. That alone passes
// PR #285's opening, whose code name was the bare `flow-sync.mjs`, so a lower-case file name with
// a source or config extension counts too, as does an upper-case `*.md` file (README.md).
const CODE_EXT = "mjs|cjs|js|jsx|ts|tsx|json|ya?ml|toml|md|sh|py|rb|go|rs|lock|html|css|sql";
const BARE_FILE = new RegExp(`^[a-z0-9_][a-z0-9._-]*\\.(?:${CODE_EXT})$`);
const UPPER_DOC = /^[A-Z][A-Z0-9_-]*\.md$/;

/** True when one whitespace-separated token reads as a file path or file name. */
export function isPathToken(raw) {
  const t = String(raw ?? "").replace(/^[("'[*_]+/, "").replace(/[)"'\]*_,;:!?.]+$/, "");
  if (!t) return false;
  if (/^(?:~\/|\.{1,2}\/|\/[\w.])/.test(t)) return true;
  if (/^\.[A-Za-z0-9_]/.test(t)) return true;
  if (t.includes("/") && /\.[A-Za-z0-9]{1,8}$/.test(t)) return true;
  return BARE_FILE.test(t) || UPPER_DOC.test(t);
}

/** Words, for the length rule: whitespace-separated tokens holding a letter or a digit. */
export function wordCount(text) {
  return String(text ?? "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every mechanical rule the TL;DR breaks, as a sentence a person can act on. Empty means it passes.
 * `prefix` is the repo's task-id prefix (`project.name`); without one, the id rule cannot run.
 */
export function mechanicalReasons(tldr, { prefix = "" } = {}) {
  const t = String(tldr ?? "").trim();
  if (!t) {
    return ["The TL;DR is missing: the description must open with a paragraph saying what was " +
      "wrong and what changes, for whom."];
  }
  const reasons = [];
  if (t.includes("`")) reasons.push("It contains a backtick. Code formatting means a code name; say what it does instead.");
  if (prefix) {
    const id = t.match(new RegExp(`\\b${escapeRe(prefix)}-\\d+\\b`, "i"));
    if (id) reasons.push(`It contains the task id ${id[0]}. Task ids belong in the sections below the TL;DR.`);
  }
  const paths = t.split(/\s+/).filter(isPathToken);
  if (paths.length) reasons.push(`It contains a file path or file name (${paths.join(", ")}). Say what the file does instead.`);
  const words = wordCount(t);
  if (words > MAX_WORDS) reasons.push(`It is ${words} words long; the limit is ${MAX_WORDS}.`);
  return reasons;
}

// ── config ──────────────────────────────────────────────────────────────────────────────

/** The value of `key:` directly under the top-level `section:` of a config file, or "". */
export function configValue(text, section, key) {
  const lines = String(text ?? "").split("\n");
  const start = lines.findIndex((l) => new RegExp(`^${section}:\\s*(?:#.*)?$`).test(l));
  if (start === -1) return "";
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    const m = lines[i].match(new RegExp(`^\\s+${key}:\\s*(.*)$`));
    if (m) {
      const v = m[1].trim();
      const quoted = v.match(/^"([^"]*)"/) || v.match(/^'([^']*)'/);
      return quoted ? quoted[1] : v.replace(/\s+#.*$/, "").trim();
    }
  }
  return "";
}

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The judge's model: `review.pr_text_model`, or the haiku tier. A malformed value throws. */
export function judgeModel(configText) {
  const v = configValue(configText, "review", "pr_text_model");
  if (!v) return DEFAULT_JUDGE_MODEL;
  if (!MODEL_RE.test(v)) {
    throw new Error(`review.pr_text_model = ${JSON.stringify(v)} is not a usable model name: it ` +
      "is passed as --model <value>, so it must be a bare identifier.");
  }
  return v;
}

// ── the judge's reply ───────────────────────────────────────────────────────────────────

/** `{ verdict, summary }` from the judge's reply, or null when it is not PASS or FAIL. */
export function parseJudgeReply(text) {
  const first = String(text ?? "").trim().split("\n")[0]?.trim() ?? "";
  const m = first.match(/^\**(PASS|FAIL)\b\**\s*[:—–-]?\s*(.*)$/);
  if (!m) return null;
  if (m[1] === "PASS") return { verdict: "pass", summary: m[2].trim() || "A reader who has not read the code would understand it." };
  const why = m[2].trim();
  return why ? { verdict: "fail", summary: why } : null;
}

/**
 * The verdict object from claude-code-action's execution file (the SDK message stream as a JSON
 * array): the last `result` message's text, parsed. Null when the file is missing, unreadable,
 * has no result, or the reply is neither PASS nor FAIL.
 */
export function verdictFromExecution(text) {
  let msgs;
  try { msgs = JSON.parse(String(text ?? "")); } catch { return null; }
  if (!Array.isArray(msgs)) return null;
  const result = msgs.filter((m) => m && m.type === "result" && typeof m.result === "string").pop();
  if (!result) return null;
  const parsed = parseJudgeReply(result.result);
  return parsed ? { check: CHECK, ...parsed } : null;
}

/** A verdict file's content, validated: `{ verdict, summary }`, or null when it is not one. */
export function readVerdict(text) {
  let v;
  try { v = JSON.parse(String(text ?? "")); } catch { return null; }
  if (!v || v.check !== CHECK || !["pass", "fail"].includes(v.verdict) || typeof v.summary !== "string") return null;
  return { verdict: v.verdict, summary: v.summary };
}

// ── the decision ────────────────────────────────────────────────────────────────────────

const quote = (t) => (t ? t.split("\n").map((l) => `> ${l}`).join("\n") : "> (empty)");

/**
 * Pass or fail, and the summary that says why. `reasons` are the mechanical failures. `judged`
 * says whether the judge was meant to run; then `verdictText` is the verdict file's content, or
 * null when there is no file.
 */
export function decide({ tldr, reasons, judged, verdictText }) {
  const lines = [`### ${CHECK}`, ""];
  if (reasons.length) {
    lines.push("**FAIL** — the TL;DR breaks these rules (the judge was not asked):", "");
    for (const r of reasons) lines.push(`- ${r}`);
    lines.push("", "The TL;DR it judged:", "", quote(tldr));
    return { pass: false, summary: lines.join("\n") + "\n" };
  }
  if (!judged) {
    lines.push("**PASS** — the mechanical rules pass. The judge did not run (it needs `FLOW_AI` " +
      "and the model credential, and never runs on a fork PR).", "", quote(tldr));
    return { pass: true, summary: lines.join("\n") + "\n" };
  }
  const v = verdictText === null || verdictText === undefined ? null : readVerdict(verdictText);
  if (!v) {
    lines.push(`**FAIL** — ${NO_VERDICT}`, "", "The TL;DR it was given:", "", quote(tldr));
    return { pass: false, summary: lines.join("\n") + "\n" };
  }
  if (v.verdict === "fail") {
    lines.push("**FAIL** — the judge says a reader who has not read the code would not understand it:",
      "", `- ${v.summary}`, "", "The TL;DR it judged:", "", quote(tldr));
    return { pass: false, summary: lines.join("\n") + "\n" };
  }
  lines.push(`**PASS** — ${v.summary}`, "", quote(tldr));
  return { pass: true, summary: lines.join("\n") + "\n" };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}
const readOr = (p, dflt = "") => (p && existsSync(p) ? readFileSync(p, "utf8") : dflt);

/** `rules`: skip or not, the mechanical verdict, the judge's model. Lines go to $GITHUB_OUTPUT. */
export function runRules(argv, out) {
  const outDir = flag(argv, "--out-dir");
  const body = readOr(flag(argv, "--body-file"));
  const title = readOr(flag(argv, "--title-file")).trim();
  const headRef = flag(argv, "--head-ref") ?? "";
  const config = readOr(flag(argv, "--config"));
  if (!outDir) throw new Error("rules needs --out-dir");

  let skip = "";
  if (NOT_TASK_BRANCHES.some((p) => headRef.startsWith(p))) skip = `a ${headRef.split("/")[0]} PR is not a task PR`;
  else if (!parseTaskId(headRef, title)) skip = "no task id in the branch or the title, so this is not a task PR";
  if (skip) {
    out.write(`skip=true\nskip_reason=${skip}\n`);
    return 0;
  }
  const tldr = extractTldr(body);
  const reasons = mechanicalReasons(tldr, { prefix: configValue(config, "project", "name") });
  writeFileSync(join(outDir, "tldr.txt"), tldr);
  writeFileSync(join(outDir, "reasons.json"), JSON.stringify(reasons) + "\n");
  out.write(`skip=false\nmechanical=${reasons.length ? "fail" : "pass"}\nmodel=${judgeModel(config)}\n`);
  return 0;
}

export function runCli(argv, { out = process.stdout, err = process.stderr } = {}) {
  const cmd = argv[0];
  try {
    if (cmd === "rules") return runRules(argv, out);
    if (cmd === "extract") {
      const dest = flag(argv, "--verdict-out");
      if (!dest) throw new Error("extract needs --verdict-out");
      const v = verdictFromExecution(readOr(flag(argv, "--execution-file"), ""));
      if (v) writeFileSync(dest, JSON.stringify(v) + "\n");
      out.write(v ? `${CHECK}: judge said ${v.verdict.toUpperCase()}\n` : `${CHECK}: ${NO_VERDICT}\n`);
      return 0;
    }
    if (cmd === "enforce") {
      const dir = flag(argv, "--out-dir");
      if (!dir) throw new Error("enforce needs --out-dir");
      let reasons;
      try { reasons = JSON.parse(readFileSync(join(dir, "reasons.json"), "utf8")); }
      catch { reasons = ["The mechanical rules produced no result, so the check cannot pass."]; }
      const verdictPath = join(dir, "verdict.json");
      const { pass, summary } = decide({
        tldr: readOr(join(dir, "tldr.txt")),
        reasons: Array.isArray(reasons) ? reasons.map(String) : ["The mechanical rules result is malformed."],
        judged: flag(argv, "--judged") === "true",
        verdictText: existsSync(verdictPath) ? readFileSync(verdictPath, "utf8") : null,
      });
      out.write(summary);
      return pass ? 0 : 1;
    }
  } catch (e) {
    err.write(`${CHECK}: ${e.message}\n`);
    return 2;
  }
  err.write("usage: flow-pr-text.mjs rules|extract|enforce … (see the header)\n");
  return 2;
}

if (__isMain) process.exitCode = runCli(process.argv.slice(2));
