---
id: "flow-0056"
title: "Point the v2 template callers at v2 — today they ship 2.0.0 wired to the v1 reusables"
status: "done"
priority: 1
project: "flow"
owner: "session_01DTKfbYYGSWy8xdqLC7a6Dw"
created: "2026-09-16"
started: "2026-09-16T04:56:00Z"
branch: "flow/flow-0056-v2-caller-pins"
pr: "https://github.com/CandidDan/flow/pull/78"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "project-template/.github/workflows/flow-compass.yml"
  - "project-template/.github/workflows/flow-done.yml"
  - "project-template/.github/workflows/flow-gates.yml"
  - "project-template/.github/workflows/flow-open-pr.yml"
  - "project-template/.github/workflows/flow-queue-runner.yml"
  - "project-template/.github/workflows/flow-recover.yml"
  - "project-template/.github/workflows/flow-review.yml"
  - "project-template/.github/workflows/flow-status.yml"
  - "project-template/.github/workflows/flow-sync.yml"
  - "project-template/.github/workflows/flow-triage.yml"
  - ".github/workflows/_flow-sync.yml"
  - ".flow/bin/caller-pins.test.mjs"
  - "CHANGELOG.md"
labels: [infra, sync, fleet, release, v2]
notes:
  - "2026-09-16 (orchestrator): verified on `main` at 291a162, VERSION 2.0.0. All TEN template callers still pin `@v1` — `grep -n 'uses: CandidDan/flow' project-template/.github/workflows/*.yml` returns `_flow-compass.yml@v1`, `_flow-done.yml@v1`, `_flow-gates.yml@v1`, `_flow-open-pr.yml@v1`, `_flow-queue-runner.yml@v1`, `_flow-recover.yml@v1`, `_flow-review.yml@v1`, `_flow-status.yml@v1`, `_flow-sync.yml@v1`, `_flow-triage.yml@v1`. Canonical's OWN callers pin `@main` and are unaffected; this is the adopter-facing artefact only."
  - "2026-09-16 (orchestrator): the pin is not the only ref left at v1. `.github/workflows/_flow-sync.yml:67` checks canonical out at `${{ inputs.canonical_ref || 'v1' }}`, and the thin caller passes `canonical_ref: ${{ inputs.canonical_ref }}`, which is EMPTY on a scheduled run. So the v2 sync mechanism adopts from v1 by default — a repo whose flow-sync is otherwise fully v2 would still pull v1 content every Wednesday. Both defaults move together or neither does; fixing the pins alone leaves the adopt source wrong."
  - "2026-09-16 (orchestrator): this is why the ordering is load-bearing rather than tidy. flow-sync's copied surface INCLUDES `.github/workflows/flow-*.yml`, so the first sync into a repo overwrites that repo's callers with the template's. If the template still pins `@v1` at that moment, the sync hands the repo a `flow-sync.yml` pinned to `_flow-sync.yml@v1` — the version WITHOUT `workflows: write` — and the repo is back to the flow-0051 failure it just escaped. The fix reverts itself on first use. That makes this a blocker for the fleet migration, not a follow-up to it."
  - "2026-09-16 (orchestrator): sequencing, because `@v2` cannot be written before `v2` resolves. `v2` is absent today (`git tag -l` shows v1, v1-edge, v1.0.0-v1.3.0, v2-edge; v2-edge is at 4149be4, v1 at 888b012). Land this PR, then move `v2` to the merge commit, THEN let any repo adopt. Pinning `@v2` while the tag is absent would fail every workflow in every repo that received it, which is a worse outcome than the state this fixes. Nothing points at `@v2` until a caller is hand-edited, so cutting the tag first is safe and reversible."
  - "2026-09-16 (orchestrator): add the test rather than trusting the sweep. Ten files edited by hand is exactly where one gets missed, and a missed pin is invisible until a repo's workflow fails weeks later in ITS ci. The check is cheap and has a single source of truth: the major component of root `VERSION`. It belongs in `.flow/bin/` next to `sync-permissions.test.mjs`, which flow-0051 established as the home for tests that couple canonical's shipped surface to the thing that must not drift from it."
  - "2026-09-16 (worker): implemented on branch `flow/flow-0056-v2-caller-pins`, draft PR #78. Both refs moved: the ten `uses:` pins in `project-template/.github/workflows/` and `_flow-sync.yml`'s `${{ inputs.canonical_ref || 'v1' }}` fallback, plus the two `Default v1.` input descriptions and the template flow-sync header comment. New `.flow/bin/caller-pins.test.mjs` derives the expected ref from the major in root VERSION (never hard-codes v2), reports file:line + both refs, and covers the 3.0.0-fixture case so it keeps meaning something at the next major. Canonical's own callers untouched and asserted still `@main`. Gate all five green: build 24 workflows parsed, lint 82 .mjs, test 974/973 pass 0 fail 1 pre-existing opt-in skip, coverage 94.64% lines vs floor 83.5. PR left as a DRAFT deliberately — the human marks it ready, which is what flips this task to in_review."
  - "2026-09-16 (worker): OUT-OF-SCOPE FINDING for the orchestrator, not actioned. `project-template/.flow/bin/flow-init.mjs:67` still reads `DEFAULT_CANONICAL_REF = \"v1\"`, so a fresh `flow-init` adoption with no `--canonical-ref` repins the now-@v2 template back down to @v1 — a third v1 ref beyond the two this task names. It is outside flow-0056's declared `touches`, so editing it would fail touches-guard; surfaced rather than drifted, per the protocol. It does NOT affect the flow-sync path this task fixes: flow-sync copies the template callers verbatim and never runs `repin`, so existing repos receive @v2 correctly. Worth a follow-up task before anyone adopts via flow-init rather than via sync."
  - "2026-09-16 (orchestrator): `serves: maintenance` — this is propagation mechanism, the same class as flow-0051, not a product goal. G10 was considered and rejected: nothing here is about what the gate or a PR body reports to a human."
