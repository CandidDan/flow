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
| `_flow-gates.yml` | The Definition-of-Done gate: store-is-main-only guard, build/lint/test/coverage from the caller's `.flow/config.yml`, flow-tooling tests, touches-guard, plus a matrix job per declared `source_roots` entry the primary gate doesn't already cover (optional `runtime` / `version` / `retry` per entry; a `runtime: node` entry installs with the repo's `commands.install` first — see below) | input `setup_node_version` (default `22`; `""` for non-Node) |
| `_flow-status.yml` | PR marked ready for review → `in_review`; draft PR opened → stays `in_progress` with `branch` + `pr` recorded (flow-0039); a PR opened directly as non-draft still goes straight to `in_review`; closed-unmerged → `ready`. An action it does not model is a logged no-op, so a caller pinned ahead of the reusable degrades to silence. Id resolved from the branch **or** the PR title (CAN-52), so non-`flow/` branches (e.g. cloud `claude/…`) still transition | — |
| `_flow-done.yml` | PR merged → task `done`. Same branch-**or**-title id resolution (CAN-52) | — |
| `_flow-open-pr.yml` | On a `flow/<id>-…` branch push, auto-opens the PR if the branch is ahead of base with no PR yet (CAN-50) — a worker that stops short of `gh pr create` no longer strands the task. Opens it as a **draft** (flow-0039), falling back to non-draft where drafts are unavailable; the worker's `gh pr ready` is what asks for review. Idempotent. Opens with `FLOW_PAT` so the PR triggers `flow-gates` (CAN-58) | secret `FLOW_PAT` (optional) |
| `_flow-recover.yml` | Scheduled self-heal sweep (CAN-51): a task stranded `in_progress` past a staleness threshold gets its PR re-opened as a **draft** (work was pushed but is unfinished by definition — flow-0039) or its claim reset to `ready` (nothing to recover). Off unless `FLOW_AI=true`; always on-demand via dispatch | input `threshold_minutes`; secret `FLOW_PAT` (optional) |
| `_flow-triage.yml` | Scheduled issue triage (off unless `FLOW_AI=true`) | secret `CLAUDE_CODE_OAUTH_TOKEN` |
| `_flow-review.yml` | The three Definition-of-Done review checks on a PR — qa, code-review and a conditional security review (flow-0007). **Skipped entirely while the PR is a draft** (flow-0039) — the `plan` job carries the condition and the other three `needs: plan` — so the reviewers run once, when the worker marks the PR ready, not on every work-in-progress push. Runs for **any** PR author, not just `flow/` branches; model and security-trigger paths come from the caller's `.flow/config.yml` `review:` block, and `.flow/bin/flow-review.mjs` turns each written verdict into an exit code (fail-closed). Off unless `FLOW_AI=true` | input `node_version`; secret `CLAUDE_CODE_OAUTH_TOKEN` |
| `_flow-queue-runner.yml` | Picks a ready task → dispatches a fresh worker (off unless `FLOW_AI=true`). Its caller ticks **hourly** and a small `schedule-gate` job decides which tick is the day's run, from the three repo variables below (flow-0080) — so the pause switch and the local-time schedule need no file edit and survive a sync. `workflow_dispatch` bypasses the gate entirely | input `task_id`; secrets `CLAUDE_CODE_OAUTH_TOKEN` + `FLOW_PAT` (CAN-58 — so the worker's own push fires `flow-open-pr`; both are forwarded by **both** thin callers since flow-0095); caller grant `actions: read` |
| `_flow-kickback.yml` | **The bounded auto-fix round** (flow-0082). When the `flow-review` run on a PR concludes `failure`, dispatches ONE auto-fix worker onto that same PR to address the reviewers' **blocking** findings, then re-requests review — so a red check starts the kickback instead of waiting for a human to notice. The worker **commits and does not push**; the workflow checks the round and pushes, which is what lets the test-weakening guard sit between the two. Off unless `FLOW_AI=true` **and** `review.auto_fix_rounds` is set (see below) | input `node_version`; secrets `CLAUDE_CODE_OAUTH_TOKEN` + `FLOW_PAT` (**required**, not optional — see below) |
| `_flow-sync.yml` | The adopt mechanism (Phase 4): when the repo's `.flow/VERSION` is behind canonical, copies the updated `.flow/bin/*` + thin callers in, bumps the stamp, and opens a **reviewed PR**. Safe to run anytime (only opens a PR; no `FLOW_AI` gate). The ref it adopts from is **read off the caller's own `uses:` pin** when `canonical_ref` is empty — which is every scheduled run (flow-0105) | input `canonical_ref` (overrides the pin; empty ⇒ resolved from the caller, `v2` only if no caller pins one); secret `FLOW_PAT` (optional) |

