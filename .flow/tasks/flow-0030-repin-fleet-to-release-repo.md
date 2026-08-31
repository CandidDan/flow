---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0030"
title: "Point the template, the helpers and the runbooks at the release repo, and call canonical's own reusables locally"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-08-28"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Blocked on three things. (1) flow-0029 must have merged — re-pointing the fleet at a release repo that nothing publishes to leaves every adopter pinned to an empty target. (2) FILE CLAIMS, checked not assumed: project-template/README.md and project-template/.flow/PROTOCOL.md are claimed by flow-0016 (ready), and CLAUDE.md, project-template/INIT.md, project-template/RETROFIT.md, README.md and PROTOCOL.md are claimed by flow-0023 (blocked). Both must be done, or their files split out of this task, before this can claim them. (3) The release repo must exist and its name be fixed, because that name is written into every reference here. UNBLOCK: flip to ready once flow-0029, flow-0016 and flow-0023 are done. Blocker (3) is now SATISFIED: the name is settled as `CandidDan/flow-protocol` (2026-08-31) — so (1) and (2) are all that remain."
serves: ["G4"]            # a repo stays current by reference — this changes what the reference IS
touches: ["project-template/.github/workflows/flow-gates.yml", "project-template/.github/workflows/flow-status.yml", "project-template/.github/workflows/flow-done.yml", "project-template/.github/workflows/flow-open-pr.yml", "project-template/.github/workflows/flow-review.yml", "project-template/.github/workflows/flow-triage.yml", "project-template/.github/workflows/flow-compass.yml", "project-template/.github/workflows/flow-queue-runner.yml", "project-template/.github/workflows/flow-recover.yml", "project-template/.github/workflows/flow-sync.yml", "project-template/.flow/bin/flow-init.mjs", "project-template/.flow/bin/flow-sync.mjs", "project-template/.flow/bin/flow-doctor.mjs", "project-template/.flow/bin/flow-init.test.mjs", "project-template/.claude/settings.json", "project-template/README.md", "project-template/.flow/PROTOCOL.md", "project-template/INIT.md", "docs/repinning-a-consuming-repo.md", ".github/workflows/flow-gates.yml", ".github/workflows/flow-status.yml", ".github/workflows/flow-done.yml", ".github/workflows/flow-open-pr.yml", ".github/workflows/flow-review.yml", ".github/workflows/flow-triage.yml", ".github/workflows/flow-compass.yml", ".github/workflows/flow-queue-runner.yml", ".github/workflows/flow-recover.yml", ".flow/bin/adapters.test.mjs", "CHANGELOG.md"]
labels: [infra, docs, fleet, cleanup]
notes:
  - "2026-08-28: the reference half of the split. Held apart from flow-0029 deliberately: the publisher collides with nothing and can land early, while this one claims eighteen files that two live tasks also claim. Sequencing them together would have blocked the publisher behind a docs task for no reason."
  - "2026-08-28: touches were derived by grepping for the literal owner/repo reference across the tree, not from memory. Re-run that grep at claim time — this list is a snapshot of 2026-08-28 and the tree will have moved."
  - "2026-08-28: canonical's own nine callers currently pin a ref to canonical itself. Switching them to local `uses: ./.github/workflows/_flow-*.yml` is what makes the dogfooding claim literally true — it then runs the files it publishes rather than a ref that could drift from them. ADR-0005 records this as a consequence; this task is where it happens."
  - "2026-08-31: blocker (3) cleared — release repo name settled as `CandidDan/flow-protocol`. Still blocked on (1) flow-0029 and (2) the file claims held by flow-0016 and flow-0023. IMPORTANT SEQUENCING, and the thing most likely to be got wrong now that the release repo exists: `CandidDan/flow` MUST STAY PUBLIC until this task has re-pinned the fleet and those PRs have merged. 43 non-store files still resolve `CandidDan/flow` by reference; flipping canonical private before the re-pin lands breaks every adopting repo's CI at once, in their CI, with no local change to explain it. Order is: publish (flow-0029) -> re-pin (this task) -> verify a green run on the new reference -> only then flip canonical private."
