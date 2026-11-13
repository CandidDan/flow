# ADR-0011: Where task state is committed: `main`, `main` with `[skip ci]`, or a `flow-state` branch

**Status:** Proposed. Dan decides; accepted when this PR merges with an option chosen.
**Date:** 2026-11-13
**Deciders:** Dan (sole maintainer)
**Related:** ADR-0001 (task store is repo files on `main`), flow-0223 (minimal CI for store-only
PRs, and a flow-doctor warning for unfiltered push-to-`main` workflows), tanplan-0395 (tanplan's
`e2e.yml` stops running on task commits)

## Context

Every change to a task (create, claim, block, status sync, done, recover) is a commit pushed to
`main`. ADR-0001 chose this because `main` gives a safe claim: two workers who claim the same task
edit the same file, the second push is refused as non-fast-forward, and the loser knows at once.

The cost is that every push-to-`main` workflow in every adopting repo also runs on these commits,
unless someone remembered to give it a path filter. Nobody remembers reliably. It has been missed
three times:

1. Canonical's own `ci.yml`, `plane-guard.yml` and `release-tag.yml` run on every task commit (the
   most frequent run type in canonical in the week of 2026-11-09).
2. tanplan's `brand-ratchet.yml` had no filter until tanplan-0320.
3. tanplan's `e2e.yml` runs the full browser suites (up to 45 minutes) on every push to `main`.
   Since 2026-11-12, 53 of its 73 runs were task commits. On 2026-11-13 they made up most of a
   76-job backlog on the Hetzner runners, and Flow's own status syncs queued behind them for over
   two hours.

The filter also leaks into places that are not workflows. Vercel needs `only-flow-changed.mjs` to
skip a build for a task commit. tanplan's release script has to step over task commits to find a
deployed build (`findBuild`, tanplan-0271), and tanplan-0395 adds the same step-over for e2e runs.
Each is code whose only job is to undo the fact that task state shares a branch with code.

Dan, 2026-11-13: "tasks should not be running e2e tests that is ridiculous. maybe flow committing
to main in github is wrong", and "tasks, intents, research should have minimal ci".

### What has to keep working, whatever is chosen

- **First-push-wins claims.** A claim, and a new task id (`allocate-task-id.mjs`), are settled by
  git refusing the second push. Any option must keep that.
- **Code and state never merge into each other.** A PR may not edit `.flow/tasks/` (the
  store-guard), because a branch carries a stale copy of the task.
- **Intents are approved by merging a PR.** They are reviewed content, not mutable state, and stay
  on `main` in every option below. Workstreams are written the same way and also stay.
- **Readers**: `flow-state.mjs` (including `--json`), `pick-task.mjs`, `flow-dispatch.mjs`,
  `touches-guard.mjs`, `pr-of-record.mjs`, `flow-doctor.mjs`, and inflight, which reads task files
  through the GitHub API.
- **Writers**: workers (claim, block, notes), `allocate-task-id.mjs`, and the reusable workflows
  `_flow-status.yml`, `_flow-done.yml`, `_flow-recover.yml`, `_flow-unblock.yml`.

## Options

### Option A: Keep `main`, and enforce path filters

Keep everything as it is. Make the filter impossible to forget:

- flow-0223: flow-doctor warns about any push-to-`main` workflow without a filter that excludes
  `.flow/tasks/**`. After one release, raise it from a warning to a failure.
