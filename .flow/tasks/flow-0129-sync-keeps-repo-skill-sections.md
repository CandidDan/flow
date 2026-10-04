---
id: "flow-0129"
title: "flow-sync stops erasing a repo's own sections from canonical skills"
status: "blocked"
priority: 1
project: "flow"
owner: ""
created: "2026-10-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Queue cap (13 ready, cap 8). Design decided: A (LOCAL.md overlay)."
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-sync.yml"
  - ".flow/bin/sync-skills.test.mjs"
  - "project-template/.claude/skills/**"
  - "docs/repinning-a-consuming-repo.md"
  - "changes/flow-0129.md"
labels: [flow-infra, sync, skills, canary]
notes:
  - "2026-10-04 orchestrator: Dan chose design A (the LOCAL.md overlay). The task is unblocked on design and stays blocked only on the queue cap. Its first follow-up is to move progress's R1–R5 section into .claude/skills/task-writer/LOCAL.md."
  - "2026-10-03 orchestrator: found by the v3 canary, progress PR #115. The sync copies each canonical skill with `rsync -a --delete`, which replaced progress's task-writer SKILL.md wholesale. That deleted its repo-owned 'Declaring touches for reference prose (R1–R5)' section, and progress's own gate pins that section, so 3 tests went red. I restored the section by hand on #115. The next sync deletes it again."
---

## Context

flow-0081 treats every canonical-named skill as canonical-owned, byte for byte. Repos do extend
them: progress adds R1–R5 to task-writer. Once a repo runs `@v3`, every sync now erases those
additions, and nothing in the sync PR says it did.

Two designs. **Dan chose A on 2026-10-04.**

- **A, an overlay file (recommended).** The sync owns `SKILL.md`. A repo puts its additions in `.claude/skills/<name>/LOCAL.md`, which the sync never touches. Canonical's `SKILL.md` ends with a fixed line: "If `LOCAL.md` exists beside this file, read it; it extends and overrides this skill for this repo." This is simple and diff-clean, and provenance stays byte-exact. Cost: a one-off move of progress's R1–R5 into `LOCAL.md`.
- **B, marker blocks.** Repo text lives between `<!-- repo:begin -->` and `<!-- repo:end -->` inside `SKILL.md`, and the sync splices those blocks back into the new copy. Cost: provenance can no longer be a byte compare, and the splice is fiddly to get right.

## Scope

- Exclude `LOCAL.md` from the `rsync --delete`, using `--filter='P LOCAL.md'`.
- Add the "read LOCAL.md" line to every canonical skill.
- When a sync would change a skill that has no `LOCAL.md` and is not byte-identical to the template, list that skill in the sync PR body as "local edits will be replaced; move them to LOCAL.md". That covers the repos that already diverged.
- Repinning doc: one paragraph.

## Acceptance criteria

- [ ] A sync into a repo with `.claude/skills/task-writer/LOCAL.md` leaves that file byte-identical.
- [ ] A sync into a repo whose `SKILL.md` diverges from the template names that skill in the PR body.
- [ ] Every canonical skill carries the `LOCAL.md` line, and a test proves it.
- [ ] `changes/flow-0129.md` exists. Caller action: none, though a repo with edited skills should move them to `LOCAL.md` before its next sync.
