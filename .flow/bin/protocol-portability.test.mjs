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
// UPDATED AGAIN (one entry, marked below) for the Session hygiene section. The trip condition
// "a tool result you could not read in full" was firing on routine harness-side truncation —
// capped search hits — which is the harness spending LESS context, not more. Agents were
// handing off on their first repo search, before implementation began. The section now
// separates what entered context from what the harness kept out, and adds a floor: a handoff
// with no progress in it is the failure the section exists to prevent. Digest recomputed in
// the same commit as the edit, per the procedure below.
//
// UPDATED BY flow-0007 (two entries, marked below). That task moved the three Definition-of-Done
// reviewers out of the worker's session and onto the PR, so "The gate" and "The loop you run" had
// to say where they now run. The digests were recomputed in the same commit as the edit, which is
// the procedure the failure message below prescribes — not relaxed to make a change go green.
//
// These pin that the MOVE was lossless. They are not a freeze on the protocol: an intentional
// edit to `.flow/PROTOCOL.md` is expected to fail this test, and the fix is to record it in
// INTENTIONAL_DIVERGENCES below, in the SAME commit that makes the edit (see the failure
// message), not to relax the pin.
// Same two-directional pin as EXPECTED_ABSENT in protocol-docs.test.mjs.
const PRE_MOVE_SECTION_DIGESTS = [
  ["Response style — show, don't tell", "39fd629a40ee66f98e46866e86ec227f0d68917fe8ea5c7e7a396facb5fbff74"],   // rewritten by flow-0117 (show, don't tell; TL;DR made conditional)
  ["The store", "c6dcbc3bb200de6b31be37d0e0d9ca619b6fb8c1a073e527703d8aa6e5af914a"],
  ["Status lifecycle", "f7235e6c6e4d93e5d792a9294bba9d93a5f3d621b0b208d8d39dbf800b577744"],   // rewritten by flow-0039, then flow-0040 (blocked_by)
  ["Concurrency — how parallel sessions don't collide", "42bbc5aa8e43eb1371eaae9b43fcb0d68cf7973df33844914d1137209bb49f6c"],   // rewritten by flow-0039
  ["The loop you run", "501469c1994131fd1ee695e91c1a800352cfe89f0f38cd74b39f8f4f531475d4"],   // rewritten by flow-0007, then flow-0039
  ["Session hygiene — context is a budget", "0026b46d1af9d1f8dc503fda8f1c711ae575c46e09dbd003f919f3a1db64751c"], // UPDATED: harness-truncation false positive
  ["The gate — Definition of Done (every task, every stack)", "b4a7356cba7beb92a670375a59959cab46b91a4cb7648873b115300ecc4ea750"],   // rewritten by flow-0007
  ["Hard rules", "1c7c64687eb78d96e8d6e9f2c7648d95c99ae0455c03fd4a7c701e6bc2285e50"],   // rewritten by flow-0039
  ["What stays out of here", "24bd8ebcce937389248fb3c7e00ff8a4ec48db0912ec39d982abbab1397f00b3"],
];

