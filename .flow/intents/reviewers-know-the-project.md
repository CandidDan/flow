---
id: "reviewers-know-the-project"
title: "Each PR reviewer works with the project's own conventions and risks in hand, and its prompt carries only its job"
status: "proposed"
created: "2026-10-28"
source: "Dan, Claude Code chat, 2026-10-28"
serves: ["G10", "G9"]
workstream: ""
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

## Problem

> "just a thought, for the reviewers are we using optimally adapated and primed agents for
> completing their jobs?"

> "Should we ask fable to review and update the prompts used?"

— Dan, Claude Code chat, 2026-10-28.

## Cost of inaction

Evidence (not Dan's words), from `.github/workflows/_flow-review.yml` on `main` at `f23d3f9`:

- The qa, code-review and security prompts are the same text in every adopting repo (`review:` in
  `.flow/config.yml` varies only the model and the security trigger paths). None of them
  is handed the repo's `AGENTS.md` or `CLAUDE.md` as context (both are only security-path
  triggers), and the security reviewer is not handed
  `threat_model.md`, which tanplan-platform has.
- code-review is asked to check the change "follows the patterns already in this codebase" while
  being told "Do NOT read the repository at large", so it has no patterns to compare against.
- About 20 of each prompt's 55–62 lines handle the RELEASE PR / SYNC PR / NO TASK FILE RESOLVED /
  TASK CONTEXT UNAVAILABLE cases, which code has already decided. The qa prompt explains the
  task sentinels twice.
- qa is asked whether each acceptance criterion has a proving test, but is not handed the gate's
  own test and coverage output for the PR.

[assumption] A reviewer that does not know a project's conventions or threat model can only judge
a change against generic good practice, so a green check says less than G10 needs it to.

## Outcome

On every PR, each reviewer judges the change against that project's own conventions and known
risks, with the evidence the gate already produced, and its prompt is about its job rather than
about the plumbing around it.

## Constraints

- [assumption] Context stays bounded (G9): the reviewer gets named project files, not the
  whole repository.
- [assumption] The template and `_flow-review.yml` are published API. An adopting repo that adds
  nothing gets the change with no edit, and a repo can add project-specific review guidance
  without forking the prompt.
- [assumption] Files that steer a reviewer are read from the base branch, never the PR, so a PR
  cannot rewrite the guidance it is judged by. This is the same rule `security_paths` follows.
- [assumption] Every special case that code can decide (release PRs, sync PRs, a missing task)
  stays decided in code and fails closed.
- [assumption] Fits with `review-findings-converge` (PR #245): a rewritten prompt is scored on its
  eval set once that exists.

## Open questions

- Whether a different model than the one that wrote the prompts (Dan suggested Fable) reviews and
  rewrites them, and whether that happens before or after the eval set from #245 exists.
- Which project files each reviewer is handed (for example `AGENTS.md` for all three,
  `threat_model.md` for security, `VISION.md` for none of them).
- Whether release and sync PRs skip the model call entirely.
