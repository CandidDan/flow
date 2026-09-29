# ADR-0008: The reusable workflows run canonical's helpers from canonical, at their own commit

**Status:** Accepted
**Date:** 2026-09-29
**Deciders:** Dan (inspirator / sole maintainer)

## Context

A Flow repo adopts two things from canonical, and they arrive **at different times**:

- the **reusable workflows** (`.github/workflows/_flow-*.yml`), resolved by GitHub at the ref the
  caller pinned — so moving the `v2` alias changes them in every repo on the next run, instantly
  and without a commit in that repo;
- the **`.flow/bin/` helpers** those workflows invoke, which are *files in the consuming repo* and
  change only when that repo's `flow-sync` PR merges — a human-reviewed event, hours or days later.

The workflows call the helpers by path against the caller's checkout:

```yaml
run: node .flow/bin/source-roots.mjs plan
```

So any release that makes a reusable depend on a **new or changed** helper breaks every pinned repo
from the moment the alias moves until that repo syncs. This is not hypothetical:

> **The 2.1.x fleet break, 28–29 Sep 2026.** 2.1.0 made `_flow-gates.yml` call
> `.flow/bin/source-roots.mjs` and 2.1.1 added `.flow/bin/check-claude-md.mjs`. Neither helper
> existed in any adopting repo at the time the `v2` alias was moved. Every `@v2` repo went red on
> every pull request — not for anything in its own diff — until its sync PR merged.

That is a direct hit on **G10 — the gate tells the truth**. A red gate that says nothing about the
code under it is the same failure as a green gate over wrong work, wearing the other colour.

flow-0091 (sync on drift) shortens the window. It cannot close it: the window exists because the
two halves are versioned independently, and shortening a race is not the same as removing it.

## Decision

**A reusable workflow runs canonical's helpers from canonical, fetched at the same commit as the
running workflow file.** The consuming repo's `.flow/bin/` copy is no longer what CI executes for a
converted helper; it remains for local runs and for the repo's own `flow-tooling` tests.

The workflow and the helper it calls then ship as one unit, at one commit, and the sync PR stops
being load-bearing for CI correctness. Moving an alias can no longer strand a repo without a
helper, because the helper travels with the alias.

### How a reusable learns its own commit — proved, not assumed

`${{ github.workflow_sha }}` is **the caller's** workflow commit, not the reusable's; inside a
reusable it points at the thin 3-line caller in the consuming repo. `github.job_workflow_sha` —
the name that appears in the OIDC claim set — **is not exposed as an expression at all**
(`actions/runner#2417`, open for years).

What *is* exposed, and is purpose-built for exactly this, is the **`job` context**. Quoting the
GitHub Actions *Contexts reference* (fetched 2026-09-29,
`https://docs.github.com/en/actions/reference/workflows-and-actions/contexts`):

| Property | Type | Description |
|---|---|---|
| `job.workflow_sha` | `string` | The commit SHA of the workflow file that defines the current job. (not available on GitHub Enterprise Server) |
| `job.workflow_repository` | `string` | The `owner/repo` of the repository containing the workflow file that defines the current job. For example, `octo-org/octo-repo`. (not available on GitHub Enterprise Server) |
| `job.workflow_ref` | `string` | The full ref of the workflow file that defines the current job. … For jobs defined in a reusable workflow, this refers to the reusable workflow file. (not available on GitHub Enterprise Server) |

The same page's reusable-workflow example checks out the reusable's own source with
`ref: ${{ job.workflow_sha }}`. So the mechanism is documented, first-party, and used by GitHub's
own documentation for this precise purpose. **`job.workflow_sha` is the source of truth, and
`job.workflow_repository` is how the fetch learns which repo to fetch from** — the canonical
`owner/repo` is a last-resort constant in the workflow and is never the first answer, so a fork of
canonical gates against its own fork rather than against the upstream it forked from.

A commit SHA is immutable. That is the property that matters: the fetch pins the exact tree the
running workflow was resolved from, so a run cannot be half at one release and half at another.

### The fallback, and its race

The `job.*` properties are documented as **not available on GitHub Enterprise Server**. For that
case only, `_flow-gates.yml` takes an input:

```yaml
flow_ref:   # e.g. "v2" — only used where job.workflow_sha is unavailable
```

The caller sets it to **the alias it pinned its `uses:` to**. That reintroduces a race, and naming
it is the point of writing it down: **an alias that moves between the moment GitHub resolves the
`uses:` and the moment this step fetches leaves that one run with helpers one release ahead of the
workflow that called them.** The window is seconds, it affects only the runs in flight during a
release, and it is strictly smaller than the days-long window it replaces. On github.com the
fallback never fires and the race does not exist.

`flow_ref` defaults to the empty string, never to `main`. A **moving branch is refused
explicitly** — `main`, `refs/heads/main` and `HEAD` are rejected with an error rather than fetched
— because a gate that silently follows a branch is a gate whose behaviour nobody can reproduce.
With neither `job.workflow_sha` nor `flow_ref`, the step fails and names both; it never guesses.

### The repo-root contract — `FLOW_REPO_DIR`

