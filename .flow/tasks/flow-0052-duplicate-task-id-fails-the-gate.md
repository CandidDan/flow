---
id: "flow-0052"
title: "Make a duplicate task id fail the gate, instead of waiting for a human to notice"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-15"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G2", "G7"]
touches:
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - ".flow/bin/flow-doctor.mjs"
  - "CHANGELOG.md"
labels: [infra, store, integrity]
notes:
  - "2026-09-15 (orchestrator): observed on canonical's own `main`, not inferred. `eca1ba0` (07:59:08) landed `.flow/tasks/flow-0049-claude-md-ceiling.md` and `4e21cbd` (08:04:12) landed `.flow/tasks/flow-0049-queue-runner-summary-states-the-real-outcome.md` — two files, both carrying `id: \"flow-0049\"`, five minutes apart, from two different sessions. It was cleared by hand at 08:09:42 in `55e7adf` (`flow: renumber flow-0049 -> flow-0050 (id collision)`). Nothing mechanical reported it."
  - "2026-09-15 (orchestrator): this is NOT a defect in flow-0021. `allocate-task-id.mjs` reads `origin/main` via `git ls-tree`+`git show`, never the working tree, and re-allocates on a refused push — it is correct, and its tests prove it. The hole is that using it is optional. A session that hand-writes a task file and commits it bypasses the allocator completely, and git raises nothing, because two different slugs are two different paths: `flow-0049-claude-md-ceiling.md` and `flow-0049-queue-runner-*.md` merge cleanly. flow-0021 made correct allocation possible; this makes incorrect allocation detectable. Defence in depth, not a rewrite — do not change the allocator."
  - "2026-09-15 (orchestrator): the harm is silent, which is why this is worth a gate rather than a convention. `flightdeck/bin/mission-control.mjs:188` builds `new Map((tasks ?? []).map((t) => [t.id, t]))`. Two tasks with one id means the second overwrites the first and one task vanishes from mission control with no error — the repo reports its own state, confidently, minus a task."
  - "2026-09-15 (orchestrator): `serves` is G2 and G7, and both are load-bearing. G2 because this is a guard that does not exist yet (flow-0021's own anchor, and this is its gate-side complement). G7 because the observable harm is the state report dropping a row. `maintenance` was considered and rejected: the store is what a Flow repo answers WITH, so its integrity is not canonical housekeeping."
---

## Context

`flow-0021` gave canonical a correct task-id allocator: `allocate-task-id.mjs` fetches
`origin/main`, computes the next id from that snapshot alone, writes, commits, pushes, and on a
refused push discards and re-allocates. Its tests prove all of it, including the five-way
concurrent case.

What it cannot do is make itself mandatory. The id lives in the *filename* as well as the
frontmatter, so two sessions that each decide on `flow-0049` produce two different paths. Git
sees no conflict, the second push fast-forwards, and the store is left holding two tasks with one
id. That happened on `main` on 2026-09-15 and was cleaned up by a human who happened to look.

This task adds the store-level invariant behind the allocator: **no two task files may declare the
same `id`**, checked by `flow-doctor`, which already walks the store and already fails the gate.

## Acceptance criteria

- [ ] Given a store where two task files declare the same `id`, when `flow-doctor` runs, then it
      exits non-zero and its message names the duplicated id **and both file paths** — not just a
      count, because the fix is choosing which file gets renumbered.
- [ ] Given a store where three or more files share one id, when `flow-doctor` runs, then every
      offending path is named, not the first two.
- [ ] Given a store with two *distinct* ids whose files sort adjacently, when `flow-doctor` runs,
      then it passes — asserted against a fixture, so the check cannot be a filename-proximity
      heuristic wearing an id check's name.
- [ ] Given a task file whose frontmatter `id:` disagrees with the id in its own filename, when
      `flow-doctor` runs, then it exits non-zero naming both — the 2026-09-15 incident was cleared
      by a rename, and a rename that forgets the frontmatter re-creates the same ambiguity
      one layer down.
- [ ] Given canonical's real store as it stands at the time of the change, when `flow-doctor`
      runs, then it passes — the check is added green, and any pre-existing duplicate is fixed in
      the same PR and named in the PR body.
- [ ] Given the check's source, when it is inspected, then the duplicate scan lives in
      `project-template/.flow/bin/flow-doctor.mjs` and canonical's `.flow/bin/flow-doctor.mjs`
      only adapts it — asserted the way `adapters.test.mjs` asserts the others, because a copy
      here would drift out of the fleet's reach.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run,
      then all pass and coverage stays at or above 83.5.

## Scope

**Does not touch** `allocate-task-id.mjs` or its tests — the allocator is correct and this task
adds nothing to it. **Does not** attempt to auto-renumber a duplicate: the choice of which task
keeps the id is the orchestrator's, and a guard that silently rewrites the store is a worse
failure than the one it replaces. **Does not** add a pre-push hook or a CI-only script; the check
belongs where the store is already walked.
