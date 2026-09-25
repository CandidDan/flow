---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0082"
title: "A failed qa or code-review check dispatches a bounded auto-fix worker onto the same PR"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-09-25"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits on flow-0079. Until the reviewers read their config and helper from the base branch, an auto-fix commit could edit `review.security_paths` or `flow-review.mjs` in the same PR, so the loop could 'fix' the reviewer instead of the code."
blocked_by: ["flow-0079"]
serves: ["G12", "G10"]    # G12: every escalation is one decision card. G10: a fix may not pass review by weakening the tests.
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
  - "2026-09-25 (orchestrator): From the human, after PR #108 (flow-0076) sat red on a precise, mechanical code-review finding (a CRLF gap) until a human noticed and started a session. PR #109 (flow-0077) then did the same thing the same day. The protocol calls a red review check a kickback (PROTOCOL.md step 9), but nothing dispatches one: the worker stops at `gh pr ready` and the queue runner only takes `ready` tasks. The human was acting as a relay."
  - "2026-09-25 (orchestrator): DECIDED WITH THE HUMAN: automatic, bounded, and off by default. Rounds are capped (default 2, hard max 3, with a warning above that). qa and code-review only; a failed security check is never auto-fixed. Gated behind FLOW_AI like the other AI workflows. The fixer may dispute a finding, which hands the PR to the human."
  - "2026-09-25 (orchestrator): DECIDED: ESCALATION IS A LABEL PLUS A DECISION CARD, NOT `blocked`. `blocked` is the worker's own judgment transition, and blocking a task on its own open PR has no clean way to clear. The PR gets `flow:needs-human`, and the task stays `in_review`. The label is also the off switch for that PR: the kickback workflow never acts on a labelled PR, and removing the label re-arms it."
  - "2026-09-25 (orchestrator): AMENDED BY THE HUMAN: a label alone is the '12 questions' problem again, a PR to dig through. Every escalation posts ONE decision card, the G12 shape: the finding, what the worker tried or why it disputes it, a recommendation (merge as is, or kick back with a named change), and the alternative. The card is what makes the label actionable from a phone."
  - "2026-09-25 (orchestrator): AMENDED BY THE HUMAN: guard against passing review by weakening the tests. The easiest way for a model to satisfy 'criterion X has no proving test' is to loosen an assertion or rename a test until the reviewer is satisfied. An auto-fix round may add or strengthen tests; a round whose commits delete a test or remove an assertion escalates instead of pushing. This is why the WORKFLOW pushes, not the fixer: the check has to sit between the commit and the push."
  - "2026-09-25 (orchestrator): AMENDED BY THE HUMAN: blocked_by flow-0079. Before it lands, the reviewers read `review.security_paths` and `flow-review.mjs` from the PR head, so an auto-fix commit could change the reviewer itself. flow-0079 closes that route. A diff-level guard here would duplicate flow-0079, so there isn't one."
  - "2026-09-25 (orchestrator): DECIDED: DO NOT TOUCH `_flow-review.yml`. flow-0079 is editing it, and the fixer and the card writer can read the verdicts from the PR conversation, where every reviewer already posts them. Triggering off the review workflow's completion needs no change to it."
  - "2026-09-25 (orchestrator): NOT parallel-safe with flow-0050, flow-0070 and flow-0077 (all share `project-template/.flow/config.yml`) or flow-0080 (shares `docs/flow-reusable-workflows.md`). pick-task skips it while any of them is in progress; whichever lands second rebases."
---

## Context

The three Definition-of-Done reviewers (qa, code-review, security) run as blocking checks on the
PR (`_flow-review.yml`, flow-0007). When one fails, the protocol treats it as a **kickback**
(`project-template/.flow/PROTOCOL.md`, step 9): address it on the same branch, re-run the gate,
re-request review. Today nothing starts that work. The worker session ended at `gh pr ready`, and
`_flow-queue-runner.yml` only picks `ready` tasks, so an `in_review` task with a red check waits
for a human to notice and start a session.

PRs #108 and #109 are the motivating cases. In each, code-review posted a blocking finding naming
the file, the line, the cause and the fix. The human added nothing but the delay of noticing it.

Automating that relay does not weaken "a worker cannot self-certify". The fix is re-reviewed in
CI from scratch, and merge stays human. The risks are:

