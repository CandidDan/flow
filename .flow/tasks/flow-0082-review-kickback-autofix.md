---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0082"
title: "A failed qa or code-review check dispatches a bounded auto-fix worker onto the same PR"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-25"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # workflow health: the human is currently a relay between reviewer and worker
touches:
  - ".github/workflows/_flow-kickback.yml"
  - ".github/workflows/flow-kickback.yml"
  - "project-template/.github/workflows/flow-kickback.yml"
  - "project-template/.flow/bin/flow-kickback.mjs"
  - "project-template/.flow/bin/flow-kickback.test.mjs"
  - ".flow/bin/flow-kickback.mjs"
  - ".flow/bin/flow-kickback-workflow.test.mjs"
  - "project-template/.flow/config.yml"
  - ".flow/config.yml"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0082.md"
labels: [flow-infra, review, automation]
notes:
  - "2026-09-25 (orchestrator): From the human, after PR #108 (flow-0076) sat red on a precise, mechanical code-review finding (a CRLF gap) until a human noticed and started a session. The protocol calls a red review check a kickback (PROTOCOL.md step 9), but nothing dispatches one: the worker stops at `gh pr ready` and the queue runner only takes `ready` tasks. The human was acting as a relay."
  - "2026-09-25 (orchestrator): DECIDED WITH THE HUMAN: automatic, bounded, and off by default. Rounds are capped (default 2, hard max 3). qa and code-review only. A failed security check is never auto-fixed. Gated behind FLOW_AI like the other AI workflows."
  - "2026-09-25 (orchestrator): DECIDED: THE ESCALATION IS A LABEL, NOT `blocked`. `blocked` is the worker's own judgment transition, and blocking a task on its own open PR has no clean way to clear. Instead the PR gets the `flow:needs-human` label and a comment, and the task stays `in_review`. The flightdeck already lists `in_review` PRs as needing the human. The label is also the off switch for that PR: the kickback workflow never acts on a labelled PR, and a human removing the label re-arms it."
  - "2026-09-25 (orchestrator): NOT parallel-safe with flow-0050, flow-0070 and flow-0077 (all share `project-template/.flow/config.yml`) or flow-0080 (shares `docs/flow-reusable-workflows.md`). pick-task skips it while either is in progress; whichever lands second rebases."
  - "2026-09-25 (orchestrator): DECIDED: DO NOT TOUCH `_flow-review.yml`. flow-0079 is editing it, and the fixer can read the reviewer's verdict from the PR conversation, where every reviewer already posts it. Triggering off the review workflow's completion needs no change to it."
---

## Context

The three Definition-of-Done reviewers (qa, code-review, security) run as blocking checks on the
PR (`_flow-review.yml`, flow-0007). When one fails, the protocol treats it as a **kickback**
(`project-template/.flow/PROTOCOL.md`, step 9): address it on the same branch, re-run the gate,
re-request review. Today nothing starts that work. The worker session ended at `gh pr ready`, and
`_flow-queue-runner.yml` only picks `ready` tasks, so an `in_review` task with a red check waits
for a human to notice and start a session.

PR #108 is the motivating case. code-review posted a blocking finding naming the file, the line,
the cause and the fix. The human added nothing but the delay of noticing it.

Automating that relay does not weaken "a worker cannot self-certify". The fix is re-reviewed in
CI from scratch, and merge stays human. What it risks is loops, fixes to false positives, and
spending quota, so the bounds below are the substance of the task, not decoration.

## Scope

**Does:**

- **New reusable `_flow-kickback.yml`**, plus a thin caller in the template
  (`project-template/.github/workflows/flow-kickback.yml`) and canonical's own caller
  (`.github/workflows/flow-kickback.yml`), following the existing reusable/caller split (see
  `docs/flow-reusable-workflows.md`).
- **Trigger:** `workflow_run` on the `flow-review` workflow, `types: [completed]`, acting only
  when the run's conclusion is `failure`. No polling, no schedule.
