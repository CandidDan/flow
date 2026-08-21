---
id: "flow-0008"
title: "Make the guards prove they ran, so a silent no-op can't pass for a green gate"
status: "in_review"
priority: 2
project: "flow"
owner: "claude/task-queue-workflow-fm939h"
created: "2026-08-11"
started: "2026-08-21T06:00:50Z"
branch: "claude/task-queue-workflow-fm939h"
pr: "https://github.com/CandidDan/flow/pull/22"
issue: ""
blocked_reason: ""
serves: ["G2"]            # a guard that can't pass on silence
touches: [".github/workflows/_flow-gates.yml", "project-template/.flow/bin/touches-guard.mjs", "project-template/.flow/bin/main-module.test.mjs", ".flow/bin/touches-guard.mjs", ".flow/bin/gate-assertion.test.mjs"]
labels: [infra, integrity]
notes:
  - "2026-08-11: the symlink root cause is FIXED and has a regression test. This task is the hardening that incident argues for, not the fix itself."
  - "2026-08-21: WORKER-INITIATED touches widening — NEEDS RATIFICATION. The declared radius could not deliver the task. `_flow-gates.yml` runs the *consuming* repo's `.flow/bin/touches-guard.mjs`, and in canonical that is the adapter, which duplicates the template's CLI shell. A gate assertion that demands a decision line would therefore fail on canonical's own PR unless the adapter emits one too, so `.flow/bin/touches-guard.mjs` is added (it becomes a 3-line delegation to the template's new `runGuard`, which removes the duplication CLAUDE.md warns about). `.flow/bin/gate-assertion.test.mjs` is added because acceptance criterion 6 — the assertion must fail against a deliberately no-op'd guard — tests a shell snippet that lives in canonical's `_flow-gates.yml`; a test for it in `project-template/` would read a path that does not exist in an adopting repo. No other path is touched."
  - "2026-08-21: HANDOFF — PR #22 open (branch claude/task-queue-workflow-fm939h), all five gate commands green locally: build 14 workflows parsed, lint 41 .mjs parsed, test 356/355 pass (1 pre-existing opt-in live-agent skip), coverage 93.24% vs floor 83.5, flow-doctor healthy. All six acceptance criteria have named proving tests (mapping is in the PR body). GENUINELY DONE: the decision-line contract, runGuard as the single CLI implementation, the adapter delegating to it, the gate assertion on both guards, and set -o pipefail on the capture. DECISIONS a fresh session should not re-litigate: (a) the human-readable guard lines were kept verbatim alongside the new decision line, so the pre-existing tests in touches-guard.test.mjs and adapters.test.mjs — both outside this task's touches — keep passing unchanged; (b) gate-assertion.test.mjs executes the real run: script pulled out of _flow-gates.yml rather than re-implementing the check, because a re-implementation would prove nothing about what ships. TWO THINGS FOR THE HUMAN: ratify the touches widening noted above, and decide whether _flow-gates.yml's missing `permissions:` block (a pre-existing gap, and a named security focus in .flow/config.yml) becomes its own task. NEXT ACTION: none for the worker — await review. flow-status owns the move to in_review, flow-done owns done."
  - "2026-08-21: CI green on all four checks (head e01a80d, run 32453674464). One real failure found and fixed first: the flow-tooling job runs `node --test .flow/bin/*.test.mjs` with NO install step, so gate-assertion.test.mjs's static `yaml` import crashed it — now a guarded dynamic import with a visible `# SKIP`, matching check-workflows.test.mjs. IMPORTANT FOR THE REVIEWER, learned from the CI logs: canonical's caller pins `_flow-gates.yml@main` on purpose, so this PR ran the OLD workflow definition with the NEW guard code. The decision line appears in the touches job; the assertion step does not, because it only exists on the branch. The assertion goes live for canonical's NEXT PR, with no second repo watching if it is wrong — which is exactly why gate-assertion.test.mjs executes the shipped `run:` scripts under bash rather than re-implementing the check. Those 13 tests ran green in CI (tests 38-50 of the gate job)."
