---
id: "review-findings-converge"
title: "Review findings are verified before they block, re-reviews read only the new diff, and reviewer changes are scored against past PRs"
status: "proposed"
created: "2026-10-28"
source: "Dan, Claude Code chat, 2026-10-27"
serves: ["G10", "G9"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

> "verify findings before they block, re-review only the new diff with a pre-existing tag, and an
> eval set built from past wrong-red and missed-bug PRs."

— Dan, Claude Code chat, 2026-10-27, after comparing Flow's PR review gate with Anthropic's post
"Solving code review at Anthropic".

## Cost of inaction

Evidence (not Dan's words): Anthropic's post "Solving code review at Anthropic"
(claude.dev/blog/solving-code-review-at-anthropic) reports that when several finders run and a
separate group votes before a finding posts, re-review covers only the new diff, and rounds are
capped at 3, PRs that pass after one round went from 65% to 78%, PRs needing 5+ rounds went from
8.9% to 1.5%, and 59% of repeat flags were on code that was already there.

Evidence (not Dan's words), from Flow as it stands:

- `.github/workflows/_flow-review.yml` makes one model call per check (qa, code-review,
  security), and any entry that call puts in `blocking` fails the check. Nothing checks a finding
  before it turns the PR red.
- Auto-fix (`review.auto_fix_rounds` in `.flow/config.yml`) reruns all three reviewers from
  scratch every round, over the whole diff.
- A finding has no pre-existing category: a flag on code the PR did not write reads exactly like
  a flag on code it did.
- No eval set scores a change to a reviewer's prompt or model, so a change that makes a reviewer
  worse is found on live PRs.
- PRs #108 and #109 each sat red on one code-review finding (the comment on `auto_fix_rounds` in
  `.flow/config.yml`).

[assumption] Every wrong red costs a human a read and an override, and every from-scratch
re-review spends model calls re-reading code that has not changed (G9). G10 asks that a red check
mean the work is wrong; a red that a verifier would have dropped says otherwise.

## Outcome

- A finding that turns a PR red has been verified first.
- After a fix round, the re-review reads only what changed since the last review, and a finding on
  code that was already there is tagged pre-existing.
- A change to a reviewer's prompt or model is scored against an eval set built from past PRs where
  the reviewers went red wrongly or missed a bug.

## Constraints

- [assumption] The template and `_flow-review.yml` are published API: adopting repos keep their
  `review:` config, and a repo that sets nothing gets the new behaviour without editing anything.
- [assumption] Merge stays human, and the hard maximum of 3 auto-fix rounds is unchanged.
- [assumption] Verification fails closed: a finding the verifier cannot judge (it errors, times
  out, or returns nothing usable) still blocks, so verification can only remove wrong reds, never
  hide a real one.
- [assumption] The verifier runs in a separate model call from the one that raised the finding;
  a finder checking its own finding is self-certification.
- [assumption] Cost stays visible (G9): the run reports how many findings were raised, how many
  survived verification, and how much of the diff a re-review read.
- [assumption] The eval set holds no secrets and no client code that is not already in the repo
  it came from.

## Open questions

- What "verified" means: a second model call per finding, several verifiers voting, or something
  else, and on which model.
- Whether a pre-existing finding can ever block, or is only reported.
- What "the new diff" is after a rebase or force-push, when the last reviewed commit is no longer
  on the branch.
- Where the eval set lives (canonical only, or one per repo), who labels a PR as wrong-red or
  missed-bug, and how many cases it needs before its score means anything.
- Whether the eval runs in CI on every change to a reviewer's prompt or model, or on demand.
