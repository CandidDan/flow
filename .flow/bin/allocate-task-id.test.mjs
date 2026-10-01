// allocate-task-id.test.mjs — proving tests for canonical's allocate-task-id adapter (flow-0021).
//
// Same hazard as every other adapter here (see adapters.test.mjs's header): a copy or a symlink
// would resolve `project-template/` as the repo root, and `--dry-run` would allocate against the
// template's near-empty fixture store while still exiting 0. The template's own test file proves
// the pure allocator and the git transaction; this one proves only what's unique to adopting it
// here — which store, which prefix, and that the CLI actually runs.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalProjectName, canonicalRepoRoot, nextId, readIdsFromOrigin, readQueueCap,
  readStoreFromOrigin,
} from "./allocate-task-id.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE_FLOW = join(REPO, "project-template", ".flow");

test("the adapter resolves CANONICAL's repo root, not the template's", () => {
  assert.equal(canonicalRepoRoot(), REPO);
  assert.notEqual(canonicalRepoRoot(), dirname(TEMPLATE_FLOW),
    "project-template/ is the fixture store — allocating against it would silently allocate " +
    "ids nobody's real store agrees with");
});

test("canonicalProjectName reads 'flow' out of this repo's own .flow/config.yml", () => {
  assert.equal(canonicalProjectName(), "flow");
  assert.equal(canonicalProjectName(TEMPLATE_FLOW), "",
    "given a root with no .flow/config.yml at that path, it returns '' rather than guessing");
});

test("readIdsFromOrigin, pointed at canonical, returns real flow-NNNN ids from origin/main", () => {
  // `flow-gates.yml`'s `flow-tooling` job checks this repo out with `actions/checkout@v4`'s
  // default (shallow, single-ref) settings — it never fetches `origin/main` on its own, unlike
  // the `touches` job (`fetch-depth: 0`). Every REAL caller of `readIdsFromOrigin` reaches it
  // through `allocateTaskId`, which fetches first; a standalone call needs to do the same or it
  // sees whatever `origin/main` state a shallow checkout happened to leave behind.
  spawnSync("git", ["-C", REPO, "fetch", "origin", "main", "--quiet"]);
  const ids = readIdsFromOrigin(REPO);
  assert.ok(ids.length > 10, "canonical's real store holds a real backlog");
  assert.ok(ids.every((id) => /^flow-\d{4}$/.test(id)), "every id must be canonical's own shape");
  assert.ok(ids.includes("flow-0021"), "this task's own id must be among them");
});

test("--dry-run at canonical's repo root prints the next real id and writes/commits/pushes nothing", () => {
  const before = spawnSync("git", ["status", "--porcelain", "--", ".flow/tasks"], { cwd: REPO, encoding: "utf8" });

  const r = spawnSync(process.execPath, [join(BIN, "allocate-task-id.mjs"), "--dry-run"],
    { cwd: REPO, encoding: "utf8" });

  assert.equal(r.status, 0, r.stderr);
  const printed = r.stdout.trim();
  assert.match(printed, /^flow-\d{4}$/, `expected a bare flow-NNNN id; got: ${JSON.stringify(r.stdout)}`);

  const ids = readIdsFromOrigin(REPO);
  assert.equal(printed, nextId(ids, "flow"), "the CLI's id must match what the pure allocator computes independently");

  const after = spawnSync("git", ["status", "--porcelain", "--", ".flow/tasks"], { cwd: REPO, encoding: "utf8" });
  assert.equal(after.stdout, before.stdout, "--dry-run must leave the store exactly as it found it");
});

test("--prefix is derived automatically — omitting it still resolves canonical's own prefix", () => {
  const withPrefix = spawnSync(process.execPath, [join(BIN, "allocate-task-id.mjs"), "--dry-run", "--prefix", "flow"],
    { cwd: REPO, encoding: "utf8" });
  const withoutPrefix = spawnSync(process.execPath, [join(BIN, "allocate-task-id.mjs"), "--dry-run"],
    { cwd: REPO, encoding: "utf8" });
  assert.equal(withoutPrefix.stdout, withPrefix.stdout,
    "an explicit --prefix flow and the adapter's own default must agree");
});

test("the CLI actually runs against this checkout — silence is the symlink failure mode", () => {
  const r = spawnSync(process.execPath, [join(BIN, "allocate-task-id.mjs"), "--dry-run"], { cwd: REPO, encoding: "utf8" });
  assert.ok(r.stdout.trim().length > 0, "a symlinked adapter exits 0 with empty output — this must not be that");
});

// ══ the queue cap, as canonical resolves it (flow-0070) ════════════════════════════════════
//
// The cap itself is proved in the template's own test file. What is unique to adopting it here
// is WHICH config is read: the template's CLI reads `<repoRoot>/.flow/config.yml`, and the repo
// root comes from this adapter. A copy or a symlink would resolve `project-template/` — which
// declares no `queue_cap` at all — and allocate uncapped while still exiting 0, the same silent
// failure mode every other test in this file exists to catch.

test("the cap the adapter resolves is CANONICAL's queue_cap: 8, not the template's absent one", () => {
  assert.equal(readQueueCap(REPO), 8,
    "canonical's own .flow/config.yml sets the cap — see flow-0070");
  assert.equal(readQueueCap(dirname(TEMPLATE_FLOW)), null,
    "project-template/ documents the key COMMENTED OUT, so a mis-resolved root reads as uncapped");
});

test("the adapter's --dry-run with a --content-file reports the cap decision and writes nothing", () => {
  spawnSync("git", ["-C", REPO, "fetch", "origin", "main", "--quiet"]);
  const { readyCount } = readStoreFromOrigin(REPO);
  const before = spawnSync("git", ["status", "--porcelain", "--", ".flow/tasks"], { cwd: REPO, encoding: "utf8" });

  // The draft lives outside the repo: a dry run must not even leave a scratch file behind.
  const dir = mkdtempSync(join(tmpdir(), "flow-cap-draft-"));
  try {
    const contentFile = join(dir, "draft.md");
    writeFileSync(contentFile, '---\nid: "PENDING"\nstatus: "ready"\npriority: 3\ntouches: []\n---\n\ndraft\n');

    const r = spawnSync(process.execPath, [join(BIN, "allocate-task-id.mjs"), "--dry-run", "--content-file", contentFile],
      { cwd: REPO, encoding: "utf8" });

    assert.equal(r.status, 0, r.stderr);
    const [id, decision] = r.stdout.trim().split("\n");
    assert.match(id, /^flow-\d{4}$/, `line 1 must stay the bare id; got: ${JSON.stringify(r.stdout)}`);

    // Asserted against the live store rather than against a number copied into this file: the
    // queue drains, and a test that hard-codes "13 ready" would be proving last week's state.
    assert.match(decision, /cap 8/, "the decision must name the cap it read from canonical's config");
    assert.match(decision, new RegExp(`${readyCount} ready`), "and the ready count it counted");
    if (readyCount >= 8) {
      assert.match(decision, /^queue_cap: REFUSE/, "over the cap, a plain `ready` draft is refused");
      assert.match(decision, /urgent/, "and the refusal names the one bypass");
      assert.match(decision, /blocked/, "and the other way forward");
    } else {
      assert.match(decision, /^queue_cap: ok/, "under the cap, nothing is refused");
    }

    const after = spawnSync("git", ["status", "--porcelain", "--", ".flow/tasks"], { cwd: REPO, encoding: "utf8" });
    assert.equal(after.stdout, before.stdout, "--dry-run must leave the store exactly as it found it");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
