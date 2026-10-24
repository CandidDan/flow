---
id: "flow-0159"
title: "Make the auto-fix round actually run: drop the draft toggle that GITHUB_TOKEN cannot perform"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-worker-flow-0159"
created: "2026-10-24"
started: "2026-10-24T08:32:58Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
model: "opus"
effort: "high"
model_reason: "Edits a reusable workflow every repo runs, inside the credential boundary flow-0135 drew"
touches: [".github/workflows/_flow-kickback.yml", ".flow/bin/flow-kickback-workflow.test.mjs", ".flow/bin/kickback-credential-boundary.test.mjs", "docs/flow-reusable-workflows.md", "changes/flow-0159.md"]
labels: [kickback, bug, workflows]
notes:
  - "2026-10-24 (orchestrator): from Dan, after write PRs #180 and #182 escalated with 'the round never ran'. Investigated in CandidDan/write; evidence below. maintenance: restores flow-0082's shipped behaviour (G12/G10 were its goals), the same precedent as flow-0157."
---

## Context

Since flow-0082 merged (2026-10-04), **no auto-fix round has ever run**. Every round dies in the
`undraft` job, and the escalation card then hands the human a decision that the round was meant to
spare them.

Evidence from CandidDan/write, at v3 = 514f280:

| Run | PR | `undraft` step | Result |
|---|---|---|---|
| 39898027361 | #180 | `gh pr ready 180 --undo` | `GraphQL: Resource not accessible by integration (convertPullRequestToDraft)` |
| 39901804031 | #182 | same | same |

In both runs the job's token reported `PullRequests: write`. Because `undraft` failed, `fix` and
`push` were skipped, and `round-card` and `escalate-round` posted a card with the
`flow:needs-human` label.

**How it regressed.** flow-0082's first commit (ea130a7) ran the toggle as
`GH_TOKEN: ${{ secrets.FLOW_PAT || github.token }}`. The round-1 security kickback then
confined FLOW_PAT to one step, and flow-0135 to one job (`push`), which left `undraft` on
`github.token`. GitHub refuses `convertPullRequestToDraft` to that token. The reverse toggle,
`gh pr ready` in `push`, still runs as FLOW_PAT, which is why only one direction broke.

**The card misled the human as well.** For #182, `round-card` (a model) wrote "the auto-fix round
appears to have attempted a fix". Nothing ran. The fallback text at `_flow-kickback.yml:971` is
honest but vague ("skipped, crashed or was cancelled"), and the job that actually failed is known.

## Decision (orchestrator, 2026-10-24): remove the draft toggle, do not move FLOW_PAT

The draft existed "so the round's own work does not start three reviewers part-way through". Since
flow-0135 the fixer cannot push: its commits leave as a bundle, and `push` makes **one** push. A
non-draft PR therefore gets exactly one `synchronize`, and so one review, at the end of the round.
That is the behaviour the draft was protecting, and it now holds without the draft.

- **Chosen: delete `undraft`, and delete `gh pr ready` from `push`.** This drops a job and a
  `pull-requests: write` grant. The credential boundary is unchanged: FLOW_PAT stays in `push`
  only.
- **Rejected: give `undraft` FLOW_PAT.** It works, but it reverses flow-0135's "FLOW_PAT belongs to
  exactly one job" for a toggle that no longer protects anything.
- **Accepted cost:** a human could merge mid-round, because the PR does not look like a draft.
  Merge is human-only anyway, and the escalation card or the re-review tells them the state.

## Scope

- `_flow-kickback.yml`:
  - Remove the `undraft` job. `fix` no longer `needs: [plan, undraft]`.
  - Remove `gh pr ready "$PR_NUMBER"` from `push`'s stamp-and-push step. The FLOW_PAT push itself
    re-triggers the reviewers.
  - Update the header, the per-job table and every comment that mentions undraft or the draft
    round.
  - Keep `decide`'s skip of PRs that are *already* draft. A draft PR is still not asking for review.
- **A deterministic card for a round whose `fix` never ran.** When `fix` did not run, or did not
  complete, the card's "Tried / disputed" field is written by shell, not by `round-card`'s model. It
  names the job that failed or was skipped and says no fix was attempted. `round-card` may still
  write the recommendation, but it does not narrate a fix that never happened.
- Tests in `.flow/bin/flow-kickback-workflow.test.mjs` and `kickback-credential-boundary.test.mjs`:
  update the job inventory and permission-set assertions. Keep "FLOW_PAT belongs to exactly one job,
  `push`" exactly as it is.
- `docs/flow-reusable-workflows.md`: update the job table, and record why the draft toggle was
  removed.
- `changes/flow-0159.md`: fragment. Caller action: none. Callers' permission blocks may keep their
  grants, because `escalate-round` and `escalate` still need `pull-requests: write`.
- Does **not** touch the callers (`.github/workflows/flow-kickback.yml`,
  `project-template/.github/workflows/flow-kickback.yml`), `flow-kickback.mjs`'s decide logic, the
  review workflow, or FLOW_PAT's documented permission list.

## Acceptance criteria

- [ ] Given `_flow-kickback.yml`, then it has no `undraft` job, and no step anywhere runs
      `gh pr ready` or `--undo` (structure test).
- [ ] Given the `fix` job, then its `needs` does not include `undraft`, and its `if:` still requires
      the `dispatch` verdict (structure test).
- [ ] Given the workflow, then FLOW_PAT still appears in exactly one job (`push`) and one step
      (stamp-and-push). The existing tests stay unchanged and pass.
- [ ] Given every job holding a write scope, then none runs a model (the existing boundary test,
      updated job list, still green).
- [ ] Given a round where `fix` was skipped or failed, then the card's "Tried / disputed" text names
      that job and says no fix was attempted, and that text comes from a shell step, not a model
      step (structure test on which step sets it).
- [ ] Given an already-draft PR, then `decide` still returns skip (existing
      `project-template/.flow/bin/flow-kickback.test.mjs` case, untouched and green).
- [ ] Given `changes/flow-0159.md`, then it exists and states the caller action
      (`.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

- After this ships in a tag, CandidDan/write adopts it via flow-sync, and its next red review shows
  whether the round runs end to end. Checking that is a human step: name it in the PR's to-dos.
- If the worker finds a reason the draft is still needed (something that reviews on a commit the
  fixer makes before `push`), stop and set `blocked` with a `decision` ask. Do not fall back to
  FLOW_PAT silently.
