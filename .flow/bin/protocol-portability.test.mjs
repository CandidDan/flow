// protocol-portability.test.mjs — proving tests for the vendor-neutral protocol (flow-0006).
//
// The protocol used to BE `project-template/CLAUDE.md`. It is now `project-template/.flow/
// PROTOCOL.md`, and CLAUDE.md / AGENTS.md are thin pointers to that one copy. Both halves of
// that change have the same nasty property: they fail silently.
//
//   * A lossy move looks fine. Nothing re-reads the old file, so a section dropped in the
//     copy-paste is simply gone, and the first symptom is a session breaking a rule nobody
//     noticed had disappeared.
//   * A pointer that does not resolve looks fine too — better than fine, because the repo now
//     LOOKS like it has adopted the protocol. Claude Code skips imports inside code spans and
//     fenced blocks, so one stray backtick turns the import into prose with no warning at all.
//
// So these tests pin both: the move was byte-for-byte lossless, and the pointer is written in a
// form the host actually expands. Criteria proved here (flow-0006): 1, 2, 3, 5, 6, and the
// static half of 4. The behavioural half of 4 needs a live agent session and is opt-in below.

import { existsSync, readFileSync, readdirSync, mkdtempSync, cpSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");

const PROTOCOL_PATH = join(TEMPLATE, ".flow/PROTOCOL.md");
const CLAUDE_PATH = join(TEMPLATE, "CLAUDE.md");
const AGENTS_PATH = join(TEMPLATE, "AGENTS.md");

const protocol = readFileSync(PROTOCOL_PATH, "utf8");
const claude = readFileSync(CLAUDE_PATH, "utf8");
const agents = readFileSync(AGENTS_PATH, "utf8");

// The import line exactly as Claude Code must see it: bare, own line, no backticks, no fence.
// Relative paths resolve against the file containing the import, so this is TEMPLATE-relative.
const IMPORT_LINE = "@.flow/PROTOCOL.md";
const PROTOCOL_REF = ".flow/PROTOCOL.md";

// SHA-256 of each protocol section's body (everything under the `## ` heading, up to the next
// one) as it stood in `project-template/CLAUDE.md` immediately BEFORE this task moved it.
//
// A digest rather than a copy, deliberately: criterion 3 requires exactly one copy of the
// protocol in this repo, so the expectation cannot be a second one. It also needs no git
// history, which a shallow CI checkout would not have.
//
// UPDATED BY flow-0007 (two entries, marked below). That task moved the three Definition-of-Done
// reviewers out of the worker's session and onto the PR, so "The gate" and "The loop you run" had
// to say where they now run. The digests were recomputed in the same commit as the edit, which is
// the procedure the failure message below prescribes — not relaxed to make a change go green.
//
// These pin that the MOVE was lossless. They are not a freeze on the protocol: an intentional
// edit to `.flow/PROTOCOL.md` is expected to fail this test, and the fix is to re-run the
// digest in the SAME commit that makes the edit (see the failure message), not to relax it.
// Same two-directional pin as EXPECTED_ABSENT in protocol-docs.test.mjs.
const PRE_MOVE_SECTION_DIGESTS = [
  ["Response style — always TL;DR", "3542b8b979ddb4efa71684a0dace416e60ccc84ba754183e18f6b4605abeee6f"],
  ["The store", "c6dcbc3bb200de6b31be37d0e0d9ca619b6fb8c1a073e527703d8aa6e5af914a"],
  ["Status lifecycle", "c2f7d6a2d54fe4ac3ed8585cffb4fa0a805e9f372e4d7f9288805fece9712273"],   // rewritten by flow-0039
  ["Concurrency — how parallel sessions don't collide", "42bbc5aa8e43eb1371eaae9b43fcb0d68cf7973df33844914d1137209bb49f6c"],   // rewritten by flow-0039
  ["The loop you run", "501469c1994131fd1ee695e91c1a800352cfe89f0f38cd74b39f8f4f531475d4"],   // rewritten by flow-0007, then flow-0039
  ["Session hygiene — context is a budget", "71c9e144cad9aa9449dd199cf449c713ce90abb81ad3f7e59cc7761b093aebc0"],
  ["The gate — Definition of Done (every task, every stack)", "b4a7356cba7beb92a670375a59959cab46b91a4cb7648873b115300ecc4ea750"],   // rewritten by flow-0007
  ["Hard rules", "1c7c64687eb78d96e8d6e9f2c7648d95c99ae0455c03fd4a7c701e6bc2285e50"],   // rewritten by flow-0039
  ["What stays out of here", "24bd8ebcce937389248fb3c7e00ff8a4ec48db0912ec39d982abbab1397f00b3"],
];

// Split a markdown doc into `## ` sections. Returns [heading, body] pairs in document order;
// anything before the first `## ` (the title and preamble) is deliberately excluded — the
// preamble is the one part this task was allowed to rewrite, because the sentence "it is loaded
// automatically every session" stops being true the moment the file stops being CLAUDE.md.
export function sectionsOf(markdown) {
  const out = [];
  let heading = null;
  let body = [];
  for (const line of markdown.split("\n")) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      if (heading !== null) out.push([heading, body.join("\n")]);
      heading = m[1];
      body = [];
    } else if (heading !== null) {
      body.push(line);
    }
  }
  if (heading !== null) out.push([heading, body.join("\n")]);
  return out;
}

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// Strip everything that never reaches Claude Code's import parser: fenced code blocks and
// inline code spans (import parsing skips both), plus block-level HTML comments (stripped
// from CLAUDE.md before it is injected into context). Whatever survives this is the text an
// import can actually be read out of.
//
// The HTML-comment case is the subtle one, and it is why this is conservative rather than a
// literal model of the parser: an import buried in a `<!-- … -->` block would still LOOK like
// a live pointer in the file, so requiring it to sit outside comments is safe in both
// directions — it can never wrongly pass, only wrongly demand a tidier file.
export function stripCode(markdown) {
  return markdown
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/`[^`\n]*`/g, "");
}

// --- Criterion 1: the move was lossless -------------------------------------------------

test("every protocol section survives the move byte-for-byte", () => {
  const moved = new Map(sectionsOf(protocol));

  for (const [heading, digest] of PRE_MOVE_SECTION_DIGESTS) {
    assert.ok(moved.has(heading),
      `protocol section "${heading}" is missing from ${PROTOCOL_REF}. The move must carry every ` +
      `section across; a dropped one is a rule no session will ever read again.`);
    assert.equal(sha256(moved.get(heading)), digest,
      `protocol section "${heading}" changed while being moved. This task moves text, it does ` +
      `not rewrite it. If you are INTENTIONALLY editing the protocol, recompute this digest in ` +
      `the same commit as the edit — never adjust it to make an accidental change go green.`);
  }
});

test("the move added no sections and dropped none", () => {
  const movedHeadings = sectionsOf(protocol).map(([h]) => h);
  const expected = PRE_MOVE_SECTION_DIGESTS.map(([h]) => h);
  assert.deepEqual(movedHeadings, expected,
    "the set and order of protocol sections must match the pre-move document exactly");
});

// --- Criterion 2: CLAUDE.md is a pointer, and one the host expands -----------------------

test("CLAUDE.md carries the import on its own line, outside backticks and fences", () => {
  const lines = claude.split("\n");
  assert.ok(lines.includes(IMPORT_LINE),
    `CLAUDE.md must contain a bare "${IMPORT_LINE}" line — that is the whole mechanism`);

  // The decisive check: the import must survive code-stripping. Claude Code skips imports
  // inside code spans and fenced blocks, so one stray backtick makes this file a no-op that
  // still reads correctly to a human.
  const visible = stripCode(claude).split("\n");
  assert.ok(visible.includes(IMPORT_LINE),
    `the "${IMPORT_LINE}" line is inside a code span or fenced block, so Claude Code will skip ` +
    `it and load no protocol at all. Move it outside the backticks/fence.`);
});

test("the CLAUDE.md import resolves to a real file, relative to the importing file", () => {
  // Relative imports resolve against the file that contains them, NOT the working directory.
  const target = resolve(dirname(CLAUDE_PATH), IMPORT_LINE.slice(1));
  assert.ok(existsSync(target),
    `the import points at ${target}, which does not exist — the pointer would fail silently`);
  assert.equal(target, PROTOCOL_PATH, "the import must resolve to the one protocol file");
});

test("CLAUDE.md holds no second copy of the protocol body", () => {
  const headings = sectionsOf(claude).map(([h]) => h);
  for (const [protocolHeading] of PRE_MOVE_SECTION_DIGESTS) {
    assert.ok(!headings.includes(protocolHeading),
      `CLAUDE.md still contains the protocol section "${protocolHeading}". It is a pointer now; ` +
      `two copies drift, and the one an agent happens to read stops being the maintained one.`);
  }
  const lines = claude.split("\n").length;
  assert.ok(lines < 100,
    `CLAUDE.md is ${lines} lines. The ceiling is what keeps it from growing back into a ` +
    `duplicate of the protocol.`);
});

// --- Criterion 3: AGENTS.md points at the SAME single file -------------------------------

test("AGENTS.md instructs the agent to read the same protocol file", () => {
  assert.ok(agents.includes(PROTOCOL_REF),
    `AGENTS.md must name ${PROTOCOL_REF} — the AGENTS.md convention defines no import ` +
    `mechanism, so a plain-English instruction to read it is the entire mechanism`);
  assert.match(agents, /\bread\b/i, "it must actually tell the agent to READ the file");
});

test("AGENTS.md holds no second copy of the protocol body", () => {
  const headings = sectionsOf(agents).map(([h]) => h);
  for (const [protocolHeading] of PRE_MOVE_SECTION_DIGESTS) {
    assert.ok(!headings.includes(protocolHeading),
      `AGENTS.md still contains the protocol section "${protocolHeading}"`);
  }
});

// --- flow-0038: AGENTS.md's orchestrator pointer names the skills, without copying them --

// The orchestrator-role pointer added by flow-0038: an agent that only follows the AGENTS.md
// convention has no equivalent to Claude Code/Cowork's automatic .claude/skills/ discovery, so
// AGENTS.md has to name these paths explicitly. Proven the same way criterion 3 proves the
// protocol pointer: the path is named, and the target is not duplicated, just pointed at.
const ORCHESTRATOR_SKILL_PATHS = [
  ".claude/skills/task-writer/SKILL.md",
  ".claude/skills/vision-writer/SKILL.md",
  ".claude/skills/board-builder/SKILL.md",
];

test("AGENTS.md names all three orchestrator skill paths", () => {
  for (const path of ORCHESTRATOR_SKILL_PATHS) {
    assert.ok(agents.includes(path),
      `AGENTS.md must name ${path} — an agent following only the AGENTS.md convention has no ` +
      `other way to discover it, since just Claude Code/Cowork auto-discover .claude/skills/`);
  }
});

test("AGENTS.md does not duplicate the orchestrator skills' own procedural content", () => {
  // Same principle as "AGENTS.md holds no second copy of the protocol body" above: a pointer
  // names a skill, it does not restate its headings. Collect every `## ` heading each named
  // skill uses, and fail if any of them shows up as a heading in AGENTS.md too.
  const agentsHeadings = new Set(sectionsOf(agents).map(([h]) => h));
  for (const path of ORCHESTRATOR_SKILL_PATHS) {
    const skillHeadings = sectionsOf(readFileSync(join(TEMPLATE, path), "utf8")).map(([h]) => h);
    for (const heading of skillHeadings) {
      assert.ok(!agentsHeadings.has(heading),
        `AGENTS.md restates "${heading}" from ${path} — that is a second copy of the skill's ` +
        `own procedure, not a pointer to it`);
    }
  }
});