- loops between fixer and reviewer;
- fixes to false positives;
- passing review by weakening the tests;
- escalations that hand the human a PR to dig through instead of a decision (G12);
- spending quota.

The bounds below are the substance of the task, not decoration.

## Scope

**Does:**

### Workflow and trigger

- **New reusable `_flow-kickback.yml`**, plus a thin caller in the template
  (`project-template/.github/workflows/flow-kickback.yml`) and canonical's own caller
  (`.github/workflows/flow-kickback.yml`), following the existing reusable/caller split (see
  `docs/flow-reusable-workflows.md`).
- **Trigger:** `workflow_run` on the `flow-review` workflow, `types: [completed]`, acting only
  when the run's conclusion is `failure`. No polling, no schedule.
- **Concurrency:** a group keyed on the PR number, so one kickback runs per PR at a time.

### Deciding whether to dispatch

- **Decision logic is code, not YAML.** `project-template/.flow/bin/flow-kickback.mjs` holds
  pure, dependency-free functions (`decide`, `weakensTests`, `decisionCard`). The workflow
  gathers facts and acts on the results. Canonical's `.flow/bin/flow-kickback.mjs` is a thin
  adapter, per the adapter convention in canonical's `CLAUDE.md` (no copy, no symlink).
- **`decide(facts)`** returns `dispatch`, `skip`, or `escalate`, with a one-line reason. Its
  inputs:
  - which review jobs failed;
  - whether the PR is a draft;
  - whether the PR is from a fork;
  - the PR's labels;
  - the task's status on `main`;
  - rounds already used;
  - the configured cap;
  - whether `FLOW_AI` is `true`;
  - whether `FLOW_PAT` is present.
- **Checks, in order.** The first one that applies decides the result.
  1. `FLOW_AI` is not `true`: **skip**.
  2. `review.auto_fix_rounds` resolves to 0: **skip**, "auto-fix off".
  3. `FLOW_PAT` is absent: **skip**. Pushes and `gh pr ready` made with `GITHUB_TOKEN` do not
     trigger workflows, so a fix made without it would never be re-reviewed.
  4. The PR is from a fork: **skip**. This matches the fork fence in `_flow-review.yml`.
  5. The PR resolves to no task id (from branch or title, as `flow-status` does), or the task is
     not `in_review` on `main`: **skip**.
  6. The PR is a draft or already carries `flow:needs-human`: **skip**.
  7. The security job failed, alone or alongside others: **escalate** (security).
  8. Rounds used equals the cap: **escalate** (exhausted).
  9. Otherwise, with only qa and/or code-review failed: **dispatch**.
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

### One auto-fix round

1. Record the PR head SHA as this round's **base**.
2. Append the round note to the task on `main`.
3. Convert the PR to draft (`gh pr ready --undo`), so the round's work does not trigger three
   reviewers part-way through.
4. Run a fresh `claude-code-action` worker on the PR branch. Use the same action pin,
   credentials and model settings as `_flow-queue-runner.yml`'s worker, with two limits:
   - `git push` and `gh pr ready` are in the worker's disallowed tools;
   - the checkout does not persist credentials.
5. The worker **commits but does not push**, and writes `.flow-kickback/outcome.json`, described
   below.
6. The workflow checks the round, in this order. The first check that fails **escalates**, and
   nothing is pushed.
   1. `outcome.json` exists and parses, or the round escalates as "did not hand back".
   2. If the outcome is `disputed`, the round escalates with the worker's own reasoning.
   3. The remote branch head still equals the base. If it moved, the worker pushed despite the
      limit, and the round escalates.
   4. `weakensTests(diff base..HEAD)` is empty, or the round escalates as "weakened tests".
7. If every check passes, the **workflow** pushes and runs `gh pr ready`, which triggers review
   again. Whatever that review says re-enters at "Deciding whether to dispatch".

A final `if: always()` step makes sure a round that died part-way still ends in an escalation.
A dead round must never leave a draft PR that nothing is watching.

### The fixer's prompt

The prompt says:

- Read the failing reviewers' verdict comments on the PR (`gh pr view <n> --comments`). Address
  their **blocking** findings only; non-blocking notes are not a mandate.
