# Flow — project template

A foundation for projects where **Cowork orchestrates** and **Claude Code works**, with the
human as inspirator and validator. The handoff between the two isn't a doc you copy — it's a
live, in-repo task store both sides read and write. The board is your seat in the loop.

Mark this repository as a **GitHub template** (Settings → Template repository). Every new
project starts with *Use this template* — so the protocol, gates, agents, and board are there
from commit one, not bolted on later.

## What's in here

```
CLAUDE.md                     The protocol. The contract Code reads every session. Markdown,
                              because it's a tool-loaded config file — not a human-read surface.
.flow/
  config.yml                  The ONLY per-stack file: declares this project's test/lint/build/
                              coverage commands + coverage_min. The protocol is identical across
                              every project; only these commands differ. This is what makes
                              "test coverage regardless of tech stack" actually universal.
  VERSION                     The canonical Flow version this repo adopted. flow-doctor warns when
                              it falls behind canonical (set FLOW_CANONICAL_VERSION in CI to enable).
  tasks/                      The source of truth. One Markdown file per task: machine fields in
    _TEMPLATE.md              frontmatter (clean data, incl. `touches` for concurrency), spec in
    0001-*.md                 the body. This IS the handoff. 0001 is a worked example task.
  board.html                  Your glance + control surface. Drag to reprioritise/move, then
                              "Apply edits" writes .flow/board-edits.json (no clipboard).
  bin/
    apply-board-edits.mjs     The ONLY writer of task frontmatter from a board edit: reads
    apply-board-edits.test.mjs  board-edits.json, patches status/priority, leaves a git diff.
    flow-doctor.mjs           Drift detection for the store (back-ported from the canary repo's
    flow-doctor.test.mjs      state:check): consistency problems fail CI; drift warns.
    touches-guard.mjs         Fails a PR whose diff strays outside the task's declared
    touches-guard.test.mjs    `touches` globs — scope enforced, not just agent-reviewed.
    pick-task.mjs             Queue-runner brain: next ready task, no in-flight touches overlap.
    pick-task.test.mjs
                              All tooling ships with tests (node --test) — the DoD applies to it too.
.claude/
  skills/
    task-writer/                orchestrator discipline: how to write a *ready* task
    board-builder/              regenerate board.html from the task files
.github/workflows/            Thin callers of canonical's reusable workflows (authored once in
                              CandidDan/flow, adopted by reference — docs/flow-reusable-workflows.md).
  flow-gates.yml              CI: the gate from config.yml + the store-is-main-only guard +
                              the touches-guard (diff ⊆ declared scope) + the flow-tooling tests.
  flow-status.yml             PR open → `in_review` (+branch/pr); closed-unmerged → `ready`.
  flow-done.yml               On PR merge, flips the matching task to `done` on main.
  flow-triage.yml             Scheduled issue triage: propose → approve → ready task. Off by
                              default (FLOW_AI variable + CLAUDE_CODE_OAUTH_TOKEN secret to enable).
  flow-review.yml             The three Definition-of-Done review checks on every PR — qa,
                              code-review, and (conditionally) security. They run HERE, not in
                              the worker's session, so the work and its reviewer are never the
                              same context. Model + security trigger paths come from the
                              `review:` block in config.yml. Same off-by-default gate.
  flow-queue-runner.yml       Scheduled/dispatchable: picks a ready task → dispatches a fresh
                              worker through the loop. The board's "Work this" link targets it.
.gitattributes                Marks board.html / board-edits.json as generated (diff hygiene).
.gitignore                    Ignores the transient .flow/board-edits.json.
```

## Your three questions, answered