test("AGENTS.md's orchestrator section stays pointer-sized, not a growing copy", () => {
  const body = new Map(sectionsOf(agents)).get("Writing tasks, not just executing them");
  assert.ok(body, `AGENTS.md must carry a "Writing tasks, not just executing them" section`);
  const lines = body.split("\n").filter((l) => l.trim() !== "").length;
  assert.ok(lines < 30,
    `the orchestrator section is ${lines} non-blank lines. The ceiling is what keeps it a ` +
    `pointer instead of growing back into a copy of the skills it names.`);
});

test("exactly one file in the template tree contains the protocol body", () => {
  // Walk the whole shipped template and count files carrying the protocol's own sections.
  // Two hosts, two doorways, ONE copy — that is the invariant this task exists to create.
  const marker = PRE_MOVE_SECTION_DIGESTS.map(([h]) => h);
  const carriers = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        const headings = sectionsOf(readFileSync(full, "utf8")).map(([h]) => h);
        // A carrier is a file holding MOST of the protocol, not one quoting a heading.
        const hits = marker.filter((h) => headings.includes(h)).length;
        if (hits >= marker.length - 1) carriers.push(full.slice(REPO.length + 1));
      }
    }
  };
  walk(TEMPLATE);

  assert.deepEqual(carriers, ["project-template/.flow/PROTOCOL.md"],
    `expected exactly one copy of the protocol in the template; found: ${carriers.join(", ")}`);
});

