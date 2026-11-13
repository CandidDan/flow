---
id: "flow-0225"
title: "Show how long each gate step took, and warn when the gate runs past a set limit"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-11-13"
started: ""
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
model: "opus"
effort: "high"
model_reason: "Changes the reusable gate workflow every adopter runs; a timing wrapper that swallows a step's exit code would turn a failing gate green."
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
touches:
  - ".github/workflows/_flow-gates.yml"
  - "project-template/.flow/config.yml"
  - "project-template/.flow/bin/gate-timings.mjs"
  - "project-template/.flow/bin/gate-timings.test.mjs"
  - ".flow/bin/gate-timings.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0225.md"
labels: [ci, cost, gate]
notes: []
asks: []
---

## Context

On 2026-11-13 mapd's gate spent 34 minutes in its Coverage step and nothing said so. The run only
showed a long total time. `_flow-gates.yml` reports no step timings and has no `timeout-minutes`,
so a gate that has quietly become slow is found only when someone opens the run and reads the step
list, or when the bill arrives. CI spend is Dan's top concern (VISION G9).

This task makes the gate say, on every run, how long each part took, and lets a repo set a time
after which the gate warns. It never fails the gate on time.

## Scope

1. **Per-step timings in the job summary.** In the `gate` job of `.github/workflows/_flow-gates.yml`,
   record the wall-clock duration of each of these steps: Install, Build, Lint, Test, Coverage, and
   any flow-doctor step that runs in place of them (the intent-only step today; a store-only step if
   flow-0223 has landed). A final step that runs with `if: always()` writes a table under the
   heading `### Gate step timings` to `$GITHUB_STEP_SUMMARY`: one row per step with its name, its
   result (`passed`, `failed` or `skipped`), and its duration as `m:ss`; then a total row.
   - A step that fails still gets its duration. A step that did not run shows `skipped` and no time.
   - Timing must not change any step's exit code or which steps run.
   - No GitHub API call. Dan's account has hit the API rate limit this week; timings come from
     timestamps the job records itself.
   - Where the logic is more than a few lines of shell, put it in
     `project-template/.flow/bin/gate-timings.mjs` (zero dependencies, run from `$FLOW_BIN` like the
     other helpers) with unit tests beside it. That choice is the worker's.
2. **`gate.max_minutes`.** A new optional key in `.flow/config.yml`:
   ```yaml
   gate:
     max_minutes: 20
   ```
   Add it commented out to `project-template/.flow/config.yml` with a comment saying it warns and
   never fails, and to measure a few gate runs before choosing the number. When the total from item 1
   is over `max_minutes`, the summary step prints
   `::warning::Gate took <m:ss>, over gate.max_minutes (<n>). Slowest step: <name> (<m:ss>).` and
   adds the same sentence under the table. When the key is absent, the table is still written and no
   warning is printed. When the value is not a positive number, print one `::warning::` saying the
   value is ignored and why; never fail.
3. **Docs.** In `docs/flow-reusable-workflows.md`, a short section: what the timing table shows,
   the `gate.max_minutes` key, and that it only warns.
4. Changelog fragment `changes/flow-0225.md`: no caller action is required; a repo that wants the
   warning sets `gate.max_minutes`.

Not in scope:

- `timeout-minutes` on any job, or failing the gate on time. A hard limit is a separate decision.
- The `source-roots-plan` and `source-root` jobs. Only the `gate` job is timed.
- Canonical's own `.flow/config.yml`; canonical's gate runs in about a minute.

## Acceptance criteria

- [ ] `.flow/bin/gate-timings.test.mjs`: in `_flow-gates.yml`, the `gate` job has a step that writes
      the timing table, its `if:` is `always()` (or contains `always()`), and it is the last step of
      the job that runs on a pull request.
- [ ] Timing changes which steps run in no case: `.flow/bin/gate-cost.test.mjs` passes with its
      assertions unchanged by this task.
- [ ] Given recorded timestamps where Install took 40 s, Test 125 s and Coverage failed after
      2040 s, and Build and Lint were skipped, when the table is built, then it has rows
      `Install | passed | 0:40`, `Build | skipped |`, `Lint | skipped |`, `Test | passed | 2:05`,
      `Coverage | failed | 34:00`, and a total of `36:45`. (Unit test of the helper, or of the
      step's script run under `bash -e` in a temp directory.)
- [ ] Given a wrapped command that exits 3, when the timed step runs under `bash -e`, then the step
      exits 3 and a duration for it is still recorded.
- [ ] Given `gate.max_minutes: 20` and a total of 36:45, then exactly one `::warning::` line is
      printed, naming 36:45, 20 and `Coverage (34:00)`, and the summary step exits 0.
- [ ] Given `gate.max_minutes: 20` and a total of 5:00, or no `gate` key, then no warning is printed
      and the table is still written.
- [ ] Given `gate.max_minutes: "soon"`, `0` or `-5`, then one `::warning::` says the value is
      ignored, and the summary step exits 0.
- [ ] No step added by this task calls `gh`, `curl` or the GitHub API (asserted by scanning the
      added steps' `run:` text).
- [ ] `changes/flow-0225.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- `touches` overlaps flow-0167, flow-0207, flow-0223 and flow-0224 (`_flow-gates.yml`, `project-template/.flow/config.yml`,
  `docs/flow-reusable-workflows.md`). The queue serialises them. flow-0223 changes the `if:`
  conditions on the same five steps; if it has landed, criterion 2 compares against the conditions
  as flow-0223 left them.
- A new helper in `project-template/.flow/bin/` is fetched by the existing "Materialise canonical's
  helpers" step; check `.flow/bin/canonical-helpers-workflow.test.mjs` still passes.
- Expected version bump: MINOR.