### Queue-runner timing — three repo variables, never a caller edit (flow-0080)

`on:` is parsed statically and cannot read `vars.*`. So anything written in a caller — a cron
hour, GitHub's native `timezone:` (available since March 2026) — is a literal in a file
`flow-sync` overwrites, in every repo, re-edited by hand whenever it changes. The caller
therefore ticks hourly (`0 * * * *`) and the *decision* lives in the reusable, where it can read
repo variables. Each is set once per repo, with no file edit:

| Variable | Values | What it does |
|---|---|---|
| `FLOW_QUEUE_RUNNER` | `paused`, or unset | `paused` → **scheduled** ticks dispatch no worker. `workflow_dispatch` still works, and the three PR review checks, triage and compass are untouched. Any other value, or unset, is not paused |
| `FLOW_TZ` | an IANA zone, e.g. `Australia/Sydney` | the zone the run hour and the weekday test are read in |
| `FLOW_RUN_HOUR` | `0`–`23` | the **local** hour the day's run should start |

```bash
# pause autonomous work without emptying the gate, then resume
gh variable set FLOW_QUEUE_RUNNER -R <owner>/<repo> -b paused
gh variable delete FLOW_QUEUE_RUNNER -R <owner>/<repo>

# run the day's task at 07:00 in the operator's own zone, DST included
gh variable set FLOW_TZ -R <owner>/<repo> -b Australia/Sydney
gh variable set FLOW_RUN_HOUR -R <owner>/<repo> -b 7
```

These are **per-repo** variables. A personal account has no account-level Actions variables, so
there is nothing to set once for the fleet; it is one command per repo, which is still cheaper
than a PR per repo.

- **Why a `paused` string rather than a boolean.** An unset variable can never be misread as
  "off". `FLOW_AI` remains the master switch and `FLOW_AI=false` still turns everything off —
  including review, which is exactly the problem that `FLOW_QUEUE_RUNNER` exists to avoid:
  during the 1.x → 2.0.0 migrations the only way to pause the runner also disabled the three
  review checks, so repos briefly had a gate that passed on build/lint/test alone.
- **The gate is "first tick at or after the hour, once per local day", never "hour equals".**
  GitHub's scheduler runs 15 minutes to 2+ hours late at peak, so an exact-hour match would
  silently skip a whole day whenever a tick was late. A scheduled tick proceeds only when the
  local weekday is Mon–Fri, the local hour is at or after `FLOW_RUN_HOUR`, and no earlier
  *scheduled* run has already dispatched a worker on that local date. "Dispatched" means the
  worker step actually ran: a tick that found the queue dry does not consume the day.
- **Both schedule variables, or neither.** Half a schedule is reported as a misconfiguration on
  every tick, as is an unknown zone or an hour outside 0–23 — it never falls back silently to
  UTC or to 07:00. With both unset, behaviour is exactly as before flow-0080: one run per UTC
  weekday at 07:00.
- **Visible skips.** An hourly workflow is mostly skips, and a skip that prints nothing is
  indistinguishable from a runner that has quietly died. Every tick writes one line to its step
  summary naming its answer: `paused`, `before-run-hour`, `already-ran-today`, `weekend`,
  `bad-config`, `runs-unknown` or `run`.
- **Where the logic is.** `.flow/bin/queue-runner-schedule.mjs` — a pure, dependency-free
  function (`scheduleDecision`), with the git/`gh` gathering as a thin shell in the workflow, the
  same split `queue-runner-verify.mjs` uses. Unit tests are
  `project-template/.flow/bin/queue-runner-schedule.test.mjs`; the wiring, the `if:` conditions
  and the three switch properties are `.flow/bin/queue-runner-switch.test.mjs`.