// --- Criterion 4 (static half): the pointer is shaped so a host can follow it -------------

test("the import chain is one hop, well inside Claude Code's four-hop limit", () => {
  // Claude Code follows imports up to four hops deep. Ours is CLAUDE.md -> PROTOCOL.md, and
  // the protocol must not itself import further, or the depth budget starts mattering.
  const nested = stripCode(protocol).split("\n").filter((l) => /^@\S+/.test(l.trim()));
  assert.deepEqual(nested, [],
    `${PROTOCOL_REF} must not chain further imports — keep the chain at one hop`);
});

test("AGENTS.md does not rely on an import mechanism its convention lacks", () => {
  // If someone "helpfully" adds an @-import to AGENTS.md it will read as a live pointer to a
  // human and do nothing at all, since no AGENTS.md host expands it. Catch that here.
  const importish = stripCode(agents).split("\n").filter((l) => /^@\S+/.test(l.trim()));
  assert.deepEqual(importish, [],
    "AGENTS.md must use a plain-English instruction, not an @-import: the AGENTS.md convention " +
    "defines no include mechanism, so an @-line silently does nothing");
});

// --- Criterion 5: nothing in the tooling READS the protocol by CLAUDE.md filename ---------

// Strip `//` line comments and `/* … */` block comments, leaving only executable code. The
// criterion is precise about this: a mention of CLAUDE.md in a comment is fine (it is prose
// about the protocol), but the filename appearing in CODE means something opens it by name,
// which is the actual vendor binding. Two template helpers legitimately name it in comments.
export function stripJsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/.*$/gm, "");
}

