---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0076"
title: "flow-sync keeps a customised caller instead of silently deleting its extra jobs"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude-code-worker"
created: "2026-09-24"
started: "2026-09-25T00:48:41Z"
branch: "flow/flow-0076-sync-keeps-customised-caller"
pr: "https://github.com/CandidDan/flow/pull/108"
issue: "https://github.com/CandidDan/flow/issues/34"
blocked_reason: ""
blocked_by: []
serves: ["G10"]   # a sync that deletes a gate job leaves a green gate that stopped checking
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-sync.mjs"
  - "project-template/.flow/bin/flow-sync.test.mjs"
  - ".flow/bin/sync-customised-caller.test.mjs"
  - "changes/flow-0076.md"
labels: [flow-infra, flow-sync, bug]
notes:
  - "2026-09-24 (orchestrator): converted from the human's 2026-09-24 escalation comment on issue #34. The 2.0.0 sync (CandidDan/Nudge#297) copies the template's `flow-gates.yml` over Nudge's hybrid caller, which deletes `edge-parse`, `mcp-build` and `mobile-check`. The PR body doesn't mention it. `edge-parse` is the CAN-32 guard: without it a Deno parse error first shows up as a production BOOT_ERROR (about 7 days of dropped WhatsApp inbounds last time). The real fix is flow-0077, which lets those jobs become `source_roots` entries. This task is the general guard the comment asks for, so that ANY repo with a sanctioned hybrid caller stops losing jobs on sync, whether or not it has migrated."
  - "2026-09-24 (orchestrator): DECIDED: 'CUSTOMISED' MEANS EXTRA JOB KEYS, NOT A TEXT DIFF. The comment suggests keeping a caller that 'differs from the previous template in more than its pin'. That needs the previous version's template, which the sync run does not have. A text diff against the new template would also flag every caller canonical legitimately changed. The factual, checkable form: a caller is kept when the local file declares a top-level job key under `jobs:` that the incoming template file does not. That is exactly the case where copying deletes work. A caller that differs in any other way is overwritten as today."
  - "2026-09-24 (orchestrator): DECIDED: NO NEW DEPENDENCY. `flow-sync.mjs` runs in the adopting repo before any install, so read job keys with a line scan (two-space-indented keys directly under `jobs:`). Do not add a YAML parser. The line scan must handle comments and blank lines between jobs; the tests decide what counts."
  - "2026-09-24 (orchestrator): not parallel-safe with flow-0075 (both edit `_flow-sync.yml` and `flow-sync.mjs`). Whichever is claimed second rebases onto the first."
  - "2026-09-25 (worker): branch `flow/flow-0076-sync-keeps-customised-caller` pushed. DONE: `extraJobs`/`topLevelJobKeys`/`parseKept` + the `extra-jobs` subcommand and the `--kept` PR-body section in `project-template/.flow/bin/flow-sync.mjs`; `_flow-sync.yml`'s caller-copy loop now skips and `::warning`s a caller with extra jobs and passes `--kept` to `pr-body`; 10 new unit tests in `flow-sync.test.mjs` (criteria 1, 2, 3, 5). NOT YET DONE: `.flow/bin/sync-customised-caller.test.mjs` (criterion 4 — the workflow-structure assertions), `changes/flow-0076.md` (criterion 6), the full gate, and the PR. NEXT: write that test file following `.flow/bin/sync-surface.test.mjs` (yaml skip guard, extract the shipped loop with the same regex `sync-permissions.test.mjs` uses, run it in a bash fixture with SYNC/CANON_TPL set, prove each assertion fails against a mutated copy), then the fragment, then npm run build/lint/test/coverage, then the PR."
  - "2026-09-25 (worker): DONE — PR #108 marked ready for review, branch `flow/flow-0076-sync-keeps-customised-caller`. All six acceptance criteria have a named proving test; gate green (build 34 workflows, lint 89 .mjs, test 1191 pass / 0 fail, coverage lines 95.66% vs floor 83.5). Diff stays inside `touches` and touches nothing under `.flow/tasks/`. ONE THING A REVIEWER SHOULD KNOW: the `extra-jobs` call in the copy loop invokes `node \"$CANON_TPL/.flow/bin/flow-sync.mjs\"` rather than the `$SYNC` alias defined ~100 lines above it. `sync-permissions.test.mjs` and `sync-surface.test.mjs` both extract that loop and run it under `set -u` with only $CANON_TPL supplied, so `$SYNC` was unbound and both failed; neither file is in this task's `touches`, so the loop was made self-contained instead of the tests being edited. `checkCustomisedCallerGuard` asserts that property so it cannot regress. Fixture `uses:` owners are the placeholder `OWNER/flow` for the same reason — `adr-split-authoring.test.mjs` pins a count of files naming canonical's real owner/repo to the tree, and the ADR is not this task's to edit. NEXT: nothing for the worker; the three PR checks and the human own it from here."
