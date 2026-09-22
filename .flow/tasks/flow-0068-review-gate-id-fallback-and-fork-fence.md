---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0068"
title: "_flow-review.yml never resolves the task id in code and never fences the fork boundary — the one workflow CAN-52 did not reach, running three bypassPermissions jobs on whatever its caller points at"
status: "in_progress"
priority: 3
project: "flow"
owner: "session_017pnHXAiMPgKPH9J8eyhyHw"
created: "2026-09-22"
started: "2026-09-22T02:07:30Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - ".github/workflows/_flow-review.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/flow-review-adapter.test.mjs"
  - ".flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "CHANGELOG.md"
labels: [infra, ci, review-gate, security, protocol]
notes:
  - "2026-09-22 (orchestrator): PRIORITY IS THE DEFAULT, NOT A JUDGEMENT. The human gave no priority signal when logging this, so it is 3. Both halves are arguments for raising it and neither is an emergency today: the id half degrades a check rather than breaking it, and the fork half is latent under the trigger the shipped caller uses. Raise it deliberately if either changes."
  - "2026-09-22 (orchestrator): PART OF THE THIRD ITEM IS ALREADY DONE, and saying so is the honest version of this task. `_flow-review.yml` line 140 (qa) and line 199 (code-review) ALREADY tell the reviewer the id is in `the branch name (flow/<id>-…) or the PR title prefix ([<id>] …)`. So the prompt prose is not the gap. The gap is that this is the last Flow workflow where id resolution is PROSE HANDED TO A MODEL rather than deterministic code: `_flow-status.yml:56`, `_flow-done.yml:45` and `_flow-gates.yml` (touches job) all shell out to `.flow/bin/parse-task-id.mjs \"$HEAD_REF\" \"$PR_TITLE\"`, and `_flow-review.yml` invokes it nowhere. That is what CAN-52 was actually about — a reliable second source, resolved in code — and the review gate never got it."
  - "2026-09-22 (orchestrator): WHY PROSE IS NOT GOOD ENOUGH HERE SPECIFICALLY. The qa reviewer's entire verdict turns on mapping each acceptance criterion to a proving test. A reviewer that fails to locate the task file has no criteria to map — and `flow-review.mjs verdict` cannot tell that apart from a genuine PASS, because a verdict file saying `{\"verdict\":\"PASS\",\"unproven\":[]}` is well-formed either way. The prompt's `If the branch has no matching task file, say so` is advice; the fail-closed machinery around it only catches a MISSING verdict, never a verdict reached on missing evidence. That is a green gate on unverified work, which is G10's exact failure mode, and it is why criterion 2 below insists the no-task case be MATERIALISED rather than narrated."
  - "2026-09-22 (orchestrator): THE FORK ARGUMENT, PRECISELY — the header already knows the fact and draws the wrong conclusion from it. `_flow-review.yml` lines 34-37 say a fork PR gets no secrets `so the reviewers cannot run there`. The reviewers cannot AUTHENTICATE there; they still START. Three jobs check out the PR head and run `node .flow/bin/flow-review.mjs plan` — code from the head — before claude-code-action is reached. Under `pull_request` that is bounded: GitHub downgrades the token to read-only and withholds secrets whatever the `permissions:` block says."
  - "2026-09-22 (orchestrator): …AND THE BOUND IS NOT CANONICAL'S TO HOLD. THE THIN CALLER OWNS THE TRIGGER — `project-template/.github/workflows/flow-review.yml` declares `on: pull_request`, and the reusable declares only `workflow_call`. An adopting repo that edits its own caller to `pull_request_target` (a change that looks like a fix for `our fork PRs get no review`) hands fork-authored code and a fork-authored diff to three jobs running `--permission-mode bypassPermissions` with `pull-requests: write`, `id-token: write` and a real `CLAUDE_CODE_OAUTH_TOKEN`. Canonical cannot patch that downstream: the fleet consumes `_flow-review.yml` at a pinned tag, in their CI. `.flow/config.yml` lists this class first under `security.focus` — `a mistake in a reusable workflow executes with the caller's credentials, in every repo that adopted it`. The fence belongs in the reusable, where it holds whatever the caller does."
  - "2026-09-22 (orchestrator): TWO TRAPS IN `flow-review-workflow.test.mjs`, BOTH OF WHICH LOOK LIKE THE WORKER BREAKING A SECURITY TEST. (1) `test(\"no reviewer is fenced on the branch name or the PR author\")` pins `wf.jobs.plan.if` as an EXACT STRING equal to `${{ vars.FLOW_AI == 'true' && github.event.pull_request.draft != true }}`, deliberately, so a smuggled re-fence fails there. Adding the fork check WILL fail it. It must be updated, never deleted, and its comment must record why a fork boundary is not an author fence — criterion 6 of flow-0007 is `identical checks whoever opened the PR`, and a fork check is about whose CODE the runner executes, not about who opened the PR. (2) The same test asserts `doesNotMatch(reusableSrc, /head\\.ref/)` over the whole file. So plumb the branch in as `${{ github.head_ref }}` — underscore, the form `_flow-gates.yml` already uses — and NOT `github.event.pull_request.head.ref`, which `_flow-status.yml` uses and which would trip that assertion and make the fix look like a loosened guard."
  - "2026-09-22 (orchestrator): WHY ONE TASK AND NOT TWO. The three items are one file plus one test file, and the test file is the same one both halves must edit. Split into two tasks they can never run in parallel (`touches` intersect on both), and the second inherits a rebase conflict in `flow-review-workflow.test.mjs` for no gain. They are also one theme: the review gate's own wiring is the part of Flow that never caught up with the rest of the fleet."
  - "2026-09-22 (orchestrator): NO CALLER ACTION. Nothing here changes the reusable's `workflow_call` inputs or its declared secret, so the fleet's pinned `@v2` callers need no edit — a MINOR/PATCH advance of the alias, not a MAJOR one, per `docs/flow-versioning-policy.md`. Say so in the CHANGELOG entry; the policy asks every entry to state caller action explicitly, and `none` is a statement."
  - "2026-09-22 (worker): TOUCHES CORRECTED, and the omission was the orchestrator's. The list declared `.flow/bin/flow-review-adapter.test.mjs` but not `.flow/bin/flow-review.mjs`, the adapter it tests — and the adapter is exactly where canonical's own store location has to be pinned, because the template CLI resolves `.flow/tasks/` from the process cwd. Without it canonical's gate would resolve tasks correctly in CI (cwd is the workspace root) and wrongly everywhere else, which is the failure the adapter exists to prevent and which every command still exits 0 through. This is a missing declaration, not scope creep: the Scope section already says resolve the id in code, and it is corrected here on the store plane rather than absorbed silently on the branch, per the protocol's rule on discovering a path outside `touches`."
  - "2026-09-22 (human): RATIFIED, so the two notes above stop being provisional. Priority 3 stands as a decision rather than a default, and the three items stay ONE task. Do not re-derive the priority and do not re-litigate the split — if either is reopened it wants a new note saying who reopened it and why."
