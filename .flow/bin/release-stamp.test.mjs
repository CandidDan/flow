// release-stamp.test.mjs — proving tests for the 1.3.0 release stamp and its changelog entry.
//
// Criteria proved here (flow-0044):
//   · "both stamps are 1.3.0 — and a test over the real files fails if the two ever disagree or
//      either stops being MAJOR.MINOR.PATCH, derived at run time rather than compared to a literal"
//   · "the section named by the root stamp exists and is non-empty"
//   · "the ## 1.3.0 section carries one entry per adopter-consumed change since v1.2.0, each
//      naming its caller action; the queue-runner FLOW_PAT change (flow-0026) is among them"
//
// These run over the REAL files in this repo, not a fixture: a release stamp that is only correct
// in a temp directory is not a release stamp. `release-guard.mjs` already compares the stamps
// against the tags; nothing compared them against the changelog, which is the half a human reads
// at tag time.
//
// WHY ALMOST NOTHING HERE IS A LITERAL. `1.3.0` is true for exactly one release. A test that
// hardcodes it in the stamp comparison starts failing the moment 1.4.0 lands, and the fix then is
// to edit the test — which is how a test stops being a check and becomes a chore. So the stamp is
// read at run time and the changelog is looked up *by* it: these assertions hold at 1.4.0 and
// beyond without an edit.
//
// The one place a literal is correct is the tombstone block at the bottom. The `## 1.3.0` section
// is immutable history once shipped — a changelog section that changes after its tag is a lie
// about what was released — so pinning its contents by name is the point, not an oversight.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

// Both the stamp locations and the semver shape come from release-guard rather than being
// restated. Two definitions of "which two files" is exactly the drift this is meant to catch.
import { canonicalVersionFiles } from "./release-guard.mjs";
import { SEMVER } from "./release-guard.mjs";

const { root, rootPath, templatePath, rootFile, templateFile } = canonicalVersionFiles();

const readStamp = (file) => readFileSync(file, "utf8").trim();
const CHANGELOG_PATH = "CHANGELOG.md";
const changelog = readFileSync(join(root, CHANGELOG_PATH), "utf8");

// Split the changelog into `## ` sections. Returns a Map of heading-line -> body lines, in file
// order. Deliberately line-based: a heading is a line starting with `## `, and nothing else is.
function sections(text) {
  const out = new Map();
  let heading = null;
  let body = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      if (heading !== null) out.set(heading, body);
      heading = line.slice(3).trim();
      body = [];
    } else if (heading !== null) {
      body.push(line);
    }
  }
  if (heading !== null) out.set(heading, body);
  return out;
}

// The section a stamp names: its heading starts with the version, followed by end-of-line or a
// non-version character (`## 1.3.0 — 2026-09-14 (…)`). Anchored on the left so `1.3.0` cannot
// match `## 11.3.0`, and bounded on the right so it cannot match `## 1.3.01`.
function sectionFor(stamp, text = changelog) {
  for (const [heading, body] of sections(text)) {
    if (heading === stamp || heading.startsWith(`${stamp} `)) return { heading, body };
  }
  return null;
}

// A changelog entry is a top-level bullet — `- ` at column 0. Continuation lines are indented,
// and nested bullets are indented too, so neither is counted twice.
function entries(body) {
  const out = [];
  for (const line of body) {
    if (line.startsWith("- ")) out.push(line);
    else if (out.length && (line.startsWith("  ") || line.trim() === "")) out[out.length - 1] += `\n${line}`;
  }
  return out;
}

// ── Criterion 1: the two stamps ────────────────────────────────────────────────────────────────

test("both stamps are the same version — they move together or not at all", () => {
  assert.equal(
    readStamp(rootFile),
    readStamp(templateFile),
    `${rootPath} and ${templatePath} disagree. They are pinned to each other by release-guard's ` +
    `rule 2 alone; an adopting repo reads the template stamp to decide whether it is behind, and ` +
    `flow-sync reads the root one — so a split stamp tells two repos two different truths.`,
  );
});

test("both stamps are MAJOR.MINOR.PATCH — nothing else is a release", () => {
  for (const [path, file] of [[rootPath, rootFile], [templatePath, templateFile]]) {
    const stamp = readStamp(file);
    assert.match(stamp, SEMVER, `${path} contains "${stamp}", which release-guard will not parse`);
  }
});

// ── Criterion 2: the changelog section the stamp names ─────────────────────────────────────────

