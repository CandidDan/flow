---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0031"
title: "Pin canonical's own third-party actions to commit SHAs, so a moved tag cannot change what the fleet runs"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-08-31"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G4"]            # what canonical says is what the fleet runs — a mutable tag breaks exactly that
touches: [".github/workflows/_flow-compass.yml", ".github/workflows/_flow-done.yml", ".github/workflows/_flow-gates.yml", ".github/workflows/_flow-open-pr.yml", ".github/workflows/_flow-queue-runner.yml", ".github/workflows/_flow-recover.yml", ".github/workflows/_flow-review.yml", ".github/workflows/_flow-status.yml", ".github/workflows/_flow-sync.yml", ".github/workflows/_flow-triage.yml", ".github/workflows/ci.yml", ".github/workflows/flow-watchdog.yml", ".github/workflows/release-tag.yml", ".flow/bin/action-pins.test.mjs"]
labels: [infra, security, supply-chain]
notes:
  - "2026-08-31: raised by the security check on flow-0027's PR (#43) as a Low, pre-existing finding, and deliberately NOT fixed there — it was outside that task's touches. Written up as its own task rather than logged as a note, because the fleet-wide blast radius is the whole point and a note would not have carried it."
  - "2026-08-31: SEQUENCING, decided rather than assumed. The nine project-template/.github/workflows/flow-*.yml callers have the same mutable-tag problem, and they are ALREADY claimed by flow-0030 (blocked), which rewrites every `uses:` line in them for the release-repo move. Pinning them here would either collide on those paths or force flow-0030 to be rewritten, and doing both edits to the same lines in two passes is wasted work. So this task takes canonical's own workflows only — which collide with nothing currently live — and flow-0030 pins the template callers in the same pass that re-points them. If flow-0030 is retired or rescoped, the template callers need a task of their own; they are not covered here."
  - "2026-08-31: the `uses:` lines that reference canonical's OWN reusables (CandidDan/flow/.github/workflows/_flow-*.yml@main) are deliberately out of scope. Those are governed by docs/flow-versioning-policy.md, which already reasons about mutable vs immutable refs for canonical's artefacts and chose a moving alias on purpose (v1-edge / v1, with a canary). Pinning a repo to a SHA of itself would defeat that policy, not harden it. This task is about THIRD-PARTY code only."
---

## Context

Canonical's workflows reference three third-party actions, and every reference is a mutable tag:
`actions/checkout@v4` (19 uses across canonical and the template), `actions/setup-node@v4` (16) and
`anthropics/claude-code-action@v1` (6).

A tag is a pointer. The owning repository moves these on every minor release — that is normal and
intended — but it also means whoever controls that repository can point the tag at any commit, and
the next workflow run executes different code. There is no PR, no diff, no version bump, and
nothing in the run log saying anything changed.

Three things make this worth a task here rather than a note:

1. **The blast radius is the fleet, not this repo.** These `uses:` lines live in reusables that
   every adopting repo calls. A moved tag lands in every adopter at once, in *their* CI, at
   whatever ref they pinned. `.flow/config.yml`'s own `security.focus` already names this
   precisely: "an unpinned or moved third-party action is a supply-chain hole in every adopting
   repo at once."
2. **The steps are privileged.** The `claude-code-action` steps run with `contents: write`,
   `issues: write` and `--permission-mode bypassPermissions`, holding `CLAUDE_CODE_OAUTH_TOKEN`
   and, in the queue-runner, `FLOW_PAT` — a real actor token whose pushes trigger further
   workflows. `checkout` handles credentials too. Substituted code in those positions does not
   need an exploit; it is already inside the trust boundary.
3. **Canonical already demands this discipline of itself.** `docs/flow-versioning-policy.md`
   reasons carefully about mutable versus immutable refs for canonical's own artefacts — immutable
   `vX.Y.Z`, an auto-advancing `v1-edge`, a `v1` only a human moves, a canary repo that eats
   changes first — and it records the incident that prompted it. That rigour is applied to what
   canonical publishes and not to what it consumes. Closing that asymmetry is the actual argument;
   "SHA pins are best practice" is not.

The failure mode is not hypothetical. The `tj-actions/changed-files` compromise (March 2025) worked
exactly this way: existing tags were repointed at a malicious commit, and thousands of repositories
leaked secrets into their own build logs on the next run, having upgraded nothing.

## Scope

**Does:**

