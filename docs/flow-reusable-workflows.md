# Flow reusable workflows + version stamp

**Status:** Phases 0–4 of `flow-infra-propagation-plan.md` are in canonical — Phase 0
reconciliation (see *Reconciled in* below), Phase 1 reusable workflows, Phase 2 version stamp +
drift check, Phase 3 bin-delivery decision (copy + check, npm package deferred), and Phase 4
(`flow-sync` adopt mechanism + the governance rule). `v1` is tagged. Remaining: **cut the
consuming repos over** (the canary repo first, dogfood) and the plugin-based skills/agents adoption (see
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
| `_flow-gates.yml` | The Definition-of-Done gate: store-is-main-only guard, build/lint/test/coverage from the caller's `.flow/config.yml`, flow-tooling tests, touches-guard, plus a matrix job per declared `source_roots` entry the primary gate doesn't already cover (optional `runtime` / `version` / `retry` per entry; a `runtime: node` entry installs with the repo's `commands.install` first — see below) | input `setup_node_version` (default `22`; `""` for non-Node). Every `setup-node` step sets `check-latest: true`, so a major line resolves to its latest patch rather than the runner image's cached one (flow-0166) |
| `_flow-status.yml` | PR marked ready for review → `in_review`; draft PR opened → stays `in_progress` with `branch` + `pr` recorded (flow-0039); a PR opened directly as non-draft still goes straight to `in_review`; closed-unmerged → `ready`. An action it does not model is a logged no-op, so a caller pinned ahead of the reusable degrades to silence. Id resolved from the branch **or** the PR title (CAN-52), so non-`flow/` branches (e.g. cloud `claude/…`) still transition | — |
| `_flow-done.yml` | PR merged → task `done`. Same branch-**or**-title id resolution (CAN-52) | — |
| `_flow-open-pr.yml` | On a `flow/<id>-…` branch push, auto-opens the PR if the branch is ahead of base with no PR yet (CAN-50) — a worker that stops short of `gh pr create` no longer strands the task. Opens it as a **draft** (flow-0039), falling back to non-draft where drafts are unavailable; the worker's `gh pr ready` is what asks for review. Idempotent. Opens with `FLOW_PAT` so the PR triggers `flow-gates` (CAN-58) | secret `FLOW_PAT` (optional) |
| `_flow-recover.yml` | Scheduled self-heal sweep (CAN-51): a task stranded `in_progress` past a staleness threshold gets its PR re-opened as a **draft** (work was pushed but is unfinished by definition — flow-0039) or its claim reset to `ready` (nothing to recover) — and a reset also moves the task up one model tier, in the same commit (flow-0174). Off unless `FLOW_AI=true`; always on-demand via dispatch | input `threshold_minutes`; secret `FLOW_PAT` (optional) |
| `_flow-unblock.yml` | **The blocked-task release sweep** (flow-0041), no model in the loop. A `blocked` task whose **every** `blocked_by` entry has resolved — a task id that is `done` on `main`, a PR url that **merged** — goes back to `ready` with `blocked_reason` and `blocked_by` cleared, through `apply-board-edits.mjs` as a commit to `main`. A PR closed unmerged never satisfies an entry (the run warns); an empty `blocked_by`, or any entry it cannot read, keeps the task blocked — only a person lifts that block. It then stops: it starts **no** worker (flow-0173) — a released task is `ready`, and the next worker run (the worker routine's own schedule, picking with `pick-task`) takes it. Trigger-agnostic: the callers fire it on `workflow_run` of `flow-done` (`completed`), hourly, and on dispatch. **Not** gated on `FLOW_AI` — a human-driven repo has dependencies that land too. `GITHUB_TOKEN` only, never `FLOW_PAT`; a PR in a repo the token cannot read resolves unknown and stays blocked | input `queue_runner_workflow` (default empty) — **ignored** since flow-0173 (it named the queue-runner, retired in flow-0174), still declared so a caller that passes it does not fail; no secrets; caller grant exactly `contents: write` + `pull-requests: read` (`actions: write` was dropped in 4.0.0 with the dispatch it served) — the second is for the `blocked_by` PR lookup (`gh api repos/<owner>/<repo>/pulls/<n>`): a permissions block is exhaustive, so without it the token cannot read a PR in a private repo and every PR-url block resolves unknown and stays blocked (flow-0163) |
| `_flow-dispatch.yml` | **The routine dispatcher** (flow-0182), no model in the loop. Fires the Claude Code worker routine for the next `ready` task's tier: counts `in_progress` (stops at `dispatch.max_in_progress`, default 3), picks with `pick-task.mjs`, resolves the tier with `task-model.mjs`, re-reads the task from `main` and fires only if it is still `ready`, then POSTs `{"text": "<task-id>"}` to `https://api.anthropic.com/v1/claude_code/routines/<id>/fire`. **At most one task a run**; the worker's claim is a push that starts the next run. One decision line per run: `fired`, `skipped` (`at-capacity`, `nothing-ready`, `no-routine-for-<tier>`, `no-longer-ready`) or `failed` (non-2xx, naming status and tier). A tier with no routine configured is skipped with exit 0. Callers fire it on a push to `.flow/tasks/**` on `main`, on `workflow_run` of `flow-unblock` and `flow-recover` (`completed` — their `GITHUB_TOKEN` pushes start no workflow), daily, and on dispatch; `concurrency: flow-dispatch`, not cancel-in-progress. Wiring: `docs/flow-routines.md`, *Wiring the trigger* | inputs `runner`, `haiku_routine_id` … `fable_routine_id` (caller passes `vars.FLOW_ROUTINE_<TIER>_ID`); secrets `FLOW_ROUTINE_HAIKU_TOKEN`, `_SONNET_`, `_OPUS_`, `_FABLE_TOKEN` (all optional), reaching the script only through `env:`; caller grant exactly `contents: read` |
| `_flow-triage.yml` | Scheduled issue triage (off unless `FLOW_AI=true`) | secret `CLAUDE_CODE_OAUTH_TOKEN` |
| `_flow-review.yml` | The three Definition-of-Done review checks on a PR — qa, code-review and a conditional security review (flow-0007). **Skipped entirely while the PR is a draft** (flow-0039) — the `plan` job carries the condition and the other three `needs: plan` — so the reviewers run once, when the worker marks the PR ready, not on every work-in-progress push. Runs for **any** PR author, not just `flow/` branches; model and security-trigger paths come from the caller's `.flow/config.yml` `review:` block, and `.flow/bin/flow-review.mjs` turns each written verdict into an exit code (fail-closed). Off unless `FLOW_AI=true` | input `node_version`; secret `CLAUDE_CODE_OAUTH_TOKEN` |
| `_flow-kickback.yml` | **The bounded auto-fix round** (flow-0082). When the `flow-review` run on a PR concludes `failure`, dispatches ONE auto-fix worker onto that same PR to address the reviewers' **blocking** findings, and the round's one push re-runs review — so a red check starts the kickback instead of waiting for a human to notice. The worker **commits and does not push**; the workflow checks the round and pushes, which is what lets the test-weakening guard sit between the two. Off unless `FLOW_AI=true` **and** `review.auto_fix_rounds` is set (see below) | input `node_version`; secrets `CLAUDE_CODE_OAUTH_TOKEN` + `FLOW_PAT` (**required**, not optional — see below) |
| `_flow-sync.yml` | The adopt mechanism (Phase 4): when the repo's `.flow/VERSION` is behind canonical, copies the updated `.flow/bin/*` + thin callers in, bumps the stamp, and opens a **reviewed PR**. Safe to run anytime (only opens a PR; no `FLOW_AI` gate). The ref it adopts from is **read off the caller's own `uses:` pin** when `canonical_ref` is empty — which is every scheduled run (flow-0105) | input `canonical_ref` (overrides the pin; empty ⇒ resolved from the caller, `v2` only if no caller pins one); secret `FLOW_PAT` (optional) |

### queue-runner — retired (flow-0174)

`_flow-queue-runner.yml`, its two callers and its helpers (`queue-runner-schedule.mjs`,
`queue-runner-verify.mjs`) were retired in 4.0.0. The worker runs as a Claude Code cloud routine
instead — no Actions minutes — set up per `docs/flow-routines.md`. What the retired queue-runner did,
and where each piece went:

| It did | Now |
|---|---|
| picked the next `ready` task | the routine, with `pick-task.mjs`, when its trigger is empty |
| ran the worker on the task's model | one routine per tier (`task-model.mjs` is still the table) |
| moved a run that produced nothing up a tier | `_flow-recover.yml`: resetting a stranded claim with nothing pushed escalates it one tier |
| `FLOW_QUEUE_RUNNER` / `FLOW_TZ` / `FLOW_RUN_HOUR` | gone — a routine's own schedule replaces them; the variables can be deleted |

`flow-sync` deletes `.github/workflows/flow-queue-runner.yml` from an adopting repo (the retired-paths
list in `_flow-sync.yml`), so it appears under **Removed** in the sync PR.

**`FLOW_PAT` (CAN-58).** A PR opened with the Actions `GITHUB_TOKEN` does *not* trigger downstream
workflows, so `flow-gates` would never fire on an auto-opened PR — the gate silently bypassed.
`_flow-open-pr` / `_flow-recover` open PRs with a `FLOW_PAT` so the `pull_request` event is
attributed to a real actor and the gate runs. Falls back to `GITHUB_TOKEN` when the secret is unset
(PR opens, but ungated), so adding the secret is a no-break enablement. Thin callers pass it by
name — `FLOW_PAT: ${{ secrets.FLOW_PAT }}` — not `secrets: inherit`, so a caller only ever forwards
the secret(s) its own reusable declares.

**The one permission list.** Every workflow above that takes `FLOW_PAT` shares one credential, so
there is one list of what it must carry. It is duplicated in `_flow-open-pr.yml`'s header, and
`.flow/bin/flow-pat-forwarding.test.mjs` parses both copies and fails the gate when they disagree.

FLOW_PAT — required permissions (fine-grained PAT, this repository only, short expiry):

- Contents: Read and write — flow-kickback's worker pushes its fix to the task branch, and
  flow-sync pushes the sync branch. Read alone cannot push, and the run dies at the first
  git push.
- Pull requests: Read and write — flow-open-pr opens the draft PR, flow-recover re-opens a
  stranded one, and flow-sync opens the sync PR.
- Issues: Read and write — a worker files an issue for a problem it finds outside its own
  task, which is how that work gets captured instead of lost.
- Workflows: Read and write — flow-sync and a worker fixing CI both push commits that
  change files under .github/workflows/, and GitHub refuses that push from any credential lacking
  it. GITHUB_TOKEN can never have it, which is why the PAT is the only way.

Grant all four. A token short one permission does not fail at setup; it fails later, at the one
step that needed it. Keep the expiry short and rotate: `Workflows: Read and write` lets the holder
edit CI, and `_flow-kickback` hands the token to an agent — the fences that make that
acceptable are the task's declared `touches` plus the touches-guard check, the review checks, and a
human merge, while the token's own limits are its single repository and its expiry date.

**You do not need the "Allow GitHub Actions to create and approve pull requests" repository
setting** (Settings → Actions → General → Workflow permissions), and turning it on is not an
alternative to `FLOW_PAT`. All it does is widen `GITHUB_TOKEN` — and a PR created by `GITHUB_TOKEN`
triggers no downstream workflows, so `flow-gates` and the three review checks would never run on
it. That is precisely the silent gate bypass `_flow-open-pr` exists to avoid, so the setting buys a
PR that looks fine and was never checked. It also does nothing at all for the push problem above:
no repository setting grants `GITHUB_TOKEN` the `workflows` permission, because it is not one of
`GITHUB_TOKEN`'s permissions.

Because `actions/checkout` in a reusable workflow checks out the **caller's** repo, every
`node .flow/bin/…` and `.flow/config.yml` reference resolves to the *consuming project's* store and
tooling — exactly what the gate must read.

### The auto-fix round — `review.auto_fix_rounds`, and what it will never do (flow-0082)

`_flow-kickback.yml` is the only workflow in the fleet that lets a model change a PR without a
human asking it to, so every bound on it is stated here rather than left to the file.

**It is off twice over.** `vars.FLOW_AI` must be `true`, *and* the consuming repo's
`.flow/config.yml` must set `review.auto_fix_rounds` to a round count. The template ships the key
**commented out**, so adopting the caller turns nothing on.

| `review.auto_fix_rounds` | Effect |
|---|---|
| absent, or `0` | **Off.** A failed review check does exactly what it did before: nothing automatic. |
| `1`–`3` | At most that many auto-fix rounds per PR, then the PR escalates to a human. |
| above `3` | Clamped to **3**, with a warning on the run naming the value you configured. The hard maximum is not a knob: the fixer and the reviewer are both models, and more rounds between them converge on agreement rather than on correctness. |

**`FLOW_PAT` is required, not optional.** A push made with `GITHUB_TOKEN` triggers no workflows
(GitHub's recursion guard), so a fix pushed with it would never be re-reviewed — the round would
look successful and prove nothing. With no `FLOW_PAT` the workflow **skips**, visibly, saying so.

**And it never shares a JOB with a model (flow-0135).** No job that runs a model references
`secrets.FLOW_PAT`, and the one job that does — `push` — runs no model. The fixer runs a model
under `--permission-mode bypassPermissions`, on a checkout of the PR branch, and its prompt tells it
to read the PR's comments as its instructions — so on a non-fork PR, anyone who can comment can
address that session. `--disallowedTools` does not contain that; it pattern-matches command
prefixes, so any route it does not textually name reaches the remote, and a hosted runner's open
egress reaches the network. A session that cannot push because it holds nothing that can push is
bounded. A session that was merely *asked* not to push is not.

The boundary is the **job, not the step**, and this file once got that wrong. flow-0082 kept
`FLOW_PAT` out of the fixer's *step* and handed it to a later step of the *same job*. Steps share a
runner: the filesystem (so `.git/hooks/`) and the `$GITHUB_ENV` / `$GITHUB_PATH` files, which feed
every later step. A model step can plant a hook, an env var (`BASH_ENV`, `NODE_OPTIONS`,
`LD_PRELOAD`) or a `PATH` entry that runs beside whatever a later step holds — and can subvert the
guards in that job as well. So the round now crosses a job boundary as **data**:

```
plan   (no model)  records head_sha + guard_sha, and whether the task's criteria were amended
  │
fix    (model)     commits ─▶ git bundle <head>..HEAD + outcome.json ─▶ artifact (1 day)
  │                           no FLOW_PAT, no write scope
push   (no model)  fresh checkout of head_sha (persist-credentials: false)
                   ─▶ check 1 hand-back ─▶ check 2 remote head unmoved
                   ─▶ check 2b bundle: exactly one prerequisite, == head_sha; tip descends from it
                   ─▶ check 3 tests not weakened (default-branch helper; replacements kept and
                      disclosed when plan saw the criteria amended) ─▶ check 4 committed something
                   ─▶ amend + push with FLOW_PAT, hooks off (core.hooksPath=/dev/null, --no-verify)
                      — that push is the PR's one `synchronize`, and it re-runs the reviewers
```

**There is no draft toggle (flow-0159).** flow-0082 converted the PR to a draft for the round,
so the round's own work would not start three reviewers part-way through, and `push` marked it
ready again. Two things changed under it. Since flow-0135 the fixer cannot push — its commits
leave as a bundle and `push` makes **one** push — so a non-draft PR gets exactly one
`synchronize`, and one review, at the end of the round: the thing the draft protected now holds
without it. And the toggle broke every round: once FLOW_PAT was confined to `push`, the `undraft`
job ran `convertPullRequestToDraft` on `GITHUB_TOKEN`, which GitHub refuses to an integration
token ("Resource not accessible by integration"), so `fix` and `push` were skipped and the human
got a card for a round that never ran. Handing `undraft` FLOW_PAT would have worked, at the cost
of a second job holding it for a toggle that protects nothing. The accepted cost: the PR does not
look like a draft mid-round, so a human could merge it then. Merge is human-only anyway. `decide`
still skips a PR that is **already** a draft, because a draft is not asking for review.

The bundle travels as a run **artifact**, not a job output: a job output reaches the next job
through `env:`, and Linux caps one environment value at 128 KiB — a round that touches a lockfile
clears that. A bundle based on anything but the recorded head is refused, and the refusal is an
escalation like any other guard's, with its own sentence on the card.

**The same argument applies to every write, not just the push — so the permissions are per job.**
`GITHUB_TOKEN` is only as narrow as the job holding it, and a workflow-level `pull-requests:
write` is a grant *every* job gets, the fixer's session included. With it, an injected PR comment
is one step from `gh pr review --approve`, `gh pr close`, or `gh pr edit --remove-label
flow:needs-human` — undoing the escalation that stopped the PR. So the three jobs that run a model
hold reads only, and the jobs that hold writes run no model:

| job | token can write | runs a model | what it does |
|---|---|---|---|
| `plan` | nothing | no | reads the run's failed jobs, the PR, and the task's status on the default branch |
| `fix` | **nothing** | **yes** | the round: commit-only; its commits leave as a bundle, and nothing else here decides anything |
| `push` | nothing (but holds `FLOW_PAT`) | no | fresh checkout, the guards, then the one push — made with `FLOW_PAT`, not with this token |
| `round-card` | **nothing** | **yes** | writes the card's four fields for a round that handed nothing back, read-only |
| `escalate-round` | pull requests, issues | no | posts the card and the label for a round that did not push |
| `card` | **nothing** | **yes** | writes the card's four fields, read-only |
| `escalate` | pull requests, issues | no | posts that card and the label |
| `disclose` | pull requests | no | posts the replaced test lines of a round kept under amended criteria (flow-0161) |

The model jobs get `contents: read` + `pull-requests: read` (+ `id-token: write`, which is OIDC
minting and reaches nothing in the repo). `read` is what the fixer's prompt actually needs — it
is told to read the reviewers' verdicts — and read cannot label, comment, approve, close, edit or
merge. The file's own top-level block is `contents: read` and nothing more: a **floor**, so a job
added later is read-only until someone writes a block saying otherwise.

Splitting the model off from the step that posts its card means `outcome.json` has to cross a job
boundary, and every field in it is model-written text. It travels **base64 through a job output**,
bounded at 16 KiB — an alphabet that cannot carry a quote, a newline, a backtick or a `$`, which
is the same reason the fact-gathering step base64s commit messages. Absent or over-long, it
decodes to nothing readable and `decisionCard` renders the fallback card: visible, not silent.
**Rounds are counted on the PR, never on `main`.** Each pushed round carries exactly one commit
stamped with the git trailer `Flow-Auto-Fix-Round: N/CAP` — stamped by the *workflow*, after the
guards, so the thing being bounded cannot write its own bound. Rounds used is how many of the
PR's commits carry one, which a human can read straight off the commit list. That is also why
this workflow needs **no write access to the default branch at all**. The caller grants the
*union* of the per-job table above — `contents: read`, `pull-requests: write`, `issues: write`,
`actions: read`, `id-token: write`, and nothing else — because a reusable workflow can never
raise a scope above its caller's; the reusable then hands each job only its own share.
(`issues: write` is the `flow:needs-human` label — GitHub's label endpoints live under `issues`,
so labelling a *pull request* needs that grant rather than the `pull-requests` one. `actions:
read` is the jobs API, the only way to learn *which* review job failed, and it is `plan`'s alone.)

**What it will never do:**

- **Auto-fix a failed `security` check.** Alone or alongside others, security escalates.
- **Push a round that weakened the tests.** The easiest way for a model to satisfy "criterion X
  has no proving test" is to loosen an assertion, so the workflow diffs the round and escalates
  if it deleted or renamed a test file, removed a test declaration or an assertion, or added a
  `.skip` / `.only`. Adding tests and strengthening assertions is always allowed. The check is a
  line heuristic and deliberately errs towards escalating; a rewrite that really is stronger
  costs one tap on the card.

  **One exception: the task's criteria were amended after the PR opened (flow-0161).** A human
  ruling reaches the reviewers by amending the task's acceptance criteria on the default branch
  (flow-0085). When the amendment reverses a criterion, the honest fix *replaces* the assertion
  that proved the old wording — and a replaced assertion is a removed one, so every such round was
  thrown away (CandidDan/write#183). So `plan` compares the task's `## Acceptance criteria` on the
  default branch with the same section at the **merge base** of the PR head and the default
  branch (`criteriaAmended`; checkbox state, whitespace and everything outside the section are not
  amendments). Both commits are outside the fixer's reach — its prompt forbids editing the store
  and the store-guard fails a PR that does — and the PR branch's copy of the task file, PR comments
  and the hand-back are never read, so a difference means a person changed the contract. When the
  criteria were amended:

  | the round's diff | Check 3 |
  |---|---|
  | replaces declarations / assertions, no file ending with fewer of either | **pushed**, and the `disclose` job posts every trip — file, line, reason — as a headed PR comment straight after the push |
  | deletes or renames a test file, adds a `.skip` / `.only` / `todo`, or leaves a file with fewer test declarations or assertions | discarded, as before |

  When they were not amended, the guard behaves exactly as before. The fixer is told which case
  it is in, and rule 3 requires it to name each replaced assertion in `tried`; the qa re-run,
  judging against the amended criteria, is the backstop. A merge base that already contains the
  amendment (the branch was updated from the default branch after it) reads as not amended, and
  so does any failure to fetch either side — the exception has to be established, never assumed.
  `plan` runs the repo's own `.flow/bin/flow-kickback.mjs`, so a repo whose helper predates
  flow-0161 gets the unrelaxed guard until its next flow-sync.
- **Push a round that disputed the finding, handed back nothing, or claimed a fix and changed
  nothing.** Each escalates instead. A dispute, and a round a later guard stopped, are described
  by the round's own hand-back — it is the only thing that knows what it tried. A round that
  handed nothing back has no account of itself, so its card comes from the same bounded,
  **read-only** model call that writes the security and exhausted-cap cards: it reads the
  verdicts, the diff and the round history and writes the four fields, and it fixes nothing.
  When `fix` itself never succeeded (skipped, failed or cancelled), the card's **Tried /
  disputed** field is not the model's: `escalate-round` writes it in shell from
  `needs.fix.result`, naming the job and saying no fix was attempted (flow-0159). A model asked
  what a dead round "appears to have attempted" will describe an attempt, even when nothing ran.
- **Merge anything.** Merge stays human, as it always has.

**Every escalation is one decision card, plus the `flow:needs-human` label.** The card is a PR
comment in the G12 shape — the finding, what was tried or disputed, exactly one recommendation
("merge as is", or "kick back with: *a named change*"), the alternative it was chosen over, and
a footer with the rounds used. It is capped at 1,500 characters and links to the reviewer's full
verdict rather than quoting it, so it is readable from a phone. A recommendation the model
failed to produce renders a **fallback card** that says so and still carries the finding and the
link — the failure is visible, never silent. **No path adds the label without first posting a
card.**

**The label is also that PR's off switch.** The workflow never acts on a PR carrying
`flow:needs-human`; removing the label re-arms it.

**Why it is safe for this workflow to hold credentials.** A `workflow_run` event always runs the
workflow **file from the default branch**, never from the PR head — so a PR cannot edit the
workflow, the fixer's prompt or the guards that are about to judge it. For the same reason the
test-weakening guard is run from the default branch's copy of `.flow/bin/flow-kickback.mjs`,
pinned by a SHA that `plan` resolves on its default-branch checkout, in a job no model runs in
(flow-0079's rule: everything that decides comes from base). Fork PRs are skipped outright, matching the fork fence in
`_flow-review.yml`.

### What an intent-only PR runs (flow-0178)

A PR is **intent-only** when it changes at least one file and every changed path is
`.flow/intents/<slug>.md`. A `_`-prefixed file such as `.flow/intents/_TEMPLATE.md` does not count:
that file is the intent format, and an edit to it gets the full gate and full review. A PR that
mixes an intent with any other file is not intent-only. `classifyIntentPr` in `flow-review.mjs`
decides this from the paths alone, and both workflows run it from a copy the PR cannot edit
(canonical's for the gate, the base branch's for the review).

| Check | Any other PR | Intent-only PR |
|---|---|---|
| `gate` | install, build, lint, test, coverage | `flow-doctor` only (frontmatter, required fields, duplicate ids). Same check name |
| `source-roots-plan` | touches-guard, flow-tooling tests, flow-doctor, plan | unchanged; the planned count is forced to `0` |
| `source-root` | one job per extra source root | skipped, as in any repo with none |
| `qa`, `code-review` | model review at `--max-turns 60` | no model call; PASS with `intent PR: intent files only; read by the advisory intent reviewer` |
| `security` | per `review.security_paths` and the floor | **unchanged**; the `.flow/**` floor always triggers it |
| `intent-review` | not run | one **advisory** comment at `--max-turns 15` on `review.model`: checks the intent against `_TEMPLATE.md`. No verdict, no check status, never approves |

The review run summary's `reviewers:` line names which of these ran and at what turn budget.

### Which copy of a helper CI runs — and why there are two (flow-0094)

A repo adopts the two halves of Flow on **different clocks**, and that used to be a live bug:

- a **reusable workflow** is resolved by GitHub at the ref the caller pinned, so moving `v2`
  changes it in every repo on the next run, with no commit in that repo;
- the **`.flow/bin/` helpers** it invokes are *files in that repo*, and change only when its
  `flow-sync` PR merges — hours or days later.

So a release that made a reusable depend on a new helper broke every pinned repo until it synced.
2.1.0 (`source-roots.mjs`) and 2.1.1 (`check-claude-md.mjs`) did exactly that on 28–29 Sep 2026:
every `@v2` repo went red on every pull request, for a reason that had nothing to do with its own
code.

**`_flow-gates.yml` now fetches canonical's `project-template/.flow/bin/` at the same commit as the
running workflow file and runs the helper from there.** The commit comes from
`${{ job.workflow_sha }}` — the *job* context, which describes the file that defines the current
job, where `github.workflow_sha` describes the caller's three-line caller. The workflow and the
helper it needs therefore ship as one unit, and moving an alias can no longer strand a repo without
a helper. `${{ job.workflow_repository }}` supplies the repo, so a fork of canonical gates against
its own fork. The decision, the evidence, and the GitHub Enterprise Server fallback (`flow_ref`)
are in [`docs/adr/0008-helpers-from-canonical.md`](adr/0008-helpers-from-canonical.md).

| Helper | What CI runs | What the repo's own copy is for |
|---|---|---|
| `source-roots.mjs`, `check-claude-md.mjs`, `touches-guard.mjs` | **canonical's**, fetched at the workflow's commit | local runs, and the repo's own `flow-tooling` tests |
| `flow-doctor.mjs`, and `node --test .flow/bin/*.test.mjs` | **the repo's own** | — they exist to validate the *synced* state, so running canonical's copy would make them unable to fail for the reason they were added |
| everything the other reusables call | the repo's own (not yet converted) | — |

Two consequences worth knowing:

- **A helper run from canonical is not in the tree it is judging**, so it is told which repo to read
  through **`FLOW_REPO_DIR`** (the converted steps pass `${{ github.workspace }}`). `FLOW_CI=1`
  makes that variable *required*: without both, a helper would resolve its store from its own
  realpath, read canonical's `project-template/` fixtures, and **exit 0** — a green gate that
  checked the wrong repo. Neither variable set is the old behaviour, unchanged, which is what keeps
  a repo pinned to an *older* workflow tag working.
- **`flow-sync` is no longer load-bearing for CI correctness.** It is how a repo picks up the local
  tooling — what a human runs by hand, and what `flow-doctor` reports on — and a repo that is
  behind is no longer red for it.

### Per-tree `source_roots` jobs — what installs, and what is skipped (flow-0097)

The `source-roots-plan` job reads the caller's `source_roots:` block and emits one matrix row per
tree that still needs a job of its own; `source-root` fans out over them. Two rules decide what
that job does, and both used to surprise people.

**A `runtime: node` entry installs the repo's dependencies before its check.** The job runs
`commands.install` from the caller's `.flow/config.yml`, in the repo root, after `setup-node` and
before the declared check. Before flow-0097 it ran `setup-node` and nothing else, so a check as
ordinary as `npm run lint` exited `127` in any repo whose linter is a devDependency — the repo had
already declared how to install itself and the job ignored it. The command travels to the shell
through `env:`, never interpolated into a `run:` block, exactly like `check` and `retry`.

- `runtime: deno` and `runtime: none` are **unchanged**: they get no install step. `none` still
  means precisely what it always meant — *the check provisions its own toolchain* (a `uv sync`, a
  `bundle install`, a container), which is how a stack Flow does not model still gets gated.
- A repo whose `commands.install` is absent, or still the shipped `REPLACE-ME` sentinel, also gets
  no install step, and its check runs anyway. Adoption must not fail the gate on a placeholder.
- **Caller action: none.** A repo that worked around this by folding an install into every `check`
  (`cd mcp && npm ci && npm run build`) keeps working — the check travels verbatim and an `npm ci`
  run twice is idempotent. Those checks *may* now be simplified, at leisure.

**A check the primary gate already runs is not run twice, including as one `&&` segment.** An
entry is excluded from the matrix when its `check` equals `commands.build`, `.lint`, `.test` or
`.coverage` — or equals one `&&`-separated segment of one, trimmed.

The motivating config: a repo whose `commands.lint` is `npm run lint && npm run typecheck`, with
three `source_roots` (`src/`, `scripts/`, `e2e/`) each declaring `check: "npm run lint"`. Whole-
string equality matched none of them, so every PR ran lint four times over the same tree. `&&` is
run-on-success sequencing, so a `gate` job that went green did run each segment — matching one is
sound, not a guess.

The rule is deliberately narrow, because the cost of being wrong is asymmetric: a redundant job is
merely slow, while a tree wrongly judged "covered" silently stops being gated, which is the exact
failure these jobs exist to prevent.

- **Only `&&` separates.** `;`, `||`, pipes and subshells are ordinary text and stay inside
  whichever segment they fall in. Given `commands.lint: "a; b"` or `"a || b"`, neither `a` nor `b`
  alone counts as covered — with `;` the second runs whether or not the first passed, and with
  `||` only one of the two is guaranteed to have run at all.
- **Segments match exactly**, after trimming. No substring and no prefix matching: against
  `npm run lint && npm run typecheck`, a check of `npm run lint:e2e` still gets its own job.
- The exclusion is **reported** in the plan job's log (`source-roots: skipping "src/" — covered by
  the primary gate`), so an empty matrix is always explicable. Canonical's own four entries are
  all excluded this way; `count=0` here is the rule working, not the plan failing.

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

- **Secrets:** every caller passes its reusable's secrets **by name** — never `secrets: inherit`,
  which would also hand the job any other configured secret it has no use for. `flow-kickback`
  forwards two, `CLAUDE_CODE_OAUTH_TOKEN` *and* `FLOW_PAT`: the first is the agent, the second is
  what the round pushes with. A reusable only ever receives what its caller names, so the
  `FLOW_PAT` line is not optional bookkeeping — omit it and `secrets.FLOW_PAT` evaluates **empty
  inside the reusable** however the repo has set the secret. `.flow/bin/secrets-scope.test.mjs` is the single
  owner of this rule for every caller, and fails the gate if a caller forwards a secret its
  reusable does not declare, or if the template caller and canonical's own caller ever
  forward different names.
- **Inputs:** `flow-recover` forwards its `workflow_dispatch` `threshold_minutes` via `with:`.
- **Pinning:** callers pin `@v1` for stability (the plan's choice over `@main`). Bump the tag to
  adopt a new Flow version. Repinning is **one** change, not two: `_flow-sync.yml` resolves the ref a
  scheduled sync adopts from by reading the `@<ref>` off the repo's own `flow-sync.yml` caller, so
  sweeping the `uses:` lines carries the adopt source with it (flow-0105). Two callers left pinned at
  different refs fails the sync with an error naming both, rather than picking one.
- **Permissions:** consuming repos need *default workflow permissions = read+write* (the status/done
  workflows push state to `main`). The reusable workflows declare their own `permissions:`; the
  effective token is the intersection, so the repo setting must allow write.
- **`id-token: write` for the claude-code-action workflows** (`flow-triage`, `flow-review`,
  `flow-kickback`, `flow-compass`): the action mints an OIDC token, but `id-token` is *never* in the default
  `GITHUB_TOKEN` and a reusable workflow can't raise a permission above its caller's grant — so it's
  declared on **both** the reusable file and the thin caller's job. Because a caller `permissions:`
  block is exhaustive (anything unlisted drops to `none`), those callers re-list every permission
  their reusable needs (`contents`, `pull-requests`/`issues`, `id-token`), not just `id-token`.

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

The field-evolved infra the plan called for has been brought into canonical as the corrected
superset:

- **`parse-task-id.mjs` + branch-or-title id resolution (CAN-52)** in `_flow-status` / `_flow-done`,
  so cloud sessions forced onto non-`flow/` branches still transition.
- **`flow-open-pr.mjs` + `_flow-open-pr.yml` (CAN-50)** — auto-open the PR on branch push.
  Canonical originally opened it **non-draft**, against the canary repo's `--draft`; flow-0039
  reversed that, because opening ready-for-review on the first push made `flow-status` report the
  task `in_review` while the worker was still building and made `flow-review` spend three agent
  runs per work-in-progress push. The canary was right.
- **`flow-recover.mjs` + `_flow-recover.yml` (CAN-51)** — self-heal stranded tasks.
- **`flow-unblock.mjs` + `_flow-unblock.yml` (flow-0041)** — release a blocked task once every
  `blocked_by` entry has resolved. (It also started the next worker until flow-0173; the worker
  routine's schedule picks up released tasks now.)
- **The CAN-41 uncommitted-task guard** merged into `flow-doctor`, alongside canonical's existing
  ahead-bits (the touches-overlap check, multi-line `touches` parsing, and the version-drift check —
  all kept).
- **The CAN-58 `FLOW_PAT` gate-trigger pattern** in both auto-PR paths.

All helpers ship with their proving tests (`node --test .flow/bin/*.test.mjs`).

## What's deferred (and why)

1. **Tag `v1`** (`git tag v1 && git push origin v1`) — a release action left to the maintainer.
   Only after the tag exists do the `@v1` caller pins resolve; until then the callers are the
   documented end-state.
2. **Cut the consuming repos over** to the thin callers (the canary repo first, dogfood; then the rest of the fleet),
   and **confirm the gate fires end-to-end** on a real PR. This is cross-repo work, out of the
   canonical repo's reach.
3. ~~**The `.flow/bin` npm package** (Decision 2)~~ — **resolved 2026-06-24:** the bin stays copied
   per repo, governed by the version stamp + `flow-doctor` drift check and updated by `flow-sync`.
   The npm package is deferred as an optional later refactor, not a prerequisite — the copy+check+
   sync loop already closes the drift surface. See the plan's Decision 2 and Phase 3/4.
4. **A reusable-gate toolchain story for non-Node stacks** beyond the `setup_node_version` input —
   best settled by the dogfooding in (2).
5. **Further drift found but not in the plan's Phase 0 list:** `pick-task.mjs` and the
   `touches-guard.mjs` multi-line `touches` fix (CAN-57) have also diverged between the canary repo and
   canonical. Left for a follow-up reconciliation to keep this change scoped to the plan.

## Choosing the runner (`FLOW_RUNNER`, flow-0149)

Every job in every `_flow-*.yml` runs on `${{ inputs.runner }}`, which defaults to
`ubuntu-latest`. Each template caller passes `runner: ${{ vars.FLOW_RUNNER || 'ubuntu-latest' }}`,
so a repo switches runner without editing a file, and the choice survives a sync:

```
gh variable set FLOW_RUNNER -b <runner-label>
```

Unset the variable to return to `ubuntu-latest`. Canonical's own callers never pass `runner`.

**Private repos only.** A non-GitHub or self-hosted runner on a public repo runs fork-PR code on
someone else's machine. Do not set `FLOW_RUNNER` on a public repo.

**Secrets.** A non-GitHub runner sees every secret its jobs hold — `FLOW_PAT` in the kickback push
job, `CLAUDE_CODE_OAUTH_TOKEN` in the AI jobs. Choosing `FLOW_RUNNER` is
choosing to trust that provider with them.
