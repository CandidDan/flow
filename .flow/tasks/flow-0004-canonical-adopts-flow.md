---
id: "flow-0004"
title: "Adopt Flow in canonical, gating the code without pretending to gate the prose"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-08-11"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
touches: [".flow/config.yml", ".flow/bin/**", "package.json", "package-lock.json", ".github/workflows/flow-gates.yml", ".github/workflows/flow-status.yml", ".github/workflows/flow-done.yml"]
labels: [infra, dogfood]
notes:
  - "2026-08-14: touches widened to include `.flow/bin/**`. Two reasons, both discovered by reading the reusables rather than the Scope section. (1) The build and lint criteria each need a proving test, and a test file has nowhere in-scope to live. (2) `_flow-status.yml` and `_flow-done.yml` invoke `.flow/bin/parse-task-id.mjs` and `.flow/bin/apply-board-edits.mjs` in the *consuming* repo, and `_flow-gates.yml` invokes `.flow/bin/touches-guard.mjs`, `.flow/bin/flow-doctor.mjs` and `node --test .flow/bin/*.test.mjs` — all guarded so they no-op silently when absent. Without `.flow/bin/` in canonical the last acceptance criterion (PR opens -> in_review, merges -> done) cannot pass, and the gate would go green while enforcing nothing. Widened on main by the orchestrator before the claim, per the protocol's scope rule."
---

## Context

**Do this first — it blocks flow-0001, flow-0002 and flow-0003**, which have nothing to run through
without it. (Flow has no dependency field yet, so that ordering lives in this sentence.)

Canonical is the one repo in the fleet that does not run Flow. It has `.flow/tasks/` (as of this
commit) but no `.flow/config.yml`, no gate, and no lifecycle workflows — so tasks flow-0001..0003
cannot run through the loop, and infra changes ship with no gate at all.

That is not a theoretical gap. The 1.1.0 release sat uncommitted on one laptop for five weeks with
its tests never run in CI and no review, in the repo whose protocol makes both non-negotiable for
every *other* project. The governance rule says "Flow infra is authored in canonical" — which only
means anything if authoring in canonical is at least as disciplined as consuming it.

**The design question this task must get right:** canonical is not a normal project. Most of it is
Markdown and YAML. A coverage floor over prose is theatre, and forcing a full build/lint/coverage
stack onto a docs repo is the kind of ceremony that gets disabled within a month and then lies about
being enforced. But canonical is *also* the repo whose actual product is `.mjs` helper scripts and
reusable workflows — and those deserve a real gate more than most application code does, because a
bug in them propagates to every repo at once.

So: gate the code and the workflows properly. Do not pretend to gate the prose.

## Scope

- Add a root `package.json` — `private: true`, with **c8 as the only dependency**. Canonical having
  zero deps today is a feature; adding one is a deliberate cost paid for the coverage floor, and a
  second one needs justifying in the PR.
- Add `.flow/config.yml` calibrated to what canonical actually is:
  - `install` — `npm ci`
  - `build` — validate every `.github/workflows/*.yml` parses. Canonical's product *is* workflows; a
    malformed reusable breaks the whole fleet, and nothing currently catches it before it does.
  - `lint` — `node --check` across every tracked `.mjs`. Cheap, dependency-free, catches the real
    failure (a syntax error in a helper that every repo copies).
  - `test` — `node --test` over `project-template/.flow/bin/*.test.mjs` and `flightdeck/bin/*.test.mjs`.
  - `coverage` — c8 over the same, **floor measured, not chosen** (run it once, set the floor at
    measured minus a small margin, per the protocol).
  - `source_roots` — `project-template/.flow/bin/`, `flightdeck/bin/`, `.github/workflows/`, each with
    the command above that parses it.
  - `security.focus` — workflow token permissions and secret handling in the reusables. That is where
    canonical's real risk lives: a `permissions:` block that is too broad ships to every repo.
- Add the thin callers canonical actually needs: `flow-gates`, `flow-status`, `flow-done`. Pin them to
  the **same** canonical repo (canonical calls its own reusables — self-referential and correct).
- Do **not** add `flow-queue-runner`, `flow-triage`, or `flow-review` in this task. Automation on the
  repo that defines the automation is a bigger decision and belongs in its own task once the gate has
  proven itself here.

Deliberately **not** in scope: any change to the reusables themselves, and `.flow/board.html` /
board-builder wiring (the flightdeck work in flow-0001..0003 supersedes it for this repo).

## Acceptance criteria

- [ ] Given a fresh clone, when `npm ci` runs, then it succeeds against a committed lockfile with c8 as the only dependency.
- [ ] Given the repo as-is, when the `build` command runs, then it exits 0 and every file in `.github/workflows/` has been parsed.
- [ ] Given a deliberately malformed `.github/workflows/_flow-gates.yml`, when the `build` command runs, then it exits non-zero and names the offending file.
- [ ] Given a deliberately broken `.mjs` helper, when the `lint` command runs, then it exits non-zero and names the file.
- [ ] Given the repo as-is, when the `test` command runs, then every existing `.flow/bin` and `flightdeck/bin` test executes and passes.
- [ ] Given the coverage command, when it runs, then it prints a percentage and exits non-zero if below `coverage_min`, and the committed `coverage_min` equals the measured value minus the stated margin.
- [ ] Given `.flow/config.yml`, when `node project-template/.flow/bin/flow-doctor.mjs` runs against this repo, then it reports no consistency failures — including no undeclared top-level source tree.
- [ ] Given a PR from a `flow/<id>-…` branch, when it opens, then `flow-gates` runs and the task flips to `in_review` with `branch` and `pr` recorded; when it merges, the task flips to `done` on `main`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Gate-green the baseline before opening the PR** (INIT.md step 7). Canonical has never run its own
  gate, so this task *is* the debt-discovery pass — expect the first run to fail on something
  unrelated to the config, and fix it here rather than leaving it for flow-0001's author.
- **The store's genesis commits go straight to `main`**, as with any Route B retrofit: the store-guard
  would otherwise block the birth of the store it is guarding.
- Canonical calling its own reusables via `@v1` means a broken reusable can break canonical's own
  gate, with no second repo to notice. Pin canonical's callers to `@main` instead, so it always gates
  against what it is about to ship rather than against the last release. Say so in the PR if you
  disagree — it is the one place in the fleet where "always latest" is the safer choice.
- `flow-validation/` and `flow-plugin/` are untracked after the public split; make sure the
  `source_roots` floor does not trip over directories git no longer knows about.
