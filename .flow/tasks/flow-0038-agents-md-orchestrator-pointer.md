---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0038"
title: "Point AGENTS.md at the orchestrator skills, so a non-Claude-Code session can write tasks too"
status: "done"
priority: 3
project: "flow"
owner: "session_013rbLWXPoTBArTjMBbtfrzu"
created: "2026-09-02"
started: "2026-09-02T01:57:04Z"
branch: "claude/codex-flow-repo-test-olwz0b"
pr: "https://github.com/CandidDan/flow/pull/53"
issue: ""
blocked_reason: ""
serves: ["G4"]
touches: ["project-template/AGENTS.md", ".flow/bin/protocol-portability.test.mjs"]
labels: [docs, infra, protocol]
notes:
  - "2026-09-02: touches widened to include .flow/bin/protocol-portability.test.mjs — code-review on PR #53 correctly noted qa's own demand (a proving test for the new AGENTS.md content) landed in a file this task hadn't declared. touches-guard passed anyway on the actual PR, but the field should say what the diff really touches regardless of whether the guard happened to catch the gap."
  - "2026-09-02: filed RETROACTIVELY — the PR (#53) was opened and the diff written before this task existed, in an interactive session testing Flow with a Codex-worker repo. The qa check correctly FAILed the PR for exactly this: no `flow/<id>-…` branch and no `[<id>]` PR title, so nothing tied the diff back to acceptance criteria. This task exists to fix that traceability gap after the fact, not to re-litigate whether the change is a good idea — it already passed the security check with zero findings. `started` is the time this file was written, not the time the diff was written; the PR predates the claim by a few minutes."
  - "2026-09-02: origin story — AGENTS.md already pointed the WORKER role at .flow/PROTOCOL.md (a plain-English instruction, since the AGENTS.md convention has no @-import). It said nothing about the ORCHESTRATOR role: task-writer/vision-writer/board-builder are discovered automatically by Claude Code/Cowork via the Skill mechanism, and a non-Claude agent (Codex, specifically, in the session that surfaced this) has no equivalent discovery path. serves G4 rather than a narrower goal: this is exactly 'what canonical says' to an adopting repo's agents, for a class of agent canonical was silent to."
---

## Context

`project-template/AGENTS.md` is the non-Claude-Code doorway into Flow: it carries a plain-English
pointer to `.flow/PROTOCOL.md` so an agent that follows the AGENTS.md convention (rather than
Claude Code's `@`-import) still reads the protocol before doing anything. That pointer only covers
the **worker** role — claim a `ready` task, execute it, open a PR.

It said nothing about the **orchestrator** role: turning a human's direction into new `ready`
tasks. `task-writer`, `vision-writer` and `board-builder` live under `.claude/skills/` and are
discovered automatically by Claude Code and Cowork through the Skill mechanism. An agent that only
follows the AGENTS.md convention has no equivalent auto-discovery, so it has no way to find
`task-writer/SKILL.md` unless a human hands it over by hand, every session. This surfaced while
testing a repo where an agent other than Claude Code is meant to act as both worker and
orchestrator under Flow.

## Scope

**Does:**
- Add a short section to `project-template/AGENTS.md`, after the existing protocol pointer,
  telling a non-Claude-Code orchestrator session to read `.claude/skills/task-writer/SKILL.md` in
  full and follow it, with `.claude/skills/vision-writer/SKILL.md` and
  `.claude/skills/board-builder/SKILL.md` named as the companion skills the procedure itself calls
  out.
- Restate (not alter) the authority rule: the human decides priority and direction; decomposition
  is the orchestrator's job, inventing priority is not.

**Deliberately does NOT:**
- Duplicate any skill's procedural content — it is a pointer, the same principle as the existing
  `PROTOCOL.md` line.
- Touch `CLAUDE.md`, `.flow/PROTOCOL.md`, or any file under `.claude/skills/`.
- Change how Claude Code or Cowork discover skills — they already do, automatically.

## Acceptance criteria

- [x] Given `project-template/AGENTS.md`, when read after this change, then it contains a section
      pointing a non-Claude-Code orchestrator session at `.claude/skills/task-writer/SKILL.md`,
      `.claude/skills/vision-writer/SKILL.md`, and `.claude/skills/board-builder/SKILL.md`, without
      repeating any of their procedural content.
- [x] Given the same file, when `node --test .flow/bin/protocol-portability.test.mjs` runs, then
      every non-skipped test still passes — in particular the ones that fail if `AGENTS.md` grows
      a second copy of the protocol body or an `@`-import the AGENTS.md convention can't use.
- [x] Given the repo after this change, when `npm run build`, `npm run lint`, `npm test`, and
      `npm run coverage` run, then all pass and coverage stays at or above the 83.5 floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

None. All three review checks now PASS on PR #53's head (`50d04fe`): security (zero findings,
both rounds), code-review (one real finding fixed — the task-writer pointer duplicated a
paragraph `PROTOCOL.md` already had; cross-referenced instead of restating), and qa (initially
FAIL for an unproven criterion — no test asserted the new AGENTS.md content — fixed by adding
three tests to `protocol-portability.test.mjs`, now PASS on all three criteria). Acceptance
criteria checked off above accordingly. Gate green: build/lint/test/coverage all pass, 776 tests,
95.51% coverage. Nothing left but the human's merge.
