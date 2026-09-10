---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0035"
title: "Catch anything that reaches main without a PR, because the store-guard only watches the branch side"
status: "done"
priority: 2
project: "flow"
owner: "claude/next-task-flow-tywdps"
created: "2026-09-01"
started: "2026-09-10T05:05:02Z"
branch: "claude/next-task-flow-tywdps"
pr: "https://github.com/CandidDan/flow/pull/64"
issue: ""
blocked_reason: ""
serves: ["G2"]            # PROVISIONAL — see notes; the vision is being re-authored
touches: [".github/workflows/plane-guard.yml", ".flow/bin/plane-guard.mjs", ".flow/bin/plane-guard.test.mjs"]
labels: [infra, integrity, guard]
notes:
  - "2026-09-01: found by tracing how the root VISION.md got into the repo. `git log --follow -- VISION.md` shows one commit, d91e100, authored by Claude on 2026-08-20, message 'flow: claim flow-0024 — release guard so the stamp cannot lie', adding 105 lines creating the file. A doc, committed straight to main, mislabelled as a task claim, with no PR and no review. It then governed every task's `serves:` for eleven days before anyone noticed."
  - "2026-09-01: the store-guard in _flow-gates.yml fails a PR whose diff touches .flow/tasks/. That is the branch half of the two-planes rule. The main half — that a direct push may touch ONLY the store — is enforced by nothing at all. main must accept direct pushes (claims, status syncs, -> done all commit there), so the branch cannot simply be protected; the check has to be on content, not on access."
  - "2026-09-01: d91e100 is a real, known violation sitting in this repo's own history, so it is the natural fixture for the audit mode. A check that cannot find it does not work."
  - "2026-09-10: THE TASK'S FIXTURE IS WRONG, and criterion 5 as written cannot be satisfied truthfully. Verified with the full commit graph (this session had to `git fetch --unshallow` first) and with `/repos/CandidDan/flow/commits/{sha}/pulls`: (a) `d91e100` touches exactly ONE path, `.flow/tasks/flow-0024-release-cannot-publish-a-lying-stamp.md` — a textbook store-plane claim commit, not a violation and nothing to do with VISION.md; (b) the commit that created VISION.md (105 lines) is `5e2b41c`, 2026-08-18; (c) `5e2b41c` was carried by MERGED PR #11, so VISION.md arrived through review, as did every later change to it (PRs #56, #60, #61). The likely origin of the error is the tooling itself: in a shallow clone — a CI checkout, or a fresh cloud session, which lands ~80 of ~350 commits with grafted history — `git log --follow -- VISION.md` reports a single commit, and a nearby commit's sha then gets paired with it."
  - "2026-09-10: the GAP the task identifies is real and much worse than one commit. The audit over full history (348 commits, 121 with non-store paths, one `/commits/{sha}/pulls` call each) found 18 commits that reached `main` outside `.flow/tasks/` with no merged PR: d751e977 b0193e4b beb7d27c 42ff4476 f7268b67 2ecfb98b 65125913 7cf000ba 662c4b05 1f2c8dd6 ba016460 2600d1f7 a969a914 6d5a760f 6b470e55 bc566188 4b45217e ff9936f2. All 18 authored by Dan. Criterion 5 is proved against `d751e977` instead, which is a strictly better fixture than the one named: it touches four `.flow/tasks/` files AND five non-store files in one commit with no PR, so it proves criterion 4 on real history at the same time. The test file also pins the two corrections above mechanically, so they cannot be re-derived wrongly."
  - "2026-09-10: worth an orchestrator decision, not done here — the 18 findings are history that already landed and this guard does not revert anything. Someone has to decide whether they are accepted as-is (a note in the repo) or whether any of them warrant a retro-review. The guard will not re-report them: it only sees what a push contains from now on, and audit mode is opt-in."
  - "2026-09-10: HANDOFF — PR #64 is open, marked ready, and GREEN on every gate (flow-gates: gate/flow-tooling/touches; flow-review: plan/qa/security/code-review). Eight review rounds; the worker is standing down from further polish per the protocol's session-hygiene rule, not because anything is unfinished. WHAT IS DONE: `.flow/bin/plane-guard.mjs`, `.flow/bin/plane-guard.test.mjs` (64 tests), `.github/workflows/plane-guard.yml`. Every criterion has a named proving test; every assertion was mutation-checked; the suite is verified in a `git clone --depth 1` as well as locally, because `_flow-gates.yml`'s flow-tooling job checks out shallow and two early tests depended on deep history (the one real CI failure in the PR)."
  - "2026-09-10: THE RULE THE GUARD ENDED UP WITH, because it is not what the task specified and a future reader should not have to reconstruct it from the diff. Two signals, each covering the other's blind spot. (a) A commit ON the policed branch's first-parent line was either squash-merged or pushed directly; only the API separates those, so it must carry a merged PR based on the branch. (b) A commit OFF the line arrived through a merge; the graph identifies WHICH merge and the API must confirm a merged PR into the branch produced it, matched on `merge_commit_sha`. Neither half alone works: the API returns only the PR whose head branch the commit was pushed to (so a stacked merge looks unreviewed — this falsely accused `de72f18`, which reached main via merged PR #62 while the API names only PR #61), and the graph proves `a merge happened` but never `a PR merge happened` (so `git merge --no-ff && git push`, an ordinary local workflow, slipped through until flow-review escalated it)."
  - "2026-09-10: AUDIT RESULT, stable across five rule revisions: 351 commits examined, 18 violations, 0 unresolved, 103 excused because a PR produced their merge, 67 API calls. The 18 are unchanged from the first (naive) rule, so the hardening closed real holes without inventing findings. Re-running this audit — not the test suite — is what caught two of the worker's own errors (an `--ancestry-path --first-parent` query that returned nothing for most commits, and `--end-of-options` making a following `--not` a revision). Treat a full-history audit run as part of any future change to this file."
  - "2026-09-10: TWO ITEMS LEFT, both human/orchestrator calls the worker deliberately did not take. (1) Criterion 5's text still names `d91e100`/`VISION.md` and is factually wrong (see the notes above); editing a task's acceptance criteria is the orchestrator's job, not the worker's, so it is recorded here rather than rewritten. (2) The 18 historical violations need a decision — accepted as-is, or any worth a retro-review. The guard will not re-report them: it sees only what a push contains from now on, and audit mode is opt-in."
  - "2026-09-10: FOLLOW-UPS NAMED BUT NOT DONE. (a) A repository push ruleset with path restrictions would make this prevention rather than detection — repo-settings, human-only, sits on the path every worker pushes through. (b) The same hole exists in the template, so every adopting repo has it; fixing it fleet-wide means a reusable and its own argument about whether adopters want their `main` policed. (c) The graph signal's remaining edge: a force-push landing several commits is examined only at its tip (stated as a KNOWN LIMITATION in the workflow, with audit mode as the recovery)."
  - "2026-09-10 (post-merge): THE 18 VIOLATIONS ALL PREDATE THE RULE, and that reframes the audit’s headline number. flow-0004 adopted Flow in canonical on 2026-08-14 (commit 0494c5e7); the two-planes rule did not apply to this repo before that. The latest of the 18 violations is d751e977 on 2026-08-12 — two days earlier. Every one of the 18 is therefore a commit made under a rule that did not yet exist, not a breach of one. In the 330 commits to main SINCE adoption there are ZERO violations. So the honest reading is not ‘the invariant was broken 18 times’ but ‘the invariant has never been broken since it existed, and the guard now makes that checkable rather than assumed’. Decision taken with the human: no retro-review, no reverts — the 18 are recorded here as pre-history and nothing further is owed. Re-derive with: for each sha, compare `git log -1 --format=%ct <sha>` against `git log -1 --format=%ct 0494c5e7`."
  - "2026-09-10 (post-merge): FOLLOW-UPS DEFERRED, with the reason, so they are not re-proposed as obvious. (a) A repository push ruleset would turn detection into prevention, but it sits directly on the path every worker pushes through to claim a task — a mis-scoped path restriction stops Flow dead — and with zero post-adoption violations the marginal value does not yet justify that risk. Revisit if plane-guard ever actually fires. (b) The same hole exists in the template, so every adopting repo has it; shipping a reusable means every adopter gets a workflow that files issues about their own main, which is their decision and not canonical’s to make by default. Both wait for evidence from canonical’s own live runs — which is the same ‘measured against this repo, not inherited from a convention’ standard .flow/config.yml already holds every gate command to."
  - "2026-09-01: `serves: G2` is PROVISIONAL. The root VISION.md is being re-authored with the human after the provenance finding above; this anchor is a placeholder so flow-doctor resolves, not evidence the goal was deliberately chosen."