// Sections that have been INTENTIONALLY edited since the move, each with the reason and the task
// that did it (flow-0016). The assertion below prefers an entry here over the pre-move digest, so
// both facts stay on the record: what the section said when it was moved, and what it says now
// plus why it changed. Overwriting the pre-move digest instead would erase the first of those,
// which is the only thing that makes the pin worth keeping.
//
// To add an entry: make the edit, run the test, and copy the ACTUAL digest it reports in — in the
// same commit as the edit, with a `why` a reader can check against the diff. An entry whose
// digest equals the pre-move one is noise and fails its own test below.
const INTENTIONAL_DIVERGENCES = new Map([
  ["Response style — show, don't tell", {
    digest: "853df84a5dc41392daf887fb708ecbe65f664d8f6d25b3d76797d3e24d23e6d6",
    why: "the section told workers they \"auto-load this file\", which stopped being true the " +
         "moment the protocol moved behind a host pointer: the HOST file auto-loads and imports " +
         "this one. One hop, stated as one hop.",
    task: "flow-0016",
  }],
  ["Concurrency — how parallel sessions don't collide", {
    digest: "b109c9d9a05e59e910603ceae55daf82ed3d9037ec64a06898141310952ecebd",
    why: "the `touches` paragraph told a worker to skip a `ready` task overlapping an " +
         "`in_progress` one and said nothing about `in_review`, so a task overlapping an open " +
         "unmerged PR read as claimable. It now names both, and says why: a review-stage PR " +
         "still has a live branch about to rewrite `main` in those very files. `blocked` is " +
         "still deliberately excluded.",
    task: "flow-0118",
  }],
  ["Status lifecycle", {
    digest: "d9bccf75c9e2d2337011514ac5f3d43c7f9c8944e61d88a403b7a87bab625960",
    why: "the `blocked` bullet told a worker to record the undecidable thing in " +
         "`blocked_reason` and `blocked_by` only — both of which a person reads only once they " +
         "are already looking at the task file, which is the thing a human never opens. It now " +
         "also sends the decision to `asks`, which is the field that brings them there.",
    task: "flow-0119",
  }],
  ["Session hygiene — context is a budget", {
    digest: "65ee3fa781bad844dccfcb45e43c343c7ced01058dbf6744ecd510f2c5aab5a0",
    why: "the handoff rule specified `notes` and nothing else, so an item only a PERSON could " +
         "act on had one correct place to go and reached nobody from there. The section now " +
         "states the split — `notes` for the next session, `asks` for the human — with the " +
         "three kinds and what each one is for. Nothing about the trip conditions changed.",
    task: "flow-0119",
  }],
  ["The loop you run", {
    digest: "7782a30da99d62d4b00abe99fac986c27df6781fd989daa87ac399af72e5a797",
    why: "step 1 is the second place the claim rule is stated, and it said `in_progress` only. " +
         "Two statements of one rule drift apart unless both move; pick-task.test.mjs now " +
         "asserts on both strings for the same reason.",
    task: "flow-0118",
  }],
]);

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
    const divergence = INTENTIONAL_DIVERGENCES.get(heading);
    assert.equal(sha256(moved.get(heading)), divergence ? divergence.digest : digest,
      divergence
        ? `protocol section "${heading}" no longer matches the divergence ${divergence.task} ` +
          `recorded for it ("${divergence.why}"). Either this edit is also intentional — update ` +
          `that entry, in the same commit, with a reason of its own — or it is the accident the ` +
          `pin exists to catch.`
        : `protocol section "${heading}" changed while being moved. This task moves text, it does ` +
          `not rewrite it. If you are INTENTIONALLY editing the protocol, record it in ` +
          `INTENTIONAL_DIVERGENCES in the same commit as the edit — never adjust the pre-move ` +
          `digest to make a change go green, and never overwrite it to hide what the section said.`);
  }
});

test("the move added no sections and dropped none", () => {
  const movedHeadings = sectionsOf(protocol).map(([h]) => h);
  const expected = PRE_MOVE_SECTION_DIGESTS.map(([h]) => h);
  assert.deepEqual(movedHeadings, expected,
    "the set and order of protocol sections must match the pre-move document exactly");
});

