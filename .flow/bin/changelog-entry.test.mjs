// Proves changelogEntry (flow-0098): fragment first, assembled entry second, "" otherwise.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import test from "node:test";
import { changelogEntry } from "./changelog-entry.mjs";

function repo(files) {
  const d = mkdtempSync(join(tmpdir(), "changelog-entry-"));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(d, p, ".."), { recursive: true });
    writeFileSync(join(d, p), body);
  }
  return d;
}

const LOG = `# CHANGELOG

## Unreleased

## 9.9.9 — 2099-01-01

- **First bullet of the entry** (\`a.mjs\`,
  \`b.mjs\`, flow-9999). Body one.

- **Second bullet, same entry.** Caller action: none.

- **Another task** (\`c.mjs\`, flow-1234). Not ours.

- **Last entry in the section** (\`d.mjs\`, flow-8888). Tail.

## 9.9.8 — 2098-01-01

- **Older** (\`e.mjs\`, flow-0001).
`;

test("given a pending fragment, it returns the fragment's text", () => {
  const d = repo({ "changes/flow-9999.md": "- **Pending** (flow-9999). Caller action: none.\n", "CHANGELOG.md": LOG });
  try { assert.equal(changelogEntry(d, "flow-9999"), "- **Pending** (flow-9999). Caller action: none.\n"); }
  finally { rmSync(d, { recursive: true, force: true }); }
});

test("given an assembled entry of two bullets, it returns both and stops at the next task", () => {
  const d = repo({ "CHANGELOG.md": LOG });
  try {
    const e = changelogEntry(d, "flow-9999");
    assert.match(e, /First bullet of the entry/);
    assert.match(e, /Second bullet, same entry\.\*\* Caller action: none\./);
    assert.doesNotMatch(e, /Another task/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("given the entry is last before a heading, the heading is not included", () => {
  const d = repo({ "CHANGELOG.md": LOG });
  try {
    const e = changelogEntry(d, "flow-8888");
    assert.match(e, /Last entry in the section/);
    assert.doesNotMatch(e, /^## /m);
    assert.doesNotMatch(e, /Older/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("given a file list that wraps before the task id, it still finds and bounds the entry", () => {
  const log = "## 9.9.9\n\n- **Wrapped** (`x.yml`,\n  flow-7777). Caller action: none.\n\n- **Next** (`y.yml`,\n  flow-6666). Other.\n";
  const d = repo({ "CHANGELOG.md": log });
  try {
    const e = changelogEntry(d, "flow-7777");
    assert.match(e, /Wrapped/);
    assert.doesNotMatch(e, /Next/);
    assert.match(changelogEntry(d, "flow-6666"), /Other\./);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("given neither a fragment nor an assembled entry, it returns an empty string", () => {
  const d = repo({ "CHANGELOG.md": LOG });
  try { assert.equal(changelogEntry(d, "flow-4242"), ""); }
  finally { rmSync(d, { recursive: true, force: true }); }
  const bare = repo({ "README.md": "x" });
  try { assert.equal(changelogEntry(bare, "flow-9999"), ""); }
  finally { rmSync(bare, { recursive: true, force: true }); }
});
