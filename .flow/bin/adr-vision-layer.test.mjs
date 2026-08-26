// adr-vision-layer.test.mjs — proving tests for docs/adr/0004-vision-layer.md (flow-0014).
//
// An ADR has the same failure mode as a protocol document and the opposite of code: it can be
// confidently, silently wrong forever. Nothing runs it. The specific way THIS one fails is not
// "it goes missing" — it is that someone trims it. The consequences section loses the costs and
// keeps the benefits; an alternative loses the reason it lost and keeps the fact that it lost;
// the `[vision]` skip note disappears and the next person hardening touches-guard closes a path
// that has to stay open. Each of those edits looks like tidying and each one destroys the reason
// the ADR exists, because the reasoning is the artefact — the decision itself is one paragraph.
//
// So the criteria that say "when it is read, then it contains X" get a reader. These tests are
// that reader.
//
// Criteria proved here (flow-0014): all of them except the final gate-passes criterion, which is
// proved by the gate itself. See .flow/bin/protocol-docs.test.mjs for the same pattern applied to
// canonical's root CLAUDE.md.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { parseTaskId } from "../../project-template/.flow/bin/parse-task-id.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const ADR_DIR = join(REPO, "docs", "adr");
const ADR = join(ADR_DIR, "0004-vision-layer.md");

const doc = existsSync(ADR) ? readFileSync(ADR, "utf8") : "";

// Return the body of a `## `-level section whose heading STARTS WITH `prefix`, exclusive of the
// next `## ` heading. Prefix-matched rather than exact so a heading may carry a subtitle
// ("## Future work — recorded, not silently omitted") without the test pinning its wording.
function section(text, prefix) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## ") && l.slice(3).trim().toLowerCase().startsWith(prefix.toLowerCase()));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) { end = i; break; }
  }
  return lines.slice(start + 1, end).join("\n");
}

// ── criterion 1: the header matches ADR-0001..0003 ───────────────────────────────────────────
// Asserted against the siblings rather than against a literal, so the convention is discovered
// from the corpus. If ADR-0001..0003 change shape, this test changes with them.

const SIBLINGS = ["0001-task-store-files-vs-github-issues.md",
                  "0002-flightdeck-projection-github-projects.md",
                  "0003-flow-mcp-server.md"];

// The header shape every ADR in this directory uses: an `# ADR-NNNN: <title>` line, then
// **Status:**, **Date:** and **Deciders:** in that order, one per line.
function headerShape(text) {
  const lines = text.split("\n").slice(0, 8);
  return {
    title: /^# ADR-\d{4}: \S/.test(lines[0] ?? ""),
    fields: lines.filter((l) => /^\*\*(Status|Date|Deciders):\*\*\s*\S/.test(l))
                 .map((l) => l.match(/^\*\*(\w+):\*\*/)[1]),
  };
}

test("ADR-0004 exists and is non-empty", () => {
  assert.ok(existsSync(ADR), "docs/adr/0004-vision-layer.md is the whole deliverable of flow-0014");
  assert.ok(doc.trim().length > 2000, "an ADR whose reasoning is the artefact cannot be a stub");
});

test("the siblings really do share one header shape — the convention this ADR must match", () => {
  for (const name of SIBLINGS) {
    const shape = headerShape(readFileSync(join(ADR_DIR, name), "utf8"));
    assert.ok(shape.title, `${name}: expected an "# ADR-NNNN: <title>" first line`);
    assert.deepEqual(shape.fields, ["Status", "Date", "Deciders"],
      `${name}: expected Status, Date and Deciders in that order`);
  }
});

test("ADR-0004 carries Status, Date and Deciders in the same format as ADR-0001..0003", () => {
  const shape = headerShape(doc);
  assert.ok(shape.title, 'expected an "# ADR-0004: <title>" first line');
  assert.deepEqual(shape.fields, ["Status", "Date", "Deciders"],
    "the header must carry Status, Date and Deciders, in that order, in the siblings' format");
  // Landed as Accepted, not Proposed: the decisions were taken on 2026-08-18 and the first
  // deliverables merged before this record was written. An ADR marked Proposed while its
  // implementation ships is a document lying about its own state.
  assert.match(doc, /^\*\*Status:\*\*\s*Accepted\b/m, "ADR-0004 is Accepted, not Proposed");
  assert.match(doc, /^\*\*Date:\*\*\s*\d{4}-\d{2}-\d{2}\s*$/m, "Date must be a bare ISO date");
});

// ── criterion 2: the Decision section carries all three parts and the teeth budget ───────────