// The divergence map is only worth having if every entry is checkable: it names a section that
// exists, it says why and which task, and it actually differs from the pre-move digest. Without
// this, "record the divergence" degrades into the overwrite it was introduced to replace.
test("every recorded divergence names a real section, a reason and a task, and really diverges",
  () => {
    const preMove = new Map(PRE_MOVE_SECTION_DIGESTS);
    for (const [heading, entry] of INTENTIONAL_DIVERGENCES) {
      assert.ok(preMove.has(heading),
        `INTENTIONAL_DIVERGENCES names "${heading}", which is not a pre-move protocol section — ` +
        `a divergence from nothing records nothing`);
      assert.match(entry.digest, /^[0-9a-f]{64}$/, `${heading}: digest must be a sha256 hex`);
      assert.notEqual(entry.digest, preMove.get(heading),
        `${heading}: the recorded divergence equals the pre-move digest, so nothing diverged — ` +
        `delete the entry rather than leaving a reason for a change that did not happen`);
      assert.match(entry.task, /^flow-\d{4}$/, `${heading}: name the task that made the edit`);
      assert.ok(entry.why && entry.why.length > 40,
        `${heading}: give a reason a reader can check against the diff, not a label`);
    }
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

// --- flow-0016 criteria 1, 2 and 4: the three sites the rename left behind ----------------
//
// WHY EACH NEEDS ITS OWN ASSERTION. The drift check below is a one-directional pin: it fails when
// prose calls CLAUDE.md the protocol, and stays green when prose says nothing at all. Deleting the
// README's entry, or the helpers' pointers, would satisfy it while leaving a reader with no idea
// where the protocol is. These assert the positive half — the arrangement flow-0006 shipped is
// described, in the places someone actually looks.

const README = readFileSync(join(TEMPLATE, "README.md"), "utf8");

// The aligned `<path><spaces><description>` entry for a path in README's "What's in here" block,
// continuation lines (indented, no path of their own) folded in.
export function listingEntry(readme, path) {
  const lines = readme.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^\\s*${path.replace(/[.\/]/g, "\\$&")}\\s\\s+\\S`).test(l));
  if (start === -1) return null;
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    if (!/^\s{20,}\S/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

test("README's file listing calls CLAUDE.md a pointer and names .flow/PROTOCOL.md as the protocol",
  () => {
    const hostEntry = listingEntry(README, "CLAUDE.md");
    assert.ok(hostEntry, "README's listing must still have an entry for CLAUDE.md");
    assert.match(hostEntry, /pointer/i,
      `README describes CLAUDE.md as: "${hostEntry}". It is a pointer since flow-0006, and the ` +
      `README is where someone looks to find out what the files are.`);
    assert.ok(hostEntry.includes(PROTOCOL_REF),
      "the CLAUDE.md entry must name what it points AT, or 'a pointer' tells the reader nothing");
    assert.deepEqual(protocolClaimsIn(hostEntry), [],
      "the CLAUDE.md entry must not also claim to be the protocol");

    const protocolEntry = listingEntry(README, "PROTOCOL.md");
    assert.ok(protocolEntry,
      `README's listing has no entry for ${PROTOCOL_REF} — the protocol is the one file the ` +
      `listing most needs to name`);
    assert.match(protocolEntry, /[Tt]he (protocol|contract)/,
      `the ${PROTOCOL_REF} entry must say it is the protocol: "${protocolEntry}"`);
  });

test("neither template helper cites CLAUDE.md as the location of a protocol rule", () => {
  // The inverse of stripJsComments: the comments are what a reader follows, and a comment is
  // exactly where flow-0006's own criterion 5 (code only) allowed this drift to survive.
  for (const name of ["flow-sync.mjs", "pick-task.mjs"]) {
    const source = readFileSync(join(TEMPLATE, ".flow/bin", name), "utf8");
    const comments = source.split("\n").filter((l) => /^\s*\/\/|^\s*\*/.test(l)).join("\n");
    assert.ok(comments.includes(PROTOCOL_REF),
      `${name} must cite ${PROTOCOL_REF} — it quotes a protocol rule, and the reader has to be ` +
      `able to go and read it`);
    assert.deepEqual(protocolClaimsIn(comments), [],
      `${name} still sends a reader to CLAUDE.md for a protocol rule. The rules moved in ` +
      `flow-0006; the comment did not.`);
  }
});