---

## Context

Flow's callers are meant to be thin: each `.github/workflows/flow-*.yml` in an adopting repo just
calls canonical's reusable workflow. A repo that needs something the reusable can't express, such
as Nudge's per-tree checks, adds jobs to its own caller. Every sync then silently throws those
jobs away, because `_flow-sync.yml` copies each template caller over the local file with a bare
`cp` (the `for f in "$CANON_TPL"/.github/workflows/flow-*.yml` loop). The PR body lists the file
as modified, so nothing says that three gate jobs just disappeared, and the gate stays green
without checking what those jobs checked.

## Scope

**Does:**

- Add a pure function and subcommand to `project-template/.flow/bin/flow-sync.mjs` (name it e.g.
  `extra-jobs --local FILE --incoming FILE`). It prints the job keys the local file declares and
  the incoming file does not, one per line, and nothing when there are none.
- In `_flow-sync.yml`'s caller-copy loop, run it for each caller that already exists locally. If
  it reports any jobs, **do not copy that file**, and emit a `::warning` naming the file, the
  jobs that would have been deleted, and that the caller therefore does not receive this
  version's changes.
- Pass the kept callers to `pr-body`, which renders them in their own section ("Kept: customised
  callers") with the extra jobs named. A reviewer then sees exactly what was not synced and why.
- Write the changelog fragment `changes/flow-0076.md`.

**Does not touch:**

- `_flow-gates.yml` or `source_roots` (flow-0077).
- Callers that do not exist locally: a new template caller is still added.
- `.flow/bin/` mirroring, `PROTOCOL.md`, or the host files.
- Any merge of a kept caller with the incoming one. Keeping it whole is the safe, explainable
  behaviour. Merging YAML would be its own task.

## Acceptance criteria

- [ ] Given a local caller with jobs `gate`, `edge-parse` and `mcp-build`, and an incoming
      template with only `gate`, when `extra-jobs` runs, then it prints `edge-parse` and
      `mcp-build`.
- [ ] Given a local caller whose only difference from the incoming one is its `uses:` pin or
      other lines within existing jobs, when `extra-jobs` runs, then it prints nothing.
- [ ] Given a caller whose jobs are separated by comments and blank lines, and a job with nested
      keys, when `extra-jobs` runs, then only top-level job keys are compared.
- [ ] Given `_flow-sync.yml`, when parsed, then the caller-copy loop skips a file for which
      `extra-jobs` reports anything, emits a `::warning` naming the file and jobs, and still
      copies every caller for which it reports nothing, including callers new to the repo.
- [ ] Given `pr-body` with one kept caller, when it renders, then the body has a section listing
      the kept file and its extra jobs. Given no kept callers, the section is absent.
- [ ] Given `changes/flow-0076.md`, then it exists and describes the guard.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Workflow-structure assertions go in `.flow/bin/sync-customised-caller.test.mjs`, following
  `.flow/bin/sync-surface.test.mjs`: parse with `yaml`, keep its skip guard, and prove each
  assertion fails against a mutated copy.
- Once flow-0077 ships and Nudge moves its three jobs into `source_roots`, its caller has no
  extra jobs and syncs normally. This guard then only fires for a repo that still has a genuinely
  custom caller, which is the point.