- **The caller must grant `actions: read`.** The gate reads this workflow's own earlier runs to
  answer "has today's run already gone out?". A caller `permissions:` block is exhaustive and a
  reusable cannot raise a scope above its caller's grant, so without that line the gate fails
  closed every hour and nothing is ever dispatched. It is granted on the caller only (and is
  *not* in the reusable's top-level `permissions:`), because dispatch-only callers — canonical's
  own, which has no `schedule:` block — never reach the gate job.
- **Adoption.** Re-sync `flow-queue-runner.yml` for the hourly cron and the `actions: read`
  grant. Until then the pause switch works (the reusable carries it) but the local-time schedule
  cannot take effect. If you keep a customised cron whose only daily tick is before 07:00 UTC,
  set `FLOW_RUN_HOUR` to that hour, or the default run hour falls after your tick and nothing
  runs.

**`FLOW_PAT` (CAN-58).** A PR opened with the Actions `GITHUB_TOKEN` does *not* trigger downstream
workflows, so `flow-gates` would never fire on an auto-opened PR — the gate silently bypassed.
`_flow-open-pr` / `_flow-recover` open PRs with a `FLOW_PAT` so the `pull_request` event is
attributed to a real actor and the gate runs. Falls back to `GITHUB_TOKEN` when the secret is unset
(PR opens, but ungated), so adding the secret is a no-break enablement. Thin callers pass it by
name — `FLOW_PAT: ${{ secrets.FLOW_PAT }}` — not `secrets: inherit`, so a caller only ever forwards
the secret(s) its own reusable declares.

`_flow-queue-runner` uses the same secret twice more (flow-0093): its `actions/checkout` takes
`token: ${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}`, which is what the *worker's* own `git
push` later authenticates as, and the worker step exports `GH_TOKEN` from the same expression for
its `gh` calls. Without the checkout token the persisted credential is `GITHUB_TOKEN`, and GitHub
refuses a `GITHUB_TOKEN` push that changes anything under `.github/workflows/` — so a worker on a
task whose `touches` names a workflow file could not push at all. The `github_token:` input alone
does not fix it: it reaches the action's API calls, never git's stored credential.

**The one permission list.** Every workflow above that takes `FLOW_PAT` shares one credential, so
there is one list of what it must carry. It is duplicated in `_flow-open-pr.yml`'s header, and
`.flow/bin/flow-pat-forwarding.test.mjs` parses both copies and fails the gate when they disagree.

FLOW_PAT — required permissions (fine-grained PAT, this repository only, short expiry):

- Contents: Read and write — flow-queue-runner's worker pushes the claim commit to main and then
  pushes its task branch, and flow-sync pushes the sync branch. Read alone cannot push, and the run
  dies at the first git push.
- Pull requests: Read and write — flow-open-pr opens the draft PR, flow-recover re-opens a stranded
  one, flow-sync opens the sync PR, and flow-queue-runner's worker runs gh pr create and gh pr
  ready.
- Issues: Read and write — flow-queue-runner's worker files an issue for a problem it finds outside
  its own task, which is how that work gets captured instead of lost.
- Workflows: Read and write — flow-queue-runner's worker and flow-sync both push commits that
  change files under .github/workflows/, and GitHub refuses that push from any credential lacking
  it. GITHUB_TOKEN can never have it, which is why the PAT is the only way.

Grant all four. A token short one permission does not fail at setup; it fails later, at the one
step that needed it. Keep the expiry short and rotate: `Workflows: Read and write` lets the holder
edit CI, and `_flow-queue-runner` hands the token to an agent — the fences that make that
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

**And it reaches exactly one step — never the fixer.** `FLOW_PAT` is handed only to
`stamp-and-push`, which runs after all four guards have passed. Every other step runs on
`GITHUB_TOKEN`. That split is the actual boundary, and it is worth being explicit about why,
because the intuitive design gets it wrong: the fixer runs a model under `--permission-mode
bypassPermissions`, on a checkout of the PR branch, and its prompt tells it to read the PR's
comments as its instructions — so on a non-fork PR, anyone who can comment can address that
session. `--disallowedTools` does not contain that; it pattern-matches command prefixes, so any
route it does not textually name reaches the remote, and a hosted runner's open egress reaches
the network. A session that cannot push because it holds nothing that can push is bounded. A
session that was merely *asked* not to push is not.

**The same argument applies to every write, not just the push — so the permissions are per job.**
`GITHUB_TOKEN` is only as narrow as the job holding it, and a workflow-level `pull-requests:
write` is a grant *every* job gets, the fixer's session included. With it, an injected PR comment
is one step from `gh pr review --approve`, `gh pr close`, or `gh pr edit --remove-label
flow:needs-human` — undoing the escalation that stopped the PR. So the three jobs that run a model
hold reads only, and the jobs that hold writes run no model:

| job | token can write | runs a model | what it does |
|---|---|---|---|
| `plan` | nothing | no | reads the run's failed jobs, the PR, and the task's status on the default branch |
| `undraft` | pull requests | no | one `gh pr ready --undo`, and nothing else |
| `fix` | **nothing** | **yes** | the round: commit-only, then the four guards, then the one push — made with `FLOW_PAT`, not with this token |
| `round-card` | **nothing** | **yes** | writes the card's four fields for a round that handed nothing back, read-only |
| `escalate-round` | pull requests, issues | no | posts the card and the label for a round that did not push |
| `card` | **nothing** | **yes** | writes the card's four fields, read-only |
| `escalate` | pull requests, issues | no | posts that card and the label |

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
- **Push a round that disputed the finding, handed back nothing, or claimed a fix and changed
  nothing.** Each escalates instead. A dispute, and a round a later guard stopped, are described
  by the round's own hand-back — it is the only thing that knows what it tried. A round that
  handed nothing back has no account of itself, so its card comes from the same bounded,
  **read-only** model call that writes the security and exhausted-cap cards: it reads the
  verdicts, the diff and the round history and writes the four fields, and it fixes nothing.
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
pinned by a SHA resolved *before* the fixer gets the runner (flow-0079's rule: everything that
decides comes from base). Fork PRs are skipped outright, matching the fork fence in
`_flow-review.yml`.

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
  which would also hand the job any other configured secret it has no use for. `flow-queue-runner`
  is the one caller that forwards two, `CLAUDE_CODE_OAUTH_TOKEN` *and* `FLOW_PAT` (flow-0095):
  the first is the agent, the second is what the worker touches the repo with. A reusable only
  ever receives what its caller names, so the `FLOW_PAT` line is not optional bookkeeping — omit
  it and `secrets.FLOW_PAT` evaluates **empty inside the reusable** however the repo has set the
  secret, the `||` falls through to `GITHUB_TOKEN`, and the worker silently loses the ability to
  push a change under `.github/workflows/`. `.flow/bin/secrets-scope.test.mjs` is the single
  owner of this rule for every caller, and fails the gate if a caller forwards a secret its
  reusable does not declare, or if the template caller and canonical's own caller ever
  forward different names.
- **Inputs:** `flow-queue-runner` forwards its `workflow_dispatch` `task_id` via `with:`.
- **Pinning:** callers pin `@v1` for stability (the plan's choice over `@main`). Bump the tag to
  adopt a new Flow version. Repinning is **one** change, not two: `_flow-sync.yml` resolves the ref a
  scheduled sync adopts from by reading the `@<ref>` off the repo's own `flow-sync.yml` caller, so
  sweeping the `uses:` lines carries the adopt source with it (flow-0105). Two callers left pinned at
  different refs fails the sync with an error naming both, rather than picking one.
- **Permissions:** consuming repos need *default workflow permissions = read+write* (the status/done
  workflows push state to `main`). The reusable workflows declare their own `permissions:`; the
  effective token is the intersection, so the repo setting must allow write.
- **`id-token: write` for the claude-code-action workflows** (`flow-queue-runner`, `flow-triage`,
  `flow-review`, `flow-kickback`): the action mints an OIDC token, but `id-token` is *never* in the default
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
