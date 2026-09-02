# Flightdeck

The control layer above your projects. One place to see every project's state and decide where
your attention goes — so running several projects in parallel doesn't mean holding five mental
models at once.

It's deliberately thin: projects don't depend on it. Each project runs its own loop with its own
`.flow/` store; the flightdeck just *reads* across them. Remove it and nothing breaks.

## The registry (`projects.yml`)
`projects.yml` is the authoritative list of projects the flightdeck reads across — what turns
"the global flightdeck" into a real thing rather than a scan-by-luck. Each project registers here
as the final step of onboarding (see `project-template/INIT.md` and `RETROFIT.md`): a `{name,
repo, path, enabled}` block. The `portfolio-manager` reads this list first and the live Cowork
flightdeck artifact iterates the same list — one registry, two consumers.

## Setup
- **Register projects** in `projects.yml` (onboarding does this for you). Each entry gives a local
  `path` (read directly when the repo is shared into a Cowork workspace) and/or a `repo`
  (read via the GitHub connector).
- **Cowork (simplest):** keep registered repos as sibling folders, share the parent into a Cowork
  session; the `portfolio-manager` reads each `path/.flow/tasks/`. If `projects.yml` is empty it
  falls back to scanning siblings for `.flow/tasks/`.
- **Git:** with the GitHub connector live, the agent (and the live artifact) read each registered
  `repo` directly — no local checkout needed.

## State aggregation (`bin/flightdeck-state.mjs`)

Cross-project state is produced by tested code, not by a prompt:

```bash
node flightdeck/bin/flightdeck-state.mjs                    # every enabled project, as JSON
node flightdeck/bin/flightdeck-state.mjs --registry <path>  # a different registry file
node flightdeck/bin/flightdeck-state.mjs --no-pr            # skip gh reconciliation
```

**It never reads task files.** For each enabled project it invokes *that project's own*
`.flow/bin/flow-state.mjs --json`, which resolves state from `origin/main` and reconciles each
task against its PR via `gh`. This matters: a local clone lags `origin` — cloud workers merge to
`origin/main` and the working copy only catches up when someone fetches — so a working-tree read
produces numbers that look fresh and are not. There is no working-tree fallback anywhere in the
aggregator, and a test asserts that against its source.

A project that cannot be resolved is reported explicitly rather than dropped, so the portfolio
never quietly shrinks. The causes: no registered `path`, the path is missing, the project has no
`.flow/bin/flow-state.mjs` (it predates the resolver), `origin/main` is unreadable, or
`flow-state` itself fell back to the working tree. The process still exits 0 — an unreachable
project is data you need to see, not a failure of the run. The one non-zero exit is an unreadable
registry, because "no registry" and "no projects" look identical in the output and mean opposite
things.

### Output shape

```jsonc
{
  "registry": "/abs/path/to/projects.yml",
  "projects": [
    {
      "name": "alpha",
      "repo": "owner/alpha",
      "path": "/abs/path/to/alpha",
      "status": "ok",
      "provenance": {
        "commit": "<full 40-char origin/main SHA>",
        "committed_at": "2026-08-18T09:12:44+01:00",   // strict ISO-8601
        "pr_reconciled": false                          // was `gh` available?
      },
      "tasks": [ /* flow-state rows, each stamped with "project": "alpha" */ ]
    },
    { "name": "beta", "status": "unavailable", "reason": "path does not exist: …", "tasks": [] }
  ],
  "summary": { "total": 2, "ok": 1, "unavailable": 1, "tasks": 12 }
}
```

`provenance` is what makes the number trustworthy: it names the exact commit the state was read
from, when that commit landed, and whether PR reconciliation actually ran. This layer only
produces it; rendering it — and showing disagreements rather than hiding them — belongs to the
cross-repo view, which per [ADR-0002 Amendment 1](../docs/adr/0002-flightdeck-projection-github-projects.md)
is now a page computed on open rather than a rendered artifact. `flow-0002` was that renderer
and is `blocked` as superseded; its disclosure obligation transferred, it did not lapse.