---

## Context

**The incident.** Every `.flow/bin` helper gated its CLI on
`import.meta.url === \`file://${process.argv[1]}\``. Node resolves `import.meta.url` to the
**realpath**; `process.argv[1]` stays **as invoked**. Reached through a symlink, the two differ, the
comparison is false, and the CLI block never runs — **no output, no error, exit 0**. Fixed by
comparing realpaths on both sides, with `main-module.test.mjs` building an explicit symlink so the
regression is catchable on any platform.

It hid for months because of an environment split: macOS `os.tmpdir()` is `/var/folders/…`
symlinked to `/private/var/…`, so it fired on every local run — while Linux CI checks out to a real
path and never saw it. Two attempted fixes failed before the reproduction was built, both because
the mechanism was assumed rather than demonstrated. **The five minutes that solved it — a symlink
and three `console.log`s — should have come before either attempt.**

**Why this task exists, separately from that fix.** The bug was survivable in CI by luck. What is not
survivable is the *shape* of the failure: `touches-guard` **failed open**. When its CLI block didn't
run it exited 0, the gate went green, and scope enforcement — the strongest guarantee Flow makes,
the one the README leads with — was silently off. Nothing anywhere said so.

A guard that can fail silently is not a guard; it is a guard-shaped hole. The realpath fix closes
*this* instance. This task closes the class: make it impossible for the guard to not run and still
be reported as passing.

## Scope

- **`touches-guard` announces its decision on every run**, in a machine-checkable form — enforced,
  skipped-no-task-id, skipped-no-task-file — on a single, stable, greppable line.
- **The gate asserts the guard actually ran.** `_flow-gates.yml` captures the guard's output and
  fails the job if no decision line is present. Absence of a decision is a failure, not a pass:
  today "the guard printed nothing" and "the guard found nothing wrong" are indistinguishable, and
  that is exactly what let this hide.
- **A legitimate skip stays a pass** — a dependabot PR with no task id must still go green. The
  change is that the skip is *stated and observed*, not inferred from silence.
- Apply the same treatment to the store-guard step, which shares the fail-open shape.

Deliberately **not** in scope: the realpath fix (already landed) and the `.nvmrc` / `engines`
runtime pin (flow-0004, and only tangentially related — this was never a Node-version bug, despite
two hours of assuming it was).

## Acceptance criteria

- [ ] Given a PR whose diff strays outside `touches`, when the gate runs, then the guard prints an `enforced` decision line and the job fails.
- [ ] Given a PR with no resolvable task id, when the gate runs, then the guard prints a `skipped` decision line **naming the reason** and the job passes.
- [ ] Given a guard invocation that produces no decision line at all, when the gate step evaluates it, then the job **fails** with a message saying the guard did not run.
- [ ] Given the guard is invoked through a symlinked path, when it runs, then it still emits its decision line and enforces normally.
- [ ] Given the decision line format, when it is parsed by the gate, then the parse is anchored (a prefix match on a fixed token), not a loose substring that a future wording change would silently break.
- [ ] Given the new gate assertion, when it is run against a deliberately no-op'd guard, then it fails — proving the assertion tests the absence, not merely the presence.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Worth investigating separately, and it may not be pleasant:** `parse-task-id` failed the same
  way, and it feeds `flow-status` / `flow-done`. A lost id means the PR-event transition never fires
  and the task strands on `main` — which is precisely what `flow-recover` exists to sweep up. If
  `flow-recover` has been unusually busy, this was probably why, and some historical "flaky"
  transitions were this bug.
- The generalisable rule this encodes, worth stating in the protocol: **a check that can silently
  not run must be able to prove it ran.** Same family as `source_roots` (a tree no command parses is
  never checked) — both are "absence of evidence read as evidence of absence".
- Keep the decision line cheap and stable. It is now a contract between the guard and the gate, so
  changing its wording is a breaking change to CI, not a cosmetic edit.
