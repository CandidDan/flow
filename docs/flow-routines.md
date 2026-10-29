# Running the Flow worker as a Claude Code routine

**TL;DR** — the worker loop runs as a Claude Code **cloud routine**: no Actions minutes, usage on
the Max plan. One routine per model tier, no connectors, a three-line saved prompt that defers to
`.flow/PROTOCOL.md`. The only protocol difference is that GraphQL is blocked, so the PR is opened
and handed off through REST (steps 7 and 8 of *The loop you run*).

Why: `.flow/intents/model-work-off-github-actions.md`. `flow-queue-runner` was a paid Actions
runner mostly waiting on Claude; flow-0174 retired it fleet-wide, and flow-sync deletes its caller.
A failed attempt still moves a task up a model tier: flow-recover does it when it resets a stranded
claim that pushed nothing.

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
   picks the top `ready` task. `flow-dispatch` does the first for you once the trigger is wired
   (*Wiring the trigger*, below).

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

## Wiring the trigger

`flow-dispatch` (flow-0182) is what fires these routines. It is a thin caller that `flow-sync`
delivers, `.github/workflows/flow-dispatch.yml`, and it runs:

| When | Why |
|---|---|
| a push to `.flow/tasks/**` on `main` | a task allocated `ready`, a claim, a human's edit |
| `flow-unblock` or `flow-recover` completes | they push with `GITHUB_TOKEN`, which starts no other workflow, so a task they release or reset would otherwise be missed |
| once a day | the sweep, for a missed event |
| `workflow_dispatch` | on demand |

Each run fires **at most one** task, and none while `dispatch.max_in_progress` tasks
(`.flow/config.yml`, default 3) are `in_progress`:

```
count in_progress ─► at cap? ─yes─► skipped reason=at-capacity
      │ no
pick-task ─► nothing? ─yes─► skipped reason=nothing-ready
      │
task-model tier ─► routine set? ─no─► skipped reason=no-routine-for-<tier>   (exit 0)
      │
re-read task on main ─► still ready? ─no─► skipped reason=no-longer-ready
      │
POST …/routines/<id>/fire {"text": "<task-id>"} ─► 2xx: fired · else: failed (exit 1)
```

The worker's claim is a push to `.flow/tasks/`, so it starts the next run: that chain is how work
fans out, and the cap is what ends it. The run's log has exactly one
`flow-dispatch: decision=…` line.

**Per tier the repo uses** (one routine each, see *Setting one up*):

1. In the routine: Edit → Trigger "+" → API → Generate token. The token is shown once.
2. Store the token as the repo **secret** `FLOW_ROUTINE_<TIER>_TOKEN`, e.g.
   `FLOW_ROUTINE_SONNET_TOKEN`.
3. Store the trigger id (the `<trigger-id>` in the fire URL) as the repo **variable**
   `FLOW_ROUTINE_<TIER>_ID`, e.g. `FLOW_ROUTINE_SONNET_ID`.

`<TIER>` is `HAIKU`, `SONNET`, `OPUS` or `FABLE`. A tier with no variable or no secret is skipped
with a visible line and a green run, so set up only the tiers your tasks use. The token reaches the
job only through `secrets:` and a step's `env:`, and the helper never prints it.

The task's `model:` only chooses which trigger is fired. The model that runs is the one that tier's
routine was created with, so create each routine on its own tier's model.

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
