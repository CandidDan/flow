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
.claude/agents/portfolio-manager.md the master read-across agent
flightdeck.html                    (generated) the cross-project board + "needs you" lane
```
