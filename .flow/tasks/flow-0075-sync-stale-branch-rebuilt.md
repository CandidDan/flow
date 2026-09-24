---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0075"
title: "flow-sync: a leftover sync branch with no open PR is rebuilt, not a silent green no-op"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-worker-flow-0075"
created: "2026-09-24"
started: "2026-09-24T09:20:54Z"
branch: "flow/flow-0075-sync-stale-branch-rebuilt"
pr: "https://github.com/CandidDan/flow/pull/107"
issue: "https://github.com/CandidDan/flow/issues/104"
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # sync delivery health; no live VISION goal names it (G4 was retired)
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-sync.mjs"
  - "project-template/.flow/bin/flow-sync.test.mjs"
  - ".flow/bin/sync-existing-branch.test.mjs"
  - "changes/flow-0075.md"
labels: [flow-infra, flow-sync, bug]
notes:
  - "2026-09-24 (orchestrator): converted from issue #104 on the human's direct instruction. Observed in CandidDan/Nudge: `flow-sync/2.0.0` survived a closed-unmerged PR (Nudge#286). The next run logged 'a sync PR for 2.0.0 is already open', went green and opened nothing. The branch was also built from an older `v2` on an older `main`, so reopening it would have regressed the repo."
  - "2026-09-24 (orchestrator): DECIDED: THE DECISION IS A PURE FUNCTION IN flow-sync.mjs, THE WORKFLOW ONLY GATHERS FACTS. Add a subcommand (name it e.g. `existing`) that takes three facts: whether the branch exists, whether an open PR exists from it, and the canonical SHA recorded on the branch's head commit (empty if none). It also takes the canonical SHA being synced now, and prints exactly one of `create`, `rebuild`, `refresh` or `noop`. The shell in `_flow-sync.yml` gathers the facts (`git ls-remote`, `gh pr list --head <branch> --state open`, the head commit message) and acts on the verdict. This keeps the rule unit-testable with no network, the same split `decide`, `branch` and `pr-body` already use."
  - "2026-09-24 (orchestrator): DECIDED: THE CANONICAL SHA IS RECORDED AS A COMMIT TRAILER. The sync commit gains a trailer line `Canonical-SHA: <sha of the canonical checkout>`, and `refresh` compares against it. A branch whose head has no trailer (every branch built before this change) counts as stale. That is the safe direction: the worst case is one unnecessary rebuild."
  - "2026-09-24 (orchestrator): DECIDED: REBUILD AND REFRESH FORCE-PUSH. `flow-sync/*` branches are bot-owned by construction, so both rebuild the branch from current canonical on current `main` and `git push --force-with-lease` it. Force-with-lease, not bare `--force`: if a human pushed to the branch between the fetch and the push, the push fails loudly instead of discarding their commit. Never force-push any branch whose name did not come from `flow-sync.mjs branch`. `rebuild` then opens a PR (there is none). `refresh` does not, because the open PR picks up the new head by itself."
  - "2026-09-24 (worker): branch `flow/flow-0075-sync-stale-branch-rebuilt` pushed. DONE: `decideExisting` + `CANONICAL_SHA_TRAILER` in `project-template/.flow/bin/flow-sync.mjs`, wired as the `existing` subcommand, with 8 unit tests in `flow-sync.test.mjs` covering all four verdicts and the throw-on-ungathered-fact path (29/29 pass). NEXT: rewire `_flow-sync.yml` (replace the bare `git ls-remote` early-exit with fact-gathering + the verdict, add the `Canonical-SHA:` trailer and export `CANON_SHA` from the clone step, force-with-lease on rebuild/refresh), then write `.flow/bin/sync-existing-branch.test.mjs` and `changes/flow-0075.md`, then the full gate."
---

## Context

