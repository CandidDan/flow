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
import { execFileSync } from "node:child_process";
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

// Everything BEFORE Amendment 1 — the ADR as originally accepted. Several assertions below are
// about what the original body says, and must not be satisfiable by text the amendment adds:
// "the hosting question is not decided here" is true of the 2026-08-31 document and would be
// trivially matched by the amendment's own discussion of it. Splitting them keeps each honest.
const AMENDMENT_RULE = /^---\s*$\n+(?=^# Amendment 1\b)/m;
function originalBody(text) { return text.split(AMENDMENT_RULE)[0]; }

// Body of the `# Amendment 1` block: from its H1 to the next `# ` H1 (a future Amendment 2) or
// to the end of the document.
function amendment(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^# Amendment 1\b/.test(l));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^# (?!Amendment 1\b)/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

const BODY = originalBody(doc);
const AMD = amendment(doc);

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
  // SUPERSEDED IN PART by ADR-0006, via Amendment 1 (flow-0032). `flightdeck/` no longer stays
  // with the authoring repo — mission control moved out to `CandidDan/inflight` entirely. The
  // inventory line is deliberately NOT edited out of the Decision: an ADR records what was
  // decided on the day, and is amended rather than rewritten. So this still asserts the original
  // text; what it must no longer claim is that the line describes today. The supersession is
  // pinned by "the amendment records ADR-0006's supersession of the flightdeck line" below —
  // do not delete that test and leave this one carrying a stale message again.
  assert.match(decision, /flightdeck/i,
    "the Decision's original inventory named the flightdeck as private — superseded by ADR-0006; see Amendment 1");
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

test("the flightdeck hosting question is recorded as NOT decided in the original body", () => {
  // Asserted against BODY, not `doc`: Amendment 1 discusses the hosting question at length, so
  // matching the whole document would pass even if the original passage were deleted.
  assert.match(BODY, /not decided|not in this ADR's scope|interaction, not a decision/i,
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

// ── flow-0032: Amendment 1 — the name, the topic trap, the cutover order, the tree ownership ──
//
// The amendment carries four operational facts that lived only in task notes on flow-0029 and
// flow-0030, where the worker of those tasks was the only reader. Each is a trap that costs
// something real if it is lost — a fleet-wide CI outage, a phantom project in the operator's own
// rollup, a silently discarded file — so each gets its own assertion rather than riding on a
// single "the amendment exists" check.
//
// Criteria proved: all of flow-0032's except the final gate-passes criterion, which the gate
// itself proves.

// The header field names an amendment carries, in order. Shared with ADR-0002's Amendment 1
// rather than asserted twice — the criterion's bar is "the same format as ADR-0002's".
function amendmentHeaderShape(block) {
  const lines = block.split("\n").slice(0, 8);
  return lines.filter((l) => /^\*\*(Status|Date|Deciders|Amends):\*\*\s*\S/.test(l))
              .map((l) => l.match(/^\*\*(\w+):\*\*/)[1]);
}

test("ADR-0005 carries an Amendment 1 in ADR-0002's amendment format", () => {
  assert.ok(AMD, "no `# Amendment 1` block in ADR-0005");
  assert.match(AMD, /^# Amendment 1 — \S/,
    'expected an "# Amendment 1 — <title>" H1, em-dashed as ADR-0002\'s is');
  assert.deepEqual(amendmentHeaderShape(AMD), ["Status", "Date", "Deciders", "Amends"],
    "the amendment must carry Status, Date, Deciders and Amends, in that order");
  assert.match(AMD, /^\*\*Date:\*\*\s*\d{4}-\d{2}-\d{2}\s*$/m, "Date must be a bare ISO date");
  assert.match(AMD, /^\*\*Amends:\*\*\s*\S/m, "Amends must say WHAT is amended, not merely exist");
});

test("the amendment is preceded by a `---` rule, as ADR-0002's is", () => {
  assert.match(doc, AMENDMENT_RULE,
    "ADR-0002 separates its amendment from the body with a horizontal rule — match it");
});

test("ADR-0002's Amendment 1 really does have the format ADR-0005 is being held to", () => {
  // Pins the convention to the sibling rather than to this file's memory of it. If ADR-0002's
  // amendment is ever restructured, this fails and the shared shape gets re-decided once.
  const sibling = amendment(readFileSync(join(ADR_DIR, SIBLINGS[1]), "utf8"));
  assert.ok(sibling, `${SIBLINGS[1]}: expected an Amendment 1 block to compare against`);
  assert.deepEqual(amendmentHeaderShape(sibling), ["Status", "Date", "Deciders", "Amends"],
    `${SIBLINGS[1]}: the format ADR-0005's amendment is held to must be the one this sibling uses`);
});

test("the ADR's top Status line records that it has been amended", () => {
  // Without this, a reader who stops at the header — which is the point of a header — takes the
  // superseded inventory and the deferred name at face value.
  assert.match(doc, /^\*\*Status:\*\*\s*Accepted\b.*\bamend/im,
    "the top Status line must note the amendment, as ADR-0002's does");
});

test("the amendment names the release repo, and states that it is public", () => {
  assert.match(AMD, /`CandidDan\/flow-protocol`/,
    "the whole point of the amendment is that the deferred name is now recorded");
  assert.match(AMD, /public/i, "…and that the release repo is public — it must be, to be callable");
});

test("the amendment names `flow-agent-protocol` as the rejected form, with the reason", () => {
  assert.match(AMD, /`?flow-agent-protocol`?/,
    "this ADR family keeps its alternatives — the rejected name must be findable");
  assert.match(AMD, /vendor.{0,20}neutral|agent.{0,20}neutral|neutral/i,
    "the reason `agent` was dropped is that the protocol is deliberately vendor- and agent-neutral");
  assert.match(AMD, /permanent|cannot be changed|expensive|re-pin/i,
    "…and that the name is a permanent public reference, which is what makes the choice costly");
});

test("the amendment records that the release repo must NOT carry the `flow` topic", () => {
  assert.match(AMD, /topic/i, "the constraint is about a GitHub topic — say so");
  assert.match(AMD, /must not|never be tagged|not be tagged/i,
    "stated as a prohibition, not as a preference a future maintainer can weigh");
  assert.match(AMD, /`?topic:flow`?/i, "name the topic exactly — `flow`, the enrolment selector");
});

test("the topic constraint records WHY, not merely the rule", () => {
  // A bare "don't tag it" is the kind of rule that gets undone by someone tidying repository
  // settings. The reason is what makes it stick.
  assert.match(AMD, /enrol|discover/i,
    "`topic:flow` is the ENROLMENT mechanism for the fleet views — that is the whole reason");
  assert.match(AMD, /flightdeck\/bin\/mission-control\.mjs|mission-control/i,
    "name the consumer that reads the topic, so the claim is checkable");
  assert.match(AMD, /watchdog/i, "…and the watchdog, which reads the same selector");
  assert.match(AMD, /phantom|store-less|no store/i,
    "the failure mode is a phantom store-less project in the operator's own rollup");
});

test("the amendment records the cutover ORDER, all four steps in sequence", () => {
  const order = ["publish", "re-?pin", "verif|green", "private"];
  let cursor = -1;
  for (const step of order) {
    const at = AMD.slice(cursor + 1).search(new RegExp(step, "i"));
    assert.notEqual(at, -1, `cutover step not found in order: ${step}`);
    cursor = cursor + 1 + at;
  }
  assert.match(AMD, /only then|last|finally/i,
    "the visibility flip is explicitly LAST — an ordering with no emphasis is a suggestion");
});

test("the cutover records the consequence of flipping canonical private too early", () => {
  assert.match(AMD, /at once|simultaneous|all at once|every adopting repo/i,
    "the failure is fleet-wide and simultaneous — that is why the order is a safety property");
  assert.match(AMD, /their CI|in \*their\* CI|adopting repo'?s CI/i,
    "…and it surfaces in the ADOPTER's CI, furthest from the cause, with nothing local to explain it");
});

test("the cutover reason is stated in COUNTS, not vaguely", () => {
  // flow-0032's criterion says "in counts, not vaguely". A number also decays visibly, where a
  // hand-wave does not: a reader can re-run the count and see it has moved.
  const numbers = [...AMD.matchAll(/\*\*(\d+)[^*]*\*\*|\b(\d+) (?:files|of those|of them)\b/gi)];
  assert.ok(numbers.length >= 2,
    "the amendment must quantify the exposure — at least the file count and the caller count");
  assert.match(AMD, /\b\d+ files\b/i, "state how many files still name the old reference");
  assert.match(AMD, /`uses:`|uses: /,
    "…and how many are real `uses:` references, which are the ones that break at run time");
});

// The BARE reference, anchored. A substring match for "CandidDan/flow" also hits
// `CandidDan/flow-protocol` and `CandidDan/flow-plugin` — different repositories, needing no
// re-pinning — and overstates the exposure by three files. The anchoring is done in JS rather
// than with `git grep -P`, because -P needs a PCRE-enabled git build and this assertion must not
// depend on how the runner's git was compiled: git does the cheap narrowing, JS does the logic.
const BARE_REF = /CandidDan\/flow(?!-)/;

// A `uses:` reference GitHub actually RESOLVES. It parses `uses:` inside `.github/workflows/*.yml`
// and nowhere else, so the same string in a runbook, in docs/flow-map.html or in a .test.mjs
// fixture is prose. Counting prose as a reference inflates the number that the whole cutover
// ordering argument rests on.
const USES_BARE = /uses:\s*CandidDan\/flow(?!-)/;

function filesNamingBareRef() {
  const candidates = execFileSync(
    "git", ["grep", "-lI", "CandidDan/flow", "--", ".", ":(exclude).flow/tasks/"],
    { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  return candidates.filter((f) => BARE_REF.test(readFileSync(join(REPO, f), "utf8")));
}

function resolvedCallers(prefix) {
  return filesNamingBareRef().filter((f) =>
    f.startsWith(prefix) && /\.ya?ml$/.test(f) &&
    USES_BARE.test(readFileSync(join(REPO, f), "utf8")));
}

test("the amendment's file counts still match the working tree", () => {
  // Pins the ADR to the repo rather than to a remembered number, exactly as the dogfooding test
  // above pins its "today" passage. When this fails, the count has drifted and the amendment's
  // paragraph must be updated with it — that drift is the point, not noise.
  //
  // The measurement itself is the part that needs care. The first version of this test counted an
  // UNANCHORED substring and so asserted the ADR against the same wrong number it had put in the
  // ADR: consistent, self-confirming, and wrong by three files. A test that re-derives the claim's
  // own mistake proves only that the mistake was made twice.
  const claimed = parseInt(AMD.match(/\*\*(\d+) files outside the task store/)[1], 10);
  const actual = filesNamingBareRef().length;
  assert.equal(claimed, actual,
    `the amendment claims ${claimed} files outside the store name the bare CandidDan/flow; ` +
    `the tree has ${actual}`);
});

test("the amendment's `uses:` counts distinguish a resolved reference from prose", () => {
  const own = resolvedCallers(".github/workflows/");
  const template = resolvedCallers("project-template/.github/workflows/");

  const claimedUses = parseInt(AMD.match(/\*\*(\d+) carry a `uses:` reference/)[1], 10);
  assert.equal(claimedUses, own.length + template.length,
    `the amendment claims ${claimedUses} resolved \`uses:\` references; the workflow files have ` +
    `${own.length + template.length} (${own.length} canonical + ${template.length} template)`);

  const claimedCallers = parseInt(AMD.match(/\*\*(\d+) in `project-template\/\.github\/workflows\/`/)[1], 10);
  assert.equal(claimedCallers, template.length,
    `the amendment claims ${claimedCallers} template callers; the tree has ${template.length}`);

  // The blast-radius sentence restates the caller count in prose. If the two ever disagree the
  // paragraph argues against itself, which is worse than either number being stale.
  const restated = parseInt(AMD.match(/all (\d+) callers fail to resolve/)[1], 10);
  assert.equal(restated, template.length,
    `the blast-radius sentence says ${restated} callers, the count above says ${template.length}`);
});

test("no file counted as a bare reference merely names a DIFFERENT CandidDan repo", () => {
  // The specific defect this suite shipped with once. Guards the anchoring itself rather than the
  // number it produces, so it keeps biting after the count has moved on.
  for (const f of filesNamingBareRef()) {
    const text = readFileSync(join(REPO, f), "utf8");
    const bare = text.match(/CandidDan\/flow(?![-\w])/g) ?? [];
    assert.ok(bare.length > 0,
      `${f} was counted as naming CandidDan/flow, but only names a suffixed repo such as ` +
      `CandidDan/flow-protocol or CandidDan/flow-plugin`);
  }
});

test("the amendment records that publication REPLACES the release repo's tree", () => {
  assert.match(AMD, /replace/i,
    "an orphan snapshot replaces the tree — that is what makes hand-added files disposable");
  assert.match(AMD, /hand-add|by hand|hand-adding/i, "the instinct being pre-empted is fixing it by hand");
  assert.match(AMD, /do(es)? not survive|discard/i, "…and the outcome: the file is gone on next publish");
  assert.match(AMD, /LICENSE|README\.md/,
    "name the files someone would actually add, or the rule stays abstract");
  assert.match(AMD, /out-of-manifest|manifest/i,
    "the worse case is confusing flow-0029's out-of-manifest check — record it, it is not obvious");
});

test("the amendment records ADR-0006's supersession of the flightdeck line", () => {
  // This is the assertion that replaces the stale claim in "the Decision names what stays
  // PRIVATE" above. Deleting it puts that message back into the position of certifying a fact
  // that stopped being true on 2026-09-03.
  assert.match(AMD, /ADR-0006|0006-mission-control-own-repo\.md/,
    "the superseding ADR must be named, so a reader can follow it");
  assert.match(AMD, /supersede/i, "stated as a supersession, not as a passing mention");
  assert.match(AMD, /`CandidDan\/inflight`/, "name where mission control actually went");
  assert.match(AMD, /private/i,
    "inflight is PRIVATE (Vercel serves private repos) — an earlier draft had it public, and the "
    + "difference is the whole reason the Pages route was abandoned");
  assert.match(AMD, /not.{0,40}release repo|does \*\*not\*\* move to the release repo/i,
    "…and that it did NOT go to the release repo — ADR-0006 rejected that on this ADR's own rule");
});

test("the amendment records that ADR-0006 answered the deferred hosting question", () => {
  assert.match(AMD, /hosting question|hosting/i,
    "the 'Interaction with ADR-0002' section left hosting open — the amendment must close it");
  assert.match(AMD, /answer|decided|no longer a candidate/i,
    "…by pointing at where it WAS decided, rather than leaving two open-looking passages");
});

test("the amendment reopens nothing, and says so", () => {
  // flow-0032's scope is explicit that the Decision, Consequences and Alternatives stand. Without
  // this recorded in the document, a later reader cannot tell an amendment from a revision.
  assert.match(AMD, /stand unchanged|reopens nothing|revises nothing|unchanged/i,
    "an amendment that does not say what it leaves alone reads as a partial rewrite");
});

test("the amendment does not implement, and says which tasks do", () => {
  assert.match(AMD, /flow-0029/, "flow-0029 publishes");
  assert.match(AMD, /flow-0030/, "flow-0030 re-pins");
  assert.match(AMD, /does not implement|records; it does not|not.*flipped/i,
    "the amendment decides and records — it changes no repository setting");
});
