---
id: "flow-0196"
title: "A review job whose base-branch helper predates a command still gives a correct verdict, and a release cannot move an alias over that gap"
status: "in_progress"
priority: 1
project: "flow"
owner: "goose-flow-0196"
created: "2026-11-03"
started: "2026-11-12T06:15:55Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - ".github/workflows/_flow-review.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/helper-command-compat.test.mjs"
  - "docs/flow-versioning-policy.md"
  - "changes/flow-0196.md"
labels: [bug, review, release]
model: "opus"
effort: "high"
model_reason: "A fleet-wide incident in the review gate: the fix decides what an older helper's verdict means, and a wrong fallback could pass a failing review"
asks: []
notes:
  - "2026-11-03 orchestrator: incident. When Dan moved v4 to 4.1.0, every PR in tanplan-platform, inflight, progress and write went red on qa, code-review and security: `flow-review: unknown command \"enforce\" — expected \"plan\" or \"verdict\"`. _flow-review.yml@v4 (4.1.0, flow-0186) calls `flow-review.mjs enforce`, but the helper it runs is the repo's BASE-branch copy (\"Materialise the review gate from the BASE branch\"), still 4.0.x until that repo's sync PR merges. The sync PRs themselves could never go green for the same reason; Dan merged them past the red reviews (all twelve review comments said PASS). flow-0186 kept the old `verdict` command for the opposite skew (helper newer than workflow) and nothing covered this one."
---

## Context

`.github/workflows/_flow-review.yml` runs `$FLOW_REVIEW_DIR/flow-review.mjs`, where `FLOW_REVIEW_DIR`
is the **base branch's** `.flow/bin/`. The workflow comes from the caller's pin (`@v4`), so the
workflow can be a newer release than the helper it calls. Since flow-0186 the workflow calls
`flow-review.mjs enforce "$RUNNER_TEMP/flow-review/<check>.json" --check <check> …`. A 4.0.x helper has
no `enforce` and exits 1 with "unknown command", so every review check fails until that repo syncs.

## Scope

1. In `_flow-review.yml`, each step that enforces a verdict first checks whether the base helper
   supports `enforce` (probe the helper, for example with a `commands` subcommand or a grep for the
   command name, decided by you and tested). If it does not, it runs the older `verdict` command on the
   same verdict content so the outcome is the same: copy `$RUNNER_TEMP/flow-review/<check>.json` to the
   path the old command reads and call `verdict` with the arguments the 4.0.x helper accepts. The step
   prints one `::warning::` naming the older helper and the sync that fixes it.
2. The fallback must never turn a failing or missing verdict into a pass: a missing file, invalid JSON
   or `"verdict": "fail"` still fails the check under the old command.
3. Add `.flow/bin/helper-command-compat.test.mjs`: it lists every `flow-review.mjs <command>` the
   reusable workflows call, and fails if a command is called that the **previous release's** helper
   (read from the latest `vX.Y.Z` tag's `project-template/.flow/bin/flow-review.mjs`, via `git show`)
   does not support, unless that call site has the probe-and-fallback from item 1.
4. `docs/flow-versioning-policy.md`: one paragraph under the release procedure saying a reusable may only
   call a helper command an adopter's previous helper lacks if it falls back, because the helper comes
   from the adopter's base branch.
5. Fragment `changes/flow-0196.md`: **No caller action.**

**Does not:** change what `enforce` validates; change where the helper is loaded from; change any prompt.

## Acceptance criteria

- [ ] `flow-review-workflow.test.mjs`: every step that calls `enforce` probes the helper first and has a
      `verdict` fallback (parsed from `_flow-review.yml`).
- [ ] A test runs the enforce step's shell against a 4.0.x helper (from the `v4.0.1` tag via `git show`)
      with a passing verdict file and gets exit 0, and with a failing, missing or invalid file gets
      non-zero.
- [ ] The same shell against the current helper still uses `enforce` (asserted from its output).
- [ ] `helper-command-compat.test.mjs` passes on this branch and fails when a fallback is removed (proved
      by a mutation inside the test).
- [ ] `changes/flow-0196.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