**The trap this closes.** Every converted helper resolves its store as
`dirname(realpath(import.meta.url))/..` (canonical's `CLAUDE.md`, *"adapters, not copies"*). Run
from a canonical checkout under `$RUNNER_TEMP`, such a helper reads **canonical's own
`project-template/` fixtures** — an uncalibrated `REPLACE-ME` config and a fixture task store — and
**exits 0**. The gate would be green, having checked the wrong repo. That is worse than the fleet
break it replaces, because it is silent.

So, one variable, named once, here:

- **`FLOW_REPO_DIR`** — absolute path of the repo the helper must operate on. When set, it wins
  over the module-relative default, and the helper `chdir`s to it so `git` subprocesses see the
  target repo too. The converted steps set it to `${{ github.workspace }}`.
- **`FLOW_CI`** — set to `1` by a converted step to say *"a Flow reusable is invoking you"*. In
  that mode `FLOW_REPO_DIR` is **required**: unset, the helper exits non-zero and names
  `FLOW_REPO_DIR` rather than falling back to its own directory.

`FLOW_CI` is an explicit opt-in rather than `GITHUB_ACTIONS`, deliberately. A repo that has synced
new helpers but is still pinned to an **older** workflow tag invokes them the old way, from its own
`.flow/bin/`, with neither variable set — and must keep working. Keying the requirement off
`GITHUB_ACTIONS` would break that repo, which is the 2.1.x break with the halves swapped.

This is the `REVIEW_REPO_DIR` pattern from flow-0079 (`_flow-review.yml` runs the review gate from
a base-branch worktree while pointing it back at the PR checkout), applied to the gate. Same
problem — *the helper is not in the tree it is judging* — same shape of answer.

### What is converted, and what is deliberately not

**Converted (this slice):** `_flow-gates.yml`'s three helpers — `source-roots.mjs`,
`check-claude-md.mjs`, `touches-guard.mjs`. They are the ones that broke the fleet.

**Staying on the repo's own copy, on purpose:**

- **`flow-doctor`** validates *this repo's store against this repo's tooling*. Its whole job is to
  report drift in the synced state; run from canonical it would report on canonical.
- **The `flow-tooling` test step** (`node --test .flow/bin/*.test.mjs`) exists to prove the
  **synced copy** works in the repo that synced it. Running canonical's tests instead would make
  the step unable to fail for the reason it was added.

Both are the same argument: a check *about* the synced copy must execute the synced copy.

**Not yet converted:** `_flow-done.yml`, `_flow-open-pr.yml`, `_flow-queue-runner.yml`,
`_flow-recover.yml`, `_flow-status.yml` (`apply-board-edits`, `parse-task-id`, `flow-open-pr`,
`pick-task`, `queue-runner-verify`, `flow-recover`). Same mechanism, no new decisions — a
follow-up. `_flow-review.yml` needs nothing: flow-0079 already runs its helper from outside the
tree it judges.

## Consequences

- **A release can change a workflow and its helper together.** The helper reaches CI at the same
  instant as the workflow, so the sync PR stops gating CI correctness and becomes what it was meant
  to be: how a repo picks up the local tooling.
- **The fetch is a new network dependency in the gate.** One shallow, blob-filtered, sparse clone
  of a public repo per job that needs it. A GitHub outage that breaks it also breaks the checkout
  the job already depends on, so it adds no new single point of failure — but it is not free, and a
  job that does not need a helper does not do it.
- **Canonical must stay public**, or every adopting repo needs a credential to fetch it. It is, and
  `_flow-sync.yml` has already depended on that with a plain unauthenticated clone.
- **Two copies of the helpers now exist at runtime**, and they can differ. That is the point, and
  the split must stay legible: `docs/flow-reusable-workflows.md` states which copy serves which
  purpose, and `flow-doctor` still reports the local copy's drift.
- **The fetch step is duplicated across the jobs that need it.** A reusable workflow cannot share a
  step between jobs without a composite action, and the value of the step is that it runs *before*
  anything from canonical exists. `.flow/bin/canonical-helpers-workflow.test.mjs` pins the copies
  byte-identical, the same way `gate-assertion.test.mjs` pins the two decision-line assertions.

## Alternatives rejected

**Ship the helpers as an npm package.** Clean versioning, and it was already considered and
deferred in Phase 3 of the propagation plan. It replaces a fetch with a registry dependency, an
install step in every gate job, and a publish step in every release — and it does not answer the
question this ADR turns on, because a package version still has to be chosen by *something*.
`job.workflow_sha` chooses it for free, and cannot drift from the workflow.

**Vendor the helpers into the workflow as inline scripts.** No fetch, perfectly atomic. Also
untestable, unlintable, and unreadable — canonical's whole discipline is that helpers are `.mjs`
files with proving tests, and `npm run lint` parses every tracked one.

**Make `flow-sync` run automatically on drift and call it closed.** That is flow-0091, and it is
worth having, but an automatic PR is still a PR: it needs review and merge. It shortens the window;
it does not remove it. The two are complementary, not alternatives.

**Keep the status quo and forbid releases that change a helper.** A release policy enforced by
remembering. The 2.1.x break happened under exactly that policy.
