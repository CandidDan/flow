---
id: "flow-0163"
title: "Let flow-unblock read pull requests, so a task blocked on a PR url is released when that PR merges"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-worker-opus"
created: "2026-10-27"
started: "2026-10-27T01:06:01Z"
branch: "flow/flow-0163-unblock-pr-read"
pr: "https://github.com/CandidDan/flow/pull/237"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
model: "opus"
effort: "medium"
model_reason: "Small, but it changes the permissions of a reusable workflow every repo runs and of the caller every repo syncs"
touches:
  - "project-template/.github/workflows/flow-unblock.yml"
  - ".github/workflows/flow-unblock.yml"
  - ".github/workflows/_flow-unblock.yml"
  - ".flow/bin/unblock-pr-read-scope.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0163.md"
  - ".flow/bin/adapters.test.mjs"
labels: [bug, workflows, unblock]
notes:
  - "2026-10-27 (orchestrator): ask answered: touches widened to .flow/bin/adapters.test.mjs (the anticipated case in Notes; Dan authorised running flow-0163). Released to ready. Next worker: follow the worker note below, on the existing branch and PR #237."
  - "2026-10-27 (orchestrator): from Dan, after CandidDan/write run 40268705927. Dan ruled this ships as 3.5.1 (PATCH) via flow-sync, not v4: flow-sync now delivers callers to every repo (flow-0158), so a grant added to the template caller reaches the fleet without a manual caller edit. maintenance: restores flow-0041's shipped behaviour."
  - "2026-10-27 (worker, opus): BLOCKED, everything else done. Branch flow/flow-0163-unblock-pr-read is pushed (no PR yet). Done on it: pull-requests: read with a comment in all three permissions blocks; new .flow/bin/unblock-pr-read-scope.test.mjs (5 tests, all green, covers criteria 1-4); docs/flow-reusable-workflows.md flow-unblock row; changes/flow-0163.md (caller action run flow-sync, 3.5.1 PATCH; changelog-fragments test green). Gate: build+lint green, npm test 2216 pass / 1 fail, the one being adapters.test.mjs:1144 'both flow-unblock callers: three triggers, exactly contents+actions write, no secrets', which deepEquals the grant to {contents: write, actions: write}. Coverage not yet run. NEXT ACTION once touches includes .flow/bin/adapters.test.mjs: check out the branch, rebase on main, change line 1144 to deepEqual { contents: 'write', actions: 'write', 'pull-requests': 'read' } and update the test title to say contents+actions write + pull-requests read, run all four gate commands, open the PR '[flow-0163] ...', gh pr ready."
---

## Context

`flow-unblock` (flow-0041, shipped in 3.4.0) releases a `blocked` task once every `blocked_by`
entry resolves. An entry is either a task id, which resolves when that task is `done`, or a PR url,
which resolves when that PR has merged. The protocol tells workers to use both.

**PR urls never resolve.** On 2026-10-26 CandidDan/write#183 merged, and the sweep that ran 13
seconds later (run 40268705927, job 121396638789) logged:

```
##[warning]Could not read https://github.com/CandidDan/write/pull/183 — it resolves unknown and its task stays blocked. A PR in another private repo, or a token without pull-requests read, both land here.
write-0147 stays blocked: https://github.com/CandidDan/write/pull/183=unknown
```

In the same run, a task-id entry released normally (write-0091). The cause: the sweep looks each PR up
with `gh api "repos/$repo/pulls/$number"` on `GITHUB_TOKEN`, and **no `permissions:` block in the
chain grants `pull-requests: read`**. A `permissions:` block is exhaustive, so the token cannot read
pull requests in a private repo:

| File | Grants today |
|---|---|
| `.github/workflows/_flow-unblock.yml` (reusable, top level) | `contents: write`, `actions: write` |
| `project-template/.github/workflows/flow-unblock.yml` (the caller every repo syncs) | `contents: write`, `actions: write` |
| `.github/workflows/flow-unblock.yml` (canonical's own caller) | `contents: write`, `actions: write` |

So every PR-url block in the fleet waits for a human. The sweep's "unknown keeps the task blocked"
is behaving correctly; the missing grant is the bug.

## Scope

- Add `pull-requests: read` to all three `permissions:` blocks above, with a one-line comment
  each saying it is for the `blocked_by` PR lookup. Nothing else is granted.
- Add `.flow/bin/unblock-pr-read-scope.test.mjs`. It parses the three files and fails, naming the
  file, if any of them lacks `pull-requests: read` (or `write`). It also fails if the reusable's
  sweep stops calling a `pulls` endpoint, so the test and the grant cannot drift apart silently.
- Update the flow-unblock section of `docs/flow-reusable-workflows.md` to list the third grant
  and why.
- Changelog fragment `changes/flow-0163.md`, with caller action **"run flow-sync"**. It must say
  this ships as **3.5.1 (PATCH)** by Dan's ruling on 2026-10-27, and why: flow-sync delivers the
  updated caller, so no repo edits a caller by hand.

**Deliberately does NOT:**
- Change `flow-unblock.mjs` or how it decides. Its `unknown` handling is correct.
- Bump `VERSION` or cut the release. That is a separate release PR after this merges (the
  versioning policy's "task PR, then release PR").
- Audit other workflows for missing grants. If you notice one, name it as a `follow-up` ask.
- Amend `docs/flow-versioning-policy.md`. The PATCH ruling is recorded in this task and in the
  fragment.

## Acceptance criteria

- [ ] Given `project-template/.github/workflows/flow-unblock.yml`, when its job's `permissions:` block is parsed, then it contains `pull-requests: read` alongside the existing `contents: write` and `actions: write` (`.flow/bin/unblock-pr-read-scope.test.mjs`).
- [ ] Given `.github/workflows/flow-unblock.yml` and `.github/workflows/_flow-unblock.yml`, when their `permissions:` blocks are parsed, then each contains `pull-requests: read` (same test file).
- [ ] Given a copy of any of the three files with the `pull-requests` grant removed, when the scope check runs on it, then it fails naming that file (same test file).
- [ ] Given `_flow-unblock.yml`, when its steps are read, then the sweep still looks PRs up through a `repos/…/pulls/…` call, so the grant still has a reason to exist (same test file).
- [ ] Given the existing permission tests (`.flow/bin/actions-write-scope.test.mjs`, `.flow/bin/caller-pins.test.mjs`, `project-template/.flow/bin/flow-unblock.test.mjs`), when they run, then they pass, updated only where they pin the exact grant list.
- [ ] Given this task's fragment `changes/flow-0163.md`, when the store-wide test runs, then it passes: `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

Security-reviewer focus: the grant is **read** only, and goes to a job that runs no model and
reads no PR body or comments, only `.state` and `.merged`.

If the fifth criterion forces an edit to a test outside `touches`, block rather than widen. That
would mean another test pins the exact grant list, and the orchestrator widens `touches` on `main`.
