---
id: "flow-0158"
title: "flow-sync pins the callers it copies to the ref it adopted from, so a canary synced at a release tag runs that release"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude[bot]"
created: "2026-10-23"
started: "2026-10-23T01:01:24Z"
branch: "flow/flow-0158-sync-pins-callers"
pr: "https://github.com/CandidDan/flow/pull/230"
issue: ""
intent: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-sync.mjs"
  - "project-template/.flow/bin/flow-sync.test.mjs"
  - ".flow/bin/sync-caller-pins.test.mjs"
  - "changes/flow-0158.md"
labels: [sync, release, canary]
notes:
  - "2026-10-23 (orchestrator, Dan approved): FOUND in the 3.4.0 rollout. The canary (progress) was synced at canonical_ref=v3.4.0, and _flow-sync.yml copied the template's callers verbatim, pinned `uses: CandidDan/flow/.github/workflows/_flow-*.yml@v3`. v3 still pointed at 3.3.2 (it moves only after the canary passes), and the 3.4.0 callers pass the new `runner` input (flow-0149), which 3.3.2's reusables do not declare. Every Flow workflow on progress#132 failed at startup (`Invalid input, runner is not defined in the referenced workflow`), no Flow check ever reported, and the PR merged with only Vercel's checks, breaking progress's main until v3 was moved by hand. So the canary step cannot test any release whose callers need something new from the reusables: what it runs is the NEW callers against the OLD reusables, a combination no repo ever runs once the release ships."
  - "2026-10-23 (orchestrator): the ref the sync adopted from is already resolved in one place, the `Resolve canonical ref` step (flow-0105: explicit input wins, else the repo's own flow-sync caller pin, else v3). Use that output; do not resolve it again."
  - "2026-10-23 (worker, claude[bot]): IN PROGRESS on branch flow/flow-0158-sync-pins-callers (pushed). DONE: pinCallers/assertPinRef + `pin-callers` CLI in flow-sync.mjs, 5 flow-0158 unit tests (green), _flow-sync.yml loop calls pin-callers after cp, guarded `[ -n \"${CANONICAL_REF:-}\" ]` because sync-customised-caller/sync-permissions tests run the loop with only CANON_TPL. NOT DONE: .flow/bin/sync-caller-pins.test.mjs, changes/flow-0158.md, full gate, PR. Next: write those two files, npm ci + full gate, open PR."
model: "opus"
effort: "high"
model_reason: "edits _flow-sync.yml, a reusable workflow every repo runs and that writes .github/workflows/ with FLOW_PAT"
asks: []
---

## Context

`_flow-sync.yml` copies each thin caller from canonical's template (`cp "$f" .github/workflows/`,
or keeps it whole when it is customised, flow-0076). The template's callers are pinned
`@v3`. So after any sync, an adopter's callers run `@v3`, whatever ref the sync adopted its
`.flow/bin/`, skills and protocol from. Two consequences:

- **A canary cannot test a release.** Synced at `v3.4.0`, the canary gets 3.4.0's callers calling
  whatever `v3` points at — the previous release, by design, until the canary passes. If the new
  callers pass an input the old reusables lack, every workflow fails at startup.
- **A repo's infra and its workflows can disagree.** A repo synced at any ref other than `v3`
  carries that ref's helpers but `@v3`'s reusables (the split brain flow-0105 names).

## Scope

**Does:**

- `project-template/.flow/bin/flow-sync.mjs`: a pure exported function
  `pinCallers(text, ref)` that rewrites the `@<ref>` of every **live** `uses:` line naming a
  `/.github/workflows/_flow-*.yml` reusable to `@<ref>`, whatever its owner/repo, and leaves every
  other line byte-identical (commented-out `uses:` lines, `uses:` of non-Flow actions, trailing
  comments after the ref, indentation). Plus a CLI subcommand `pin-callers --file F --ref R` that
  rewrites F in place. Refuse a ref that is empty, starts with `-`, or contains whitespace.
- `.github/workflows/_flow-sync.yml`, in the caller-copy loop: after `cp`, run `pin-callers` on the
  copied file with the resolved `CANONICAL_REF`. A kept (customised) caller is NOT rewritten — it
  stays exactly as the flow-0076 guard leaves it, and its warning is unchanged.
- Tests:
  - `project-template/.flow/bin/flow-sync.test.mjs`: `pinCallers` rewrites `@v3` to `@v3.4.0` on
    every reusable `uses:`; leaves a commented-out `uses:`, an `actions/checkout@<sha>` line and a
    trailing `# comment` untouched; is idempotent; rejects the bad refs above.
  - `.flow/bin/sync-caller-pins.test.mjs`: extract and run the real caller-copy loop (the way
    `sync-customised-caller.test.mjs` already does) against a fixture template whose callers pin
    `@v3`, with `CANONICAL_REF=v3.4.0`: every copied caller ends up `@v3.4.0`; a customised
    caller kept by the guard is byte-identical to before; with `CANONICAL_REF=v3` nothing changes.
- `changes/flow-0158.md`.

**Does not touch:** the `Resolve canonical ref` step (flow-0105) — it is the input, not the work;
`project-template/.github/workflows/flow-*.yml` (the template keeps `@v3`; the sync pins at copy
time); the release repo repin (flow-0030); `docs/flow-versioning-policy.md` (the canary step's
wording is a separate doc change once this lands).

## Acceptance criteria

- [ ] Given a caller with `uses: CandidDan/flow/.github/workflows/_flow-gates.yml@v3`, when
      `pinCallers(text, "v3.4.0")` runs, then that line ends `@v3.4.0` and every other line is
      byte-identical. Proved by a `flow-0158:` test in `project-template/.flow/bin/flow-sync.test.mjs`.
- [ ] Given a commented-out reusable `uses:`, a non-Flow `uses:` pinned to a sha, and a trailing
      comment after a reusable's ref, when `pinCallers` runs, then the first two are unchanged and
      the third keeps its comment. Proved by a `flow-0158:` test in the same file.
- [ ] Given a ref that is empty, starts with `-` or contains whitespace, when `pin-callers` runs,
      then it exits non-zero and the file is unchanged. Proved by a `flow-0158:` test in the same file.
- [ ] Given the real caller-copy loop, a fixture template pinned `@v3`, and `CANONICAL_REF=v3.4.0`,
      when the loop runs, then every copied caller is pinned `@v3.4.0` and a kept customised caller
      is byte-identical. Proved by `.flow/bin/sync-caller-pins.test.mjs`.
- [ ] Given the same loop with `CANONICAL_REF=v3`, then every copied caller is byte-identical to
      the template's. Proved by `.flow/bin/sync-caller-pins.test.mjs`.
- [ ] Given `changes/flow-0158.md`, then it exists and states caller action: none. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

- After this lands, a canary synced at `vX.Y.Z` stays pinned `@vX.Y.Z`, and its scheduled syncs
  then read that pin (flow-0105) and stay there. That is correct — the pin is what the repo runs —
  and the rollout returns the canary to `@v3` by re-syncing it at `v3` once the alias moves. That
  step lives in the operator's rollout script, not in this repo.
- The caller-copy loop runs on `CANONICAL_REF` from the earlier step's output; confirm it is in
  the step's `env:` before using it, and add it there if not. Never interpolate it into `run:`
  with `${{ }}`.
