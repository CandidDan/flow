// adr-mission-control.test.mjs — proving tests for docs/adr/0006-mission-control-own-repo.md
// (flow-0042).
//
// Same posture and the same shape as .flow/bin/adr-vision-layer.test.mjs and
// .flow/bin/adr-split-authoring.test.mjs, deliberately rather than as a third convention: an ADR
// cannot be run, so nothing catches it being quietly trimmed.
//
// The specific ways THIS one gets trimmed are predictable, because several of its passages argue
// against what a future reader will want to be true:
//
//   * append-only snapshots read like a storage preference, so an implementer "optimises" the
//     scheduled job into overwrite-in-place to save rows — and that is the one decision here that
//     cannot be undone, because the history it destroys is not recoverable;
//   * "a token now lives at rest" reads like FUD once the thing is built and has not been
//     breached, so it is the passage most likely to be deleted as no longer relevant;
//   * the GitHub App is more setup than a PAT, so the first implementer under time pressure
//     reaches for the PAT and quietly forecloses writes and multi-user;
//   * the watchdog's ordering constraint reads like housekeeping, so it gets skipped — which
//     silently kills the job built to make silent death loud;
//   * the repository being private reads like a default rather than a decision, so someone makes
//     it public to "just use Pages" and re-publishes the store the split exists to withhold;
//   * NG7 reads like scope rather than a boundary, so it gets relaxed with a flag.
//
// All survive here as assertions.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const ADR = join(REPO, "docs", "adr", "0006-mission-control-own-repo.md");

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

// ── it exists, and matches the header shape of its siblings ──────────────────────────────────