- Stay inside the task's `touches`, which `touches-guard` enforces anyway.
- You may add tests and strengthen assertions. Never delete, rename, skip or loosen one; the
  workflow checks this, and a round that does it escalates.
- Run all five gate commands, then commit. Do not push or mark the PR ready; the workflow does.
- **Disputing is allowed.** If a finding is wrong, change no code for it. Record the dispute in
  `outcome.json`.
- Never edit `.flow/tasks/`. Never spawn a review agent.

The `outcome.json` shape:

```
{"outcome": "fixed" | "disputed",
 "finding": "…",
 "tried": "…",
 "recommendation": {"action": "merge" | "kickback", "change": "…"},
 "alternative": "…"}
```

For `fixed`, `tried` says what changed, and the other fields are still filled in. They become
the card if a later check escalates the round.

### The test-weakening guard

`weakensTests(diff)` is a pure function over a unified diff. It returns the offending lines,
each with file and reason; empty means clean.

- **Test files** match `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`, or live under `test/`,
  `tests/` or `__tests__/`.
- **A trip is any of these:**
  1. A test file deleted or renamed.
  2. A removed line, in a test file, that declares a test (`test(`, `it(`, `describe(`,
     `def test_`).
  3. A removed line, in a test file, that contains an assertion (`assert`, `expect(`,
     `.should`).
  4. An added `.skip`, `.only`, `skip:` or `todo:` in a test file.
- **Any removed assertion line counts, even when the same edit adds a replacement.** That is
  conservative on purpose. Adding a new assertion is always allowed, and a rewrite that really
  is stronger costs a human one tap on the card. A loosened assertion that slipped through would
  cost a gate that lies (G10).

### The decision card

Every escalation posts ONE PR comment built by `decisionCard(input)`, then adds
`flow:needs-human`. The card is the G12 shape, readable from a phone:

1. **Finding:** the failing check and its blocking finding, in one or two sentences, with a link
   to the reviewer's full comment rather than a quote of it.
2. **Tried / disputed:** what the worker changed, or why it disputes the finding, or why nothing
   was attempted (security, exhausted, weakened tests, did not hand back).
3. **Recommendation:** exactly one of "merge as is" or "kick back with: <a named change>".
4. **Alternative:** the other option, and what it costs.

Plus one footer line: rounds used out of the cap, and how to re-arm (remove the label).

- **Where the card's content comes from:**
  - For a disputed round, and for a round the guard stopped, the card comes from the worker's
    `outcome.json`, amended with the guard's reason.
  - Every other escalation (security, exhausted, did not hand back) runs one bounded,
    **read-only** model call. It reads the verdict comments, the round notes and the diff, and
    writes the same four fields. It does not fix anything.
- **Validation is code.** `decisionCard` rejects input missing any of the four fields, or a
  recommendation that is neither `merge` nor `kickback` with a non-empty `change`. On rejection,
  it renders a fallback card that says the recommendation is unavailable and why, and still
  carries the finding and links. The failure is visible, not silent.
- **Length budget:** the rendered card is at most 1,500 characters. Longer fields are cut with
  a link to the source comment.

### Docs and changelog

- Document the workflow, the config key, the label, the decision card and the `FLOW_PAT`
  requirement in `docs/flow-reusable-workflows.md` and in the template caller's header.
- Add a changelog fragment, `changes/flow-0082.md`. **Caller action:** adopt the new
  `flow-kickback.yml` caller (flow-sync delivers it), then set `review.auto_fix_rounds` to opt
  in.

**Does not touch:**

- `_flow-review.yml` or `flow-review.mjs` (flow-0079), or `_flow-queue-runner.yml` (flow-0080).
- `_flow-status.yml`. The task stays `in_review` throughout. Converting to draft is not a status
  transition, and `flow-status` already treats it as a no-op.
- The flightdeck. Showing "auto-fix 1/2 used" or surfacing the cards there is a later task.
- `flow-gates` failures. The worker owns the gate before hand-off, and a red gate on a ready PR
  is a different problem.

## Acceptance criteria

Unit tests go in `flow-kickback.test.mjs`. Workflow-structure assertions go in
`.flow/bin/flow-kickback-workflow.test.mjs`.

**`decide`**

