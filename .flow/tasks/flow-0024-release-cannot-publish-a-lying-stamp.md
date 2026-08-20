---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0024"
title: "Make it impossible to publish a version stamp that disagrees with the tree it stamps"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude/next-task-br2olx"
created: "2026-08-19"
started: "2026-08-20T05:02:27Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G4"]            # what canonical says is what the fleet runs — the stamp is what it says
touches: ["project-template/.flow/bin/release-guard.mjs", "project-template/.flow/bin/release-guard.test.mjs", ".flow/bin/release-guard.mjs", ".flow/bin/release-guard.test.mjs", ".github/workflows/release-tag.yml"]
labels: [infra, release, integrity]
notes:
  - "2026-08-19: written after the stamp bump to 1.2.0 (PR on claude/process-handoff-d7y136). That bump is the manual repair; this task is the guard that makes the repair unnecessary next time. Do not treat the bump as closing this."
  - "2026-08-19: the incident was misdiagnosed once already. A handoff read `9a29a00` — the annotated *tag object* SHA for v1.1.1 — as a commit, concluded v1.1.1 tagged a tree earlier than main, and derived a version number from that. It dereferences to d751e97, which *is* the commit it thought was untagged. Any guard here must compare `<tag>^{commit}`, never the tag object, and its tests must cover annotated tags specifically — a lightweight-tag-only fixture would have passed while reproducing nothing."
---

## Context

`flow-sync` decides whether a consuming repo is behind by comparing canonical's
`project-template/.flow/VERSION` against that repo's `.flow/VERSION` (`_flow-sync.yml:75-76`). It
reads the stamp and nothing else — not the tag, not the tree, not the commit date. That is a
deliberate design (the stamp is the cheap, offline, dependency-free comparison) and it is fine
*provided the stamp is true*. Nothing currently makes it true.

On 2026-08-19 three different trees carried the stamp `1.1.0`:

```
v1.1.0   commit b0193e4   tree 58f2b7c   VERSION 1.1.0
v1.1.1   commit d751e97   tree ed60296   VERSION 1.1.0
main     commit 077166d   tree c0d0ff2   VERSION 1.1.0
```

So `v1.1.1` — the tag cut to publish the touches-guard fail-open fix — tags a tree whose own stamp
says `1.1.0`. Sync compares `1.1.0` against `1.1.0`, decides `current`, exits 0, and reports success
nightly. The fix was published and reached nobody, and the mechanism that was supposed to notice
reported health. Meanwhile `v1`, which the fleet actually pins, sat 74 commits behind `main`
without the fix at all.

This is the same signature as the bug it failed to deliver: **the wrong answer arrives quietly and
in the direction that looks healthy.** touches-guard failed open and the gate went green. The
release path published a fix behind a stamp saying there was nothing to publish. In both cases the
observable was success.

Four distinct ways the stamp can lie, only the first of which is obvious:

1. **Tag/stamp disagreement.** A tag `vX.Y.Z` at a commit whose `VERSION` is not `X.Y.Z`. This is
   what happened.
2. **Internal stamp drift.** Root `VERSION` (which `release-tag.yml` reads to derive the alias
   names) and `project-template/.flow/VERSION` (which sync compares) are separate files that
   nothing pins together. Either can move alone.
3. **Silent staleness on `main`.** `main` advancing past the last cut tag with the stamp unchanged.
   Every such commit is un-publishable-by-sync by construction, and there is no signal.
4. **Alias rot.** `v1` — what the fleet resolves — drifting arbitrarily far behind `main` with
   nothing reporting the distance. Moving `v1` is deliberately a human step
   (`release-tag.yml`'s header explains why the canary exists); "human step" is a reason to
   *surface* the gap, not a reason to have no measure of it.

## Scope

**Does:**

- Add `project-template/.flow/bin/release-guard.mjs`, split the way the other helpers are:
  - **The pure part.** Given a tag name, the `VERSION` contents at that tag's commit, the two
    stamp values, and the commit distance between refs, return a structured verdict — a list of
    problems (exit non-zero) and warnings (exit 0). Deterministic, no IO, no clock, no `git`.
  - **The IO part.** Resolve refs and read blobs at a ref, injected the way `flow-state.mjs` and
    `flow-recover.mjs` inject theirs, so every branch is exercisable with no real remote.
- Wire it into `.github/workflows/release-tag.yml` so a tag push that would publish a
  disagreeing stamp **fails** rather than succeeding quietly. The alias-rot distance (4) reports
  as a warning with a number, not a failure — it is information for a human, and a release path
  that hard-fails on a deliberate human step teaches people to bypass it.
- Add `.flow/bin/release-guard.mjs` — canonical's **adapter**: the CLI shell plus canonical's own
  paths, importing the template's exported logic. Not a copy, not a symlink (a symlink resolves
  the store to the template's fixture store and still exits 0 — the failure mode `CLAUDE.md`
  names).
- Tests alongside both, including annotated-tag fixtures (see notes).

**Deliberately does NOT:**

- **Move, cut, or retag anything.** No tag writes. The guard reports; a human releases. In
  particular it must not "helpfully" advance `v1` — that is the canary contract in
  `release-tag.yml`'s header, and this task must not quietly reverse a decision recorded there.
- **Change `flow-sync`'s comparison.** Stamp-only is correct and cheap. The defect is that nothing
  guarantees the stamp; do not fix it by making sync read git history, which would make every
  consuming repo's nightly job depend on canonical's tag topology.
