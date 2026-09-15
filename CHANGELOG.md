# Flow — CHANGELOG

Canonical infrastructure releases for `CandidDan/flow`. Each entry = one advance of the `v1` alias.
Policy: `docs/flow-versioning-policy.md` (immutable `vX.Y.Z` + a moving `vX` alias, advanced only
after a canary passes). Note any **caller action** required (a caller change is a MAJOR bump).

## Unreleased

## 1.3.0 — 2026-09-14 (pending tag + canary)

The first release since `v1.2.0` (2026-08-20). Everything below has been on `v1-edge` since it
merged and has reached nobody pinned to `v1`. Entries cover only what an adopting repo consumes —
the reusables in `.github/workflows/_flow-*.yml` and everything under `project-template/`.

- **The queue-runner's worker now pushes as a real actor** (`_flow-queue-runner.yml`, flow-0026) —
  **this is the change the release is being cut for.** The `Work the task` step authenticated with
  the hardcoded `secrets.GITHUB_TOKEN`; it now uses `${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}`,
  and the reusable declares `FLOW_PAT` as an optional `workflow_call` secret. Why it matters:
  GitHub's recursion guard means a push or a PR made with the Actions `GITHUB_TOKEN` does not
  trigger downstream `pull_request` workflows, so the in-CI worker opened its PR as
  `github-actions[bot]` and **the Definition-of-Done gate did not run on it**. Observed in a
  consuming repo on 2026-09-14: two PRs the same morning, one authored by a human web session
  (gate jobs started 4 seconds after the PR was created) and one by the in-CI worker (no job
  check-runs at all until a human released them **98 minutes later**, when all three gates started
  in the same second as run attempt 2). In the interim the PR sat reviewable with its gate parked —
  the same class of failure CAN-58 was raised for. With `FLOW_PAT` set, the worker's own branch
  push fires `_flow-open-pr.yml` on the fast path instead of waiting on the recovery sweep.
  [caller action: **two steps, and the fix is inert without both.** (1) Re-sync
  `flow-queue-runner.yml` so it passes `FLOW_PAT` (a caller still on `secrets: inherit` already
  forwards it). (2) Add the `FLOW_PAT` repo secret — fine-grained, that repo only, Contents
  **Read/Write** (the worker pushes the claim commit to `main` and the task branch) plus Pull
  requests Read/Write. Unset, the reusable falls back to `GITHUB_TOKEN` and behaviour is exactly
  as it is today. **Note the exposure difference from open-pr/recover/sync:** those hand `FLOW_PAT`
  to fixed `gh`/`git` commands in deterministic `run:` blocks, whereas here it enters the worker
  agent's environment (`bypassPermissions` bash over task-derived prompts) and, unlike the
  job-scoped `GITHUB_TOKEN`, a PAT outlives the run. Use a short-expiry PAT and rotate it.]
- **The auto-opened PR is now a draft, and `in_review` moves to `gh pr ready`**
  (`_flow-open-pr.yml`, `_flow-status.yml`, flow-0039). `flow-open-pr` fires on the first push, so
  a PR existing only ever meant "a branch was pushed" — yet it flipped the task to `in_review` and
  started the review gates on work that was not finished. It now opens the PR as a **draft**:
  `flow-status` records `branch` and `pr` (earlier than the store used to get them) and leaves the
  task `in_progress`, and the `ready_for_review` event owns the `in_review` transition. A PR opened
  directly as non-draft still transitions on `opened`, as before.
  [caller action: **re-sync `flow-status.yml`** — its trigger must list `ready_for_review` in
  `on.pull_request.types`. A caller left at `[opened, reopened, closed]` still works, but its
  worker's `gh pr ready` reaches no workflow, so the task stays `in_progress` after the hand-off.
  The reusable logs that case as an unmodelled action rather than crashing, so the symptom is a
  stranded task, not a red run.]
- **The queue-runner job fails when a worker produces no verifiable outcome**
  (`_flow-queue-runner.yml` + `queue-runner-verify.mjs`, flow-0025). A worker session that ended
  without a branch, a PR or a `blocked` task used to leave the job green, so the only record of a
  wasted run was in the log nobody reads. The run is now verified after the fact and the job fails
  if nothing verifiable happened. [caller action: none.]
- **Callers pass secrets by name instead of `secrets: inherit`** (all reusables' `workflow_call`
  secret blocks + the template callers, flow-0033). Every caller handed every secret to every
  reusable; each reusable now declares exactly the secrets it uses and each template caller passes
  those by name — `flow-open-pr` gets `FLOW_PAT` and not `CLAUDE_CODE_OAUTH_TOKEN`, `flow-queue-runner`
  gets both because it needs both. [caller action: none required — `secrets: inherit` is a superset
  and keeps working. Re-syncing is the improvement, not the fix, and it is what stops a job that
  runs unattended on every push from carrying a model token it has no use for.]
