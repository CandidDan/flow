// flow-pat-forwarding.test.mjs — proving tests for flow-0026, flow-0093 and flow-0095.
//
// flow-0174 retired the queue-runner, and with it the tests of its worker's wiring (flow-0026's
// FLOW_PAT secret and github_token, flow-0093's checkout token and GH_TOKEN, flow-0095's template
// caller header): the files they read are gone. What stays is not about that workflow.
//
// Criteria proved here (flow-0093):
//   · "_flow-open-pr.yml's header and docs/flow-reusable-workflows.md carry the same
//      four-permission list"
//   · "the docs state the Actions PR-creation setting is not needed, with the reason"
//   · "changes/flow-0093.md exists and states the caller action"
//
// Criteria proved here (flow-0095):
//   · "changes/flow-0095.md exists and states the caller action"
//
// NOT proved here, on purpose — flow-0095's other three criteria are all instances of one rule,
// "every caller forwards exactly the secrets its reusable declares, by name", and that rule has a
// single owning test file: `secrets-scope.test.mjs`. Its table is where the expected secret set
// for each caller is stated, so asserting the same three facts here as well would mean two places
// to update and one of them silently going stale — which is the failure that produced this task
// (that file's table still encoded a `v1` tag in which the reusable had no FLOW_PAT to forward).
// This file keeps what is genuinely its own: the reusable's wiring, and the prose around it.
//
// Why it matters: pushes made with the Actions GITHUB_TOKEN don't trigger downstream workflows
// (GitHub's recursion guard), so a worker branch pushed under GITHUB_TOKEN never fires
// _flow-open-pr.yml and sits PR-less until the recovery sweep. FLOW_PAT is a real actor, so the
// push event fires normally; the fallback keeps a repo without the secret on today's behaviour.
// Same wiring shape as _flow-open-pr.yml / _flow-recover.yml / _flow-sync.yml (CAN-58).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { changelogEntry } from "./changelog-entry.mjs";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const OPEN_PR = join(REPO, ".github/workflows/_flow-open-pr.yml");
const DOCS = join(REPO, "docs/flow-reusable-workflows.md");
const FRAGMENT = join(REPO, "changes/flow-0093.md");

// ─── flow-0093: one permission list, in two places, proved identical ─────────────────────────
//
// The list is duplicated on purpose (a workflow header and a doc are read by different people at
// different moments) and the duplication is only safe because this test fails when the copies
// disagree. Normalisation strips what differs between a YAML comment and a Markdown bullet — the
// leading `#`, backticks, emphasis — and joins wrapped continuation lines, so the two files may
// wrap differently but may not say different things.

const PERMISSION_MARKER =
  "FLOW_PAT — required permissions (fine-grained PAT, this repository only, short expiry):";

const normaliseLine = (line) => line.replace(/^\s*#/, "").replace(/[`*]/g, "").trim();

const extractPermissionList = (file) => {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => normaliseLine(l) === PERMISSION_MARKER);
  assert.notEqual(start, -1,
    `${file} must carry the marker line "${PERMISSION_MARKER}" verbatim — it is what makes the ` +
    "list machine-checkable rather than two paragraphs that happen to look similar");
  const entries = [];
  for (const raw of lines.slice(start + 1)) {
    const line = normaliseLine(raw);
    if (line === "") {
      if (entries.length === 0) continue;   // Markdown puts a blank line before the first bullet.
      break;                                // A blank after the list ends it, in both formats.
    }
    if (line.startsWith("- ")) entries.push(line.slice(2));
    else if (entries.length > 0) entries[entries.length - 1] += ` ${line}`;
    else break;
  }
  return entries.map((e) => e.replace(/\s+/g, " ").trim());
};

test("_flow-open-pr.yml's header and the docs carry the same four-permission list", () => {
  const fromWorkflow = extractPermissionList(OPEN_PR);
  const fromDocs = extractPermissionList(DOCS);
  assert.equal(fromWorkflow.length, 4,
    `_flow-open-pr.yml's list must have exactly four entries, found ${fromWorkflow.length}`);
  assert.deepEqual(fromDocs, fromWorkflow,
    "the two copies of the FLOW_PAT permission list have drifted. Whichever a reader trusts, the " +
    "other is now wrong — and a token issued from the short list fails later, at the one step " +
    "that needed the permission it omits. Fix both copies, not just the one you are looking at");
});

