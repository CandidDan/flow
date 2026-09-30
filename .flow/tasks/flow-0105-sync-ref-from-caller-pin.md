---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0105"
title: "flow-sync adopts from the ref its caller is pinned to, not a hard-coded v2, when run on schedule"
status: "in_progress"
priority: 3
project: "flow"
owner: "claude-worker-flow-0105"
created: "2026-09-30"
started: "2026-09-30T08:31:07Z"
branch: "flow/flow-0105-sync-ref-from-caller-pin"
pr: "https://github.com/CandidDan/flow/pull/141"
issue: "https://github.com/CandidDan/flow/issues/55"
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # sync delivery health; same anchor as flow-0075/0076, no live goal names it
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.github/workflows/flow-sync.yml"
  - ".flow/bin/sync-default-ref.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "docs/repinning-a-consuming-repo.md"
  - "changes/flow-0105.md"
labels: [flow-infra, flow-sync]
notes:
  - "2026-09-30 (worker): Build pushed on flow/flow-0105-sync-ref-from-caller-pin. Done: new `Resolve canonical ref` step in _flow-sync.yml (id: canonical-ref, output `ref`), clone step now reads `steps.canonical-ref.outputs.ref`, no `inputs.canonical_ref || 'v2'` left; template caller comment, both docs, changes/flow-0105.md. NOT done: `.flow/bin/sync-default-ref.test.mjs` (the proving tests). Next: write that test file, then run all five gate commands."
  - "2026-09-30 (orchestrator): Written at the human's request as the last open defect on #55 (defects 1-3 fixed by flow-0051, flow-0064, flow-0075). Close #55 when this merges."
  - "2026-09-30 (orchestrator): Latent today because the fleet pins @v2 and the default is 'v2'. It bites on the first repo pinned to anything else — the progress canary on v2-edge, the next major (v3), or the release-repo repin in flow-0030 — and it bites silently: a scheduled sync adopts from v2 and opens a PR that moves the repo's local copies to a different version than its callers run."
  - "2026-09-30 (orchestrator): Overlaps flow-0081, flow-0091 and flow-0092 on _flow-sync.yml, and flow-0030 (blocked) on the template caller. pick-task sequences them; rebase onto whichever lands first."
---

## Context

The thin caller passes `canonical_ref: ${{ inputs.canonical_ref }}`. On `workflow_dispatch` a
human can fill that in; on the weekly `schedule` it is empty, and `_flow-sync.yml` then uses
`inputs.canonical_ref || 'v2'` (two places, the clone step and anything else reading the input).
So a repo whose callers are pinned to a different ref — say `@v2-edge` — has its scheduled sync
adopt from `v2` instead. The caller's own comment tells the human to "Bump `canonical_ref` if
your other callers pin a tag other than v2", which a scheduled run has no input to receive.

The ref the repo actually runs is already written down in the repo: it is the `@<ref>` on the
`uses:` line of its own flow-sync caller. `_flow-sync.yml` checks the repo out before it clones
canonical, so it can read that line.

## Scope

**Does:**
- When `inputs.canonical_ref` is non-empty, it wins, exactly as today.
- When it is empty, `_flow-sync.yml` resolves the ref from the checked-out repo, before the clone
  step: scan `.github/workflows/*.yml` / `*.yaml` for `uses:` lines calling
  `<owner>/<repo>/.github/workflows/_flow-sync.yml@<ref>` (any owner/repo, so the flow-0030 repin
  to the release repo keeps working) and collect the distinct `<ref>` values.
  - exactly one → use it, and log `canonical_ref resolved from <file>: <ref>`;
  - none → fall back to `v2` with a `::warning::` saying no pinned caller was found and naming the
    fallback (today's behaviour, now visible);
  - more than one distinct ref → fail the job with an `::error::` listing each file and its ref.
- Every place in `_flow-sync.yml` that reads `inputs.canonical_ref || 'v2'` uses the resolved value
  instead (pass it as a step output). The existing leading-dash refusal applies to the resolved
  value too.
- The template caller's comment is updated: remove "Bump `canonical_ref` if…", and say the
  scheduled run adopts from the ref this file's `uses:` line pins; the dispatch input overrides it.
- Update the two docs that describe the default (`docs/flow-reusable-workflows.md`, which still
  says default `v1`; `docs/repinning-a-consuming-repo.md`, lines ~51–73).
- Changelog fragment `changes/flow-0105.md`. **No caller action**; mention that a repo that pinned
  a non-v2 ref and relied on a customised `canonical_ref` default in its caller can drop that
  customisation, but keeping it still works.

**Does not touch:** the sync surface or what gets copied; the repin to the release repo
(flow-0030); the dispatch input's meaning; any other caller.

## Acceptance criteria

The resolution is shell inside a workflow step; test it the way the other `sync-*.test.mjs`
tests do, by extracting and running the step against fixture repo layouts.

- [ ] Given a non-empty `canonical_ref` input, then that value is used whatever the callers pin.
- [ ] Given an empty input and one caller pinning `_flow-sync.yml@v2-edge`, then the resolved ref
      is `v2-edge` and the log names the file it came from.
- [ ] Given an empty input and a caller pinning a different owner/repo
      (`CandidDan/flow-protocol/.github/workflows/_flow-sync.yml@v2`), then the ref resolves the same way.
- [ ] Given an empty input and no file calling `_flow-sync.yml`, then the resolved ref is `v2` and
      a `::warning::` is emitted.
- [ ] Given an empty input and two files pinning different refs, then the step exits non-zero with
      an `::error::` naming both files and refs.
- [ ] Given a resolved ref starting with `-`, then the existing refusal fires.
- [ ] No `inputs.canonical_ref || 'v2'` expression remains in `_flow-sync.yml`; a test asserts it.
- [ ] The template caller no longer says to bump `canonical_ref` by hand.
- [ ] `changes/flow-0105.md` exists and says no caller action is needed.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