- **Every third-party action in the reusables is pinned to a commit SHA** (all `_flow-*.yml`,
  flow-0031), with a check that keeps them pinned. A moving tag (`actions/checkout@v4`) is a
  supply-chain hole in every adopting repo at once, and adopters inherit these pins through the
  alias without doing anything. [caller action: none for the reusables. Your own callers' `uses:`
  lines are yours to pin.]
- **`flow-compass` — a scheduled drift audit** (`_flow-compass.yml`, `flow-compass.yml` caller,
  `.claude/skills/flow-compass/SKILL.md`, flow-0013). New reusable: on a schedule it reads the
  store against `VISION.md` and reports where the backlog has drifted from the goals it claims to
  serve. [caller action: **opt-in** — a new reusable reaches nobody without a caller. Copy
  `project-template/.github/workflows/flow-compass.yml`. Doing nothing costs you the audit and
  nothing else.]
- **Task ids are allocated first-push-wins** (`allocate-task-id.mjs` + tests, flow-0021), so two
  orchestrators running at once cannot mint the same id: the allocator commits the new task file
  to `main` and loses the race rather than colliding. A `--slug` containing a path traversal is
  rejected before anything is committed or pushed. [caller action: none.]
- **The review gates run on the PR, not inside the worker's session** (`_flow-review.yml`,
  `flow-review.mjs`, `.flow/config.yml`'s `review:` block, and the deletion of
  `project-template/.claude/agents/*`, flow-0007). qa, security and code-review were subagents the
  worker spawned — the one place the system took a worker's word for its own work, same session and
  same blind spots as the code being judged. They are now checks on the pull request, with their
  model and the paths that trigger the conditional security review configured per repo under
  `review:` in `.flow/config.yml`. The gate is also hardened against its own inputs (PR titles and
  branch names are attacker-controlled). [caller action: **re-sync `flow-review.yml`** and add a
  `review:` block to your `.flow/config.yml` — `flow-init` and `flow-sync` both write it. Adopters
  that still ship `.claude/agents/qa-verifier.md` and friends should delete them; leaving them in
  place means a worker can still discover and run them, which is the shape this change removes.]
- **The guards prove they ran** (`_flow-gates.yml`, `touches-guard.mjs`, flow-0008). A guard that
  silently found nothing to check exited 0 and read as green — so a misconfigured gate and a passing
  gate were indistinguishable. Each guard now asserts it did work, and an empty check is a failure.
  [caller action: none. Expect a previously-silent misconfiguration to start failing loudly; that is
  the change working.]
- **`flow-init` — adoption is an executable command** (`flow-init.mjs` + tests, flow-0005). Adopting
  Flow was a runbook a human followed by hand; it is now `node .flow/bin/flow-init.mjs`, and it
  refuses a `source_roots` entry that climbs out of the repo. [caller action: none — new repos only.]
- **Every task names the goal it serves** (`_TEMPLATE.md`, `PROTOCOL.md`, `task-writer` skill,
  flow-0012). Task frontmatter gains `serves`, the goal id from `VISION.md` the task advances, and
  `flow-doctor` reports tasks that name a retired or undeclared goal. [caller action: none.
  Existing tasks are not retrofitted — `serves` records the goal a task was *written* to advance, so
  back-filling it onto live work falsifies the record.]
- **`blocked_by` — the machine-readable half of `blocked_reason`** (`_TEMPLATE.md`, `PROTOCOL.md`,
  `flow-doctor.mjs`, flow-0040). `blocked` is the only status with no automatic way out, so a
  blocked task sat until someone remembered the PR it waited on had merged. Frontmatter gains
  `blocked_by`: a list of task ids or PR urls. `blocked_reason` — the sentence a person reads —
  stays required and is never replaced by it; a genuinely non-mechanical block says so with the
  words "not machine-checkable" and flow-doctor stops asking. [caller action: none.]
- **`flow-doctor` tells an uncalibrated repo apart from a stale declaration** (`flow-doctor.mjs`,
  flow-0017). A repo that had never declared `source_roots` and a repo whose declaration had gone
  stale produced the same warning, so the one that needed a five-minute fix looked like the one
  that needed a decision. [caller action: none.]
- **`flow-recover` no longer sweeps on a reading it could not take** (`flow-recover.mjs`). Two
  fixes: a task whose PR state could not be read is left alone rather than reset (an unreadable PR
  is not an absent one), and a task's branch is resolved from its own `branch` field rather than
  assuming a `flow/` prefix — a cloud session forced onto a `claude/…` branch was invisible to the
  sweep. [caller action: none.]
