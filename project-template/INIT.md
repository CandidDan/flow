# Flow onboarding - Route A: clean repo

The greenfield route: a new or empty repo adopting Flow from scratch. (For an existing repo with
history, a tracker, and a populated CLAUDE.md, take Route B - see RETROFIT.md.)

Both routes converge after step 1: the work is "get the files in, calibrate the gate, register
with the flightdeck, run the loop." This route just seeds the first tasks from direction instead
of migrating an old tracker.

Run these as the orchestrator (a Cowork session) plus a couple of human GitHub steps. Anything
that pushes/merges/creates-repos is yours; everything else the orchestrator does.

## 1. Get the files in

- Create the repo from the **GitHub template** (*Use this template*), or copy `project-template/`
  into the repo. You now have: `CLAUDE.md` (protocol), `.flow/` (config, tasks, board, bin),
  `.claude/` (agents + skills), `.github/workflows/` (gates, status, done, triage, review,
  queue-runner), `.gitattributes`, `.gitignore`.

## 2. Calibrate `.flow/config.yml`  (the one genuinely per-project file)

Fill in, replacing every `REPLACE-ME`:
- `project.name` (also the task-id prefix), `language`, `description`.
- **The five commands** - `install / build / lint / test / coverage`. Each must exit non-zero on
  failure.
- **`source_roots`** - one `{path, check}` per source tree (just one for a single-stack repo).
  Every tree that holds source must be covered, or it's never parsed before production. Calibrate
  from what's actually in the repo (`.flow/bin/flow-doctor.mjs` will FAIL the gate if a top-level
  source tree is undeclared).
- **`coverage_min`** - measure it (run the coverage command once), set the floor at *measured
  minus a small margin*. It ratchets up, never silently down.
- **`security.focus`** - the project-specific scrutiny areas (authz, secrets, RLS, webhooks...).

## 3. The one stack-specific CI line

In `.github/workflows/flow-gates.yml`, replace the marked toolchain NOTE with your language's
setup action (e.g. `actions/setup-node@v4` + version; `setup-python`; `setup-go`). If your
coverage uses Node's `--test-coverage-*` flags, pin Node >= 22.

## 4. Set the board's repo

In `.flow/board.html`, set `const REPO = "owner/repo";` so the per-task "Work this ->" link
targets this repo's queue-runner.

## 5. Seed the first ready tasks

In a Cowork session, give direction; the **task-writer** skill decomposes it into `ready` tasks
(observable acceptance criteria, explicit scope + `touches`). Then regenerate the board with
**board-builder**. Commit the task files + board to `main` (the store lives on main).
> Capture half-formed ideas as **GitHub issues** instead - triage turns them into tasks later.

## 6. Gate-green the baseline FIRST

Before the first task runs, prove the gate is green on `main`: run the five `config.yml` commands
plus `node --test .flow/bin/*.test.mjs` and `node .flow/bin/flow-doctor.mjs`. Fix any baseline
infra (missing lint config, lockfile drift, an undeclared source_root) now - otherwise the first
task's author becomes the involuntary CI-plumber. (This lesson is the dearest one from Route B.)

## 7. Register with the global flightdeck

Append this project to `flightdeck/projects.yml`:
```yaml
  - name: "<project.name>"
    repo: "owner/repo"
    path: "<local path, or "" if not shared into a Cowork workspace>"
    enabled: true
```
Now it shows up in the portfolio digest and the live flightdeck artifact automatically.

The repo already ships `.claude/settings.json` pointing at the private Flow plugin marketplace
(`extraKnownMarketplaces`). Install it once so Cowork/orchestrator sessions can drive this repo:
`claude plugin install flow@flow`. This is what makes `task-writer`, `board-builder`, and the
`portfolio-manager` agent register and auto-trigger in a Cowork session - which does NOT
auto-discover the repo's local `.claude/` the way the worker does. The worker needs nothing here;
the gate runs from the repo's committed `.claude/` regardless. If you skip the install, task
creation still works from a Cowork session via the `CLAUDE.md` pointer (read the SKILL.md and
follow it) - the plugin just removes that step.

## 8. Run the loop

- Manually: `claude "Work the next ready task."` (one fresh session per task).
- Or enable automation: `claude setup-token` -> set the `CLAUDE_CODE_OAUTH_TOKEN` secret +
  `FLOW_AI=true` repo variable. That lights up triage, review, and the scheduled/board-dispatchable
  queue-runner. Start the schedule sparse; drive via the board's "Work this" link until trusted.

## Human-only steps (recap)

Create the repo; push/merge PRs; set the secret + variable; flip GitHub branch protection if/when
you move to an org (on a personal repo, leave it off - the gate still runs and you're sole merger).
