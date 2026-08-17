// protocol-docs.test.mjs — proving tests for canonical's root CLAUDE.md and .gitattributes.
//
// A protocol document is the one artefact with no natural failure mode: it can be confidently,
// silently wrong for months. It points at a file someone moved. It quotes a coverage floor that
// was raised. It grows until nobody reads it, and the session it exists to orient improvises
// instead — which is the exact failure canonical had before this file: no root CLAUDE.md at all,
// so every worker session started with no protocol and the hand-off had to paste it in by hand.
//
// These tests give the doc a failure mode. They are cheap and they are specific: paths must
// resolve, the quoted floor must match the enforced one, the length ceiling must hold, and the
// claims about what is deliberately absent must stay true.
//
// Criteria proved here (flow-0009): all of them except the final gate-passes criterion, which is
// proved by the gate itself.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const FLOW = resolve(BIN, "..");
const REPO = resolve(FLOW, "..");

const CLAUDE_MD = join(REPO, "CLAUDE.md");
const GITATTRIBUTES = join(REPO, ".gitattributes");

const doc = existsSync(CLAUDE_MD) ? readFileSync(CLAUDE_MD, "utf8") : "";

// Paths the doc explicitly claims are absent on purpose. Asserting their ABSENCE pins the claim
// in both directions: if someone adds one, this test fails and the doc must be updated to stop
// telling the next session it isn't there. That is the intended behaviour, not a nuisance.
const EXPECTED_ABSENT = [
  ".claude/agents",      // flow-0007 moves the three review agents into CI; canonical adopts after
  ".flow/VERSION",       // canonical is the comparison target; root VERSION is the single source
  ".flow/board.html",    // superseded by flightdeck/ for this repo (flow-0004)
];

// Pull repo-relative paths out of inline code spans. Deliberately conservative: a token counts as
// a path only if it contains a slash or ends in a known extension, and anything carrying glob or
// placeholder syntax, whitespace, or code punctuation is skipped — `_flow-*.yml`, `flow/<id>-…`,
// `dirname(realpath(import.meta.url))/..` and a bare `.mjs` are prose about paths, not paths.
export function extractPaths(markdown) {
  const spans = [...markdown.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
  const out = new Set();
  for (const raw of spans) {
    if (/[<>*()\s…]/.test(raw)) continue;                  // globs, placeholders, code, prose
    if (/^\.[a-z]+$/i.test(raw)) continue;                 // a bare extension like `.mjs`
    const looksLikePath = raw.includes("/") || /\.(md|ya?ml|mjs|json|html)$/i.test(raw);
    if (!looksLikePath) continue;
    out.add(raw.replace(/\/+$/, ""));                      // normalise a trailing slash
  }
  return [...out].sort();
}

test("root CLAUDE.md and .gitattributes both exist and are non-empty", () => {
  assert.ok(existsSync(CLAUDE_MD), "canonical must have a root CLAUDE.md — Claude Code loads no other");
  assert.ok(existsSync(GITATTRIBUTES), ".gitattributes must exist");
  assert.ok(doc.trim().length > 0, "CLAUDE.md must not be empty");
  assert.ok(readFileSync(GITATTRIBUTES, "utf8").trim().length > 0, ".gitattributes must not be empty");
});

test("CLAUDE.md defers to project-template/CLAUDE.md as the authoritative protocol", () => {
  assert.match(doc, /project-template\/CLAUDE\.md/,
    "the root doc must point at the protocol rather than replace it");
  assert.match(doc, /protocol/i);
});

test("every repo-relative path CLAUDE.md names actually exists", () => {
  const paths = extractPaths(doc);
  assert.ok(paths.length >= 8, `expected the doc to reference real paths; extracted ${paths.length}`);

  const missing = paths.filter((p) => !EXPECTED_ABSENT.includes(p) && !existsSync(join(REPO, p)));
  assert.deepEqual(missing, [],
    `CLAUDE.md points at path(s) that do not exist: ${missing.join(", ")}. ` +
    `Either fix the reference or, if the absence is deliberate, add it to EXPECTED_ABSENT with a reason.`);
});

test("the paths CLAUDE.md says are deliberately absent really are absent", () => {
  for (const p of EXPECTED_ABSENT) {
    assert.equal(existsSync(join(REPO, p)), false,
      `${p} now exists, but CLAUDE.md still tells the next session it is absent on purpose — update the doc`);
  }
});

test("CLAUDE.md stays a pointer, not a second copy of the protocol", () => {
  const lines = doc.split("\n").length;
  assert.ok(lines < 200,
    `CLAUDE.md is ${lines} lines. The ceiling is the forcing function that keeps it from ` +
    `drifting into a duplicate of project-template/CLAUDE.md.`);
});

test("CLAUDE.md states the two-planes rule — the one a fresh session most often breaks", () => {
  assert.match(doc, /\.flow\/tasks\//, "it must name the store path the guard protects");
  assert.match(doc, /branch/i);
  assert.match(doc, /main/);
  assert.ok(/fails the gate|store-guard/i.test(doc),
    "it must say that a PR touching the store fails, not merely that it shouldn't");
});

test("CLAUDE.md names all five gate commands from .flow/config.yml", () => {
  const cfg = readFileSync(join(FLOW, "config.yml"), "utf8");
  const commands = ["install", "build", "lint", "test", "coverage"]
    .map((k) => cfg.match(new RegExp(`^\\s*${k}:\\s*"([^"]+)"`, "m")))
    .filter(Boolean)
    .map((m) => m[1]);

  assert.equal(commands.length, 5, "config.yml must declare all five commands");
  for (const cmd of commands) {
    assert.ok(doc.includes(cmd),
      `CLAUDE.md must name the "${cmd}" command — a session that does not know it skips the gate`);
  }
});

test("the coverage floor CLAUDE.md quotes matches the one actually enforced", () => {
  const cfg = readFileSync(join(FLOW, "config.yml"), "utf8");
  const declared = Number(cfg.match(/^coverage_min:\s*([\d.]+)/m)[1]);

  assert.ok(doc.includes(String(declared)),
    `CLAUDE.md must quote the real floor (${declared}). A doc citing a stale floor teaches the ` +
    `next session a number the gate will disagree with.`);
});

test(".gitattributes marks the generated board files", () => {
  const attrs = readFileSync(GITATTRIBUTES, "utf8");
  assert.match(attrs, /^\.flow\/board\.html\s+linguist-generated=true$/m);
  assert.match(attrs, /^\.flow\/board-edits\.json\s+linguist-generated=true$/m);
});

test("extractPaths ignores globs, placeholders and code — not just real paths", () => {
  const sample = [
    "see `project-template/CLAUDE.md` and `.flow/config.yml`",
    "the `_flow-*.yml` reusables and a `flow/<id>-slug` branch",     // glob + placeholder
    "resolved as `dirname(realpath(import.meta.url))/..`",           // code, not a path
    "every tracked `.mjs`",                                          // bare extension
    "run `npm run build` first",                                     // has whitespace
  ].join("\n");

  assert.deepEqual(extractPaths(sample), [".flow/config.yml", "project-template/CLAUDE.md"]);
});
