# Flow reusable workflows + version stamp

**Status:** Phases 0–4 of `flow-infra-propagation-plan.md` are in canonical — Phase 0
reconciliation (see *Reconciled in* below), Phase 1 reusable workflows, Phase 2 version stamp +
drift check, Phase 3 bin-delivery decision (copy + check, npm package deferred), and Phase 4
(`flow-sync` adopt mechanism + the governance rule). `v1` is tagged. Remaining: **cut the
consuming repos over** (Nudge first, dogfood) and the plugin-based skills/agents adoption (see
*What's deferred*).

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
| `_flow-status.yml` | PR open → `in_review`; closed-unmerged → `ready`. Id resolved from the branch **or** the PR title (CAN-52), so non-`flow/` branches (e.g. cloud `claude/…`) still transition | — |
| `_flow-done.yml` | PR merged → task `done`. Same branch-**or**-title id resolution (CAN-52) | — |
| `_flow-open-pr.yml` | On a `flow/<id>-…` branch push, auto-opens the PR if the branch is ahead of base with no PR yet (CAN-50) — a worker that stops short of `gh pr create` no longer strands the task. Idempotent. Opens with `FLOW_PAT` so the PR triggers `flow-gates` (CAN-58) | secret `FLOW_PAT` (optional) |
| `_flow-recover.yml` | Scheduled self-heal sweep (CAN-51): a task stranded `in_progress` past a staleness threshold gets its PR re-opened (work was pushed) or its claim reset to `ready` (nothing to recover). Off unless `FLOW_AI=true`; always on-demand via dispatch | input `threshold_minutes`; secret `FLOW_PAT` (optional) |
| `_flow-triage.yml` | Scheduled issue triage (off unless `FLOW_AI=true`) | secret `CLAUDE_CODE_OAUTH_TOKEN` |
| `_flow-review.yml` | Independent AI review on flow PRs (off unless `FLOW_AI=true`) | secret `CLAUDE_CODE_OAUTH_TOKEN` |
| `_flow-queue-runner.yml` | Picks a ready task → dispatches a fresh worker (off unless `FLOW_AI=true`) | input `task_id`; secret `CLAUDE_CODE_OAUTH_TOKEN` |
| `_flow-sync.yml` | The adopt mechanism (Phase 4): when the repo's `.flow/VERSION` is behind canonical, copies the updated `.flow/bin/*` + thin callers in, bumps the stamp, and opens a **reviewed PR**. Safe to run anytime (only opens a PR; no `FLOW_AI` gate) | input `canonical_ref` (default `v1`); secret `FLOW_PAT` (optional) |

**`FLOW_PAT` (CAN-58).** A PR opened with the Actions `GITHUB_TOKEN` does *not* trigger downstream
workflows, so `flow-gates` would never fire on an auto-opened PR — the gate silently bypassed.
`_flow-open-pr` / `_flow-recover` open PRs with a `FLOW_PAT` (fine-grained PAT: this repo, Contents
Read + Pull requests Read/Write) so the `pull_request` event is attributed to a real actor and the
gate runs. Falls back to `GITHUB_TOKEN` when the secret is unset (PR opens, but ungated), so adding
the secret is a no-break enablement. Thin callers pass it with `secrets: inherit`.

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
- Both stamps are at `1.0.0`, coherent with the `@v1` caller pins. The remaining release step is the
  git tag itself: `git tag v1 && git push origin v1`.

### Adopt mechanism — `flow-sync` (Phase 4)

The drift check only *warns* "you're behind." `flow-sync` is the fix. Authored in canonical as
`_flow-sync.yml` (reusable) + the `flow-sync.yml` thin caller + `flow-sync.mjs` (the pure
version-decision + PR-text logic, sharing `compareVersions` with `flow-doctor`):

- On a weekly schedule (or on demand), it reads canonical's `VERSION` at the pinned ref and
  compares it to the repo's `.flow/VERSION`. `current` → no-op; `ahead` → warns (the repo is
  somehow newer; reconcile *upward*, never sync backwards); `behind` → opens a sync PR.
