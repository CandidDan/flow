// adr-split-authoring.test.mjs — proving tests for docs/adr/0005-split-authoring-from-release.md
// (flow-0028).
//
// Same posture as .flow/bin/adr-vision-layer.test.mjs, and deliberately the same shape rather
// than a second convention: an ADR cannot be run, so nothing catches it being quietly trimmed.
// The specific way THIS one gets trimmed is predictable, because two of its passages argue
// AGAINST the reader's instinct:
//
//   * the "this does not filter content" consequence reads like a caveat on good news, and the
//     belief it exists to prevent — "we made it private, so the input problem is handled" — is
//     exactly the belief a future reader arrives with;
//   * the snapshot-without-history rule reads like a publishing preference, so a future
//     implementer "improves" it into a filtered history push for traceability and exports the
//     commits the whole ADR exists to withhold.
//
// Both survive here as assertions. Criteria proved: all of flow-0028's except the final
// gate-passes criterion, which the gate itself proves.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const ADR_DIR = join(REPO, "docs", "adr");
const ADR = join(ADR_DIR, "0005-split-authoring-from-release.md");

const doc = existsSync(ADR) ? readFileSync(ADR, "utf8") : "";

// Body of a `## ` section whose heading starts with `prefix`, exclusive of the next `## `.
// Prefix-matched so a heading may carry a subtitle without this test pinning its wording.
function section(text, prefix) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) =>
    l.startsWith("## ") && l.slice(3).trim().toLowerCase().startsWith(prefix.toLowerCase()));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) { end = i; break; }
  }
  return lines.slice(start + 1, end).join("\n");
}

// ── criterion 1: it exists, and matches the header shape of its siblings ─────────────────────

const SIBLINGS = ["0001-task-store-files-vs-github-issues.md",
                  "0002-flightdeck-projection-github-projects.md",
                  "0003-flow-mcp-server.md",
                  "0004-vision-layer.md"];

function headerShape(text) {
  const lines = text.split("\n").slice(0, 8);
  return {
    title: /^# ADR-\d{4}: \S/.test(lines[0] ?? ""),
    fields: lines.filter((l) => /^\*\*(Status|Date|Deciders):\*\*\s*\S/.test(l))
                 .map((l) => l.match(/^\*\*(\w+):\*\*/)[1]),
  };
}

test("ADR-0005 exists and is non-empty", () => {
  assert.ok(existsSync(ADR),
    "docs/adr/0005-split-authoring-from-release.md is the whole deliverable of flow-0028");
  assert.ok(doc.trim().length > 2000, "an ADR whose reasoning is the artefact cannot be a stub");
});

test("ADR-0005 carries Status, Date and Deciders in the siblings' format", () => {
  const shape = headerShape(doc);
  assert.ok(shape.title, 'expected an "# ADR-0005: <title>" first line');
  assert.deepEqual(shape.fields, ["Status", "Date", "Deciders"],
    "the header must carry Status, Date and Deciders, in that order, as ADR-0001..0004 do");
  assert.match(doc, /^\*\*Status:\*\*\s*Accepted\b/m,
    "the decision is taken, not proposed — flow-0028's notes are explicit that it is settled");
  assert.match(doc, /^\*\*Date:\*\*\s*\d{4}-\d{2}-\d{2}\s*$/m, "Date must be a bare ISO date");
});

test("the siblings really do share the header shape this ADR is being held to", () => {
  for (const name of SIBLINGS) {
    const shape = headerShape(readFileSync(join(ADR_DIR, name), "utf8"));
    assert.ok(shape.title, `${name}: expected an "# ADR-NNNN: <title>" first line`);
    assert.deepEqual(shape.fields, ["Status", "Date", "Deciders"],
      `${name}: expected Status, Date and Deciders in that order`);
  }
});

