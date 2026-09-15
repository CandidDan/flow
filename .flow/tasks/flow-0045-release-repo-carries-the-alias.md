---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0045"
title: "Give the release repo the floating `v1` alias the fleet actually pins, moved by the same deliberate act that moves canonical's"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-15"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # release plumbing; no live VISION goal names it (see the note on G4)
touches: ["project-template/.flow/bin/release-publish.mjs", "project-template/.flow/bin/release-publish.test.mjs", ".flow/bin/release-publish.mjs", ".flow/bin/release-publish.test.mjs", ".github/workflows/flow-release-publish.yml", "docs/flow-versioning-policy.md", "CHANGELOG.md"]
labels: [infra, release, fleet]
notes:
  - "2026-09-15: found while publishing 1.3.0 by hand. `git ls-remote https://github.com/CandidDan/flow-protocol` returns exactly three refs — refs/heads/main, refs/tags/v1.2.0, refs/tags/v1.3.0. No `v1`. The publisher pushes one tag (`release-publish.mjs`, the single `git push <remote> refs/tags/<tag>`) and `tagIsFree` makes re-pushing it a problem rather than a move, which is correct for an immutable release and leaves the alias unimplemented. Every adopting repo pins the ALIAS: Nudge and write both carry nine `@v1` callers. So flow-0030 would repin the fleet at a ref that does not exist — nine broken callers per repo, in their CI, with no local change to explain it. This task is the prerequisite, not a tidy-up."
  - "2026-09-15: `serves` is `maintenance` deliberately rather than G4. G4 (\"a repo stays current by reference\") is the goal flow-0030 names and it sits under VISION.md's `## Retired` after the 2026-09-01 rewrite; naming it here would anchor new work to a dead goal, which task-writer calls out as the one move that makes drift look anchored. No live goal (G6-G11) names release plumbing, so the reserved id is the honest answer."
---

## Context

ADR-0005 splits canonical into a private authoring repo and a public release repo, and flow-0029
built the publisher that pushes the history-free snapshot to `CandidDan/flow-protocol`. It works —
1.3.0 was published there on 2026-09-15 as a parentless commit carrying `VERSION` 1.3.0, the
reusables, and no `.flow/tasks/`.

