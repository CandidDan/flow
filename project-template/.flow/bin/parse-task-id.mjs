#!/usr/bin/env node
// parse-task-id.mjs — resolve a Flow task id from a PR's head branch or its title.
//
// flow-status (PR opened -> in_review, closed-unmerged -> ready) and flow-done (merged ->
// done) historically parsed the id ONLY from a `flow/<id>-…` branch name. When the platform
// forces a worker onto a non-conforming branch — e.g. a cloud session's `claude/blissful-
// edison-…` — the branch match fails, the workflows silently no-op, and the task's state
// never advances on main. That is exactly what happened to the CAN-35..41 cloud session:
// the work shipped but every status had to be corrected by hand (PR #109).
//
// The fix is a reliable second source. The Flow PR convention already formats the title as
// `[<id>] <title>`, so the title is a dependable fallback. Branch name first (canonical when
// present), PR title second.
//
//   node .flow/bin/parse-task-id.mjs "<branch>" "<pr-title>"   # prints the id, or nothing
//
// Prints the resolved id and a trailing newline, or nothing at all when neither source
// carries one. Always exits 0 — "no id" is the workflows' safe no-op, not an error.
//
// Zero dependencies (Node >= 18).

// The id shape Flow uses: a letter-led prefix, a dash, and a numeric suffix (e.g. CAN-30).
// Project-agnostic on the prefix — it is NOT hard-coded to "CAN" — so a back-port to another
// repo keeps working. 1–4 trailing digits matches the existing flow-status/flow-done regex.
const ID = "[A-Za-z][A-Za-z0-9]*-\\d{1,4}";

// Canonical source: a `flow/<id>-<slug>` branch. The id is the portion up to the slug dash,
// or the whole tail when there is no slug (`flow/CAN-30`). Mirrors the branch convention the
// rest of the Flow automation keys off.
export function idFromBranch(branch) {
  if (!branch) return null;
  const m = String(branch).match(new RegExp(`^flow/(${ID})(?:-|$)`));
  return m ? m[1] : null;
}

// Fallback source: a leading `[<id>]` in the PR title, e.g. "[CAN-43] Build Today's Meetings".
// Only a LEADING bracket counts — an id mentioned mid-sentence is not the task this PR is for.
export function idFromTitle(prTitle) {
  if (!prTitle) return null;
  const m = String(prTitle).match(new RegExp(`^\\s*\\[(${ID})\\]`));
  return m ? m[1] : null;
}

// Branch wins when it carries an id (it is canonical); otherwise fall back to the PR title;
// otherwise null. Either argument may be undefined/empty.
export function parseTaskId(branch, prTitle) {
  return idFromBranch(branch) ?? idFromTitle(prTitle) ?? null;
}

// ── CLI ── argv[2] = branch, argv[3] = pr title. Prints the id or nothing; always exit 0.
if (import.meta.url === `file://${process.argv[1]}`) {
  const id = parseTaskId(process.argv[2], process.argv[3]);
  if (id) process.stdout.write(id + "\n");
  process.exit(0);
}