`_flow-sync.yml` is the only sanctioned route by which a canonical change reaches an adopting repo.
Its idempotency check (`.github/workflows/_flow-sync.yml`, the `git ls-remote --heads origin
"$BRANCH"` test just after `BRANCH=` is computed) treats *the branch exists* as *a sync PR is
open*. Then it logs that claim without having checked it, and exits 0.

So a sync PR closed without merging leaves its branch behind, and that version can never be
offered again: every later run is a green no-op that says a PR is open when none is. The only way
out is to delete the branch by hand, which is how Nudge#297 got opened. Nothing reports the
problem, so a repo can sit behind canonical indefinitely while its sync goes green every run.

## Scope

**Does:**

- Add the decision subcommand to `project-template/.flow/bin/flow-sync.mjs` (see notes):

  | branch exists | open PR | head's `Canonical-SHA` vs now | verdict |
  |---|---|---|---|
  | no | — | — | `create` (today's path) |
  | yes | no | any | `rebuild`: rebuild, force-with-lease push, open a PR |
  | yes | yes | differs, or no trailer | `refresh`: rebuild, force-with-lease push, no new PR |
  | yes | yes | equal | `noop` |

- Wire it into `_flow-sync.yml` in place of the bare branch-existence test. Add the
  `Canonical-SHA:` trailer to the sync commit.
- **Log what was checked, never what was assumed.** Each verdict prints the facts it was reached
  from: branch present or absent, the open PR's number or "none", and both SHAs. The words
  "already open" appear only when an open PR was actually found.
- If gathering a fact fails (for example `gh pr list` errors), the run fails with an `::error`
  naming the fact. It must never fall back to `noop`.
- Write the changelog fragment `changes/flow-0075.md`.

**Does not touch:**

- `_flow-sync.yml`'s `permissions:` block. `contents: write` and `pull-requests: write` already
  cover listing PRs and force-pushing a branch.
- What gets copied. The copied surface and the customised-caller guard (flow-0076) stay as they
  are.
- Deleting branches, or closing PRs. A closed PR stays closed; the new PR is a new PR.

## Acceptance criteria

- [ ] Given no sync branch, when the decision subcommand runs, then it prints `create`.
- [ ] Given the branch exists and no open PR (the Nudge#286 case), when it runs, then it prints
      `rebuild`.
- [ ] Given the branch exists with an open PR whose head records a different canonical SHA, or no
      `Canonical-SHA` trailer, when it runs, then it prints `refresh`.
- [ ] Given the branch exists with an open PR whose head records the same canonical SHA, when it
      runs, then it prints `noop`.
- [ ] Given `_flow-sync.yml`, when it is parsed, then the branch-existence check no longer exits 0
      on its own. The workflow calls the decision subcommand with the open-PR fact taken from
      `gh pr list ... --state open`, and acts on each of the four verdicts.
- [ ] Given `_flow-sync.yml`, then every force-push in it uses `--force-with-lease` and targets
      only the `$BRANCH` computed by `flow-sync.mjs branch`.
- [ ] Given `_flow-sync.yml`, then the sync commit carries a `Canonical-SHA:` trailer, and no log
      line claims a PR is open except on the path where the open-PR lookup returned one.
- [ ] Given a failed open-PR lookup, when the workflow runs, then it fails with an error naming
      the lookup, rather than choosing a verdict.
- [ ] Given `changes/flow-0075.md`, then it exists and describes the fix.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Workflow-structure criteria follow `.flow/bin/sync-surface.test.mjs` and
  `.flow/bin/sync-permissions.test.mjs`. Parse the YAML with the `yaml` package, keep their
  skip-when-`yaml`-is-absent guard, and prove each assertion fails against a mutated copy.
- flow-0076 also edits `_flow-sync.yml` and `flow-sync.mjs`. They are not parallel-safe; whichever
  is claimed second rebases onto the first.
- PR body: say that adopting repos pick this up on their next sync. Nudge's stale `flow-sync/2.0.0`
  was already deleted by hand, so nothing in the fleet needs clean-up.
