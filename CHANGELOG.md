# Flow — CHANGELOG

Canonical infrastructure releases for `CandidDan/flow`. Each entry = one advance of the `v1` alias.
Policy: `docs/flow-versioning-policy.md` (immutable `vX.Y.Z` + a moving `vX` alias, advanced only
after a canary passes). Note any **caller action** required (a caller change is a MAJOR bump).

## Unreleased

- **`workflows: write` is not a permission, and never was — `flow-sync` is fixed with a credential
  instead** (`_flow-sync.yml`, `project-template/.github/workflows/flow-sync.yml`,
  `.flow/bin/check-workflows.mjs`, flow-0060). flow-0051 (below) diagnosed the right bug and
  reached for a permission that does not exist. `GITHUB_TOKEN`'s `permissions:` set is **closed** —
  `actions`, `attestations`, `checks`, `contents`, `deployments`, `discussions`, `id-token`,
  `issues`, `models`, `packages`, `pages`, `pull-requests`, `repository-projects`,
  `security-events`, `statuses` — and `workflows` is not in it. That scope belongs to GitHub Apps
  and fine-grained PATs only, which is precisely *why* `GITHUB_TOKEN` may not push a file under
  `.github/workflows/`: the permission it would need cannot be granted to it, so no `permissions:`
  block was ever going to fix this. GitHub's parser said so directly, asked to run the result:
  `failed to parse workflow: (Line: 43, Col: 7): Unexpected value 'workflows'`. The invalid key
  stopped the workflow **starting at all**, in both files here, behind the `v2` tag, and on the
  default branches of `CandidDan/Nudge` and `CandidDan/TanPlan` — strictly worse than the push
  failure it replaced, which at least ran. The fix is the **credential**: `_flow-sync.yml`'s
  `actions/checkout` of the repo being synced now takes `token: ${{ secrets.FLOW_PAT }}`, so the
  `git push` is authenticated by a token that *can* carry the `workflows` scope, and a first step
  fails the run naming `FLOW_PAT` and **Workflows: Write** when that secret is unset — before the
  push, instead of dying on GitHub's opaque `refusing to allow a GitHub App to create or update
  workflow` at the end.

  The deletion is not the point. Four checks passed a change that could not run — `build` parsed
  YAML rather than GitHub's schema; `sync-permissions.test.mjs` asserted the *string*
  `workflows: write` was present, i.e. tested that the wrong thing was there; canonical has no
  `flow-sync` caller of its own so the reusable never executed here; and GitHub validates a
  workflow only when it runs one, which a schedule/dispatch-only workflow never did. (A fifth
  signal existed and was missed: a push carrying an unparseable workflow produces a startup-failure
  run that is *not* attached to the PR as a check.) So `check-workflows.mjs` now knows the closed
  set and fails `npm run build` on **any** key outside it — workflow-level or job-level — naming
  the file, the key and the valid set, with fixtures covering the rarer legitimate keys
  (`id-token`, `models`, `attestations`, `repository-projects`) so the validator cannot become a
  worse outage than the bug. `build` also now parses `project-template/.github/workflows/` as well
  as `.github/workflows/`: the published thin callers are API too, and the invalid key sat in that
  tree entirely unbuilt. `sync-permissions.test.mjs` is rewritten — every assertion in it would
  have failed against the broken tree.
  [caller action: **required, and it replaces flow-0051's instruction — do not follow that one.**
  (1) If you hand-added `workflows: write` to your `.github/workflows/flow-sync.yml`, **delete that
  line**; while it is there your workflow does not parse and `flow-sync` cannot run at all. (2) Set
  your repo's `FLOW_PAT` secret to a **fine-grained PAT carrying Workflows: Write** (plus Contents
  and Pull requests, read and write). Without it `flow-sync` now stops on its first step with a
  message naming exactly that, rather than failing opaquely at the push. A repo that adopted the
  broken version needs **both** halves corrected — its own caller *and* the `v2` alias it points at
  — before any sync can deliver anything, and neither half can be delivered by `flow-sync` itself,
  because `flow-sync` is the thing that is broken.]

- **A lost race on `main` no longer discards a task's status** (`_flow-status.yml`,
  `_flow-done.yml`, flow-0059). Both workflows computed a transition, committed it on the runner
  and then ran a bare `git push origin main`. `main` is written constantly — the queue-runner
  claiming, `flow-status` on every PR event, `flow-done` on merge, `flow-recover` sweeping, and
  humans — so anything landing between the job's checkout and its push made that push a
  non-fast-forward, and git's refusal destroyed the state change with the container. Observed, not
  theorised: run 35058472116 logged `PR #78 marked ready for review -> flow-0056 in_review`,
  committed it, died at `! [rejected] main -> main (fetch first)`, and a human replayed it by hand
  in `cb793a7`. `_flow-done.yml` is the case that matters most — a lost `-> done` leaves a task at
  `in_review` with a **merged** PR permanently, because nothing re-fires `flow-done`, and
  `flow-recover` can then sweep it back to `ready` and have the queue-runner re-work already-merged
  code. Both now share one byte-identical block that takes up to **5 attempts**, and each retry
  **discards and redoes** the edit against the freshly fetched tip — the shape
  `allocate-task-id.mjs` already uses for this race. Deliberately absent: `pull`, `rebase`, `merge`
  and `--force`, each of which combines a stale edit with someone else's instead of re-deriving it
  (and rebase-then-push still loses inside the window between the rebase and the push). Exhausting
  the attempts **exits non-zero**, naming the task and the transition, because a state change that
  vanishes quietly is the whole defect. A concurrent edit to the *same* task file fails the same
  way rather than being overwritten: a retry that wins by clobbering is worse than the drop it
  replaces. `.flow/bin/state-push-retry.test.mjs` proves each of these by running the workflows'
  own shell against real repositories with a real competing pusher, not by reading the script.
  `_flow-recover.yml` keeps its `pull --rebase` and is left for its own task — it is on a cron, so
  a reset it loses is recomputed and re-pushed next sweep, which is exactly what these two can
  never do.
  [caller action: **none.** Both files are reusables, referenced by thin callers that gain no
  input, permission or secret; the fix reaches every repo the moment the `v2` alias moves, with no
  `flow-sync` and no caller edit.]