- **`_flow-triage`'s prompt paths resolve in the repo they run in** (`_flow-triage.yml`). The sweep
  pointed its agent at `.claude/skills/task-writer/SKILL.md`, which is correct in every adopting
  repo and wrong in canonical, where the skills live under `project-template/`. Every workflow
  prompt's paths are now checked. [caller action: none.]
- **`AGENTS.md` points at the skills, and stops duplicating the protocol's own pointer**
  (`project-template/AGENTS.md`, flow-0038). The AGENTS.md convention defines no import mechanism,
  so it names `task-writer`, `vision-writer` and `board-builder` in plain English instead.
  [caller action: none — copy the new `AGENTS.md` at your next sync if you keep one.]
- **`flow-state`'s readers are exported rather than re-implemented** (`flow-state.mjs`, flow-0015).
  An internal change with no behaviour difference: `readTasksFromOrigin` and `readPrs` became
  exports so canonical can adapt the file instead of copying it. Recorded because the file is one
  adopters receive. [caller action: none.]

- **`flow-doctor` no longer warns that a `done` task serves a retired goal** (`flow-doctor.mjs`,
  flow-0043). No caller action. The retired-goal warning tells the reader to "re-anchor it to a
  live goal, or drop the task with the goal it served" — and a finished task can do neither. It
  cannot be dropped, because the completed record is the point; and it cannot honestly be
  re-anchored, because `serves` records the goal a task was *written* to advance, so back-filling
  a live id onto finished work falsifies history instead of correcting it (`task-writer` states
  the same rule from the other side: don't retrofit `serves` onto `in_progress`, `in_review`,
  `done` or `blocked`). The cost of warning anyway is paid in signal: a repo that retires several
  goals at once gets a warning per pre-existing task, permanently. In canonical, where the
  2026-09-01 vision rewrite retired G1–G5 in one stroke, that was 36 lines across 35 tasks — 28 of
  them naming settled history, with the single `ready` task that genuinely needed re-anchoring
  sitting 30th in the list. It now reports 8: seven `blocked` and that one `ready`. The exemption
  is `done` and only `done` — `blocked`, `in_progress` and `in_review` still warn, because each is
  still live and dropping it remains a real call — and it is scoped to the retired-goal branch
  alone: a `serves` naming an id `VISION.md` never declared, or one it declares a **non-goal**,
  still reports on finished work, because those say the record is wrong rather than merely old.