test("Response style says the HOST file auto-loads and imports the protocol", () => {
  // A content proof, not a change-detector: the digest above only pins that this section matches
  // a hash recorded alongside the edit, so it cannot tell this sentence from any other prose.
  const section = new Map(sectionsOf(protocol)).get("Response style — show, don't tell");
  assert.ok(section, "the Response style section must exist to carry the statement");

  assert.match(section, /host file[\s\S]{0,80}?auto-loads and imports/,
    "Response style must say the HOST file auto-loads and imports this protocol — that is the " +
    "one hop flow-0006 introduced, and it is why these rules bind a worker at all");
  assert.doesNotMatch(section, /auto-load this file/,
    "the pre-flow-0006 claim that worker sessions auto-load THIS file is one hop out of date");
  assert.doesNotMatch(section, /they\s+auto-load/,
    "nothing auto-loads the protocol directly; the host file does, and imports it");
});

// --- flow-0016 criterion 5: no shipped Markdown may call CLAUDE.md the protocol ----------
//
// WHY THIS EXISTS. flow-0006 moved the protocol to `.flow/PROTOCOL.md` and left CLAUDE.md as a
// pointer. Three references to the old arrangement survived, and nothing caught them: they were
// found by hand, months later, while building something else. The digests above cannot catch this
// class — they pin the protocol's own sections, not the prose elsewhere in the template that
// describes where the protocol lives. This is that check, and the drift it names is the drift
// flow-0016 cleared.
//
// It matches the CLAIM, not one phrasing: "CLAUDE.md is/—/, the protocol|contract" in either
// direction, with the wrapping collapsed first so a claim split across two lines still matches.
// Three files are exempt BY CONSTRUCTION rather than by tuning the pattern, because each has a
// legitimate reason to put those words together — a check that fires on them is a check someone
// switches off. The exemptions are listed in the failure message so a reader can see the hole.

const CLAUDE_MD = "`?CLAUDE\\.md`?";

export const PROTOCOL_CLAIM_PATTERNS = [
  {
    // "CLAUDE.md — the protocol", "CLAUDE.md is still the contract", and the aligned
    // file-listing shape ("CLAUDE.md<spaces>The protocol.") that README.md used.
    claim: "CLAUDE.md IS the protocol",
    re: new RegExp(
      `${CLAUDE_MD}\\s*(?:[—–:,-]|\\bis\\b|\\bas\\b|\\bremains\\b)?\\s*` +
      `(?:still\\s+|now\\s+)?[Tt]he\\s+(?:[\\w-]+\\s+){0,2}(?:protocol|contract)\\b`),
  },
  {
    // The same claim from the other end: "the full rules live in CLAUDE.md". A reader sent there
    // for the rules is misled exactly as much as one told the file IS them.
    claim: "the protocol/rules live IN CLAUDE.md",
    re: new RegExp(
      "\\b(?:protocol|contract|rules)\\b[^.`\\n]{0,40}?\\b(?:is|are|lives?|sits?)\\s+" +
      `(?:in|at)?\\s*${CLAUDE_MD}`),
  },
];

// Template-relative paths excluded from the scan, each for a reason that is about the file's job,
// not about making the check pass.
export const PROTOCOL_CLAIM_EXEMPT = [
  "CLAUDE.md",   // the host file: it legitimately names and measures itself
  "INIT.md",     // adoption runbook: instructs the reader to copy and edit CLAUDE.md
  "RETROFIT.md", // the same, for a repo that already has a populated CLAUDE.md
];

