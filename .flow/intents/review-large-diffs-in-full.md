---
id: "review-large-diffs-in-full"
title: "The review checks read every line of a large PR, in chunks, and skip generated files"
status: "proposed"
created: "2026-10-27"
source: "Dan, orchestrator chat, 2026-10-27 (TanPlan PR #200)"
serves: ["G8", "G10"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

> "reviews should skip generated files full stop shouldn't they?"

> "#200 - review in chunks feels right, should we do an urgent flow task."

— Dan, orchestrator chat, 2026-10-27.

Evidence (not Dan's words): CandidDan/tanplan-platform PR #200 (tanplan-0171, the UUID key
cutover) is 5.6 MB across 1,260 files. `review.max_diff_bytes` is 2 MB, so qa, code-review and
security each read about 36% and failed on truncation alone, finding nothing High or Critical in
what they read. About 2.5 MB of the diff is generated (the Orval client, `api-zod`, the generated
part of the key migration, schema fixtures); the hand-written remainder is still about 3.2 MB, so
skipping generated files alone does not bring it under the cap. The PR is being merged by owner
override with a focused human read so the Light Club cutover holds.

## Cost of inaction

Every large, cross-cutting PR (a key migration, a rename, a codegen bump) can only reach `main` by
owner override, so the change most likely to break the fleet is the one the reviewers never read.
G10 records the merge touchpoint as weaker than a green check looks; a review that fails on size
rather than substance makes it weaker still.

[assumption] Raising the cap is not a fix: a reviewer handed 5.6 MB in one prompt reads it worse,
not better.

## Outcome

A PR of any size gets a real verdict from qa, code-review and security: every hand-written line is
read by a reviewer, generated output is not re-read but is proven to match what generated it, and
the PR is green only when every part of it is.

## Constraints

- "Skip generated files full stop" — Dan's own rule. [assumption] A file only counts as generated
  when CI proves it: it is regenerated from its reviewed source and the result is identical, so
  "generated" can never hide a hand edit.
- "Review in chunks" — Dan's own shape. [assumption] Each chunk is reviewed in full within the
  existing cap; one red chunk makes the check red.
- [assumption] Adopting repos keep their per-repo config (`review.max_diff_bytes`,
  `review.security_paths`); the security check's conditional trigger still applies per chunk.
- [assumption] Cost stays visible (G9): the run reports how many chunks it reviewed.

## Open questions

- How a repo declares its generated paths and the command that regenerates them (a `review:` key in
  `.flow/config.yml`, or something else).
- How chunks are cut: by path group, by package, or by size alone.
- Whether code-review sees cross-chunk context (for example a signature change in one chunk and its
  callers in another).
