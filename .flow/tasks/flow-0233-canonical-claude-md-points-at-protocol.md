---
id: "flow-0233"
title: "Canonical's root CLAUDE.md points at the real protocol file"
status: "proposed"
priority: 3
project: "flow"
owner: ""
created: "2026-11-19"
started: ""
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: ""
accepted_at: ""
accepted_via: ""
touches:
  - "CLAUDE.md"
  - ".flow/bin/protocol-docs.test.mjs"
  - ".flow/config.yml"
  - "changes/flow-0233.md"
labels: [docs]
model: "haiku"
effort: "low"
model_reason: "A small wording fix with the exact target file named and an existing test to update; no design decision."
notes:
  - "2026-11-19: Written from the Claude Code best-practices review (reports/claude-code-best-practices-vs-flow.md, item 2 and 8)."
asks:
  - "fyi: The fix names the file in prose and does not import it. Importing project-template/.flow/PROTOCOL.md (about 39 KB) would add roughly 10k tokens to every canonical session and would need claude_md_max raised well above 12000. Raise that as its own task if you prefer an import."
---

## Context

Canonical's root `CLAUDE.md` is the only file Claude Code loads automatically in this repo. It
says "`project-template/CLAUDE.md` is the protocol" and tells the reader to read it in full.
That is no longer true. `project-template/CLAUDE.md` is now a 79-line host file that imports
`.flow/PROTOCOL.md`. The protocol itself is `project-template/.flow/PROTOCOL.md` (39,121 bytes).
A session that follows the pointer reads the short host file and never reads the rules.

The comment above `claude_md_max` in `.flow/config.yml` also says the protocol is "the 24,596-byte
protocol". The real size is about 39 KB, so the comment is wrong.

## Scope

- In root `CLAUDE.md`, change every sentence that says the protocol is in
  `project-template/CLAUDE.md` so it names `project-template/.flow/PROTOCOL.md`. Keep the
  instruction to read it in full and the reason it does not load on its own. Do not add an `@`-import.
- In `.flow/config.yml`, remove the hard-coded "24,596-byte" figure from the `claude_md_max`
  comment. Say instead that the protocol is tens of kilobytes and is why the root file points at it
  rather than importing it. Leave `claude_md_max: 12000` as it is.
- Update `.flow/bin/protocol-docs.test.mjs` so the test that checks where CLAUDE.md points
  expects the real file.
- Add `changes/flow-0233.md`.
- Not in scope: the template's own `CLAUDE.md`, `PROTOCOL.md`, any workflow, and any other doc
  that mentions `project-template/CLAUDE.md`.

## Acceptance criteria

- [ ] Given root `CLAUDE.md`, when it says where the protocol is, then it names
  `project-template/.flow/PROTOCOL.md` and no sentence calls `project-template/CLAUDE.md` the
  protocol. Proved by `.flow/bin/protocol-docs.test.mjs` (the updated "defers to" test).
- [ ] The file that root `CLAUDE.md` names as the protocol exists and contains the heading
  `## Status lifecycle`. Proved by the same file.
- [ ] `.flow/config.yml` no longer contains a hard-coded protocol byte count, and
  `claude_md_max` is still 12000. Proved by a new test in `.flow/bin/protocol-docs.test.mjs`.
- [ ] `node .flow/bin/check-claude-md.mjs --entry CLAUDE.md` still passes.
- [ ] `changes/flow-0233.md` exists and says no caller action beyond taking the release. Proved by
  `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] All five gate commands pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

None.
