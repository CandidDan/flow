---
id: "flow-0134"
title: "Switch auto-fix off in canonical while the fixer's job also holds FLOW_PAT, and pin it off until flow-0135 splits the job"
status: "in_progress"
priority: 1
project: "flow"
owner: "orchestrator-cowork-2026-10-06"
created: "2026-10-06"
started: "2026-10-06T05:01:22Z"
branch: "flow/flow-0134-disarm-autofix-until-job-split"
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".flow/config.yml"
  - ".flow/bin/kickback-credential-boundary.test.mjs"
labels: [security, kickback, urgent]
notes:
  - "2026-10-06 (orchestrator): URGENT, applied with Dan's approval (2026-10-06) — bypasses queue_cap. ORIGIN: the security review on progress#122 (the 3.1.1 sync) rated High: in `_flow-kickback.yml`, the `fix` job runs claude-code-action with `--permission-mode bypassPermissions` over PR comments, and a LATER STEP OF THE SAME JOB (`stamp-and-push`) holds FLOW_PAT and runs `git commit --amend` with hooks enabled. A prompt-injected comment can plant `.git/hooks/pre-commit`, or write `$GITHUB_ENV` (e.g. BASH_ENV) / `$GITHUB_PATH` (a fake `git`), and lift FLOW_PAT — fleet-wide, repo + workflow scope. Verified by the orchestrator against main. Canonical is the only armed repo (`review.auto_fix_rounds: 2`; progress, Nudge, later, inflight, write and tanplan-platform all leave it unset) and is public. The reviewer's second claim — that arming is unreviewed because `.flow/config.yml` is outside `security_paths` — is wrong: `.flow/**` is in flow-review's non-configurable SECURITY_FLOOR_PATHS."
  - "2026-10-06 (orchestrator): this task is the stopgap only. The fix (guards + push in their own job) is flow-0135. Do not touch `_flow-kickback.yml` here."
---

## Context

flow-0082's kickback workflow runs a model with `bypassPermissions` over PR comments in the `fix`
job, then pushes the round with FLOW_PAT from a later step of the same job. Steps in one job share
a runner: the filesystem (`.git/hooks/`), and `$GITHUB_ENV` / `$GITHUB_PATH`, which feed every later
step. So anything the model writes there runs beside FLOW_PAT. flow-0082's reviews checked "FLOW_PAT
reaches exactly one step", but on a GitHub runner the trust boundary is the job, not the step.
Canonical has auto-fix armed and is public, so anyone who can comment on a PR the fixer reads can
reach the PAT.

## Scope

**Does:**
- Set canonical's `review.auto_fix_rounds` to `0`, with a comment naming the hole and flow-0135.
- A test that FAILS while any job in `.github/workflows/_flow-kickback.yml` both runs
  `anthropics/claude-code-action` and references `secrets.FLOW_PAT`, unless canonical's
  `review.auto_fix_rounds` is `0` or absent. Once flow-0135 separates them, the test passes with
  auto-fix re-armed, and no edit to this test is needed.

**Does not touch:** `_flow-kickback.yml`, either caller, `flow-kickback.mjs`, the template's config
(adopters ship with it commented out), any adopting repo.

## Acceptance criteria

- [ ] Given canonical's `.flow/config.yml`, then `review.auto_fix_rounds` is `0`, and
      `flow-kickback.mjs`'s decision for canonical's config is a skip (no round dispatched).
- [ ] Given `_flow-kickback.yml` as it is on main (model and FLOW_PAT in one job) and a config
      with `auto_fix_rounds: 2`, when the boundary test's predicate runs, then it reports the
      violation naming the job (`fix`); with `auto_fix_rounds: 0`, it passes.
- [ ] Given a workflow fixture where no model job references `secrets.FLOW_PAT`, then the
      predicate reports nothing, whatever `auto_fix_rounds` says.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
