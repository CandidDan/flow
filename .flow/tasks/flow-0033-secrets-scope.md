---
id: "flow-0033"
title: "Stop callers handing every secret to every reusable workflow"
status: "in_review"
priority: 2
project: "flow"
owner: "session_01DGq92vqQgDYS9RXn7rRr1B"
created: "2026-09-01"
started: "2026-09-01T02:11:51Z"
branch: "flow/flow-0033-secrets-scope"
pr: "https://github.com/CandidDan/flow/pull/50"
issue: ""
blocked_reason: ""
serves: ["maintenance"]
touches: ["project-template/.github/workflows/flow-*.yml", ".github/workflows/flow-*.yml", ".flow/bin/*.test.mjs"]
labels: [infra, security]
notes:
  - "2026-09-01: triaged out of the flow-0026-style canary-repin work on CandidDan/progress#46 — the security reviewer's Critical finding on that PR (pointing secrets-inheriting workflows at a floating v1-edge tag) surfaces a pre-existing defect that applies at every pin, not just edge: every flow-*.yml caller uses `secrets: inherit`, so a job gets every repo secret whether its reusable declared needing it or not. Human (repo owner) explicitly authorised this fix in conversation, conditioned only on CLAUDE_CODE_OAUTH_TOKEN never leaking; that authorization is the basis for claiming this directly rather than waiting on task-writer/orchestrator."
  - "2026-09-01: built and gate green locally. Correction to my own initial assumption, caught by the proving test rather than assumed away: _flow-queue-runner.yml genuinely declares BOTH secrets (FLOW_PAT was added by flow-0026/PR#40, on main only — not yet in the v1 tag), so canonical's own @main caller now passes both while the template's @v1 caller still passes only CLAUDE_CODE_OAUTH_TOKEN, matching what v1 actually declares (verified with `git show v1:.github/workflows/_flow-*.yml` against every reusable, not assumed). Also found and had to fix three PRE-EXISTING tests that hard-coded the old `secrets: inherit` shape (check-workflows.test.mjs, flow-review-workflow.test.mjs, adapters.test.mjs) — the acceptance criterion below claiming 'no test currently asserts secrets: inherit' was wrong when written; corrected here rather than silently left in the task body. Full gate: build 21 workflows parsed, lint 60 .mjs files, test 624 pass / 0 fail / 1 skipped (yaml-dependent tests skip only in the no-npm-ci flow-tooling job), coverage 96.01% lines vs floor 83.5. flow-doctor: store healthy, 30 tasks."
---

## Context

Every `flow-*.yml` caller (in `project-template/` — the published artefact — and in canonical's own
`.github/workflows/`) passes secrets to its reusable workflow with `secrets: inherit`. That hands
the reusable **every secret configured in the repo**, regardless of which ones its
`on.workflow_call.secrets:` block actually declares.

Checked what each reusable declares vs. what `inherit` actually exposes (verified against the
`main` branch content directly, not assumed):

| Caller | Reusable declares (`main`) | `inherit` also exposes |
|---|---|---|
| flow-review | `CLAUDE_CODE_OAUTH_TOKEN` | `FLOW_PAT` (unused) |
| flow-compass | `CLAUDE_CODE_OAUTH_TOKEN` | `FLOW_PAT` (unused) |
| flow-triage | `CLAUDE_CODE_OAUTH_TOKEN` | `FLOW_PAT` (unused) |
| flow-open-pr | `FLOW_PAT` | `CLAUDE_CODE_OAUTH_TOKEN` (unused) |
| flow-recover | `FLOW_PAT` | `CLAUDE_CODE_OAUTH_TOKEN` (unused) |
| flow-sync | `FLOW_PAT` | — (nothing else to expose) |
| flow-queue-runner | **both** `CLAUDE_CODE_OAUTH_TOKEN` **and** `FLOW_PAT` | — (nothing else to expose) |

`flow-queue-runner` is the one genuine exception: it runs the agent (`CLAUDE_CODE_OAUTH_TOKEN`)
*and* pushes its own git commits as a real actor so the push fires `flow-open-pr` (`FLOW_PAT`,
CAN-58) — both are legitimately needed. It's also the one place `@v1` and `@main` currently
diverge: `FLOW_PAT` support for queue-runner was added by flow-0026 (PR #40) on `main` only, so
the `v1` tag's `_flow-queue-runner.yml` still declares `CLAUDE_CODE_OAUTH_TOKEN` alone — passing
`FLOW_PAT` from a caller pinned `@v1` would fail GitHub's own validation (an undeclared named
secret). Checked directly with `git show v1:.github/workflows/_flow-*.yml` against every other
reusable too: everything else is identical between `v1` and `main`.

