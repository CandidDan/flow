---
id: "flow-0026"
title: "Push queue-runner worker commits with FLOW_PAT so branch pushes trigger flow-open-pr"
status: "in_review"
priority: 2
project: "flow"
owner: "session_013Rjw5HRn2wR6wFYy2bi1iQ"
created: "2026-08-27"
started: "2026-08-28T04:43:05Z"
branch: "flow/flow-0026-queue-runner-flow-pat"
pr: "https://github.com/CandidDan/flow/pull/40"
issue: "https://github.com/CandidDan/flow/issues/32"
blocked_reason: ""
serves: ["G1"]
touches: [".github/workflows/_flow-queue-runner.yml", ".flow/bin/flow-pat-forwarding.test.mjs"]
labels: [infra, queue-runner]
notes:
  - "2026-08-28: built and PR open — https://github.com/CandidDan/flow/pull/40 (draft), branch flow/flow-0026-queue-runner-flow-pat. Both scope items done: FLOW_PAT declared optional in on.workflow_call.secrets, Work-the-task github_token now `${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}`, step comment rewritten for the fast path. Proving test .flow/bin/flow-pat-forwarding.test.mjs (parses the YAML, asserts both facts). Full gate green locally: build 21 workflows parsed, lint 59 files, test 605 pass, coverage 96.01%/84% vs floor 83.5. Deliberate exclusions honoured (no belt-and-braces PR step, no _flow-open-pr/_flow-recover edits, no secret creation). Next action: human reviews/merges PR #40; flow-0025 unblocks on _flow-queue-runner.yml once it lands."
---

## Context

Observed on `CandidDan/write`, 2026-08-25: queue-runner run 32872731785 (task `write-0017`) built
the task and pushed `flow/write-0017-marker-concealment` at 16:48 UTC, then stopped before opening
the PR — normal per the protocol (opening the PR is deliberately not the worker's job; see CAN-50 /
`_flow-open-pr.yml`). But `_flow-open-pr.yml` never fired: `push` events made with the Actions
`GITHUB_TOKEN` don't trigger downstream workflows (GitHub's recursion guard), and the queue-runner's
`claude-code-action` step currently authenticates all its git/PR operations with
`secrets.GITHUB_TOKEN`. The branch sat without a PR until a human opened one by hand
(`CandidDan/write#24`, ~1h later).

`_flow-open-pr.yml`, `_flow-recover.yml` and `_flow-sync.yml` all solved the identical problem for
their own pushes by switching to `FLOW_PAT` (a real actor, so the push/PR event fires normally),
falling back to `GITHUB_TOKEN` when the secret isn't configured (documented as CAN-58 in each of
those files). `_flow-queue-runner.yml` is the one remaining push path that never got that treatment.

## Scope

**Does:**

- Declare `FLOW_PAT` as an optional secret in `_flow-queue-runner.yml`'s `on.workflow_call.secrets`
  block: `FLOW_PAT: required: false` (matches `_flow-open-pr.yml` / `_flow-recover.yml` /
  `_flow-sync.yml`).
- Change the "Work the task" step's `github_token` input from `${{ secrets.GITHUB_TOKEN }}` to
  `${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}` — identical fallback shape used everywhere
  else FLOW_PAT is wired in, so a repo without the secret keeps exactly today's behavior.
- Update the step's existing comment (currently describing only the GITHUB_TOKEN path and citing
  CAN-58 as something `_flow-open-pr`/`_flow-recover` do to catch up after the fact) to state that
  FLOW_PAT is now used directly, so the worker's own push fires `_flow-open-pr.yml` on the fast
  path instead of relying solely on the later sweep.
- A test (new file, since none of the existing workflow-YAML test files cover
  `_flow-queue-runner.yml`) that parses the workflow with `yaml` and asserts both facts above,
  following the pattern already used for `_flow-compass.yml`'s secret declaration and step wiring
  (see `.flow/bin/check-workflows.test.mjs`).

**Deliberately does NOT:**

- Add a second, belt-and-braces step that has the queue-runner job open the PR directly. The
  issue floats this as an option; `_flow-open-pr.yml` (now correctly triggered) and
  `_flow-recover.yml` (unchanged, still the backstop) already cover this once the push event fires
  — a third path would be duplicate machinery for a gap this fix closes. If FLOW_PAT alone proves
  insufficient in practice, that's a follow-up backed by evidence, not a speculative addition here.
- Touch `_flow-open-pr.yml`, `_flow-recover.yml`, or their existing FLOW_PAT documentation — they
  already describe the secret correctly; this task only makes the queue-runner *use* it.
- Create or configure the `FLOW_PAT` secret in any repo — that's the human per-repo setup step
  `_flow-open-pr.yml`'s header already documents, not something a task file can do.

## Acceptance criteria

- [ ] Given `_flow-queue-runner.yml`'s `on.workflow_call.secrets`, when parsed, then it declares
      `FLOW_PAT` with `required: false`.
- [ ] Given the "Work the task" step, when parsed, then its `with.github_token` value is exactly
      `${{ secrets.FLOW_PAT || secrets.GITHUB_TOKEN }}`.
- [ ] Given the repo after this change, when `npm run build` runs, then `_flow-queue-runner.yml`
      still parses.
- [ ] Given `npm test`, then the new test asserts both YAML facts above by parsing the file with
      `yaml`, not by string-matching the raw file.
- [ ] Given the repo after this change, when `npm run lint` and `npm run coverage` run, then both
      pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved · build +
lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task linked,
criteria checklist ticked with the proving test named.

## Notes / open questions

- Deliberately scoped to the minimal fix (a) from the issue, not the "belt-and-braces" option (b)
  — see Scope for why. Flag it back to the orchestrator as a follow-up if FLOW_PAT alone doesn't
  hold up.
- Touches overlaps flow-0025 (from issue #33) on `_flow-queue-runner.yml` — sequence, don't
  parallelize. `flow-doctor` will warn on this overlap between the two `ready` tasks; that warning
  is expected, not a defect.