- **Bump any version.** The 1.2.0 repair is already in flight separately. A guard that also
  mutates the thing it guards cannot be trusted to report on it.
- **Introduce a changelog, release-notes generator, or semver-inference-from-commits.** Choosing
  the number stays human. This checks that the number told the truth, not that it was well chosen.
- **Touch `.flow/bin/adapters.test.mjs`** (flow-0015's). This adapter proves itself in its own
  test file.

## Acceptance criteria

- [ ] Given a tag `v1.2.0` whose commit's `VERSION` reads `1.2.0`, when the guard runs, then it
      reports no problems and exits 0.
- [ ] Given a tag `v1.1.1` whose commit's `VERSION` reads `1.1.0`, when the guard runs, then it
      reports a problem naming the tag, the stamp it found and the stamp it expected, and exits
      non-zero.
- [ ] Given an **annotated** tag, when the guard resolves it, then it reads `VERSION` at
      `<tag>^{commit}` and not at the tag object, and a test asserts the two SHAs differ in the
      fixture — so the test would fail if the implementation compared the tag object. (This is the
      exact misreading that produced a wrong diagnosis on 2026-08-19; see notes.)
- [ ] Given root `VERSION` is `1.2.0` and `project-template/.flow/VERSION` is `1.1.0`, when the
      guard runs, then it reports a problem naming both paths and both values, and exits non-zero.
- [ ] Given the two stamps agree, when the guard runs, then that check contributes no problem and
      no warning — an agreeing pair is silent, not "ok" noise.
- [ ] Given `main` is N commits ahead of the highest `vX.Y.Z` tag with the stamp unchanged, when
      the guard runs, then it emits a warning naming N and the tag, and exits 0.
- [ ] Given `v1` is N commits behind `main`, when the guard runs, then it emits a warning naming N
      and both refs, and exits 0 — never a problem (moving `v1` is a human step by design).
- [ ] Given a `VERSION` that is not `MAJOR.MINOR.PATCH`, when the guard runs, then it reports a
      problem rather than parsing it into a comparison — the same shape `release-tag.yml` already
      enforces for its own alias derivation.
- [ ] Given a tag whose name is not `vX.Y.Z` (`v1`, `v1-edge`), when the guard runs, then it is
      skipped for the tag/stamp check rather than failing — the aliases are expected not to carry
      matching stamps.
- [ ] Given the canonical adapter, when it resolves its paths, then it resolves canonical's own
      `VERSION` and `project-template/.flow/VERSION`, not the template's fixture store — the same
      assertion the other adapters carry, for the same reason.
- [ ] Given `release-tag.yml` after this change, when a tag push would publish a disagreeing
      stamp, then the workflow fails; and when the stamps agree, then the edge alias still moves
      exactly as it does today (the existing behaviour is unchanged on the happy path).
- [ ] Given the repo after this change, when `npm run build`, `npm run lint`, `npm test` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **This is the fifth task to hit the same wall, and the first that should not.** flow-0008,
  flow-0009, flow-0010 and flow-0014 all have criteria reachable only by running a workflow,
  because the logic is inline shell inside YAML. Every fix that landed in `.flow/bin` this month
  was cheap and provable; every fix in workflow shell was neither. That is why the guard here is a
  tested module and `release-tag.yml` gets a call, not a new `run:` block. Keep the YAML side to
  invocation and argument passing — if a reviewer finds branching logic in the workflow, that is a
  defect in this task, not a shortcut.
- **Compare `<tag>^{commit}`, always.** Canonical's tags are mixed: `v1.0.0`, `v1.1.0` and `v1.1.1`
  are annotated (tag object ≠ commit), while `v1` and `v1-edge` are lightweight (object = commit,
  because `release-tag.yml` force-updates the ref directly). A fixture built only from lightweight
  tags reproduces nothing and passes trivially.
- **The stamp files disagree in trailing bytes and that is fine, but say so.** Canonical's two
  `VERSION` files have no trailing newline; `_flow-sync.yml:100` writes the consuming repo's stamp
  with `printf '%s\n'`, so adopted stamps *do* have one. Every reader passes `tr -d '[:space:]'`
  first. Compare trimmed values; do not "fix" the newline in either place, and do not add a
  byte-equality assertion that would fail across the adopt boundary.
- **Why a warning and not a problem for alias rot.** `v1` lagging is the canary working as
  designed for hours or days, and indistinguishable from `v1` lagging because a human forgot for
  six weeks — which is what happened. A number in the output lets a human tell those apart; a hard
  failure on a deliberate manual step just gets bypassed. If the warning proves too easy to ignore,
  the escalation is a scheduled report, not a stricter release gate — record that here rather than
  tightening it silently.
- **Open question, for the orchestrator not the worker:** whether the alias-rot warning belongs in
  `flow-doctor` (store-wide, runs in every gate, so the fleet would see it) instead of only in
  `release-tag.yml` (canonical-only, runs once per tag push). Cheap either way; the answer changes
  who notices. Decide before the worker starts rather than letting the worker pick.
- If this does not fit one sitting, the seam is the pure verdict function plus its tests versus the
  git IO and the workflow wiring. Split there and say so — do **not** ship the wiring without the
  tag/stamp criterion proven, because that criterion *is* the deliverable.
