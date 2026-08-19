# Flow onboarding — Route A: clean repo (executable runbook)

**What this is.** The greenfield route: a new or empty repo adopting Flow from scratch. This
document is a *runbook*, not an explainer — an agent session can follow it top to bottom, stopping
to ask the human only where it genuinely must. (Existing repo with history and a tracker? Take
Route B — `RETROFIT.md`. The two converge from step 5.)

**Who runs it.** A Cowork or Claude Code session **scoped to the new repo** (not to canonical —
canonical sessions can't reach other repos). Anything that creates repos, changes repo settings,
or merges is the human's; everything else is yours.

---

## Rules for the agent running this

1. **Never invent a config value.** Every `REPLACE-ME` in `.flow/config.yml` is either derived from
   something observable in the repo or asked for. A guessed test command produces a green gate that
   proves nothing — the single worst failure mode in this system.
2. **Stop where the runbook says STOP.** Those are human decisions or human-only actions.
3. **Measure, don't assume.** `coverage_min` comes from running the coverage command once. The
   `source_roots` list comes from listing the repo, not from the stack's convention.
4. **Do not skip step 7.** A red baseline turns the first task's author into an involuntary
   CI-plumber, and you will not find out until a PR is already open.
5. **Report progress as a TL;DR + an ordered checklist of what the human still has to do**, per the
   protocol's response style.

---

## Step 0 — Collect inputs  [ASK THE HUMAN]

Ask for all of these in one pass, then proceed without further interruption until the next STOP.
Offer the defaults in brackets; only the first four have no sensible default.

**Project identity**
- `project.name` — short slug, also the task-id prefix (e.g. `acme` → tasks `acme-0001`).
- `project.language` — e.g. typescript, python, swift, go, ruby.
- `project.description` — one line.
- **GitHub `owner/repo`** for this new repo.

**The five commands** — install / build / lint / test / coverage. Each must exit non-zero on
failure. If the repo already has a `package.json`, `pyproject.toml`, `Makefile` or equivalent,
*propose* them from what's actually there and ask the human to confirm rather than asking cold.

**Canonical Flow source** — the repo the reusable workflows are referenced from.
- Canonical repo [`CandidDan/flow`]
- Canonical ref [`v1`]

> **Read this before accepting the default.** The thin callers below compile to
> `uses: <canonical repo>/.github/workflows/_flow-*.yml@<ref>`. GitHub only permits a **private**
> repo's reusable workflows to be called by repos owned by the **same user or organisation**. So if
> this new repo lives under a different owner than canonical — a business org, a client's org —
> the default **will fail on the first PR**, and the failure is a confusing "workflow not found",
> not a permissions message. In that case, first stand canonical up under the new owner (see
> *Canonical under a new owner* at the end) and use that here.

**Automation** [off initially] — whether to enable `FLOW_AI` (triage, review, queue-runner) now or
after the first few tasks land. Default off; recommend turning it on once the loop is trusted.

---

## Step 1 — Get the files in

Copy from canonical's `project-template/` at the ref you pinned (**not** from a working copy on
someone's laptop — it may hold uncommitted drift):

```bash
# from the new repo's root
CANON_REPO="CandidDan/flow"   # from step 0
CANON_REF="v1"                # from step 0
git clone --depth 1 --branch "$CANON_REF" "https://github.com/$CANON_REPO" /tmp/flow-canonical

cp -R /tmp/flow-canonical/project-template/.flow          .
cp -R /tmp/flow-canonical/project-template/.claude        .
mkdir -p .github/workflows
cp    /tmp/flow-canonical/project-template/.github/workflows/flow-*.yml .github/workflows/
cp    /tmp/flow-canonical/project-template/CLAUDE.md      .
cp    /tmp/flow-canonical/project-template/AGENTS.md      .
cp    /tmp/flow-canonical/project-template/.gitattributes .
```

**The protocol itself is not either of those two files.** It ships as `.flow/PROTOCOL.md` and
arrives with the `.flow/` copy above. `CLAUDE.md` and `AGENTS.md` are thin pointers to that one
copy — Claude Code imports it, other agents are told to read it — so the protocol is never
duplicated and never diverges between hosts. Keep both host files: an agent reads whichever one
its own convention names, and dropping one silently strands that agent with no protocol.

**Verify the Claude Code import actually resolved** — a pointer that fails does so silently, which
is the one failure mode worse than having no pointer:

```bash
grep -qx '@.flow/PROTOCOL.md' CLAUDE.md && test -f .flow/PROTOCOL.md && echo "pointer OK"
```

The import must sit outside backticks and outside code fences; Claude Code skips both when it
parses imports. In a live session, `/context` lists `.flow/PROTOCOL.md` under **Memory files**
once it has loaded.

Merge (don't clobber) `.gitignore` — it needs the `.flow/board-edits.json` line.

**Verify you have all nine workflows.** A short copy here is a silent hole later:

```bash
ls .github/workflows/flow-*.yml | wc -l   # must be 9
```

They are: `flow-gates`, `flow-status`, `flow-done`, `flow-open-pr`, `flow-recover`, `flow-sync`,
`flow-triage`, `flow-review`, `flow-queue-runner`.

**Re-point the callers** if you are not using the default canonical repo/ref:

```bash
# only if CANON_REPO/CANON_REF differ from the shipped default
sed -i '' "s|uses: CandidDan/flow/|uses: $CANON_REPO/|g"            .github/workflows/flow-*.yml
sed -i '' "s|_flow-\(.*\)\.yml@v1|_flow-\1.yml@$CANON_REF|g"        .github/workflows/flow-*.yml
grep -h "uses:" .github/workflows/flow-*.yml | sort -u              # eyeball the result
```

**Stamp the version** from the ref you actually pinned, so the drift check and `flow-sync` have a
truthful baseline:

```bash
cp /tmp/flow-canonical/VERSION .flow/VERSION
```

---

## Step 2 — Calibrate `.flow/config.yml`

The one genuinely per-project file. Replace every `REPLACE-ME`:

- `project.name` / `language` / `description` — from step 0.
- **The five commands** — from step 0. Monorepo: prefix with `cd <app-dir> && …`.
- **`source_roots`** — one `{path, check}` per source tree. List the repo's top-level directories
  and account for *every* one that holds source. A tree no command parses is never checked until
  production; `flow-doctor` FAILS the gate on an undeclared top-level source tree, so this is
  enforced, not advisory. If a tree genuinely shouldn't be gated, add it to `flow-doctor`'s
  `ROOT_IGNORE` rather than leaving it silently uncovered.
- **`coverage_min`** — run the coverage command once, set the floor at *measured minus a small
  margin*. It ratchets up, never silently down. Do not pick a round number you haven't measured.
- **`security.focus`** — the project-specific scrutiny areas (authz, secrets, RLS, webhooks, …).

**Lockfile stacks** (`npm ci`, `pnpm i --frozen-lockfile`, `poetry install --sync`): run the strict
install once locally after adding any dependency and commit the resynced lockfile. A half-updated
lock passes a lenient local install and fails the gate.

---

## Step 3 — The one stack-specific CI line

The `flow-*.yml` files are thin callers; the gate logic lives in canonical. The gate provisions
**Node 22** by default.

- **Node stack** → nothing to do.
- **Non-Node stack** → in `flow-gates.yml`, uncomment `with: setup_node_version: ""` and provision
  the toolchain inside the `.flow/config.yml` commands.
- **A stack needing a setup step the reusable gate doesn't model** → keep a full `flow-gates.yml`
  instead of the thin caller. Reference where it reaches, copy where it doesn't.

---

## Step 4 — Set the board's repo

In `.flow/board.html`, set `const REPO = "owner/repo";` so each task's "Work this →" link targets
this repo's queue-runner.

---

## Step 5 — Repo settings  [STOP — human only]

None of these can be done from a session, and **two of them fail silently if skipped**. Hand the
human this list and wait.

| # | Setting | Where | Why it matters |
|---|---|---|---|
| 1 | **Default workflow permissions → Read and write** | Settings → Actions → General | `flow-status`, `flow-done`, `flow-recover` and `flow-sync` push task state to `main`. Without this they fail at startup with `requesting contents: write, only allowed contents: read`. Loud failure. |
| 2 | **`FLOW_PAT` secret** — fine-grained PAT scoped to *this repo*, Contents: Read, Pull requests: Read/Write | Settings → Secrets → Actions | Without it the auto-PR paths fall back to `GITHUB_TOKEN`, and a PR opened by `GITHUB_TOKEN` **does not fire the `pull_request` event** — so `flow-gates` never runs and the PR is ungated. **Silent failure.** Adding it later is a no-break enablement. |
| 3 | **Private reusable-workflow access** | Settings → Actions → General → Access | Only if canonical is private and owner-level access is restricted. Allow the canonical repo. |
| 4 | *(optional, for automation)* `CLAUDE_CODE_OAUTH_TOKEN` secret + `FLOW_AI=true` variable | Settings → Secrets / Variables | Lights up triage, review, queue-runner. Generate with `claude setup-token`. Leave off until the manual loop is trusted. |
| 5 | **Branch protection** | Settings → Rules | **Org repos:** enable a Ruleset requiring `flow-gates`, with the Actions integration as a **bypass actor** — otherwise it blocks the bot's own state pushes to `main`. **Personal repos:** leave off — personal repos can't grant Integration bypass actors, so protection blocks `flow-status`/`flow-done`. The gate still runs on every PR; your merge discipline is the check. |

---

## Step 6 — Seed the first ready tasks

Give direction in a Cowork session; the **task-writer** skill decomposes it into `ready` tasks with
observable acceptance criteria, explicit scope, and a `touches` glob list. Then regenerate the board
with **board-builder**. Commit the task files + board **to `main`** — the store lives on main, and
this is the store's genesis (the same exemption task-state commits get).

Half-formed ideas go to **GitHub Issues**, not `.flow/tasks/`. Triage turns them into tasks later.
The worker never picks up an issue directly.

---

## Step 7 — Gate-green the baseline FIRST  [do not skip]

Before the first task runs, prove the gate is green on `main`:

```bash
# the five commands from .flow/config.yml
<install> && <build> && <lint> && <test> && <coverage>

# the Flow tooling's own tests, and the store doctor
node --test .flow/bin/*.test.mjs
node .flow/bin/flow-doctor.mjs
```

Fix every baseline problem now — missing lint config, lockfile drift, an undeclared `source_root`,
a wrong Node version. This is the dearest lesson from Route B: latent infra debt discovered one red
CI run at a time, by an agent that thinks it's failing at its actual task.

---

## Step 8 — Register with the flightdeck

Append to canonical's `flightdeck/projects.yml`:

```yaml
  - name: "<project.name>"
    repo: "owner/repo"
    path: "<local path, or "" if not shared into a Cowork workspace>"
    enabled: true
```

The project now appears in the portfolio digest and the live flightdeck artifact automatically.

The repo ships `.claude/settings.json` pointing at the Flow plugin marketplace
(`extraKnownMarketplaces`). Install it once so orchestrator sessions can drive this repo:

```bash
claude plugin install flow@flow
```

This registers `task-writer`, `board-builder`, and the `portfolio-manager` agent in **Cowork**,
which does *not* auto-discover a repo's local `.claude/` the way a Claude Code worker does. The
worker needs nothing here — the gate runs from the repo's committed `.claude/` regardless. Skipping
the install still leaves task creation working via the `.flow/PROTOCOL.md` pointer; the plugin just removes
a step.

---

## Step 9 — Verify end to end

Not "the files are in place" — *the loop actually runs*. Work through all four:

1. **Gate fires on a real PR.** Open a throwaway `flow/<id>-…` PR and confirm `flow-gates` runs and
   enforces build/lint/test/coverage + the store guard + the touches guard.
2. **Status transitions.** With that PR open, confirm the task flips to `in_review` with `branch`
   and `pr` recorded; close it unmerged and confirm it returns to `ready`; merge one and confirm
   `flow-done` flips it to `done` on `main`.
3. **Doctor is clean.** `node .flow/bin/flow-doctor.mjs` reports no consistency failures.
4. **flow-sync dry run.** Trigger `flow-sync` via `workflow_dispatch`. With `.flow/VERSION` equal to
   canonical's it should report "up to date" and open nothing.

If (1) runs but (2) doesn't, the cause is almost always setting #1 or #2 in step 5.

---

## Step 10 — Run the loop

- **Manually:** `claude "Work the next ready task."` — one fresh session per task, never one long
  thread across the backlog. Context rot degrades quality across a queue.
- **Automated:** with `FLOW_AI=true` + the OAuth token set, the queue-runner picks the top ready
  task on a schedule. Start the schedule sparse and drive via the board's "Work this →" link until
  you trust it.

---

## Canonical under a new owner

Needed when the new repo isn't owned by the same user/org as canonical — a business org, a client.
Private reusable workflows cannot be called across owners, so one of these must happen first:

- **Fork canonical into the new owner** and point `CANON_REPO` at the fork. Highest control; you
  then own a second canonical to keep in sync, so decide deliberately which one is the source of
  truth and mark the other as downstream.
- **Make canonical public.** Simplest, and reusable workflows in a public repo are callable by
  anyone. Audit for secrets first and add a LICENSE — an unlicensed public repo grants no rights,
  which is worse than leaving it private if anyone else will touch it.

Either way, do **not** hardcode the ref in nine files per repo. Set an org-level Actions variable
(e.g. `FLOW_CANONICAL`) and have the callers read it, so re-pointing the fleet is one change.

Credentials should move with it: `FLOW_PAT` and `CLAUDE_CODE_OAUTH_TOKEN` as configured above are
tied to one person's account and subscription. For a business, use an org-owned GitHub App or
machine user and org-level Anthropic billing, or the fleet stops the day that person's token does.

---

## Human-only steps (recap)

Create the repo · everything in step 5 · merge PRs · decide when `FLOW_AI` goes on · approve the
`CLAUDE.md` / `AGENTS.md` project-notes merge if this was Route B.
