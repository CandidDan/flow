---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0029"
title: "Publish the Flow artefact to the public release repo as a history-free snapshot on release"
status: "in_progress"
priority: 2
project: "flow"
owner: "session_015zGFFmqNftp38wLkqgjBse"
created: "2026-08-28"
started: "2026-08-31T13:22:24Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G4"]            # consuming by reference only works if the reference is published mechanically
touches: [".github/workflows/flow-release-publish.yml", ".flow/bin/release-publish.mjs", ".flow/bin/release-publish.test.mjs"]
labels: [infra, release, integrity]
notes:
  - "2026-08-31: HUMAN CONFIRMED `CandidDan/flow-protocol` is newly created and does NOT carry the `flow` GitHub topic, so the phantom-enrolment risk (flightdeck/watchdog enrol by `topic:flow`) is cleared. Two consequences for the worker. (1) The repo being EMPTY is the expected starting state — the publish is a history-free orphan snapshot that replaces the tree, so an empty target needs no preparation and nothing should be hand-added there. (2) Its VISIBILITY was not separately restated and is not verifiable from an authoring session; it is not a blocker for building or for a dry run, but it IS load-bearing before the first real publish — a private release repo cannot be resolved by an outside adopter's `uses:`, which is the entire reason the repo exists. Put it in the PR description as a human pre-publish check alongside repo creation and the publishing PAT, rather than asserting it."
  - "2026-08-31: SHA-PIN the third-party actions in the new .github/workflows/flow-release-publish.yml (`uses: owner/repo@<40-char-sha> # vX.Y.Z`), not tags. flow-0031 (ready, P2) adds a check that every third-party `uses:` in .github/workflows/ is a commit SHA, and it scans the directory, so a tag-pinned ref here fails that check whichever task merges second. Pinning as you write it makes this task a no-op for flow-0031 either way. Resolve the SHAs from upstream — a well-formed wrong hash fails at run time, in every adopting repo. This does NOT widen scope: the file is already in this task's touches."
  - "2026-08-28: the mechanism half of the split decided in flow-0028. Deliberately separated from the re-pin (flow-0030) because the publisher can be built and proved against a scratch target before a single adopter reference changes — and because flow-0030 collides with two live tasks while this one collides with nothing."
  - "2026-08-28: the failure this task must not have is the one it exists to prevent — publishing more than intended. A snapshot that carries history exports the very commits the split withholds. Treat 'what does NOT get published' as the tested property, not the happy path."
  - "2026-08-31: UNBLOCKED. flow-0028 merged (PR #43 chain: PR #44), so the boundary this task builds against is decided and on `main` as `docs/adr/0005-split-authoring-from-release.md`. Its Decision section carries both the two artefact lists AND a boundary RULE (a file is published only if an adopter needs it at run time or adoption time; anything that exists to author, plan or operate canonical stays private) — use the rule for files the lists do not name. Also corrected a stale pointer in Scope: the manifest source said ADR-0003, which is the MCP-server ADR; the split ADR is 0005. That was leftover from the pre-renumber spec and would have sent a worker to the wrong document. No other change: the release repo's NAME is still undecided and this task does not need it — repo creation and the publishing PAT remain human-only setup steps, to be named in the PR description, per this task's own scope."
  - "2026-08-31: RELEASE REPO NAME SETTLED by the human: `CandidDan/flow-protocol`. ADR-0005 deliberately left this open and this note is the record of the choice; the ADR itself still wants a short amendment. The human reports the repo is created. NOT VERIFIED from the authoring session — it is outside this session's GitHub scope (add_repo: 'you don't have access'), so before publishing, confirm two things that would each break the split: (a) it is PUBLIC — a private release repo cannot be resolved by an outside adopter's `uses:`, which is the whole reason the repo exists; (b) it does NOT carry the `flow` GitHub topic — `topic:flow` is how the flightdeck and watchdog enrol a repo (flightdeck/bin/mission-control.mjs, watchdog.mjs), so tagging it would enrol a store-less repo as a phantom project. Also: the publish is a history-free orphan snapshot of the manifest tree, so it REPLACES whatever is in the release repo — do not hand-add LICENSE, README or anything else there; the manifest owns the tree. The manifest must include both `LICENSE` and `NOTICE` (Apache-2.0 §4(d) obliges redistributors to carry NOTICE), and the licence is Apache-2.0, unchanged from canonical, per ADR-0005."
