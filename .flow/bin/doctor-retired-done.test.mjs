// doctor-retired-done.test.mjs — the retired-goal exemption, proved against canonical's REAL store
// rather than a fixture (flow-0043).
//
// The behaviour itself is proved precisely in project-template/.flow/bin/flow-doctor.test.mjs,
// where fixtures pin each status in isolation. This file exists for the half a fixture cannot
// reach: that the exemption holds against the actual task files on disk, whose frontmatter is
// written by hand and by three different workflows rather than by a test helper. A fixture proves
// the rule; this proves the rule still applies to the data the rule was written for.
//
// It asserts a PROPERTY, deliberately, not a count. An earlier task in this repo (flow-0032)
// shipped a test that pinned a hardcoded number which its own helper re-derived using the same
// flawed measurement — it passed while being wrong, because it agreed with itself. So nothing here
// records "8 warnings": the store moves, and a number would age into a lie or into noise. What is
// asserted is the invariant that cannot age — no `done` task appears in the retired-goal warnings —
// with the statuses read from the task files independently of whatever the doctor reports.
//
// Criteria proved here (flow-0043): the canonical-store criterion. The per-status criteria are
// proved by the template's fixture tests.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { runDoctor } from "../../project-template/.flow/bin/flow-doctor.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TASKS = join(REPO, ".flow", "tasks");

// Statuses read straight from the store, not from anything the doctor returned — the two sources
// have to be independent or this only proves the doctor agrees with itself.
function statusById() {
  const map = new Map();
  for (const f of readdirSync(TASKS)) {
    if (!f.endsWith(".md") || f.startsWith("_")) continue;
    const text = readFileSync(join(TASKS, f), "utf8");
    const id = text.match(/^id:\s*"([^"]+)"/m)?.[1];
    const status = text.match(/^status:\s*"([^"]+)"/m)?.[1];
    if (id && status) map.set(id, status);
  }
  return map;
}

const retiredWarnings = (r) => r.warnings.filter((w) => w.includes("## Retired"));

test("no `done` task is warned about for serving a retired goal, in canonical's own store", () => {
  const r = runDoctor({ flowDir: join(REPO, ".flow") });
  const statuses = statusById();

  const offenders = retiredWarnings(r)
    .map((w) => w.match(/^\s*([A-Za-z][\w-]*-\d+):/)?.[1])
    .filter(Boolean)
    .filter((id) => statuses.get(id) === "done");

  assert.deepEqual(offenders, [],
    `these done tasks are still warned about for a retired goal: ${offenders.join(", ")}`);
});

// "the exemption did not silence the check altogether" was deleted on 2026-09-23, as its own
// comment instructed: it asserted that canonical's live store still held at least one task
// anchored to a retired goal. On that date every open G4/G5 task was re-anchored to `maintenance`
// on the human's decision D1, and flow-0002 and flow-0037 were closed, so the drift it relied on
// is gone. The retired-goal check is still proved to speak by the template's fixture tests in
// project-template/.flow/bin/flow-doctor.test.mjs, and the test above was left unweakened.

test("warnings still do not fail the run", () => {
  // The exemption must not have changed the severity contract: a retired-goal anchor reports and
  // does not block. `problems` is what the exit code is computed from.
  const r = runDoctor({ flowDir: join(REPO, ".flow") });
  const fromRetired = r.problems.filter((p) => p.includes("## Retired"));
  assert.deepEqual(fromRetired, [],
    "a retired-goal anchor must warn, never become a problem");
});
