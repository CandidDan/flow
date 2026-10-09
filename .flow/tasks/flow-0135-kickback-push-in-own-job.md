---
id: "flow-0135"
title: "The kickback round's guards and push run in their own job, so nothing the fixer model writes can reach FLOW_PAT"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-session-012CTneThg94vo5drhs7QSEY-w0135"
created: "2026-10-06"
started: "2026-10-09T00:56:04Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-kickback.yml"
  - ".github/workflows/flow-kickback.yml"
  - "project-template/.github/workflows/flow-kickback.yml"
  - ".flow/bin/flow-kickback-workflow.test.mjs"
  - ".flow/bin/kickback-credential-boundary.test.mjs"
  - ".flow/config.yml"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0135.md"
labels: [security, kickback, urgent]
notes:
  - "2026-10-06 (orchestrator): URGENT, applied with Dan's approval (2026-10-06) — bypasses queue_cap. The fix behind flow-0134's stopgap; see flow-0134's notes for the finding (progress#122 security review, verified). Sequence after flow-0134: both touch `.flow/config.yml` and the boundary test."
  - "2026-10-06 (orchestrator): DECIDED: a job boundary, not in-place hardening. The reviewer offered (b) `core.hooksPath=/dev/null` + `--no-verify`. That closes hooks only. A model step can also write `$GITHUB_ENV` (BASH_ENV, NODE_OPTIONS, LD_PRELOAD) and `$GITHUB_PATH` (a `git` or `node` earlier on PATH), which reach every later step of the job — the guards included, so the guards cannot be trusted in that job either. Only a new job drops all three. Keep (b) in the new job as defence in depth."
  - "2026-10-06 (orchestrator): ROOT CAUSE, for the ADR/fragment. flow-0082's security check worked: round 1 caught FLOW_PAT inside the model step (Critical). The fix moved FLOW_PAT to a later step of the same job, and from then on the code, its comments ('WHERE FLOW_PAT GOES… exactly one step') and its tests (`FLOW_PAT reaches exactly one step`) all stated a STEP-level invariant. Three later reviews checked the code against that stated invariant and passed it. The invariant was wrong: on a runner, the boundary is the job. This task replaces the invariant, not just the code."
---

## Context

In `_flow-kickback.yml`, the `fix` job runs claude-code-action (`bypassPermissions`, reading PR
comments) and then, in later steps of the same job, runs four guards and `stamp-and-push` with
FLOW_PAT. Steps share the runner's filesystem and the `$GITHUB_ENV` / `$GITHUB_PATH` files, so a
prompt-injected model can plant a git hook, an env var or a PATH entry that runs beside FLOW_PAT.
The structural tests pin "FLOW_PAT in exactly one step", which this layout satisfies.

## Scope

**Does:**
- Move checks 1–4 and `stamp-and-push` out of `fix` into a new job that `needs: fix` and runs no
  model. That job gets a fresh `actions/checkout` of the head ref (`persist-credentials: false`).
- Carry the round's commits from `fix` to the new job as **data**: a `git bundle` (artifact or
  bounded output; choose and say why). The new job verifies that the bundle's base is the recorded
  head before using it, and runs the guards there, from default-branch code as today.
- Commit and push in the new job with hooks off (`-c core.hooksPath=/dev/null`, `--no-verify`).
- Restate the invariant in the workflow's header and in `flow-kickback-workflow.test.mjs`: **no job
  that runs a model references `secrets.FLOW_PAT`**, and the FLOW_PAT job runs no model. FLOW_PAT
  joins the write side of the existing MODEL_JOBS / WRITER_JOBS disjointness test.
- Re-arm canonical: `review.auto_fix_rounds: 2`, once flow-0134's boundary test passes on the new
  layout.
- Update both callers' `permissions:` if the new job changes the union. Update
  `docs/flow-reusable-workflows.md`. Write the changelog fragment, with the root cause from the notes.

**Does not touch:** `flow-kickback.mjs`'s `decide()` logic, the round cap, the card jobs, any
adopting repo.

## Acceptance criteria

- [ ] Given `_flow-kickback.yml`, then no job containing an `anthropics/claude-code-action` step
      references `secrets.FLOW_PAT` anywhere, and the job that does contains no model step.
      Proved structurally, with a mutation check that the pre-change layout fails.
- [ ] Given the new push job, then it checks out fresh, takes the round's commits only as a bundle,
      and refuses (no push, escalation as today) when the bundle's base is not the recorded head.
- [ ] Given the new push job's commit/push step, then it disables hooks (`core.hooksPath` and
      `--no-verify`).
- [ ] Given guards 1–4, then each still runs before the push and still escalates exactly as today
      (the existing guard tests pass against the new job).
- [ ] Given canonical's `.flow/config.yml`, then `review.auto_fix_rounds` is `2`, and flow-0134's
      boundary test passes.
- [ ] Given both callers, then their `permissions:` equal the union of the reusable's per-job grants
      (the existing test).
- [ ] Given `changes/flow-0135.md`, then it exists, states the caller action (or none), and names
      the step-vs-job root cause.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
