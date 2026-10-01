---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0117"
title: "Agents show, don't tell: a terse response rule in the protocol plus a show-me skill, with a visual-first PR description"
status: "done"
priority: 2
project: "flow"
owner: "claude-code-worker"
created: "2026-10-01"
started: "2026-10-01T05:58:11Z"
branch: "flow/flow-0117-show-dont-tell"
pr: "https://github.com/CandidDan/flow/pull/150"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G12"]    # answerable in under a minute from a phone: that needs short, visual output, not walls of prose.
touches:
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.claude/skills/show-me/SKILL.md"
  - "project-template/AGENTS.md"
  - "CLAUDE.md"
  - ".flow/bin/protocol-portability.test.mjs"
  - ".flow/bin/show-me.test.mjs"
  - "changes/flow-0117.md"
labels: [protocol, skills]
notes:
  - "2026-10-01 (orchestrator): human direction — agent output is wordy (over-dramatic + terse at once); adopt something like humanlayer's show-me skill (https://www.humanlayer.com/blog/show-me-skill), especially in PRs. Fewer words; anything better as a visual, visual."
  - "2026-10-01 (human, via chat): the complaint names two failures, over-dramatic wordiness AND unnecessary terseness. Fixing the first must not cause the second: terse is not cryptic. Plain words, full sentences, no unexplained jargon, no arrow-chains standing in for sentences."
  - "2026-10-01 (human, via chat): DECIDED yes: response TL;DR only when output runs past ~15 lines; PR descriptions keep theirs. Pushed to PR #150 as a789281."
---

## Context

The protocol's only style rule is "end with a TL;DR", which treats the symptom: the TL;DR exists
because the body is too long to read. Humanlayer's show-me skill replaces prose with compact
visuals — tables, trees, call stacks, mermaid, diffs, pseudocode, type signatures.

## Scope

- Rewrite PROTOCOL.md `## Response style — always TL;DR` (keep the heading) to add: fewest words
  that carry the point; no preamble, recap or hedging; anything with structure (comparison, flow,
  hierarchy, before/after, state) is a visual, not a paragraph; terse is not cryptic (plain words,
  full sentences, no unexplained jargon); point at the show-me skill.
- Define the PR description shape in that section: TL;DR line → one visual of the change →
  criteria checklist with proving tests → human to-dos. Prose only where a visual can't carry it.
- New skill `project-template/.claude/skills/show-me/SKILL.md`: when to use which format, each
  with a short example; a word budget; anti-patterns on both sides — too much (dramatic framing, restating the question,
  recap) and too little (dropped articles, unexplained jargon, arrows or fragments in place of sentences).
- AGENTS.md names the skill path (agents without skill discovery).
- Root CLAUDE.md "Response style" line points at the rule rather than restating it.
- Out of scope: the review workflows' own comment format; flightdeck.

## Acceptance criteria

- [ ] PROTOCOL.md's response-style section requires visuals for structured content and names
      `.claude/skills/show-me/SKILL.md`. (show-me.test.mjs)
- [ ] PROTOCOL.md defines the PR description order: TL;DR, visual, criteria checklist, to-dos.
      (show-me.test.mjs)
- [ ] The show-me skill exists with valid frontmatter (`name: show-me`, a description) and
      covers at least: table, tree, mermaid, diff, call stack. (show-me.test.mjs)
- [ ] PROTOCOL.md's response-style section and the show-me skill both state that terse is not
      cryptic, and the skill lists over-terse anti-patterns alongside wordy ones. (show-me.test.mjs)
- [ ] AGENTS.md names the show-me skill path. (show-me.test.mjs)
- [ ] The protocol-portability digest for the response-style section is updated with a comment
      naming this task; heading order unchanged.
- [ ] `changes/flow-0117.md` exists stating the caller action — proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