- **The published callers pin `@v2`, and so does the sync's adopt source** (`project-template/.github/workflows/flow-*.yml`,
  `_flow-sync.yml`, flow-0056). 2.0.0 shipped the version stamp without the pins: ten callers still
  read `_flow-<name>.yml@v1`, and `_flow-sync.yml` checked canonical out at
  `${{ inputs.canonical_ref || 'v1' }}` — which is the ref a scheduled sync actually uses, because
  the thin caller forwards an empty `canonical_ref`. Both refs now track the major in root
  `VERSION`. The consequence that made this priority 1 is `flow-sync`'s own copied surface: it
  includes `.github/workflows/flow-*.yml`, so the first sync into a repo overwrites that repo's
  `flow-sync.yml` with the template's. While the template pinned `@v1`, that meant handing back
  `_flow-sync.yml@v1` — the version without flow-0051's `workflows: write` — so a repo hand-edited
  to escape that bug re-acquired it on its first sync. `.flow/bin/caller-pins.test.mjs` derives the
  expected ref from `VERSION` rather than hard-coding `v2`, and fails naming the file, the line and
  both refs; a fixture at a hypothetical 3.0.0 proves it follows the stamp instead of quietly
  ceasing to mean anything at the next major. Canonical's own callers still pin `@main` by design
  and are excluded by scope, proved rather than assumed.
  [caller action: **none beyond flow-0051's, and none you make by hand.** See the 2.0.0 section:
  `flow-sync` delivers the `@v2` pins as part of the copied surface once `v2` is moved onto this
  merge commit. The human step this cannot do for itself is moving that tag — and it must happen
  after this merges and before any repo adopts.]

- **`flow-sync` can push the workflow files it exists to deliver** (`_flow-sync.yml`,
  `project-template/.github/workflows/flow-sync.yml`, flow-0051). GitHub refuses any push that
  creates or modifies a file under `.github/workflows/` unless the pushing token carries the
  `workflows` permission. `_flow-sync.yml` granted `contents` and `pull-requests` only — yet the
  thin callers (`.github/workflows/flow-*.yml`) are part of the copied surface by design, because
  copying them is how canonical ships a caller a repo has never had. So the first sync that added
  one (`flow-compass.yml`, flow-0013) died at `git push` with *"! [remote rejected] … refusing to
  allow a GitHub App to create or update workflow … without `workflows` permission"*, and every
  sync since has died the same way. Both files now grant `workflows: write`, and
  `.flow/bin/sync-permissions.test.mjs` fails if the grant and the copy step ever drift apart in
  either direction — narrowing the copied surface to dodge the permission would quietly turn every
  future new workflow into a manual adopt, which is the gap this closes, not a fix for it.
  [caller action: ~~**required**~~ **SUPERSEDED BY flow-0060 (above) — do not follow this.** The
  `workflows: write` edit it asks for is not a valid permission key and stops your workflow
  parsing. The original text is kept for the record:
  ~~required, and it is the one caller edit `flow-sync` cannot deliver for you.~~
  Every adopting repo must hand-edit its own `.github/workflows/flow-sync.yml` to add
  `workflows: write` to the `jobs.flow-sync.permissions` block — a called workflow can never hold a
  permission its caller withheld, so canonical's grant is inert until yours exists. Until you make
  that edit your syncs keep failing at the push with `remote rejected`, weekly, emitting nothing a
  human sees. **A repo whose syncs have been failing silently may be many versions behind** —
  `CandidDan/Nudge` sat at `.flow/VERSION` 1.0.0 for weeks this way. Run `flow-doctor`: its
  version-drift warning is what tells you how far behind you are, and it has been correct and
  unheeded the whole time. Once this one file is fixed, `flow-sync` carries the remaining caller
  updates itself.]