test("the permission list names all four permissions, each Read and write", () => {
  const entries = extractPermissionList(OPEN_PR);
  assert.deepEqual(
    entries.map((e) => e.split(":")[0]),
    ["Contents", "Pull requests", "Issues", "Workflows"],
    "all four are load-bearing: Contents for the claim and branch pushes, Pull requests for the " +
    "PR, Issues for the worker filing one, Workflows because GitHub refuses a push touching " +
    ".github/workflows/ without it");
  for (const entry of entries) {
    assert.match(entry, /^[A-Za-z ]+: Read and write — \S/,
      `"${entry}" must read "<Permission>: Read and write — <which workflow needs it, and why>". ` +
      "Read-only on any of the four is a run that fails at a push or a gh call, and the reason " +
      "is what tells the reader which one");
  }
});

test("the docs rule out the Actions PR-creation setting, and say why", () => {
  const docs = readFileSync(DOCS, "utf8");
  assert.match(docs, /do not need the "Allow GitHub Actions to create and approve pull requests"/,
    "the docs must state plainly that the repository setting is not needed — it is the first " +
    "thing a reader reaches for when a workflow cannot open a PR, and reaching for it is wrong");
  const section = docs.slice(docs.indexOf("Allow GitHub Actions to create and approve"));
  assert.match(section, /widen/,
    "the reason must be stated, not just the verdict: the setting only widens GITHUB_TOKEN");
  assert.match(section, /triggers no downstream workflows|no downstream workflows/,
    "and the consequence that makes it actively harmful: a PR created by GITHUB_TOKEN triggers " +
    "no downstream workflows, so flow-gates and the three review checks never run on it — the " +
    "exact silent gate bypass _flow-open-pr exists to prevent");
});

test("changes/flow-0093.md exists and states the caller action", () => {
  // Fragment while pending; assembled CHANGELOG entry after a release (flow-0098).
  const fragment = changelogEntry(REPO, "flow-0093");
  assert.ok(fragment, "flow-0093 has no changelog entry, pending or assembled");
  assert.match(fragment, /FLOW_PAT/,
    "the fragment must name the secret the change is about");
  assert.match(fragment, /Caller action|No caller action/,
    "changes/README.md requires every fragment to say what a caller must do, or say explicitly " +
    "that there is nothing to do. This change needs one: a FLOW_PAT issued before flow-0093 " +
    "lacks Workflows and Issues write, and nothing detects that until a run fails");
  assert.match(fragment, /Workflows/,
    "the caller action is specifically to regenerate the PAT with the documented permissions, " +
    "and Workflows: Read and write is the one an existing token is guaranteed to be missing");
});

// ─── flow-0095: the prose around the caller, which no structure test can carry ───────────────
//
// The forwarding itself is asserted in secrets-scope.test.mjs (see the header note above). What
// remains here is the changelog fragment telling an adopting repo it had to act.

const FRAGMENT_0095 = join(REPO, "changes/flow-0095.md");

test("changes/flow-0095.md exists and states the caller action", () => {
  // Fragment while pending; assembled CHANGELOG entry after a release (flow-0098).
  const fragment = changelogEntry(REPO, "flow-0095");
  assert.ok(fragment, "flow-0095 has no changelog entry, pending or assembled");
  assert.match(fragment, /FLOW_PAT/, "the fragment must name the secret the change is about");
  assert.match(fragment, /Caller action/,
    "changes/README.md requires every fragment to say what a caller must do. This change needs " +
    "one twice over: adopt the updated caller, and set the secret it now forwards");
  assert.match(fragment, /flow-sync/,
    "the caller action is specifically to adopt the updated thin caller via flow-sync (or add the " +
    "one FLOW_PAT line by hand) — an adopting repo's existing caller does not change on its own");
});
