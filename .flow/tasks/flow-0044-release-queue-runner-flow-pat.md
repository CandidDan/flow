---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0044"
title: "Stamp and changelog the 1.3.0 release, so the queue-runner FLOW_PAT fix can reach the fleet"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-14"
started: ""
branch: "flow/flow-0044-release-1-3-0"
pr: ""
issue: ""
blocked_reason: ""
serves: ["G10"]           # the fleet's autonomous path currently opens PRs whose gate never fires
touches: ["CHANGELOG.md", "VERSION", "project-template/.flow/VERSION", ".flow/bin/release-stamp.test.mjs", ".flow/bin/triage-author-trust.test.mjs"]
labels: [infra, release]
notes:
  - "2026-09-14 (orchestrator): UNBLOCKED by widening `touches` to include .flow/bin/triage-author-trust.test.mjs — the decision the worker correctly refused to take for itself. Verified rather than accepted: line 815 locates the flow-0036 entry with changelog.split by section heading and then asserts an entry exists inside the Unreleased one, so an empty Unreleased fails it by construction, and it would have failed on the first release cut after it merged whoever cut it. (Reproducing it locally needs `npm ci` — the case carries a skip guard and skips without the yaml dependency, which is why the failure shows up in CI and not in a bare checkout.) Widened rather than split into its own task because the breakage is a direct consequence of THIS task's scope (fold Unreleased into the release section), the fix is three lines in a test, and a separate task means a second session and a second PR while the release waits. The omission was the orchestrator's: the scope implied that file and the touches list did not name it. The widening is bounded — only the section locator changes, every other assertion in that file stays byte-for-byte. Also corrected in Context: the gap is 299 commits, not 94; the 94 was a shallow clone's truncated count and release-guard's mainAhead from a full-depth checkout is authoritative. The branch is the base: do NOT redo the stamps, the changelog or release-stamp.test.mjs — all three are pushed and green."
  - "2026-09-14: BLOCKED at the gate, with the work done and pushed. Branch `flow/flow-0044-release-1-3-0` (3 commits, pushed) carries everything the task asked for. GENUINELY DONE and verified: both stamps at 1.3.0; the `## 1.3.0 - 2026-09-14 (pending tag + canary)` section written from the enumeration, 17 entries each stating a caller action, flow-0026's queue-runner FLOW_PAT change first with the github-actions[bot] gate-parking symptom as its why; the three Unreleased entries folded in verbatim and `## Unreleased` left empty; `.flow/bin/release-stamp.test.mjs` written (7 cases, all passing) with properties derived at run time and literals confined to two tombstone cases. Criterion 4 verified: `node .flow/bin/release-guard.mjs` exits 0 with 0 problems and 1 warning -- rule 4 (silent staleness) correctly stopped firing because the stamp now leads the newest release tag (a release in flight), and its number survives in the JSON facts as mainAhead: 299 alongside aliasBehind: 299 in the rule 5 warning. build PASSES (24 workflows), lint PASSES (80 .mjs), coverage 94.68% lines, far above the 83.5 floor. WHAT ONLY LOOKS DONE: `npm test` is 951/953 with 1 failure, and it is NOT in any file this task wrote -- see blocked_reason. MINOR-vs-MAJOR re-checked and NOT re-litigated: flow-0039's `ready_for_review` genuinely does need a caller edit (without it a worker's `gh pr ready` reaches no workflow and the task strands at in_progress), but the Scope names that change explicitly and rules it non-blocking, so 1.3.0 stands and the caller action is spelled out in full in that changelog entry. NEXT ACTION once touches is widened: apply the three-line locator fix in `.flow/bin/triage-author-trust.test.mjs:815-818`, re-run `npm test` and `npm run coverage`, then open the PR titled `[flow-0044] Stamp and changelog the 1.3.0 release, so the queue-runner FLOW_PAT fix can reach the fleet` with the acceptance checklist and the three human tag steps from the task's hand-off section. Do NOT re-do the stamps, the changelog or the test -- they are on the branch and green."
  - "2026-09-14: branch `flow/flow-0044-release-1-3-0` pushed with the stamps and the changelog. GENUINELY DONE: both stamps at 1.3.0 (no trailing newline, matching the previous format); the `## 1.3.0 - 2026-09-14 (pending tag + canary)` section written from the enumeration in the task (`git log v1.2.0..HEAD -- .github/workflows/_flow-*.yml project-template/`), 17 entries each with a `[caller action: ...]` clause, flow-0026's queue-runner FLOW_PAT change first with the github-actions[bot] gate-parking symptom as its why; the three Unreleased entries folded in verbatim with `## Unreleased` left empty. NOT DONE YET: `.flow/bin/release-stamp.test.mjs` (criteria 1-3's proving test) and the gate run. MINOR-vs-MAJOR re-checked, not re-litigated: flow-0039's `ready_for_review` DOES need a caller edit or a worker's `gh pr ready` reaches no workflow and the task strands at in_progress - but the task's Scope names that change explicitly and rules it non-blocking, so 1.3.0 stands and the caller action is spelled out in that entry and will be surfaced in the PR description. NEXT ACTION: write `.flow/bin/release-stamp.test.mjs` (properties derived at run time, one literal tombstone for the flow-0026 entry), run `npm run build && npm run lint && npm test && npm run coverage` plus `node .flow/bin/release-guard.mjs`, then open the PR titled `[flow-0044] Stamp and changelog the 1.3.0 release...` with the three human tag steps at the end."
