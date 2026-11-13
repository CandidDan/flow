---
id: "flow-0222"
title: "qa check fails a task PR whose description has no Captures section or an empty reason"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-11-13"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Decision answered (fail). Waiting for flow-0196, in progress, which also edits _flow-review.yml and lands the missing-helper pattern scope item 5 follows. Also, the ready queue was at its cap of 8 when Dan answered. flow-unblock releases this to ready when flow-0196 is done."
cancelled_reason: ""
blocked_by: ["flow-0196"]
serves: ["G10"]
intent: "ux-prs-show-screenshots"
touches:
  - "project-template/.flow/bin/pr-captures.mjs"
  - "project-template/.flow/bin/pr-captures.test.mjs"
  - ".flow/bin/pr-captures.mjs"
  - ".github/workflows/_flow-review.yml"
  - ".flow/bin/captures-workflow.test.mjs"
  - "changes/flow-0222.md"
labels: [review, gate, pr-description]
model: "opus"
effort: "high"
model_reason: "Changes the reusable qa check every adopting repo runs, handles attacker-chosen PR body text, and a false fail blocks every PR in the fleet"
notes:
  - "2026-11-13 (Dan, decision card): FAIL IF MISSING OR NO REASON. qa fails a task PR with no Captures section or an empty / n/a reason, decided in code; any stated reason passes and is quoted first in the qa comment; the model does not judge the reason. Criteria stand as written; ignore the 'warn only' and 'model judges' notes. Dan asked whether every PR needs the section; the recommendation (yes, every task PR) was given before he chose this option. Left blocked on flow-0196 for the shared file and the queue cap."
  - "2026-11-13 (task writer, project thread 'Write Flow tasks for PR screenshots'): the decision is made IN CODE, not by the qa model, on purpose. flow-0199's history shows the qa model passing and failing the same task-less PR on different runs; a section-present / reason-present test is deterministic and costs no tokens (G9). The model's only new job is to quote the captures state in its comment."
  - "2026-11-13 (task writer): the flow-gates caller's pull_request types do not include `edited`, so fixing only the PR body does not re-run qa. This task does NOT add `edited` (every body edit would re-run three model reviewers, against G9). The fix is a re-run of the failed qa job or a new push; the qa FAIL message must say so."
asks: []
---

## Context

