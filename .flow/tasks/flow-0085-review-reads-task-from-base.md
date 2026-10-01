---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0085"
title: "The reviewers read the task and its acceptance criteria from the base branch, so a PR cannot choose the criteria it is judged against"
status: "done"
priority: 2
project: "flow"
owner: "claude-cowork-orchestrator"
created: "2026-09-27"
started: "2026-09-30T23:34:51Z"
branch: "flow/flow-0085-review-reads-task-from-base"
pr: "https://github.com/CandidDan/flow/pull/144"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # G10: the gate tells the truth. A reviewer grading a PR against criteria the PR wrote is a gate that can be made to lie.
touches:
  - ".github/workflows/_flow-review.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - "changes/flow-0085.md"
labels: [review, security, flow-infra]
notes:
  - "2026-09-27 (orchestrator): From the flow-0079 worker's note (PR #111), confirmed by reading `_flow-review.yml` at bf975de. flow-0079 moved everything that DECIDES the review (helper, config) onto a base-branch worktree, but `REVIEW_TASKS_DIR` still points at `$GITHUB_WORKSPACE/.flow/tasks`, the PR checkout. So a PR can edit `.flow/tasks/<id>.md` on its branch and hand the qa reviewer acceptance criteria of its own choosing. The store-guard fails that PR, but the reviewers still run and post verdicts, and the verdicts are what a human reads."
  - "2026-09-27 (orchestrator): WHY NOW: flow-0082 (auto-fix) is blocked on this. An auto-fix round is a model working to turn a red qa check green; the cheapest way to do that is to edit the criteria. flow-0082's prompt forbids it and store-guard would redden the PR, but that is a prompt plus a separate red check, not a reviewer that never sees the edit. Land this first."
  - "2026-09-27 (orchestrator): the task store lives on `main` by design (store plane), so the base worktree carries the freshest copy of the task anyway. The PR branch's copy is stale by design (see canonical CLAUDE.md), which is a second reason the reviewer should never have read it."
---

## Context

`_flow-review.yml` (flow-0079) materialises the review gate from the base branch: a detached
worktree at `origin/$BASE_BRANCH` under `$RUNNER_TEMP/flow-review-base`, with `FLOW_REVIEW_DIR`
and `FLOW_CONFIG` pointing into it. The same step then writes `REVIEW_REPO_DIR`,
`REVIEW_OUT_DIR` and `REVIEW_TASKS_DIR`, all pointing back at the PR checkout.

`REVIEW_REPO_DIR` and `REVIEW_OUT_DIR` must stay on the PR: the diff and the changed files are what
is being reviewed. `REVIEW_TASKS_DIR` is different. The task file is the *standard* the PR is
judged against, not the thing being judged, and it is read by `flow-review.mjs` to build
`.flow-review/task.md`. Today that standard comes from the PR.

The step appears once per review job (the plan/qa/code-review/security jobs each repeat it).

## Scope

**Does:**

- In every job's "Materialise the review gate from the BASE branch" step, when the base worktree
  is created, write `REVIEW_TASKS_DIR=$base_dir/.flow/tasks`. `REVIEW_REPO_DIR` and
  `REVIEW_OUT_DIR` are unchanged.
- In the **bootstrap** branch (base carries no gate), keep `REVIEW_TASKS_DIR` on the PR checkout.
  There is no independent copy to read, and the step already announces bootstrap loudly.
- Update the header comment of that step so the "everything that DECIDES comes from base"
  sentence names the task file among the things that decide.
- When the task file resolved from the branch/title exists on base, reviewers get base's copy.
  When it exists only on the PR branch, `task.md` carries the existing "NO TASK FILE" sentinel,
  exactly as for any unresolvable task today. No new sentinel.
- Add the changelog fragment `changes/flow-0085.md`. **Caller action: none**; adopting repos get it
  through the `@v2` alias with no caller change.

**Does not touch:**

- `project-template/.flow/bin/flow-review.mjs`. It already honours `REVIEW_TASKS_DIR`
  (`tasksDir: env.REVIEW_TASKS_DIR || tasksDir`); only the value the workflow passes changes.
- `_flow-kickback.yml` / flow-0082.
- The store-guard. It still fails a PR that edits `.flow/tasks/`; this task removes the reviewers'
  exposure to such an edit, it does not replace the guard.

## Acceptance criteria

Structure tests go in `.flow/bin/flow-review-workflow.test.mjs`. The existing assertion that
`REVIEW_TASKS_DIR` equals `$GITHUB_WORKSPACE/.flow/tasks` is replaced, not deleted without a
successor.

- [ ] Given each review job's materialise step, when the base-worktree branch runs, then it writes
      `REVIEW_TASKS_DIR` pointing inside `$base_dir` (`$base_dir/.flow/tasks`). One assertion per
      job, and the test fails if a job is added without it.
- [ ] Given the bootstrap branch of the same step, then `REVIEW_TASKS_DIR` points at
      `$GITHUB_WORKSPACE/.flow/tasks`.
- [ ] Given any job, then `REVIEW_REPO_DIR` and `REVIEW_OUT_DIR` still point at
      `$GITHUB_WORKSPACE` and `$GITHUB_WORKSPACE/.flow-review`.
- [ ] Given a temp git repo whose base branch holds `.flow/tasks/flow-9999-x.md` with criterion A,
      and a PR branch where the same file's criterion reads B, when `flow-review.mjs` builds
      `task.md` with `REVIEW_TASKS_DIR` set to a worktree of base, then `task.md` contains A and
      not B. (This proves the contract the workflow relies on, end to end, without a workflow run.)
- [ ] Given the same setup where the task file exists only on the PR branch, then `task.md`
      begins with the existing "NO TASK FILE" sentinel.
- [ ] The step's header comment names the task file as read from base.
- [ ] `changes/flow-0085.md` exists and states "Caller action: none".

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- This PR is itself reviewed by the workflow it changes. Because flow-0079 plans the review from
  base, this PR's reviewers run the *old* behaviour (task from the PR). That is expected and fine:
  the fix applies from the next PR onward. Do not try to make it self-applying.
