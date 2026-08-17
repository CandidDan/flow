---
id: "flow-0009"
title: "Give canonical the protocol layer it skipped, by reference rather than by copy"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude/next-tasks-ahnx30"
created: "2026-08-14"
started: "2026-08-14"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
touches: ["CLAUDE.md", ".gitattributes", ".flow/bin/protocol-docs.test.mjs"]
labels: [infra, dogfood, docs]
notes: []
---

## Context

flow-0004 gave canonical a working gate — config, commands, lifecycle workflows, `.flow/bin`
adapters. It deliberately did not give canonical the *protocol* layer, and the gap is sharper than
it looks:

**Canonical has no root `CLAUDE.md`.** Claude Code auto-loads that file at the repo root and
nowhere else. So a worker session opened against canonical starts with no protocol at all: it does
not know the store is `main`-only, that the claim is an atomic first-push-wins commit, that a
branch touching `.flow/tasks/` fails the gate, or that the task id must appear in the PR title. It
improvises, and the failure is quiet — the work looks fine and the state machine is left wrong.

This was observed directly, not theorised: the flow-0001 hand-off had to paste the protocol's
location into the session prompt by hand, because nothing in the repo would have told it. Every
future session in canonical needs the same manual patch until this lands.

That matters more here than in a consuming repo. Canonical is the repo whose entire claim is that
the rules are enforced rather than hoped for — and it is the one repo where a session can edit the
rules themselves. It is currently the least-governed repo in the fleet by the standard it publishes.

`.gitattributes` is missing for the same reason (it ships in `project-template/`, and canonical
never ran INIT.md against itself). Lower stakes — diff hygiene — but it is one file and the same
omission.

## Scope

- Add a root **`CLAUDE.md`** that is **canonical-specific and short**, and that **references** the
  protocol rather than duplicating it. Two copies of the protocol inside the repo that authors the
  protocol is precisely the drift `.flow/bin`'s adapters were built to avoid; the same reasoning
  applies here and the same answer follows. It must cover, in canonical's own terms:
  - **Where the protocol lives** — `project-template/CLAUDE.md` — and that it is authoritative for
    the loop, the lifecycle, concurrency and the hard rules. Read it; do not restate it here.
  - **What is different about canonical**: Flow infra is *authored* here rather than adopted, so a
    fix belongs in this repo; `project-template/` is the artefact other repos consume, and editing
    it changes every downstream repo at the next tag.
  - **The two planes, stated plainly**, because this is the rule a fresh session most often breaks:
    task-state transitions are commits to `main`; code and docs are a branch and a PR. Note that
    the store-guard fails any PR whose diff touches `.flow/tasks/`.
  - **The gate as it actually is here** — the five commands from `.flow/config.yml`, the measured
    coverage floor, and that `lint` only sees *tracked* files so files must be staged before a
    green lint means anything.
  - **`.flow/bin/` holds adapters, not copies** — they import `project-template/.flow/bin/`'s
    exported logic and supply canonical's own store. A change to shared behaviour belongs in the
    template; only the CLI shell belongs in the adapter.
  - **Where the skills and agents live** (`project-template/.claude/`), and the caveat that Claude
    Code auto-discovers agents only from a root `.claude/agents/`, which canonical does not have —
    see the exclusions below, so the next session does not think it is an oversight.
  - The response-style rule the protocol sets (TL;DR + ordered checklist), since it applies to
    sessions in this repo too.
- Add **`.gitattributes`**, matching `project-template/.gitattributes`.
- Add **`.flow/bin/protocol-docs.test.mjs`** proving the doc stays true (see criteria).

**Deliberately NOT in scope**, each for a stated reason rather than by omission:

- **`.claude/agents/`** (qa-verifier, security-reviewer, code-reviewer). flow-0007 moves these out
  of the worker's session and into CI. Copying them into canonical now means adopting three files
  that are about to be rewritten, in the repo where a stale copy propagates. Canonical adopts
  whatever flow-0007 lands, afterwards.
- **`.claude/skills/`** (task-writer, board-builder). Both already exist at
  `project-template/.claude/skills/` and are readable there — the root `CLAUDE.md` pointing at them
  is enough. `board-builder` additionally regenerates `.flow/board.html`, which flow-0004 recorded
  as superseded by the flightdeck for this repo.
- **`.flow/VERSION`**. The drift stamp exists so an *adopting* repo can tell it has fallen behind
  canonical. Canonical is the source; root `VERSION` already holds 1.1.0, and a second stamp inside
  `.flow/` would be a second source of truth with nothing to compare against. Its absence is
  correct, and `CLAUDE.md` should say so.
- **`.flow/board.html`** — superseded by the flightdeck work (flow-0001..0003), per flow-0004.
- **Any edit to `project-template/`.** flow-0006 owns `project-template/CLAUDE.md` and the
  vendor-neutral naming question; flow-0007 owns the agents. This task must not touch either, and
  its `touches` are set so CI enforces that.

## Acceptance criteria

- [ ] Given the repo root, when it is listed, then `CLAUDE.md` and `.gitattributes` both exist and are non-empty.
- [ ] Given root `CLAUDE.md`, when its content is inspected, then it contains a reference to `project-template/CLAUDE.md` as the authoritative protocol.
- [ ] Given root `CLAUDE.md`, when every repo-relative path it mentions is resolved, then each one exists on disk — so a doc that points at a moved or deleted file fails the gate instead of rotting silently.
- [ ] Given root `CLAUDE.md`, when it is measured, then it is under 200 lines — the constraint that keeps it a pointer rather than a second copy of the protocol.
- [ ] Given root `CLAUDE.md`, when it is searched, then it states the two-planes rule (state to `main`, code to a branch/PR) and names the five gate commands from `.flow/config.yml`.
- [ ] Given root `CLAUDE.md` and `.flow/config.yml`, when the coverage floor named in the doc is compared to `coverage_min`, then the two agree — a doc quoting a stale floor fails.
- [ ] Given `.gitattributes`, when it is read, then it marks `.flow/board.html` and `.flow/board-edits.json` as `linguist-generated`.
- [ ] Given the repo, when `npm run build`, `npm run lint`, `npm test` and `npm run coverage` run, then all pass and coverage stays at or above `coverage_min`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Write the doc for the session that has read nothing else.** The test of a good root
  `CLAUDE.md` is whether the flow-0001 hand-off prompt would have been unnecessary — that prompt
  had to supply the protocol location, the live gate details, the tracked-files lint caveat and
  the PR-title rule by hand. If a fresh session would still need any of those pasted in, the doc
  is not finished.
- **Do not restate the lifecycle, the loop or the concurrency model.** They are in
  `project-template/CLAUDE.md`, they are long, and a second copy in this repo will drift from the
  first. Reference and move on. The 200-line ceiling is the forcing function.
- The path-existence criterion is the one with real long-term value: it is what stops this file
  becoming confidently wrong after a refactor. Match repo-relative paths in backticks; be careful
  not to match prose, globs like `.flow/tasks/`, or the `flow/<id>-…` branch pattern. Getting that
  matcher slightly wrong in either direction is the main implementation risk in this task.
- `.claude/` currently exists at the repo root as an empty, untracked directory. Leave it that
  way — creating tracked content inside it is what this task's exclusions defer to flow-0007.
