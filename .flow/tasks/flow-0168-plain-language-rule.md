---
id: "flow-0168"
title: "Require plain, literal, unambiguous English in everything written about the work, not only in replies"
status: "in_review"
priority: 2
project: "flow"
owner: "local_zen-tu-775d79"
created: "2026-10-27"
started: "2026-10-28T12:09:08Z"
branch: "flow/flow-0168-plain-language-rule"
pr: "https://github.com/CandidDan/flow/pull/258"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G10"]
intent: ""
model: "sonnet"
effort: "medium"
model_reason: "Small text change, but it edits the published protocol every adopter imports"
touches:
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.claude/skills/show-me/SKILL.md"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - ".flow/bin/protocol-portability.test.mjs"
  - ".flow/bin/show-me.test.mjs"
  - "changes/flow-0168.md"
asks:
  - "fyi: the human asked for this rule directly in a Claude Code session on 2026-10-27, so there is no intent file and flow-doctor will warn about the empty `intent:`. The session that wrote this task did not build it."
---

## Context

The protocol's only plain-language rule is one sentence in **Response style**: "Terse is not
cryptic: plain words, full sentences, no unexplained jargon." It covers replies to the human and
nothing else.

Task specs, intents, design-canvas notes, code comments, commit messages and PR descriptions are
not covered. In `CandidDan/write` they drifted into the product's literary voice. One spec said
"three doors, and all three are the same shelf. Settings are sentences at the foot of the same
shelf." A worker read that as "put settings inside the document list", and that is what shipped.
Plain wording ("the sidebar is the only extra panel; settings sit at its bottom") would have made
the decision explicit.

VISION G10 already names the symptom: "PR text is long and often not plain English."

## Scope

- In `project-template/.flow/PROTOCOL.md`, **Response style**: add a rule that everything written
  about the work uses plain, clear, unambiguous English. It covers replies, task specs, intents,
  design notes, code comments, commit messages and PR descriptions. Name things literally, not by
  metaphor. Say what happens and where. Rewrite any sentence that can be read two ways. Include
  one short bad/good example.
- The rule states that a product's own user-facing text is out of scope: its voice is the
  project's decision.
- Keep the existing "Terse is not cryptic" sentence; tests pin it.
- `show-me` skill: its rule 6 points to the protocol rule.
- `task-writer` skill: a spec is written in plain, literal language, with the same test.
- Record the new **Response style** digest in `INTENTIONAL_DIVERGENCES`
  (`.flow/bin/protocol-portability.test.mjs`) in the same commit as the edit.
- Changelog fragment `changes/flow-0168.md`.

**Does not touch:** any adopter's UI text, or canonical's root `CLAUDE.md`.

## Acceptance criteria

- [ ] Given `PROTOCOL.md`, then its Response style section requires plain, unambiguous English
      and lists task specs, code comments, commit messages and PR descriptions as covered.
- [ ] Given `PROTOCOL.md`, then the same section says a product's user-facing text is out of
      scope.
- [ ] Given `PROTOCOL.md`, then "Terse is not cryptic" is still in Response style.
- [ ] Given the task-writer skill, then it requires a spec to name things literally, not by
      metaphor.
- [ ] Given the protocol-portability test, then the Response style digest matches the edited
      section, with a `why` naming flow-0168.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
