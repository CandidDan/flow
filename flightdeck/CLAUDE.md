# Flightdeck — cross-project control

This is the layer *above* individual projects. Each project owns its own `.flow/` store and
runs its own loop independently. The flightdeck doesn't replace that — it reads across all of
them and gives the human one place to see everything and decide where attention goes.

## How it sees projects
The **registry** `projects.yml` is the authoritative list — each project registers there as the
last step of onboarding (`project-template/INIT.md` / `RETROFIT.md`). Every project built from the
template has a `.flow/tasks/` directory in a known shape; the flightdeck reaches a registered
project two ways:

- **Cowork workspace** (simplest): the entry's `path` points at the repo shared into a Cowork
  session; the portfolio-manager reads `path/.flow/tasks/*.md` directly. No extra infra.
- **Git** (for projects not on disk): the entry's `repo` is read via the GitHub connector.

If `projects.yml` is missing or empty, fall back to scanning sibling folders for `.flow/tasks/`.
Either way the contract is the same: projects expose clean task data; the flightdeck aggregates
it. No project depends on the flightdeck — it's a read-mostly lens, removable without breaking anything.

## What lives here
- `.claude/agents/portfolio-manager.md` — the master agent. Reads all projects, builds the
  cross-project digest, surfaces what needs the human. Does **not** make priority calls — that
  stays with the human, same rule as inside a project.
- A generated `flightdeck.html` (the portfolio-manager writes it) — the cross-project board:
  every project's columns rolled up, plus a "needs you" lane that pulls `in_review`, `blocked`,
  and failed-gate items from all projects into one place.

## The human's two-touchpoint promise, at portfolio scale
Inside one project, on the happy path, the human approves the spec and the PR — plus the
unavoidable kickbacks and blocked calls when a task genuinely needs them. Across the portfolio,
the flightdeck exists so that's *still* the shape of the job — the digest tells them which
projects have something sitting at one of those moments right now (a PR in review, a blocked
task, a failed gate), so nothing waits on them silently and nothing demands they hold five
mental models at once. Attention is the scarce resource; the flightdeck rations it.

## Don't
- Don't let the flightdeck write into project task files except via the same export-and-apply
  pattern the board uses. Cross-project edits are still edits to a project's source of truth.
- Don't have the portfolio-manager invent or reprioritise work autonomously. It reports and
  recommends; the human directs.
