---
id: "flow-0231"
title: "Run Flow builds from one dispatcher on the ci-3 server, so a new repo needs no routine or secret setup"
status: "proposed"
priority: 2
project: "flow"
owner: ""
created: "2026-11-18"
started: ""
branch: ""
pr: ""
issue: ""
intent: "model-work-off-github-actions"
serves: ["G9"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: ""
accepted_at: ""
accepted_via: ""
touches:
  - "dispatcher/**"
  - "docs/flow-dispatcher.md"
  - "docs/flow-routines.md"
  - "docs/flow-reusable-workflows.md"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.flow/config.yml"
  - "project-template/.flow/bin/flow-dispatch.mjs"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-dispatch*.test.mjs"
  - ".flow/bin/dispatcher*.test.mjs"
  - ".flow/bin/protocol-routine-handoff.test.mjs"
  - ".flow/bin/flow-dispatch-workflow.test.mjs"
  - ".flow/config.yml"
  - "package.json"
  - "changes/flow-0231.md"
labels: [infra, dispatch, cost]
model: "opus"
effort: "high"
model_reason: "Flow infra that every adopting repo will rely on, with credential handling, concurrency caps and a container boundary. Cross-cutting, and the design has open points a worker must settle against evidence."
notes:
  - "2026-11-18: Written from the design thread Dan approved (he chose 'Yes, write the task'). The design is decided; the three things marked 'inferred' there are listed under 'Check these first' and are not decided."
asks:
  - "follow-up: After the pilot build passes (rollout step 4), a second task removes the per-repo dispatch (the caller workflows, `_flow-dispatch.yml`, `flow-dispatch.mjs`) through `flow-sync`'s retired-path list and cuts a release. It is deliberately not part of this task, so a failed pilot does not leave the fleet with no way to start builds."
  - "fyi: The daily build cap defaults to 10. That number is a guess. Dan sets the real one in the dispatcher's settings on ci-3."
  - "fyi: The worker container holds Dan's Claude token, so any code a build runs can read it. This is accepted in the design, with the token revocable on claude.ai. The task limits the damage (one token, one repo, container deleted after) but cannot remove it."
---

## Context

Today a Flow build starts when a per-repo workflow, `flow-dispatch`, posts to a Claude Code routine. Each routine only reaches the repos someone attached to it by hand in the claude.ai web page, and there is no API to attach one. Dan creates new repos all the time, so some repo will always be missed, and its ready tasks will sit unbuilt without any error. Dan's rule (2026-11-18): **a new repo that adopts Flow must need zero secret, setting, routine or script setup.**

Other facts behind this task:

- A Claude cloud session cannot clone a private repo it was not attached to. Tested on 2026-11-18.
- Routine builds run on Dan's Max plan, and that is what he wants to keep. No API key, no per-token bill.
- Every Flow task names the model that must build it. A per-tier routine per repo is how that was enforced, and it is also what makes setup heavy.
- Private repo names and task ids must not appear in flow's public Actions logs. The per-repo dispatch workflow runs in each repo, but anything shared through flow must not leak them.

Design (approved by Dan, summarised here so this file stands alone):

```
GitHub App on "All repositories"  ->  every new repo is visible with no step
ci-3 dispatcher, every ~2 minutes:
   git fetch each repo  ->  pick-task + task-model (existing Flow logic)
        -> start one worker container  ->  claude -p --model <task's model>
             with: a Claude token, and a GitHub token for that one repo, valid 1 hour
```

Two GitHub tokens are involved, and they must not be confused:

- The **App key** (a private key file). It lives on ci-3, readable only by the dispatcher process. It never enters a worker container.
- An **installation token** is a short-lived token the App key can mint. The dispatcher mints one, scoped to one repo, for each build.

## Check these first

The design marks three points as inferred, not verified. A worker in the cloud cannot reach ci-3, so this task delivers a script, `dispatcher/preflight.sh`, that Dan or a Remote Control session runs on ci-3 (see "Rollout"). The worker builds the dispatcher as specified below, and the preflight is what tells us whether the assumptions hold.

| # | Assumption | What the preflight does |
|---|---|---|
| 1 | `claude -p --model <full model id>` works with a token from `claude setup-token`. Anthropic's GitHub Actions setup passes `--model` this way but no document says so directly. | Runs one trivial `claude -p --model <id>` call for each tier in `task-model.mjs`, using the real token, and prints the model the reply reports. |
| 2 | ci-3 has room for 2 builds beside the CI runners that already live there. Unknown today. | Prints CPU count, free memory and free disk, runs the repo-independent part of the worker image (install, build) under the container limits, and passes only if memory stays under the container limit and the CI runners' own jobs are not starved (load average stays under the configured pause threshold). |
| 3 | Pull requests opened by the App's bot account work with Flow: `flow-status`, `flow-done`, `touches-guard`, the review checks and `flow-kickback` all treat them like any other task PR. | Opens a draft PR from a throwaway branch in a repo Dan names, marks it ready, and prints the checks that ran and the author shown on each. Then closes the PR and deletes the branch. |
| 4 | `git fetch` over HTTPS with an installation token does not count against the App's REST API rate limit. | Reads `GET /rate_limit` before and after 20 fetches and prints the difference. |
| 5 | Docker (or Podman) is installed on ci-3 and can run a container under cgroup limits without giving the container the host socket. | Runs a limited container and prints the limits it actually got. |

If any check fails, `preflight.sh` exits non-zero and names the failing row. That is a result to bring back to Dan, not something to work around inside the dispatcher.

## Scope

All new code lives in canonical and is **not** copied into adopting repos. Adopters get nothing to install.

1. **`dispatcher/dispatcher.mjs` and helpers** (Node, no new dependencies, same rule as the rest of the helpers). One long-running process:
   - Lists the repos the App is installed on, at most once an hour (one API call). Skips any repo with no `.flow/config.yml`.
   - Every 2 minutes (configurable) updates a local mirror of each repo with `git fetch`, using an installation token with read-only contents access. Mint that token once an hour, not per fetch.
   - Reads the freshly fetched `main` of each repo, and picks with Flow's own `pick-task.mjs`, `task-model.mjs` and the repo's own `dispatch.max_in_progress`. Does not re-implement their rules. It runs canonical's pinned copy of those helpers against the repo's checkout (the same store override `flow-dispatch.mjs` already has, `FLOW_DISPATCH_FLOW_DIR`), so a new repo needs no helpers of its own.
   - Starts at most one worker per repo at a time and skips a repo whose in-progress count is at `dispatch.max_in_progress`.
   - Re-reads the task from `main` right before starting, and starts only if it is still `ready`.
   - Writes logs only to ci-3 (a local file or the system journal). It writes nothing to any GitHub Actions log and sends no repo name or task id to any service other than GitHub and Anthropic.
2. **Limits that stop an unattended loop draining Dan's plan.** All are settings on ci-3, not in any repo:
   - At most 2 workers running at once, across all repos.
   - A daily maximum of started builds (default 10, counted over a rolling 24 hours). The count is stored on disk, so a restart does not reset it.
   - A task that was started and not claimed within 15 minutes is not started again for an hour, and never more than twice in 24 hours.
   - When a worker's output shows that Claude's usage limit was reached, stop starting builds for an hour and log why.
   - When ci-3's load average or free memory crosses a configured threshold, start nothing until it clears. This protects the CI runners that share the machine.
3. **`DISPATCH_ONLY_REPOS`, a list on ci-3** (default empty, meaning all installed repos). When set, the dispatcher ignores every repo not on it. This is what makes the pilot safe, and it is one setting in one place, not a per-repo step.
4. **`dispatcher/worker/`** holds the worker container image definition and the entry script. The container:
   - Contains Node, pnpm, git, `gh` and the Claude CLI at a pinned version, plus Postgres 16 installed but stopped (what a routine environment gave). A repo whose gate needs more is a repo whose worker sets the task `blocked` with a reason, as today. Widening the image is a later task.
   - Starts from a fresh checkout of the repo on `main`.
   - Runs `claude -p` with `--model` set to the full model id that `task-model.mjs` returns (never an alias, never a second table of ids), and with the permission prompts turned off. That last choice is acceptable only because of the container limits below, and the docs must say so.
   - Is given the same short prompt a routine uses (the one in `docs/flow-routines.md`, "Setting one up"), plus the task id and repo.
   - Receives exactly two secrets as environment variables: `CLAUDE_CODE_OAUTH_TOKEN` and a one-repo installation token. It never receives the App key, and nothing else from ci-3.
   - Runs as a non-root user, with no Docker socket and no host mounts other than its own scratch space, with CPU and memory limits, and is removed when it ends (`--rm`).
   - Has a hard time limit (default 90 minutes). On the limit it is killed. A claim left behind is cleaned up by the existing `flow-recover`.
5. **`project-template/.flow/bin/flow-dispatch.mjs`**: when a repo's `.flow/config.yml` sets `dispatch.mode: central`, the script skips with `reason=central-dispatcher` and fires nothing. The default (key absent) is today's behaviour. The key is documented in `project-template/.flow/config.yml`, and `flow-doctor` accepts it. This exists only so the pilot repo does not get a build from both paths at once. The second task (see `asks`) removes the whole path.
6. **`dispatcher/preflight.sh`**: the five checks above. One `PASS` or `FAIL` line per check, exits non-zero on any failure. It never prints a token.
7. **Docs**
   - New `docs/flow-dispatcher.md`: what runs where, the settings on ci-3, the caps, how to read the logs, how to revoke (Claude token on claude.ai, App key in GitHub), and the rollout steps below.
   - `docs/flow-routines.md`: add a clear note at the top that central dispatch is replacing routines and points to the new doc. Do not delete the routine instructions; they stay until the retirement task.
   - `docs/flow-reusable-workflows.md`: note that `_flow-dispatch.yml` is superseded by the dispatcher once the retirement task lands. Do not remove its entry.
   - `project-template/.flow/PROTOCOL.md`: where it describes the routine start and the GraphQL fallback, say that a worker started by the dispatcher is not in a Claude cloud session, so GraphQL works and `gh pr create --draft` and `gh pr ready` are used directly. Keep the REST fallback for cloud sessions. Keep every other rule unchanged.
8. **`changes/flow-0231.md`**, saying "No caller action." (Adopters need do nothing, and the new config key is optional.)

### Out of scope

- Removing the per-repo `flow-dispatch` caller, `_flow-dispatch.yml`, `flow-dispatch.mjs`, or any entry in `flow-sync`'s retired-path lists. That is the follow-up task, only after the pilot passes.
- Creating the GitHub App, any token, or any server. Those are Dan's (below). Do not add a server: the Hetzner CI budget is capped at 50 EUR a month and Dan approves any new server himself.
- Moving review, kickback, triage or compass off Actions.
- Windows repos (they stay on GitHub-hosted runners and are not covered).
- Anything that edits `.flow/tasks/` on a branch.

## What Dan does himself

The worker cannot do these. The docs written by this task must list them in this order, with exact click paths and commands.

1. Create a private GitHub App with Repository permissions: Contents, Pull requests, Issues and Workflows set to read and write. Install it on **All repositories**. Download its private key. The App must not be public.
2. Copy the private key to ci-3 and make it readable only by the dispatcher's user.
3. On his Mac, run `claude setup-token` and copy the token to ci-3, readable only by the dispatcher's user. It lasts one year and counts against his Max plan.
4. Put the App id, the installation id, the two secrets' file paths, the caps, and the pilot repo in `DISPATCH_ONLY_REPOS` into the dispatcher's settings on ci-3, and start the dispatcher.
5. Run `dispatcher/preflight.sh` and give the output to the thread.
6. After the switch (not before), delete the four old routine tokens and the routines on claude.ai.

## Rollout

1. **Merge this task's PR.** Nothing changes for any repo: the dispatcher is not running anywhere yet.
2. **Preflight.** Dan runs "What Dan does himself" 1 to 5. Any failing row is brought to a new thread before going on.
3. **Pilot.** Set `DISPATCH_ONLY_REPOS` to one private repo that is low-risk. In that repo, set `dispatch.mode: central` through a normal PR. Write one trivial `haiku` task there and accept it. Watch it end to end and record the result: the task was claimed, a draft PR opened, it was marked ready, the gate and the three review checks ran, `flow-status` moved the task to `in_review`, and the PR author shown is the App's bot. Check the usage cost of the build in claude.ai against what the same task cost in a routine.
4. **Decide.** Only if step 3 is clean does Dan ask for the retirement task and widen `DISPATCH_ONLY_REPOS`. If step 3 shows a problem, per-repo dispatch is untouched and still works.

## Acceptance criteria

Tests are in `.flow/bin/dispatcher*.test.mjs` and `project-template/.flow/bin/flow-dispatch*.test.mjs`. The dispatcher's logic takes its GitHub, git and container calls as injected functions, so tests use fakes and never need ci-3.

- [ ] Given two installed repos, one with a `ready` task and one with no `.flow/config.yml`, when a poll cycle runs, then exactly one worker is started, for the first repo, and none for the second.
- [ ] Given a `ready` task with `model: opus`, when its worker is started, then the Claude command line has `--model` set to the full id `task-model.mjs` returns for `opus`; given no `model`, it is the `sonnet` id. The existing `model-ids` test still passes and no second id table exists.
- [ ] Given 3 repos each with a `ready` task and a limit of 2 concurrent workers, then 2 start and the third starts only after one ends.
- [ ] Given a daily maximum of 3, when 3 builds have started in the last 24 hours, then a fourth does not start, and after the dispatcher restarts with the same state file it still does not start.
- [ ] Given a task that was started and not claimed within 15 minutes, then it is not started again for an hour, and not a third time in 24 hours.
- [ ] Given worker output that reports the usage limit was reached, then nothing starts for an hour and the log line says why.
- [ ] Given load average or free memory past the configured threshold, then no worker starts until it clears.
- [ ] Given `DISPATCH_ONLY_REPOS` names one repo, then no other repo is fetched from or started, and given it is empty every installed repo is considered.
- [ ] Given a poll cycle in which nothing changed, then it makes zero GitHub API calls (only `git fetch`). The repo list is requested at most once an hour, and tokens are minted once an hour for fetching and once per started build. Proved with a counting fake.
- [ ] Given the App key and both tokens set to sentinel strings, when a worker is started and logs are written, then the container's environment contains the Claude token and a one-repo installation token and does not contain the App key, and no sentinel appears in any command-line argument or log line.
- [ ] Given the container specification the dispatcher builds, then it runs as a non-root user, has no Docker socket and no host mount except scratch space, has CPU and memory limits, is removed on exit, and is killed at the time limit.
- [ ] Given a run, then the only log destination is local to ci-3, no file under `.github/workflows/` references the dispatcher, and no repo name or task id is written to a GitHub Actions log.
- [ ] Given `dispatch.mode: central` in a repo's config, then `flow-dispatch.mjs` prints `decision=skipped reason=central-dispatcher` and makes no request to the routine endpoint; given the key absent, today's behaviour is unchanged (existing `flow-dispatch` tests pass untouched).
- [ ] Given `flow-doctor` over a store whose config has `dispatch.mode: central`, then it reports no finding about the key.
- [ ] Given stubbed commands, `dispatcher/preflight.sh` prints one `PASS` or `FAIL` line for each of the five checks, exits non-zero when any fails, and never prints a token value. `bash -n dispatcher/preflight.sh` passes.
- [ ] `docs/flow-dispatcher.md` exists and contains the six steps under "What Dan does himself" in order, the settings and caps, and the revoke steps. `docs/flow-routines.md` points to it. `project-template/.flow/PROTOCOL.md` says GraphQL works for a dispatcher worker and keeps the REST fallback for cloud sessions. Proved by a docs test, and the existing `protocol-routine-handoff` and `protocol-docs` tests pass (updated only where this change requires it).
- [ ] Given this PR, then `_flow-dispatch.yml`, every `flow-dispatch.yml` caller and `flow-sync`'s retired-path lists are unchanged. Proved by a test that pins them.
- [ ] `changes/flow-0231.md` exists and says "No caller action." Proved by `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] All five gate commands pass locally before the first push and coverage stays at or above the floor. If `dispatcher/` is not covered by the existing test and coverage roots, add it to them in this PR; never lower the floor.

## Notes / open questions

- If the preflight cannot be written to cover one of the five rows, say so in the PR description and in a `fyi` ask. Do not drop the row quietly.
- Do not give the worker a way to start a second worker or to read the dispatcher's settings. The container holds two secrets and nothing else.
- Keep the dispatcher's polling and caps independent of any one repo's own files, except `dispatch.max_in_progress`, which `flow-dispatch.mjs` already reads.
