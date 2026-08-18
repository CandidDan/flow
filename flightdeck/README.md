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
from, when that commit landed, and whether PR reconciliation actually ran. Rendering that — and
showing disagreements rather than hiding them — is flow-0002's job; this layer only produces it.

## Use
- "Where is everything / what needs me / portfolio status" → the `portfolio-manager` builds the
  digest and refreshes `flightdeck.html`.
- The digest leads with **Needs you now** (PRs in review, blocked items, failed gates across all
  projects), then in-flight work, then queue health (which projects are about to run dry).

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
bin/flightdeck-state.mjs           cross-project state aggregation (tested; origin/main only)
bin/flightdeck-state.test.mjs      its proving tests
.claude/agents/portfolio-manager.md the master read-across agent
flightdeck.html                    (generated) the cross-project board + "needs you" lane
```