---

## Context

The 2.0.0 re-cut bumped `VERSION` and `project-template/.flow/VERSION`, and `CHANGELOG.md`
records four caller actions. It did not repoint the callers themselves. On `main` today, at
VERSION 2.0.0, every template caller a repo adopts still reads:

```yaml
    uses: CandidDan/flow/.github/workflows/_flow-gates.yml@v1
```

and `_flow-sync.yml` still checks canonical out at `${{ inputs.canonical_ref || 'v1' }}`.

A repo that adopts 2.0.0 therefore receives 2.0.0's copied surface — `.flow/bin/`, the callers,
the version stamp — wired to the **v1** reusables. The two halves of Flow disagree about which
major they are, in the repo, silently, because a caller pinned at a tag that still resolves is
indistinguishable from a correct one.

The sharp edge is `flow-sync` itself. Its copied surface includes the callers, so the first sync
into a repo overwrites that repo's `flow-sync.yml` with the template's. Hand-edit a repo to escape
flow-0051, let it sync, and the sync hands back a `flow-sync.yml` pinned to `_flow-sync.yml@v1` —
the version without `workflows: write`. The repo re-acquires the bug it was just rescued from, and
the next sync dies at the push again.

## Acceptance criteria

- [ ] Given every file in `project-template/.github/workflows/`, when it is read, then each `uses:`
      line pins `@v2` — all ten, verified by the test below rather than by a reviewer counting.
- [ ] Given `.github/workflows/_flow-sync.yml`, when the canonical checkout step is read, then it
      defaults to `v2`, and the `canonical_ref` input description no longer says "Default v1" in
      either the reusable or the thin caller.
- [ ] Given `.flow/bin/caller-pins.test.mjs`, when it runs, then it derives the expected major from
      root `VERSION` and fails if any template caller pins a different one — with the failure
      naming the file and both refs, not a count.
- [ ] Given a template caller mutated to pin `@v1` while `VERSION` says 2.0.0, when the test runs,
      then it fails — demonstrated by mutating a copy of the real file, the way
      `sync-permissions.test.mjs` demonstrates its removals, not asserted in the abstract.
- [ ] Given `VERSION` bumped to a hypothetical 3.0.0 in a fixture, when the test runs against
      callers pinned `@v2`, then it fails — the check must track the stamp, not hard-code `v2`,
      or it silently stops working at the next major.
- [ ] Given canonical's own `.github/workflows/flow-*.yml`, when they are read after this change,
      then they still pin `@main` and are untouched — canonical tracks its own tip by design and a
      sweep that caught them would be wrong.
- [ ] Given `CHANGELOG.md`, when the 2.0.0 section is read, then it states that adopting v2
      requires the callers to pin `@v2`, that `flow-sync` delivers that pin once this lands, and
      that a repo hand-edited before this lands will have its caller overwritten by its first sync.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run, then
      all pass and coverage stays at or above 83.5.

## Scope

**Does not cut or move the `v2` tag** — that is a human step, and it must happen after this merges
and before any repo adopts. State that explicitly in the PR body. **Does not touch canonical's own
callers**, which pin `@main` deliberately. **Does not change what `flow-sync` copies** (flow-0051's
settled question) or the `CHANGED` computation (flow-0054's). **Does not edit any adopting repo** —
Nudge and TanPlan are hand-edited outside this store. **Does not** add a pin check to
`flow-doctor`: this constrains canonical's published artefact, not a consuming repo's state, and
the two have different audiences.