- **`## Unreleased` may hold entries again** (`.flow/bin/release-stamp.test.mjs`, flow-0047).
  flow-0044 shipped a case named "`## Unreleased` survives the release, empty, for the next
  change" that asserted, unconditionally, that the section held zero entries. Empty is true at
  the instant a release is cut and false every moment after, so the section was empty-or-red and
  the first task that needed a changelog entry (flow-0045) had a red gate with no in-scope fix —
  its only ways out were editing shipped history or opening a release stamp for a change that was
  not a release. The case now asserts the permanent property the old name was reaching for: the
  section **exists**. Both states are legal, and neither is asserted — swapping one prohibition
  for its opposite would be the same mistake mirrored. The regression it was written for survives,
  and is now proved rather than assumed: a release fold that takes the `## Unreleased` heading
  away with the entries it was holding fails, verified by mutating the real changelog, plus
  fixtures for the populated and empty states. The three released-section cases and the two
  tombstones are untouched.
  [caller action: **none.** `.flow/bin/release-stamp.test.mjs` is canonical's own gate over
  canonical's own stamps — it is not part of `project-template/`, so nothing about it rides the
  `v1` alias into an adopting repo. This entry's own presence, with the gate green, is the proof
  the fix works.]

## 2.0.0 — 2026-09-16 (pending tag + canary)

**This is 1.3.0 and 1.3.1, renumbered. No new work ships here** — the same tree, correctly
classified. The sections below for 1.3.0 and 1.3.1 are left exactly as they were: they are the
record of what was tagged on 2026-09-14, and rewriting them would be the thing this release exists
to stop pretending about.

**Why the number changed.** `docs/flow-versioning-policy.md` states the tell: *"if a change
requires editing the per-repo callers, it is MAJOR — it cannot silently propagate via an alias."*
`git diff --name-only v1.2.0 v1.3.0 -- project-template/.github/workflows/` lists **eight** caller
workflows. 1.3.0 was a major release wearing a minor's number, and on 2026-09-15 `v1` was advanced
onto it. Every repo pinned `@v1` whose callers were still 1.2.0-shaped went red at once — a
referenced check in `_flow-gates.yml` had come to depend on a copied capability in
`.flow/bin/touches-guard.mjs`, which only `flow-sync` can deliver.

**What was done about it.** `v1` was rolled back the same day and now points at `v1.2.1`
(`888b012`), a patch cut from the 1.2.x line carrying only the caller-action-free session-hygiene
fix. `v1.3.0` remains tagged and immutable; nothing pins it. The work below reaches a repo when
that repo chooses `@v2`.

**Adopting v2 needs `flow-0051` first.** Every action below is a caller edit, and `flow-sync`
currently has no `workflows: write` grant — so it cannot push the files that carry them. The
bootstrap is one hand-edit per repo (`flow-sync.yml`, adding the grant), after which `flow-sync`
delivers the rest. Do not begin the fleet migration before that lands.

**Adopting v2 means pinning the callers `@v2`.** The version stamp and the reusables are two
halves of one release, and only the stamp travelled in the re-cut: on `main` at VERSION 2.0.0 all
ten published callers still read `_flow-<name>.yml@v1`. A repo that adopted that tree got 2.0.0's
copied surface — `.flow/bin/`, the callers, `.flow/VERSION` — wired to the **v1** reusables, and
nothing said so, because a caller pinned at a tag that still resolves is indistinguishable from a
correct one. `_flow-sync.yml`'s own canonical checkout defaulted to `v1` the same way, so a v2 repo
would have adopted v1 content every week on the cron. flow-0056 moves both: the ten `uses:` pins and
the `canonical_ref` fallback, derived from root `VERSION` and held there by
`.flow/bin/caller-pins.test.mjs`, which fails if a published caller ever pins a major the stamp does
not. [caller action: **required, and `flow-sync` delivers it.** The callers are part of the copied
surface, so once flow-0056 is merged and `v2` points at it, the first sync into a repo rewrites that
repo's `.github/workflows/flow-*.yml` with the `@v2` pins. You do not hand-edit ten files — you
hand-edit the one from flow-0051 above and let the sync carry the rest. **Order matters, in both
directions.** `v2` must be moved onto the merge commit *before* any repo adopts: a caller pinned at
a tag that does not resolve fails every workflow in that repo, which is worse than the state this
fixes. And a repo hand-edited **before** flow-0056 lands has its `flow-sync.yml` **overwritten** by
its very first sync — the template's copy replaces yours, and while the template still pinned `@v1`
that copy was the version *without* `workflows: write`, so the flow-0051 fix reverted itself and the
next sync died at the push again. That is why this ordering is a blocker for the fleet migration
rather than a tidy-up after it.]