---

## Context

CAN-52 established that a Flow task id has **two** sources, not one. The branch is canonical when
it is a `flow/<id>-…` branch, but a cloud or web session is handed a `claude/…` branch by its
harness and told not to rename it — the protocol itself says so at step 3 of the loop, and names
the **PR title** as the load-bearing identifier. `project-template/.flow/bin/parse-task-id.mjs`
is the fix: branch first, title second, exit 0 and print nothing when neither carries an id.

That fix was wired into every workflow that keys off a task id — `_flow-status.yml` (`in_review`,
re-open), `_flow-done.yml` (`done`), and the `touches` job in `_flow-gates.yml`, whose comment
records that without it the scope guard *silently skipped every cloud-session PR*.

`_flow-review.yml` was missed. It invokes `parse-task-id.mjs` nowhere. Instead each reviewer is
told in prose to go and find `the task file in .flow/tasks/ whose id is in the branch name
(flow/<id>-…) or the PR title prefix ([<id>] …)` — a search, performed by the thing being graded
on the result, inside a prompt that also says *Do NOT read the repository at large*. When it
works it is fine. When it does not, the qa reviewer has no acceptance criteria to map tests
against, and **nothing downstream can tell**: `flow-review.mjs verdict` is fail-closed against a
*missing* verdict, not against a verdict reached without evidence. A well-formed
`{"verdict":"PASS","unproven":[]}` written by a reviewer that never found the task reads exactly
like a pass. That is a green gate on work nobody checked — G10's stated failure mode, in the one
workflow whose whole job is to stop it.

The second half is a different kind of gap in the same file. Three jobs run
`anthropics/claude-code-action` with `--permission-mode bypassPermissions`, and the file's own
header justifies the absence of a fork fence by citing GitHub's behaviour: *a PR from a FORK gets
no secrets, so the reviewers cannot run there*. The fact is right; the inference is not. The jobs
still start, check out the PR head, and execute `.flow/bin/flow-review.mjs` **from that head**
before the action is ever reached. Under `pull_request` that is contained by the platform. But
**the thin caller owns the trigger** — the reusable declares only `workflow_call` — so the
containment is a property of a file in the *adopting* repo, which canonical does not control and
cannot retro-fix once the fleet has pinned a tag. One adopting repo changing its own caller to
`pull_request_target`, for the entirely sympathetic reason that fork PRs get no review, turns
three `bypassPermissions` jobs loose on attacker-authored code with the caller's real secrets.
`.flow/config.yml` names that class first under `security.focus`.

