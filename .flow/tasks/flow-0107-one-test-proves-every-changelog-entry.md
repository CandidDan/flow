---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0107"
title: "One canonical test proves every task's changelog entry, and task-writer names it in the criterion"
status: "blocked"
priority: 2
project: "flow"
owner: "claude-worker-flow-0107"
created: "2026-09-30"
started: "2026-09-30T06:34:43Z"
branch: "flow/flow-0107-store-wide-changelog-entry-test"
pr: "https://github.com/CandidDan/flow/pull/139"
issue: ""
blocked_reason: "Waits on release PR #142, which fixes flow-0097's changelog entry so changelogEntry finds it. Both scope questions are decided (see notes). When #142 merges: rebase flow/flow-0107-store-wide-changelog-entry-test onto main, rerun the gate, gh pr ready 139."
blocked_by: ["https://github.com/CandidDan/flow/pull/142"]
serves: ["G10"]
touches:
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - ".flow/bin/changelog-fragments.test.mjs"
  - "changes/flow-0107.md"
labels: [task-writer, changelog, qa]
notes:
  - "2026-09-30 (orchestrator): flow-0098 (#129), flow-0101 (#134) and flow-0102 (#135) each failed qa on the same criterion, 'changes/<id>.md exists and says <caller action>', because nothing told the worker a test was owed. Each fix was a hand-written one-off test; flow-0099 (#132) shipped with none. task-writer produces this criterion by habit and never says how it is proved."
  - "2026-09-30 (orchestrator): Design decided here, not left to the worker: ONE test over the store, not one per task. The task's criterion then names that test, so qa can map it by name and the worker writes nothing extra. The test reads entries through changelogEntry (.flow/bin/changelog-entry.mjs), so it survives a release assembling the fragment."
  - "2026-09-30 (worker): BUILD COMPLETE and pushed on flow/flow-0107-store-wide-changelog-entry-test. All three touched files are done: the store-wide test `every claimed task that declares a changelog fragment has an entry stating its caller action` plus six fixture tests in .flow/bin/changelog-fragments.test.mjs, the task-writer pre-flight citation (file + exact test name, stated conditionally), and changes/flow-0107.md (no caller action). GATE: build green (34 workflows), lint green (101 .mjs), coverage 95.89% vs floor 83.5, test 1482/1484 pass with 1 skip and EXACTLY ONE failure - the new live-store test itself, reporting a real defect it is designed to find: `flow-0097: declares changes/flow-0097.md in touches but has no changelog entry - neither the fragment nor an assembled entry in CHANGELOG.md`. flow-0097 (done, PR #128, shipped in 2.1.2) declared its fragment and never wrote it; CHANGELOG 2.1.2's summary prose mentions flow-0097 but there is no bullet ending `, flow-0097)`, so changelogEntry returns empty. Writing changes/flow-0097.md is outside this task's touches, so criterion 5 (live store passes) cannot be met inside scope. DECISIONS already taken, so a fresh session need not re-litigate them: (a) the status filter is in_progress/in_review/done - `blocked` is skipped alongside `ready` on the spec's own stated rationale (nothing has been written yet), because eight blocked tasks (flow-0022/0030/0046/0053/0082/0083/0086/0110) declare fragments they never wrote and the literal `status is not ready` reading fails on all of them too; (b) `done` stays IN scope because criterion 4 (a fragment a release assembled) is only reachable for a done task, so excluding done would make that criterion vacuous and gut the reason changelog-entry.mjs exists; (c) the store readers (frontmatter/scalar/list, both YAML list forms) are duplicated locally in the test file because flow-doctor's parseListField is module-private and that file is outside touches. NEXT ACTION: see blocked_reason - one decision, then the branch needs at most a one-file addition and is PR-ready."
  - "2026-09-30 (orchestrator, human-approved): Both questions decided. (1) Do NOT write changes/flow-0097.md: flow-0097 shipped in 2.1.2, and a new fragment would list it again under 2.2.0. Instead, release PR #142 adds `(.github/workflows/_flow-gates.yml, project-template/.flow/bin/source-roots.mjs, flow-0097)` to its existing CHANGELOG bullet, so changelogEntry finds it. touches unchanged. (2) The status filter as built (in_progress, in_review, done; skip ready AND blocked) is accepted: the reason for skipping ready applies equally to the blocked tasks that never started."
---

## Context

Every canonical task that ships a user-visible change declares `changes/<id>.md` in `touches` and
carries a criterion that the fragment exists and states the caller action. qa, rightly, wants a
test for every criterion. Workers keep missing it, and the fixes so far are near-identical one-off
tests scattered across files. The per-task copy is the bug: one test over the store proves the
criterion for every task at once.

## Scope

**Does:**
- Add to `.flow/bin/changelog-fragments.test.mjs` a test named exactly
  `every claimed task that declares a changelog fragment has an entry stating its caller action`. It reads every task in `.flow/tasks/` (skipping `_TEMPLATE.md`); for each task whose
  status is not `ready` and whose `touches` lists `changes/<its-id>.md`, it asserts
  `changelogEntry(REPO, id)` is non-empty and matches `/caller action/i`. A failure names the task
  id. `ready` tasks are skipped: nothing has been written yet. On a feature branch the task file is
  the frozen `in_progress` snapshot, which is exactly the state that makes the check apply.
- In `project-template/.claude/skills/task-writer/SKILL.md`, next to the existing pre-flight
  instruction to list `changes/<id>.md` in `touches`: where the repo keeps a `changes/` directory,
  the changelog criterion names the test that proves it. In canonical that is
  `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`. Write it in a way that stays true in an adopting
  repo (no claim that the test exists there). Keep the existing sentences the skill test at
  `changelog-fragments.test.mjs` line ~334 pins.
- Changelog fragment `changes/flow-0107.md`. **No caller action.**

**Does not touch:** the one-off tests already written for flow-0094, 0098, 0101 and 0102 (they stay;
removing them is churn); `changelog-entry.mjs`; the task template; any existing task's criteria.

## Acceptance criteria

- [ ] Given a claimed task that declares `changes/<id>.md` in `touches` and has no fragment and no
      assembled entry, then the new test fails naming that id (prove with a fixture store and
      repo, not only the live one).
- [ ] Given such a task whose entry exists but never mentions a caller action, then it fails.
- [ ] Given a `ready` task declaring a fragment that does not exist yet, then it passes.
- [ ] Given a task whose fragment was assembled into `CHANGELOG.md` by a release, then it passes.
- [ ] Against canonical's live store, the test passes.
- [ ] The task-writer skill names the test, by file and exact name, as the proof of the changelog
      criterion, and a test asserts the skill text contains that name.
- [ ] `changes/flow-0107.md` exists and states no caller action is needed, proved by the new store-wide
      test itself.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
