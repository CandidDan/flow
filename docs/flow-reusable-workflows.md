# Flow reusable workflows + version stamp

**Status:** Phase 1 (partial) + Phase 2 groundwork of `flow-infra-propagation-plan.md` · landed
ahead of the Phase 0 reconciliation (see *What's deferred* below).

## Why

Flow's CI workflows used to be **copied** into every repo at onboarding and never re-synced — the
worst drift surface in the system (the plan's words). This change converts them to **reusable
workflows authored once in canonical (`CandidDan/flow`)**, which each repo adopts with a ~3-line
caller. The copy is gone, so it can't drift; a version stamp + a `flow-doctor` check catch the
little that's left.

> Principle (from the plan): *reference, don't copy, wherever possible; where copy is unavoidable,
> version it and add a drift check; author infra in canonical, repos adopt.*

## The two halves

### 1. Canonical authors the logic — `CandidDan/flow/.github/workflows/_flow-*.yml`

Each `_flow-*.yml` is the real job logic with `on: workflow_call`. Reusable workflows can't
self-trigger, so these are inert in the flow repo itself — they only run when a consuming repo calls
them. They are:

| Reusable workflow | What it does | Inputs / secrets |
|---|---|---|
| `_flow-gates.yml` | The Definition-of-Done gate: store-is-main-only guard, build/lint/test/coverage from the caller's `.flow/config.yml`, flow-tooling tests, touches-guard | input `setup_node_version` (default `22`; `""` for non-Node) |
| `_flow-status.yml` | PR open → `in_review`; closed-unmerged → `ready` | — |
| `_flow-done.yml` | PR merged → task `done` | — |
| `_flow-triage.yml` | Scheduled issue triage (off unless `FLOW_AI=true`) | secret `CLAUDE_CODE_OAUTH_TOKEN` |
| `_flow-review.yml` | Independent AI review on flow PRs (off unless `FLOW_AI=true`) | secret `CLAUDE_CODE_OAUTH_TOKEN` |
| `_flow-queue-runner.yml` | Picks a ready task → dispatches a fresh worker (off unless `FLOW_AI=true`) | input `task_id`; secret `CLAUDE_CODE_OAUTH_TOKEN` |

Because `actions/checkout` in a reusable workflow checks out the **caller's** repo, every
`node .flow/bin/…` and `.flow/config.yml` reference resolves to the *consuming project's* store and
tooling — exactly what the gate must read.

### 2. Repos adopt by reference — `project-template/.github/workflows/flow-*.yml`

Each caller keeps only the trigger (`on:`) — which a reusable workflow can't declare — and a
`uses:` line pinned to a tag:

```yaml
name: flow-gates
on:
  pull_request: { branches: [main] }
  workflow_dispatch:
jobs:
  flow-gates:
    uses: CandidDan/flow/.github/workflows/_flow-gates.yml@v1
```

- **Secrets:** the AI callers pass `secrets: inherit` so `CLAUDE_CODE_OAUTH_TOKEN` reaches the
  reusable workflow without re-declaring it.
- **Inputs:** `flow-queue-runner` forwards its `workflow_dispatch` `task_id` via `with:`.
- **Pinning:** callers pin `@v1` for stability (the plan's choice over `@main`). Bump the tag to
  adopt a new Flow version.
- **Permissions:** consuming repos need *default workflow permissions = read+write* (the status/done
  workflows push state to `main`). The reusable workflows declare their own `permissions:`; the
  effective token is the intersection, so the repo setting must allow write.

### Version stamp + drift check

- Canonical carries `VERSION` at its root; the template carries `.flow/VERSION`. A freshly templated
  repo starts level with canonical.
- `flow-doctor` compares them **only when `FLOW_CANONICAL_VERSION` is set** (a CI step can derive it
  from `git ls-remote --tags https://github.com/CandidDan/flow`). If the repo's `.flow/VERSION` is
  behind, it **warns** (graceful-adoption posture, like `source_roots` — it surfaces drift, doesn't
  block). Local `flow-doctor` runs are unchanged when the env var is absent.

## What's deferred (and why)

This landed ahead of the plan's **Phase 0 reconciliation**, which can't be done from the canonical
repo alone — the Nudge-evolved infra it pulls in (`flow-open-pr`, `flow-recover`, `parse-task-id`
PR-title fallback, the CAN-41 uncommitted-task guard, the CAN-58 `FLOW_PAT` gate-trigger fix) lives
in the Nudge repo. So still outstanding:

1. **Reconcile the superset into canonical** (the missing Nudge files above), then **tag `v1`** —
   only after that do the `@v1` caller pins resolve. Until then, treat the callers as the documented
   end-state; nothing adopts them before the tag exists.
2. **Cut Nudge over** to the thin callers (dogfood), then Roost/Meadow, and **confirm the gate fires
   end-to-end** on a real Nudge PR.
3. **The `.flow/bin` npm package** (Decision 2): the reusable workflows currently call
   `node .flow/bin/…` from the caller's checkout, which works without a published package. The
   package is a later refactor.
4. **A reusable-gate toolchain story for non-Node stacks** beyond the `setup_node_version` input —
   best settled by the dogfooding in (2).
