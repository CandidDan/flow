---
id: "flow-0199"
title: "The qa check gives one fixed verdict on a PR with no task: PASS when every changed file is documentation, FAIL otherwise"
status: "in_progress"
priority: 2
project: "flow"
owner: "session_01NfrcU87xJ2vFCYUebyk6mT"
created: "2026-11-03"
started: "2026-11-03T02:49:52Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - ".github/workflows/_flow-review.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - "changes/flow-0199.md"
labels: [bug, review]
model: "opus"
effort: "high"
model_reason: "Changes a reusable workflow's reviewer prompt and the review helper every Flow repo runs; a wrong rule passes or fails PRs fleet-wide"
asks: []
notes:
  - "2026-11-03 orchestrator: found on CandidDan/flow#277 (a [vision] PR: VISION.md + docs/adr/0010-intake-lanes.md, no task). qa PASSED four commits, then FAILED commit 1600262 twice (one a re-run) and the merge commit 99cb684, every time reasoning 'NO TASK FILE RESOLVED … docs only … nothing needs a test'. Merged over a red check. Cause: the qa prompt in _flow-review.yml gives an exact verdict for RELEASE PR and SYNC PR but, for NO TASK FILE RESOLVED, only says 'say so plainly'; the task.md text for that sentinel says 'This is a finding'. The model picks the verdict."
  - "2026-11-03 orchestrator: serves maintenance — a defect in an existing gate, no new product behaviour, so no intent. The human's brief set the rule (docs/ADRs/VISION/intents → PASS, anything else → FAIL naming the files). That answers the open question flow-review.mjs records above RELEASE_PR_SENTINEL ('DELIBERATELY NOT EXTENDED to a [vision] PR … needs its own closed path list agreed first'): the list below is that agreement."
---

## Context

`.flow-review/task.md` begins with `NO TASK FILE RESOLVED` (`NO_TASK_SENTINEL` in
`project-template/.flow/bin/flow-review.mjs`) when `taskContext` finds no task. It happens in three
cases: no task id in the branch or PR title; an id with no matching file in the store; a matching
file that could not be read. For this sentinel neither the qa prompt nor task.md tells the reviewer
which verdict to write, so the same PR gets PASS on one run and FAIL on the next.

`RELEASE PR`, `SYNC PR` and `INTENT PR` already solve the same problem by classifying in code and
writing one exact instruction into task.md. Do the same for `NO TASK FILE RESOLVED`.

## Scope

1. In `flow-review.mjs`, add a CLOSED, exported list of documentation paths, exactly:
   `VISION.md`, `docs/**/*.md`, `.flow/intents/*.md`, `.flow/workstreams/*.md`. Glob-match it with
   the existing `globToRegExp`. Nothing else is on it — not `README.md`, not `CHANGELOG.md`, not
   `.flow/PROTOCOL.md`, not any `SKILL.md`, not `docs/**` files of other types.
2. Add an exported pure function that takes the changed-file list and returns whether every file
   matches the list, plus the files that do not.
3. `taskContext` accepts the changed-file list (`changedFiles`, default `null`). When the outcome is
   `NO TASK FILE RESOLVED` and `changedFiles` is an array, task.md ends with exactly one verdict
   instruction for the qa check, in place of the current closing paragraph:
   - every file on the list (and at least one file) → PASS with an exact pinned line, exported as
     a constant: `no task: documentation only, no executable behaviour to test`;
   - otherwise → FAIL, and name the changed files that are not on the list as the behaviour with
     no task and no proven criteria.
   task.md says this verdict is the qa check's and was decided in code. When `changedFiles` is
   `null` (a direct caller that did not pass it) the text is unchanged from today.
4. `runPlan` passes its `changedFiles` to `taskContext`.
5. The qa prompt in `.github/workflows/_flow-review.yml`: for `NO TASK FILE RESOLVED`, replace "say
   so plainly" with: the verdict is decided in code and stated at the end of task.md; follow it
   exactly, PASS with the exact line or FAIL naming the files. Keep `TASK CONTEXT UNAVAILABLE`
   handling as it is.
6. Update the `DELIBERATELY NOT EXTENDED to a [vision] PR` comment in `flow-review.mjs` so it no
   longer says the list is undecided.
7. Fragment `changes/flow-0199.md`: **No caller action** (the change arrives with the next tag;
   adopting repos get it through the reusable workflow and flow-sync).

**Does not:** change the `RELEASE PR`, `SYNC PR`, `INTENT PR` or `TASK CONTEXT UNAVAILABLE`
handling; change the code-review or security prompts; change how a task id is resolved; add a new
sentinel (the first line of task.md stays `NO TASK FILE RESOLVED`).

## Acceptance criteria

- [ ] Given changed files `VISION.md` and `docs/adr/0010-intake-lanes.md` and no task id, task.md
      starts with `NO TASK FILE RESOLVED` and contains the PASS line, and no FAIL instruction.
      (`flow-review.test.mjs`)
- [ ] Given changed files that include one path off the list (for example `docs/adr/x.md` and
      `project-template/.flow/bin/foo.mjs`), task.md tells qa to FAIL and names
      `project-template/.flow/bin/foo.mjs`, and does not contain the PASS line. (`flow-review.test.mjs`)
- [ ] The list is closed: `README.md`, `CHANGELOG.md`, `.flow/PROTOCOL.md`,
      `project-template/.claude/skills/task-writer/SKILL.md`, `docs/flow.html` and an empty file list
      each yield FAIL. (`flow-review.test.mjs`)
- [ ] An id that resolves to no file in the store also gets the verdict from the file list.
      (`flow-review.test.mjs`)
- [ ] `runPlan` writes the verdict into task.md from the PR's real changed files. (`flow-review.test.mjs`)
- [ ] `taskContext` without `changedFiles` produces the same text as before. (`flow-review.test.mjs`)
- [ ] The qa prompt in `_flow-review.yml` tells the reviewer to follow the code-decided verdict for
      `NO TASK FILE RESOLVED` and names the same PASS line the helper exports.
      (`.flow/bin/flow-review-workflow.test.mjs`)
- [ ] Changelog fragment exists and states the caller action.
      (`.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`)