---

## Context

`v1` — the alias the whole fleet pins — resolves to `a7a29a2`, tagged `v1.2.0` on 2026-08-20.
`main` is **299 commits** past it — `release-guard`'s `mainAhead` from a full-depth checkout. (An
earlier draft of this task said 94. That was a shallow clone's truncated count; do not re-derive
this number from a `--depth` clone.) Everything merged in those three and a half weeks is on
`v1-edge` and has reached nobody else, which is exactly what the canary split is *for* (see
`docs/flow-versioning-policy.md`) — but steps 4–6 of that policy's release procedure have not been
taken since, so the canary has been proving releases that were never published.

One of the unpublished changes is `flow-0026` / PR #40: `_flow-queue-runner.yml`'s worker step now
authenticates with `${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}` instead of the hardcoded
`secrets.GITHUB_TOKEN`. At `v1` it is still hardcoded, so in every adopting repo the in-CI worker
opens its PR as `github-actions[bot]`, and GitHub will not run that PR's `pull_request` workflows
until a human releases them. Observed in `CandidDan/Nudge` on 2026-09-14, two PRs the same morning:

| | PR #267 | PR #268 |
|---|---|---|
| Author | `CandidDan` (a web session) | `github-actions[bot]` (the in-CI worker) |
| PR created | 06:23:26 | 09:22:34 |
| `flow-gates` / `flow-review` / `flow-status` runs created | 06:23:30 | 09:22:38 |
| Jobs actually started | 06:23:30 — immediately | **11:01:2x — 98 minutes later, all three in the same second, as run attempt 2** |