---

## Context

flow-0028 decides that canonical splits into a private authoring repo and a public release repo
holding only the artefact. This task builds the mechanism that gets the artefact from one to the
other.

The interesting requirement is not the copy. It is that the copy must be provably **bounded**: the
release repo must contain the artefact and nothing else, including nothing else in its history. A
`git subtree push`, a filtered branch push, or any other history-preserving transfer carries
commits that touched the task store, which exports exactly what the split exists to withhold —
and it does so invisibly, because the working tree looks correct.

So the publish is a snapshot: build the artefact tree, commit it as a single commit with no
parent from the private history, push, tag. And the test that matters is the one asserting what is
absent.

## Scope

**Does:**

- Add a publish helper under `.flow/bin/` that, given a source checkout and an artefact manifest,
  produces the exact tree to publish. Pure and testable: it decides *what* goes, and the workflow
  does the pushing. The manifest — which paths are artefact — comes from ADR-0005.
- Add `.github/workflows/flow-release-publish.yml`, triggered on release (and manually
  dispatchable for a dry run), which builds that tree, commits it as a **history-free snapshot**,
  pushes it to the release repo, and tags it with the version from `VERSION`.
- Support a **dry run** that reports the file list and the tag it would create, and writes
  nothing. The first thing anyone will want before pointing this at a real repo.
- Fail loudly, before pushing, if the computed tree contains any path outside the manifest — in
  particular anything under `.flow/tasks/`. A publisher that trusts its own manifest is one bug
  away from the failure this whole split is meant to prevent.
- Fail loudly if the target ref already carries the tag being published, rather than moving it: a
  moved tag silently changes what every pinned adopter runs.

**Deliberately does NOT:**

- **Re-pin any reference.** Every `CandidDan/flow` mention in the template, helpers and runbooks
  stays exactly as it is. That is flow-0030, and doing it here would collide with flow-0016 and
  flow-0023.
- **Create the release repo, or provision its credentials.** Repo creation and the publishing PAT
  are human-only setup steps. Name them in the PR description; do not invent a secret silently.
- **Migrate history, or attempt to preserve authorship in the release repo.** The snapshot is the
  point. If provenance is wanted publicly, it belongs in `CHANGELOG.md`, which the artefact
  already carries.
- **Change canonical's own workflow callers to local paths.** The ADR records that consequence;
  making the change is part of flow-0030 with the rest of the reference work.

## Acceptance criteria

- [ ] Given a source tree containing both artefact paths and `.flow/tasks/` files, when the
      publish tree is computed, then it contains every artefact path and no path under
      `.flow/tasks/`.
- [ ] Given a computed tree that (through a manifest error) includes a path outside the manifest,
      when the publisher runs, then it fails before any push and names the offending path.
- [ ] Given a publish run, when the resulting commit is inspected, then it has no parent drawn
      from the private repository's history — the snapshot carries no prior commits.
- [ ] Given a dry run, when it completes, then it reports the file list and the tag it would
      create, makes no network write, and exits zero.
- [ ] Given a tag that already exists on the target, when the publisher runs for that version,
      then it fails and does not move the tag.
- [ ] Given `VERSION`, when a publish runs, then the tag it creates corresponds to that version,
      so a pinned adopter and the stamp in the artefact cannot disagree.
- [ ] Given `.github/workflows/flow-release-publish.yml`, when its `permissions:` block is parsed,
      then it grants no more than the publish requires, and a test fails if it is widened.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- The manifest's home is a judgment call for the worker: `.flow/config.yml` is the established
  place for per-repo calibration, but the publish set is arguably artefact metadata that belongs
  beside `VERSION`. Either is defensible — pick one, say why in the PR, and make sure the tests
  read it from wherever it lands rather than restating it.
- The pushing credential needs `contents: write` on the release repo and nothing on this one
  beyond read. Same reasoning as `FLOW_WATCHDOG_PAT` in flow-0020: a separate, narrowly scoped
  secret beats reusing a broader one.
- Test the tree computation against a fixture directory rather than the live repo, so the test
  does not silently start passing because someone deleted a task file.
