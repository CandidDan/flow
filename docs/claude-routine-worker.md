# Working Flow tasks from a Claude Code routine

> **Research preview.** Routines are a research-preview feature and may change. Reference:
> <https://code.claude.com/docs/en/routines.md>.

A Claude Code **routine** is a cloud session that runs on a cron (at most hourly) or is fired on
demand over HTTP. It draws on the subscription's usage, not API credits and not GitHub Actions
minutes, which makes it a cheaper host for the queue-runner's worker. It runs on an Ubuntu VM with
Node, pnpm, Docker and PostgreSQL 16 (installed, but not started).

This document is the runbook. It does not create a routine — that is done in the claude.ai UI. It
pairs with the `worker.host: claude-routine` setting; this doc does not depend on that landing.

> **Not yet proven.** Three behaviours are unconfirmed (see [Canary checklist](#canary-checklist)).
> Run the canary on a throwaway repo before any real repo relies on a routine.

## The routine prompt

Paste this as the routine's prompt:

```text
You are the Flow worker for ONE task. Read .flow/PROTOCOL.md (the protocol) first and follow it.

Which task:
- If this run was fired with text naming a task id (e.g. "flow-0171"), work that task.
- Otherwise run `node .flow/bin/pick-task.mjs`. It prints the id of the top eligible ready
  task. If it prints nothing, there is no work: say so and stop.

Run the normal loop for that one task, once:
1. CLAIM: git pull --rebase; set the task in_progress with owner and started (full UTC ISO
   datetime, from `date -u +%Y-%m-%dT%H:%M:%SZ`); commit that task file to main and push. If the
   push is rejected, another worker claimed it — stop.
2. BRANCH off latest main: flow/<task-id>-<slug> — unless the session is already on a
   harness-assigned branch (e.g. `claude/…`); then stay on it and do not rename. The
   "[<task-id>]" PR title prefix is what must be right.
3. BUILD strictly against the acceptance criteria and within the task's `touches`.
4. GATE: run the commands in .flow/config.yml (build, lint, test, coverage). All must pass.
   Do not run review subagents; the reviewers are checks on the PR.
5. PR: if a PR already exists for the branch (the first push opens a draft), set its title to
   "[<task-id>] <title>" and its body to the acceptance checklist with the proving test for each
   item, then run `gh pr ready`. Otherwise open it non-draft with that title and body. The PR
   must end ready for review — a draft never gets reviewed. STOP there. Do not merge.

Handle exactly one task per run. Push the branch early, and append a `notes` entry to the task
on main after each substantial step. If a decision is needed that the task did not settle, set
the task blocked with a blocked_reason and stop. Never wait for a human to answer; if you cannot
proceed unattended, block the task and end the run.
```

## Setup

1. Create the routine at <https://claude.ai/code/routines>.
2. Select the repo the routine works.
3. Network access: allow the package registry (npm, or whichever the gate's install command uses)
   and `github.com` / `api.github.com`.
4. Setup script: install dependencies (the repo's install command, e.g. `npm ci`). Where the gate
   needs Postgres, also run `service postgresql start` — it is installed but not running.
5. Paste the [prompt](#the-routine-prompt).
6. Add a **schedule trigger** (hourly at most) and an **API trigger**. The API trigger shows its
   token once; see below.
7. In the repo's `.flow/config.yml`, set `worker.host: claude-routine`.

## Firing from an app

A mission-control app fires the routine on demand:

```sh
curl -X POST "https://api.anthropic.com/v1/claude_code/routines/<trigger-id>/fire" \
  -H "Authorization: Bearer $ROUTINE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "flow-0171"}'
```

- `<trigger-id>` identifies the API trigger; `$ROUTINE_TOKEN` is that trigger's token.
- The body is optional. `text` names the task id to work; omit it and the prompt falls back to
  `pick-task.mjs`.
- **The token is shown once**, when the trigger is created. Store it as a secret immediately
  (a repo or app secret, never in a file); if lost, regenerate it.
- Check the routines doc for any additional required headers (for example a beta or version
  header) while the feature is in preview, and record them here.

## Canary checklist

Run on a throwaway repo with a trivial `ready` task. Record each result in this file under the
line, with the date.

- [ ] **1. Branch prefix.** Pushes default to `claude/`-prefixed branches, where Flow's default is
  `flow/<id>-<slug>`. *Check:* fire the routine; run `git ls-remote --heads origin 'flow/*'
  'claude/*'`. Either prefix is acceptable: on a `claude/…` branch the automation resolves the
  task from the PR title. Pass if the PR title starts with `[<id>]`. *Record:* which prefix the
  routine got, under this line.
- [ ] **2. Unattended PR.** `gh pr create` may fail because the session proxy rejects GraphQL.
  *Check:* confirm the run ends with a PR that is ready for review, not a draft (`gh pr list
  --head <branch> --json isDraft`), and the task is `in_review` on `main`. If `gh pr create`
  fails, test `gh api -X POST repos/<owner>/<repo>/pulls -f title=… -f head=<branch> -f base=main`
  (REST, probably works) and change the prompt's step 5 to use it. *Record:* which form worked.
- [ ] **3. Auto mode stalls.** Auto mode can stop an unattended run to wait for a human. *Check:*
  after the run, confirm the session reached the PR step rather than ending on a pending
  permission or question; repeat with a task that must block. Pass if no run is left waiting.
  *Record:* any prompt it stopped on, and the permission that fixes it.

## Limits and costs

- **30 runs per hour per routine; 100 per hour per account.**
- Usage is **shared with interactive sessions** on the same subscription: heavy routine use
  reduces what is left for hands-on work.
- Schedule triggers fire at most hourly.
- Research preview: behaviour, limits and endpoints may change without notice.
