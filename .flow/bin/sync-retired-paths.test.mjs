// sync-retired-paths.test.mjs — proving test for flow-0184.
//
// `_flow-sync.yml` deletes the retired paths in its `for RETIRED in …` line; `classifyPr` accepts
// deletions of exactly those paths as part of a sync PR. Two lists would drift, and a drift is a
// sync PR reviewed as a feature PR (CandidDan/Nudge#392). This parses the workflow's line and
// asserts it equals the helper's `SYNC_RETIRED_PATHS`, so neither can change alone.
// Canonical-only: it reads the reusable workflow, which adopting repos do not have.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { SYNC_RETIRED_PATHS } from "../../project-template/.flow/bin/flow-review.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW = join(ROOT, ".github", "workflows", "_flow-sync.yml");

test("flow-0184: _flow-sync.yml's RETIRED list equals the helper's SYNC_RETIRED_PATHS",
  { skip: existsSync(WORKFLOW) ? false : "the reusable lives only in canonical" },
  () => {
    const m = readFileSync(WORKFLOW, "utf8").match(/^\s*for RETIRED in ((?:"[^"]+"\s*)+); do/m);
    assert.ok(m, "the `for RETIRED in …; do` line was not found — a reader that finds nothing proves nothing");
    const inWorkflow = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    assert.deepEqual(inWorkflow, [...SYNC_RETIRED_PATHS]);
  });