test("ADR-0006 exists and carries the header fields its siblings carry", () => {
  assert.ok(doc.length > 0, "docs/adr/0006-mission-control-own-repo.md is missing");
  const head = doc.split("\n").slice(0, 10);
  assert.match(head[0], /^# ADR-0006: \S/, "first line must be an ADR-0006 title");
  for (const field of ["Status", "Date", "Deciders"]) {
    assert.ok(head.some((l) => new RegExp(`^\\*\\*${field}:\\*\\*\\s*\\S`).test(l)),
      `header is missing **${field}:**`);
  }
});

// ── the decision itself ──────────────────────────────────────────────────────────────────────

test("the decision names the repository, and names it as private", () => {
  const decision = section(doc, "Decision");
  assert.match(decision, /CandidDan\/inflight/,
    "the decision must name the repository it moves to");
  assert.match(decision, /\bprivate\b/i,
    "the repository being private is a decision, not a default — say so in the decision");
});

test("the repository being private is tied to its reason, not left as a preference", () => {
  // The belief this prevents: 'it could be public, Pages would serve it, that is simpler'.
  // Public is exactly what the earlier draft chose, and it costs the task store.
  assert.match(doc, /Vercel deploys from private repositories/i,
    "record WHY private became available — Vercel deploys from private repos, Pages cannot");
  assert.match(doc, /publicly fetchable|publicly serve|publish(es|ing)? the planning record/i,
    "record WHAT private buys — the task store not being publicly fetchable");
});

test("the serving stack is named as two layers, not one", () => {
  const decision = section(doc, "Decision");
  assert.match(decision, /Vercel/, "Vercel serves the app and runs the schedule");
  assert.match(decision, /Supabase/, "Supabase holds the data and the identity");
  assert.match(decision, /layers,? not alternatives/i,
    "an earlier framing posed these as a choice; the ADR must record that it was wrong");
});

// ── the four structural commitments ──────────────────────────────────────────────────────────

test("append-only is stated as a rule, with the reason it cannot be retrofitted", () => {
  assert.match(doc, /append[- ]only/i, "the append-only commitment must be named");
  assert.match(doc, /never overwrite/i,
    "state the prohibition, not just the preference — 'never overwrite'");
  assert.match(doc, /cannot be retrofitted|not be retrofitted/i,
    "the reason append-only is non-negotiable is that history, once destroyed, is unrecoverable");
});

test("append-only is justified by a feature being built now, not by a future one", () => {
  // Guards against 'analytics is out of scope, so drop the snapshots' — the notification diff
  // needs previous-vs-current regardless.
  assert.match(doc, /notification diff|previous run vs this run|diff on each run/i,
    "append-only is required by the notification diff, not only by future analytics");
});

test("the credential is a GitHub App, and the PAT is named as the thing it replaces", () => {
  assert.match(doc, /GitHub App/,
    "the credential decision must be recorded");
  assert.match(doc, /not a (personal access token|PAT)|rather than a (pasted )?PAT/i,
    "record that it replaces the PAT — the shortcut a rushed implementer will take");
  assert.match(doc, /expensive to reverse|redoing auth|re-architect/i,
    "record WHY it must be decided first rather than migrated to later");
});

test("raw frontmatter and the file SHA are required to be retained per row", () => {
  assert.match(doc, /raw frontmatter/i, "retaining raw frontmatter must be stated");
  assert.match(doc, /\bSHA\b/, "retaining the file SHA must be stated");
  assert.match(doc, /optimistic concurrency|lossy/i,
    "record why: optimistic concurrency on write, and that a lossy parser cannot round-trip");
});

test("a tenancy column is required from day one, not at the point of a second user", () => {
  assert.match(doc, /account_id|tenancy column/i, "the tenancy commitment must be named");
  assert.match(doc, /day one/i, "it is required from day one — that is the whole point");
});

// ── the consequences that argue against the reader's instinct ────────────────────────────────

test("the token at rest is recorded as an unmitigated cost", () => {
  // Most likely passage to be deleted once the thing is built and has not been breached.
  const consequences = section(doc, "Consequences");
  assert.match(consequences, /at rest/i,
    "the standing credential is the real cost of this decision and must stay recorded");
  assert.match(consequences, /do(es)? not remove|not mitigated|they do not remove the fact/i,
    "it must be recorded as reduced-but-not-removed, never as handled");
});

test("Option C is recorded as reversed, with the ground it is reversed on", () => {
  assert.match(doc, /Option C/,
    "ADR-0002's Option C rejection is overturned here and must be named");
  assert.match(doc, /path of least resistance/i,
    "the ground for the reversal is that the read-only rule was not a decision");
});

test("the watchdog move carries its ordering constraint", () => {
  assert.match(doc, /flow-watchdog\.yml|watchdog\.mjs/,
    "canonical's watchdog depends on flightdeck/ and must be named");
  // Emphasis stripped: the sentence carries **before**, and the constraint is the words, not the bold.
  const plain = doc.replace(/[*`]/g, "");
  assert.match(plain, /\bbefore\b[\s\S]{0,60}\bis deleted\b/i,
    "the ordering constraint is the whole point — inflight's watchdog runs BEFORE the deletion");
});

test("the ADR-0005 amendment is recorded as owed, with its test trap", () => {
  assert.match(doc, /flow-0032/,
    "the task that owes the ADR-0005 amendment must be named");
  assert.match(doc, /adr-split-authoring\.test\.mjs/,
    "the test asserting ADR-0005's superseded text must be named");
  assert.match(doc, /same diff/i,
    "the trap is that the assertions must be updated in the SAME diff as the amendment");
});

test("the coverage floor is recorded as needing re-measurement, not a guessed number", () => {
  assert.match(doc, /83\.5/, "the current floor must be named so the comparison is possible");
  assert.match(doc, /re-?measured|re-?run/i,
    "the floor must be re-measured after the move — never adjusted by inference");
});

// ── the one boundary that is not a 'not yet' ─────────────────────────────────────────────────

test("NG7 is recorded as a boundary, distinct from the things merely out of scope for now", () => {
  assert.match(doc, /NG7/, "the non-goal must be cited by id");
  assert.match(doc, /merge stays human/i, "state the boundary in the vision's own words");
  assert.match(doc, /auto-?merg/i,
    "name the specific thing that is forbidden rather than deferred");
});

test("the deferred features are recorded as deferred, not as forbidden", () => {
  // Guards the opposite failure: a future reader reading 'out of scope' as 'ruled out'.
  assert.match(doc, /reachable later|later on the commitments|not built now/i,
    "writes, editing, multi-user and analytics are deferred — the ADR must not read as a ban");
});

// ── the ADR does not license work it did not decide ──────────────────────────────────────────

test("the ADR states that it decides and does not implement", () => {
  const notdo = section(doc, "What this ADR does not do");
  assert.ok(notdo.length > 0, "the 'What this ADR does not do' section is missing");
  assert.match(notdo, /decides; it does not implement/i,
    "state the boundary in the same words its siblings use");
  assert.match(notdo, /human-only/i,
    "the setup steps a worker cannot claim must be named as human-only");
});

test("every path the ADR names as existing in canonical actually exists", () => {
  // flow-review caught this on the first draft: the ADR named two gitignored local-only scripts
  // as repository consequences, sending the next worker after files that are not there.
  const claimed = [...doc.matchAll(/`([A-Za-z0-9_./-]+\.(?:mjs|yml|md|json|sh))`/g)]
    .map((m) => m[1])
    .filter((p) => p.includes("/"))                 // bare filenames are ambiguous; paths are not
    .filter((p) => !p.startsWith("inflight/"))      // the repo this ADR creates does not exist yet
    .filter((p) => !p.includes("flightdeck/index.html"));
  const missing = [...new Set(claimed)].filter((p) => !existsSync(join(REPO, p)));
  assert.deepEqual(missing, [],
    `ADR-0006 names path(s) that do not exist in this repository: ${missing.join(", ")}`);
});