test("the ADR's number matches its filename, and no two ADRs share a number", () => {
  assert.match(doc, /^# ADR-0005:/, "0005-split-authoring-from-release.md must declare itself ADR-0005");
  const numbers = readdirSync(ADR_DIR).filter((f) => /^\d{4}-.*\.md$/.test(f)).map((f) => f.slice(0, 4));
  const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  assert.deepEqual([...new Set(dupes)], [], `duplicate ADR numbers in docs/adr/: ${dupes.join(", ")}`);
});

// ── criterion 2: the Decision draws the boundary flow-0029 implements from ───────────────────
// The criterion's bar is "specifically enough that flow-0029 can be implemented from it without
// re-deciding the boundary". So the test demands BOTH sides be enumerated, not gestured at: a
// Decision naming only what is published leaves the implementer to infer the exclusions, and the
// exclusion list is the half that carries the risk.

test("the Decision names what the PUBLIC release repo holds", () => {
  const decision = section(doc, "Decision");
  assert.ok(decision, "no ## Decision section");
  assert.match(decision, /_flow-\*?\.yml|reusable workflow/i,
    "the reusable workflows are the primary artefact — they must be named as published");
  assert.match(decision, /`project-template\/`/,
    "project-template/ is what an adopting repo receives");
  assert.match(decision, /LICENSE|licence/i, "the licence file travels with the artefact");
  assert.match(decision, /`VERSION`/, "the version stamp is what an adopter compares itself against");
  assert.match(decision, /`docs\/`/, "the adoption documentation is published");
});

test("the Decision names what stays PRIVATE — the half an implementer would otherwise infer", () => {
  const decision = section(doc, "Decision");
  assert.match(decision, /never crosses|stays private|not.*publish/i,
    "the exclusions must be stated as exclusions, in a passage that says so");
  assert.match(decision, /`\.flow\/tasks\/`/, "the store is the whole motivation — name it as withheld");
  assert.match(decision, /secret/i, "the repository secrets must not cross");
  assert.match(decision, /flightdeck/i, "the flightdeck stays with the authoring repo");
});

test("the Decision gives flow-0029 a RULE, not only two lists", () => {
  // Two enumerations go stale the moment a file is added. A stated rule survives that, and is
  // what makes the criterion's "without re-deciding the boundary" achievable for files that did
  // not exist when this was written.
  const decision = section(doc, "Decision");
  assert.match(decision, /run time|adoption time/i,
    "the boundary rule turns on what an adopter needs AT RUN TIME / ADOPTION TIME — state it");
  assert.match(decision, /author|plan|operate/i,
    "…and its converse: what exists to author, plan or operate canonical stays private");
});

test("the Decision records that adopters pin the release repo, and that the name is deferred", () => {
  const decision = section(doc, "Decision");
  assert.match(decision, /pin/i, "adopters re-point their `uses:` references — say so");
  assert.match(decision, /name/i, "the release repo's name is chosen at implementation time");
  assert.match(decision, /permanent|expensive|cannot be changed/i,
    "the naming CONSTRAINT is the point: it becomes a permanent public reference for every adopter");
});

// ── criterion 3: the split does not filter content, and flow-0027 is named ───────────────────

test("the Consequences state that the split does NOT filter untrusted issue content", () => {
  const cons = section(doc, "Consequences");
  assert.ok(cons, "no ## Consequences section");
  assert.match(cons, /does \*\*not\*\* filter|does not filter|not.*sanitis/i,
    "the non-filtering consequence must be stated in words a trimmer cannot mistake for a caveat");
  assert.match(cons, /issue/i, "the vector is issues fed back for triage");
  assert.match(cons, /same.*agent|same outsider|same text/i,
    "the argument is that the SAME text reaches the SAME agent — that identity is the point");
});

test("the Consequences name `flow-0027` explicitly and as independently required", () => {
  const cons = section(doc, "Consequences");
  assert.match(cons, /flow-0027/,
    "the criterion says NAMED, not implied — a reader must be able to find the task");
  assert.match(cons, /independent/i,
    "flow-0027 is required independently of this ADR — the word carries the whole claim");
});

test("the ADR pre-empts the argument that privacy relaxes the input-trust boundary", () => {
  // This is the belief the ADR exists to prevent, so it gets its own assertion rather than
  // riding on the paragraph above: a future reader relaxing flow-0027 "because it's private now"
  // must find that exact argument already answered.
  const cons = section(doc, "Consequences");
  assert.match(cons, /not an input-validation control|substitute|relax/i,
    "'we made it private' must be recorded as NOT an input-validation control");
});

// ── criterion 4: publication is a snapshot, without history, and the ADR says why ────────────

test("the Consequences record that publication must be a snapshot without history", () => {
  const cons = section(doc, "Consequences");
  assert.match(cons, /snapshot|squash/i, "publication is a snapshot per release");
  assert.match(cons, /histor/i, "…and explicitly not a history-carrying publish");
});

test("the snapshot rule records WHY, not merely the rule", () => {
  const cons = section(doc, "Consequences");
  const why = /export|withh|permanent|rewrit|cloned|forked/i;
  assert.match(cons, why,
    "the reason is that a history-preserving publish EXPORTS the commits being withheld, permanently");
  assert.match(cons, /security requirement|not a convenience|not a preference/i,
    "recorded as a requirement rather than a publishing style, or it gets 'improved' away");
});

// ── criterion 5: three alternatives, each with the reason it lost ────────────────────────────

const ALTERNATIVES = [
  { name: "keep one public repo",
    heading: /one public repo|single public repo/i,
    reason: /no mitigation|legitimate|cannot be selectively hidden|reasoning removed|status quo/i },
  { name: "distribute Flow as an npm package",
    heading: /npm/i,
    reason: /repository reference|resolve|cannot carry|structurally/i },
  { name: "take canonical private outright",
    heading: /private outright|no public release repo/i,
    reason: /uncallable|cannot be resolved|adoption|adoptable/i },
];

test("the Alternatives section names the three rejected options", () => {
  const alts = section(doc, "Alternatives");
  assert.ok(alts, "no ## Alternatives section");
  for (const { name, heading } of ALTERNATIVES) {
    assert.match(alts, heading, `alternative missing from the ADR: ${name}`);
  }
});

test("every alternative records WHY it lost, not merely that it lost", () => {
  const alts = section(doc, "Alternatives");
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

// ── criterion 6: the dogfooding consequence ──────────────────────────────────────────────────

test("the Consequences record that the authoring repo calls its reusables LOCALLY", () => {
  const cons = section(doc, "Consequences");
  assert.match(cons, /local path|locally|`?\.\/\.github\/workflows/i,
    "the authoring repo calls its reusables by local path after the split");
  assert.match(cons, /runs the exact files it (is about to )?publish|runs what it publishes/i,
    "…and therefore runs exactly what it publishes — that IS the dogfooding claim");
});

test("the dogfooding consequence is stated against what canonical does TODAY", () => {
  // Without the contrast the passage reads as "nothing changes", which is the opposite of the
  // point: today's self-pin is a real indirection, and the split removes it.
  const cons = section(doc, "Consequences");
  assert.match(cons, /pin.*(itself|to itself)|itself/i,
    "today canonical pins a ref TO ITSELF — the improvement is only legible against that");
});

test("the ADR's dogfooding claim matches what canonical's callers actually do today", () => {
  // Pins the ADR to the repo rather than to a remembered fact. If canonical is ever switched to
  // local-path callers, this fails and the ADR's "today" passage must be updated with it.
  const wf = join(REPO, ".github", "workflows", "flow-gates.yml");
  const src = readFileSync(wf, "utf8");
  assert.match(src, /uses:\s*CandidDan\/flow\/\.github\/workflows\/_flow-gates\.yml@/,
    "the ADR states canonical pins a reusable ref to itself today — that must still be true");
});

// ── the ADR-0002 cross-reference the scope asks for ──────────────────────────────────────────

test("the ADR cross-references ADR-0002 / Amendment 1 on the flightdeck's hosting question", () => {
  assert.match(doc, /ADR-0002/, "the cross-reference must name ADR-0002");
  assert.match(doc, /Amendment 1/, "…and its Amendment 1, which is what made the flightdeck a page");
  assert.match(doc, /candidate host/i,
    "the release repo is a CANDIDATE host — not a decision, and the wording carries that");
  assert.match(doc, /holds no store|no store/i,
    "…precisely because it holds no store, which is the whole reason it is a candidate");
});

test("the flightdeck hosting question is recorded as NOT decided here", () => {
  assert.match(doc, /not decided|not in this ADR's scope|interaction, not a decision/i,
    "hosting the flightdeck is out of scope — an ADR that blurs this licenses unplanned work");
});

// ── the scope's "deliberately does NOT" — the ADR decides, it does not implement ─────────────

test("the ADR records that it decides without implementing, and names the sequels", () => {
  const notDone = section(doc, "What this ADR does not do");
  assert.ok(notDone, "no section recording what this ADR deliberately does not do");
  assert.match(notDone, /flow-0029/, "flow-0029 builds the publish mechanism");
  assert.match(notDone, /flow-0030/, "flow-0030 re-pins the fleet");
  assert.match(notDone, /VISION\.md|README\.md|runbook/i,
    "the docs that still describe the single-repo world are correct until the implementation lands");
});

// ── a doc that names paths must name paths that exist ────────────────────────────────────────

test("every repo-relative path ADR-0005 names actually exists", () => {
  // Conservative extraction, same posture as adr-vision-layer.test.mjs. Narrower on one point:
  // only a trailing-slash directory or a path with a file extension is checked, so a GitHub
  // owner/repo slug (`CandidDan/flow`) is not mistaken for a file in this working tree.
  const missing = [];
  for (const [, raw] of doc.matchAll(/`([^`\n]+)`/g)) {
    if (/[<>*()\s…]/.test(raw)) continue;
    if (/^\.[a-z]+$/i.test(raw)) continue;
    if (!/^[\w.@-]+(\/[\w.@-]+)*\/?$/.test(raw)) continue;
    const isDir = raw.endsWith("/");
    const hasExt = /\.(md|ya?ml|mjs|json|html)$/i.test(raw);
    if (!isDir && !hasExt) continue;
    if (!existsSync(join(REPO, raw))) missing.push(raw);
  }
  assert.deepEqual(missing, [], `ADR-0005 names paths that do not exist: ${missing.join(", ")}`);
});