// Collapse each blank-line-separated block onto one line and match the patterns against it, so a
// claim wrapped across two source lines is still found. Reports the block's first line, which is
// what a human needs to go and look. Code fences are deliberately NOT stripped: the README's
// file listing lives inside one, and that listing was the drift.
export function protocolClaimsIn(markdown) {
  const hits = [];
  const lines = markdown.split("\n");
  let start = 0;
  let buf = [];

  const flush = () => {
    if (buf.length) {
      const text = buf.join(" ").replace(/\s+/g, " ").trim();
      for (const { claim, re } of PROTOCOL_CLAIM_PATTERNS) {
        const m = re.exec(text);
        if (m) hits.push({ line: start, claim, quote: m[0] });
      }
    }
    buf = [];
  };

  for (const [i, line] of lines.entries()) {
    if (line.trim() === "") flush();
    else {
      if (buf.length === 0) start = i + 1;
      buf.push(line);
    }
  }
  flush();
  return hits;
}

// Every `.md` the template ships, as template-relative paths.
export function templateMarkdown(dir = TEMPLATE, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...templateMarkdown(join(dir, entry.name), rel));
    else if (entry.name.endsWith(".md")) out.push(rel);
  }
  return out.sort();
}

test("no shipped Markdown in project-template/ describes CLAUDE.md as the protocol", () => {
  const scanned = templateMarkdown().filter((rel) => !PROTOCOL_CLAIM_EXEMPT.includes(rel));
  assert.ok(scanned.length > 5, `the scan found only ${scanned.length} files — it must not be a ` +
    `no-op that passes by scanning nothing`);

  const offences = [];
  for (const rel of scanned) {
    for (const hit of protocolClaimsIn(readFileSync(join(TEMPLATE, rel), "utf8"))) {
      offences.push(`project-template/${rel}:${hit.line}: "${hit.quote}" — ${hit.claim}`);
    }
  }

  assert.deepEqual(offences, [],
    `these lines still describe CLAUDE.md as the protocol. Since flow-0006 it is a pointer and ` +
    `the protocol is ${PROTOCOL_REF}; say so, or the reader is sent to a file that no longer ` +
    `holds what they were promised. Exempt by construction: ` +
    `${PROTOCOL_CLAIM_EXEMPT.join(", ")} — the host file names itself, and the two adoption ` +
    `runbooks tell the reader to copy and edit it.\n  ${offences.join("\n  ")}`);
});

test("the claim patterns fire on the exact drift flow-0016 cleared", () => {
  // Verbatim from project-template/README.md before this task, in its aligned-listing shape.
  const readmeBefore = [
    "```",
    "CLAUDE.md                     The protocol. The contract Code reads every session. Markdown,",
    "                              because it's a tool-loaded config file — not a human-read surface.",
    "```",
  ].join("\n");
  assert.deepEqual(protocolClaimsIn(readmeBefore).map((h) => h.claim),
    ["CLAUDE.md IS the protocol"],
    "the aligned file-listing shape is the one a human is most likely to trust");

  assert.equal(protocolClaimsIn("The full rules live in `CLAUDE.md` → *Concurrency*.").length, 1,
    "being sent to CLAUDE.md for the rules is the same drift, phrased from the other end");

  for (const phrasing of [
    "`CLAUDE.md` is the protocol.",
    "CLAUDE.md — the contract every session reads.",
    "CLAUDE.md, the vendor-neutral protocol, is loaded first.",
    "CLAUDE.md is still the contract.",
    "The hard rules are in CLAUDE.md.",
  ]) {
    assert.ok(protocolClaimsIn(phrasing).length > 0, `missed the claim in: ${phrasing}`);
  }

  // Wrapped across a line break — the collapse is what makes this match.
  assert.equal(protocolClaimsIn("a sentence ending in CLAUDE.md\nis the protocol now.").length, 1,
    "a claim split by prose wrapping must still be caught");
});