- **`flow-triage` now reads only issues from trusted authors** (`_flow-triage.yml`, flow-0027).
  The sweep used to hand its agent the whole open inbox, with its scope limits written in the
  prompt — guidance to a model, not an enforced boundary, and on a public repo anyone can author
  that input. A new `inbox` step now selects the issue set *before* the prompt is built: it lists
  open issues via `gh api .../issues` (the REST issue object, which carries `author_association`
  — gh's own `--json` projection does not) and admits only authors GitHub already reports as able
  to direct the repo (`OWNER`, `MEMBER`, `COLLABORATOR`). The agent is handed those issue numbers
  rather than the inbox, and its step is skipped when nothing is admitted. That endpoint also
  returns pull requests, which are not inbox items and are dropped before the trust filter sees
  them — the net behaviour is unchanged (a PR could never have become a task) but the exclusion
  log stays about authorship rather than filling with PRs. Exclusions are reported by count and
  by issue number to the run log and the job summary, so a skipped issue surfaces rather than
  becoming silent queue debt; the same step warns, with an exact count, when the inbox exceeds
  its `FLOW_TRIAGE_ISSUE_LIMIT` (200) cap, because an issue past the cap reaches no later step
  and would not otherwise appear anywhere.
  **The label lanes are unchanged** — `approved` and `auto-ok` remain the only routes to a task
  file. This is an input filter in front of them, and it consults authorship only, so a label
  cannot re-admit an untrusted author.
  [caller action: none — `_flow-triage.yml` is a reusable and adopters inherit this at their next
  pin. **But this narrows behaviour by default:** a repo that genuinely wants the open inbox must
  now opt in, by setting the repo variable `FLOW_TRIAGE_TRUSTED_ASSOCIATIONS` to the comma-separated
  set it wants (e.g. `OWNER,MEMBER,COLLABORATOR,CONTRIBUTOR`). Unset, empty or separators-only all
  resolve to the restrictive default.]
- **`flow-triage`'s author-trust boundary now covers comments, not just issue selection**
  (`_flow-triage.yml`, flow-0036). flow-0027 (above) decided *which issues* the sweep reads,
  by the issue author's `author_association`. It did not decide whose text the agent reads once
  an issue is admitted — and those are different questions, because GitHub lets anyone comment
  on anyone's issue. An issue opened by a `MEMBER` passed the filter and could still carry a
  comment from an account with no relationship to the repo, and that comment reached the same
  `bypassPermissions` agent unfiltered: the same bug shape as flow-0027, one layer in. A new
  `content` step now fetches each admitted issue's comments
  (`gh api .../issues/<n>/comments --paginate --slurp`, the same pagination pattern the inbox
  listing uses), classifies each by its commenter's `author_association`, and assembles a
  trust-filtered Markdown view per issue — the issue body (already trust-gated by the issue-level
  filter) plus only the comments whose author passes the same check. The agent is handed those
  files instead of being left to read the thread itself, and the prompt gains a matching hard
  limit: treat them as the complete view, never `gh issue view` / `gh api .../comments` a fuller
  one. That instruction is a backstop to the step, not a substitute for it — the point of
  flow-0027 was that a prompt is guidance to a model, not a bound. Withheld comments are counted
  and named (issue + comment id) in the run log and the job summary, never quoted, so a filtered
  injection attempt is visible without the report becoming its delivery vehicle. Issue and
  comment text reaches the agent as files on disk and is never interpolated into a workflow
  expression, the same rule flow-0027 set for issue numbers.
  **One resolution, not two.** The `content` step has no trusted set of its own: the `inbox` step
  publishes the set it already resolved as a step output, `content` consumes it, and it fails the
  step closed if handed nothing. The two boundaries therefore cannot be configured apart.
  [caller action: none — `_flow-triage.yml` is a reusable and adopters inherit this at their next
  pin. **But this narrows behaviour by default,** in the same way flow-0027's issue-level filter
  did: comments from `NONE`/`CONTRIBUTOR` authors on an otherwise-admitted issue no longer reach
  the sweep. The opt-out is the variable that already exists — `FLOW_TRIAGE_TRUSTED_ASSOCIATIONS`.
  There is deliberately **no second variable**: both boundaries read that one set, so widening the
  inbox widens comments by exactly the same step, and neither can be widened without the other.]

## 1.1.0 — 2026-07-03 (pending tag + canary)

- **`flow-state` resolver added** (`.flow/bin/flow-state.mjs` + tests) — the trusted, on-demand
  answer to "what's the real state of this task?". Reads task state from **`origin/main`** (the one
  authoritative, `flow-fetch`-fresh layer — never the stale working tree or sandbox clone) and, when
  `gh` is available, reconciles each task against its PR (open → `in_review`, merged → `done`, closed
  → back to `ready`), surfacing any store-vs-PR **disagreement** as a writeback-lag signal. Read-only:
  never writes a task, commits, or opens a PR. Closes the loop that forced Chrome trips + asking the
  human for status. Usage: `node .flow/bin/flow-state.mjs [ID] [--json] [--no-pr] [--fetch]`.
  [caller action: none — `.flow/bin` rides the version + `flow-sync`, no per-repo caller change]
- Fixes a frontmatter-parse bug shared with the other bin readers: a `#` inside a value (e.g.
  `issue: "#157"`) was truncated as a comment. `flow-state`'s parser strips only a whitespace-
  preceded ` # comment` (the YAML rule), so hash-bearing values survive.

## v1.x — 2026-06 (backfill — reconstruct exact versions from tags)

The reusable-workflow era. Reconstruct precise `vX.Y.Z` boundaries from git tags; these are the
notable changes that shipped under `v1` during the initial reconciliation:

- **Reusable workflows + thin callers.** Every `flow-*` workflow split into a canonical reusable
  (`_flow-*.yml`) called by a 3-line per-repo caller. Repos now *reference* canonical, not copy it.
- **flow-open-pr / flow-recover / flow-sync** added (auto-open-PR non-draft; stranded-task recovery;
  the adopt mechanism).
- **flow-doctor** reconciled: source_roots floor + touches-overlap + uncommitted-task guard.
- **flow-review**: `--max-turns 25 → 80` + `bypassPermissions` (reviewer couldn't run its read
  commands); `allowed_bots: *` so bot-opened PRs get reviewed.
- **CALLER FIX (major-flavoured):** thin callers for `flow-status` / `flow-done` / `flow-recover` /
  `flow-open-pr` / `flow-sync` were missing `permissions:`, so their reusables failed at startup
  ("requesting contents: write, only allowed contents: read"). Fixed in the template; **existing
  repos must re-sync their callers** (this is why caller changes are MAJOR — they don't ride `@v1`).

---
### Entry template
```
## vX.Y.Z — YYYY-MM-DD
- <change> — <why>.  [caller action: none | re-sync callers | new secret <NAME>]
```