**Custom skills / agents / routines — yes, all three, with distinct jobs:**
- **Skills** shape *how Claude works*: `task-writer` (the orchestrator's definition-of-ready)
  and `board-builder` (data→view). They ship in `.claude/skills/` so they travel with the repo.
- **Agents** are the *gates*: qa, security, code-review subagents, invoked before every PR.
  The cross-project `portfolio-manager` lives one level up in the flightdeck.
- **Routines** are the *unattended cadence* — see below. They're configured in the product, not
  files in the repo, so they're documented rather than scaffolded here.

**Template GitHub repo — yes.** This is it. It's the right unit: per-project structure that's
identical everywhere, so the master agent can rely on the shape. (Template copies drift the
moment you improve the protocol or agents in one repo. Concrete trigger: **by the third project
on this template**, lift the skills + agents into a **Claude Code plugin** so updates propagate
without editing every repo — the protocol and gates are stable enough by then to be worth
centralising, and the back-port cost of three diverging copies is where the churn starts to bite.
Until then the template is the right, simpler unit.)

**Test coverage / QA / security on every project regardless of stack — built in.** The protocol
makes the Definition of Done non-negotiable; `config.yml` supplies the stack's commands so the
universal gate runs anywhere; CI enforces it independently of any agent's good behaviour; and
the qa/security/code-review agents are required before a PR opens.

## Onboarding - two routes
Adopt Flow into a repo by one of two named, repeatable routes (they converge after the files land):

- **Clean repo** (new/empty) -> **`INIT.md`**: use the template, calibrate `config.yml`, seed the
  first tasks from direction, gate-green the baseline, register with the flightdeck.
- **Backfill / migration** (existing repo, tracker, history) -> **`RETROFIT.md`**: the same, with a
  migration prefix (overlay the files, merge CLAUDE.md under the 25k budget, migrate the old
  tracker into tasks + issues) and a gate-green-the-debt-first pass.

Both end by registering the project in `flightdeck/projects.yml` so it appears on the global
flightdeck automatically. Hand either doc to a Cowork session as the orchestrator's instructions.


## Routines — making Code run without you holding things up
Routines run on Anthropic's infrastructure on a schedule or on GitHub events, with no local
machine or open IDE. Three worth setting up:
- **Queue runner** — `flow-queue-runner.yml` ships this: on a schedule it picks the top ready
  task (`pick-task.mjs`: highest priority, no `touches` overlap with in-flight work) and dispatches
  a fresh worker to the full loop. Manual `workflow_dispatch` with a `task_id` works one specific
  task now — and that's the hook the board's "Work this →" link uses, so you can pick a task on the
  board and one click scaffolds a worker. Off by default (FLOW_AI + CLAUDE_CODE_OAUTH_TOKEN); start
  sparse and widen the cadence once trusted.
- **Portfolio digest** — run the `portfolio-manager` on a cadence (e.g. each morning) to produce
  the cross-project "needs you" digest before you sit down.
- **Stale-task sweep** — flag tasks stuck `in_progress` or `in_review` too long, so nothing
  silently stalls.
- **Issue triage sweep** — `flow-triage.yml` already runs this on GitHub's scheduler (weekday
  mornings): proposals drafted onto issues, `approved`/`auto-ok` issues converted to ready
  tasks. Time it before the portfolio digest so the digest reports fresh triage results.

Run each task as its own fresh session — never one long thread across the backlog. Context rot
degrades quality across a queue; a clean session per task keeps every PR sharp.

## Capturing work — the inbox
You'll notice bugs and ideas at the worst times — mid-flow in a session about something else
entirely. Don't force them through the readiness bar at capture time, and don't dump them into
`.flow/tasks/` raw; both break the discipline that makes the queue trustworthy. Instead:

- **Capture → GitHub Issues** on the relevant repo, with whatever context you have in the moment.
  From any Cowork session that's one sentence ("log these three against the canary repo: …") once the GitHub
  connector is live — no context switch, no leaving the topic you're on.
- **Triage proposes; you approve.** The scheduled `flow-triage` sweep (weekday mornings, before
  the digest) drafts a full ready-task spec *as a comment on each issue* and labels it
  `proposed`. You approve by flipping the label to `approved` — one tap, works from a phone —
  and the next sweep creates the ready task (linked via `issue:`, issue labelled `triaged`).
  Nothing enters `.flow/tasks/` un-approved, so touchpoint 1 survives automation.
- **The `auto-ok` lane** is your pre-authorised fast path: label an issue `auto-ok` (typos, dep
  bumps, the genuinely mechanical) and triage converts it straight to a ready task, no proposal
  wait. Authority exercised as per-lane policy instead of per-item approval — only you apply it.
- **The flightdeck counts untriaged issues** per project as queue debt, so capture never silently
  rots in the inbox.

Issues are capture; `.flow/tasks/` is the only work queue. The worker never picks up an issue
directly — that rule is in the protocol.