Neither half is on fire today. Both are cheap to close, and both get more expensive the longer the
fleet runs on a pinned `@v2`.

## Scope

Three changes to `_flow-review.yml` and the tests that pin it.

1. **Resolve the id in code, in the `plan` step.** Run `.flow/bin/parse-task-id.mjs` against the
   branch *and* the PR title, and materialise the resolved task file into the bounded context
   (`.flow-review/`) alongside `diff.patch` and `files.txt`, so the reviewers are *handed* the
   criteria rather than sent to look for them. The approach is prescribed rather than left open,
   which this repo normally avoids: it is the whole lesson of CAN-52, and a second prose fix would
   leave the same hole in a better sentence.
2. **Fence the fork boundary on `plan`.** `plan` is already the single gate for all four jobs —
   `qa`, `code-review` and `security` each declare `needs: plan` — so the fence goes there and
   nowhere else, exactly as the draft clause (flow-0039) does.
3. **Prompts point at the materialised context.** Step 1 of each reviewer prompt — the bounded
   reading list — names the resolved task file in `.flow-review/`, and names the PR title as a
   source of the id on equal footing with the branch. The qa and code-review prompts already carry
   the title prose; this keeps it and stops the prompt being the *only* thing carrying it.

Plus a `CHANGELOG.md` entry under `## Unreleased` stating **no caller action required**.

Deliberately **not** touched:

- **`parse-task-id.mjs` itself.** Its logic is correct and proven; this task consumes it. No new
  id shapes, no change to branch-wins-over-title.
- **`_flow-status.yml`, `_flow-done.yml`, `_flow-gates.yml`.** They already carry the fallback.
- **`allowed_bots: "*"`, `continue-on-error: true`, the `always()` verdict steps, and
  model-from-config.** Every one is pinned by a test for a reason, and none of them is the fork
  boundary. A fork fence that also weakened any of these is a failed task, not a bonus.
- **The security job's unconditional applicability report.** `wf.jobs.security.if` must stay
  `undefined`: gating the job would make the check vanish from the PR. The fence lives on `plan`,
  which is a suppression the whole gate already has two of.
- **The thin caller (`project-template/.github/workflows/flow-review.yml`) and its trigger.** The
  point is that the reusable holds regardless of what a caller does; changing the caller would be
  fixing the one copy canonical can see.
- **Branch protection, repo settings, and the `review:` config schema.** No new config keys.

## Acceptance criteria

- [ ] Given a PR whose head branch does not match `flow/<id>-…` (e.g. `claude/quiet-edison-9f2k`)
      and whose title is `[<id>] …`, when the review gate's plan step runs, then the task file for
      `<id>` is resolved via `parse-task-id.mjs` and written into the bounded context directory,
      and the resolved id appears in the plan's run summary.
- [ ] Given a PR where neither the branch nor the title carries an id, when the plan step runs,
      then it still exits 0 and the bounded context records **explicitly** that no task was
      resolved — an artefact a reviewer must read, not a sentence in a prompt it may ignore.
- [ ] Given the reusable workflow's parsed prompts, when each reviewer prompt's bounded reading
      list is inspected, then it names the materialised task file in `.flow-review/` and names the
      PR title alongside the branch as a source of the id.
- [ ] Given a PR whose head repository is not the repository running the workflow, when the review
      gate is evaluated, then the `plan` job does not run, and therefore no job invoking
      `claude-code-action` with `--permission-mode bypassPermissions` starts.
- [ ] Given an ordinary same-repo, non-draft PR in a repo with `FLOW_AI=true`, when the gate is
      evaluated, then all four jobs still run — proven by asserting `plan`'s `if` expression
      equals exactly the three-conjunct form (opt-in, draft, same-repo) and nothing more.
- [ ] Given the updated `flow-review-workflow.test.mjs`, when it runs, then it still fails a
      workflow containing `head.ref` or `github.actor` — the author fence stays forbidden, and the
      test's comment states why a fork boundary is not one.
- [ ] Given `CHANGELOG.md`, when the `## Unreleased` section is read, then it carries an entry for
      this change that states no caller action is required.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

No open decisions — this is `ready`. Two things to read before writing a line, both in the notes
above: the exact-string `plan.if` assertion and the repo-wide `/head\.ref/` assertion in
`flow-review-workflow.test.mjs` are both trip-wires this task must cross deliberately, and
crossing either carelessly produces a diff that reads as *worker weakens security test*.

One thing worth surfacing rather than guessing: if materialising the task file turns out to need a
new output from `runPlan` in `project-template/.flow/bin/flow-review.mjs`, that is in scope and its
`touches` glob is declared — but keep it to what criteria 1 and 2 need. The verdict path, the
security decision and the diff bound are not this task's.
