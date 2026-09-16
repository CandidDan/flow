---
id: "flow-0059"
title: "A lost race on main silently discards a task's status — flow-status and flow-done never retry"
status: "in_review"
priority: 1
project: "flow"
owner: "session_01DMaRd7oebwiqpEiJLpJafB"
created: "2026-09-16"
started: "2026-09-16T06:08:13Z"
branch: "flow/flow-0059-state-push-retry"
pr: "https://github.com/CandidDan/flow/pull/79"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G7"]
touches:
  - ".github/workflows/_flow-status.yml"
  - ".github/workflows/_flow-done.yml"
  - ".flow/bin/state-push-retry.test.mjs"
  - "CHANGELOG.md"
labels: [infra, store, concurrency, integrity]
notes:
  - "2026-09-16 (orchestrator): observed live, not inferred. `flow-status` run https://github.com/CandidDan/flow/actions/runs/35058472116 (job 104673522669, 05:10:44) fired on PR #78's `ready_for_review`, logged `PR #78 marked ready for review -> flow-0056 in_review`, committed `13ecc6d` on the runner, and then: `! [rejected] main -> main (fetch first)` / `error: failed to push some refs`. Two task-state commits had landed on `main` between its checkout and its push. The job exited 1, the runner was destroyed, and the status change went with it — flow-0056 sat at `in_progress` with a PR already open for review until a human replayed it by hand in `cb793a7`."
  - "2026-09-16 (orchestrator): the fix is already written down in this repo, and was applied to one of three sites. `_flow-recover.yml:214` carries `git pull --rebase origin main` before its push, with the comment 'Rebase before pushing: a second reset in the same sweep would otherwise be rejected because the first push moved main.' That reasoning stopped at the WITHIN-SWEEP race — two resets in one recover run — and never generalised to the obvious neighbour: any other Flow workflow, or a human, pushing task state at the same moment. `_flow-status.yml:108` and `_flow-done.yml:63` are bare `git push origin main`. The protocol's own claim step documents the convention (`_flow-queue-runner.yml:126`: 'CLAIM: git pull --rebase; set the task to in_progress'), so this is a gap in application, not in knowledge."
  - "2026-09-16 (orchestrator): `_flow-done.yml` is the more serious of the two and should be treated as the headline case. Losing a `$id -> done` push leaves a task at `in_review` with a MERGED PR, permanently, because nothing re-fires `flow-done` for that PR. The damage then compounds rather than sitting still: `flow-recover` sweeps stranded tasks, so a task stuck at `in_review` can be reset to `ready` and re-picked by the queue-runner, spending a worker session re-doing work that is already merged. `flow-status` losing an `in_review` is cosmetic by comparison — the task is still visibly in flight."
  - "2026-09-16 (orchestrator): `pull --rebase` alone is necessary but NOT sufficient, and the acceptance criteria are written to force the distinction. Rebase-then-push still loses if another push lands inside the window between the rebase and the push — which is exactly the window that just fired, only smaller. `allocate-task-id.mjs` already models the correct shape for this repo: read `origin/main`, act, attempt the push, and on refusal DISCARD and redo against the new tip rather than merging blindly. A bounded retry loop around fetch-rebase-push is the minimum; state the bound and what happens when it is exhausted."
  - "2026-09-16 (orchestrator): exhausting the retries must FAIL LOUDLY, never exit 0. The whole defect is a state change that was computed correctly and then vanished quietly, so a fix that swallows the final failure reproduces the bug with extra steps. A red check on the PR is the correct outcome: the task file is wrong, and a human needs to know which task and which transition was lost."
  - "2026-09-16 (orchestrator): both files are REUSABLES — the referenced half. No caller grants a new permission, takes a new input or changes a secret, so this is not a MAJOR by `docs/flow-versioning-policy.md`'s tell ('if a change requires editing the per-repo callers, it is MAJOR'). It propagates to the whole fleet the moment the alias moves, with no `flow-sync` and no caller edit. Do not add an input to make the retry count configurable; that would turn a patch into a caller change for no benefit."
---

## Context

Three reusable workflows commit task state to `main`. Two of them lose the commit if anything else
pushes first.

```bash
git commit -m "flow: $id status sync ($ACTION, PR #$PR_NUM)"
git push origin main                      # _flow-status.yml:108 — no fetch, no retry
```
```bash
git commit -m "flow: $id -> done (PR #$PR_NUM merged)"
git push origin main                      # _flow-done.yml:63 — no fetch, no retry
```
```bash
# Rebase before pushing: a second reset in the same sweep would otherwise be
# rejected because the first push moved main.
git pull --rebase origin main             # _flow-recover.yml:214 — the one that got it right
git push origin main
```

Task state living on `main` is the whole point of Flow's two-plane design, and it means `main`
gets written constantly — by the queue-runner claiming, by `flow-status` on every PR transition,
by `flow-done` on merge, by `flow-recover` sweeping, and by a human. Concurrent writes are the
normal case, not an edge one. A workflow that pushes once and gives up is therefore not unlucky
when it loses; it is wrong.

The failure is silent where it matters. The state change is computed correctly, committed on the
runner, rejected at the push, and destroyed with the container. The repo is then confidently
reporting a status it knows to be stale — which is exactly the thing G7 says a Flow repo must not
do.

## Acceptance criteria

- [ ] Given a push to `main` that lands between the workflow's checkout and its push, when
      `_flow-status.yml` runs, then the status change is re-applied against the new tip and
      pushed — proved by a test that simulates the interleaving, not by reading the script.
- [ ] Given the same interleaving, when `_flow-done.yml` runs, then `$id -> done` reaches `main`.
      This is the case that matters most: a lost `done` leaves a merged task at `in_review` with
      nothing that will ever re-fire, and `flow-recover` may then reset it to `ready` and have the
      work done twice.
- [ ] Given a *persistently* contended `main` where every attempt is refused, when the retries are
      exhausted, then the job **exits non-zero** and the message names the task id and the
      transition that was lost. Exiting 0 on a dropped state change re-creates this bug with more
      code in front of it.
- [ ] Given the retry implementation, when it is read, then it re-derives the edit against the
      fetched tip on each attempt rather than force-pushing, merging blindly, or retrying the same
      rejected commit — `allocate-task-id.mjs`'s discard-and-redo is the shape this repo already
      uses for the identical race.
- [ ] Given a conflicting edit to the *same* task file by another actor, when the retry runs, then
      it does not silently overwrite that actor's change; it fails per the criterion above. A
      retry that wins by clobbering is worse than the drop it replaces.
- [ ] Given `_flow-recover.yml`, when it is compared after this change, then its bare
      rebase-then-push has the same protection, or the PR body states explicitly why its window is
      acceptable — the point is that all three sites end up reasoned about, not that two are fixed
      and the third is left as the one that looked fine.
- [ ] Given a run where nothing changed (`git diff --quiet` hits), when the workflow executes, then
      it still exits 0 without entering the retry path — the existing early-out is preserved.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run, then
      all pass and coverage stays at or above 83.5.

## Scope

**Does not change what any workflow writes** — only whether the write survives. No status
transition, trigger, or task-file field changes. **Does not add a workflow input** for the retry
bound: both files are reusables, and an input would make this a caller change and therefore a
MAJOR, for a knob nobody needs. **Does not touch the queue-runner's claim step**, which already
pulls and rebases. **Does not move task state off `main`** or introduce a lock — the two-plane
design is deliberate and first-push-wins is the intended concurrency model; the bug is that these
two callers of it never take their second turn.
