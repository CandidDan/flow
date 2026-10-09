# Flow — CHANGELOG

Canonical infrastructure releases for `CandidDan/flow`. Each entry = one advance of the `v1` alias.
Policy: `docs/flow-versioning-policy.md` (immutable `vX.Y.Z` + a moving `vX` alias, advanced only
after a canary passes). Note any **caller action** required (a caller change is a MAJOR bump).

## Unreleased

## 3.3.2 — 2026-10-09

**PATCH: reviewer models come from canonical.** Leaving `review.model`, `review.code_review_model`
and `review.security_model` unset is now the norm and stays silent; setting one warns on every
plan summary as a visible override (flow-0144). The template and canonical's own config set none.
**Caller action:** remove the three keys from `.flow/config.yml` if present (every adopter has
already done so), then re-run flow-sync.

- **Reviewer models come from canonical: an unset model key is silent, a set one warns**
  (`project-template/.flow/bin/flow-review.mjs`, `project-template/.flow/config.yml`,
  `.flow/config.yml`, flow-0144). **Caller action:** remove `review.model`,
  `review.code_review_model` and `review.security_model` from `.flow/config.yml`. Until you do,
  each plan summary warns once per key.

  `DEFAULT_MODELS` in `flow-review.mjs` is the one decision — qa and the guide on Sonnet,
  code-review and security on Opus — and it ships to every repo with the synced helper. flow-0142
  warned on every *unset* key, and the template set all three, so new repos copied pins that then
  drifted (inflight sat on `claude-sonnet-5` / `claude-opus-5` after the move to 5.5). Now the
  unset path is silent, and a set key warns naming the key, its value and canonical's default.
  An override still works and is still validated; it is just visible on every PR.

## 3.3.1 — 2026-10-09

**PATCH: code-review and security default to Opus everywhere, and kickback's push runs away from
the fixer model.** flow-0142 gives each review check its own default (qa and the guide
`claude-sonnet-5-5`, code-review and security `claude-opus-5-5`), so 3.3.0's split reaches repos
whose config sets no models. flow-0135 moves kickback's guards and push into a job that runs no
model and is the only one holding `FLOW_PAT`. **Caller action:** none for most repos; re-run
flow-sync. A repo that set only `review.model` now gets Opus on code-review and security (two
Opus calls per PR); set `code_review_model` and `security_model` to keep them on its model. Also: PRs that change
something a person sees carry screenshots and recordings (flow-0141), and kickback's Claude
steps use full model IDs and report the model that answered (flow-0143).

- **PR descriptions carry captures for visible changes** (`project-template/.flow/PROTOCOL.md`,
  `project-template/.claude/skills/show-me/SKILL.md`, flow-0141). The PR-description order gains
  a captures step between the visual and the criteria checklist: key screenshots, and a short
  recording for motion, when the change is something a person sees and the session can run it;
  otherwise one `Not captured: <reason>` line. show-me's new `## Captures` section says what to
  capture, that captures go on an orphan `captures/<task-id>` branch linked by commit SHA (never
  the feature branch), the `blob/<sha>/…?raw=true` image form that renders in a private repo,
  synthetic data only, and never adding the browser to the repo's dependencies. Guidance only; no
  check enforces it. **Caller action: none; adopters receive the guidance at their next sync.**

- **Kickback's three Claude steps name full model IDs and report the model that answered**
  (`.github/workflows/_flow-kickback.yml`, flow-0143). **No caller action**: the reusable's inputs
  and permissions are unchanged. The fixer passes `--model claude-opus-5-5` and both decision-card
  writers `--model claude-sonnet-5-5`, replacing the bare `opus` / `sonnet` aliases that resolved
  through whatever CLI the action pin installed. Each is followed by the same "Report the model that
  answered" step `_flow-review.yml` runs, so a round's job summary says which model did the work.
  `model-ids.test.mjs` no longer exempts `_flow-kickback.yml` — the exemption flow-0140 added while
  flow-0135 rewrote the file is gone, and every reusable is held to the rule.