- **Decision logic is code, not YAML.** `project-template/.flow/bin/flow-kickback.mjs` exports a
  pure, dependency-free `decide(facts)`. The workflow gathers the facts; the function returns
  `dispatch` or `skip` plus a one-line reason. Canonical's `.flow/bin/flow-kickback.mjs` is a thin
  adapter, per the adapter convention in canonical's `CLAUDE.md` (no copy, no symlink).
  Its inputs:
  - which review jobs failed;
  - whether the PR is a draft;
  - whether the PR is from a fork;
  - the PR's labels;
  - the task's status on `main`;
  - rounds already used;
  - the configured cap;
  - whether `FLOW_AI` is `true`;
  - whether `FLOW_PAT` is present.
- **Eligibility.** `decide` returns `dispatch` only when **all** of these hold. Otherwise it
  returns `skip`, with the first failing condition as the reason.
  1. `FLOW_AI` is `true`.
  2. `review.auto_fix_rounds` resolves to at least 1.
  3. `FLOW_PAT` is present. Pushes and `gh pr ready` made with `GITHUB_TOKEN` do not trigger
     workflows, so a fix made without it would never be re-reviewed and would sit silently.
  4. The PR's head repo is this repo. No fork PRs, matching the fork fence in `_flow-review.yml`.
  5. The PR resolves to a task id (branch or title, as `flow-status` does), and that task is
     `in_review` on `main`.
  6. The PR is not a draft and does not carry `flow:needs-human`.
  7. The failed jobs are qa and/or code-review **only**. If the security job failed, even
     alongside the others, the result is `skip`: add `flow:needs-human`, with a comment saying a
     security finding needs a human.
  8. Rounds used is less than the cap.
- **The round cap.** A new config key, `review.auto_fix_rounds`, in the consuming repo's
  `.flow/config.yml`:
  - **Absent or 0:** off. The template's `project-template/.flow/config.yml` documents the key
    and ships it **commented out**, so adopting repos are off by default.
  - **Above 3:** clamped to 3, with a step-summary warning naming the configured value.
  - **Canonical:** its own `.flow/config.yml` sets 2.
- **Counting rounds.** The count lives in the task file on `main`. Each dispatch appends a
  `notes` entry, committed straight to `main` like other task-state writes. The entry has a fixed
  prefix: `"<YYYY-MM-DD> (auto-fix): round N/CAP dispatched for <check names>, review run <url>"`.
  Rounds used is the number of `notes` entries with the `(auto-fix): round` prefix. It is not
  stored anywhere else, so a human can read it in the task file.
- **Dispatch:**
  1. Append the round note to the task on `main`.
  2. Convert the PR to draft (`gh pr ready --undo`), so the fixer's intermediate pushes do not
     each trigger three reviewers.
  3. Start a fresh `claude-code-action` worker on the PR branch. Use the same action pin,
     credentials and model settings as `_flow-queue-runner.yml`'s worker. A concurrency group
     keyed on the PR number ensures one kickback runs per PR at a time.
- **The fixer's prompt** says:
  - Read the failing reviewers' verdict comments on the PR (`gh pr view <n> --comments`). Address
    their **blocking** findings only; non-blocking notes are not a mandate.
  - Stay inside the task's `touches`, which `touches-guard` enforces anyway.
  - Run all five gate commands, commit, push, then `gh pr ready`. Marking the PR ready triggers
    review again.
  - **Disputing is allowed.** If a finding is wrong, change no code for it. Post a PR comment
    that starts `**Auto-fix: disputed**` and gives the reasoning, add `flow:needs-human`, and
    leave the PR as a draft.
  - Never edit `.flow/tasks/`. Never spawn a review agent.
- **Exhaustion.** When a review fails and rounds used equals the cap, do not dispatch. Add
  `flow:needs-human` and a PR comment naming the rounds used and the failing checks.
- **A fixer that dies.** A final `if: always()` step checks the PR after the worker step ends.
  If the PR is still a draft and has no `flow:needs-human`, the step adds the label and comments
  that round N did not hand back. A dead fixer must never leave a draft PR that nothing is
  watching.
- **Visible skips.** Every skip writes its reason to the step summary.
- **Docs and changelog.** Document the workflow, the config key, the label and the `FLOW_PAT`
  requirement in `docs/flow-reusable-workflows.md` and in the template caller's header. Add a
  changelog fragment, `changes/flow-0082.md`. **Caller action:** adopt the new
  `flow-kickback.yml` caller (flow-sync delivers it), then set `review.auto_fix_rounds` to opt in.

