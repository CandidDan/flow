---
id: "flow-0051"
title: "Give `flow-sync` permission to push the workflow files it exists to deliver"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-09-15"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.github/workflows/flow-sync.yml"
  - ".flow/bin/sync-permissions.test.mjs"
  - "CHANGELOG.md"
labels: [infra, sync, permissions, fleet]
notes:
  - "2026-09-15 (orchestrator): found by inspection while adopting 1.3.x into CandidDan/Nudge. Nudge sat at .flow/VERSION 1.0.0 with no explanation; flow-sync's weekly schedule had been firing and failing silently since at least 2026-09-02 (runs 5, 6 and 7 all conclusion=failure). Nobody was told, because a failed scheduled run emits nothing a human sees. flow-0020 (the watchdog) is the task that would have surfaced it and is still `ready`."
  - "2026-09-15 (orchestrator): this is the root cause behind flow-0048 and behind Nudge's whole staleness story. flow-0048 makes flow-sync CARRY the protocol; this makes flow-sync able to PUSH at all. Sequence this first — flow-0048's criteria cannot be demonstrated end-to-end while every sync push is rejected."
  - "2026-09-15 (orchestrator): do NOT fix this by removing flow-* workflow callers from the copied surface. Copying them is the point: it is how canonical ships a NEW caller (flow-compass.yml, flow-0013) to repos that have never heard of it. Narrowing the surface to dodge the permission would quietly turn every future new workflow into a manual adopt, which is the same class of gap flow-0048 is fixing."
---

## Context

`flow-sync` has never successfully opened a PR in `CandidDan/Nudge`. Every run fails at the push:

```
! [remote rejected] flow-sync/1.3.0 -> flow-sync/1.3.0
  (refusing to allow a GitHub App to create or update workflow
   `.github/workflows/flow-compass.yml` without `workflows` permission)
```

GitHub refuses a push that creates or modifies anything under `.github/workflows/` unless the
pushing token carries the `workflows` permission. `_flow-sync.yml` declares:

```yaml
permissions:
  contents: write          # push the sync branch
  pull-requests: write     # open the sync PR
```

No `workflows: write`. And the copied surface is, by design, exactly the thing that needs it:

```sh
for f in "$CANON_TPL"/.github/workflows/flow-*.yml; do
  [ -e "$f" ] && cp "$f" .github/workflows/
done
```

So `flow-sync` is structurally unable to complete any sync that adds or changes a thin caller. It
worked until canonical added one. `flow-compass.yml` (flow-0013) is a file Nudge has never had, so
every sync since has been a create, and every push since has been rejected.

## Why this is worse than one repo being stale

**It fails silently and on a schedule.** The weekly cron fires, the job goes red, nothing reaches a
human. Nudge's `.flow/VERSION` has read `1.0.0` for weeks while `flow-doctor` correctly warned it
was behind and the mechanism meant to fix that was dead. The warning and the remedy were both
working exactly as designed and the repo still did not move.

**It disables the fleet's only adoption path.** Every consequence traced in flow-0048 — a protocol
fix that cannot reach a repo, a worker stopping early on a bug canonical already fixed — is
reachable through this too, for the whole copied surface rather than one file.

**It is currently breaking CI in at least one repo.** Nudge's `.flow/bin/touches-guard.mjs` is at
1.0.0 and emits no `decision=` line; the referenced, always-current `_flow-gates.yml` fails the job
when that line is absent (flow-0008). Every PR in Nudge fails `flow-gates / touches`, and the
adopt that would fix it is the thing that cannot push. Observed on `CandidDan/Nudge#269`.

## The fix, and the constraint on it

Add `workflows: write` to `_flow-sync.yml`'s job permissions. A called workflow cannot hold a
permission its caller did not grant, so `project-template/.github/workflows/flow-sync.yml` must
grant it too — and **every adopting repo's existing caller is stale on this**, which is the caller
action the changelog has to state plainly.

Note the interaction with `FLOW_PAT`: the workflow already prefers it
(`GH_TOKEN: ${{ secrets.FLOW_PAT || github.token }}`) and the rejection message names a *GitHub
App*, so Nudge's push ran as `GITHUB_TOKEN`. Raising the workflow permission fixes the case where
no PAT is set, which is the case that must work — a repo should not need a PAT to adopt.

## Acceptance criteria

- [ ] Given `_flow-sync.yml`, when its `permissions:` block is read, then it includes
      `workflows: write`, commented with why (pushing `flow-*.yml` callers is the copied surface).
- [ ] Given `project-template/.github/workflows/flow-sync.yml`, when its `permissions:` block is
      read, then it grants `workflows: write` to the called workflow.
- [ ] Given `.flow/bin/sync-permissions.test.mjs`, when `workflows: write` is removed from either
      file, then the test fails naming which file lost it — demonstrated by removal, not asserted.
- [ ] Given the test, when it runs against a `_flow-sync.yml` whose copy step no longer copies
      `.github/workflows/flow-*.yml`, then it fails — the permission and the copy must not drift
      apart, in either direction.
- [ ] Given a repo whose `.github/workflows/` lacks a caller canonical ships, when `flow-sync`
      runs, then the push succeeds and the opened PR's diff contains the new caller file.
- [ ] Given `CHANGELOG.md`, when the entry is read, then it states the caller action: every
      adopting repo must update its own `flow-sync.yml` caller to grant `workflows: write`, and
      until it does, its syncs will keep failing at the push with `remote rejected`. It must also
      say that a repo whose syncs have been failing silently may be many versions behind, and name
      `flow-doctor`'s drift warning as the way to check.

## Scope boundaries

**Does not** change what `flow-sync` copies. That is flow-0048's question, and see the third note:
narrowing the copied surface to avoid needing the permission is the wrong fix.

**Does not** add or change any `flow-*` thin caller other than `flow-sync.yml`'s permissions block.

**Does not** fix `CandidDan/Nudge`. Canonical authors, repos adopt. Nudge's recovery is a sync once
this lands.

**Does not** build the notification that would have caught this. That is flow-0020 (`ready`), and
this task should not absorb it — but the first note records that this is the second incident it
would have caught.

**Does not** move canonical's `v1` tag. Note that the tag currently carries template `1.3.0` while
`main` is `1.3.1`, so the fleet cannot reach current even once this is fixed; that is a release
decision, not this task's.
