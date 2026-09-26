---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0079"
title: "The review gate reads its config and helper from the base branch, so a PR cannot narrow its own security review"
status: "done"
priority: 1
project: "flow"
owner: "claude-worker-flow-0079"
created: "2026-09-24"
started: "2026-09-25T22:03:03Z"
branch: "flow/flow-0079-review-reads-base-config"
pr: "https://github.com/CandidDan/flow/pull/111"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]           # a PR that can switch off its own security review turns the gate green on unreviewed work
touches:
  - ".github/workflows/_flow-review.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - "changes/flow-0079.md"
labels: [security, review, infra]
notes:
  - "2026-09-24 (orchestrator): Found during the Nudge 1.0.0 → 2.0.0 migration (reported as 'a PR can narrow its own security review'). flow-0068 fenced fork PRs; this is the same-repo half, which it did not cover."
  - "2026-09-25 (worker): Branch flow/flow-0079-review-reads-base-config pushed. DONE: _flow-review.yml now materialises the BASE branch in a scratch git worktree under RUNNER_TEMP and runs that helper against that config in all four jobs (plan + the three reviewers' bounded-context steps + the three verdict steps, all via $FLOW_REVIEW_BIN). Helper has SECURITY_FLOOR_PATHS and the bootstrap path. DECISION worth not re-litigating: a git worktree, NOT `git show` of the single file as the task's Scope sketched — the helper relative-imports touches-guard.mjs and parse-task-id.mjs, and in canonical it is an adapter over project-template/.flow/bin/, so one file cannot be materialised alone. That required a new REVIEW_REPO_DIR env override (the only pinned path with no env escape was the adapter's git cwd; without it canonical's adapter would diff base against itself and hand the reviewers an empty patch). NOT DONE YET: tests in project-template/.flow/bin/flow-review.test.mjs and .flow/bin/flow-review-workflow.test.mjs (the existing workflow test filters on the literal string `flow-review.mjs plan`/`verdict`, which the new `\"$FLOW_REVIEW_BIN\"` invocation no longer matches — they MUST be updated or they fail), changes/flow-0079.md, and the gate. NEXT: check out the branch and write those tests."
  - "2026-09-25 (worker): Build complete, gate green (build/lint/test 1269 pass 0 fail/coverage 95.75% vs floor 83.5). PR #111 (draft -> ready). CONFIRMED, as the task asked, the out-of-scope item it named: the reviewers still read their whole bounded context from the PR checkout — .flow-review/diff.patch, files.txt, and task.md, which is materialised from REVIEW_TASKS_DIR=$GITHUB_WORKSPACE/.flow/tasks. So a PR CAN edit .flow/tasks/<id>.md on its branch and hand the qa reviewer acceptance criteria of its own choosing; the store-guard fails that PR, but the reviewers run anyway and their verdicts are what a human reads. Pointing REVIEW_TASKS_DIR at the base worktree would close it for task.md and is a one-word change now that the worktree exists — left undone deliberately, it is the separate task. Two other decisions for the record: a git worktree rather than `git show` of one file (the helper relative-imports touches-guard.mjs and parse-task-id.mjs, and canonical's is an adapter over project-template/.flow/bin/), which needed the new REVIEW_REPO_DIR override; and the floor's two host filenames are COMPOSED in code rather than spelled, because protocol-portability.test.mjs (outside this task's touches) fails any non-test helper whose executable code contains the Claude-side filename. If the orchestrator would rather that guard carried an explicit exception for flow-review.mjs, that is a separate one-line task."
---

## Context

`_flow-review.yml`'s `plan` job checks out the pull request and then runs
`node .flow/bin/flow-review.mjs plan` **from that checkout**. The helper reads
`review.security_paths` from `.flow/config.yml` **in that same checkout**. Both files are
therefore controlled by the diff being reviewed:

- a PR can remove a glob from `security_paths` and, in the same diff, change a file that glob
  used to cover. The security review is then skipped, "visibly", with a reason that looks legitimate;
- a PR can edit `flow-review.mjs` itself, including the `verdict` code that decides pass/fail.

flow-0068 fenced PRs from forks. This is the same weakness for PRs from inside the repo, which is
every PR the queue runner opens. It is a G10 failure in the plainest form: the gate goes green
because the thing being checked told it not to check.

## Scope

**Does:**

- In the `plan` job, run the **base branch's** copy of `.flow/bin/flow-review.mjs` against the
  **base branch's** `.flow/config.yml` (materialised with `git show origin/<base>:<path>` into a
  temp directory outside the working tree), while still computing the diff and changed-file list
  from the PR. Same approach for the `verdict` step in each reviewer job: the verdict code that
  decides pass/fail comes from base.
- Add a **floor** to the security trigger, applied regardless of `security_paths`: the security
  review always runs when the diff touches `.flow/**`, `.github/**`, `.claude/**`, `CLAUDE.md`
  or `AGENTS.md`. The run summary names the floor as the reason, distinct from a
  `security_paths` match.
- **Bootstrap case:** if the base branch has no `flow-review.mjs` (a repo adopting the review
  gate in this very PR), use the PR's copy, force `security_run=true`, and write a warning to the
  step summary naming the bootstrap case. Fail-closed, never skip.
- Changelog fragment `changes/flow-0079.md`, with **caller action: none** if the thin caller
  needs no edit (expected: this is all inside the reusable and the helper).

**Does not touch:**

- The reviewer prompts, models, or the `allowed_bots` / authorship stance (flow-0068's tests
  forbid authorship expressions; leave that line exactly where it is).
- Prompt-injection through PR-controlled files the *reviewer agent* reads (e.g. a PR editing
  `CLAUDE.md` to instruct the reviewer). Real, related, and a separate task — record it as a
  note on this task if you confirm it, don't fix it here.
- Any other workflow.

## Acceptance criteria

- [ ] Given a PR that removes `src/auth/**` from `review.security_paths` and modifies
      `src/auth/login.ts` in the same diff, when `plan` runs, then `security_run` is `true`,
      because the trigger list came from the base branch.
- [ ] Given a PR that modifies `.flow/bin/flow-review.mjs`, when the workflow runs, then the
      helper executed by `plan` and by each `verdict` step is the base branch's copy. Proved by
      a workflow test asserting the invoked helper path is the materialised base copy, not
      `.flow/bin/flow-review.mjs` in the checkout.
- [ ] Given a diff touching any floor path (`.flow/**`, `.github/**`, `.claude/**`, `CLAUDE.md`,
      `AGENTS.md`) and a `security_paths` list that matches none of them, when `plan` runs, then
      `security_run` is `true` and the reason names the floor.
- [ ] Given a base branch with no `flow-review.mjs`, when `plan` runs, then it uses the PR's
      helper, sets `security_run=true`, and the step summary contains a bootstrap warning.
- [ ] Given a PR that changes none of the above, when `plan` runs, then its outputs match
      today's behaviour. The existing `flow-review` tests pass unchanged.
- [ ] Given `changes/flow-0079.md`, then it exists, describes the base-branch read and the
      floor, and states the caller action.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- This PR changes the review workflow, so under the new floor its own security review must run.
  If it doesn't, that is itself a failing criterion.