**Does not touch:**

- `_flow-review.yml` (flow-0079 is editing it) or `_flow-queue-runner.yml` (flow-0080).
- `_flow-status.yml`. The task stays `in_review` throughout. Converting to draft is not a status
  transition, and `flow-status` already treats it as a no-op.
- The flightdeck. Showing "auto-fix 1/2 used" there is a later task.
- `flow-gates` failures. The worker owns the gate before hand-off, and a red gate on a ready PR
  is a different problem.

## Acceptance criteria

`decide` unit tests go in `flow-kickback.test.mjs`. Workflow-structure assertions go in
`.flow/bin/flow-kickback-workflow.test.mjs`.

- [ ] Given every eligibility condition holds and code-review alone failed, when `decide` runs,
      then it returns `dispatch`.
- [ ] Given qa and code-review both failed and all else holds, then `dispatch`.
- [ ] Given the security job failed, alone or alongside others, then `skip`, and the result asks
      for `flow:needs-human` with a security reason.
- [ ] Given `FLOW_AI` is not `true`, then `skip` naming FLOW_AI.
- [ ] Given `FLOW_PAT` is absent, then `skip` naming FLOW_PAT and why it is required.
- [ ] Given a fork PR, then `skip`.
- [ ] Given a draft PR, or a PR labelled `flow:needs-human`, then `skip`.
- [ ] Given a task that is not `in_review` on `main`, or a PR that resolves to no task id, then
      `skip`.
- [ ] Given `review.auto_fix_rounds` absent or 0, then `skip`, "auto-fix off".
- [ ] Given `review.auto_fix_rounds: 5`, then the effective cap is 3 and a warning names the
      configured 5.
- [ ] Given cap 2 and a task whose notes hold two `(auto-fix): round` entries, when review fails
      again, then `skip`, and the result asks for `flow:needs-human` with an exhaustion reason.
- [ ] Given cap 2 and one such entry, then `dispatch` as round 2/2.
- [ ] Round counting counts only notes with the exact `(auto-fix): round` prefix. An unrelated
      note that mentions auto-fix is not counted.
- [ ] Given `_flow-kickback.yml`, then:
  - it triggers on `workflow_run` for `flow-review` with `types: [completed]`;
  - it has a concurrency group keyed on the PR;
  - it has an `if: always()` step that handles a fixer that did not hand back;
  - its `claude-code-action` pin equals `_flow-queue-runner.yml`'s.
- [ ] Given `_flow-kickback.yml`, then its `permissions:` block names only what the steps use.
      It never grants `workflows:`. The test asserts this against the parsed file.
- [ ] Given `_flow-kickback.yml`, then no PR title, branch name or comment body is interpolated
      directly into a `run:` block; each is passed through `env:`. The test asserts this, as
      `.flow/bin/` already does for `flow-status`.
- [ ] Given the fixer prompt in `_flow-kickback.yml`, then it contains the dispute instruction
      (`**Auto-fix: disputed**` and `flow:needs-human`) and the rule never to edit `.flow/tasks/`.
- [ ] Given `project-template/.flow/config.yml`, then `auto_fix_rounds` appears only commented
      out. Given canonical's `.flow/config.yml`, then it is 2.
- [ ] Given the template caller and `docs/flow-reusable-workflows.md`, then both document the
      config key, the label and the `FLOW_PAT` requirement.
- [ ] Given `changes/flow-0082.md`, then it exists and states the caller action.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- `workflow_run` always runs the workflow file from the default branch, never the PR head.
  That is what makes it safe to hold credentials here. Say so in the reusable's header, the way
  `_flow-review.yml` explains its fork fence.
- The fixer and the reviewer are both Claude. The cap exists because more rounds between them
  can converge on something wrong rather than something right. Do not raise the hard max of 3
  without going back to the human.
- If `gh pr ready --undo` fails because the PR is already a draft, treat that as the draft-skip
  case and do not dispatch. Do not force it.
