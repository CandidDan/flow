---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0021"
title: "Make task-id allocation first-push-wins, so two orchestrators cannot land the same id"
status: "in_review"
priority: 2
project: "flow"
owner: "claude/flow-task-workflow-l8ypch"
created: "2026-08-19"
started: "2026-08-24T07:17:36Z"
branch: "flow/flow-0021-atomic-task-id-allocation"
pr: "https://github.com/CandidDan/flow/pull/27"
issue: ""
blocked_reason: ""
serves: ["G2"]            # a green gate worth believing — a guard that does not exist yet
touches: ["project-template/.flow/bin/allocate-task-id.mjs", "project-template/.flow/bin/allocate-task-id.test.mjs", ".flow/bin/allocate-task-id.mjs", ".flow/bin/allocate-task-id.test.mjs"]
labels: [infra, concurrency, store]
notes:
  - "2026-08-19: written after two orchestrator sessions independently allocated the same id on main the same day. The duplicate was caught by flow-doctor, which runs store-wide in the gate, so the first symptom was every open PR going red on a defect none of their authors could fix from a branch."
  - "2026-08-19: the wiring — task-writer SKILL.md, _flow-triage.yml's prompt, PROTOCOL.md's 'Creating a task' paragraph — is deliberately OUT of scope here. Those three files are claimed by flow-0012, flow-0018 and flow-0016, all ready. The orchestrator writes the wiring task once they land; until then this ships as a callable mechanism with a proven guarantee, not as an enforced one."
  - "2026-08-24: handoff. PR #27 open (flow/flow-0021-atomic-task-id-allocation), gate green locally (build/lint/test 466 pass/coverage 95.98%). Shipped: project-template/.flow/bin/allocate-task-id.mjs (pure nextId/idWidth allocator + a git transaction: fetch origin/main, allocate, write, commit, push; on a refused push, discard the attempt, re-fetch, HARD-reset local main to the new origin/main tip, and re-allocate — never pull/rebase/merge/force-push) and its canonical adapter. All nine acceptance criteria have a proving test; the two concurrency ones (refused-push race, five concurrent allocators) use real local git remotes (a bare repo, real clones, real non-fast-forward rejections) rather than mocked git — see the PR body for the criterion-to-test mapping. One judgement call worth recording for whoever reviews or continues this: the retry path resets with --hard, not --soft, onto the freshly-fetched origin/main tip. An earlier draft used `git reset --soft HEAD~1`, which leaves the local branch pointer at the PRE-rival base; committing again against that stale index would silently drop the rival's own file from the tree on the eventual (fast-forward) push — a real bug, caught by the 'real rival commit' test failing with 'exhausted 5 attempts' before the fix (the push kept getting rejected because local main was never actually advancing). --hard avoids that by fully re-syncing before rebuilding the attempt from scratch. Deliberately still NOT wired into task-writer/_flow-triage.yml/PROTOCOL.md (out of scope per this task's notes above — those three files are claimed by flow-0012/flow-0018/flow-0016). Next action for a fresh session: none on this task — wait for the qa/security/code-review checks and human review on PR #27; address any kickback on the same branch."
---

## Context

Claiming a task is safe under concurrency and creating one is not, for a reason worth stating
precisely, because the obvious fix does not fix it.

