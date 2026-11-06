---
id: "flow-0214"
title: "A flow-sync PR is still recognised as a sync PR when the sync carried the repo's own with: inputs into a caller"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-11-06"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "changes/flow-0214.md"
labels: [bug, sync, review]
model: "opus"
effort: "high"
model_reason: "Changes the provenance check that decides whether a sync PR skips full review; loosening it wrongly would let a hand-made flow-sync/ branch carry foreign workflow content past review"
notes:
  - "2026-11-06 (session_01NfrcU9iRVh8RVpDF6wsSzV): found while doing flow-0195 (PR #294). The flow-sync workflow runs carry-inputs after pin-callers, so a repo that sets its own with: value (mapd's setup_node_version, the flow-0197 case) gets a caller that differs from canonical by more than the pin. flow-0195 said not to relax the check in any other way, so it was left for this task."
asks: []
---

## Context

When a `flow-sync/` PR arrives in a consuming repo, `syncProvenance` in
`project-template/.flow/bin/flow-review.mjs` checks every changed file against canonical's copy.
If they all match, the PR keeps its "SYNC PR" marker and skips full review. If any differ, it is
reviewed in full as a PR with no task, and qa fails it.

The sync changes a caller in two ways before committing it:

1. **pin-callers** (flow-0158) rewrites each `uses: …/_flow-*.yml@<ref>` line to the release the
   sync adopted from. flow-0195 taught `sameSyncedCaller` to accept this, but only after proving
   the ref is that release.
2. **carry-inputs** (flow-0197, `carryInputs` in `project-template/.flow/bin/flow-sync.mjs`) then
   copies every `with:` input the repo's previous copy set on a Flow-reusable job into the new
   copy, keeping the repo's value. Example: mapd pins `setup_node_version: "24.22.1"`.

`sameSyncedCaller` does not replay step 2. So in any repo that sets its own `with:` input, the
caller differs from canonical, provenance fails, and the sync PR is reviewed in full and fails qa.

## Scope

1. In `sameSyncedCaller` (or the code that calls it), the expected copy of a synced caller is
   built by replaying the sync's own steps: canonical's file, then `pinCallers` with the proven
   release ref (exactly as today, when the copy is pinned), then `carryInputs` with the repo's
   copy of that file **on the PR's base** (`origin/main`) as the local side. The PR's file must
   equal that result byte for byte.
2. The base copy is already on the repo's `main`, so carrying its values brings nothing new into
   the repo. Inputs that are not on the base copy must still fail: a `with:` value that exists
   only on the PR branch is foreign content.
3. When the file does not exist on the base, nothing is carried, and the check is the same as
   today.
4. Import `carryInputs` from `./flow-sync.mjs`, as `pinCallers` already is. Do not copy it.
5. Changelog fragment `changes/flow-0214.md`. Caller action: none; the next sync PR in a repo
   with its own `with:` inputs keeps its SYNC PR marker.

**Does not touch:** `carryInputs` and `pinCallers` themselves; the ref proof flow-0195 added;
which files are in the synced surface; anything outside `with:` entries (a carried `secrets:` or
`on:` change still fails, because `carryInputs` does not produce one).

## Acceptance criteria

- [ ] Given a base caller with `setup_node_version: "24.22.1"` under the gate job's `with:`, and a
      PR caller that is canonical's file pinned to a proven release with that input carried in,
      then provenance passes. Proved by `flow-review.test.mjs`.
- [ ] Given the same, on a sync that used an alias (no repin), then provenance passes. Proved by
      `flow-review.test.mjs`.
- [ ] Given a PR caller carrying a `with:` input whose value differs from the base copy's, or an
      input the base copy does not set, then provenance fails for that file. Proved by
      `flow-review.test.mjs`.
- [ ] Given a PR caller that differs from the replayed result anywhere outside `with:` (for
      example an extra step or a changed `on:`), then provenance fails. Proved by
      `flow-review.test.mjs`.
- [ ] `changes/flow-0214.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