test("the claim patterns leave correct sentences about CLAUDE.md alone", () => {
  for (const phrasing of [
    // The sentences the shipped template actually uses, verbatim.
    "There is exactly **one** copy of the protocol in this repo. `CLAUDE.md` imports the same file",
    "`CLAUDE.md` for Claude Code, `AGENTS.md` for agents that follow that convention — points",
    "**The protocol is not `CLAUDE.md` or `AGENTS.md`.** It ships as `.flow/PROTOCOL.md`",
    "CLAUDE.md                     A pointer, not the rules: a short host file that @-imports",
    "Workers too — a worker's host file (`CLAUDE.md` for Claude Code) auto-loads and imports this",
    "grep -qx '@.flow/PROTOCOL.md' CLAUDE.md && test -f .flow/PROTOCOL.md",
    "Run `node .flow/bin/check-claude-md.mjs --entry CLAUDE.md` for the real total",
  ]) {
    assert.deepEqual(protocolClaimsIn(phrasing), [],
      `false positive — a check that fires on correct prose is one someone switches off: ${phrasing}`);
  }
});

test("every exemption names a file that exists, with the protocol's own doorway still scanned", () => {
  // An exemption for a file that is gone is a hole nobody notices; and the whole point is that
  // the files that DO talk about the arrangement correctly stay inside the scan.
  for (const rel of PROTOCOL_CLAIM_EXEMPT) {
    assert.ok(existsSync(join(TEMPLATE, rel)),
      `PROTOCOL_CLAIM_EXEMPT names ${rel}, which the template does not ship — drop the exemption`);
  }
  const scanned = templateMarkdown();
  for (const rel of ["AGENTS.md", ".flow/PROTOCOL.md", "README.md"]) {
    assert.ok(scanned.includes(rel) && !PROTOCOL_CLAIM_EXEMPT.includes(rel),
      `${rel} must stay inside the scan — it is prose about where the protocol lives`);
  }
});