- The PR copies the **copied surface only** — `.flow/bin/*` (mirrored with `--delete`, so files
  canonical removed go away too) and the `flow-*` thin callers — and bumps `.flow/VERSION`. It
  never touches `.flow/config.yml`, `.flow/tasks/`, or the project's `CLAUDE.md`. The protocol
  block stays a manual adopt (it's interleaved with project notes; auto-rewriting it is unsafe).
- A `flow-sync/<version>` branch isn't a `flow/<id>` branch, so `touches-guard` skips it and the
  store-guard passes — but flow-gates' `flow-tooling` job runs the **synced** tests + `flow-doctor`,
  so the gate validates each adoption for free. A human reviews and merges; nothing auto-merges.
- It runs canonical's *own* `flow-sync.mjs` (the authority), not the repo's possibly-stale copy,
  and is idempotent (reuses an open sync PR for the same version). Opens with `FLOW_PAT` so the PR
  triggers the gate (CAN-58); falls back to `GITHUB_TOKEN` when unset.

> Governance (now in the protocol's Hard rules): **Flow infra is authored in canonical; repos
> adopt — never patch it as a project task.** A repo can *discover* a bug under load; the fix is
> committed to canonical and pulled back in via `flow-sync`.

### Uncommitted-task guard (CAN-41)

`flow-doctor` also **fails** on any `.flow/tasks/*.md` that `git status` reports as untracked or
modified: a task isn't in the store until it's committed to `main` (the store *is* the committed
state, and concurrency depends on every session seeing the same committed files). The git read is
injectable for unit tests and **skipped** (a note, not a failure) outside a git work tree, so
tarball checkouts and fixtures are unaffected.

## Reconciled in (Phase 0)

The Nudge-evolved infra the plan called for has been brought into canonical as the corrected
superset:

- **`parse-task-id.mjs` + branch-or-title id resolution (CAN-52)** in `_flow-status` / `_flow-done`,
  so cloud sessions forced onto non-`flow/` branches still transition.
- **`flow-open-pr.mjs` + `_flow-open-pr.yml` (CAN-50)** — auto-open the PR on branch push. Per the
  plan, canonical opens it **non-draft** (Nudge's version still used `--draft`).
- **`flow-recover.mjs` + `_flow-recover.yml` (CAN-51)** — self-heal stranded tasks.
- **The CAN-41 uncommitted-task guard** merged into `flow-doctor`, alongside canonical's existing
  ahead-bits (the touches-overlap check, multi-line `touches` parsing, and the version-drift check —
  all kept).
- **The CAN-58 `FLOW_PAT` gate-trigger pattern** in both auto-PR paths.

All helpers ship with their proving tests (`node --test .flow/bin/*.test.mjs`).

## What's deferred (and why)

1. **Tag `v1`** (`git tag v1 && git push origin v1`) — a release action left to the maintainer.
   Only after the tag exists do the `@v1` caller pins resolve; until then the callers are the
   documented end-state.
2. **Cut the consuming repos over** to the thin callers (Nudge first, dogfood; then Roost/Meadow),
   and **confirm the gate fires end-to-end** on a real PR. This is cross-repo work, out of the
   canonical repo's reach.
3. ~~**The `.flow/bin` npm package** (Decision 2)~~ — **resolved 2026-06-24:** the bin stays copied
   per repo, governed by the version stamp + `flow-doctor` drift check and updated by `flow-sync`.
   The npm package is deferred as an optional later refactor, not a prerequisite — the copy+check+
   sync loop already closes the drift surface. See the plan's Decision 2 and Phase 3/4.
4. **A reusable-gate toolchain story for non-Node stacks** beyond the `setup_node_version` input —
   best settled by the dogfooding in (2).
5. **Further drift found but not in the plan's Phase 0 list:** `pick-task.mjs` and the
   `touches-guard.mjs` multi-line `touches` fix (CAN-57) have also diverged between Nudge and
   canonical. Left for a follow-up reconciliation to keep this change scoped to the plan.