This command is unaffected by that change and is the portfolio's **offline** read: it needs a
local clone and `git`, not the network or a token, which is exactly what the computed page
cannot offer.

## Use
- "Where is everything / what needs me / portfolio status" → the `portfolio-manager` builds the
  digest and refreshes `flightdeck.html`.
- The digest leads with **Needs you now** (PRs in review, blocked items, failed gates across all
  projects), then in-flight work, then queue health (which projects are about to run dry).

## Mission control (`index.html`) — the primary, computed-live view

Per [ADR-0002 Amendment 1](../docs/adr/0002-flightdeck-projection-github-projects.md), the
primary answer to "where is every project up to, and is the automation alive?" is not a rendered
artifact or a synced board — it is `flightdeck/index.html`, a single self-contained page that
fetches live from `api.github.com` **at the moment you open it**, authenticated by a read-only
fine-grained PAT you paste in. It cannot go stale the way a generated file can, because it does
not exist until you look at it.

**Open it:** `open flightdeck/index.html` (or double-click it), paste a read-only fine-grained PAT
(scopes: Contents, Actions, Issues, Pull requests, Metadata — all read-only), press **Load**. No
other configuration — it asks the token who it is (`GET /user`) and discovers every repo carrying
the `flow` topic that account owns; you never type a username. "Remember on this device" is an
explicit opt-in that writes the token to this browser's `localStorage`; unchecked (the default),
the token lives in a page-local variable and is gone when the tab closes.

**Chromium's file:// module restriction.** `index.html` imports `bin/mission-control.mjs` and
`bin/liveness.mjs` as real ES modules (`<script type="module" src="...">`) — the same tested code
`npm test` runs, not a duplicate copy inlined into the page. Firefox loads local ES modules over
`file://` without complaint; Chrome and Edge apply CORS-style restrictions to `type="module"`
scripts loaded from `file://` and may show a blank page with a console error instead. If that
happens, serve the folder with any static file server. Either of these, run from the repo root,
works:

```sh
npx serve -l tcp://127.0.0.1:3000 flightdeck
python3 -m http.server --bind 127.0.0.1 -d flightdeck 3000
```

That is still "no server-side component" in the sense that matters here: nothing computes, stores,
or authenticates anything; it is a dumb static-file host standing in for a browser restriction, not
infrastructure.

Bind to `127.0.0.1` explicitly: both tools default to `0.0.0.0`, which would expose the page — and
the paste-a-PAT flow — to the rest of your local network, not just this machine. `serve`'s
`--listen` takes an *endpoint*, not a bare host: a plain port (`-l 3000`, which leaves it on
`0.0.0.0`) or a scheme-qualified URI (`tcp://`, `unix:`, `pipe:`). `-l 127.0.0.1` is not a valid
endpoint and fails with `Unknown --listen endpoint scheme (protocol): undefined` — the host has to
travel inside a `tcp://` URI, as above.

**Read-only, mechanically, not by policy.** Every call `mission-control.mjs` makes is a REST
`GET`. GraphQL was deliberately not used even though it would collapse some of the request count
below (batching a whole directory's file contents into one call) — every GraphQL call, including
a pure query, is an HTTP `POST`, and the page's one absolute rule (decision 2 of the ADR
amendment) is asserted by a **mechanical** scan of the source for write-capable HTTP methods
(`mission-control.test.mjs`). A semantic exception for "this POST is actually a read" is exactly
the kind of judgment call that check exists not to need, so the module stays REST-GET-only.

