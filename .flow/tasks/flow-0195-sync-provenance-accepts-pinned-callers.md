---
id: "flow-0195"
title: "A flow-sync PR adopted from an explicit release tag is still recognised as a sync PR: provenance accepts the caller pins flow-0158 rewrites"
status: "in_review"
priority: 1
project: "flow"
owner: "session_01NfrcU9iRVh8RVpDF6wsSzV"
created: "2026-11-03"
started: "2026-11-06T02:36:41Z"
branch: "claude/project-thread-f0zs28"
pr: "https://github.com/CandidDan/flow/pull/294"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "project-template/.github/workflows/flow-sync.yml"
  - "changes/flow-0195.md"
labels: [bug, sync, review]
model: "opus"
effort: "high"
model_reason: "Changes the provenance check that decides whether a sync PR skips full review; loosening it wrongly would let a hand-made flow-sync/ branch carry foreign workflow content past review"
asks: []
notes:
  - "2026-11-03 orchestrator: found in the fleet rollout of 4.1.0. Syncs dispatched with canonical_ref=v4.1.0 in tanplan-platform, inflight, progress, write and Nudge (PRs #257, #93, #140, #232, #395, all closed unmerged) each failed provenance: '12 of 16 changed file(s) do not match canonical'. Every mismatch was a caller whose uses: line pinCallers had rewritten from @v4 to @v4.1.0 (flow-0158). The PRs lost the SYNC PR sentinel, were reviewed in full as task-less PRs, and qa failed all of them. The same syncs dispatched with the alias (canonical_ref=v4) would pass, because the template's pins are already @v4."
  - "2026-11-03 orchestrator: flow-0158's pinning is correct and stays: a copied caller must run the release its .flow/bin came from. The fix is only that provenance compares a synced caller against canonical's template AFTER the same pinCallers rewrite the sync applied. Do not relax the check in any other way."
---

## Context

`_flow-sync.yml` copies canonical's template callers into `.github/workflows/` and then runs
`flow-sync.mjs pin-callers --ref "$CANONICAL_REF"` on each copy (flow-0158), so every
`uses: CandidDan/flow/.github/workflows/_flow-<name>.yml@<x>` line names the ref the sync adopted
from. With `canonical_ref` = `v4` the template's own `@v4` pins are unchanged. With an explicit
release such as `v4.1.0`, every copied caller now reads `@v4.1.0`.

`syncProvenance` in `project-template/.flow/bin/flow-review.mjs` then compares each changed file
with canonical at the PR's `Canonical-SHA` using `sameSyncedFile`, byte for byte. A caller that
pinCallers rewrote never matches, so the PR is refused the SYNC PR sentinel and reviewed in full,
and qa fails it for having no task.

`project-template/.github/workflows/flow-sync.yml` also says an explicit `workflow_dispatch` ref is
"how you adopt from a canary ref once without repinning anything". Since flow-0158 that is false:
the copied callers are repinned to that ref.

## Scope

1. In `syncProvenance`, for a changed path matching `.github/workflows/flow-*.yml`, compare the
   repo's file against canonical's template copy with `pinCallers(canonicalText, ref)` applied,
   where `ref` is the single ref the repo's file pins on its `CandidDan/flow` reusable `uses:`
   lines. Import `pinCallers` (and `assertPinRef` if useful) from `./flow-sync.mjs`.
   - If the repo's file pins more than one distinct ref, or none, it is a mismatch, as today.
   - Every other byte must still match. Only the `@<ref>` on those `uses:` lines may differ.
   - Paths outside `.github/workflows/flow-*.yml` keep today's exact comparison.
2. Correct the comment in `project-template/.github/workflows/flow-sync.yml`: an explicit ref
   adopts from that ref AND repins the copied callers to it, so later scheduled syncs follow that
   pin until it is changed back (for example by a sync dispatched with the alias).
3. Fragment `changes/flow-0195.md`: **No caller action.**

**Does not:** change `pinCallers`, `_flow-sync.yml`'s copy or pin behaviour, or what a sync PR may
touch; widen the sync surface; change the review of non-sync PRs.

## Acceptance criteria

- [ ] `flow-review.test.mjs`: given a canonical caller pinned `@v4` and a repo copy identical except
      `@v4.1.0` on its reusable `uses:` lines, `syncProvenance` reports `ok: true`.
- [ ] `flow-review.test.mjs`: the same copy with any other changed byte (for example a widened
      `permissions:` line) reports a mismatch naming that path.
- [ ] `flow-review.test.mjs`: a copy whose `uses:` lines pin two different refs, or that pins a
      reusable from an owner other than `CandidDan/flow`, reports a mismatch.
- [ ] `flow-review.test.mjs`: a changed path outside `.github/workflows/flow-*.yml` that differs only
      by a version-like string still reports a mismatch (no pin tolerance outside callers).
- [ ] `project-template/.github/workflows/flow-sync.yml` no longer contains "without repinning
      anything" (asserted by a test in `flow-review.test.mjs` or an existing workflow test in
      touches).
- [ ] `changes/flow-0195.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