No job check-runs exist on #268 before 11:01, so the gate had not run at all in the interim: the
PR sat reviewable with its Definition-of-Done gate parked. That is the same class of failure
CAN-58 was raised for ("the Definition-of-Done gate was silently bypassed for the entire
autonomous path"), and it is why this serves **G10** rather than `maintenance` — the fleet's
autonomous path currently produces PRs whose gate does not fire, and the fix for that exists and
is sitting unreleased.

Nothing is broken here and nothing needs inventing. `release-guard` has been *measuring* the gap
the whole time — its rule 4 (silent staleness) and rule 5 (alias rot) both report it, with a
number, as warnings on purpose. The missing step is the release itself, and the worker-doable half
of a release under this repo's own policy is the stamp and the changelog. The tag pushes are
human, deliberately, and stay that way.

Sequencing note for the worker: `release-guard`'s rule 4 fires only while the stamp has **not**
moved; a stamp bumped ahead of the newest release tag is explicitly "a release in flight, which is
normal and legible". So bumping `VERSION` to `1.3.0` and merging does not turn a warning into a
problem, and `release-tag.yml` stays green on the merge. This has been read in the source rather
than assumed — do not re-litigate it, but do prove it (criterion 4).

## Scope

**Does:**

- Bump both stamps to `1.3.0`: `VERSION` and `project-template/.flow/VERSION`. They are pinned to
  each other by nothing but `release-guard`'s rule 2, so they move together or not at all.
- Write the `## 1.3.0` section of `CHANGELOG.md`, per the policy's step 2: one entry per change
  **an adopting repo consumes** — i.e. changes under `.github/workflows/_flow-*.yml`,
  `project-template/**` — each saying what changed, why, and **any caller action required**.
  Enumerate them; do not recall them:
  `git log --oneline v1.2.0..HEAD -- .github/workflows/_flow-*.yml project-template/`
  and `git diff --stat v1.2.0..HEAD -- .github/workflows/_flow-*.yml project-template/`.
  The `_flow-queue-runner.yml` FLOW_PAT change (flow-0026) must be one of the entries, named as
  such, because it is the reason this release is being cut.
- Fold the three existing `## Unreleased` entries (flow-0043, flow-0027, flow-0036) into the
  `## 1.3.0` section rather than rewriting them, and leave `## Unreleased` in place, empty, for
  the next change.
- Fix the stale changelog-section locator in `.flow/bin/triage-author-trust.test.mjs` (~line 815)
  and **nothing else in that file**. It finds the flow-0036 entry by assuming the `## Unreleased`
  section, so folding that entry into `## 1.3.0` fails it. Make it find the section that
  *contains* the entry instead, which also stops it breaking again at 1.4.0. Every other assertion
  in that file stays byte-for-byte: it is flow-0036's proof and this task does not own it.
- Add a proving test (`.flow/bin/release-stamp.test.mjs`) over the repo's **real** files: the two
  stamps agree and are `MAJOR.MINOR.PATCH`; `CHANGELOG.md` carries a section whose heading is the
  root stamp. Assert those as *properties derived at run time* — a test that hardcodes `1.3.0` in
  the stamp comparison ages the moment the next release lands. The one place a literal is correct
  is a tombstone case pinning that the `## 1.3.0` section records the queue-runner FLOW_PAT
  change: that section is immutable history once shipped, and the literal is the point.

**Does NOT:**

- **Does not push any tag.** Cutting `v1.3.0` and moving `v1` are policy steps 4–6, human-only,
  and stay human: the guard's own header says a release path that hard-fails (or automates past) a
  deliberate manual step teaches people to bypass it. The worker must not attempt a tag push, and
  must not add a workflow that would.
- Does not touch `_flow-queue-runner.yml` or any other reusable. The fix is already on `main`;
  this task publishes it, it does not re-make it.
- Does not touch any consuming repo. Nudge additionally needs a `FLOW_PAT` repo secret for the
  fixed reusable to have anything to fall through to — that is a human step in that repo, recorded
  in the hand-off below, not work here.
- Does not change `docs/flow-versioning-policy.md`, the canary split, or `release-tag.yml`.
- Does not escalate rule 4 / rule 5 from warnings into a failure or a scheduled report. The
  guard's header names that escalation and says the trigger is the warning proving too easy to
  ignore — which it now has, three and a half weeks running. That is a real follow-up task with
  its own argument, and bundling it here would put a policy change inside a release.
- Does not update adopting repos' thin callers. The caller plane genuinely did change since
  `v1.2.0` (named secrets per flow-0033, `ready_for_review` per flow-0039, a new `flow-compass`
  caller), and none of it propagates through the alias. It does not block this release either —
  see the MINOR-not-MAJOR argument in the notes — and it is `flow-sync`'s job per repo.

## Acceptance criteria

- [ ] Given the release branch, when `VERSION` and `project-template/.flow/VERSION` are read, then
      both are `1.3.0` — and a test over the real files fails if the two ever disagree or either
      stops being `MAJOR.MINOR.PATCH`, derived at run time rather than compared to a literal.
- [ ] Given `CHANGELOG.md`, when the section named by the root stamp is looked up, then it exists
      and is non-empty — asserted as that property, so the test keeps holding at 1.4.0 and beyond.
- [ ] Given the `## 1.3.0` section, when it is read, then it carries one entry per
      adopter-consumed change merged since `v1.2.0` (the `git log` above is the enumeration), each
      naming its caller action or stating that none is required; and the `_flow-queue-runner.yml`
      FLOW_PAT change (flow-0026) is among them, named, with the `github-actions[bot]` PR symptom
      above as its "why". A tombstone case pins that last fact.
- [ ] Given the branch tip, when `node .flow/bin/release-guard.mjs` is run, then it exits 0 and
      reports **no problems** — and its warnings still name the staleness and alias-rot numbers, so
      the run log shows the stamp bump was read as a release in flight rather than as a repair.
- [ ] Given the same tip, when `build`, `lint`, `test` and `coverage` are run, then all four pass
      with coverage at or above the floor of 83.5.

## Human hand-off (after the PR merges — not the worker's, and not optional)

The release is not delivered when this PR merges; `v1-edge` moves, the fleet does not. The PR
description must end with these three steps, spelled out, so they can be done without reading the
policy:

1. `git tag -a v1.3.0 <merge commit> -m "Flow 1.3.0" && git push origin v1.3.0`
2. Confirm the canary repo (whichever pins `@v1-edge`) has gone green end-to-end on at least one
   real PR since the merge. Observation, not work.
3. `git tag -f v1 v1.3.0 && git push -f origin v1` — the fleet is now on it. Rollback, if needed,
   is `git tag -f v1 v1.2.0 && git push -f origin v1`.

Then, in `CandidDan/Nudge` specifically: add the `FLOW_PAT` repo secret (fine-grained, that repo
only, Contents **Read/Write** — the worker pushes the claim commit and the branch — plus Pull
requests Read/Write). Without it the fixed reusable falls through to `GITHUB_TOKEN` and the
approval prompt stays exactly where it is.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **MINOR, not MAJOR — settled here, not left open.** The policy's tell for MAJOR is "requires
  editing the per-repo callers". The caller plane did change since `v1.2.0`, but no existing
  caller has to change for the alias to move: a caller still passing `secrets: inherit` keeps
  working against a reusable that declares named secrets (inherit is the superset), and the
  reverse — a caller naming a secret the reusable does not declare, which is what fails GitHub's
  own validation — is the mismatch flow-0033 documented and this release *closes* rather than
  opens. So `1.3.0`. If the enumeration turns up a change that does force a caller edit, that is a
  finding: stop, mark the task `blocked` with the reason, and put the version number back to the
  human rather than shipping a MINOR that is really a MAJOR.
- **Do not assert a hardcoded count anywhere.** The 94, the number of changelog entries, the
  number of reusables touched — all of them age, and flow-0032 already shipped a test that passed
  while being wrong because it re-derived its subject with the same flawed measurement it was
  checking. Assert properties.
- **Coverage.** The new test reads data files rather than adding a source tree, so it should not
  move the floor. If coverage drops, the answer is a test, never a lower floor.
- **Candidate follow-up, deliberately not in scope:** escalate `release-guard`'s rule 4/5 warnings
  into something that cannot be ignored for three weeks — the guard's header proposes a scheduled
  report, and the flightdeck is the obvious place for it to land. Needs its own argument about who
  reads it and what they do about it, which is why it is not bundled here.
