---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0110"
title: "flow-triage allocates task ids through allocate-task-id.mjs, so it can never duplicate one"
status: "in_review"
priority: 1
project: "flow"
owner: "claude-cowork-orchestrator"
created: "2026-09-30"
started: ""
branch: "flow/flow-0110-triage-allocates-ids-via-helper"
pr: "https://github.com/CandidDan/flow/pull/138"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G8"]
touches:
  - ".github/workflows/_flow-triage.yml"
  - ".flow/bin/triage-allocate-id.test.mjs"
  - "changes/flow-0110.md"
  - "docs/adr/0005-split-authoring-from-release.md"
  - ".flow/bin/workflow-prompt-paths.test.mjs"
labels: [flow-triage, concurrency, task-ids]
notes:
  - "2026-09-30 (orchestrator): Happened on 2026-09-30. A local session allocated flow-0104 (06:07:23Z) and flow-0105 (06:07:31Z) through allocate-task-id.mjs. The triage run then committed its own flow-0104 (06:08:22Z) and flow-0105 (06:08:23Z). The filenames differed, so the push rebased cleanly and main held two files per id. flow-doctor FAILed and canonical's own 'flow-doctor reports no consistency failures' test went red on every branch cut from main. Repaired by hand: the triage pair were renumbered flow-0108 and flow-0109."
  - "2026-09-30 (orchestrator): Cause: step 3 of the triage prompt in _flow-triage.yml says 'create the ready task file in .flow/tasks/ with the next id ... commit it to main'. The model picks the id itself from its checkout. allocate-task-id.mjs --write is the only allocation path that re-reads the store after a refused push, and triage never calls it. Priority 1: every triage run that overlaps a human session can repeat this."
  - "2026-09-30 (worker): Branch flow/flow-0110-triage-allocates-ids-via-helper pushed. DONE: _flow-triage.yml rewritten — step 3 of the prompt now creates task files only via `node \"$FLOW_BIN\"/allocate-task-id.mjs --write`, with a flow-0094-style `Materialise canonical helpers` step (lifted verbatim from _flow-gates.yml, only the `for helper in` line differs) and a new optional `flow_ref` workflow_call input for GHES. `npm run build` green. NOT DONE YET: .flow/bin/triage-allocate-id.test.mjs, changes/flow-0110.md, full gate, PR. NEXT: write the test file then run lint/test/coverage."
  - "2026-09-30 (worker): BLOCKED, work complete and pushed on flow/flow-0110-triage-allocates-ids-via-helper (2 commits). GENUINELY DONE: _flow-triage.yml step 3 now creates task files only via `node \"$FLOW_BIN\"/allocate-task-id.mjs --write` with --repo-root/--prefix/--content-file/--slug, forbids hand-picking an id or writing/committing a task file any other way (including as a fallback when the allocator fails), and uses the id the allocator prints; a flow-0094-style materialise step lifted verbatim from _flow-gates.yml (only the `for helper in` line differs, which the new test pins byte-for-byte) plus an optional `flow_ref` input for GHES; `.flow/bin/triage-allocate-id.test.mjs` with 15 passing tests covering AC1-AC6; `changes/flow-0110.md`. LOOKS DONE BUT IS NOT: the gate. `npm test` is 1473/1476 — the two failures are `workflow-prompt-paths.test.mjs` AC2 (flow-0018 froze _flow-triage.yml`s `on:` block) and `adr-split-authoring.test.mjs` (the ADR-0005 amendment`s 47-file count is now 48). Both live outside this task`s `touches`, so they were left alone. Coverage not run. NEXT ACTION: orchestrator picks reading A or B in `blocked_reason`; then the worker either widens `touches` by those two files and makes two one-line edits, or swaps the materialise step + `flow_ref` input for the paired `project-template/` citation."
  - "2026-09-30 (orchestrator, human-approved): Reading A decided. Keep the Materialise-canonical-helpers step and the optional flow_ref input already on flow/flow-0110-triage-allocates-ids-via-helper (PR #138): a repo that has never run flow-sync must still get the allocator, which is why flow-0094 exists. touches widened by the two files the worker named. NEXT ACTION: on that branch, bump the ADR-0005 amendment count from 47 to 48 files, widen flow-0018's TRIAGE_STRUCTURE_BEFORE snapshot in workflow-prompt-paths.test.mjs to allow the new optional flow_ref input (only that; the rest of the on: block stays frozen), rerun the gate, then gh pr ready 138."
  - "2026-10-01 (orchestrator): NEXT ACTION done on the branch: rebased onto main, ADR-0005 count 47 -> 48, TRIAGE_STRUCTURE_BEFORE admits flow_ref only. Gate green locally apart from the two Mac-only flow-validation/ findings. PR 138 marked ready."
---

## Context

`allocate-task-id.mjs --write` is first-push-wins: it writes `.flow/tasks/<id>-<slug>.md`, commits,
pushes, and on a refused push re-reads the store and takes the next free id. A git conflict never
catches a duplicate, because two tasks with one id have different filenames. So an allocator that
does not re-derive the id after a rebase will duplicate ids whenever it races another session. The
triage workflow's prompt tells the model to choose "the next id" and commit, which is exactly that.

## Scope

**Does:**
- Change step 3 of the triage prompt in `.github/workflows/_flow-triage.yml` so the task file is
  created ONLY by running `allocate-task-id.mjs --write` (with `--repo-root`, `--prefix` from
  `project.name`, `--content-file` and `--slug`), with the frontmatter `id:` left for the
  allocator to fill. The prompt forbids choosing an id by hand, forbids writing or committing a
  task file any other way, and says to use the id the allocator PRINTS in the commit message and
  the issue comment. Resolve the helper's path the way this workflow already resolves canonical's
  helpers (flow-0094); do not assume `.flow/bin/` in the consuming repo.
- If the job's permissions or tool allowlist do not already let the model run that command, add
  exactly what it needs and nothing more.
- A new canonical test file `.flow/bin/triage-allocate-id.test.mjs` pinning the above against
  the real workflow file.
- Changelog fragment `changes/flow-0110.md`. **No caller action** (the reusable workflow changes; callers
  pick it up with the release).

**Does not touch:** `allocate-task-id.mjs` itself; the proposal lane (steps 1–2, which create no
file); flow-doctor's duplicate check (it already caught this).

## Acceptance criteria

- [ ] The triage prompt's task-creation step names `allocate-task-id.mjs --write` as the only
      way to create a task file, and a test asserts it against the parsed workflow.
- [ ] The prompt contains no instruction to pick "the next id" by hand, and says explicitly not
      to; a test asserts the old phrasing is gone and the prohibition is present.
- [ ] The prompt says the commit message and the issue comment use the id the allocator printed.
- [ ] The helper path in the prompt resolves to canonical's helper under the workflow's own
      checkout, the same way the workflow's other helper calls do; a test asserts it.
- [ ] If an allowlist or permission changed, a test pins the new entry and that nothing broader
      was added.
- [ ] `changes/flow-0110.md` exists and states no caller action is needed, proved by a canonical
      `.flow/bin` test that reads it through `changelogEntry`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