- Replace every third-party `uses:` ref in canonical's own `.github/workflows/` with a full 40-character
  commit SHA, keeping the human-readable version in a trailing comment — the standard shape:
  `uses: actions/checkout@<sha> # v4.2.2`. Each SHA must be the commit the tag currently resolves
  to, read from the upstream repository, not guessed.
- Cover all three actions in all thirteen of canonical's workflow files: `_flow-compass`,
  `_flow-done`, `_flow-gates`, `_flow-open-pr`, `_flow-queue-runner`, `_flow-recover`,
  `_flow-review`, `_flow-status`, `_flow-sync`, `_flow-triage`, `ci`, `flow-watchdog`,
  `release-tag`.
- Add a check that fails if a third-party `uses:` ref reappears on a tag or branch instead of a SHA,
  so this does not have to be re-fixed by hand later. It belongs in `.flow/bin/` alongside the
  existing workflow-shape checks (`check-workflows.test.mjs`, `workflow-prompt-paths.test.mjs`),
  and follows their convention: read the workflow directory rather than a hardcoded file list, so a
  workflow added tomorrow is covered without anyone remembering. An empty scan is a failure, not a
  pass.
- Leave the check able to distinguish the two kinds of ref it will see: a third-party action
  (`owner/repo@ref`) must be a SHA; a reference to canonical's own reusables
  (`CandidDan/flow/.github/workflows/...@ref`) must NOT be forced to one — see below.

**Deliberately does NOT:**

- **Touch `project-template/.github/workflows/`.** Those nine callers carry the same problem and
  are already claimed by flow-0030, which rewrites the same `uses:` lines for the release-repo
  move. See the sequencing note. Pinning them here collides or duplicates work.
- **Pin canonical's references to its own reusables.** `@main` and `@v1` there are the deliberate
  output of `docs/flow-versioning-policy.md`, which chose a moving alias plus a canary on purpose.
  Freezing those would defeat a considered decision, not harden anything.
- **Introduce Renovate, Dependabot or any bot configuration.** Keeping the pins current is a real
  follow-on question and a reasonable next task, but adding a dependency-update bot is a separate
  decision with its own noise budget, and bundling it here would make this task un-reviewable.
- **Change any action's version.** This pins what is already in use to its current commit. A
  version bump is a different change with a different risk, and mixing the two means a broken run
  cannot be attributed to either.

## Acceptance criteria

- [ ] Given `.github/workflows/`, when every file is parsed, then no third-party `uses:` ref
      resolves to a tag or branch — each is a 40-character hexadecimal commit SHA.
- [ ] Given each pinned ref, when the line is read, then it carries a trailing comment naming the
      human-readable version it corresponds to, so a reviewer can tell what the SHA is without
      resolving it.
- [ ] Given a workflow file in which a third-party ref has been changed back to a tag, when the new
      check runs, then it fails and names the offending file, ref and line — proven by a test that
      makes that edit against a fixture rather than asserting on today's tree only.
- [ ] Given a `uses:` ref that points at one of canonical's own reusables
      (`CandidDan/flow/.github/workflows/...@main` or `@v1`), when the check runs, then it passes —
      the check must not force canonical's deliberate moving alias to a SHA.
- [ ] Given a workflow directory containing no files, or containing no `uses:` refs at all, when
      the check runs, then it fails rather than reporting success — an empty scan verified nothing.
- [ ] Given the pinned workflows, when a full CI run completes on the PR, then every job that
      previously ran still runs and passes — the pins resolve to real, fetchable commits, not
      plausible-looking hashes.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **Resolve the SHAs from upstream; do not invent them.** A wrong-but-well-formed hash fails at
  run time with an unhelpful error, and it will fail in every adopting repo, not just here. If the
  upstream repositories cannot be reached from the working environment, that is a `blocked`, not a
  reason to guess: say so and stop.
- The check has to tell a third-party ref from a first-party one. Matching on the `CandidDan/flow/`
  prefix is the obvious approach; if the release-repo split (flow-0028 / flow-0029 / flow-0030)
  later changes that owner, the check's allow-list is one of the places that must move with it, so
  write it as a single named constant rather than an inline literal.
- `uses: ./` local-path refs, if any exist by the time this is worked, are neither third-party nor
  tagged and should simply be ignored by the check.
- Keeping the pins current is deliberately unsolved here. Raise it as a follow-up rather than
  widening this task: without an update mechanism the pins go stale, which trades a supply-chain
  risk for a patch-lag risk. That trade is the human's to make, not the worker's.