Intent `ux-prs-show-screenshots` (merged, flow#307). Outcome: "A PR without screenshots never
reaches him without a stated reason he can disagree with." Constraint: "The check is the existing
qa check on the PR, not a new job."

Today nothing checks captures. The qa prompt in `.github/workflows/_flow-review.yml` reads the
diff, the changed files and the task, and never sees the PR description. The `guide` step in the
`security` job already reads the PR body safely (through `env: PR_BODY`, parsed by
`review-guide.mjs`'s `assumptionsSection`); that is the pattern to follow.

The words this check enforces are set by flow-0221 ("Every PR
description carries a Captures section..."): every PR description has a `## Captures` section
holding captures or one `Not captured: <reason>` line. The two tasks touch different files and can
land in either order; this one checks only the section's presence and its reason, which both the
current and the new show-me wording already require.

```
PR body ──env──▶ pr-captures.mjs facts ──▶ state: captured | reason | empty-reason | missing
                                                   │
                     missing / empty-reason ───────┴──▶ qa verdict FAIL (decided in code)
                     captured / reason ────────────────▶ qa model runs as today, quotes the state
```

## Scope

**Does:**

1. New pure helper `project-template/.flow/bin/pr-captures.mjs`, dependency-free, with
   `capturesState(body)` returning one of:
   - `captured`: a `## Captures` section exists and holds at least one image, a link to a file,
     or a Markdown table;
   - `reason`: the section holds a `Not captured: <reason>` line with a real reason;
   - `empty-reason`: the line is there but the reason is empty, whitespace, or one of `n/a`, `na`,
     `none`, `-` (any case);
   - `missing`: no `## Captures` heading (match the heading case-insensitively).
   It also returns the reason text when there is one. A CLI subcommand `facts` reads `PR_BODY`
   from the environment and writes `$REVIEW_OUT_DIR/captures.md` stating the state and quoting
   the reason, fenced as data in the same way `review-guide.mjs` fences the body for its model.
2. Canonical adapter `.flow/bin/pr-captures.mjs` over the template helper, the same shape as
   `.flow/bin/review-guide.mjs` (not a copy, not a symlink).
3. In `_flow-review.yml`'s `qa` job, a step before the model call that runs the helper with the
   PR body passed through `env:` (never interpolated into the shell), and:
   - on `missing` or `empty-reason`: the qa verdict is FAIL, decided in code. The fail summary
     names the state, points at show-me's `## Captures`, and says that a body-only fix needs the
     qa job re-run (or a new push), because editing the description does not trigger the check.
   - on `captured` or `reason`: the model runs as today; its prompt gains one instruction to read
     `.flow-review/captures.md` and put the captures state, with the reason quoted verbatim, as
     the first line of its PR comment. The model does not judge the reason.
4. The captures check applies only to PRs that resolve a task. Release PRs, sync PRs, intent-only
   PRs and `NO TASK FILE RESOLVED` documentation-only PRs keep their current fixed verdicts.
5. If the base branch's `.flow/bin/` has no `pr-captures.mjs` (an adopting repo running the new
   workflow before flow-sync delivered the helper), the step writes a `::warning::` and the
   captures check is skipped for that run, never failed. Follow the missing-helper pattern
   flow-0196 lands, if it has merged by then.
6. Workflow-structure test `.flow/bin/captures-workflow.test.mjs` (canonical-only).
7. Changelog fragment `changes/<this task id>.md`. **Caller action:** after the next flow-sync,
   every task PR needs a `## Captures` section. Say this plainly, because open PRs in adopting
   repos without one will turn red on their next qa run.

**Does not touch:** `flow-review.mjs` (the verdict format and `enforce` stay as they are; the
code-decided FAIL writes a normal qa verdict file); the code-review and security jobs; the
flow-gates caller's trigger types; PROTOCOL.md and show-me (the other task's); whether a capture
is good enough or matches the diff (nothing judges that, by design).

## Acceptance criteria

- [ ] 1. Given a PR body with a `## Captures` section holding an image link, a file link, or a
  Markdown table, `capturesState` returns `captured`. Proved in `pr-captures.test.mjs`, one case
  each.
- [ ] 2. Given a body whose Captures section holds `Not captured: no browser in the environment`,
  `capturesState` returns `reason` with that reason text. Proved in `pr-captures.test.mjs`.
- [ ] 3. Given a Captures section holding `Not captured:` followed by nothing, whitespace, `n/a`,
  `N/A`, `none` or `-`, `capturesState` returns `empty-reason`; given no Captures heading at all
  (including an empty body), it returns `missing`. Proved in `pr-captures.test.mjs`.
- [ ] 4. Given the `qa` job in `_flow-review.yml`, then a step runs the helper with the PR body
  passed only through `env:`, and the string `github.event.pull_request.body` appears in no
  `run:` block. Proved in `captures-workflow.test.mjs`.
- [ ] 5. Given a task PR whose state is `missing` or `empty-reason`, the qa verdict file is
  written as `fail` by code, without a model call, and its summary names the state and the
  re-run instruction. Proved in `captures-workflow.test.mjs` (step structure and condition) and
  `pr-captures.test.mjs` (the summary text the helper produces).
- [ ] 6. Given a task PR whose state is `captured` or `reason`, the qa prompt instructs the model
  to quote the captures state and reason as the first line of its comment, and tells it not to
  judge the reason. Proved in `captures-workflow.test.mjs`.
- [ ] 7. Given a release, sync, intent-only or documentation-only no-task PR, the captures step
  does not change its verdict. Proved in `captures-workflow.test.mjs`.
- [ ] 8. Given a base branch without `pr-captures.mjs`, the step warns and the captures check
  does not fail the run. Proved in `captures-workflow.test.mjs`.
- [ ] 9. `.flow/bin/pr-captures.mjs` is an adapter that imports the template helper, not a copy
  or a symlink. Proved in `captures-workflow.test.mjs`.
- [ ] 10. The changelog fragment exists and states its caller action. Proved by
  `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- If Dan answers "warn only": criterion 5 becomes "the qa comment's first line names the state
  and the verdict is unchanged", and the caller-action note in scope item 7 drops "turn red".
- If Dan answers "the model also judges the reason": stop and send this back to the task writer.
  That is a model verdict on PR text and needs its own criteria and an eval case, not an edit here.
- This PR itself is a task PR, so its own description needs a `## Captures` section (a
  `Not captured:` line naming that the change is a CI check with no screen is the expected form).