`FLOW_PAT` is documented as a fine-grained, repo-scoped PAT (Contents + PRs), so its unnecessary
exposure is bounded. `CLAUDE_CODE_OAUTH_TOKEN` is account-scoped (`claude setup-token`, billed
against the account's own plan) — the more valuable credential, and the one worth not handing to
workflows that never call `claude-code-action`.

The concrete risk this closes: `flow-open-pr` fires on **every push, unauthenticated by a human
review**, and today carries `CLAUDE_CODE_OAUTH_TOKEN` it has no use for. A supply-chain or logic bug
in that one file's future revision would have the account token available on every push in every
adopting repo, on whichever channel (`@v1`, `@v1-edge`, or an exact tag) that repo pins — this is
not specific to the edge channel, it is the fleet's current baseline.

## Scope

**Does:**
- In every `flow-*.yml` caller in `project-template/.github/workflows/` and canonical's own
  `.github/workflows/`, replace `secrets: inherit` with an explicit block naming only the secret(s)
  the paired `_flow-*.yml` reusable actually declares **at the ref that caller pins** (see table
  above; `flow-queue-runner` differs between the two directories for exactly that reason).
- Leave callers with no secrets today (`flow-gates`, `flow-done`, `flow-status`) untouched.
- Leave every `_flow-*.yml` reusable's own `on.workflow_call.secrets:` declarations untouched —
  they are already correct; only the caller side over-grants.
- Fix any existing proving test that hard-codes the old `secrets: inherit` shape, so the suite
  keeps testing what is actually true rather than going stale silently.

**Does not:**
- Touch any consuming repo directly (`progress`, `write`, `nudge`, `meadow`, `tanplan`) — they pick
  this up via `flow-sync` once released, same as any other canonical fix.
- Touch the `v1` / `v1-edge` tag question, the canary selection, or `docs/flow-versioning-policy.md`
  — orthogonal decisions already made elsewhere in this conversation.
- Add or rotate any secret, or change what `FLOW_PAT` / `CLAUDE_CODE_OAUTH_TOKEN` are scoped to.
- Touch the protocol-vs-repinning-doc contradiction raised on `progress#46` — a separate, still-open
  question.
- Fix `project-template/.github/workflows/flow-compass.yml` pinning `@v1` when `_flow-compass.yml`
  does not exist at the `v1` tag at all (discovered while writing this; pre-existing, unrelated to
  secrets scope, and the same "`v1` is stale" story already being handled by the canary work — it
  resolves the moment `v1` is next promoted).

## Acceptance criteria

- [ ] Given a repo with `FLOW_AI=true` and both secrets configured, when `flow-review`,
      `flow-compass`, or `flow-triage` runs, then the job's `secrets` context exposes
      `CLAUDE_CODE_OAUTH_TOKEN` and does **not** expose `FLOW_PAT`. Proved by
      `secrets-scope.test.mjs`.
- [ ] Given the same repo, when `flow-open-pr` or `flow-recover` runs (either directory), or
      `flow-sync` (template only — canonical has no caller), then the job's `secrets` context
      exposes `FLOW_PAT` and does **not** expose `CLAUDE_CODE_OAUTH_TOKEN`. Proved by
      `secrets-scope.test.mjs`.
- [ ] Given canonical's own `flow-queue-runner.yml` (`@main`), then its `secrets` context exposes
      both `CLAUDE_CODE_OAUTH_TOKEN` and `FLOW_PAT`; given the template's `flow-queue-runner.yml`
      (`@v1`), then it exposes only `CLAUDE_CODE_OAUTH_TOKEN` — matching what each pinned ref's
      reusable actually declares. Proved by `secrets-scope.test.mjs`.
- [ ] Given `flow-gates.yml`, `flow-done.yml`, `flow-status.yml`, then none carries a `secrets:`
      block at all, in either directory — unchanged from before this task. Proved by
      `secrets-scope.test.mjs`.
- [ ] Given `npm run build`, then it still parses every workflow file (21 in canonical's own
      `.github/workflows/`) — the named-secrets form is valid `workflow_call` syntax.
- [ ] Given the full local gate (`build`, `lint`, `test`, `coverage`), then it is green, including
      three pre-existing tests (`check-workflows.test.mjs`, `flow-review-workflow.test.mjs`,
      `adapters.test.mjs`) that hard-coded the old `secrets: inherit` shape and needed updating —
      a task that "shouldn't need" to touch other tests still must, if the gate says so.