test("the Decision section states all three parts of the layer", () => {
  const decision = section(doc, "Decision");
  assert.ok(decision, "no ## Decision section");

  // Part 1 — the root anchor, on the code plane, changed only by PR.
  assert.match(decision, /`?VISION\.md`?[^\n]*\b(root|repository root)\b|\broot\b[^\n]*`VISION\.md`/i,
    "part 1: VISION.md must be located at the repository root");
  assert.match(decision, /code plane/i, "part 1: the root placement is a code-plane decision");
  assert.match(decision, /\bPR\b|pull request/i, "part 1: vision changes are PR-only");

  // Part 2 — serves, checked mechanically by flow-doctor.
  assert.match(decision, /`serves:?`/, "part 2: the `serves` field must be named");
  assert.match(decision, /flow-doctor/, "part 2: flow-doctor is what validates it");
  assert.match(decision, /\bresolve[sd]?\b/i,
    "part 2: the check is that the citation RESOLVES — say so, or the reader assumes alignment");

  // Part 3 — compass: scheduled, opt-in, read-only, filing into the existing inbox.
  assert.match(decision, /flow-compass|compass/i, "part 3: compass must be named");
  assert.match(decision, /week|schedul/i, "part 3: compass is scheduled, not per-PR");
  assert.match(decision, /opt-in|FLOW_AI/i, "part 3: compass is opt-in");
  assert.match(decision, /read-only/i, "part 3: compass's read-only boundary");
  assert.match(decision, /issue/i, "part 3: findings land in the existing capture inbox");
  assert.match(decision, /blocks? nothing|never blocks|advisory/i,
    "part 3: compass is advisory — it must say so in words a trimmer cannot mistake");
});

test("the Decision section states the teeth budget as the REASON the three parts differ", () => {
  const decision = section(doc, "Decision");
  assert.match(decision, /teeth budget/i, "the organising principle must be named, not implied");
  // The whole point of the principle is the asymmetry: facts gate, judgment advises. A decision
  // section that names the budget without stating both halves has kept the label and lost it.
  assert.match(decision, /fact/i, "the teeth budget turns on mechanical FACTS hard-failing");
  assert.match(decision, /judg?ment/i, "…and on semantic JUDGMENT staying advisory");
  assert.match(decision, /overrid/i,
    "the reason a semantic gate loses is that overriding is contagious — that clause is the argument");
});

// ── criterion 3: five alternatives, each with the reason it LOST ─────────────────────────────

// Each entry: a label for the failure message, and the terms that must co-occur in one
// alternative's block. Matched against the block, not the whole document, so an alternative
// cannot be "present" only because the phrase appears in the Context section.
const ALTERNATIVES = [
  { name: "an LLM-judged alignment gate in CI",
    heading: /llm-judged|llm judged/i,
    reason: /corrod|credibilit|flaky|override|wrong often/i },
  { name: "the vision in .flow/ rather than at the root",
    heading: /\.flow\/[^\n]*\broot\b|\broot\b[^\n]*\.flow\//i,
    reason: /without review|task plane|silently|any session|store-guard/i },
  { name: "per-task human vision review (the status quo that failed)",
    heading: /per-task human/i,
    reason: /failed|aggregate|per-task|remember/i },
  { name: "`serves` as an unenforced convention",
    heading: /unenforced convention/i,
    reason: /decay|noise|discipline|worse than/i },
  { name: "a separate drift dashboard instead of the inbox",
    heading: /dashboard/i,
    reason: /second inbox|NG1|operate|triage|rebuilt/i },
];

test("the alternatives section names at least the five considered", () => {
  const alts = section(doc, "Alternatives");
  assert.ok(alts, "no ## Alternatives section");
  for (const { name, heading } of ALTERNATIVES) {
    assert.match(alts, heading, `alternative missing from the ADR: ${name}`);
  }
});

