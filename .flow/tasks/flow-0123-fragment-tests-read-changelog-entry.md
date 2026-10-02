---
id: "flow-0123"
title: "flow-0104's and flow-0115's fragment tests read their entry through changelog-entry.mjs, so the 2.3.0 release PR stays green"
status: "in_progress"
priority: 1
project: "flow"
owner: "orchestrator-cowork-2026-10-02"
created: "2026-10-02"
started: "2026-10-02T01:12:01Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "project-template/.flow/bin/flow-recover.test.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "changes/flow-0123.md"
labels: [flow-infra, release, changelog, hotfix]
notes:
  - "2026-10-02 orchestrator: found on PR #164 (flow-0121). flow-0090's release-assemble check (merged in #155) runs every changelog-aware test against an assembled CHANGELOG. It fails because two tests merged in the same batch read changes/<id>.md directly: flow-recover.test.mjs 'criterion 8' (flow-0104) and flow-review.test.mjs 'flow-0115: changes/flow-0115.md exists' (flow-0115). They are green today and would go red on the 2.3.0 release PR, which is exactly what the check exists to catch. It fails every open Flow PR until fixed, and it blocks cutting 2.3.0. Fixed by the orchestrator directly because it is a two-test change and it blocks the release."
---

## Context

`changelog-fragments.mjs --assemble` folds `changes/<id>.md` into `CHANGELOG.md` at release time
and deletes the fragments. A test that reads its fragment directly passes until the release and
then fails on the release's own PR. `.flow/bin/changelog-entry.mjs` reads the entry from whichever
place it lives. flow-0090 added a gate check that runs every changelog-aware test against an
assembled tree, and two tests merged in the same batch fail it.

## Scope

- In both tests, read the entry with `changelogEntry(<canonical root>, "<id>")`. Import it
  dynamically, inside the canonical-only branch, because these test files ship to adopting repos,
  which have no `.flow/bin/changelog-entry.mjs`.
- The assertions on the entry's content stay as they are.

## Acceptance criteria

- [ ] `release-assemble.test.mjs` "after a release assembles the fragments, every
      changelog-aware test still passes" is green.
- [ ] Both tests still fail when their entry is missing from both `changes/` and `CHANGELOG.md`.
- [ ] Both tests still skip outside canonical.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