// Every non-test helper in a bin directory whose EXECUTABLE code names CLAUDE.md.
function helpersOpeningClaudeMd(binDir) {
  const offenders = [];
  for (const name of readdirSync(binDir)) {
    if (!name.endsWith(".mjs") || name.endsWith(".test.mjs")) continue;
    const code = stripJsComments(readFileSync(join(binDir, name), "utf8"));
    if (code.includes("CLAUDE.md")) offenders.push(name);
  }
  return offenders;
}

test("no non-test helper in .flow/bin/ opens a file named CLAUDE.md", () => {
  assert.deepEqual(helpersOpeningClaudeMd(BIN), [],
    `these helpers name CLAUDE.md in code, not just in a comment. The protocol filename must ` +
    `stay a convention, not a dependency — a helper that opens it by name re-binds Flow to one ` +
    `vendor, which is exactly what this task removed.`);
});

test("no helper in the shipped template's bin/ opens a file named CLAUDE.md either", () => {
  // The template's bin is the copy every adopting repo runs, so this is the binding that
  // would actually travel downstream.
  assert.deepEqual(helpersOpeningClaudeMd(join(TEMPLATE, ".flow/bin")), [],
    "template helpers naming CLAUDE.md in code — this would ship the binding to every adopter");
});

test("stripJsComments keeps code and drops both comment forms", () => {
  const sample = [
    "// see CLAUDE.md for the rule",
    "/* CLAUDE.md again */",
    'const p = join(REPO, "KEPT.md"); // CLAUDE.md trailing',
  ].join("\n");
  const out = stripJsComments(sample);
  assert.ok(out.includes("KEPT.md"), "executable code must survive");
  assert.ok(!out.includes("CLAUDE.md"), "every comment form must be stripped");
});

// --- Criterion 6: the host file is small again -------------------------------------------

