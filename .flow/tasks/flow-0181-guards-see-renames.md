---
id: "flow-0181"
title: "Every guard that reads a PR's changed paths sees both sides of a rename, so moving a file into or out of a protected folder cannot slip past it"
status: "in_progress"
priority: 1
project: "flow"
owner: "claude-code-ecstatic-shaw-4abc20"
created: "2026-10-29"
started: "2026-10-29T02:01:06Z"
branch: "flow/flow-0181-guards-see-renames"
pr: "https://github.com/CandidDan/flow/pull/262"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/touches-guard.mjs"
  - "project-template/.flow/bin/touches-guard.test.mjs"
  - "project-template/.flow/bin/only-flow-changed.mjs"
  - "project-template/.flow/bin/only-flow-changed.test.mjs"
  - ".github/workflows/_flow-gates.yml"
  - ".flow/bin/store-guard-renames.test.mjs"
  - "changes/flow-0181.md"
labels: [security, guards, workflows]
model: "sonnet"
effort: "medium"
model_reason: "Same one-flag fix in three places, each with a real-repo regression test; flow-0178 did it for flow-review"
asks: []
notes:
  - "2026-10-29 orchestrator: from the security review of PR #260 (flow-0178). That PR added `--no-renames` to flow-review's two name-only diffs and listed touches-guard as the same gap. I checked the other `--name-only` readers: the store-guard in `_flow-gates.yml` and `only-flow-changed.mjs` have it too."
---

## Context

`git diff --name-only` detects renames by default, so a renamed file is listed **only under its
new path**. Any guard that judges a PR by its changed paths cannot see the old path. flow-0178
fixed this in `flow-review.mjs` (`--no-renames` on both diffs, with a test that renames a source
file into `.flow/intents/`). Three other readers still have the gap:

| Reader | Where | What a rename hides |
|---|---|---|
| touches-guard | `project-template/.flow/bin/touches-guard.mjs`, about line 219 | A file renamed **out of** a path outside `touches` (an undeclared deletion) |
| store-guard | `.github/workflows/_flow-gates.yml`, "Guard — store is main-only", about line 76 | A task file renamed **out of** `.flow/tasks/` (a store edit on a branch) |
| only-flow-changed | `project-template/.flow/bin/only-flow-changed.mjs`, about lines 82–83 | A source file renamed **into** a Flow-only path, which lets the gate skip the stack |

## Scope

- Add `--no-renames` to each of those `git diff --name-only` calls, so a rename lists both paths.
- One real-repo regression test per reader. Each test makes a commit with `git mv` and runs the
  reader. The tests must fail if the flag is removed.
- Add no other behaviour change.

**Does not:** touch `flow-review.mjs` (already fixed), or readers that list a tree rather than a
diff (`release-guard`'s `ls-tree`).

## Acceptance criteria

- [ ] Given a branch that does `git mv src/x.mjs other/x.mjs` where only `other/**` is in
      `touches`, when touches-guard runs, then it fails and names `src/x.mjs`.
- [ ] Given a branch that does `git mv .flow/tasks/flow-0001-x.md docs/x.md`, when the store-guard
      step's shell runs, then it exits non-zero with `reason=store-modified`
      (`.flow/bin/store-guard-renames.test.mjs`, running the workflow's own `run:` text).
- [ ] Given a branch that does `git mv src/x.mjs .flow/x.mjs`, when only-flow-changed runs, then it
      does **not** skip.
- [ ] Each of the three tests fails when `--no-renames` is removed from its reader. Show this in the
      PR description; it is not a test of its own.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage >= `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.
