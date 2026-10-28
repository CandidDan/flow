# Running the Flow worker as a Claude Code routine

**TL;DR** — the worker loop runs as a Claude Code **cloud routine**: no Actions minutes, usage on
the Max plan. One routine per model tier, no connectors, a three-line saved prompt that defers to
`.flow/PROTOCOL.md`. The only protocol difference is that GraphQL is blocked, so the PR is opened
and handed off through REST (steps 7 and 8 of *The loop you run*).

Why: `.flow/intents/model-work-off-github-actions.md`. `flow-queue-runner` was a paid Actions
runner mostly waiting on Claude.

```
trigger (text = task id, or empty)
  └─ routine for the task's tier ──► fresh cloud session on the repo
       └─ CLAUDE.md → .flow/PROTOCOL.md → the loop
            claim on main · branch · gate · PR via REST · ccr/ready_for_review
```

## The environment

What the canary ran in, and what a routine gets by default:

| | |
|---|---|
| Host | Anthropic cloud, Ubuntu |
| Toolchain | Node and pnpm present; `gh` authenticated to the repo |
| Postgres | 16, installed but **stopped**. A repo whose gate needs it starts it with `service postgresql start` |
| GitHub | REST works; **GraphQL is blocked** (HTTP 403, "GitHub GraphQL is not available from Claude Code sessions") |

## Setting one up

1. **One routine per model tier the repo uses.** A routine runs on one model, so a repo whose
   tasks use `sonnet` and `opus` gets two routines, each created with that tier's model:

   | Tier (`model:` in the task) | Create the routine with |
   |---|---|
   | `haiku` | Haiku |
   | `sonnet` (the default when a task sets none) | Sonnet |
   | `opus` | Opus |
   | `fable` | Fable |

   `.flow/bin/task-model.mjs` is the one table from tier to model ID; use the ID it names. Name
   each routine `flow-worker-<repo>-<tier>` so a trigger can find it.

2. **Attach no connectors.** A routine created through the API attaches every claude.ai connector
   on the account by default — the canary's had 22, including Stripe and Gmail. The worker needs
   only the repo. Remove them all; a worker holding a payments or mail connector it never uses is
   pure blast radius.

3. **Point it at the repo**, default branch `main`.

4. **Save this prompt, verbatim.** It is short on purpose: the instructions live in the synced
   protocol, so a protocol change reaches every routine at the next `flow-sync`, with no routine
   to edit.

   ```text
   You are the Flow worker for this repository. Read CLAUDE.md, then .flow/PROTOCOL.md in full, and run "The loop you run" for exactly one task, then stop.
   The task id is the text this run was triggered with. If that text is empty, pick with `node .flow/bin/pick-task.mjs`; an empty result means stop.
   GraphQL is blocked in this session: follow the protocol's REST fallback for opening the PR (step 7) and handing it off (step 8).
   ```

5. **Trigger it** with the task id as the trigger's text, or on a schedule with empty text so it
   picks the top `ready` task.

## Firing a routine from an app

An app (inflight's "Work this →", say) starts a run by calling the routine's API trigger:

```sh
curl -X POST "https://api.anthropic.com/v1/claude_code/routines/<trigger-id>/fire" \
  -H "Authorization: Bearer $ROUTINE_TOKEN" \
  -H "anthropic-version: 2026-10-21" \
  -H "Content-Type: application/json" \
  -d '{"text": "<task-id>"}'
```

- Create the trigger in the claude.ai routines UI: Edit → Trigger "+" → API → Generate token.
  **The token is shown once**: store it as a secret right away; if lost, regenerate it.
- The call returns once the session is created, with `claude_code_session_id` and
  `claude_code_session_url`. It does not wait for the run.
- `text` is optional and is the task id. Empty means the worker picks with `pick-task.mjs`, which
  the saved prompt above already handles.
- The `anthropic-version` header is from Anthropic's "Trigger a routine through the API" doc
  (platform.claude.com/docs/en/api/claude-code/routines-fire). It is **not yet exercised by a
  Flow run**.

## Limits that matter

| Limit | Value | Consequence |
|---|---|---|
| Schedule | no more often than **hourly** | a scheduled routine picks at most one task an hour; use a trigger for anything faster |
| Runs | **30 runs an hour** per routine | at most 30 tasks started per tier per hour |
| Billing | usage drawn from the **Max plan** | no Actions minutes; a routine never touches the Actions budget |
| Account | **100 API fires and 100 scheduled runs an hour** per account, across every routine | the per-routine limit above is not the only ceiling; many routines share these two |
| Shared usage | routine usage is **shared with interactive sessions** on the same Max subscription | heavy routine use leaves less for hands-on work |

### Auto-mode stalls

A routine starts in **auto mode**, and repeated classifier blocks can stop an unattended run to
wait for a human. The 2026-10-28 canary did not hit one, but that risk is **untested on a task
that has to set itself `blocked`**: the block is a commit to `main` the classifier may refuse.
Treat a routine run that ends without a PR or a `blocked` task as possibly stalled.

## The canary's evidence

2026-10-28, `CandidDan/tanplan-platform`, task tanplan-0178, PR #221, about 11 minutes:

| Step | Result |
|---|---|
| claim pushed to `main` | accepted |
| push of a `flow/` branch | accepted |
| gate (build, lint, test, coverage) | all pass, inside the session |
| `gh pr create` | **HTTP 403**: GraphQL blocked |
| `gh api repos/{owner}/{repo}/pulls …` | **worked**, PR opened non-draft |
| `POST …/pulls/{n}/ccr/ready_for_review` | advertised by the 403 text; **not yet exercised** — the first routine-run task proves it |

## What a routine does not change

`flow-open-pr`, `flow-status` and the draft-first design are untouched: a routine's first push
still gets a draft PR from `flow-open-pr`, and marking it ready is still what moves the task to
`in_review`. Review, kickback, triage and compass are not moved by this doc.