- [ ] Given every condition holds and code-review alone failed, then `dispatch`.
- [ ] Given qa and code-review both failed and all else holds, then `dispatch`.
- [ ] Given the security job failed, alone or alongside others, then `escalate` (security).
- [ ] Given `FLOW_AI` not `true`, `FLOW_PAT` absent, a fork PR, a draft PR, a PR labelled
      `flow:needs-human`, a task not `in_review`, or no resolvable task id, then `skip`, with a
      reason naming the condition. There is one test per condition.
- [ ] Given `review.auto_fix_rounds` absent or 0, then `skip`, "auto-fix off".
- [ ] Given `review.auto_fix_rounds: 5`, then the effective cap is 3 and a warning names the
      configured 5.
- [ ] Given cap 2 and two `(auto-fix): round` notes, when review fails again, then `escalate`
      (exhausted). Given one note, then `dispatch` as round 2/2.
- [ ] Round counting counts only notes with the exact `(auto-fix): round` prefix. An unrelated
      note that mentions auto-fix is not counted.

**`weakensTests`**

- [ ] Given a diff that only adds a new test and new assertions, then it returns empty.
- [ ] Given a diff deleting a test file, or renaming one, then it trips, naming the file.
- [ ] Given a diff removing a `test(`/`it(` declaration line, then it trips.
- [ ] Given a diff that replaces `assert.deepEqual(x, [1, 2])` with `assert.ok(x)`, then it trips
      as a removed assertion.
- [ ] Given a diff adding `{ skip: true }`, `.skip(` or `.only(` in a test file, then it trips.
- [ ] Given a diff removing an `assert` line from a non-test source file, then it does not trip.
- [ ] Given a Python diff removing `def test_` or an `assert` line under `tests/`, then it trips.

**`decisionCard`**

- [ ] Given all four fields with a `kickback` recommendation, then the card renders:
  - the finding;
  - tried/disputed;
  - "kick back with: <change>";
  - the alternative;
  - the rounds footer and the re-arm instruction.
- [ ] Given a `merge` recommendation, then the card says "merge as is".
- [ ] Given input missing any field, or `kickback` with an empty `change`, then it renders the
      fallback card. The fallback says the recommendation is unavailable and still carries the
      finding and the link.
- [ ] Given fields long enough to exceed the budget, then the rendered card is at most 1,500
      characters and links to the source comment.

**The workflow** (structure tests)

- [ ] It triggers on `workflow_run` for `flow-review` with `types: [completed]`, and has a
      concurrency group keyed on the PR.
- [ ] Its `claude-code-action` pin equals `_flow-queue-runner.yml`'s.
- [ ] The fixer step disallows `git push` and `gh pr ready`, and its checkout sets
      `persist-credentials: false`.
- [ ] The push and `gh pr ready` happen in a workflow step that runs only after the outcome
      check, the remote-head check and the `weakensTests` check, in that order.
- [ ] An `if: always()` step escalates a round that ended with the PR still draft and unlabelled.
- [ ] Every escalation path posts through `decisionCard` and adds `flow:needs-human`. No path
      adds the label without a card.
- [ ] Its `permissions:` block names only what the steps use, and never grants `workflows:`.
- [ ] No PR title, branch name, comment body or `outcome.json` field is interpolated directly
      into a `run:` block; each passes through `env:` or a file.
- [ ] The fixer prompt contains the no-weakening rule, the commit-don't-push rule, the dispute
      instruction and the rule never to edit `.flow/tasks/`.

**Config and docs**

- [ ] `project-template/.flow/config.yml` has `auto_fix_rounds` only commented out; canonical's
      `.flow/config.yml` sets it to 2.
- [ ] The template caller and `docs/flow-reusable-workflows.md` document the config key, the
      label, the decision card and the `FLOW_PAT` requirement.
- [ ] `changes/flow-0082.md` exists and states the caller action.

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
- `weakensTests` is a line heuristic, and deliberately errs towards escalating. Its known limit:
  a weakening that touches no assertion or declaration line (say, a changed fixture that makes
  an assertion trivially true) is not caught. That is qa's job on the re-review, and the
  limitation belongs in the function's doc comment, not hidden.
- If `gh pr ready --undo` fails because the PR is already a draft, treat that as the draft-skip
  case and do not dispatch. Do not force it.