test("every alternative records WHY it lost, not merely that it lost", () => {
  const alts = section(doc, "Alternatives");
  // Split the section into one block per `### ` alternative heading.
  const blocks = alts.split(/\n(?=### )/).filter((b) => b.trim().startsWith("### "));
  assert.ok(blocks.length >= ALTERNATIVES.length,
    `expected at least ${ALTERNATIVES.length} "### " alternatives, found ${blocks.length}`);

  for (const block of blocks) {
    const head = block.split("\n")[0];
    assert.match(block, /rejected because/i,
      `"${head}" records no reason — "rejected" alone is the fact, not the argument`);
  }

  for (const { name, heading, reason } of ALTERNATIVES) {
    const block = blocks.find((b) => heading.test(b.split("\n")[0]));
    assert.ok(block, `no "### " block for: ${name}`);
    assert.match(block, reason, `the recorded reason for rejecting "${name}" has been lost`);
  }
});

// ── criterion 4: consequences name the costs, not only the benefits ──────────────────────────

test("the consequences section names the store-wide failure behaviour of flow-doctor", () => {
  const cons = section(doc, "Consequences");
  assert.ok(cons, "no ## Consequences section");
  assert.match(cons, /store-wide/i, "the blast radius must be named in the consequences, not buried");
  assert.match(cons, /every open PR|all open PRs/i,
    "the cost is that ONE unanchored ready task reddens every open PR — spell it out");
  assert.match(cons, /cannot fix|can't fix|main`?-only|main-only/i,
    "…including PRs whose authors cannot fix it, because the store is main-only");
});

test("the consequences section names the lazy-citation limit of `serves`", () => {
  const cons = section(doc, "Consequences");
  assert.match(cons, /lazy|lazily/i, "the field can be cited lazily — that limit is a consequence");
  assert.match(cons, /compass/i, "…and compass being the only backstop is what makes it a cost");
});

test("the consequences section names the added human touchpoints", () => {
  const cons = section(doc, "Consequences");
  assert.match(cons, /touchpoint/i, "two new touchpoints is a cost against G1 — name it");
  assert.match(cons, /vision PR|VISION\.md.*PR|approv/i, "touchpoint 1: approving vision PRs");
  assert.match(cons, /triag/i, "touchpoint 2: triaging compass findings");
});

test("a consequences section listing only benefits fails this criterion", () => {
  const cons = section(doc, "Consequences");
  // The criterion is explicit that benefits-only is a failure, so the test is explicit too:
  // the costs must be stated as costs, in a part of the section that says so.
  assert.match(cons, /\bcosts?\b/i,
    "the section must own its costs in words — 'the costs, stated plainly', not a benefits list");
  assert.ok(/written badly|can be written badly/i.test(cons),
    "the honest cost that nothing can validate — a badly written vision — must survive here");
});

// ── criterion 5: future work is recorded, not silently omitted ───────────────────────────────

test("the touches-vs-serves cross-check is recorded as future work, with the heuristic reasoning", () => {
  const future = section(doc, "Future work");
  assert.ok(future, "no ## Future work section");
  assert.match(future, /`?touches`?/i, "the cross-check is touches × serves — name touches");
  assert.match(future, /`?serves`?/i, "…and serves");
  assert.match(future, /maintenance/i,
    "the reason it is not built: `maintenance` has no declared file surface");
  assert.match(future, /heuristic/i,
    "…so the check could only be a heuristic — that word IS the argument, keep it");
  assert.match(future, /hard-fail|hard fail/i,
    "…and heuristics do not belong in the tier that hard-fails");
});

test("the `[vision]` PR skip is recorded as legitimate behaviour that must stay legitimate", () => {
  const future = section(doc, "Future work");
  assert.match(future, /\[vision\]/,
    "a `[vision]` PR title yields no task id — the note exists so nobody later closes that path");
  assert.match(future, /parse-task-id/i, "name the helper whose regex produces the skip");
  assert.match(future, /touches-guard/i, "…and the guard that consequently skips");
  assert.match(future, /legitimate/i,
    "the skip must be recorded as LEGITIMATE, or it reads as a hole for someone to plug");
});

test("the `[vision]` skip note matches what parse-task-id actually does", () => {
  // Pins the ADR to the code rather than to a remembered fact: if the id pattern is ever widened
  // so that `[vision]` DOES resolve, this test fails and the ADR must be updated — which is the
  // moment somebody needs to notice that vision PRs just became scope-checked.
  assert.equal(parseTaskId("claude/some-branch", "[vision] Initial vision"), null,
    "a [vision] PR title must still yield no task id, or the ADR's recorded skip is now wrong");
});

// ── criterion 6: ADR numbering is unique ─────────────────────────────────────────────────────

test("no two ADRs share a number", () => {
  const numbers = readdirSync(ADR_DIR)
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .map((f) => f.slice(0, 4));
  const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  assert.deepEqual([...new Set(dupes)], [], `duplicate ADR numbers in docs/adr/: ${dupes.join(", ")}`);
  assert.equal(numbers.filter((n) => n === "0004").length, 1, "exactly one ADR may be numbered 0004");
});

test("the ADR's number matches its filename", () => {
  assert.match(doc, /^# ADR-0004:/, "0004-vision-layer.md must declare itself as ADR-0004");
});

// ── a doc that names paths must name paths that exist ────────────────────────────────────────

test("every repo-relative path ADR-0004 names actually exists", () => {
  // Conservative extraction, same posture as protocol-docs.test.mjs: only inline code spans that
  // unambiguously look like a repo path, and never a glob, placeholder or bare extension.
  const missing = [];
  for (const [, raw] of doc.matchAll(/`([^`\n]+)`/g)) {
    if (/[<>*()\s…]/.test(raw)) continue;
    if (/^\.[a-z]+$/i.test(raw)) continue;
    if (!/^[\w.@-]+(\/[\w.@-]+)*\/?$/.test(raw)) continue;
    const looksLikePath = raw.includes("/") || /\.(md|ya?ml|mjs|json|html)$/i.test(raw);
    if (!looksLikePath) continue;
    if (!existsSync(join(REPO, raw))) missing.push(raw);
  }
  assert.deepEqual(missing, [], `ADR-0004 names paths that do not exist: ${missing.join(", ")}`);
});
