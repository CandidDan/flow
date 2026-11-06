---
id: "flow-0215"
title: "The dispatch tier issue stays one issue and one comment: close before commenting, put a dropped label back, accept only Flow-authored issues in the fallback"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-11-06"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Parked by queue cap at creation (Dan, 2026-11-06: follow-ups from PR #297). Not machine-checkable: flip to ready when the ready count drops below the cap."
cancelled_reason: ""
blocked_by: []
serves: ["G10"]
intent: "model-work-off-github-actions"
touches:
  - "project-template/.flow/bin/flow-dispatch.mjs"
  - "project-template/.flow/bin/flow-dispatch.test.mjs"
  - "changes/flow-0215.md"
labels: [dispatch, routines]
model: "opus"
effort: "high"
model_reason: "Changes how a workflow every adopter runs writes to GitHub issues; the trust rule for which issue to edit is a security decision"
notes:
  - "2026-11-06 (session_01NfrcU9iRVh8RVpDF6wsSzV): written from the non-blocking review notes on PR #297 (flow-0211), at Dan's request after he merged it."
asks: []
---

## Context

flow-0211 (PR #297) made `flow-dispatch` keep one open issue per model tier that has ready tasks
but no routine. The issue carries the label `flow-dispatch` and a hidden body line
`<!-- flow-dispatch:no-routine:<tier> -->` (the "marker"). It is found by label first, and, if
the label query finds nothing, by the marker among the 100 newest open issues, because GitHub
silently drops a label the token may not create. The first run that fires the tier's routine
posts a comment on the issue and then closes it.

The PR's code-review and security checks passed, with four non-blocking notes that this task
fixes. All four are in `project-template/.flow/bin/flow-dispatch.mjs`.

1. **Duplicate comments.** `closeTierIssue` comments first and closes second. If the comment
   succeeds and the close fails, the issue stays open, and the next run that fires comments again.
2. **A dropped label stays dropped.** When `ensureNoRoutineIssue` finds the issue by its marker
   (the label is missing), its update does not add the label back. Every later run then pays for
   the second, wider lookup.
3. **Anyone can plant a marker.** The fallback lookup accepts any open issue whose body holds the
   marker. On a public repo, anyone can open such an issue, and Flow would then rewrite its title
   and body and later close it. What Flow writes is still correct, so this lets an outsider choose
   which issue Flow edits, nothing more.
4. **The 100-issue limit is unstated.** If an unlabelled tier issue is older than the 100 newest
   open issues, the fallback misses it and a duplicate is opened. That limit is acceptable but is
   not written down in the code.

## Scope

1. `closeTierIssue` closes the issue first, then comments. If the close fails, it posts no
   comment, and the job summary says the issue could not be closed (as it does today).
2. When `ensureNoRoutineIssue` finds the issue by marker and the issue lacks the `flow-dispatch`
   label, its update sends the label too. A failure to set the label is not an error: the run
   stays green and the summary line is unchanged.
3. The marker fallback (the lookup that reads the newest open issues) accepts only an issue whose
   author is `github-actions[bot]`, or whose `author_association` is `OWNER`, `MEMBER` or
   `COLLABORATOR`. An issue that fails this check is ignored as if it had no marker. The
   label-based lookup is unchanged: setting a label already needs triage access.
4. A one-line comment beside the fallback lookup states the 100-newest limit and what happens
   past it (a duplicate issue).
5. In `flow-dispatch.test.mjs`, the flow-0211 failure test that uses `thrown.valueOf()` uses
   `thrown` directly.
6. Changelog fragment `changes/flow-0215.md`. Caller action: none.

**Does not touch:** the workflows and their permissions; the label-based lookup; which skips
write an issue; the issue's title and body text; `docs/flow-routines.md`.

## Acceptance criteria

- [ ] Given an open sonnet issue and a run that fires the sonnet routine, when the close call
      fails, then no comment is posted, the run exits 0, and the summary says the issue could not
      be closed. When the close succeeds, exactly one comment is posted after it. Proved by
      `flow-dispatch.test.mjs`, asserting the order of requests the fake GitHub received.
- [ ] Given an open sonnet issue with the marker but no label, when dispatch skips with
      `no-routine-for-sonnet`, then the update request for that issue includes the
      `flow-dispatch` label, and no second issue is opened. Proved by `flow-dispatch.test.mjs`.
- [ ] Given an open issue with the sonnet marker, no label, author `someone-else` and
      `author_association: NONE`, when dispatch skips with `no-routine-for-sonnet`, then that
      issue is not updated or closed, and a new labelled issue is opened. Proved by
      `flow-dispatch.test.mjs`.
- [ ] Given the same issue authored by `github-actions[bot]`, or with `author_association`
      `OWNER`, then it is reused as today. Proved by `flow-dispatch.test.mjs`.
- [ ] `changes/flow-0215.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
