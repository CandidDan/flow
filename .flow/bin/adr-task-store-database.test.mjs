// adr-task-store-database.test.mjs — proves docs/adr/0012-task-state-in-a-database.md keeps the
// parts of the decision that a later edit is most likely to trim: the contract operations, the
// rule that workers never hold a database key, the outage rule, and the supersession of the two
// earlier ADRs.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADR_DIR = join(REPO, "docs", "adr");
const ADR = join(ADR_DIR, "0012-task-state-in-a-database.md");
const doc = existsSync(ADR) ? readFileSync(ADR, "utf8") : "";

test("ADR-0012 exists and has the sibling header shape", () => {
  assert.ok(doc.length > 2000, "docs/adr/0012-task-state-in-a-database.md is missing or a stub");
  const head = doc.split("\n").slice(0, 8);
  assert.match(head[0], /^# ADR-0012: \S/);
  assert.deepEqual(
    head.filter((l) => /^\*\*(Status|Date|Deciders):\*\*\s*\S/.test(l)).map((l) => l.match(/^\*\*(\w+):\*\*/)[1]),
    ["Status", "Date", "Deciders"]);
});

test("ADR-0012 states every storage-contract operation", () => {
  for (const op of ["get(id)", "list(filter)", "claim(id, owner)", "transition(id, to, by)",
    "block(id, reason, blocked_by)", "note(id, text)", "create(task)", "ready()", "history(id)"]) {
    assert.ok(doc.includes("`" + op), `contract operation missing: ${op}`);
  }
});

test("ADR-0012 says workers never hold a database key, and a down database does not fall back to git", () => {
  assert.match(doc, /Workers never hold a database key/);
  assert.match(doc, /nothing falls back to git/);
});

test("ADR-0012 supersedes ADR-0001 and ADR-0011, and both say so", () => {
  assert.match(doc, /\*\*Supersedes:\*\* ADR-0001[^\n]*ADR-0011/);
  for (const f of ["0001-task-store-files-vs-github-issues.md", "0011-where-task-state-lives.md"]) {
    const text = readFileSync(join(ADR_DIR, f), "utf8");
    assert.match(text, /^\*\*Status:\*\* Superseded by ADR-0012/m, `${f} must name ADR-0012`);
  }
});

test("ADR-0012 keeps cross-repo aggregation out of Flow (VISION G7) and the gate unchanged", () => {
  assert.match(doc, /Flow does not build it/);
  assert.match(doc, /The gate\./);
});