---

## Context

Flow's two-planes rule says task state commits straight to `main`, and code and docs go through a
branch and a PR. Half of it is enforced: `_flow-gates.yml` runs a store-guard that fails any PR
whose diff touches `.flow/tasks/`, and flow-0008 added an assertion so the guard cannot silently
no-op.

The other half is enforced by nothing. Nothing checks what a **direct push to `main`** contains.

That is not an oversight that can be fixed by protecting the branch, because the store plane
*requires* direct pushes — a worker claiming a task, `flow-status` recording a PR, `flow-done`
marking a merge. Lock `main` and Flow stops working. So the check has to be about **content**, not
about access.

The gap is not theoretical. The repo's own `VISION.md` — the document every task's `serves:` field
resolves against, and which `flow-doctor` mechanically enforces — arrived through it: one commit,
straight to `main`, no PR, no review, mislabelled as a task claim. It governed the backlog for
eleven days. Its own header says *"Changes are PRs only — never a direct commit to main."*

We also do not know whether anything else came in the same way, which is its own reason to build
the audit rather than only the live check.

## Scope

**The invariant.** Every commit on `main` that touches paths outside `.flow/tasks/` must be
associated with a merged pull request. Store changes may arrive directly; everything else may not.
This is the two-planes rule restated as something checkable, and it is deliberately not "fail on
non-store paths" — a PR merge legitimately puts code on `main`, and a check that cannot tell the
difference would fire on every merge and be switched off within a week.