test("the changelog carries a section named by the root stamp, and it is not empty", () => {
  const stamp = readStamp(rootFile);
  const section = sectionFor(stamp);
  assert.ok(
    section,
    `${CHANGELOG_PATH} has no "## ${stamp}" section. The stamp is what an adopting repo sees ` +
    `move; the section is the only place that says what moved with it. Headings present: ` +
    `${[...sections(changelog).keys()].join(", ")}`,
  );
  assert.ok(
    entries(section.body).length > 0,
    `"## ${section.heading}" exists but lists no entries — a released version with an empty ` +
    `changelog section is worse than no section, because it reads as "nothing changed".`,
  );
});

test("every entry in the stamp's section names its caller action", () => {
  const stamp = readStamp(rootFile);
  const section = sectionFor(stamp);
  assert.ok(section, `no "## ${stamp}" section to check`);
  for (const entry of entries(section.body)) {
    const first = entry.split("\n")[0];
    // Two spellings are accepted, because the criterion is "names its caller action or states
    // that none is required" and the house style has both: the bracketed
    // `[caller action: …]` clause from the entry template, and the plain `No caller action.`
    // sentence some entries open with. Requiring one spelling would have meant rewriting entries
    // that already say the thing — and a changelog entry is evidence, not a form to fill in.
    assert.match(
      entry, /caller action/i,
      `this entry states no caller action:\n  ${first}\n` +
      `Caller-level changes do not ride the alias — an entry that does not say whether a repo ` +
      `must edit its own callers leaves the reader to find out by having it break.`,
    );
  }
});

test("`## Unreleased` survives the release, empty, for the next change", () => {
  const unreleased = sectionFor("Unreleased");
  assert.ok(unreleased, `${CHANGELOG_PATH} lost its "## Unreleased" section — the next change has ` +
    `nowhere to land, and the pressure is then to write it into a shipped section.`);
  assert.equal(
    entries(unreleased.body).length, 0,
    `"## Unreleased" still lists entries after a release — they belong in the released section, ` +
    `or the stamp moved without them.`,
  );
});

// ── Criterion 3: the tombstone ─────────────────────────────────────────────────────────────────
//
// Literals below are deliberate, and are the only ones in this file. `## 1.3.0` is a record of
// what shipped on 2026-09-14; if it changes, either history was rewritten or the section was
// reused for a later release, and both are things this should fail on.

test("tombstone: the 1.3.0 section records the queue-runner FLOW_PAT change, which is why it was cut", () => {
  const section = sectionFor("1.3.0");
  assert.ok(section, `${CHANGELOG_PATH} has no "## 1.3.0" section — 1.3.0 is shipped history`);
  const text = section.body.join("\n");
  for (const [needle, why] of [
    ["_flow-queue-runner.yml", "the file the fix lives in"],
    ["FLOW_PAT", "the secret the fix introduces"],
    ["flow-0026", "the task that made it"],
    ["github-actions[bot]", "the symptom — the author the worker's PR used to have"],
  ]) {
    assert.ok(
      text.includes(needle),
      `the 1.3.0 section does not name "${needle}" (${why}). This release exists to publish that ` +
      `fix: at v1 the worker step is still hardcoded to GITHUB_TOKEN, so the in-CI worker opens ` +
      `its PR as github-actions[bot] and the Definition-of-Done gate does not run on it.`,
    );
  }
});

test("tombstone: every adopter-consumed change merged since v1.2.0 has an entry in 1.3.0", () => {
  // Enumerated once, at release time, from:
  //   git log --oneline v1.2.0..HEAD -- .github/workflows/_flow-*.yml project-template/
  // Pinned as a literal rather than re-derived: `v1.2.0..HEAD` is a moving range, so a test that
  // re-ran that log would start demanding entries for changes that belong to 1.4.0.
  const shipped = [
    "flow-0005", "flow-0007", "flow-0008", "flow-0012", "flow-0013", "flow-0015", "flow-0017",
    "flow-0021", "flow-0025", "flow-0026", "flow-0027", "flow-0031", "flow-0033", "flow-0036",
    "flow-0038", "flow-0039", "flow-0040", "flow-0043",
  ];
  const section = sectionFor("1.3.0");
  assert.ok(section, `${CHANGELOG_PATH} has no "## 1.3.0" section`);
  const text = section.body.join("\n");
  const missing = shipped.filter((id) => !text.includes(id));
  assert.deepEqual(
    missing, [],
    `the 1.3.0 section names no entry for: ${missing.join(", ")}. Each of these touched a ` +
    `reusable or project-template/, so an adopting repo receives it the moment v1 moves — ` +
    `unannounced if it is not in here.`,
  );
});
