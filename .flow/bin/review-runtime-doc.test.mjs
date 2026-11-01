// review-runtime-doc.test.mjs — proving tests for flow-0187 (review runtime spike).
//
// The deliverable is a research doc, so these tests pin its shape: the five sections the task
// names, that the two vendor sections carry a number and a source, and that the recommendation
// commits to exactly one option and says how a single review moves between Claude and Codex.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC = readFileSync(join(REPO, "docs/research/review-runtime.md"), "utf8");

const HEADINGS = ["1. Load", "2. Claude routines", "3. Codex", "4. Switching cost", "5. Recommendation"];

// The body of the `## <heading>` section, up to the next `## ` heading.
function section(heading) {
  const lines = DOC.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  assert.notEqual(start, -1, `missing section "## ${heading}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

test("the doc has the five section headings, in order", () => {
  const found = DOC.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim());
  assert.deepEqual(found, HEADINGS);
});

for (const heading of ["2. Claude routines", "3. Codex"]) {
  test(`section "${heading}" contains at least one number and one source link`, () => {
    const body = section(heading);
    assert.match(body, /\b\d+\b/, "no number");
    assert.match(body, /\]\(https:\/\/[^)\s]+\)/, "no source link");
  });
}

test("the recommendation names exactly one option and says how one review moves between Claude and Codex", () => {
  const body = section("5. Recommendation");
  const verdict = body.trim().split("\n\n")[0];
  const OPTIONS = [/reviews? as routines/i, /one runner job/i, /webhook relay/i];
  const named = OPTIONS.filter((o) => o.test(verdict));
  assert.equal(named.length, 1, `the verdict paragraph names ${named.length} options: ${verdict}`);
  assert.match(verdict, /single review/i);
  assert.match(verdict, /Claude/);
  assert.match(verdict, /Codex/);
  assert.match(verdict, /claude-code-action/);
  assert.match(verdict, /codex-action/);
});

test("the spike's status/check probe results are filled in, not left as placeholders", () => {
  assert.doesNotMatch(DOC, /PROBE_(STATUS|CHECK)/);
});