**Does:**

- Add `.flow/bin/plane-guard.mjs`: given commits and a way to ask whether a commit has an
  associated PR, return the violations. Pure, with IO injected, in the same shape as
  `liveness.mjs` — so every branch is a table test with no network.
- Add `.github/workflows/plane-guard.yml`, triggered on push to `main`, running the check over the
  pushed commits. On a violation it **fails and files an issue** naming the commit, its author, its
  message and the offending paths.
- Support an **audit mode** over a range of history, so the check can be run against what has
  already landed rather than only what lands next. This is how we find out whether d91e100 was the
  only one.
- Fail on an empty scan. A run that examined no commits and reported success is the silent no-op
  this repo's guards exist to prevent.

**Deliberately does NOT:**

- **Block the push.** A push-triggered workflow runs after the push lands and cannot reject it.
  This is detection, and the honest claim is that it takes time-to-discovery from eleven days to
  minutes — not that it makes the violation impossible. Do not describe it as prevention.
- **Configure branch protection or repository rulesets.** A GitHub push ruleset with path
  restrictions could genuinely prevent this, but it is a repo-settings change, human-only, and sits
  directly on the path workers push through. Name it in the PR description as a follow-up worth
  evaluating; do not attempt it here.
- **Revert anything.** It reports. A guard that rewrites `main` on its own judgment is a larger
  blast radius than the problem.
- **Touch `_flow-gates.yml` or the existing store-guard.** The branch half works. This is the
  mirror, not a rewrite.

## Acceptance criteria

- [x] Given a direct push to `main` whose commits touch only `.flow/tasks/`, when the guard runs,
      then it reports no violation.
- [x] Given a direct push to `main` with a commit touching a path outside `.flow/tasks/` and no
      associated pull request, when the guard runs, then it reports a violation naming the commit
      and the offending paths, and the job fails.
- [x] Given a commit that touches code outside `.flow/tasks/` but **is** associated with a merged
      pull request, when the guard runs, then it reports no violation — ordinary merges must not
      fire it.
- [x] Given a commit touching both `.flow/tasks/` and a path outside it, with no associated PR,
      when the guard runs, then it reports a violation — a store change does not launder the rest
      of the commit.
- [x] Given audit mode run across a range of history containing `d751e977`, when it completes, then
      that commit is reported as a violation, naming its fifteen non-store paths — and `d91e100` is
      NOT reported, because it touches only `.flow/tasks/`.
      <!-- CORRECTED 2026-09-10, after the task was done. This criterion originally named `d91e100`
           as a violation naming `VISION.md`. Both halves were false: `d91e100` touches exactly one
           path, `.flow/tasks/flow-0024-release-cannot-publish-a-lying-stamp.md` (a correct claim
           commit), and `VISION.md` was created by `5e2b41c` and arrived through merged PR #11.
           Verified against the full commit graph and `/commits/{sha}/pulls`, independently
           re-derived by all three flow-review checks on PR #64, and pinned mechanically by
           `criterion 5 (the task's own fixture, corrected)` so it cannot be re-derived wrongly.
           `d751e977` is the substitute: a real violation that also touches four `.flow/tasks/`
           files, so it proves criterion 4 on real history too. See the notes above. -->
- [x] Given a run that examined no commits, when it completes, then it fails rather than reporting
      success.
- [x] Given `.github/workflows/plane-guard.yml`, when its `permissions:` block is parsed, then it
      grants no more than the check requires, and a test fails if it is widened.
- [x] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- "Associated with a pull request" is answerable from the GitHub API
  (`/repos/{owner}/{repo}/commits/{sha}/pulls`). Squash merges, merge commits and rebase merges all
  behave differently in the history, which is exactly why the rule is expressed as *has an
  associated PR* rather than as a shape of the commit graph. Test all three merge styles if the
  repo's settings allow more than one.
- Run the audit over the full history once as part of this task and put the result in the PR
  description. If d91e100 is the only violation, that is a useful thing to know for certain. If it
  is not, each additional one is a finding the orchestrator needs.
- The follow-up worth naming but not doing here: the same reasoning applies to the *template*, so
  every adopting repo has the identical hole. Fixing it fleet-wide means a reusable, and that is a
  separate task with its own argument about whether adopters want their `main` policed.
