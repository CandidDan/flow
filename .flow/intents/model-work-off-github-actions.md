---
id: "model-work-off-github-actions"
title: "Flow keeps building without GitHub Actions billing for the time Claude spends thinking"
status: "proposed"
created: "2026-10-28"
source: "Dan, conversation 2026-10-28"
serves: ["G9"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

On receiving GitHub's email that $250 of the $250 Actions budget for October 2026 had been used:

> "I'm going to have to shut flow down, I can't afford this"

> "I can't stop building but equally can't justify adding more expense to github, what do we do now?"

> "Ok queue runner has to go, we need a better way to do this"

> "Yes a PR should be ready before anything starts, it's just a waste otherwise"

> "I don't mind a self-hosted runner but would rather not have it tied to my machine and it being on."

— Dan, conversation 2026-10-28.

## Cost of inaction

In Dan's words: Flow shuts down. The budget is spent, Actions stopped, and he "can't justify
adding more expense to github".

Evidence (not Dan's words):

- October 2026 billing across the private Flow repos came to $321 gross, $250 billed. The largest
  lines were `flow-gates` at $112, `flow-queue-runner` at $74 and `flow-review` at $56.
- The tanplan-platform repo alone came to $154.
- On 2026-10-28 a canary ran the full worker loop (claim on `main`, push a `flow/` branch, gate,
  open the PR) as a Claude Code cloud routine on the Max plan, using zero Actions minutes:
  tanplan-0178, CandidDan/tanplan-platform PR #221, about 11 minutes.

[assumption] The model-driven workflows (`flow-queue-runner`, `flow-review`, kickback, triage,
compass) bill for the whole time a runner sits waiting on Claude, so most of what they cost is
waiting, not work.

## Outcome

Flow keeps building at the same pace, and the Claude sessions Flow runs (the worker, and any other
model-driven step) stop billing GitHub Actions minutes while they wait on a model.

## Constraints

- "I can't stop building" — the pace of work does not drop to save money.
- "can't justify adding more expense to github" — the fix does not move the spend to another
  GitHub bill.
- "queue runner has to go" — Dan's own call on `flow-queue-runner`.
- "a PR should be ready before anything starts, it's just a waste otherwise" — Dan's own rule.
  - [assumption] Read as: no paid step starts until there is a PR for it to act on.
- "I don't mind a self-hosted runner but would rather not have it tied to my machine and it being
  on." — a self-hosted runner is acceptable; one that only works while Dan's own machine is on is
  not.
- [assumption] The gate stays a GitHub check on the PR, so G10 does not get weaker: work that
  moves off Actions still has to arrive as a PR that the same gate judges.
- [assumption] The protocol's rules hold wherever the worker runs: task state on `main`, code on a
  branch and a PR, the store-guard, and no worker reviewing its own work.
- [assumption] Adopting repos get the change through a canonical release, not a local patch.

## Open questions

- Which of the other model-driven steps (review, kickback, triage, compass) move off Actions, and
  which stay because they have to run as a check on the PR.
- What starts a worker once `flow-queue-runner` is gone: a schedule, an API call, a human, or
  something else.
- Whether `flow-gates` ($112, the largest line) is in scope here, given it is not model-driven.
- What happens to the fleet's work while the Max plan's own usage limits are reached.
- [assumption] The canary's route (a Claude Code cloud routine on the Max plan, opening the PR
  through the REST API because GraphQL is blocked there) is the leading candidate, but nothing
  here decides it.