**Why the claim is safe.** Two workers claiming the same task edit the *same file*. The second
`git push` to `main` is therefore a non-fast-forward and git refuses it, and the protocol tells the
loser to stop rather than to retry (`_flow-queue-runner.yml`: *"If the push is rejected, another
worker claimed it — stop, do nothing further"*). The atomicity lives in git's ref update, not in
anything Flow wrote.

**Why creating one is not.** Two orchestrators both read the store, both see `flow-0020` as the
highest, and both write `flow-0021-<their-own-slug>.md`. Those are *different filenames*. The
loser's `git pull --rebase` replays cleanly — there is nothing to conflict with — and both commits
land. Nothing is refused, nothing is logged, and both sessions believe they succeeded. The id
namespace is a contended resource that no single file represents, so the property the claim gets
for free does not exist here.

`flow-doctor` does catch it (`duplicate id flow-0021 (also in …)`, a PROBLEM, exit 1) — but only
*after* it is on `main`, and because the doctor validates the whole store rather than one task, the
consequence is every open PR turning red at once, on a defect their authors cannot fix from a
branch (the store is `main`-only). This happened on 2026-08-19.

**The trap in the obvious fix.** "Re-read `origin/main` immediately before allocating" narrows the
window and does not close it: both sessions can still fetch, both still see `flow-0020`, and both
still push different filenames successfully. What closes it is refusing the push when the ref moved
— which git already does — and then **re-allocating instead of rebasing**. A `pull --rebase` in the
retry path is the exact step that converts a refusal back into a silent duplicate. That is the
behaviour this task has to make mechanical and prove with a test, rather than write down and hope.

## Scope

**Does:**

- Add `project-template/.flow/bin/allocate-task-id.mjs`, with two separable pieces:
  - **The pure part.** Given the set of task ids present in a store snapshot and the id prefix
    (`project.name` in `.flow/config.yml`), return the next id. Deterministic, no IO, no clock.
    Zero-pad width is derived from the ids that are there, not assumed. Allocation is
    *maximum + 1*, never the lowest free gap — see notes.
  - **The transaction.** Read the store from a freshly fetched `origin/main`, allocate against
    *that*, write the task file under the allocated id, commit it, and push to `main`. If the push
    is refused, re-fetch, re-allocate (the id will now differ), rename the file to match, and
    retry — bounded, default 5 attempts, reporting how many it took. IO is injected the way the
    other helpers do it, so every branch is exercisable without a network or a real remote.
- Add `.flow/bin/allocate-task-id.mjs` — canonical's **adapter**: the CLI shell plus canonical's
  own store location, importing the template's exported logic. Not a copy, not a symlink (a
  symlink resolves the store to the template's fixture store and still exits 0).
- Tests alongside both, including a simulated concurrent-remote harness (below).

**Deliberately does NOT:**

- **Wire it into anything.** `project-template/.claude/skills/task-writer/SKILL.md`,
  `.github/workflows/_flow-triage.yml` and `project-template/.flow/PROTOCOL.md` are the three
  places that today say "allocate the next id", and all three are claimed by live tasks
  (flow-0012, flow-0018, flow-0016). Do not edit them; do not widen `touches` to reach them. The
  wiring is a follow-on task.
- **Change the claim.** It is already correct; do not refactor it to share code with this.
- **Renumber, repair or detect existing duplicates.** `flow-doctor`'s duplicate-id PROBLEM stays
  exactly as it is — it is the backstop, and a backstop that a new guard makes redundant is a
  backstop you find out you needed later.
- **Introduce a counter file, lock file, or any record of "the last id used."** See notes.
- **Touch `.flow/bin/adapters.test.mjs`** (flow-0015's). This task's adapter proves itself in its
  own test file.

## Acceptance criteria

- [ ] Given a store snapshot whose ids are `flow-0001` … `flow-0020` and the prefix `flow`, when
      the next id is computed, then it is `flow-0021`, zero-padded to the width already in use.
- [ ] Given a store with a gap (`0001`–`0005`, then `0009`), when the next id is computed, then it
      is `0010` — the successor to the maximum — and never `0006`.
- [ ] Given an empty store, when the next id is computed, then it is `<prefix>-0001`.
- [ ] Given the working tree contains a task file that `origin/main` does not, when an id is
      allocated, then that file is ignored: the allocation is computed from the fetched
      `origin/main` snapshot only, and a test asserts against the source that no working-tree read
      reaches the allocation path.
- [ ] Given the remote advances between the fetch and the push, when the push is refused, then the
      allocator re-fetches, allocates a **different** id, renames the pending file to match, and
      retries — and a test asserts the id it finally lands is not the id it first computed.
- [ ] Given the retry path, when the source is inspected, then it contains no `pull`, `rebase`,
      `merge` or force-push — asserted mechanically against the source, because a rebase-and-retry
      would silently re-open exactly the hole this task closes.
- [ ] Given five allocators run against one simulated remote that accepts at most one push per
      round, when all five finish, then five task files landed, all five ids are distinct, and no
      id appears twice.
- [ ] Given the retry budget is exhausted, when the allocator returns, then it exits non-zero
      naming the number of attempts, leaves no commit behind, and does **not** allocate anyway.
- [ ] Given the canonical adapter, when it resolves its store, then it resolves canonical's
      `.flow/` and not `project-template/.flow/` (the fixture store) — the same assertion the
      other adapters carry, for the same reason.
- [ ] Given `--dry-run` at canonical's repo root, when the adapter runs, then it prints the id it
      would allocate and exits 0 having written nothing, committed nothing and pushed nothing.
- [ ] Given the repo after this change, when `npm run build`, `npm run lint`, `npm test` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Maximum + 1, never the lowest free gap.** Ids appear in branch names, PR titles and the
  `[<id>]` prefix the automation resolves against. Reusing a retired number re-points that history
  at different work. Gaps are free; collisions are not.
- **No counter file.** A `.flow/tasks/.next-id` would make the namespace a single contended file
  and restore first-push-wins the easy way — and it would also be a second record of a fact the
  store already contains, which is the drift failure mode `VISION.md` NG2 names. Derive it; don't
  record it. If the retry loop turns out to thrash in practice, that is evidence to revisit this,
  and it belongs in a note here rather than in a silent change of approach.
- **This helper writes to `main` by design.** It is store-plane work — the same plane the claim and
  the triage convert-lane already use — and it must never be run from a feature branch. That is the
  one thing no test in this task can prove; say it in the file header where the caller reads it.
- The three wiring points, recorded so the follow-on task does not have to rediscover them:
  `task-writer/SKILL.md` §Procedure step 3 ("Allocate the next id number"), `_flow-triage.yml`'s
  prompt step 3 ("create the ready task file … with the next id"), and `PROTOCOL.md`'s "Creating a
  task (orchestrator)" paragraph ("next sequential id").
- If this does not fit one sitting, the seam is the pure allocation function plus its tests versus
  the transaction and its concurrent-remote harness. Split there and say so — do **not** ship the
  transaction without the concurrency test, because the concurrency test *is* the deliverable.