test("protocolClaimsIn reports the first line of the block that carries the claim", () => {
  const doc = ["# Title", "", "para one", "", "see CLAUDE.md,", "the protocol, for details"].join("\n");
  assert.deepEqual(protocolClaimsIn(doc).map((h) => h.line), [5]);
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

// --- the protocol actually documents what is NOT a trip condition ------------------------
//
// WHY THIS IS NOT COVERED BY THE DIGEST ABOVE. Same reason criterion 7 needed its own proof:
// `PRE_MOVE_SECTION_DIGESTS` hashes the "Session hygiene" section and compares it to a digest
// recomputed in the same commit as the edit. That proves the section still matches whatever was
// written — it cannot distinguish "documents the truncation carve-out" from "changed somehow".
// Swap this text for unrelated prose, recompute the digest, and that test stays green.
//
// The carve-out is worth a proof of content because its absence is what caused the incident it
// was written for: workers on a harness that truncates search output by default read "a tool
// result you could not read in full" as satisfied by their first repository search, and handed
// off — honestly, and before implementation began. Losing this text silently reinstates that.
test("Session hygiene names harness truncation as NOT a trip condition", () => {
  const section = new Map(sectionsOf(protocol)).get("Session hygiene — context is a budget");
  assert.ok(section, "the Session hygiene section must exist to carry the trip conditions");

  assert.match(section, /What is not a trip condition/,
    "Session hygiene must keep its explicit non-trip block; without it every routine tool " +
    "behaviour reads as a trip condition, which is the false positive this text exists for");

  // The three routine behaviours that were false-positiving. Substance, not a keyword: a
  // paragraph that merely mentioned truncation in passing would not tell a worker it is safe.
  assert.match(section, /truncated or elided/,
    "the block must name harness-side truncation/elision — the behaviour that fired on the " +
    "first search of every session");
  assert.match(section, /spending\s+\*?less\*?\s+of your context/,
    "the block must say truncation spends LESS context, not more; that inversion is the whole " +
    "reason the old wording misfired");
  assert.match(section, /more matches than you read/,
    "the block must name a partially-read search as routine");
  assert.match(section, /A re-read you chose/,
    "the block must name a deliberate verification re-read as routine");

  // The trip condition itself must measure what ARRIVED, not what was withheld.
  assert.match(section, /landed in your context large enough to rival the task body/,
    "the tool-result condition must measure what entered context; the old wording (\"could " +
    "not read in full\") could not tell a large result from a withheld one");
  assert.match(section, /cannot recall what it said/,
    "the re-read condition must be qualified by recall failure, or deliberate verification " +
    "trips it");
});

// The floor, and the three conditions it deliberately does NOT cover. Both halves matter: a
// floor over every condition would tell a session to keep working through a compaction signal,
// which is the degraded-context failure the section opens by warning about.
test("the floor covers the staleness conditions and exempts compaction", () => {
  const section = new Map(sectionsOf(protocol)).get("Session hygiene — context is a budget");
  assert.ok(section, "the Session hygiene section must exist to carry the floor");

  assert.match(section, /a handoff must hand something off/,
    "the floor must exist, or a zero-progress handoff reads as compliance rather than as the " +
    "waste this section opens by describing");
  assert.match(section, /work worth preserving/,
    "the floor must state what it requires before a stale-thread condition fires");

  assert.match(section, /have no floor and take no account of progress/,
    "the floor must say which conditions it does NOT cover; unbounded, it contradicts them");
  assert.match(section, /Compaction[\s\S]{0,200}?it still fires/,
    "compaction must be named as firing regardless of progress — it means the budget is " +
    "already spent, so a floor that silenced it would reinstate forced continuation in a " +
    "context the harness has flagged");
});

// --- flow-0040 criterion 7: the protocol actually documents `blocked_by` -----------------
//
// WHY THIS IS NOT COVERED BY THE DIGEST ABOVE. `PRE_MOVE_SECTION_DIGESTS` hashes the "Status
// lifecycle" section and compares it to a digest recomputed in the same commit as the edit.
// That proves the section still matches whatever was written — it cannot distinguish "documents
// blocked_by" from "changed somehow". Swap the new paragraph for unrelated prose, recompute the
// digest, and that test stays green. Its own docstring says as much: it exists to catch an
// ACCIDENTAL change and explicitly punts on validating an intentional one.
//
// So the digest is a change-detector, not a proof of content, and criterion 7 needs a proof of
// content. This is that proof, and it asserts the bullet's substance rather than the presence of
// a keyword — a token check would pass on a paragraph that merely mentions the field in passing.

// One `- \`<status>\` — …` bullet from a Status lifecycle body, continuation lines included.
export function statusBullet(sectionBody, status) {
  const hit = sectionBody.split(/^- /m).slice(1).find((p) => p.startsWith(`\`${status}\``));
  return hit ? `- ${hit}` : null;
}

test("the protocol's `blocked` bullet documents blocked_by, alongside blocked", () => {
  const section = new Map(sectionsOf(protocol)).get("Status lifecycle");
  assert.ok(section, "the Status lifecycle section must exist to document the field");

  const bullet = statusBullet(section, "blocked");
  assert.ok(bullet, "Status lifecycle must carry a `blocked` bullet");

  // Alongside `blocked` — the criterion's word. Documenting the field in some other section
  // would leave a reader of the lifecycle unaware it exists.
  assert.match(bullet, /blocked_by/,
    "the `blocked` bullet must name `blocked_by`; the digest test cannot tell you this, because " +
    "it only checks the section matches a hash recomputed alongside the edit");

  // Substance, not a keyword. Each of these is a rule flow-doctor enforces, so a paragraph that
  // dropped one would leave the validator's behaviour undocumented.
  assert.match(bullet, /blocked_reason/,
    "the bullet must keep `blocked_reason` too — `blocked_by` supplements the sentence, never " +
    "replaces it, and flow-doctor still expects both");
  assert.match(bullet, /not machine-checkable/,
    "the bullet must document the opt-out sentinel, or a genuinely non-mechanical block has no " +
    "way to silence the nudge flow-doctor raises");
  assert.match(bullet, /\bclear/i,
    "the bullet must say the field is cleared when the block clears — flow-doctor reports a " +
    "populated blocked_by on a live non-blocked task as stale data");
});
