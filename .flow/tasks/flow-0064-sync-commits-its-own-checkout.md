---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0064"
title: "flow-sync commits its own canonical checkout as a dangling submodule — every sync PR carries a `.flow-canonical` gitlink with no `.gitmodules` entry"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-09-17"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # sync plumbing; same anchor as flow-0051, same subsystem, no live goal names it
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-sync.test.mjs"
  - "CHANGELOG.md"
labels: [infra, sync, fleet]
notes:
  - "2026-09-17 (orchestrator): OBSERVED ON THE FIRST TWO REAL SYNCS, and it is why neither can be merged as it stands. `_flow-sync.yml:150` checks canonical out with `path: .flow-canonical`, which actions/checkout resolves INSIDE the consuming repo's working tree. Line 121's `git add -A` then stages it. Because that directory carries its own `.git`, git cannot store it as a tree and records it as a GITLINK instead — a submodule entry with no matching `.gitmodules` stanza. `.flow-canonical` appears in the added-files list of CandidDan/TanPlan#26, and the consequence is already visible in both repos' job logs, in post-job cleanup: `fatal: No url found for submodule path '.flow-canonical' in .gitmodules` followed by `The process '/usr/bin/git' failed with exit code 128`."
  - "2026-09-17 (orchestrator): SEVERITY — this is permanent damage to an adopting repo, not a noisy warning, which is what puts it at priority 1 ahead of the rest of the sync queue. Merging either sync PR writes the dangling gitlink into that repo's history. After that, `git submodule foreach` fails 128 on every checkout that runs it (actions/checkout's own cleanup does), and `git clone --recurse-submodules` fails outright for anyone cloning the repo. It also travels: the entry is in `main`, so every branch cut afterwards carries it. The fleet is mid-rollout to v2 and the two PRs carrying this are the first successful syncs either repo has ever had, so the blast radius is every repo that adopts from here on."
  - "2026-09-17 (orchestrator): WHY IT HAS NEVER BEEN SEEN BEFORE. `flow-sync` could not push `.github/workflows/` files until flow-0060 fixed the checkout credential, and TanPlan's flow-sync had never recorded a successful run at all. The job reached `git add -A` in earlier runs but the push was rejected, so the gitlink never survived into a PR. Fixing the push is precisely what exposed this. That ordering is worth recording: it is the second defect in a row that only became observable once the layer above it started working."
  - "2026-09-17 (orchestrator): THE FIX IS THE CHECKOUT PATH, NOT AN IGNORE RULE. Moving the checkout outside the working tree (a `${{ runner.temp }}` path, with `CANON_TPL` at :164 updated to match) removes the cause. Adding `.flow-canonical` to `.gitignore` or to an rsync exclude would suppress the symptom while leaving a full second checkout of canonical sitting inside the repo being synced, which is also what makes `git add -A` a loaded gun here — a future file that escapes the ignore list reintroduces it. Prefer the path change; if an ignore rule is added as well, it is belt-and-braces, not the fix."
  - "2026-09-17 (orchestrator): SCOPE NOTE ON WHERE THIS CANNOT BE FIXED. The two PRs already carrying the gitlink are sync PRs in adopting repos, and the protocol's hard rule is that Flow infra is authored in canonical and repos adopt it. Hand-patching TanPlan#26 or Nudge#286 to delete `.flow-canonical` would produce a green PR whose content no longer matches what canonical would generate, and the next sync would reintroduce it. The correct sequence is: fix here, cut the tag, close or supersede those two PRs, re-dispatch. That sequencing is the human's call and is recorded rather than assumed."
  - "2026-09-17 (orchestrator): SEPARATE AND NOT IN THIS TASK — the `flow-tooling` job also reports unit-test failures on both PRs, 2 of 345 in Nudge and 16 of 345 in TanPlan. Identical shipped code producing different failure counts in different repos suggests tests that read real repository state rather than fixtures, but THIS IS A HYPOTHESIS: the failing test names could not be extracted from the retrievable log window, and nobody should act on the guess without them. It wants its own task once someone has read the failures. It is called out here only so a worker fixing the gitlink does not assume a green `flow-tooling` job proves their fix."
---

## Context

`flow-sync` copies Flow infra from canonical into an adopting repo and opens a reviewed PR. To do
that it checks canonical out alongside the consuming repo, then rsyncs from it.

`_flow-sync.yml:150` gives that checkout `path: .flow-canonical`, which `actions/checkout`
resolves **inside the consuming repository's working tree**. Line 121 then runs `git add -A`.
Git cannot store a directory that contains its own `.git` as a tree, so it records a **gitlink** —
a submodule entry — and since nothing writes a `.gitmodules` stanza for it, the entry points
nowhere.

The result is in both of the first two real sync PRs. `.flow-canonical` is in the added-file list
of [TanPlan#26](https://github.com/CandidDan/TanPlan/pull/26), and both repos' job logs end with:

```
fatal: No url found for submodule path '.flow-canonical' in .gitmodules
##[warning]The process '/usr/bin/git' failed with exit code 128
```

This has never been observable before because the push carrying it was always rejected — the
credential defect flow-0060 fixed is what kept it hidden. See the notes for why that ordering
matters, why the symptom is worse than a warning, and why the two open sync PRs are deliberately
not in scope.

## Scope

**Does:**

- Moves canonical's checkout out of the consuming repo's working tree — a `${{ runner.temp }}`
  path rather than `.flow-canonical` — and updates `CANON_TPL` at `_flow-sync.yml:164` so the
  rsync source still resolves.
- Adds a test that fails against the current workflow and passes against the fixed one, asserting
  that no `actions/checkout` step in `_flow-sync.yml` targets a path inside the working tree.
- Records the change in `CHANGELOG.md` under `## Unreleased`.

**Does not touch:**

- `TanPlan#26` or `Nudge#286`. Those are sync PRs; patching them by hand breaks the
  authored-in-canonical rule and the next sync would undo it. Their disposition is the human's.
- The `flow-tooling` unit-test failures on those PRs — separate, undiagnosed, see the notes.
- The push, credential or permissions logic in `_flow-sync.yml` — flow-0060 and flow-0062 own it.
- `project-template/.flow/bin/flow-sync.mjs` — the defect is in the workflow, not the helper.
- The PR-body reporting defect — that is flow-0054.

## Acceptance criteria

- [ ] Given `_flow-sync.yml`, when every `actions/checkout` step's `path:` is inspected, then none
      resolves to a location inside the checked-out repository's working tree.
- [ ] Given the pre-fix `_flow-sync.yml` as a fixture, when the new test runs, then it fails and
      names the offending step — the test must be shown to catch the bug it exists for.
- [ ] Given the fixed `_flow-sync.yml`, when `npm run build` parses it, then it parses clean and
      the rsync source path referenced by `CANON_TPL` matches the checkout path.
- [ ] Given a sync run against a repo, when the sync commit is inspected, then it contains no
      gitlink entries and no path named `.flow-canonical`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- The fourth criterion is the only one that cannot be proven in unit test alone; satisfying it may
  mean a dispatch after the tag moves. Say so on the PR rather than quietly dropping it.
- This fix reaches the fleet only when the `v2` alias moves, exactly as flow-0060 and flow-0062
  did. The tag move is a human act by the versioning policy.