- **The auto-fix round's guards and push run in their own job, so nothing the fixer model writes
  can reach `FLOW_PAT`** (`.github/workflows/_flow-kickback.yml`, `.flow/config.yml`,
  `docs/flow-reusable-workflows.md`, flow-0135). **No caller action**: both callers' `permissions:`
  are unchanged (the new job needs only `contents: read`), and a repo that has not set
  `review.auto_fix_rounds` is still off. A repo that has it armed gets the new layout on its next
  run of the reusable.

  ROOT CAUSE. flow-0082 stated its credential rule per STEP ("FLOW_PAT reaches exactly one step"),
  and the code, its comments and its tests all held that invariant — so three later reviews checked
  the code against it and passed it. The invariant was wrong: on a runner the trust boundary is the
  JOB. Every step of a job shares the filesystem (`.git/hooks/`) and the `$GITHUB_ENV` /
  `$GITHUB_PATH` files, so the fixer (`bypassPermissions`, reading PR comments) could plant a hook,
  an env var (`BASH_ENV`, `NODE_OPTIONS`, `LD_PRELOAD`) or a PATH entry that ran beside the PAT in
  the later `stamp-and-push` step, and could subvert the guards in that job too. flow-0134 switched
  canonical's auto-fix off as the stopgap.

  The fix replaces the invariant, not just the code: **no job that runs a model references
  `secrets.FLOW_PAT`, and the job that does runs no model.** `fix` now only runs the model and hands
  the round on as data — a `git bundle` plus the hand-back, as a one-day run artifact (a job output
  would reach the next job through `env:`, which Linux caps at 128 KiB per value). A new `push` job
  checks out the PR head `plan` recorded before any model ran (fresh, `persist-credentials: false`),
  refuses any bundle whose single prerequisite is not that head, runs the four guards from
  default-branch code exactly as before, and commits and pushes with hooks off
  (`-c core.hooksPath=/dev/null`, `--no-verify`). A refused bundle escalates with its own sentence
  on the decision card. The hand-back now reaches check 1 through the artifact, cut to its first
  16 KiB (the same cap the card's job output already had), so an over-long hand-back fails to parse
  there and routes to the dead-round card. `fix` also checks out the head `plan` recorded, so a
  branch that moved fails before a model round is spent. Canonical's `review.auto_fix_rounds` is
  back to `2`.

- **code-review and security default to Opus in every repo, not only where config says so**
  (`project-template/.flow/bin/flow-review.mjs`, `project-template/.flow/config.yml`, flow-0142).
  **Caller action:** none for a repo that sets no `review.*model` key — it gains Opus on
  code-review and security at the next sync. A repo that set **only** `review.model` sees
  code-review and security move off it onto Opus; to keep them on its model, set
  `review.code_review_model` and `review.security_model` to the same value. **This costs: two Opus
  review calls per PR** (code-review on every PR, security on every PR it triggers on) where such a
  repo previously ran its `model` — the cost flow-0140 already decided.

  flow-0140 shipped the split (Sonnet for qa and the guide, Opus for code-review and security) as
  template config, but an adopter's `config.yml` is repo-owned and never synced, so the split
  reached only new repos; everywhere else all three checks ran `DEFAULT_MODEL` (Sonnet). The
  defaults now live in the synced helper as `DEFAULT_MODELS = { model: "claude-sonnet-5-5",
  code_review_model: "claude-opus-5-5", security_model: "claude-opus-5-5" }`, and each key resolves
  its own value or its own default — never another key's. Every unset key now warns in the plan
  summary, naming the key and the default it fell to (previously only `model` did).
  `DEFAULT_MODEL` stays exported (canonical's adapter re-exports it) and equals
  `DEFAULT_MODELS.model`. `_flow-review.yml`'s `code_review_model || model` fallback is now inert
  and left in place for base branches whose helper predates this change.

## 3.3.0 — 2026-10-09

**MINOR: every Claude step runs the 5.5 models and says which model answered.** The action pin
moves to v1.0.245 (Claude Code 2.1.293), model IDs are full rather than aliases, and code-review
gets its own optional model key (flow-0140). **Caller action:** none to stay working; re-run
flow-sync to pick up the review helper. Until a repo's `.flow/config.yml` sets
`review.code_review_model`, its code-review runs on `review.model` (default `claude-sonnet-5-5`).

- **Workers and reviewers run the 5.5 models: `claude-code-action` pinned to v1.0.245, full model
  IDs, code-review on its own model** (`.github/workflows/_flow-*.yml`,
  `project-template/.flow/bin/flow-review.mjs`, `project-template/.flow/config.yml`, flow-0140).
  **No caller action** for a repo that does not set `review.*model`. A repo that sets an alias
  there (`model: "sonnet"`) keeps working but should move to a full ID (`claude-sonnet-5-5`):
  an alias resolves through whichever CLI the action pin installs, which is how every Claude step
  ran a generation behind with nothing reporting it.

  Every `anthropics/claude-code-action` step moves from `5ccc3a35` (v1.0.219, Claude Code
  2.1.266, which knows no 5.5 model) to `6fed3ca1` (v1.0.245, 2.1.293). The queue runner passes
  `--model claude-opus-5-5`; the review default (`DEFAULT_MODEL`) is `claude-sonnet-5-5`. New,
  optional `review.code_review_model` runs the code-review check only, falling back to
  `review.model` and validated like `security_model`; the template sets Sonnet for qa and the
  guide, Opus for code-review and security. Each Claude step is followed by a "Report the model
  that answered" step that names, in the run summary, the model(s) in the action's
  `execution_file` (`result.modelUsage`, then `assistant.message.model`, then `system/init`), or
  says the action did not report one, and warns when the requested ID did not answer.
  `_flow-kickback.yml` is repinned only; its `--model` values move with flow-0135.

## 3.2.2 — 2026-10-08

**PATCH: task-writer stops refusing product work in repos that have not adopted intents.**
flow-0074 (3.2.0) made its intent step unconditional, so on 3.2.x every product task stopped for
want of an intent no adopter has yet. Now it binds only where `.flow/intents/` exists and
`intents.required_from` is set (flow-0139). **No caller action.** Re-run flow-sync.

- **The intent rule binds only a repo that has adopted intents, so task-writer no longer refuses
  product work everywhere else** (`task-writer` skill, `PROTOCOL.md`, `README.md`, flow-0139).
  **No caller action.** The fix arrives with the next flow-sync.

  flow-0074 (3.2.0) gated flow-doctor's intent checks correctly, but made task-writer's step
  unconditional: product work had to name an intent already on `main`, or the session stopped. No
  adopter had intents, so on 3.2.x task-writer refused every product task. It also pointed at an
  `intent-writer` skill that is not shipped yet. The step, the PROTOCOL hard rule and the
  touchpoint wording now apply only when `.flow/intents/` exists **and** `intents.required_from` is
  set. Otherwise `intent` stays empty and tasks are written as before. The `intent-writer`
  reference is gone until that skill ships.

## 3.2.1 — 2026-10-08

**PATCH: the 3.2.0 sync PRs go green in adopting repos.** One canonical test (flow-0074's
criterion 9) read an adopting repo's own task template, which flow-sync never touches, so every
3.2.0 sync PR failed `flow-tooling`. Fixed by flow-0138. **No caller action.** Re-run flow-sync to
pick it up. It carries 3.2.0's Actions cost fix (flow-0136) with it.

- **An adopting repo's own task template no longer fails `flow-tooling`**
  (`project-template/.flow/bin/flow-doctor.test.mjs`, flow-0138). **No caller action.** The fix
  arrives with the next flow-sync.

  flow-0074's criterion-9 test checked that the task template ships `intent: ""`, reading
  `.flow/tasks/_TEMPLATE.md` beside the test. In an adopting repo that file is the repo's own and is
  never synced, so every 3.2.0 sync PR failed `flow-tooling`. The test now runs only in canonical and
  skips elsewhere with a reason, and a canonical-only test fails if canonical ever skips it.

## 3.2.0 — 2026-10-08

**MINOR: PR gates stop running on drafts, which was the fleet's largest Actions cost.** Measured
1–8 Oct across six private adopters: ~15,300 billed minutes (≈ $30/day). The gate and review were
~62% of it, mostly re-running on every draft push. Gates now run when a PR leaves draft, and a
newer push cancels the run it supersedes (flow-0136). Also: tasks name the intent they derive from
(flow-0074, warn-first). **No required caller action:** re-run flow-sync to pick up the new callers.
A repo with a customised `flow-gates.yml` ports the gate change by hand (see flow-0136).

- **A task names the intent it derives from, and the human's first touchpoint moves to approving
  the intent** — ADR-0007 slice 2 (`project-template/.flow/bin/flow-doctor.mjs`,
  `.flow/tasks/_TEMPLATE.md`, `PROTOCOL.md`, `task-writer` skill, flow-0074). **Caller action, optional:**
  when your repo starts writing intents, add `intent: ""` to your own `.flow/tasks/_TEMPLATE.md`
  (flow-sync never touches it) and set `intents.required_from: "YYYY-MM-DD"` in
  `.flow/config.yml` to that day. Until you set it, a repo that has a `.flow/intents/` directory
  sees **one** warning naming the key; a repo without one sees nothing new.

  Tasks gain an `intent:` field holding the id of an intent already on `main` in `.flow/intents/`.
  Merging the intent's PR is the approval, so the intent's `status` is not read. flow-doctor,
  active only when `.flow/intents/` exists:
  - a `ready` task created on or after `intents.required_from`, serving anything but
    `maintenance`, with no `intent` → **warning** (warn-first; escalating it is a later task);
  - an `intent` naming no intent's `id` → **failure** on a `ready` task, warning otherwise. No
    task carried the field before, so this cannot redden an existing store;
  - an `intent` naming a `superseded` intent → warning.

  Forward-only: tasks created before the date are never asked for an intent, and nothing is
  backfilled. `PROTOCOL.md` now says the human approves the intent up front and the PR at the end,
  and gains a hard rule: the session that writes a task never writes the intent it derives from.
  `task-writer` stops and says so when product work has no intent on `main`. The triage lane is
  unchanged: a triaged product task with no intent warns, which keeps that open question visible.

- **PR gates skip draft PRs, and a newer push cancels the gate and review runs it supersedes**
  (`.github/workflows/_flow-gates.yml`, the `flow-gates.yml` and `flow-review.yml` callers,
  flow-0136). **No caller action** beyond the next flow-sync, which delivers the updated callers.
  **Exception:** a repo that keeps a customised `flow-gates.yml` (tanplan-platform does, for its
  Postgres-backed suite) does not receive this by sync. Port the `types:`, the per-job draft clause
  and the `concurrency:` block by hand (tanplan-platform did, in tanplan-0075).

  Measured 1–8 Oct 2026 across six private adopters: ~15,300 billed Actions minutes. The PR gate
  was ~39% of that and the review ~23%, because the gate ran in full on every push to a draft, and
  no caller cancelled a superseded run. Now every gate job skips on a draft (`github.event` in the
  reusable is the caller's event), and the callers fire on `ready_for_review`, so the PR is gated
  the moment it leaves draft. Both callers also declare a per-PR `concurrency` group that cancels
  in-flight runs on `pull_request` events only; a manual `workflow_dispatch` run is never
  cancelled. A cancelled review is not a failure, so it never starts a kickback round.

## 3.1.1 — 2026-10-05

**PATCH: the 3.1.0 sync PRs go green in adopting repos.** One canonical test (flow-0119's asks
prose check) read an adopting repo's own `CLAUDE.md` and task template, which flow-sync never
touches, so every 3.1.0 sync PR failed `flow-tooling`. Fixed by flow-0133. **No caller action.**
Re-run flow-sync to pick it up.

- **An adopting repo's own `CLAUDE.md` and task template no longer fail `flow-tooling`**
  (`project-template/.flow/bin/asks.test.mjs`, flow-0133). **No caller action**. The fix arrives
  with the next flow-sync.

  flow-0119's criterion-7 tests check that three documents teach the notes/asks split. They resolve
  them relative to `project-template/`. In canonical that is the template; in an adopting repo it is
  the repo root, where `CLAUDE.md` and `.flow/tasks/_TEMPLATE.md` are the repo's own and flow-sync
  never touches them. Every 3.1.0 sync PR therefore failed `flow-tooling` (tests 73–76). An adopting
  repo now checks only the synced `.flow/PROTOCOL.md`. Canonical still checks all three, and a
  canonical-only test fails if that ever narrows.

## 3.1.0 — 2026-10-05

**MINOR: the first fleet release of v3. 3.0.0's scheduled queue runs never dispatched, and this
fixes that.** The schedule gate read the caller's workflow name wrongly, so every scheduled tick on
3.0.0 failed closed (flow-0132). Found on the canary before `v3` was advanced, so no repo ran 3.0.0
pinned `@v3`. Also: typed `asks:` for the human (flow-0119), an opt-in review auto-fix worker
(flow-0082), and sync-PR and repin-doc fixes (flow-0128, flow-0130). **No caller edit is required.**
flow-0082's new `flow-kickback.yml` caller is opt-in and arrives with flow-sync. Moving from `@v2` is
the 3.0.0 caller action, and `docs/repinning-a-consuming-repo.md` has it.

- **A failed `qa` or `code-review` check now dispatches a bounded auto-fix worker onto the same
  PR** (`_flow-kickback.yml`, `flow-kickback.yml`, `.flow/bin/flow-kickback.mjs`, flow-0082).
  **Caller action: adopt the new `flow-kickback.yml` caller** — `flow-sync` delivers it — **then
  set `review.auto_fix_rounds` in `.flow/config.yml` to opt in.** Adopting the caller alone turns
  nothing on: the key ships commented out, and with it absent or `0` a red review check does
  exactly what it did before. Turning it on also needs `FLOW_AI=true` and the `FLOW_PAT` secret.

  The protocol has always called a red review check a kickback, and nothing dispatched one: the
  worker's session ended at `gh pr ready`, and the queue runner only picks `ready` tasks, so an
  `in_review` task with a precise, mechanical finding sat until a human noticed. PRs #108 and
  #109 are the motivating cases — in each, code-review named the file, the line, the cause and
  the fix, and the human added nothing but the delay.

  The bounds are the substance of the change, not decoration:

  - **Rounds are capped**, at `review.auto_fix_rounds` with a **hard maximum of 3** (a larger
    value is clamped, with a warning naming what you configured). The count lives on the PR —
    each pushed round carries one commit stamped `Flow-Auto-Fix-Round: N/CAP` by the *workflow*,
    not by the fixer — so the kickback workflow never writes to the default branch and needs no
    `contents: write` there.
  - **A failed `security` check is never auto-fixed**, alone or alongside others.
  - **A round may not pass review by weakening the tests.** The workflow diffs the round and
    throws it away if it deleted or renamed a test file, removed a test declaration or an
    assertion, or added a `.skip`/`.only`. Adding tests and strengthening assertions is always
    allowed. This is why the *workflow* pushes and the fixer does not: the check has to sit
    between the commit and the push.
  - **Every escalation is ONE decision card**, plus the `flow:needs-human` label — the finding,
    what was tried or disputed, exactly one recommendation ("merge as is" or "kick back with: a
    named change"), the alternative, and the rounds used, capped at 1,500 characters and
    readable from a phone. No path adds the label without first posting a card, and a
    recommendation the model failed to produce renders a visible fallback card rather than
    nothing. The label is also that PR's off switch: the workflow never acts on a labelled PR,
    and removing the label re-arms it. A dispute, and a round a later guard stopped, are
    described by the round's own hand-back; a security check, an exhausted cap and a round that
    handed nothing back get their four fields from a bounded **read-only** model call that reads
    the verdicts, the diff and the round history and changes nothing.
  - **Merge stays human**, and the fix is re-reviewed in CI from scratch.

  - **The jobs that run a model hold no write scope, and the jobs that hold write scopes run no
    model.** The fixer is a model under `bypassPermissions` whose prompt tells it to read PR
    comments as instructions, so on a non-fork PR anyone who can comment can address it — and
    `--disallowedTools` only pattern-matches command prefixes, which is a statement of intent
    rather than a boundary. The boundary is the token. So `fix` and the read-only card writer
    get `contents: read` + `pull-requests: read` and nothing that writes; the draft toggle and
    both card-posting paths are separate jobs holding `pull-requests: write` + `issues: write`
    and running no model; and `FLOW_PAT` reaches only `stamp-and-push`, after all four guards.
    Permissions are declared **per job**, with the file's top-level block `contents: read` as a
    floor. A workflow-level `pull-requests: write` would have put `gh pr review --approve` and
    `gh pr edit --remove-label flow:needs-human` one injected comment away.

  Safe to hold credentials because a `workflow_run` event always runs the workflow file from the
  default branch, never the PR head — and for the same reason the test-weakening guard runs from
  the default branch's copy of the helper, pinned by a SHA resolved before the fixer gets the
  runner. Fork PRs are skipped, matching the fork fence in `_flow-review.yml`.

- **A task can now carry `asks:` — the open items for the human, typed and machine-readable**
  (`project-template/.flow/bin/asks.mjs`, `project-template/.flow/bin/flow-doctor.mjs`,
  `project-template/.flow/bin/flow-state.mjs`, `project-template/.flow/tasks/_TEMPLATE.md`,
  `project-template/.flow/PROTOCOL.md`, `project-template/CLAUDE.md`, flow-0119).
  **No caller action** — a task with no `asks:` key parses as an empty list, so every existing
  task and every adopting repo stays green, and `flow-state --json` reports `asks: []` for it.

  `notes` is the handoff to the next session; `asks` is the queue for the human. Each entry is one
  string prefixed with its kind — `decision` (which must carry `Recommend:`), `follow-up` or
  `fyi` — so every existing frontmatter reader parses it unchanged. `flow-doctor` fails a
  malformed ask, naming the task and the ask; `flow-state --json` adds a parsed `asks` array to
  every task row. The new `asks.mjs` imports nothing and uses no Node-only global, so a browser
  surface can reuse the grammar rather than re-implement it.

- **A sync PR that ships a canonical skill is classified as a sync PR again**
  (`project-template/.flow/bin/flow-review.mjs`, flow-0128). **No caller action** — the fix
  travels on the synced surface, so an adopting repo gets it with its next `flow-sync`.

  `SYNC_PR_PATHS` is meant to be the surface `_flow-sync.yml` copies, exactly as that workflow's
  own header lists it. flow-0081 added `.claude/skills/<name>/` to that header and to the copy
  step; the constant was never widened, so every v3 sync carrying a skill fell outside the list
  and was refused the `SYNC PR` classification. The reviewers then read it as an ordinary feature
  PR — qa failed it for having no task, and a large sync failed again on diff truncation. Found by
  the v3 canary on progress PR #115.

  Scoped to the skill directories canonical actually ships (`board-builder`, `flow-compass`,
  `show-me`, `task-writer`, `vision-writer`), each mirrored wholesale, and **not**
  `.claude/skills/**`: the sync loop only ever writes canonical's own names, so a `flow-sync/`
  branch adding a skill the repo invented is a change nobody reviewed and still gets read in full.
  The flow-0115 provenance check covers the skill files unchanged — `rsync -a` copies them byte
  for byte, so a skill edited after the sync is caught exactly as an edited helper is.

  Two tests stop the list drifting a second time: one pins it against canonical's
  `project-template/.claude/skills/` on disk, the other parses `_flow-sync.yml`'s own `What it
  syncs` inventory and fails if the header lists a copied path the constant does not cover.

- **The `@v2`→`@v3` repin doc now says to repin the flow-sync caller *before* dispatching the sync**
  (`docs/repinning-a-consuming-repo.md`, flow-0130). **Caller action if you are still on `@v2`:**
  follow that section's two steps in order. Repin `.github/workflows/flow-sync.yml` to
  `_flow-sync.yml@v3` and merge that one-line PR first, *then* run
  `gh workflow run flow-sync.yml -f canonical_ref=v3`. If you already dispatched it from `@v2` and
  its PR is red, merge that PR anyway — its callers are `@v3` — and run the sync a second time.

  `canonical_ref` chooses which canonical tree is copied *from*; the caller's `uses:` pin chooses
  which reusable does the *copying*. The doc's old one-liner only set the first, so a repo still
  pinned at `@v2` ran `_flow-sync.yml@v2` — 2.2.0, which predates flow-0081 and copies no
  `.claude/skills/` at all. It adopted 3.0.0's `.flow/bin` with none of the skills that tooling
  tests for, and the synced `allocate-task-id.test.mjs` failed on the `task-writer` skill's missing
  `queue_cap` paragraph: the repo's own flow-tooling check went red on the adoption PR itself.
  Found by the v3 canary on progress PR #115.

  Three tests in `.flow/bin/caller-pins.test.mjs` pin it. The order is checked positionally — the
  repin must appear before the dispatch in the section — because an order is the one thing a prose
  check cannot assert by keyword. Both refs are derived from root `VERSION`, so cutting the next
  major moves them with it.

- **The queue runner's schedule gate can list its own runs again, so scheduled ticks dispatch**
  (`.github/workflows/_flow-queue-runner.yml`, flow-0132). **No caller action** — the fix is in the
  reusable, and a caller already on `@v3` picks it up when the alias moves.

  The run-history step derived the caller's workflow filename from `github.workflow_ref` by
  stripping the path before the `@<ref>`. The ref is `refs/heads/main` and holds slashes, so the
  result was `main`, `gh run list --workflow main` failed, and the gate failed closed: on 3.0.0
  every scheduled tick dispatched nothing. Found on the canary (progress), run 37247213658. Manual
  dispatch was unaffected, because it skips the gate. The derivation now strips `@<ref>` first, and
  a test runs the step's own line against branch and tag refs.

## 3.0.0 — 2026-10-02 (tagged; superseded by 3.1.0 before `v3` was advanced)

**MAJOR: one caller contract change, plus the fixes that end TanPlan's hand-set `in_review`.** The
queue runner can now be paused and timed from repo variables (flow-0080). Its new schedule gate
reads the runner's own earlier runs, so **the `flow-queue-runner.yml` caller must grant
`actions: read`**. A caller without it is refused by GitHub before any job starts
(`startup_failure`), which is exactly what canonical hit until flow-0124. Under the versioning
policy, a new caller permission is MAJOR, so `@v2` stays on 2.2.0 and nothing moves until a repo
opts in. **Caller action:** run flow-sync (or follow `docs/repinning-a-consuming-repo.md`) to move
callers to `@v3`, which brings the `actions: read` grant with it.

Also in this release: flow-status and flow-done stop reporting a CONFLICTING EDIT that is not
there (flow-0114), recover promotes a ready PR (flow-0104), flow-sync ships the skills
(flow-0081), the review-guide comment (flow-0084), the queue cap (flow-0070), and the release
gate stays green after assemble (flow-0090, flow-0123). The re-pin to `@v3` and the VERSION bump
are flow-0125, the first entry below.

- **Flow is v3; the published callers and both version stamps move together**
  (`project-template/.github/workflows/flow-*.yml`, `.github/workflows/_flow-sync.yml`, `VERSION`,
  `project-template/.flow/VERSION`, `docs/repinning-a-consuming-repo.md`, flow-0125). All ten
  template callers now pin `_flow-<name>.yml@v3`, `_flow-sync.yml`'s `canonical_ref` default and
  no-caller fallback become `v3`, and both stamps read 3.0.0. `flow-init` needed no edit: it
  derives the pin from the stamp it copies (flow-0058), so a repo adopted from this tree is born
  on `@v3`.

  **This is MAJOR because of flow-0080, not because of anything in this entry.** flow-0080 made
  the `flow-queue-runner.yml` **caller** grant `actions: read` on its `schedule-gate` job, and
  GitHub refuses the run at startup without it. `docs/flow-versioning-policy.md`: a change that
  requires editing the per-repo callers is MAJOR, so it cannot ride an alias. **`v2` therefore
  stays at 2.2.0 and is never moved onto this tree** — moving it would break every repo pinned
  `@v2` whose caller lacks the grant. The 1.3.0 rollback recorded under 2.0.0 is this exact
  mistake, made once already.

  **Caller action:** repin deliberately, do not wait for an alias to carry it. Re-sync (or hand-
  edit) all ten `flow-*.yml` callers from `@v2` to `@v3`, and confirm your
  `flow-queue-runner.yml` grants `actions: read` on `schedule-gate` — without it the scheduled
  queue run fails before any step executes. `docs/repinning-a-consuming-repo.md` has the v2-to-v3
  step. A repo that stays on `@v2` keeps working and stops receiving updates.

- **The task queue has an optional cap** (`.flow/bin/allocate-task-id.mjs`, `.flow/config.yml`,
  task-writer skill, flow-0070). Set `queue_cap: N` in `.flow/config.yml` and `allocate-task-id`
  refuses a new `ready` task while `N` or more are already `ready` on `origin/main` — before it
  writes, commits or pushes anything, with a message naming the count, the cap and the two ways
  forward. Flow already capped work in progress (one claim per session, `touches` overlap) and
  capped planning nowhere, so an orchestrator could write `ready` tasks faster than any worker
  drained them. **No caller action** — the key is absent by default and an uncapped repo behaves
  exactly as before.

    The only bypass is the draft's own `urgent` label, which is the human's to apply: there is no
    flag, no env var and no `--force`, because a bypass a session can hand itself is not a limit.
    A `blocked` draft is never capped — the cap limits the ready queue, not the store. `--dry-run`
    with a `--content-file` reports the decision without writing. Canonical sets `queue_cap: 8`
    and is currently over it, which is the intended effect: nothing new enters its queue until it
    drains.

- **Queue-runner timing lives in repo variables** (`_flow-queue-runner.yml`, the
  `flow-queue-runner.yml` caller, new `.flow/bin/queue-runner-schedule.mjs`, flow-0080). Three
  variables, set once per repo with `gh variable set` and never by editing a workflow:
  `FLOW_QUEUE_RUNNER=paused` stops **scheduled** runs while leaving the three PR review checks,
  triage and compass running (`FLOW_AI=false` still turns everything off, and `workflow_dispatch`
  still works while paused); `FLOW_TZ` + `FLOW_RUN_HOUR` move the day's run to a local hour in an
  IANA zone, daylight saving included. The caller's cron becomes hourly and a new `schedule-gate`
  job decides which tick is the run — the **first** tick at or after the hour, once per local day,
  so GitHub's habitually late scheduler delays the run instead of skipping the day. Every skipped
  tick writes one line to its step summary saying which answer it gave. With both schedule
  variables unset, behaviour is unchanged: one run per UTC weekday at 07:00. **Caller action:**
  re-sync `flow-queue-runner.yml` to get the hourly cron and the `actions: read` grant the gate
  needs; until then the pause switch works but the local-time schedule cannot take effect. If you
  keep a customised cron whose only daily tick is before 07:00 UTC, set `FLOW_RUN_HOUR` to that
  hour — otherwise the gate's default run hour falls after your tick and nothing runs.

- **flow-sync now ships the template's skills** (`.github/workflows/_flow-sync.yml`, flow-0081).
  Every canonical-named directory under `project-template/.claude/skills/` is on the copied
  surface, mirrored wholesale into the adopting repo. Before this, `flow-init` copied the skills
  once at adoption and no sync ever refreshed them: a repo adopted before a skill existed never
  got it — `AGENTS.md` pointed at a `SKILL.md` that was not there — and a skill *fixed* in
  canonical never reached the fleet. Skills the adopting repo wrote itself are untouched, and
  `.claude/settings.json` and `.claude/settings.local.json` stay project-owned. A local edit to a
  canonical-named skill is overwritten by the next sync, the same bargain as `.flow/bin/`.
  **Caller action:** none — the surface lives in the reusable, so the skills arrive with the next
  sync; move any local change to a canonical-named skill into canonical first.

- **After the three review checks finish, one `guide` comment tells the human where to look**
  (`.github/workflows/_flow-review.yml`, `project-template/.flow/bin/review-guide.mjs`, flow-0084).
  **Caller action: none** — the job lives in the reusable, so bumping the workflow tag is all an
  adopting repo does.

  The merge touchpoint was the weak one: three reviewer comments plus a long PR description is not
  a touchpoint, it is reading. A fourth job now runs after `qa`, `code-review` and `security`
  — whatever each of them concluded — and posts a single comment in a fixed order: **TL;DR · Look
  here (max 3) · Assumptions · Smoke test · Verdicts**. One comment per PR, found by a hidden
  marker and updated in place, never reposted.

  **Facts render from code; prose renders from a model; they are separate sections.**
  `review-guide.mjs` computes the hotspots — a file matching `review.security_paths` or the
  always-reviewed security floor, a test file deleted or left with fewer assertions than it
  started with, a file changed outside the task's declared `touches` — quotes the PR description's
  `## Assumptions` section verbatim (or says "none stated"), and renders the three verdicts. The
  model writes only the one-line TL;DR and the smoke-test suggestion, and may **reorder** the
  hotspots by naming their ids; it cannot add, drop or reword one, because every fact's text is
  produced by the helper and the model only ever returns ids. If the model call fails the comment
  still posts, with a line saying the summary is unavailable: fail-open for prose, never for facts.

  **It never blocks.** `continue-on-error` sits on the job and no other job depends on it, so a
  broken guide cannot turn a PR red. It inherits the draft and fork fences from `plan` rather than
  recopying them, and its facts are computed from the **base** branch's helper and config — a PR
  cannot edit the code that finds its own hotspots, nor delete the glob that names one.

  A skipped security review reads as **skipped, with the plan's reason**, never as a pass: the
  security job always runs so its check is never silently absent, which means a skipped review
  still reports a successful job.

- **The reviewers read the task, and its acceptance criteria, from the base branch**
  (`.github/workflows/_flow-review.yml`, flow-0085). `REVIEW_TASKS_DIR` now points into the base
  worktree the gate is already materialised from, so a PR that edits its own task file no longer
  hands the qa reviewer criteria of its own choosing. A task that exists only on the PR branch
  resolves to the usual `NO TASK FILE RESOLVED`. In BOOTSTRAP (no gate on base) the task still
  comes from the PR, since there is no independent copy. Unblocks flow-0082 (auto-fix).
  **Caller action: none** — adopting repos get it through the `@v2` alias.

- **Release and sync PRs are classified by code, so the reviewers stop guessing about task-less
  PRs** (`project-template/.flow/bin/flow-review.mjs`, `.github/workflows/_flow-review.yml`,
  flow-0089). The review plan now recognises two kinds of PR that carry no task *by design*, and
  writes a third and fourth sentinel into `.flow-review/task.md` instead of
  `NO TASK FILE RESOLVED`:

  - **`RELEASE PR`** — head branch `release/*` **and** every changed path one of `CHANGELOG.md`,
    `changes/**`, `VERSION`, `project-template/.flow/VERSION`, `.flow/VERSION`. The sentinel
    carries `release-guard`'s `checkRelease` verdict over the PR's own tree, so the reviewers PASS
    a clean one with a fixed line and FAIL one whose stamps disagree or whose changelog fragments
    were never assembled.
  - **`SYNC PR`** — head branch `flow-sync/*` **and** every changed path inside the surface
    `_flow-sync.yml` copies (`.flow/bin/**`, `.github/workflows/flow-*.yml`, `.flow/PROTOCOL.md`,
    `.flow/VERSION`). The reviewers PASS it; `flow-tooling` is what validates the synced files.

  Both halves of each rule must hold, so the branch name on its own exempts nothing: a `release/*`
  or `flow-sync/*` PR that touches any other path is reviewed exactly as it is today. The same
  task-less release PR had been getting a qa PASS (#117) and a qa FAIL (#121) from the same
  reviewer, and every adopting repo hit the sync case on every sync.
  A sync PR is still read: the classification proves where the files are, not where their content
  came from, so every reviewer FAILs one that adds or widens `permissions:`, introduces
  `pull_request_target`, repoints a `uses:`, or changes secret handling.
  **Caller action: none** — adopting repos get it through the `@v2` alias.

- **A release's own gate is green: canonical's changelog-aware tests now run against the tree
  `--assemble` leaves behind** (`.flow/bin/release-assemble.test.mjs`,
  `project-template/.flow/PROTOCOL.md`, `.flow/bin/protocol-docs.test.mjs`, flow-0090).
  **Caller action: none** — the new check is canonical-only, and the protocol sentence is stated
  conditionally so it stays true in a repo with no `changes/` directory.

  `changelog-fragments.mjs --assemble` deletes every fragment by design, so a test that proves "my
  changelog entry exists" by reading `changes/<id>.md` is green until the release and red on the
  release's own PR. It happened on three releases (flow-0069 and flow-0073 broke 2.1.0, flow-0050
  broke 2.1.1, flow-0093/0094/0095 broke 2.1.2) and each one was patched by hand afterwards.
  `release-assemble.test.mjs` copies canonical's tracked tree into a scratch git repo, assembles
  there — synthesising a fragment when none is pending, so the path runs on every gate — and
  re-runs exactly the test files that mention `changes` or `CHANGELOG`. A failure names each
  failing test. `PROTOCOL.md` now tells a worker to read the fragment if it exists and the
  assembled entry in `CHANGELOG.md` otherwise, so the test is written right the first time.

- **A `#` inside a quoted frontmatter value is data, not a comment** (`project-template/.flow/bin/flow-state.mjs`, flow-0096). **Caller action: none** — the fix is strictly more permissive, and every value that parsed correctly before still does.

  `parseTask` stripped a whitespace-preceded ` # comment` from every scalar, quoted or not. A value that *starts* with a hash survived (`issue: "#157"`), but one carrying a hash mid-string did not: `blocked_reason: "waits on PR #127, not machine-checkable"` was read as `"waits on PR`. Downstream that truncated the sentence a human reads *and* threw away the `not machine-checkable` sentinel at the end of it, so a task that had opted out of flow-doctor's empty-`blocked_by` warning got warned about anyway. Quoted values are now taken whole up to their closing quote (single or double) with any real trailing comment dropped; only unquoted values have ` # comment` stripped. The reader is exported as `scalarValue` for direct testing.

- **flow-recover un-sticks a task whose PR is open and out of draft**
  (`project-template/.flow/bin/flow-recover.mjs`, `.github/workflows/_flow-recover.yml`,
  flow-0104). `classifyStranded` gains a `promote-in-review` outcome: an `in_progress` task whose
  open PR is **not** a draft, past the same staleness threshold the other outcomes use, has its
  store entry corrected to `in_review` with that PR's `pr` url and `branch`. An open **draft** PR
  still classifies `ok`, exactly as before. Only a PR from a branch in the same repository can promote a task: a fork PR titled `[<id>] …` is ignored.
  **No caller action** — a repo calling
  `_flow-recover.yml` by reference gets it at the next tag, and the `classify` subcommand's new
  `--open-pr-ready` flag defaults to `0`, so an older pinned caller behaves identically.

  Why this state existed at all: since flow-0039 a worker's PR opens as a draft and the task
  reaches `in_review` on `ready_for_review`, an event that cannot fire twice. A task
  hand-returned to `ready` and re-claimed while its PR was already out of draft therefore stayed
  `in_progress` for good — nothing was lost (flow-done still resolves it on merge) but the board
  was wrong about what was in flight. The sweep already queries `gh pr list` per in_progress task,
  so it reads `isDraft` and `url` from those same two calls and makes no extra request. It
  corrects the store only; it never touches the PR.

- **A scheduled `flow-sync` now adopts from the ref your callers are pinned to, not a hard-coded
  `v2`** (`.github/workflows/_flow-sync.yml`, `project-template/.github/workflows/flow-sync.yml`,
  flow-0105). **No caller action.** Repinning a repo becomes one change instead of two.

  The thin caller forwards `canonical_ref: ${{ inputs.canonical_ref }}`, which is empty on the
  weekly `schedule` — only a `workflow_dispatch` human ever filled it in. `_flow-sync.yml` then
  read `${{ inputs.canonical_ref || 'v2' }}`, so a repo whose callers pin anything else had its
  weekly sync pull `v2` content on top of non-`v2` workflows and say nothing: both halves work,
  they just disagree about which release the repo is on. The caller's own comment told the human to
  "bump `canonical_ref`", which is advice a cron run has no input to receive. Latent while the
  whole fleet pins `@v2`; it bites the first repo that does not — the progress canary on
  `v2-edge`, the next major, or the release-repo repin.

  When `canonical_ref` is empty the reusable now scans the checked-out repo's
  `.github/workflows/*.yml` and `*.yaml` for a `uses:` line calling
  `<owner>/<repo>/.github/workflows/_flow-sync.yml@<ref>` — any owner/repo, so a repin at a release
  repo keeps resolving — and adopts from the ref it finds, logging the file it came from. Two
  callers pinned at different refs **fail the job** with an error naming each file and its ref,
  because a half-finished repin has no safe reading. No caller pinning one at all falls back to
  `v2` with a `::warning::` that says so — the old behaviour, now visible rather than assumed. An
  explicit `canonical_ref` on a `workflow_dispatch` run still wins outright.

  If your `flow-sync.yml` caller carries a customised default
  (`canonical_ref: ${{ inputs.canonical_ref || 'v2-edge' }}`, the workaround `docs/
  repinning-a-consuming-repo.md` used to prescribe), you can **drop it** — the pin on that file's
  own `uses:` line now does the same job. Keeping it also works: an explicit input is still an
  override, so nothing breaks if you leave it in place.

- **One test now proves every task's changelog entry, and `task-writer` names it in the criterion**
  (`.flow/bin/changelog-fragments.test.mjs`,
  `project-template/.claude/skills/task-writer/SKILL.md`, flow-0107). **No caller action** — the
  test is canonical's own, and the skill change only affects how a task is written.

  Canonical tasks that ship something user-visible all carry the same criterion — `changes/<id>.md`
  exists and states the caller action — and nothing told the worker a test was owed for it.
  flow-0098 (#129), flow-0101 (#134) and flow-0102 (#135) each failed qa on it, and each fix was a
  near-identical hand-written one-off. The criterion is a property of the store, so it is now proved
  once for every task at once: `every claimed task that declares a changelog fragment has an entry
  stating its caller action` reads every task in `.flow/tasks/`, and for each one that has been
  claimed and declares `changes/<its-id>.md`, asserts the entry is non-empty and mentions a caller
  action. It reads entries through `changelog-entry.mjs`, so a release that folds the fragment into
  `CHANGELOG.md` and deletes it does not turn the check red on its own PR. A failure names the task
  id. `ready` and `blocked` tasks are skipped — neither has written a fragment yet.

  The pre-flight in `task-writer` now says, where the repo keeps a `changes/` directory, that the
  changelog criterion must name the test that proves it, and names canonical's. An adopting repo
  has no `changes/` directory and no such test, and the instruction is stated conditionally so it
  stays true there.

- **flow-triage allocates task ids through `allocate-task-id.mjs`, so it can never duplicate one**
  (`.github/workflows/_flow-triage.yml`, flow-0110). **No caller action** — the reusable workflow
  changes, so callers pick it up with the release; the new `flow_ref` input is optional and only
  read on GitHub Enterprise Server.

  Step 3 of the triage prompt told the model to create the ready task file "with the next id",
  which it picked out of its own checkout. That is the one allocation path that never re-derives
  the id after a refused push, and the duplicate lands cleanly: two tasks sharing an id have
  different filenames, so nothing is refused and flow-doctor only reports it afterwards, on `main`,
  by which time every open PR is red for a defect none of their authors can fix from a branch. It
  happened on 2026-09-30, when a triage run and a local session each created a `flow-0104` and a
  `flow-0105`. The prompt now creates task files **only** by running
  `allocate-task-id.mjs --write`, forbids choosing an id by hand or writing a task file any other
  way, and uses the id the allocator prints — which is already the id in the commit it pushed. The
  allocator it runs is canonical's own, materialised at this workflow's commit the way
  `_flow-gates.yml` materialises the gate's helpers (flow-0094, ADR-0008), so a repo that has never
  run flow-sync still gets it.

- **The queue runner's overlap guard works again** (`project-template/.flow/bin/pick-task.mjs`,
  flow-0111). `pick-task` read `touches` only as an inline array, and every real task file uses
  the block-sequence form, so every task parsed with empty `touches` and the "skip a ready task
  that overlaps an in_progress one" filter never fired. It now reads `touches` with
  `flow-doctor`'s `parseListField`, which handles both forms. Seen live in tanplan-platform on
  30 Sep, when the runner dispatched tanplan-0026 into tanplan-0022's files.
  **Caller action: none** — adopters get it at their next flow-sync.

- **The state-push retry no longer reports a conflict that is not there**
  (`.github/workflows/_flow-status.yml`, `.github/workflows/_flow-done.yml`, flow-0114). When the
  retry lost a race for `main` it re-fetched, re-applied its edit, and compared the task file's
  whole blob against the one it started from — so *any* other change to that file was called a
  `CONFLICTING EDIT` and the transition was dropped. The commonest such change is on the normal
  path of almost every task: a worker's last act is a handoff `notes:` entry on its own task file
  on `main`, and `gh pr ready` fires flow-status on the same file seconds later. Seen live on
  CandidDan/tanplan-platform#25, where `in_review` was lost and set by hand.

  The comparison is now per **field**. The run derives the set of frontmatter fields its edits
  actually write (`apply-board-edits.mjs` patches named fields only — `status`, `owner`, `branch`,
  `pr`, `priority`) and compares just those. A field still reading as it did at the starting tip is
  the run's to write, and the other actor's change survives because the retry re-derives from the
  new tip rather than merging a stale edit. A field another actor set to the value this run would
  write is the existing "already landed" no-op. Only a *written* field moved to some other value is
  a `CONFLICTING EDIT` — and the error now names the field and both values instead of just the file.

  Nothing flow-0059 deliberately excluded has been added: still no `pull`, `rebase`, `merge` or
  `--force`, and still `MAX_PUSH_ATTEMPTS=5` with a non-zero exit on exhaustion.
  **Caller action: none** — adopters call these reusables by reference and get it at their next
  flow-sync. A repo that was papering over the false refusal by re-running the check or setting
  `in_review` by hand can stop.

- **A sync PR is classified only when its content matches canonical at the `Canonical-SHA:` it
  claims** (`project-template/.flow/bin/flow-review.mjs`, flow-0115). The `SYNC PR` sentinel used
  to be granted on two facts an attacker controls: a `flow-sync/` branch prefix and a changed-file
  list inside the synced surface. Both prove *where* the files are; neither proves *where they came
  from*, and `.flow/bin/**` executes in the adopting repo's CI. The gate now checks the claim: it
  reads the `Canonical-SHA:` trailer `_flow-sync.yml` writes on the sync commit, fetches canonical
  at that exact object name, and compares every changed file with the file the sync would have
  copied over it (`.flow/bin/x.mjs` here against `project-template/.flow/bin/x.mjs` there).

  Every file matches → the sentinel and the fixed PASS line, exactly as before. Anything else — one
  file edited after the sync, no trailer, two different trailers, a fetch that failed — is **not**
  classified: the PR gets the ordinary task-less handling and all three reviewers read it in full,
  and the run summary names the files that disagreed. Fail-closed in the direction that costs a
  review, never in the direction that waves a diff through.

  The fetch is the only network call the review gate makes, and it sits behind *both* halves of the
  classification — a PR that is not on a `flow-sync/` branch, or that is but strayed outside the
  surface, never reaches it, so the per-PR cost of the gate is unchanged for everything else.

  **No caller action** — adopting repos get it through the `@v2` alias. Two things to expect once
  it lands: a sync branch built before flow-0075 carries no trailer and will no longer be
  classified (re-run flow-sync to rebuild it), and a sync PR that someone has hand-edited will now
  be reviewed in full rather than passed on the strength of its branch name.

- **The store-wide changelog test stops failing every PR while another task is in flight**
  (`.flow/bin/changelog-fragments.test.mjs`, flow-0116). `done` tasks are still checked
  store-wide. `in_progress` and `in_review` tasks are now checked only on their own branch, read
  from `GITHUB_HEAD_REF` or the local `flow/<id>-<slug>` branch, because a PR's checkout carries
  main's store while other tasks' fragments sit on their own branches. Canonical-only test.
  **No caller action**.

- **Agents show, don't tell** (`PROTOCOL.md` response style, new `.claude/skills/show-me/SKILL.md`,
  flow-0117). Fewest words; structured content as a table, tree, call stack, mermaid or diff; PR
  descriptions ordered TL;DR → one visual → criteria → human to-dos. The response TL;DR is now
  conditional: only past about 15 lines (PR descriptions keep theirs). **Caller action:** none —
  the protocol and skill arrive with the next sync; replace any local PR template that conflicts.

- **The queue runner now treats an `in_review` task as still in flight**
  (`project-template/.flow/bin/pick-task.mjs`, `project-template/.flow/PROTOCOL.md`, flow-0118).
  `pickTask` skipped a `ready` task only when its `touches` overlapped an `in_progress` one, so a
  task overlapping an open, unmerged PR looked claimable: observed in `CandidDan/inflight` on
  2026-10-01, where `inflight-0016` was dispatched against four files `inflight-0015`'s review-stage
  PR was about to rewrite. A review-stage PR has a live branch pointed at `main`, so for collision
  purposes it has not landed. `blocked` deliberately still does not count — no live branch, and
  `blocked_by` sequences it. Sort order, tie-breaks and the empty-result behaviour are unchanged,
  and both statements of the claim rule in `PROTOCOL.md` now name `in_review` alongside
  `in_progress`. **Caller action: none** — the queue-runner workflow calls `pick-task.mjs`
  unchanged, and adopting repos get the new behaviour at their next `flow-sync`. Expect one
  visible consequence: a PR left unmerged for days now holds back the `ready` tasks that overlap
  it, surfacing as a waiting item instead of as a merge conflict.

- **One flow-recover CLI, parameterised by store** (`project-template/.flow/bin/flow-recover.mjs`,
  `.flow/bin/flow-recover.mjs`, flow-0121). The template now exports
  `runRecoverCli(argv, { tasksDir, stdin, out })` — the whole CLI shell, taking the store to read —
  and both the template's own entry point and canonical's adapter are callers of it. The adapter
  previously hand-copied that shell, so it had none of flow-0104's `classify --open-pr-ready`,
  `ready-pr` or `promote`, and `promote-in-review` could never fire in canonical's own sweep:
  the unknown flag arrived as `0` and the missing subcommand printed nothing, both
  indistinguishable from a healthy "no ready PR". **No caller action** — subcommand output,
  flags and exit codes are unchanged, and a repo that adopts the template's helper directly was
  never affected. A repo that maintains its own adapter over `flow-recover.mjs` (canonical's
  pattern, for a store the template cannot resolve) should replace its copied CLI with one call
  to `runRecoverCli`; leaving the copy in place keeps working and keeps drifting.

- **Three changelog checks read their entry the release-safe way**
  (`project-template/.flow/bin/flow-recover.test.mjs`, `project-template/.flow/bin/flow-review.test.mjs`,
  `.flow/bin/sync-skills.test.mjs`,
  flow-0123). flow-0081's, flow-0104's and flow-0115's canonical-only tests read `changes/<id>.md` directly,
  which the release-assemble check (flow-0090) showed would go red on the release PR. They now
  read through `.flow/bin/changelog-entry.mjs`. No caller action needed: all three skip outside
  canonical.

- **Canonical's queue runner starts again** (`.github/workflows/flow-queue-runner.yml`,
  `.flow/bin/adapters.test.mjs`, flow-0124). flow-0080 gave the reusable's schedule-gate job
  `actions: read`, but canonical's own caller did not grant it, so every dispatch was refused at
  startup. The caller now grants it, and the caller-permissions test checks job-level grants as
  well as top-level ones. No caller action needed: the template caller already grants it.

- **flow-0105's changelog check reads its entry the release-safe way**
  (`.flow/bin/sync-default-ref.test.mjs`,
  flow-0126). The test read `changes/flow-0105.md` directly and went red on the 3.0.0 release PR
  (#172) once the fragment was assembled. It now reads through `.flow/bin/changelog-entry.mjs`.
  The release-assemble check (flow-0090) missed it because the test needs `yaml` and skips in the
  flow-tooling job; only the gate job runs it. No caller action needed: canonical-only test.

## 2.2.0 — 2026-09-30 (tagged `v2.2.0`)

**MINOR: the review gate stops passing work it did not read, and a repo can size it to its own
PRs.** A PR whose diff exceeds the review limit now fails all three review checks, not just qa
(flow-0101 in the prompts, flow-0103 in code). The limit is now per repo: set
`review.max_diff_bytes` in `.flow/config.yml` on `main` (flow-0100). Separately, a repo can list
top-level folders that are not source in `source_roots_ignore:` instead of patching flow-doctor
(flow-0102). No caller action, but **a repo that opens PRs over 300 000 bytes of diff should set
`review.max_diff_bytes` on `main` before moving to this release**, or those PRs go red on every
review check.

- **A repo can now set its own review diff limit** as `review.max_diff_bytes` in `.flow/config.yml`
  (`project-template/.flow/bin/flow-review.mjs`, flow-0100). **No caller action** — a repo opts in
  by setting the key, and an unconfigured repo keeps the 300 000-byte default it already had.

  The limit was fixed fleet-wide in everything but name: `REVIEW_DIFF_MAX_BYTES` was read by the
  helper, but no reusable workflow passes it, so 300 000 was the only value a consuming repo could
  have. A repo that legitimately opens large PRs — generated docs, fixtures, a vendored bump — went
  red on work the reviewers were never handed, with nothing to change. Reported from
  tanplan-platform: a 789 KB diff cut at 300 KB, and qa correctly refusing to pass what it could
  not read.

  The effective limit is resolved from `REVIEW_DIFF_MAX_BYTES`, then `review.max_diff_bytes`, then
  the default, and the plan's run summary now states the number **and** which of the three produced
  it. Two bounds come with it: a value that is not a positive whole number of bytes, or is above
  2 000 000, fails the plan step with an error naming the key and the value rather than silently
  falling back; and the key is read from the **base** branch's copy of `config.yml`, like
  `review.security_paths`, so a PR cannot raise the limit on its own diff. Raising it costs — all
  three reviewers read the diff on every PR — so set it to fit the PRs you actually open.

- **All three review gates now refuse to PASS a truncated diff** (`.github/workflows/_flow-review.yml`,
  flow-0101). **No caller action** beyond picking up the release.

  The qa, code-review and security prompts read the same byte-bounded `.flow-review/diff.patch`,
  but only qa was told to react when the helper stamped a `DIFF TRUNCATED` marker into it. On an
  oversized PR the other two could return PASS on a partial read, which a human reads as a full
  review. All three now carry the same instruction, verbatim: a truncated diff must not PASS, and
  the verdict must name the truncation. The diff limit itself is unchanged.

- **A repo can declare which top-level folders are not source, in `source_roots_ignore:`**
  (`project-template/.flow/bin/flow-doctor.mjs`, `project-template/.flow/config.yml`, flow-0102).
  **No caller action** — the key is optional and ships empty; a repo opts in by setting it, and can
  then drop any local `ROOT_IGNORE` patch at its next flow-sync.

  flow-doctor fails a top-level folder that holds source-extension files, is not declared in
  `source_roots:`, and is not in `ROOT_IGNORE` — and `ROOT_IGNORE` was hard-coded in
  flow-doctor.mjs, so a repo with a deliberately ungated `docs/` or `holding/` could only go green
  by patching Flow's own code, which the next flow-sync overwrote. `source_roots_ignore:` in
  `.flow/config.yml` is the repo's half of that set: bare top-level folder names, each treated
  exactly as a `ROOT_IGNORE` entry everywhere flow-doctor consults it. An entry holding a `/` or a
  glob character, or naming a folder that is not there, is a warning naming the entry and exempts
  nothing — never fatal. The undeclared-tree failure now names the config key as the fix instead of
  `ROOT_IGNORE`.

- **The review gate now fails closed when the diff was truncated**
  (`project-template/.flow/bin/flow-review.mjs`, `.github/workflows/_flow-review.yml`, flow-0103).
  **No caller action** beyond picking up the release — but read the paragraph below first if this
  repo routinely opens large PRs.

  A PR whose diff exceeds the review limit now **fails all three review checks** (qa, code-review
  and security), whatever the reviewers wrote. Until now `verdict` took a PASS at face value even
  when `plan` had clipped the diff, so the rule "do not approve what you could not read" lived
  entirely in the three prompts (flow-0101) — and a prompt is an instruction, not a gate. On the
  run that prompted this, qa refused a 789 KB diff cut at 300 KB while code-review and security
  passed it, and the two green checks were read as a full review.

  **If your repo routinely opens PRs larger than the limit, set `review.max_diff_bytes` in
  `.flow/config.yml` (flow-0100) before taking this release** — otherwise those PRs go red with
  nothing wrong with them. The failure names both ways out: raise the limit, or merge past the
  check as a deliberate human decision that the diff was not fully reviewed. There is no override
  label and no switch to disable the rule; merging past a red check is the override, and it is
  visible.

  Mechanically: `verdict` takes a required `--diff-truncated true|false`, which `_flow-review.yml`
  passes to all three checks from the plan job's own `diff_truncated` output — never from
  `.flow-review/`, which the reviewer itself writes to. A missing or non-boolean value fails the
  check rather than defaulting. The failure quotes the kept and full byte counts, and a FAIL
  verdict still reports the reviewer's own findings alongside the truncation.

## 2.1.3 — 2026-09-30 (tagged `v2.1.3`)

**PATCH: the review gate agrees with `touches-guard` about which file is the task.** A repo whose
task filenames do not carry the project prefix had its qa check fail on every task PR. No caller
action.

- **The review gate finds a task by its frontmatter `id` when no filename carries it**
  (`project-template/.flow/bin/flow-review.mjs`, flow-0099). **No caller action** beyond picking
  up the release.

  `findTaskFile` matched only `<id>-<slug>.md` or `<id>.md`, which is canonical's own naming. A
  repo that names task files `0021-<slug>.md` and keeps `id: "tanplan-0021"` only in frontmatter
  got `NO TASK FILE RESOLVED` in `task.md`, so qa failed every task PR there, while
  `touches-guard` (which reads frontmatter) resolved the same task. The filename match still runs
  first and is unchanged; the frontmatter scan runs only when it finds nothing, skips
  `_TEMPLATE.md`, and skips a file it cannot read instead of throwing.

## 2.1.2 — 2026-09-29 (tagged `v2.1.2`)

**PATCH: stops alias moves from breaking the fleet, and fixes the source-root and queue-runner
failures 2.1.0/2.1.1 exposed.** The headline is flow-0094: the reusable workflows now run
canonical's own helpers from their own commit, so a repo that has not synced yet can no longer be
left without a helper its workflow calls. flow-0097 makes `source-root` jobs install dependencies
for `runtime: node` and stops re-running checks the primary gate already covers. flow-0093 and
flow-0095 let the queue-runner worker push and open PRs with `FLOW_PAT` in every repo (caller
action: sync, and set `FLOW_PAT` with the permissions in the entry below). Also shipped here but
omitted from 2.1.0's notes: flow-0049 (#113), the queue-runner failure summary now states the
run's actual outcome. Rollback: `git tag -f v2 v2.1.1 && git push -f origin v2`.

- **The watchdog's "last successful run" is now the newest success, not whatever GitHub returned
  first** (`flightdeck/bin/watchdog.mjs`, flow-0065). **No caller action** — the watchdog runs on a
  schedule in canonical and picks this up on its next sweep.

  Both run lookups asked GitHub for `per_page=1` and trusted `workflow_runs[0]`, on the strength of
  the list-runs endpoint documenting a `created_at` descending default. It is not always descending:
  [Nudge#289](https://github.com/CandidDan/Nudge/issues/289) reported a last successful run of
  `2026-09-07T18:04:59Z` for `flow-queue-runner` when the newest success was `2026-09-16T18:05:13Z`
  — wrong by nine days, and read by a human as a week-long outage that never happened. A one-item
  page is what made it undetectable: there is no second element whose timestamp could contradict the
  first.

  Both lookups now request one page of 100 runs and select the maximum `created_at`. That is the
  API's largest single page, so it costs no extra request — rate limits count requests, not rows —
  and a workflow with no success in its most recent 100 runs is dead by any definition the watchdog
  has. A run carrying no parseable timestamp is skipped rather than coerced, so a workflow that has
  never succeeded still reports `never` rather than a 1970 epoch date.

- **The queue-runner's worker now pushes and runs `gh` as `FLOW_PAT`, so it can land tasks that
  touch workflow files** (`.github/workflows/_flow-queue-runner.yml`, flow-0093). **Caller action:**
  if your `FLOW_PAT` was issued before this change it almost certainly lacks `Workflows: Read and
  write` and `Issues: Read and write`. Regenerate it with the four permissions now documented in
  `docs/flow-reusable-workflows.md` (fine-grained, this repository only, short expiry) and update
  the repo secret.

  The worker held `FLOW_PAT` for the action's own API calls, but its `git push` authenticated with
  whatever `actions/checkout` persisted — `GITHUB_TOKEN`. GitHub refuses any `GITHUB_TOKEN` push
  that changes a file under `.github/workflows/`, server-side, however `permissions:` is written,
  because `workflows` is not one of `GITHUB_TOKEN`'s grantable permissions. So a worker on a task
  whose `touches` named a workflow file could not push at all, and setting `FLOW_PAT` did not help.
  The checkout now takes `token: ${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}`, and the worker
  step exports `GH_TOKEN` from the same expression so `gh pr create`, `gh pr ready` and
  `gh issue create` authenticate too. Unset, both fall back to `GITHUB_TOKEN` and behaviour is
  exactly as before.

  `FLOW_PAT`'s required permissions are now written down once, in `_flow-open-pr.yml`'s header and
  in `docs/flow-reusable-workflows.md`, with which workflow needs each one;
  `.flow/bin/flow-pat-forwarding.test.mjs` parses both copies and fails the gate if they drift. The
  docs also record that the "Allow GitHub Actions to create and approve pull requests" repository
  setting is **not** the fix and should stay off: it only widens `GITHUB_TOKEN`, and a PR created by
  `GITHUB_TOKEN` triggers no downstream workflows, so `flow-gates` and the three review checks
  would never run on it.

- **The gate now runs canonical's own helpers, fetched at the same commit as the workflow that
  calls them** (`.github/workflows/_flow-gates.yml`, flow-0094). **Caller action: none.**

  A repo adopts the two halves of Flow on different clocks: a reusable workflow changes for every
  pinned repo the instant an alias moves, while the `.flow/bin/` helpers it invokes are files in
  that repo and change only when its `flow-sync` PR merges. Any release that made a reusable need a
  new helper therefore broke every pinned repo until it synced — 2.1.0 (`source-roots.mjs`) and
  2.1.1 (`check-claude-md.mjs`) did exactly that on 28–29 Sep 2026, and every `@v2` repo went red
  on every pull request for a reason unrelated to its own code.

  `_flow-gates.yml` now fetches canonical's `project-template/.flow/bin/` at `${{ job.workflow_sha }}`
  — the commit of the workflow file that defines the running job, not the caller's — and runs
  `source-roots.mjs`, `check-claude-md.mjs` and `touches-guard.mjs` from there. The workflow and
  the helper it needs ship as one unit, so moving an alias can no longer strand a repo without a
  helper, and the `".flow/bin/<x>.mjs is missing, run flow-sync"` branches are gone: that state is
  unreachable. `${{ job.workflow_repository }}` supplies the repo, so a fork of canonical gates
  against its own fork. On GitHub Enterprise Server, where the `job` context is unavailable, a new
  optional `flow_ref` input is the fallback; it defaults to empty and a moving branch is refused.

  Because a helper run from canonical is not in the tree it is judging, it now takes the repo root
  from **`FLOW_REPO_DIR`**, and **`FLOW_CI=1`** makes that variable required rather than optional —
  without it a helper would resolve its store from its own realpath, read canonical's fixtures and
  exit 0, which is a green gate over the wrong repo. With neither variable set the helpers behave
  exactly as before, which is what keeps a repo pinned to an older workflow tag working.

  `flow-doctor` and the `flow-tooling` test step deliberately keep running the repo's **own** copy:
  they exist to validate the synced state, and running canonical's copy would make them unable to
  fail for the reason they were added. `flow-sync` is no longer load-bearing for CI correctness —
  it is how a repo picks up its local tooling. The decision, the evidence for `job.workflow_sha`
  and the fallback's race are recorded in `docs/adr/0008-helpers-from-canonical.md`; the other
  reusables (`_flow-done`, `_flow-open-pr`, `_flow-queue-runner`, `_flow-recover`, `_flow-status`)
  are a follow-up with the same mechanism.

- **The template's `flow-queue-runner` thin caller now forwards `FLOW_PAT`, so flow-0093's fix
  actually reaches adopting repos** (`project-template/.github/workflows/flow-queue-runner.yml`,
  flow-0095). **Caller action:** adopt the updated caller via `flow-sync` (or add the single
  `FLOW_PAT: ${{ secrets.FLOW_PAT }}` line to your own `flow-queue-runner.yml` by hand), and set
  the `FLOW_PAT` secret with the four permissions documented in
  `docs/flow-reusable-workflows.md`.

  A reusable workflow receives only the secrets its caller passes. flow-0093 taught
  `_flow-queue-runner.yml` to check out and run `gh` as `${{ secrets.FLOW_PAT ||
  secrets.GITHUB_TOKEN }}`, and canonical's own caller forwards `FLOW_PAT` — but the template
  caller passed only `CLAUDE_CODE_OAUTH_TOKEN`, under a header asserting the reusable never used
  `FLOW_PAT`. So in every adopting repo the secret evaluated **empty inside the reusable** however
  the repo had set it, the `||` fell through to `GITHUB_TOKEN`, and the worker still could not push
  a change under `.github/workflows/` — the fix looked shipped and was a no-op everywhere but here.

  **Additive, not breaking.** The reusable declares `FLOW_PAT` with `required: false`, so a caller
  that does not forward it keeps exactly today's behaviour, and a repo with no `FLOW_PAT` secret is
  unaffected. Still passed **by name**, never `secrets: inherit` — the job runs an agent holding a
  repo-write credential, and naming is what keeps every *other* secret out of it.

  The caller's header is rewritten to say which secrets it forwards and why, that `FLOW_PAT` is
  optional, and what the worker cannot do without it (push a workflow-file change; open a PR or
  issue whose downstream checks actually run). It points at the one permission list rather than
  restating it. `.flow/bin/secrets-scope.test.mjs` — the single owner of "every caller forwards
  exactly the secrets its reusable declares" — fails the gate if the template caller and
  canonical's caller ever forward different secret names again.

### Fixed

- **`source_roots` jobs install the repo's dependencies before a `runtime: node` check.**
  (`.github/workflows/_flow-gates.yml`, `project-template/.flow/bin/source-roots.mjs`, flow-0097)
  **Caller action: none.** The
  `source-root` matrix job ran `actions/setup-node` and then the declared check with no install
  step, so a check as ordinary as `npm run lint` exited `127` in any repo whose linter is a
  devDependency — the repo had already declared `commands.install` and the job ignored it. It now
  runs that command in the repo root first, passed to the shell through `env:` like every other
  matrix value. `runtime: deno` and `runtime: none` are unchanged (`none` still means "the check
  provisions its own toolchain"), and a repo whose `commands.install` is absent or still
  `REPLACE-ME` gets no install step and still runs its check.

### Changed

- **A check the primary gate already runs is no longer run twice, including as one `&&` segment.**
  **Caller action: none** (see the next paragraph for repos that worked around it).
  `planSourceRoots` excluded an entry only when its `check` equalled a whole `commands.*` value. A
  repo whose `commands.lint` is `npm run lint && npm run typecheck`, with three `source_roots` each
  declaring `check: "npm run lint"`, therefore got three extra jobs re-running what the `gate` job
  had just run over the whole repo. A check that equals one `&&`-separated segment of a primary
  command now counts as covered. Deliberately narrow: only `&&` separates, segments match exactly
  after trimming (no substring or prefix matching), and `;`, `||`, pipes and subshells are parsed
  as ordinary text — so neither half of `a; b` or `a || b` counts as covered.

**Caller action: none.** Repos that worked around the missing install by folding one into every
`check` keep working — the check travels verbatim — and may simplify those checks at leisure.

- **Tests read a task's changelog entry whether it is still a fragment or already assembled**
  (`.flow/bin/changelog-entry.mjs`, flow-0098). **Caller action: none** — canonical-only test
  helper. `--assemble` deletes each `changes/<id>.md` by design, and tests that read the fragment
  directly turned every release PR's own gate red (2.1.0, 2.1.1, and 2.1.2 before this). The
  flow-0093, flow-0094 and flow-0095 changelog tests now go through `changelogEntry`.

## 2.1.1 — 2026-09-28 (tagged `v2.1.1`)

**PATCH: 2.1.0 turned every synced repo's `flow-tooling` check red. No caller action; the next
`flow-sync` fixes it.**

- **Synced tests no longer read files an adopting repo does not have** (`project-template/.flow/bin/flow-doctor.test.mjs`,
  `project-template/.flow/bin/source-roots.test.mjs`, `.flow/bin/adopter-layout.test.mjs`). **No caller action**:
  adopting repos pick this up on their next sync.

  flow-sync copies `.flow/bin/`, tests included, into every repo, and `flow-tooling` runs them there.
  2.1.0 shipped five tests that only pass inside canonical. Three read `.flow/intents/_TEMPLATE.md`,
  which flow-sync does not deliver (flow-0063, flow-0073). Two read canonical's own config or expect
  the template's `REPLACE-ME` placeholder, which a calibrated repo has replaced (flow-0077). Found
  on progress, the canary, after `v2` had already moved. They now skip, with the reason, outside
  the repo they are about.

  The class is now gated: `.flow/bin/adopter-layout.test.mjs` (canonical-only) copies the
  published template into a scratch git repo, removes what flow-sync does not carry, fills in the
  config, and runs every synced test there. Against 2.1.0's tests it reports exactly the five
  failures progress hit.

  Not fixed here: whether flow-sync should deliver the intent template at all. The intent-writer
  skill (flow-0072) will want it in every repo; that is a separate change.

- **The `CLAUDE.md` ceiling is now enforced, and measured against what a session actually loads**
  (`project-template/.flow/bin/check-claude-md.mjs`, `.flow/bin/check-claude-md.mjs`,
  `_flow-gates.yml`, flow-0050). **Caller action, two parts.** (1) Add `claude_md_max: <bytes>` to
  `.flow/config.yml` beside `coverage_min`, calibrated from `node .flow/bin/check-claude-md.mjs` in
  your own repo — without it the gate step prints the resolved total and a `no ceiling declared`
  warning and exits 0, so nothing is enforcing it. (2) A repo whose `CLAUDE.md` carries the
  `@.flow/PROTOCOL.md` import **without the file present** will now **fail** the gate naming the
  unresolved path, instead of loading a `CLAUDE.md` with no protocol in it and reporting nothing.

  `project-template/CLAUDE.md` has always told every adopting repo to keep itself "well under 25k
  characters (`wc -c CLAUDE.md`)". Nothing measured it — `CandidDan/Nudge` sat at 36,338
  characters, 45% over, with nothing reporting it — and the measurement it named was the wrong one.
  Line 11 of that same file is `@.flow/PROTOCOL.md`, a Claude Code **import**: the target is
  resolved and loaded into the context window in full at session start. So a repo can halve `wc -c
  CLAUDE.md` and *increase* the context it loads, by moving prose behind an import. Nudge's
  adoption PR does exactly that, honestly and with the arithmetic stated: 36,338 → 25,630 while the
  session gains the whole 23,753-character protocol. A byte-counting check would have called that a
  10,708-character improvement; it is a ~13,000-character regression. A check measuring file bytes
  is defeated on day one by canonical's own template.

  The check therefore measures the **resolved import set**: start at the repo-root `CLAUDE.md`,
  follow `@`-paths relative to the file containing them, transitively to Claude Code's limit of 5
  hops (a 6th hop is named in the output and not counted, because Claude Code would not load it
  either), count each unique file once, and sum the bytes. Imports inside inline backticks and
  inside fenced code blocks are not imports — Claude Code's parser skips both, which is why the
  template tells you to leave the pointer outside both. Over the ceiling fails with a per-file
  breakdown ordered largest-first, so the output names the file to cut; at or under it prints the
  total and the headroom. No `CLAUDE.md` at the root at all is a **failure**, not a pass, the same
  rule `build` and `lint` follow.

  The number is per-repo and the mechanism is not — deliberately the `coverage_min` shape, no
  second config idiom. Every Flow repo auto-loads a `CLAUDE.md` and suffers the same dilution, so
  enforcement is shared infra authored in canonical; the allowance cannot be shared, because a repo
  carrying generated routing tables needs a different one from a repo that does not. The template
  ships a calibrated default (`50000` — the protocol plus a ~25k allowance for project notes) and
  canonical declares `12000` against its own measured 6,935.

  What is being bounded is **adherence**, not window space, and the distinction is on the record so
  it does not get re-framed later: measured in a live session, `CLAUDE.md` was 14.2k tokens against
  a 1M window — 1.4%, with 75.7% of the window free. Nothing is running out. The cost of a large
  always-on instruction block is that every rule competes with every other rule for adherence, and
  that does not improve as windows grow.

- **The skipped `source-root` check no longer shows a raw `${{ matrix.path }}`**
  (`.github/workflows/_flow-gates.yml`, flow-0087). The `source-root` job is now named
  `source-root`, not `source-root (${{ matrix.path }})`. GitHub never evaluates a skipped job's
  name, and this job skips whenever the primary gate covers every `source_root`, which is the
  common case. So PRs showed a check titled `flow-gates / source-root (${{ matrix.path }})` that
  looked like broken templating. A job that runs still shows its matrix values: GitHub appends all
  of them in parentheses (`path`, `check`, `runtime` and the rest). **No caller action**, unless
  your repo made `source-root (<path>)` a required status check. In that case, update the rule to
  the new name.

## 2.1.0 — 2026-09-27 (tagged `v2.1.0`)

**MINOR: new backward-compatible capability, no required caller change.** New here: the intent
store and template (flow-0063, flow-0073), `source_roots` checks as a gates matrix (flow-0077),
the review gate planned from the base branch (flow-0079), the release repo's `vMAJOR` alias
mirror (flow-0045), and changelog fragments (flow-0069), plus the `flow-sync` fixes (0048, 0054,
0075, 0076, 0078). The entries below each state their caller action; the ones to read before
syncing are flow-0048 (the next sync PR proposes `.flow/PROTOCOL.md`), flow-0058 (check your pins
if `flow-init` onboarded you) and flow-0077 (an optional migration). `v2.0.0` is the rollback
point: `git tag -f v2 v2.0.0 && git push -f origin v2`.

- **`flow-sync` now carries `.flow/PROTOCOL.md`, so a protocol fix can reach the fleet at all**
  (`_flow-sync.yml`, `.flow/bin/sync-surface.test.mjs`, flow-0048). **Caller action: expect your
  next `flow-sync` PR to propose changes to `.flow/PROTOCOL.md` for the first time** — read that
  part of the diff rather than waving it through, because the protocol is the contract every
  session in your repo works under. No caller *edit* is required: the reusable's `workflow_call`
  inputs and its one declared secret are unchanged, so a pinned `@v2` caller needs nothing done
  to it.

  The copied surface was `.flow/bin/`, `.github/workflows/flow-*.yml` and the `.flow/VERSION`
  stamp. `flow-init` copies the protocol once, at adoption; nothing refreshed it afterwards, so an
  adopting repo's protocol was frozen at whatever version it adopted, permanently, through any
  number of syncs. That is not a documentation staleness problem — the protocol is the file that
  decides when a worker stops. 1.3.1 fixed a session-hygiene trip condition that fired on routine
  harness-side truncation, and until then every fresh worker in `CandidDan/later` claimed its task,
  ran one search, wrote a handoff and ended before implementing anything. The fix was released in
  canonical and could not reach that repo by any sanctioned route; it went in by hand as
  `CandidDan/later#14`, a knowing exception to the rule that repos adopt infra rather than patch it.

  Worse, the stamp moved without the content: a sync wrote the new version into `.flow/VERSION`
  while leaving the protocol alone, after which `flow-sync decide` — which compares stamps and
  nothing else — answered `current` and the repo stopped being told it was behind.

  **A repo that hand-patched its protocol should expect a no-op on any section already matching
  canonical.** This is a whole-file copy, not a patch: it cannot conflict, and it produces no diff
  for content that already agrees. Where a hand-patch diverged from canonical — a local wording
  change, or a fix applied differently — the sync PR proposes canonical's version, which is the
  intended direction. Anything in your protocol that you want to keep belongs upstream in
  canonical, not in your copy.

  `AGENTS.md` and `CLAUDE.md` stay excluded, and the copy step now says so in a comment naming the
  reason: each carries a `## Project notes` section holding context that exists nowhere else, so a
  blind overwrite would destroy it. The protocol has no such section, which is exactly why it can be
  mirrored and they cannot.

  The copy is guarded rather than bare. `canonical_ref` may be pinned to a release older than the
  split that created `project-template/.flow/PROTOCOL.md` (v1.0.0, v1.1.0 and v1.1.1 have none),
  and an unguarded `cp` would have aborted the whole sync for those callers under `set -e`. Those
  syncs now emit a `::warning` naming the ref and complete as before.

- **`flow-init` now derives its default canonical ref from canonical's `VERSION` stamp instead of
  a literal** (`project-template/.flow/bin/flow-init.mjs`, flow-0058). **Caller action: if your
  repo was onboarded through `flow-init` before this landed, check your callers' `uses:` pins —
  they say `@v1`.** Two ways to correct one, both already supported: re-run `flow-init` with an
  explicit `--canonical-ref v2 --force`, or simply let `flow-sync` run — it copies the template's
  `flow-*.yml` callers verbatim, and since flow-0056 those are pinned `@v2`, so the next sync PR
  repins the repo for you. No migration script, and nothing to do at all in a repo adopted from
  this release onwards.

  `DEFAULT_CANONICAL_REF = "v1"` survived the 2.0.0 re-cut. flow-0056 moved the ten published
  callers and `_flow-sync.yml`'s own checkout to `@v2`; this third reference stayed behind, and it
  governed the one path neither of those touches — a repo being onboarded for the first time. With
  no `--canonical-ref` and no `canonical.ref` in its config, `flow-init` wrote `@v1` pins into a
  repo whose `.flow/VERSION` it had just stamped `2.0.0`. The two halves of the release disagreed
  from the repo's first commit and nothing reported it, because a pin at a tag that still resolves
  is indistinguishable from a correct one.

  The default is now computed from the same `VERSION` file `buildPlan` copies to the new repo's
  `.flow/VERSION`, so the pins and the stamp agree by construction rather than by someone
  remembering to edit both. A repo adopted from a 3.0.0 canonical is born on `@v3` with no source
  change — which is the property the constant could not have, and the reason this is a derivation
  rather than the same literal relabelled `v2`. The stamp is looked up in priority order:
  `<--from>/VERSION`, then canonical's root `VERSION` (for the clone path, where the ref must be
  known before there is a checkout to read), then the `.flow/VERSION` beside the copy that travels
  into an adopting repo.

  It is still never a guess. If no stamp answers, there is no default: the run exits 1 naming
  `canonical.ref` and telling the caller to pass `--canonical-ref`, consistent with `flow-init`'s
  standing rule that it invents no config value. Precedence is unchanged — `--canonical-ref`
  beats `canonical.ref` in the config file, which beats the default — and an explicit ref is
  passed through untouched, never re-derived or reduced to a major.

  `--help` is part of the fix rather than cosmetics: its advertised default and its
  copy-pasteable JSON example are now rendered from the same resolved value a real run uses, so
  neither can quietly go stale while the code moves. A run that fell back to the default also says
  so, naming the stamp it derived from.

- **`flow-doctor` learns about `.flow/intents/`, and Flow ships an intent template**
  (`project-template/.flow/bin/flow-doctor.mjs`, `project-template/.flow/intents/_TEMPLATE.md`,
  `docs/adr/0007-intent-layer.md`, flow-0063). **No caller action** — a repo with no
  `.flow/intents/` directory gets one warning and nothing else, exactly as it already does for a
  missing `VISION.md`, and nothing that was passing starts failing.

  `VISION.md`'s G11 says work traces to a stated intent, and the protocol's headline sentence
  advertises "two touchpoints — approve the intent, approve the merge". One of those two had no
  implementation anywhere in the repo. This is the first of four slices: the store, the template
  that fixes its shape, and a validator with no teeth beyond shape.

  `.flow/intents/_TEMPLATE.md` carries `id`, `title`, `status`, `created`, `source` (whose words
  the Problem section holds), `approved_by`/`approved_at` (written by CI from the merge, not by
  hand) and an append-only `evidence: []` of paths to separate evidence records. Its success
  section is **Outcome**, defined in the template itself as an external observable change rather
  than a delivered artefact. `flow-init` copies it into new repos with the rest of `.flow/`.

  `flow-doctor` reports malformed intent frontmatter, missing required fields and duplicate ids as
  PROBLEMS; a malformed `evidence` as a WARNING; and `approved_by`/`approved_at` not at all — an
  intent is unapproved by definition while its PR is open. `_TEMPLATE.md` is excluded, as it is in
  `.flow/tasks/`. `docs/adr/0007-intent-layer.md` records the grandfathering decision
  (forward-only), the teeth decision (none in this slice), the deferred triage collision, the
  evidence-linkage decision, and the deferred validation contract — each as a decision with its
  reason rather than as an omission.

- **Changelog entries are per-task fragments, and the release assembles them** (`changes/`,
  `.flow/bin/changelog-fragments.mjs`, `project-template/.flow/bin/release-guard.mjs`,
  `project-template/.flow/PROTOCOL.md`, `docs/flow-versioning-policy.md`, flow-0069). **No caller action** —
  no reusable workflow, input or secret changed, and a consuming repo has no `changes/`
  directory, so nothing about this reaches the fleet.

  This is a queue fix wearing a changelog's clothes. `touches` is what `pick-task` uses to keep two
  sessions out of the same files: a `ready` task whose `touches` overlap an `in_progress` task's is
  skipped. `CHANGELOG.md` is append-only, so every task that changed anything declared it — and a
  path in *every* task's `touches` makes almost every task ineligible the moment any one is
  claimed. Measured on `origin/main` on 2026-09-23: 12 of the 23 open tasks listed `CHANGELOG.md`,
  including 9 of the 13 `ready` ones. Nothing was ever in genuine conflict; the whole queue was
  serialised behind a file every task only appends to.

  A task now writes `changes/<task-id>.md` and declares *that* in `touches`. Two tasks write two
  different files and never overlap. `node .flow/bin/changelog-fragments.mjs --assemble` folds
  every fragment into the existing `## Unreleased` section in ascending task-id order and deletes
  the fragments; `--check` lists what is pending and writes nothing. Assembly inserts rather than
  writing a numbered section, so the manual release fold stays the human's step and
  `release-stamp.test.mjs`'s `## Unreleased`-must-exist property is untouched. A changelog with no
  `## Unreleased` heading fails loudly and writes nothing, rather than inventing a section the
  release fold would never look at.

  `release-guard` closes the other half. A release cut without its notes is invisible: the change
  ships, the changelog does not mention it, and nothing in the release path ever says so. The guard
  now reports a **problem** when a release tag points at a tree that still contains fragments —
  scoped to a real release tag, because `main` carrying pending fragments between releases is
  exactly what the directory is for. A tree with no `changes/` directory, which is every consuming
  repo, reports nothing.

- **The intent template gains the four fields and three sections an interview actually produces,
  and flow-doctor gains three warn-only rules over them** (`.flow/intents/_TEMPLATE.md`,
  `project-template/.flow/intents/`, `project-template/.flow/bin/flow-doctor.mjs`, flow-0073).
  **Caller action: none, and nothing existing changes shape.** Every field is additive and every
  new rule is a warning, so an intent written against the flow-0063 template still validates
  exactly as it did. Adopting repos pick the new template up with `flow-sync`.

  flow-0063 shipped the intent store (slice 1 of the layer behind VISION.md's G11 — *work traces
  to a stated intent*). It deliberately left out everything the intent-writer interview needs
  somewhere to put. This fills that in:

  - **`serves: []`** — the VISION.md goal ids the intent advances, with the same ids, the same
    resolution rules and the same reserved `maintenance` id as a task's `serves`, so the anchor
    reaches past the task to the thing a human actually asked for.
  - **`supersedes: ""`** — the id of the intent this one replaces. An approved intent's body is
    never revised (ADR-0007), so a changed mind is a new intent naming the old one, and the old
    one's text stays exactly as it was written.
  - **A stated `status` vocabulary** — `proposed | approved | superseded`, those three and no
    others. `proposed` is still what the template ships as.
  - **The `[assumption]` marker** — a line beginning `[assumption]` (a list item counts) is
    detail the writer supplied that the human never said, written so the human can strike it or
    keep it. `## Problem` holds only the human's words and never carries one. This replaces the
    `ASSUMED:` convention flow-0072 had sketched; defining it in the template rather than in the
    skill means a hand-written intent and a skill-written one look the same.
  - **Cost of inaction, Constraints and Open questions** sections. The Open questions guidance is
    the load-bearing half: questions are *surfaced, never resolved* — a model answering its own
    open question converts an unknown into a decision nobody made, and an empty section is a
    claim that nothing is uncertain rather than a blank to be tidied away.

  A **worked example intent** ships alongside the template at
  `project-template/.flow/intents/newsletter-send-cadence.md`, filled in and `proposed`, carrying
  an `[assumption]` line and three open questions — the same role
  `project-template/.flow/tasks/0001-newsletter-signup.md` plays for tasks. Canonical's own
  `.flow/intents/` gets the template and no example.

  **flow-doctor** now also reports, all as warnings and never as failures: a `serves` naming an id
  VISION.md does not declare; a `status` outside the three values; and a `supersedes` naming an id
  no intent in the store declares. With no `VISION.md` the per-intent `serves` check is inactive
  and the existing single vision-inactive warning covers it — the same graceful-adoption posture
  the task side takes. `[assumption]` lines are never reported at any status, including
  `approved`: an intent can be approved with assumptions still standing in it, which is the whole
  reason they are marked. The layer keeps its no-teeth budget until slice 2, when tasks start
  depending on intents.

- **`flow-sync` no longer treats a leftover sync branch as an open PR** (`.github/workflows/_flow-sync.yml`,
  `project-template/.flow/bin/flow-sync.mjs`, flow-0075). **No caller action** — adopting repos pick
  this up on their next sync.

  The idempotency check read *the branch exists* as *a sync PR is open*, logged that claim without
  having looked, and exited 0. A sync PR closed without merging therefore left its branch behind and
  made that version permanently unofferable: every later run was a green no-op announcing a PR that
  did not exist, so a repo could sit behind canonical indefinitely with nothing reporting it. The
  only way out was deleting the branch by hand.

  The workflow now gathers three facts — does the branch exist, is there an **open** PR from it
  (`gh pr list --state open`), and which canonical commit its head records — and hands them to a new
  `flow-sync.mjs existing` subcommand, which answers `create`, `rebuild`, `refresh` or `noop`.
  `rebuild` (branch, no open PR) and `refresh` (open PR, stale head) both rebuild the branch from
  current canonical on current `main` and push it with `--force-with-lease`; `rebuild` then opens a
  fresh PR, `refresh` does not, because the open PR picks up the new head by itself. A closed PR
  stays closed and no branch is ever deleted.

  Two supporting changes. The sync commit now carries a `Canonical-SHA: <sha>` trailer recording the
  canonical commit it was built from — `.flow/VERSION` answers only *which version*, and
  `canonical_ref` is normally a moving branch, so the stamp alone cannot tell a current sync branch
  from one built from an older `v2`. A head with no trailer (every branch built before this change)
  counts as stale, so the worst case is one unnecessary rebuild. And every verdict now logs the facts
  it was reached from; a lookup that fails stops the run with an `::error` naming it, rather than
  degrading to a no-op that is indistinguishable from success in a log.

- **`flow-sync` keeps a customised caller instead of silently deleting its extra jobs**
  (`.github/workflows/_flow-sync.yml`, `project-template/.flow/bin/flow-sync.mjs`, flow-0076).
  **No caller action** — adopting repos pick this up on their next sync. A repo that has added jobs
  to one of its `flow-*.yml` callers will now see a `::warning` on that sync run and a **Kept:
  customised callers** section in the sync PR, and must reconcile that caller by hand (or move the
  checks into `.flow/config.yml`'s `source_roots`) to receive canonical's changes to it again.

  The caller-copy loop was `[ -e "$f" ] && cp "$f" .github/workflows/` — an unconditional overwrite.
  Callers are meant to be thin, but a repo that needs something the reusable cannot express adds jobs
  to its own: CandidDan/Nudge carried `edge-parse`, `mcp-build` and `mobile-check`, one per tree, and
  the 2.0.0 sync deleted all three while the PR body listed the file under **Modified** and said
  nothing else. `edge-parse` is the guard against a Deno parse error reaching production as a
  `BOOT_ERROR`; the last time it was absent that cost about seven days of dropped WhatsApp inbounds.
  A gate that stops checking while staying green is the failure this repo exists to prevent, and a
  sync was shipping it.

  The loop now asks before it overwrites. A new `flow-sync.mjs extra-jobs --local FILE --incoming
  FILE` subcommand prints the top-level job keys the local caller declares that canonical's template
  does not; any output at all means the copy would destroy work, so the file is left untouched, a
  `::warning` names it and every job that would have gone, and `pr-body` renders it under **Kept:
  customised callers** with the reason. Everything else copies exactly as before — including a caller
  that is new to the repo, which has no local file to lose.

  Two deliberate limits. "Customised" means **extra top-level job keys**, not a text diff: a diff
  against the *previous* template needs a version the sync run does not have, and a diff against the
  *incoming* one would flag every caller canonical legitimately changed. A caller that differs only
  in its `uses:` pin, a `with:` input or a job's contents is still overwritten. And the kept caller
  is kept **whole** — nothing merges canonical's changes into it, because keeping it as it is, and
  saying so, is the behaviour that can be explained in a warning.

- **`_flow-gates.yml` now runs every declared `source_roots` check as a matrix job** (`.github/workflows/_flow-gates.yml`,
  `project-template/.flow/bin/source-roots.mjs`, flow-0077). **Caller action: none to keep working once
  you sync this release; one optional migration.** The new `source-roots-plan` job needs
  `.flow/bin/source-roots.mjs`, which only arrives through `flow-sync`. A repo pinned to `@v2-edge`
  ran the new workflow before the helper existed there (progress #103, #104): its `source-roots-plan`
  check failed until this release's `VERSION` bump let `flow-sync` deliver the helper. Repos on `@v2`
  get both together. A repo that hand-wrote a job per
  extra tree can now delete those jobs and declare the trees in `.flow/config.yml` instead.

  `source_roots` has always declared every tree that holds source and the command that parses it, but
  nothing ran those checks — flow-doctor only proved each entry existed on disk. So a repo with a second
  runtime dropped out of the thin-caller model and hand-wrote a job per tree: near-identical jobs,
  unpushable by a worker credential (`.github/workflows/` needs Workflows: Write), and overwritten by the
  next `flow-sync`. Gating a tree is now a `.flow/config.yml` edit, which any worker can push.

  Two jobs do it. `source-roots-plan` runs `.flow/bin/source-roots.mjs plan`, which reads the config and
  emits a matrix; `source-root` fans out over it, sets up the entry's runtime and runs its check. An entry
  whose `check` is exactly one of `commands.build`, `.lint`, `.test` or `.coverage` is **left out**, because
  the `gate` job already runs that command — so a single-stack repo (and canonical itself) plans a count of
  zero and sees a **skipped** job, never a red one. Entries still holding the shipped `REPLACE-ME` sentinel
  are left out too, so a repo mid-adoption stays green.

  Three optional per-entry fields, each with a default: `runtime` (`node`, the default; `deno`; or `none`,
  meaning no setup step because the check provisions its own toolchain), `version` (defaults to `22` for
  node and `v2.x` for deno, ignored for `none`) and `retry` (0–3, default 0 — the check is attempted
  `1 + retry` times and the log names the attempt that succeeded). The cap is deliberate: an unbounded
  retry lets a check that is simply broken pass as merely flaky. Any other field is a hard error naming the
  entry and the field, rather than a silently ignored key. The check runs from the repo root exactly as
  written, so install steps belong inside it (`cd mcp && npm ci && npm run build`).

  `path` and `check` come from a file a PR can edit, so no `run:` block in the new jobs interpolates
  `${{ matrix.* }}` — the values reach the runner through `env:` only, and a test fails the build if that
  ever changes. `denoland/setup-deno` is pinned to a commit SHA like every other third-party action.

  The `source_roots` parser moved out of flow-doctor into the new shared helper, so there is one parser
  rather than two that drift. flow-doctor loads it optionally: a repo that bumped its workflow refs without
  syncing `.flow/bin/` gets one note and keeps every other store check, instead of a module-resolution
  stack trace. The plan job names that same state explicitly and tells you to run `flow-sync`.

- **`flow-init.test.mjs` now passes in an adopting repo, not just in canonical**
  (`project-template/.flow/bin/flow-init.test.mjs`, flow-0078). **Caller action:** if your repo's
  `flow-gates / flow-tooling` job is red on `flow-init.test.mjs`, syncing this release is the fix —
  no change on your side, and you no longer need to add `AGENTS.md` to go green.

  `project-template/.flow/bin/` is copied into every adopting repo and its tests run there, so a
  file in it has two homes: in canonical `<this dir>/../..` is `project-template/`, downstream it is
  **the adopter's own repo root**. The fixture built part of its fake canonical checkout from that
  path, so two of its forty tests were asserting on the adopter rather than on flow-init, and were
  permanently red in every repo that had adopted Flow — while canonical, which only ever ran them in
  place, reported them green. `CandidDan/Nudge#297` could not pass its own gate because of it.

  The two observed causes, both environmental rather than behavioural: the fixture copied the
  adopter's **live `.flow/board.html`**, which is already pointed at its own repo and, if it predates
  the `const REPO = "";` placeholder, offers `prepareBoard`'s anchored patterns nothing to rewrite at
  all (that is the real shape of Nudge's board — no `const REPO` declaration, not a stale one); and
  it copied the adopter's own **`CLAUDE.md`/`AGENTS.md`**, so "both host files ship" was a claim
  about a repo part-way through a 1.x → 2.x sync, which has no `AGENTS.md` yet. `flow-init.mjs` is
  unchanged: nothing was wrong with the tool.

  The fixture now writes its own board and both host files, so the assertions test flow-init's
  behaviour — the board is re-pointed at the repo being initialised and its task snapshot emptied,
  and both host files travel — and hold in any repo the file is copied into. The board assertions
  also lose their `if (existsSync(…))` guard, which previously let "no board here" pass by skipping.
  Canonical still runs the same forty tests, and that the real template ships `AGENTS.md` is still
  asserted, by `.flow/bin/protocol-portability.test.mjs` where it belongs.

  New in canonical only: **`.flow/bin/flow-init-downstream.test.mjs`**, the harness that would have
  caught this. It builds a minimal adopter layout in a temp directory — the template's `.flow/bin/`,
  `.claude/`, callers and `CLAUDE.md`, an adopter board with its own tasks and no `REPO` placeholder,
  no `AGENTS.md` — runs the copied test there in a child process, and fails if it goes red. The
  copied tests it covers are a one-line list, so extending it later is cheap.

- **The review gate is now planned and enforced from the base branch, so a PR can no longer
  narrow its own security review** (`.github/workflows/_flow-review.yml`,
  `project-template/.flow/bin/flow-review.mjs`, flow-0079). **Caller action: none** — the change
  is entirely inside the reusable workflow and the helper, and the thin caller is unchanged.
  Adopting repos get it by bumping the `_flow-review.yml` tag; running `flow-sync` as well is what
  turns on the new security floor, which lives in the helper.

  `plan` checked out the pull request and ran `node .flow/bin/flow-review.mjs plan` **from that
  checkout**, reading `review.security_paths` from `.flow/config.yml` in the same checkout. Both
  files were therefore controlled by the diff being reviewed. A PR could remove a glob from
  `security_paths` and, in the same diff, change a file that glob used to cover: the security
  review was then skipped "visibly", with a reason that read as a legitimate scoping decision. A
  PR could equally edit `flow-review.mjs` itself, including the `verdict` code that decides
  pass/fail. flow-0068 fenced PRs from forks; this was the same hole for PRs from inside the repo,
  which is every PR the queue runner opens.

  Each of the four jobs now materialises the **base branch** in a scratch git worktree under
  `RUNNER_TEMP` and runs *that* helper against *that* config — for `plan` and for each reviewer's
  `verdict` step, so the code that turns a written verdict into a red check comes from base too.
  Everything the gate reasons *about* still comes from the PR: the diff, the changed-file list and
  the task. A worktree rather than a `git show` of the single file, because the helper is not one
  file — it imports `touches-guard.mjs` and `parse-task-id.mjs`, and in canonical
  `.flow/bin/flow-review.mjs` is an adapter over `project-template/.flow/bin/`.

  That split needs one new environment override, **`REVIEW_REPO_DIR`**, which points the helper's
  git back at the PR checkout. It is the only pinned path that had no env escape, and without it a
  repo whose helper is an adapter (canonical's is) would diff base against itself and hand three
  reviewers an empty patch — a gate that passes having read nothing. `FLOW_CONFIG`,
  `REVIEW_OUT_DIR` and `REVIEW_TASKS_DIR` already existed and carry the rest.

  **A security floor**, applied regardless of `review.security_paths`: the security review always
  runs when the diff touches `.flow/**`, `.github/**`, `.claude/**`, `CLAUDE.md` or `AGENTS.md`.
  Those are the paths that decide what every gate does, and a repo scoping `security_paths` tightly
  to its product code is not thereby asking for its CI to be unreviewable. The run summary names
  the floor as the reason, distinct from a `security_paths` match, and the floor is deliberately
  not configurable — one a repo can lower is not a floor. Widening it is what `security_paths` is
  for. A skip now names both lists it was measured against.

  **Bootstrap**, for the repo adopting the review gate in the very PR that adds it: when the base
  branch carries no `.flow/bin/flow-review.mjs` or no `.flow/config.yml`, the PR's own helper is
  used, the security review is **forced on**, and a warning naming the bootstrap case is written to
  the run summary and published as a `bootstrap` output. Fail-closed, never a skip, never silent —
  and expected exactly once.

- **The release repo now carries the floating `vMAJOR` alias the fleet actually pins**
  (`flow-release-publish.yml`, `.flow/bin/release-publish.mjs`, flow-0045). **No caller action** —
  adopting repos still pin canonical; flow-0030 is the task that repoints them at the release repo,
  and this change is its prerequisite.

  `CandidDan/flow-protocol` held `main` and the exact version tags only — three refs, no alias —
  because the publisher pushes exactly one ref per release and `tagIsFree` refuses to move a
  `vX.Y.Z` that already exists. That is right for an immutable release tag, and it left the ref
  every adopting repo actually pins with no implementation on the release-repo side. Repointing a
  consuming repo's `uses:` lines at `.../_flow-gates.yml@vMAJOR` on the release repo would have
  resolved to nothing, in that repo's CI, with no local change to explain it.

  The alias is **mirrored from canonical's own `vMAJOR`**, on the `push` event that force-updates
  it (step 7 of the release procedure), and deliberately **not** advanced by publishing. An alias
  that followed every publish would delete the canary the two-alias split exists to preserve — the
  whole reason `vMAJOR` is a deliberate human act — one repository removed from where anyone would
  look for it. One human act now moves both aliases, instead of two acts in two repositories; this
  repo is the evidence that the second one gets forgotten, its own `v1` having sat 305 commits
  behind `main` for three and a half weeks.

  The immutable-tag rule is unchanged, and both rules are now pinned by tests against the same
  `ls-remote` output, so a later tidy-up cannot collapse them into one. The alias name is derived
  from `VERSION` rather than hardcoded, so a `2.0.0` stamp mirrors `v2` and leaves `v1` frozen. A
  release whose tag lands but whose alias does not now fails, with
  `decision=published-without-its-alias` in the verdict and in the job summary, rather than
  reporting success while every pinned caller resolves the previous release.

- **The review gate resolves the task id in code, and fences the fork boundary itself**
  (`_flow-review.yml`, `project-template/.flow/bin/flow-review.mjs`, `.flow/bin/flow-review.mjs`,
  flow-0068). **No caller action** — the reusable's `workflow_call` inputs and its one declared
  secret are unchanged, so a pinned `@v2` caller needs no edit.

  Two gaps in the same file, both inherited rather than authored.

  **The id.** CAN-52 established that a task id has two sources: a `flow/<id>-…` branch, and the
  `[<id>] …` PR title a cloud session falls back to when its harness hands it a `claude/…` branch
  it is told not to rename. `_flow-status.yml`, `_flow-done.yml` and `_flow-gates.yml`'s touches
  job all resolve it through `.flow/bin/parse-task-id.mjs`. `_flow-review.yml` invoked that helper
  nowhere: each reviewer was told, in prose, to go and find its own task file — a search performed
  by the thing being graded on the result, inside a prompt that also forbids reading the
  repository at large. The qa verdict *is* the criterion-to-test mapping, and a reviewer that
  never located the task still writes a well-formed `{"verdict":"PASS","unproven":[]}`. `verdict`
  is fail-closed against a **missing** verdict, not against one reached on missing evidence, so
  that read as a pass. `plan` now resolves the id from both sources and materialises the task as
  `.flow-review/task.md`, written in **both** outcomes — an unresolved task is the sentinel
  `NO TASK FILE RESOLVED` plus the sources that were tried, never an absent file a reviewer has
  to interpret. The resolved id is published as the `task_id` job output, so the run page states
  which task was graded. Resolving it adds no git call: the store is already on disk.

  **The fork.** Three jobs run `claude-code-action` with `--permission-mode bypassPermissions`,
  and the file's own header justified the absence of a fence by citing GitHub's behaviour — a fork
  PR gets no secrets, "so the reviewers cannot run there". They cannot *authenticate* there; they
  still started, checked out the PR head, and ran `.flow/bin/flow-review.mjs` **from that head**.
  Under `pull_request` the platform contains that, but the containment is a property of a file
  this workflow does not own: **the thin caller owns the trigger**, in the adopting repo, at a tag
  it has already pinned. A caller edited to `pull_request_target` — which looks like a fix for
  "our fork PRs get no review" — would hand fork-authored code to three `bypassPermissions` jobs
  holding `pull-requests: write`, `id-token: write` and a real `CLAUDE_CODE_OAUTH_TOKEN`, and
  canonical could not patch it downstream. `plan` now compares the head repo against the running
  one, so the fence holds whatever a caller does, and it sits on `plan` alone because the other
  three jobs already declare `needs: plan`.

  **A caller that supplies neither source gets its own sentinel.** The reusable workflow and
  `.flow/bin/` are versioned separately, so a repo that has run `flow-sync` but not yet bumped the
  workflow tag drives the new helper from an old caller that passes no `HEAD_REF` and no
  `PR_TITLE`. `_flow-review.yml`'s header already documents the opposite skew — new workflow, old
  helper — and fails loudly on it. This is the mirror, and it is reported honestly instead:
  `task.md` says `TASK CONTEXT UNAVAILABLE`, not `NO TASK FILE RESOLVED`, because "nobody told me
  what to look for" is not "this PR has no task", and the old prompts still tell the reviewer to
  locate the task itself. Where GitHub can fill the gap it does — the CLI falls back to the
  natively-set `GITHUB_HEAD_REF` for the branch; there is no equivalent for the PR title. Observed
  on this change's own PR, where the reviewers ran the pre-merge reusable from `main` against this
  helper from the PR head, and one of them reviewed without acceptance criteria as a result.

  **Not an author fence, and the tests hold that line.** `allowed_bots: "*"` stays, nothing
  inspects who triggered the run or what the branch is called, and `flow-review-workflow.test.mjs`
  still forbids the two authorship expressions *anywhere in the file* — including inside a
  comment, which is how this change first failed its own gate twice. The assertion was not
  loosened; the comments were reworded to describe those expressions instead of quoting them.

- **`flow-sync` no longer commits its own canonical checkout as a dangling submodule**
  (`_flow-sync.yml`, `.flow/bin/sync-checkout-isolation.test.mjs`, flow-0064). Canonical was
  fetched by a second `actions/checkout` at `path: .flow-canonical`. The repo being synced is
  checked out at the workspace root, so that path sat **inside its working tree**, and the
  `git add -A` further down staged it. Because the directory carries its own `.git`, git cannot
  store it as a tree — it records a **gitlink**, a submodule entry, and nothing writes the
  `.gitmodules` stanza that would make it valid. Both of the first two real sync PRs carried one,
  and every job afterwards ended `fatal: No url found for submodule path '.flow-canonical' in
  .gitmodules` with git exiting 128. Merging such a PR writes that entry into the adopting repo's
  history permanently, after which `git clone --recurse-submodules` fails outright for anyone.

  It had never been observable before: the push carrying it was rejected every time until
  flow-0060 fixed the checkout credential, so the gitlink never survived into a PR. Fixing the
  push is what exposed it — the second defect in a row surfaced by the layer above it starting to
  work.

  **A better `path:` could not fix it.** That input is documented as a relative path under
  `$GITHUB_WORKSPACE` and `actions/checkout` refuses anything outside it, so with two checkout
  steps the second tree is *always* inside the first. The step is therefore replaced by a plain
  `git clone` into `$RUNNER_TEMP`, which is not bound by that rule; `CandidDan/flow` is public, so
  no credential is involved, exactly as the step it replaces passed no token. An ignore rule was
  considered and rejected — it would leave a full second checkout of canonical sitting inside the
  repo being synced, one missed pattern away from the same commit. **No caller action:** the thin
  callers are unchanged.

- **A set-but-invalid `FLOW_PAT` no longer sails past the `flow-sync` preflight** (`_flow-sync.yml`,
  `.flow/bin/sync-permissions.test.mjs`, flow-0062). flow-0060 (below) added a first step that
  fails the run when `FLOW_PAT` is unset, naming the secret and **Workflows: Write** rather than
  letting the job die forty lines later at `git push`. It tests `[ -z "${FLOW_PAT}" ]` — which is
  **presence**. An expired token is present. A revoked token is present. A token lacking
  Workflows: Write is present. All three walked past the guard and hit the push anyway, with
  GitHub's opaque `refusing to allow a GitHub App to create or update workflow … without
  \`workflows\` permission` — the precise failure the step's own comment says it exists to prevent.
  This matters on a date, not in the abstract: a fine-grained PAT expires on a day chosen when it
  was created, GitHub does not warn the workflows that use it, and every repo sharing a token meets
  the gap on the same morning.

  The two failure classes are not the same shape and one check cannot cover both.
  **Expiry/revocation** is detectable up front, so a new `Probe FLOW_PAT validity` step makes one
  authenticated read (`GET /repos/{owner}/{repo}`) before the checkout that first uses the token,
  and fails with a message that says the token was **rejected as invalid** and that the fix is
  **rotation** — explicitly *not* flow-0060's missing-secret fix, which would send the reader the
  wrong way. **401 is the only fatal verdict**: a 5xx, a rate limit, an SSO block or a network blip
  warns and continues, because sending someone to rotate a working PAT is a worse outcome than the
  bug. **Scope is not detectable at all** — a fine-grained PAT exposes no scope-introspection
  endpoint, so Workflows: Write can only be tested by attempting the thing it authorises. The push
  *is* that attempt, and it was bare under `set -euo pipefail`; it now catches its own rejection
  and re-emits it as an annotation naming `FLOW_PAT` and Workflows: Write **alongside** git's text,
  which stays in the log as the primary evidence. flow-0060's absent-secret message is untouched
  and pinned byte-for-byte by a test, and `FLOW_PAT` stays `required: false` at the
  `workflow_call` boundary for the reason flow-0060 gave. The probe's verdict block and the push's
  failure branch are proved by **running the shipped shell**, not by reading it — every status code
  through the real `case`, and a `git` that refuses the way GitHub refuses.
  [caller action: **none for the workflow** — this is canonical-side only and arrives with your
  next `flow-sync`. But if your `FLOW_PAT` is near its expiry date, rotate it now: a fine-grained
  PAT with Workflows: Write, plus Contents and Pull requests (read and write), set as the
  `FLOW_PAT` secret on every repo that has adopted Flow. Tokens issued together expire together.]

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

- **A sync PR body lists the files the sync added, and can no longer deny its own diff**
  (`_flow-sync.yml`, `project-template/.flow/bin/flow-sync.mjs`, flow-0054). Sync PR bodies
  previously omitted every newly added file, and a sync whose whole payload was additions rendered
  as `version stamp only — no infra files differed` — an affirmative statement that nothing
  changed, printed beside a diff that added workflow files. **A repo that merged such a PR received
  more than its body listed.** **No caller action** — the reusable's inputs and its one declared
  secret are unchanged, so a caller pinned at `@v2` picks this up with no edit; the thin caller
  never carried the computation.

  `_flow-sync.yml` computed `CHANGED="$(git diff --name-only)"` on the line *before* `git add -A`.
  Without `--cached` that is the unstaged worktree diff, which covers tracked files only, so every
  file the sync had just created was still untracked and invisible to it. The commit and the push
  were always right — `git add -A` stages everything — and only the list handed to `pr-body` was
  wrong. The asymmetry is what kept it hidden: `rsync -a --delete` removes *tracked* files, so
  deletions were always reported correctly, and any fixture built from modifications and deletions
  passes against the broken code.

  The observed failure was the milder-looking and more dangerous of its two shapes. TanPlan#26, the
  first successful sync that repo ever had, carried 37 files — 22 modified, 15 added — and its body
  listed exactly the 22. Among the omitted fifteen: `.github/workflows/flow-compass.yml`, plus
  seven new `.flow/bin/` helpers. `version stamp only` against 6489 added lines is self-evidently
  absurd and a reviewer stops; a plausible 22-item list against a 37-file diff reads as complete and
  invites the skim. The body ends *"Review the diff, let the gate run, then merge"*, and this was
  the one touchpoint where a human decides whether to accept files that will execute in their CI.

  The list is now read from the staged tree after the add, as
  `git diff --cached --no-renames --name-status`, and the body groups **Added**, **Modified** and
  **Removed** with a count on each rather than flattening them — an added workflow is a different
  review question from a changed one, and a count makes a short list visible as a number rather
  than as an absence the reader has to notice. `version stamp only — no infra files differed`
  survives for the one case where it is true: the stamp is excluded from that decision, because
  `.flow/VERSION` is rewritten on every sync and an emptiness test alone could never fire. The
  proving tests lift the shipped shell out of `_flow-sync.yml` and run it against real git fixtures
  — a test that reimplemented the ordering could not detect the ordering being wrong.

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

## 2.0.0 — 2026-09-16 (tagged `v2.0.0` at `175b7d8` on 2026-09-27, after the fact: the commit `v2` carried from 2026-09-18 until 2.1.0)

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