- The template ships every caller already filtered.
- Each repo keeps its own skip logic for deploys and releases (`only-flow-changed.mjs`,
  `findBuild`, tanplan-0395's e2e step-over).

| | |
|---|---|
| Breaking change | No |
| Claim safety | Unchanged |
| Stops wasted runs | Only for workflows the doctor can read. A deploy hook, a third-party app (Vercel, Netlify, Render) or a release script is invisible to it. |
| Ongoing cost | Every new workflow, deploy hook and release script still has to know about task commits |

### Option B: Keep `main`, and mark every state commit `[skip ci]`

GitHub Actions does not start `push` workflows when the head commit's message contains
`[skip ci]` (or `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`). So every state commit
Flow writes carries `[skip ci]` in its message, and no adopter workflow runs on it, filtered or not.

What changes:

- `allocate-task-id.mjs`, the claim and block commits in the protocol, and the four state-writing
  reusables add `[skip ci]` to their commit messages. One place each, all in canonical.
- `flow-dispatch` today starts on `push` to `main` with `paths: .flow/tasks/**`. `[skip ci]` would
  stop that too. It already has a second trigger, `repository_dispatch: flow-task-state`, which
  flow-recover and flow-unblock send. The other writers send it as well.
- `plane-guard.yml` runs on push to `main` and would no longer see state commits. It moves to a
  schedule that audits the range since its last run.
- flow-0223's doctor warning stays as a backstop for state commits a human writes without the token.

| | |
|---|---|
| Breaking change | No. MINOR. Adopters get it at the next sync. |
| Claim safety | Unchanged: still a push to `main` |
| Stops wasted runs | All GitHub Actions push workflows, in every repo, with no per-workflow edit |
| Does not stop | Vercel, Netlify and Render deploy hooks (they ignore `[skip ci]` or need their own setting), so `only-flow-changed.mjs` and `findBuild` stay. A push that ends in a code commit after a state commit runs normally, which is correct. |
| Weak point | It depends on every writer adding the token. A worker or a human who writes a state commit by hand without it triggers everything, as today. The doctor warning and filtered template callers limit the damage. |

### Option C: Move task state to a `flow-state` branch

`.flow/tasks/` lives only on a long-lived branch, `flow-state`, that holds nothing else. `main`
holds code, intents and workstreams.

- **Claims stay atomic.** First-push-wins is a property of pushing to any branch, not of `main`.
  A claim is a push to `flow-state`; the second claimant is refused exactly as today.
- **Adopters' workflows stop firing on state commits**, because none of them listen to
  `flow-state`. Deploy hooks never see them either. `only-flow-changed.mjs`, `findBuild`'s
  step-over and tanplan-0395's e2e step-over become unnecessary.
- **The store-guard becomes trivial:** `main` has no `.flow/tasks/`, so a PR adding one is wrong.

What has to change:

| Component | Change |
|---|---|
| `_flow-status.yml`, `_flow-done.yml`, `_flow-recover.yml`, `_flow-unblock.yml` | Check out and push `flow-state` instead of `main` |
| `flow-dispatch.yml` (template) | Trigger on `push` to `flow-state` instead of `main` + `paths` |
| `pick-task.mjs`, `flow-state.mjs` (and `--json`), `flow-dispatch.mjs`, `touches-guard.mjs`, `pr-of-record.mjs`, `flow-doctor.mjs`, `allocate-task-id.mjs` | Read and write `origin/flow-state` instead of `origin/main`. One config key, `store.branch` (default `main`), so each repo moves on its own date |
| Worker protocol | The worker claims on `flow-state` and builds on a code branch from `main`. It needs the task file from one branch and code from the other: a second worktree, or a plumbing commit that never checks `flow-state` out |
| inflight | Reads tasks from ref `flow-state` through the API. Links to task files gain `?ref=flow-state` |
| Branch protection | `flow-state` allows pushes from workers and `FLOW_PAT`, with no required checks |

Migration, per repo, as a MAJOR release (Flow 6.0): freeze claims; create `flow-state` from
`main`'s `.flow/tasks/`; set `store.branch: flow-state`; one PR deletes `.flow/tasks/` from
`main`; sync; unfreeze. Every adopter (canonical, tanplan, mapd, inflight, password-generator,
write, Nudge, progress) does this once, and a repo that syncs the 6.0 helpers without migrating
must fail loudly rather than read an empty store.

| | |
|---|---|
| Breaking change | Yes. MAJOR, a migration in every repo, and an inflight change |
| Claim safety | Unchanged |
| Stops wasted runs | All of them, including deploy hooks, with nothing for any writer to remember |
| Ongoing cost | Two branches to reason about; task history no longer sits beside the code history in `git log main`; tasks are not visible when browsing the default branch on GitHub |

### Rejected: tasks as GitHub Issues

ADR-0001 weighed this and rejected it: the gate would need API auth, and the atomic claim is lost.
Nothing here changes that.

## Recommendation

**Option B now, and Option C only if B leaks.** Confidence: medium.

B fixes the problem Dan named (CI on task commits) in every repo at once, as a MINOR change made
only in canonical, with no migration. Its one weakness is that it relies on writers adding a token,
but almost every state commit is written by Flow's own helpers and workflows, which canonical
controls. The few written by hand are caught by the doctor warning from flow-0223.

C is the cleaner end state. It removes the problem rather than suppressing it, and it would let
`only-flow-changed.mjs` and two release step-overs be deleted. But it is a breaking migration
across eight repos and inflight, done to save runs that B also saves. The extra it buys over B is
deploy hooks and release scripts, which already work.

What would change this recommendation:

- State commits without `[skip ci]` keep appearing after B ships (count them for two weeks with
  plane-guard's scheduled audit). Then the token is not enough and C is worth its migration.
- Dan wants the deploy and release step-over code gone, not just CI quiet. Then C.
- GitHub changes or removes `[skip ci]` handling. Then C.

The strongest argument against B: it treats the symptom. Task state on `main` still interleaves
with code, still needs `only-flow-changed.mjs` for deploys, and the next kind of integration
(a deploy host, a bot) will need to learn about task commits again.

## Consequences

If B is chosen: a canonical task adds `[skip ci]` to every Flow-written state commit, sends
`flow-task-state` from every state-writing reusable, and moves plane-guard to a schedule. flow-0223
and tanplan-0395 still land (PR minimal CI, and e2e's own skip as defence in depth).

If C is chosen: a canonical task adds `store.branch` and moves each reader and writer listed
above; then one migration task per adopting repo; then an inflight task. flow-0223's push-to-`main`
doctor warning becomes moot once every repo has moved, and should be removed then.

If A is chosen: flow-0223's warning is raised to a failure after one release. Nothing else.