- **Re-sync `flow-queue-runner.yml` and set the `FLOW_PAT` secret** (flow-0026). The worker now
  pushes as a real actor instead of `github-actions[bot]`, so the Definition-of-Done gate runs on
  its PR. [caller action: **two steps, and the fix is inert without both** — the caller must pass
  `FLOW_PAT` through, and the secret must exist in the repo. One without the other leaves the
  worker exactly where it was.]
- **Re-sync `flow-status.yml`** (flow-0039). The auto-opened PR is now a draft and `in_review`
  moves on `gh pr ready`. [caller action: **required** — the trigger must list `ready_for_review`
  in `on.pull_request.types`. A caller left at the old trigger never sees the PR become ready, so
  the task never leaves `in_progress`.]
- **Re-sync `flow-review.yml` and add a `review:` block to `.flow/config.yml`** (flow-0007). The
  three Definition-of-Done reviewers moved out of the worker's session and onto the PR.
  [caller action: **required** — without the caller the reviewers do not run, and the gate goes
  green on build/lint/test/coverage alone, which is the certifying-your-own-work failure the task
  exists to end.]
- **Copy `flow-compass.yml`** (flow-0013). A new scheduled drift audit. [caller action: **opt-in**
  — a new reusable reaches nobody without a caller, so this one is a deliberate add rather than a
  re-sync. Skipping it costs you the audit and breaks nothing.]
- Everything else in 1.3.0 and 1.3.1 rides the reference and needs no caller edit; the per-entry
  detail stays in those sections rather than being duplicated here.
  [caller action: none for these.]

## 1.3.1 — 2026-09-15 (superseded by 2.0.0; never tagged, never carried by `v1`)

A single-change patch release. Prose only: no reusable workflow, no `.flow/bin/` helper and no
lifecycle or gate semantics move with it.

- **`Session hygiene` no longer trips on harness-side truncation** (`project-template/.flow/PROTOCOL.md`).
  The trip condition *"a tool result landed that you could not read in full"* was firing on routine
  truncation of tool output. Harnesses that cap search results by default — Codex among them — elide
  grep hits and directory listings as a matter of course, so the condition was satisfied by the first
  repository search of a session and the worker handed off, correctly by the letter of the rule,
  before implementation began. Observed in an adopting repo on 2026-09-15: every fresh worker session
  claimed its task, searched once, wrote a handoff note reading *"claimed and preserved, but
  implementation did not begin"*, and ended. The rule inverted its own rationale — its cost model is
  about a large result **entering** context, whereas truncation is the harness spending *less* of the
  budget by keeping bytes out. The condition now measures what entered context; a new
  *"What is not a trip condition"* block names the three routine behaviours that were false-positiving
  (harness truncation or elision, a search returning more matches than you read, and a re-read you
  chose to verify a string); the re-read condition is qualified with *"and cannot recall what it
  said"*; and a new floor states that no trip condition fires before there is work worth preserving,
  because nothing previously required a handoff to contain any progress.
  [caller action: **none.** No caller, workflow input or secret changes. A repo picks this up by
  re-syncing `.flow/PROTOCOL.md` in the usual way — `flow-sync` opens the PR. The change only ever
  loosens conditions, so no session that was compliant under 1.3.0 becomes non-compliant under 1.3.1.]

## 1.3.0 — 2026-09-14 (tagged `v1.3.0`; carried by `v1` 2026-09-15 only, rolled back same day — see 2.0.0)

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

## 1.2.1 — 2026-09-15 (tagged `v1.2.1`; **this is what `v1` points at today**)

Cut from the 1.2.x line, not from `main` — see 2.0.0 for why. Carries one change, the only one in
1.3.1 that was genuinely caller-action-free, so the fleet could have it without adopting a major.
Its tree is the `release/1.2.x` branch; `main` has never held this version.

- **`Session hygiene` no longer trips on harness-side truncation**
  (`project-template/.flow/PROTOCOL.md`). Ships the identical `PROTOCOL.md` section as the 1.3.1
  entry below: this bullet is a condensed retelling, but the protocol text the two releases carry
  is byte-for-byte the same on both lineages, verified by digest at release time. Workers on a harness
  that caps search output were handing off on their first repository search, before implementation
  began. [caller action: **none.** Re-sync `.flow/PROTOCOL.md` in the usual way. The change only
  loosens conditions, so nothing compliant becomes non-compliant.]

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