**Request budget.** A page load is capped at `DEFAULT_REQUEST_CEILING` (900) requests, tracked by
`createBudget()` in `bin/mission-control.mjs`. Per repo, the dominant costs are: 1 existence
check, 2 directory listings (`.flow/tasks`, `.github/workflows`) plus one GET per file in each
(task frontmatter and workflow YAML are both fetched individually — see "deliberately no
GraphQL" above), 1 optional `VISION.md` fetch, 1 registered-workflows list, up to ~2 run-history
calls per non-manual workflow, and 2 PR-list + 2 issue-list calls. A task-heavy repo with a dozen
workflows lands around 50-60 requests; the ceiling comfortably covers ~15 such repos with margin.
A portfolio that would exceed it stops loading further repos and shows a **visible** banner
naming how many were skipped and why — never a silent partial result.

**What it answers, per repo:** what's moving (`in_progress` tasks and open `in_review` PRs),
what's next (the top `ready` task by priority, plus how many more are queued — an **empty** ready
queue is shown as something needing attention, not a rest state), what needs you (`blocked`
tasks, `proposed` issues, open `compass` findings, PRs awaiting review), and the liveness matrix
for every scheduled and event-triggered workflow (see `bin/liveness.mjs` below) plus a dedicated
check for PRs that merged with no gate run against their head SHA — the `FLOW_PAT`-failure
silent-killer this whole task exists to catch. A repo with a `VISION.md` gets a collapsible
drawer: purpose, each goal's **activity** (done-in-30d / ready count / last merged — never a
percent-complete), non-goals with their reasons, and the change log; its only action is a link
to GitHub's own file editor on `VISION.md`, which is navigation, not a call this page makes.

**Never write scope, never a projection.** No mutation exists in this page's source, and nothing
it renders is written back anywhere — the same one-directional rule the original ADR held for a
Projects board applies here in a stronger form: not "writes are overwritten" but "no write scope
is held" at all.

## Liveness rules (`bin/liveness.mjs`)

Pure, IO-free functions answering "is the machinery alive?" — the question a Project board or a
task-store projection has no way to represent, because a scheduled workflow that stops running
emits no event. `classifyWorkflowTrigger` reads a workflow YAML's own `on:` block (never a
hardcoded list of workflow names) to decide whether it's `scheduled` (has a cron — liveness is
"is the last **successful** run recent enough for that cron's own interval", `crit` past 2× the
interval, `warn` past 1×, `good` inside it), `event` (fires on `pull_request`/`push`/etc. —
liveness is "did the latest run fail, or is the workflow disabled"), or `manual`
(`workflow_dispatch` only — no liveness expectation). A disabled workflow always reports `off`
with a reason; nothing in the matrix is ever a blank cell. `ungatedMergesLiveness` is the named
silent killer: a PR merged to `main` with no gate-workflow run against its head SHA. `flow-0020`
(the watchdog) imports this same module rather than re-deriving the rules — one implementation,
callable from wherever it's needed (VISION.md's NG5).

## The principle it protects
Inside one project, on the happy path, your job is two touchpoints: approve the spec, approve
the PR (kickbacks and blocked tasks add one only when the work genuinely needs a call). The
flightdeck keeps that shape across the whole portfolio — it tells you which projects are sitting
at one of those moments right now, and stays quiet about everything that's healthily in motion.
It recommends; it never reprioritises or invents work. Direction stays yours.

## Contents
```
CLAUDE.md                          how the cross-project layer works
projects.yml                       the registry: every project the flightdeck reads across
projects.example.yml               a worked example of the registry shape
bin/flightdeck-state.mjs           cross-project state aggregation (tested; origin/main only, offline)
bin/flightdeck-state.test.mjs      its proving tests
bin/liveness.mjs                   the liveness rules (pure, IO-free) — is the machinery alive?
bin/liveness.test.mjs              its proving tests
bin/mission-control.mjs            fetch + derivation for index.html (REST GET only, IO injected)
bin/mission-control.test.mjs       its proving tests, including the no-write-call source scan
index.html                         the primary computed-live cross-repo view (ADR-0002 Amendment 1)
.claude/agents/portfolio-manager.md the master read-across agent
flightdeck.html                    (generated) the offline cross-project board + "needs you" lane
```