What it does not push is the alias. `flow-protocol` carries `main`, `v1.2.0` and `v1.3.0` and
nothing else, because the publisher pushes exactly one ref per release and `tagIsFree` deliberately
refuses to move a `vX.Y.Z` that already exists ("A moved tag silently changes what every pinned
adopter runs"). That is right for an immutable release tag. It also means the floating `vX` alias —
**the ref every adopting repo actually pins** — has no implementation on the release-repo side.

The consequence is concrete and it lands on flow-0030: repointing the fleet's `uses:` lines at
`CandidDan/flow-protocol/.github/workflows/_flow-gates.yml@v1` today resolves to nothing. Nine
callers per repo, failing in the consuming repo's CI.

**The trap this task exists to avoid.** The obvious implementation — have the publisher move `vX`
to whatever it just published — would quietly destroy the canary. `docs/flow-versioning-policy.md`
makes `vMAJOR` a *deliberate human act* taken only after the edge has proven itself, precisely
because "auto-advancing a single alias removes the canary" and a bad reusable would reach the whole
fleet before anyone had run it once in anger. An alias on the release repo that advances on every
publish reintroduces that, one repository removed from where anyone would look for it. The release
repo's `v1` must mirror canonical's `v1` — same deliberate act, same moment — not the publish.

This session is the evidence that the manual half of a release path gets forgotten: canonical's
`v1` sat 305 commits behind `main` for three and a half weeks while `release-guard` measured the
gap as a warning nobody read. So a design where a human must remember two separate tag moves is a
design that will produce a release repo whose alias lags its own tags. Prefer a mechanism where
moving canonical's `v1` is the single act that also moves the release repo's — a workflow that
fires on that tag move, and mirrors it — over documentation asking someone to do it twice.

## Scope

**Does:**

- Make the release repo carry `v1` (generally: `vMAJOR`, derived from `VERSION` the way
  `release-tag.yml` already derives its own alias names — never hardcoded).
- Tie the alias move to **canonical's `v1` moving**, not to a publish. Mechanism is the worker's
  to choose, and the choice must be argued in the PR: a workflow triggered when canonical's `v1`
  is force-updated, a flag on the publisher used only by that path, or an explicit
  `workflow_dispatch`. What is NOT acceptable is the alias advancing as a side effect of
  publishing a release, for the canary reason above.
- Keep the immutable-tag behaviour exactly as it is: `vX.Y.Z` on the target is still refused if it
  already exists. The alias and the release tag have deliberately different rules, and a test
  must pin both so a later simplification cannot collapse them into one.
- Make a partial publish fail loudly. If the release tag lands and the alias does not, the run
  must not report success — "published" and "published without the ref the fleet pins" have to be
  distinguishable in the verdict and in the job summary.
- Record in `docs/flow-versioning-policy.md` what the release repo carries, who moves it and when,
  so the policy describes the fleet's real resolution path rather than canonical's alone.
- Record the change in `CHANGELOG.md` with its caller action (none for existing adopters — they
  still pin canonical until flow-0030 lands).

**Deliberately does NOT:**

- **Repin any adopting repo, or the template.** That is flow-0030, which this task unblocks.
- **Publish `v1-edge` to the release repo.** Decided out, not overlooked: nothing currently pins
  `@v1-edge` at all (canonical pins `@main`, Nudge and write pin `@v1`), so the canary channel has
  no subscriber to serve there yet. Restoring the canary is a separate decision about *which repo*
  holds the pin; when it is taken, whether edge needs to exist on the release repo follows from it.
  A second alias shipped now would be an unused moving ref on a public repo.
- **Change canonical's own `v1`/`v1-edge` mechanics**, `release-tag.yml`'s derivation, or
  `release-guard`'s rules. This adds a mirror; it does not renegotiate the model.
- **Make canonical private, or migrate the store.** Human acts, sequenced well after flow-0030.

## Acceptance criteria

- [ ] Given a published version `X.Y.Z` and the act that moves canonical's `vX`, when the release
      repo's refs are listed, then `vX` exists and points at the same commit as `vX.Y.Z` on that
      target — proved by a test over the publisher's decided ref set (a pure function over
      `ls-remote` output and the stamp, as `tagIsFree` already is), not by a live push.
- [ ] Given a target that already carries `vX.Y.Z`, when a publish runs, then the immutable tag is
      still refused with the existing "refusing to move it" problem — and, in the same test file,
      the alias is shown to be movable. Both rules asserted, so neither can be dropped silently.
- [ ] Given an alias name derived from a stamp, when `VERSION` is `2.0.0`, then the alias is `v2`
      and nothing named `v1` is touched — derived, never hardcoded, same property
      `release-tag.yml` already holds.
- [ ] Given a run where the release tag pushes and the alias push fails, when the job finishes,
      then it fails, and the verdict/summary names the release as published-without-its-alias
      rather than reporting success.
- [ ] Given `docs/flow-versioning-policy.md`, when the release section is read, then it states
      which refs the release repo carries, who moves the alias, and at what point in the
      procedure — and the answer matches what the code does.
- [ ] Given the repo after this change, when `build`, `lint`, `test` and `coverage` run, then all
      pass with coverage at or above the floor of 83.5.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **Shared logic goes in `project-template/.flow/bin/release-publish.mjs`**, not in canonical's
  adapter. The adapter is the CLI shell plus canonical's store location; a change to publishing
  behaviour belongs where every repo gets it. Do not replace the adapter with a copy or a symlink
  — every helper resolves its store as `dirname(realpath(import.meta.url))/..`.
- **The credential is not this task's to create.** `FLOW_RELEASE_PAT` already exists and pushes to
  the target. If moving a ref needs a scope it lacks, that is a finding for the human, not a
  secret to mint — say so in the PR and mark the task `blocked` rather than widening a token.
- A related scope defect was recorded by flow-0044's worker and is NOT in this task's scope, but
  belongs in the same conversation with the human: canonical's own `FLOW_PAT` appears to lack
  Contents write ("403 for pushes"), which is why a worker's branch push does not fire
  `flow-open-pr` there. `_flow-queue-runner.yml`'s header already documents that this consumer
  needs Contents Read/Write, unlike `_flow-open-pr.yml`'s Read.
