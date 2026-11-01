# Running Flow cheaply

What Flow's GitHub Actions workflows cost an adopting repo, and the three settings that change it.

**TL;DR** — a public repo pays nothing. A private repo that is idle bills **at most 92 Actions minutes a
month** on the template callers (35 when `FLOW_AI` is off), down from about 1,980 before flow-0185.
Most of a PR's bill is the gate and the review checks, not Flow's bookkeeping.

## How GitHub bills

- **Public repos are not billed** for GitHub-hosted runners. Everything below applies to private repos.
- Each **job** that starts a runner is billed, rounded **up to the next whole minute**. A bookkeeping
  job that runs for 8 seconds bills 1 minute.
- A job skipped by its `if:` condition starts no runner and bills nothing. So does an event that no
  workflow listens for.
- The figures are Linux minutes (`ubuntu-latest`). GitHub multiplies Windows and macOS minutes; Flow
  uses neither.

## An idle repo

"Idle" means nothing happens: no push, no PR, no issue, no merge. The only runs left are the ones a
clock starts. `.flow/bin/idle-cost.test.mjs` counts them from the template callers for the worst
30-day month, and fails the gate above 100.

| Workflow | Schedule | Runs a month | Starts a runner when `FLOW_AI` is off? |
|---|---|---|---|
| `flow-dispatch` | daily, `41 6 * * *` | 30 | yes — it fires routines, not models |
| `flow-recover` | daily, `53 5 * * *` | 30 | no — the sweep job is gated on `FLOW_AI` |
| `flow-triage` | weekdays, `0 6 * * 1-5` | 21–22 | no — gated on `FLOW_AI` |
| `flow-compass` | Mondays, `0 7 * * 1` | 4–5 | no — gated on `FLOW_AI` |
| `flow-sync` | Mondays, `27 6 * * 1` | 4–5 | yes |
| `flow-unblock` | none | 0 | — |
| **Total** | | **≤ 92** | **≤ 35 with `FLOW_AI` off** |

`flow-triage` and `flow-compass` also call a model when `FLOW_AI` is on; that is billed to the model
subscription, not to Actions minutes.

### What changed in flow-0185

| Before | After | Idle minutes a month, before → after |
|---|---|---|
| `flow-unblock` hourly, as a backstop | no schedule: it runs when `flow-done` completes, and on `workflow_dispatch` | 720 → 0 |
| `flow-recover` every 3 hours | once a day; the 75-minute stranded-claim threshold is unchanged | 240 → 30 |
| `flow-dispatch` on `workflow_run` of `flow-unblock` and `flow-recover` — after **every** run, changed or not | on `repository_dispatch` `flow-task-state`, which those two send **only after they push a task-file change** | 960 → 0 |

The `repository_dispatch` step is needed because `flow-unblock` and `flow-recover` push with
`GITHUB_TOKEN`, and GitHub starts no workflow from a `GITHUB_TOKEN` push. `repository_dispatch` and
`workflow_dispatch` are the two events a `GITHUB_TOKEN` call *does* start workflows from, and
`repository_dispatch` needs only `contents: write`, which both workflows already hold. So a task they
return to `ready` is still dispatched in the same chain, not at the next daily run.

Two consequences of the new triggers:

- A **block written after its dependency already landed** is no longer released within the hour. It
  is released at the next `flow-done` run, or when someone runs `flow-unblock` by hand
  (`gh workflow run flow-unblock`).
- A **stranded claim** waits up to a day to be reset, not up to 3 hours.

## One PR

A worker claims a task, pushes, marks the PR ready, and a human merges it. Each row is a job that starts
a runner. "Bookkeeping" rows take seconds and bill 1 minute each. The gate and review rows bill for as
long as they run.

| When | Workflow → job | Runner jobs | Kind |
|---|---|---|---|
| the claim is pushed to `main` | `flow-dispatch` → `dispatch` | 1 | bookkeeping |
| each push to the task branch | `flow-open-pr` → `open-pr` | 1 per push | bookkeeping |
| draft PR opened | `flow-status` → `sync-status` | 1 | bookkeeping |
| PR marked ready, and each later push | `flow-gates` → `gate`, plus one job per extra `source_roots` entry | 1 or more per event | the repo's own build, lint, test and coverage |
| PR marked ready, and each later push | `flow-review` → `plan`, `qa`, `code-review`, `security` (conditional jobs skip) | 4 or more per event | model review, minutes each |
| a `flow-review` run fails | `flow-kickback` → `plan`, then the fix round's jobs when `review.auto_fix_rounds` is set | 1 or more per failed run | bookkeeping, then model work |
| PR marked ready | `flow-status` → `sync-status` | 1 | bookkeeping |
| PR merged | `flow-status`, `flow-done` → `mark-done`, then `flow-unblock` → `sweep` | 3 | bookkeeping |
| `flow-unblock` released a task | `flow-dispatch` → `dispatch` | 1, only then | bookkeeping |

For a PR with three pushes and a review that passes first time, the bookkeeping is 9 billed minutes. The gate
and the review checks are the rest of the bill, and they scale with the repo's test suite and the size
of the diff. flow-0136 already cancels a superseded gate run and skips drafts.

## Pointing `FLOW_RUNNER` at a cheaper runner

Every template caller passes `runner: ${{ vars.FLOW_RUNNER || 'ubuntu-latest' }}`, so one repo
variable moves every Flow job to another runner, and the choice survives a sync:

```
gh variable set FLOW_RUNNER -b <runner-label>      # a third-party or self-hosted runner label
gh variable delete FLOW_RUNNER                     # back to ubuntu-latest
```

- **Self-hosted** runners bill no Actions minutes. You pay for the machine instead.
- **Third-party hosted runners** bill at their own per-minute rate, often below GitHub's.
- **Private repos only.** On a public repo there is nothing to save, and a non-GitHub runner would run
  fork-PR code on a machine you do not control.
- **Secrets.** A non-GitHub runner sees every secret its jobs hold — `FLOW_PAT`,
  `CLAUDE_CODE_OAUTH_TOKEN`, the `FLOW_ROUTINE_*_TOKEN`s. Choosing the runner is choosing to trust its
  provider with them.

The full rules are in [`flow-reusable-workflows.md`](flow-reusable-workflows.md#choosing-the-runner-flow_runner-flow-0149).

## A repo with a customised caller

`flow-sync` replaces the template callers. It leaves a caller with jobs of its own untouched (the
customised-caller guard, flow-0076), so such a repo keeps the old triggers until someone edits it:

- `flow-unblock.yml`: delete the `schedule:` block (`17 * * * *`).
- `flow-recover.yml`: change `0 */3 * * *` to a once-a-day cron.
- `flow-dispatch.yml`: replace the `workflow_run:` block on `flow-unblock`/`flow-recover` with
  `repository_dispatch: types: [flow-task-state]`.