---

## Context

flow-0028 decides the split; flow-0029 builds the publisher. This task is the part the fleet
actually feels: every place that names the current canonical repo has to name the release repo
instead, and canonical's own callers have to stop pinning a ref to canonical and call their
reusables locally.

Two distinct changes travel together because they are the same edit to the same set of files:

1. **The fleet's reference changes.** The template's ten thin callers, `flow-init`, `flow-sync`,
   `flow-doctor`, the protocol, the runbooks and the re-pin doc all name the repo an adopter
   points at. That name becomes the release repo.
2. **Canonical stops pointing at itself by ref.** Its nine callers currently use a full
   `owner/repo/...@main` reference to canonical. After the split they call
   `./.github/workflows/_flow-*.yml`, so the authoring repo provably runs the files it publishes
   rather than a ref that can drift from them.

There is real risk of a half-done state here — some references moved and some not — which is worse
than either end state, because the fleet would be split across two sources. The task's job is to
make "all of them" mechanically checkable rather than a matter of having grepped carefully.

## Scope

**Does:**

- Replace every reference to the current canonical repo with the release repo, across the template
  callers, the `.flow/bin` helpers that generate or check those references, the protocol, the
  runbooks, and `docs/repinning-a-consuming-repo.md`.
- Switch canonical's own nine callers to local reusable references.
- Add a check that fails if any tracked file still names the old repo in a `uses:` reference or a
  generated pin — so "we got them all" is asserted, not believed. The check must also fail if it
  finds nothing to check, per this repo's rule that an empty scan is a failure.
- Record the change in `CHANGELOG.md`, including the action adopting repos must take. This is a
  breaking change for every consumer: their `uses:` lines stop resolving when the old repo goes
  private.
- Update `docs/repinning-a-consuming-repo.md` so it describes re-pinning to the release repo — the
  runbook for this exact migration already exists and becomes wrong the moment the split lands.

**Deliberately does NOT:**

- **Publish anything, or touch the publish workflow.** That is flow-0029's and it will already
  have merged.
- **Make the old repo private, or migrate the store.** Those are human acts, sequenced after this
  merges and after the adopting repos are re-pinned. Name them in the PR description as the
  human-only steps they are.
- **Re-pin `flow-plugin` or `flow-validation`.** Those are separate repositories and cannot be
  changed from here. The PR description lists them as follow-up, using the runbook this task
  updates.
- **Touch `flow-watchdog.yml`.** It is canonical-only, has no reusable, and names no external ref.

## Acceptance criteria

- [ ] Given the template's thin callers, when each `uses:` is read, then every one names the
      release repo, and none names the old one.
- [ ] Given canonical's own callers, when each `uses:` is read, then every one is a local
      reference to a reusable in the same repository.
- [ ] Given `flow-init`, `flow-sync` and `flow-doctor`, when they generate or validate a workflow
      reference, then the reference they produce names the release repo, proved by a test that
      exercises the generation rather than reading the source.
- [ ] Given the whole tracked tree, when the new check runs, then it fails if any file still names
      the old repo in a `uses:` reference or a generated pin, and it also fails if it scanned no
      files at all.
- [ ] Given `docs/repinning-a-consuming-repo.md`, when it is read, then it describes re-pinning to
      the release repo and its steps match the reference form the template now emits.
- [ ] Given `CHANGELOG.md`, when it is read, then it records the change as breaking for consumers
      and states the action an adopting repo must take.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- Re-derive the file list at claim time with a grep for the literal reference. The `touches` list
  is accurate as of 2026-08-28 and the tree will have moved — in particular flow-0016 and
  flow-0023 both edit files in this list before this task can start.
- The old-reference check is the load-bearing deliverable, more than any individual edit. A
  half-migrated fleet is the failure mode, and it is invisible without a check that spans the
  tree.
- The order of human steps after this merges matters and belongs in the PR description: publish a
  release to the new repo first, then re-pin the adopting repos, and only then change the old
  repo's visibility. Reversing the last two strands every adopter.
