---
id: "flow-0206"
title: "A PR description opens with the problem it fixes, in words a person who has not read the code understands"
status: "in_review"
priority: 2
project: "flow"
owner: "session_01NfrcUBaGfeb3brCMQpKrpt"
created: "2026-11-04"
started: "2026-11-04T00:56:36Z"
branch: "flow/flow-0206-pr-tldr-plain-problem"
pr: "https://github.com/CandidDan/flow/pull/290"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G10"]
intent: "pr-text-plain-english"
touches:
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.claude/skills/show-me/SKILL.md"
  - ".flow/bin/show-me.test.mjs"
  - ".flow/bin/protocol-portability.test.mjs"
  - "changes/flow-0206.md"
labels: [protocol, review]
model: "sonnet"
effort: "medium"
model_reason: "Small text change, but it edits the published protocol every adopter imports"
notes: []
asks: []
---

## Context

The protocol already has a plain-English rule (flow-0168, `project-template/.flow/PROTOCOL.md`,
**Response style**), and it already names PR descriptions. Workers still open PRs with the
mechanism and internal names instead of the problem. CandidDan/flow PR #285 (flow-0197) opened:

> A flow-sync no longer drops a caller's own with: inputs. After it copies canonical's caller and
> pins it, the new flow-sync.mjs carry-inputs puts back every with: key the repo's previous copy
> set on a Flow-reusable job, using the repo's value.

Dan had to ask "What is this in plain english". The problem it fixed, said plainly: a Flow sync was
deleting settings a repo had added to its own Flow config files, and in one repo that setting was
a pinned Node security fix.

Two gaps let this through. The rule says "no unexplained jargon", but a worker that has just
written the code does not see its own internal names as jargon. And the rule's only example is
about metaphor, which is not how this PR failed. This task closes both gaps in the text of the
rule. A separate task adds the check that enforces it.

## Scope

- In `project-template/.flow/PROTOCOL.md`, **Response style**, the paragraph that sets the PR
  description order: define the TL;DR as the description's **first paragraph**, and require that
  it
  1. says what was wrong or missing, and what is different after the merge, and for whom;
  2. reads correctly to a person who has not read the code or the task;
  3. contains no backticks, no file paths, no task ids and no code names (function, command,
     variable or file names). Those belong in the sections below it;
  4. is at most 60 words.
- Add a second bad/good example row to the existing table, using PR #285. Bad: the TL;DR quoted
  in Context above. Good: "A Flow sync was deleting settings a repo had added to its own Flow
  config files — in one repo, a pinned Node security fix. The sync now keeps them, and the sync PR
  lists them."
- `show-me` skill: rule 6 points to the TL;DR requirement. Do not copy the rule into the skill.
- Record the new **Response style** digest in `INTENTIONAL_DIVERGENCES`
  (`.flow/bin/protocol-portability.test.mjs`) in the same commit as the edit, with a `why` that
  names this task.
- Changelog fragment `changes/flow-0206.md`. Caller action: none.

**Does not touch:** the check that enforces this (a separate task), the PR bodies that
flow-sync generates in code, any adopter's own user-facing text, canonical's root `CLAUDE.md`.

## Acceptance criteria

- [ ] Given `PROTOCOL.md`, then Response style defines the PR description's TL;DR as its first
      paragraph and lists the four requirements in Scope (problem and effect for whom, readable
      without the code, no backticks / file paths / task ids / code names, at most 60 words).
      Proved by a test in `.flow/bin/show-me.test.mjs`.
- [ ] Given `PROTOCOL.md`, then the Response style table has the PR #285 bad/good row, and the
      "good" text itself meets requirement 3 (no backtick, no `/`, no task id). Proved by a test in
      `.flow/bin/show-me.test.mjs` that checks the good text against requirement 3.
- [ ] Given the show-me skill, then rule 6 references the TL;DR requirement in `PROTOCOL.md`.
      Proved by a test in `.flow/bin/show-me.test.mjs`.
- [ ] Existing pins still hold: "Terse is not cryptic" and "Plain, literal, unambiguous English —
      in everything written about the work" are unchanged. Proved by the existing tests in
      `.flow/bin/show-me.test.mjs`.
- [ ] Given the protocol-portability test, then the Response style digest matches the edited
      section, with a `why` naming this task. Proved by `.flow/bin/protocol-portability.test.mjs`.
- [ ] `changes/flow-0206.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] This task's own PR description meets the new rule.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