**Branch protection (validated live, 2026-06-05):** required-status-check protection correctly
blocks red-gate PRs — but on **personal repos** it also blocks the flow-status/flow-done bot
pushes to `main` (personal repos can't grant Integration bypass actors). So: protection **off**
on personal repos — the gate still runs on every PR and you're the only merger, so the check is
your merge discipline. When the repo moves to a GitHub **org**, enable a Ruleset with the
Actions Integration as a bypass actor and you get both.

**Independent review on the way out.** Auto-triaged work especially needs eyes that aren't the
worker's: `flow-review.yml` runs a server-side Claude review on every flow PR — independent of
the worker's session, though not of the model family. For true model diversity, also enable
**GitHub Copilot code review** as an auto-requested reviewer (repo settings → rulesets; needs a
Copilot seat) — keep it *advisory*, not a required check: two blocking AI reviewers invites
deadlock-by-nitpick, and its comments land in the normal kickback flow anyway. Both `flow-triage`
and `flow-review` are **off by default**: enable with repo variable `FLOW_AI=true` plus a
`CLAUDE_CODE_OAUTH_TOKEN` secret — generate it with `claude setup-token` (Pro/Max plans), so
these runs draw on your subscription quota rather than API credits. Keep the merge (touchpoint 2) human until the system has earned
trust over a few dozen PRs; auto-merge for the `auto-ok` lane is a later, deliberate decision.

## Running more than one task at once
Several Code sessions can work in parallel. Coordination is git, not a lock: task-state lives on
`main`, claiming a task is an atomic commit-and-push (first push wins; a rejected push means
someone else claimed it, so the session rebases and picks the next), and every task declares a
`touches` glob list so a session skips any `ready` task that overlaps something already
`in_progress`. Feature code still goes branch → PR; only the state transitions commit to `main`.
The full rules live in `CLAUDE.md` → *Concurrency*. Practical implication: keep tasks
small-and-disjoint in their `touches`, and the queue runner can safely fan out.

Three mechanisms make this safe rather than hopeful, and they're enforced, not trusted:
- **The store is `main`-only.** A feature branch carries code, never `.flow/` changes — otherwise
  its frozen snapshot of a task file would clobber `main`'s newer state on merge. `flow-gates.yml`
  fails any PR whose diff touches `.flow/tasks/`, so the invariant holds on any platform without a
  merge driver.
- **PR events own the lifecycle.** `flow-status.yml` flips a task to `in_review` (recording
  `branch` + `pr`) when its PR opens and returns it to `ready` (cleared for re-claim) if the PR
  closes unmerged; `flow-done.yml` flips it to `done` on merge. Both read the id from the
  `flow/<id>-…` branch name.
- **Workers hand-write only two transitions:** the claim (which must stay an atomic
  first-push-wins commit) and `blocked` (a judgment call). Everything else is automatic.

## When the loop stalls — observability & debugging
The system is designed to be inspected with `git log` and a directory listing; there's no hidden
state. When something feels stuck:
- **Where the truth is.** `git log -- .flow/tasks/` is the audit trail of every claim, hand-off,
  and block — who moved what, when. The board is only a render of the current files.
- **Run the doctor.** `node .flow/bin/flow-doctor.mjs` validates the store in one shot —
  duplicate ids, illegal statuses, half-completed claims, in_review without a PR, stale board
  snapshot. CI runs it on every PR; run it locally whenever something feels off.
- **A stuck worker.** A task sitting in `in_progress` with no branch activity is the context-rot /
  crashed-session smell. The **stale-task sweep** routine surfaces these; recover by resetting the
  task to `ready` (clear `owner`/`started`) and letting a fresh session re-claim it. Kill the dead
  branch if one was started.
- **A stalled review.** `in_review` for too long means a PR is waiting on *you* — the portfolio
  digest leads with these so they don't rot silently.
- **A failed gate.** The PR's CI check (`flow-gates`) shows which command or agent failed; the
  agents write their verdicts into the PR, and the task's `notes` log captures kickbacks. Read the
  CI logs first (`get_logs` equivalent for your CI), then the agent verdict, then the diff.
- **A blocked task.** `blocked_reason` says why; it's a decision waiting on you, not a bug. Answer
  it, set the task back to `ready`, move on.

## What it costs
The gate isn't free, and that's deliberate — but spend it where it pays:
- **Per PR** you pay for up to three review checks plus a CI run. Each reviewer reads the **diff
  and its blast radius, not the whole repo** — a bound `.flow/bin/flow-review.mjs` materialises
  rather than merely asks for, which is what keeps per-PR cost bounded as the codebase grows.
- **Scope the heavy reviewer.** The security check earns its keep on diffs touching auth, external
  input, data access, or dependencies; on a pure copy/styling change it has little to chew on. List
  those paths in `review.security_paths` and it runs only when they change, saying so on the ones
  where it doesn't. Leave the list empty and it runs on every PR — unscoped is not off.
- **The model is config.** `review.model` (and optionally `review.security_model`) decide it, so
  tuning cost is a one-line edit here, never a patch to shared infra.
- **CI minutes** scale with PR volume, not project size, because each gate runs the same fixed
  command set from `config.yml`. Small, frequent, disjoint tasks (which the model already wants for
  concurrency) are also the cheapest to gate.
- **The expensive failure mode is a slipped PR**, not an agent invocation — a bad merge costs far
  more attention to unwind than the gate costs to run. The spend is the point.
