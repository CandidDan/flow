---
id: "flow-0120"
title: "A PR whose task has open asks gets a comment that @-mentions the repo owner, and a needs-input label"
status: "blocked"
priority: 2
project: "flow"
owner: "session_01B4b9s8btzJYkSqdSmHYkwB"
created: "2026-10-02"
started: "2026-10-14T01:36:20Z"
branch: ""
pr: ""
issue: ""
blocked_reason: "Out of touches: the reusable cannot comment or label unless the CALLER grants pull-requests/issues write, and both callers (.github/workflows/flow-status.yml, project-template/.github/workflows/flow-status.yml) grant only contents: write. Waiting on a human decision to widen touches - not machine-checkable."
blocked_by: []
serves: ["G12"]    # G12: one decision, answerable from my phone. A mention on the PR reaches GitHub mobile.
touches:
  - ".github/workflows/_flow-status.yml"
  - "project-template/.flow/bin/asks-comment.mjs"
  - "project-template/.flow/bin/asks-comment.test.mjs"
  - "changes/flow-0120.md"
labels: [flow-infra, human-loop, flow-status]
asks:
  - "decision: widen touches to both flow-status callers, and should the reusable REQUEST the permissions or INHERIT them? A reusable job requesting pull-requests/issues write that its caller does not grant is a startup failure of the WHOLE run, so every repo on @v3 that has not synced its caller would lose its in_review/ready transitions at the next alias move (and canonical, pinned @main, the moment this merges unless its caller changes in the same PR). Recommend: add both callers to touches and grant pull-requests: write + issues: write on their flow-status job; in the reusable the new asks job declares NO extra permissions (inherits the caller grant) and degrades to a ::warning:: on 403, and criterion 6 becomes a test that the reusable top level is unchanged and the callers grant exactly those two at job scope. Un-synced repos then lose only the comment, never the status sync."
notes:
  - "2026-10-14 (worker session_01B4b9s8btzJYkSqdSmHYkwB): BLOCKED before branching, no code written, no branch pushed. Finding: _flow-status.yml is called with permissions contents: write only (canonical caller and template caller), and a called workflow cannot exceed its caller. See the decision ask. Design notes for the next worker once unblocked: (1) do not use .flow/bin/asks-comment.mjs in the consuming repo - an un-synced repo will not have it and canonical would need an adapter outside touches; materialise canonical helpers at job.workflow_sha exactly as _flow-triage.yml does (for helper in asks-comment.mjs asks.mjs flow-state.mjs) and pin the step byte-equal to _flow-gates.yml as triage-allocate-id.test.mjs does. (2) Read asks from main with flow-state.mjs <id> --json --no-pr. (3) Earlier markers: gh api --paginate repos/{repo}/issues/{n}/comments, pass bodies to the pure helper by file. (4) A workflow-structure test placed in project-template/.flow/bin/ is copied to adopting repos that have no _flow-status.yml - skip it outside canonical, as flow-review.test.mjs does with inCanonical."
  - "2026-10-13 (orchestrator): UNBLOCKED: flow-0119 is done. Dan's queue rule 2026-10-13: every p1/p2 task plus flow-0108 is ready; p3s park."
  - "2026-10-02 orchestrator: Dan asked that a PR needing a human's attention gets a comment that tags the repo owner. DECISIONS, do not relitigate: (1) The mention target is `github.repository_owner`, the same source flow-0109 and flow-watchdog use. The label is `needs-input`, the label flow-0109 introduces. (2) A NEW comment is posted for each newly seen ask, because GitHub does not notify on a mention added by editing a comment. An ask already announced on the PR is never re-posted, and the hidden id marker is what tells them apart. (3) Asks added to a task after its PR is ready are only picked up on the PR's next opened/reopened/ready_for_review event. A main-push trigger is deliberately left out of this task. inflight is the surface that catches late asks and PR-less decisions."
---

## Context

flow-0119 gives a task an `asks` list: the items a person must act on. Dan reviews in GitHub and
wants a PR that needs him to say so where he already is, with a notification on his phone.

## Scope

In `_flow-status.yml`, on `ready_for_review`, `opened` and `reopened`, after the existing
transition:

- Read the task's `asks` from main (via `flow-state --json` or asks.mjs).
- Any ask whose id is not in an earlier Flow asks comment on this PR goes into ONE new comment:

```
@<repository_owner> this PR needs you:

**Decision** — <question>
↳ Recommend: <recommendation>

**Follow-up** — <text>

**FYI** — <text>
<!-- flow-asks: <id>,<id>,<id> -->
```

- Decisions come first. Only the new asks are listed.
- The PR is labelled `needs-input` while the task has any ask, and the label is removed when the
  task's `asks` is empty. Create the label if it does not exist, as `_flow-compass.yml` does for
  `compass`.
- Ask text reaches `gh` through a file (`--body-file`), never interpolated into a `run:` script.
- `asks-comment.mjs` (pure) renders the body and works out the new ids from earlier comment
  bodies, so the logic is unit-tested rather than living in YAML.

**Does not:** open issues, run on main pushes, edit earlier comments, or change
`_flow-review.yml` or the review-guide comment (flow-0084).

## Acceptance criteria

- [ ] Given a task with one `decision`, one `follow-up` and one `fyi` ask, when its PR is marked
      ready, then one comment starting with `@<repository_owner>` is posted, it lists the
      decision first with its recommendation, and the PR carries `needs-input`.
- [ ] Given the PR is reopened with the same asks, no second comment is posted.
- [ ] Given a new ask is added to the task and the PR is reopened, one new comment carries only
      the new ask, again starting with the mention.
- [ ] Given the task's `asks` is empty, no comment is posted and `needs-input` is removed if it
      was present.
- [ ] Given ask text containing `$(...)`, backticks and a newline, the comment shows it
      literally (a render test), and the workflow passes it by file (a workflow structure
      test).
- [ ] The job's permissions grow by `pull-requests: write` and `issues: write` at most, scoped to
      the job, never the reusable's top level (a workflow structure test).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