test("CLAUDE.md is well under the 25k character budget", () => {
  const size = Buffer.byteLength(claude, "utf8");
  assert.ok(size < 25_000, `CLAUDE.md is ${size} bytes, over the 25k budget`);
  // "Well under", not merely under: the budget exists so project notes have room. If the host
  // file is already most of the way there, the protocol has crept back in.
  assert.ok(size < 10_000,
    `CLAUDE.md is ${size} bytes. It is a pointer plus project notes; anywhere near the budget ` +
    `means the protocol has started growing back into it.`);
});

// --- The parsers these tests rely on -----------------------------------------------------

test("stripCode removes fenced blocks, inline spans and HTML comments, and nothing else", () => {
  const sample = [
    "keep this",
    "```",
    "@not-an-import.md",
    "```",
    "and `@nor-this.md` inline",
    "<!-- @nor-this-either.md -->",
    "@real.md",
  ].join("\n");
  const out = stripCode(sample);
  assert.ok(out.includes("keep this"));
  assert.ok(out.includes("@real.md"));
  assert.ok(!out.includes("@not-an-import.md"), "fenced content must be stripped");
  assert.ok(!out.includes("@nor-this.md"), "inline code spans must be stripped");
  assert.ok(!out.includes("@nor-this-either.md"), "HTML comments never reach context");
});

test("sectionsOf splits on ## only, and drops the preamble", () => {
  const sample = ["# Title", "preamble", "## One", "a", "### Deeper", "## Two", "b"].join("\n");
  assert.deepEqual(sectionsOf(sample), [["One", "a\n### Deeper"], ["Two", "b"]]);
});

// --- Criterion 4 (behavioural half): prove a real session actually loads the pointer ------
//
// The static tests above prove the import is SHAPED correctly. They cannot prove the host
// honours it — only a live session can, and that needs the `claude` CLI plus credentials,
// which CI does not have. So this is opt-in rather than absent: the proof exists, it is
// named, and it is runnable on demand.
//
//   FLOW_LIVE_AGENT_CHECK=1 node --test .flow/bin/protocol-portability.test.mjs
//
// It scaffolds a throwaway repo from the template and reads Claude Code's own
// `InstructionsLoaded` hook, which reports every instruction file loaded, why, and from where.
// That is a deterministic signal about the loader itself — not a question put to the model,
// whose answer could come from priors rather than from the file.

const LIVE = process.env.FLOW_LIVE_AGENT_CHECK === "1";

test("a real Claude Code session loads the protocol through the CLAUDE.md import", {
  skip: LIVE ? false : "set FLOW_LIVE_AGENT_CHECK=1 to run (needs the claude CLI and credentials)",
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-pointer-"));
  try {
    cpSync(TEMPLATE, dir, { recursive: true });
    mkdirSync(join(dir, ".claude"), { recursive: true });
    const log = join(dir, "instructions-loaded.jsonl");
    writeFileSync(join(dir, ".claude/settings.json"), JSON.stringify({
      hooks: {
        InstructionsLoaded: [{ hooks: [{ type: "command", command: `cat >> ${log}` }] }],
      },
    }));

    execFileSync("claude", ["-p", "Reply with exactly: ping", "--max-turns", "1"], {
      cwd: dir, encoding: "utf8", timeout: 240_000, stdio: ["ignore", "pipe", "pipe"],
    });

    const events = readFileSync(log, "utf8")
      .split("}\n").filter(Boolean)
      .map((chunk) => JSON.parse(chunk.endsWith("}") ? chunk : chunk + "}"));

    const loaded = events.find((e) => (e.file_path || "").endsWith("/.flow/PROTOCOL.md"));
    assert.ok(loaded,
      `no InstructionsLoaded event for .flow/PROTOCOL.md — the import did not resolve. ` +
      `Files loaded: ${events.map((e) => e.file_path).join(", ") || "(none)"}`);
    assert.equal(loaded.load_reason, "include",
      "the protocol must arrive via the CLAUDE.md import, not by being read some other way");
    assert.ok((loaded.parent_file_path || "").endsWith("/CLAUDE.md"),
      `the import's parent must be CLAUDE.md, got ${loaded.parent_file_path}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
