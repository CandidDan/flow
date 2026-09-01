---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0035"
title: "Catch anything that reaches main without a PR, because the store-guard only watches the branch side"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G2"]            # PROVISIONAL — see notes; the vision is being re-authored
touches: [".github/workflows/plane-guard.yml", ".flow/bin/plane-guard.mjs", ".flow/bin/plane-guard.test.mjs"]
labels: [infra, integrity, guard]
notes:
  - "2026-09-01: found by tracing how the root VISION.md got into the repo. `git log --follow -- VISION.md` shows one commit, d91e100, authored by Claude on 2026-08-20, message 'flow: claim flow-0024 — release guard so the stamp cannot lie', adding 105 lines creating the file. A doc, committed straight to main, mislabelled as a task claim, with no PR and no review. It then governed every task's `serves:` for eleven days before anyone noticed."
  - "2026-09-01: the store-guard in _flow-gates.yml fails a PR whose diff touches .flow/tasks/. That is the branch half of the two-planes rule. The main half — that a direct push may touch ONLY the store — is enforced by nothing at all. main must accept direct pushes (claims, status syncs, -> done all commit there), so the branch cannot simply be protected; the check has to be on content, not on access."
  - "2026-09-01: d91e100 is a real, known violation sitting in this repo's own history, so it is the natural fixture for the audit mode. A check that cannot find it does not work."
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

- [ ] Given a direct push to `main` whose commits touch only `.flow/tasks/`, when the guard runs,
      then it reports no violation.
- [ ] Given a direct push to `main` with a commit touching a path outside `.flow/tasks/` and no
      associated pull request, when the guard runs, then it reports a violation naming the commit
      and the offending paths, and the job fails.
- [ ] Given a commit that touches code outside `.flow/tasks/` but **is** associated with a merged
      pull request, when the guard runs, then it reports no violation — ordinary merges must not
      fire it.
- [ ] Given a commit touching both `.flow/tasks/` and a path outside it, with no associated PR,
      when the guard runs, then it reports a violation — a store change does not launder the rest
      of the commit.
- [ ] Given audit mode run across a range of history containing `d91e100`, when it completes, then
      that commit is reported as a violation, naming `VISION.md`.
- [ ] Given a run that examined no commits, when it completes, then it fails rather than reporting
      success.
- [ ] Given `.github/workflows/plane-guard.yml`, when its `permissions:` block is parsed, then it
      grants no more than the check requires, and a test fails if it is widened.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
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
