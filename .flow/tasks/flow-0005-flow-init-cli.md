---
id: "flow-0005"
title: "Make project adoption an executable command instead of a runbook an agent improvises"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude/next-task-tjqgta"
created: "2026-08-11"
started: "2026-08-20T05:40:29Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G4"]            # adoption as an executable command rather than folklore
touches: ["project-template/.flow/bin/flow-init.mjs", "project-template/.flow/bin/flow-init.test.mjs", "project-template/INIT.md"]
labels: [infra, adoption]
notes:
  - "2026-08-19: DEPENDS ON flow-0006 - do not claim this until flow-0006 has merged. Dropped from P2 to P3 to make that mechanical (pick-task takes the lowest priority number; at equal priority the id tiebreak picked this one FIRST, which was the wrong order). Reason: both tasks edit project-template/INIT.md with interleaved edits, and flow-0006 moves the protocol body to .flow/PROTOCOL.md and adds AGENTS.md. Writing flow-init.mjs before that move means writing its file-copy list against a file set that is about to change, and fixing it afterwards would need an edit to flow-init.mjs from inside flow-0006 - outside that task's touches. Land flow-0006 first and flow-init.mjs is written once, against the final file set. Restore to P2 once flow-0006 is done."
  - "2026-08-19: restored to P2. flow-0006 is `done` (PR #15 merged), so the sequencing reason recorded above is discharged — project-template/.flow/PROTOCOL.md and AGENTS.md exist on main and flow-init.mjs can be written once against the final file set. The INIT.md interleave risk is gone with it."
---

## Context

Adopting Flow into a repo is currently a ten-step runbook (`INIT.md`) that an agent reads and
follows. The runbook is good, and it still has the structural weakness of all prose instructions:
**nothing fails when a step is skipped.** The three rules at the top of INIT.md ("never invent a
config value", "measure, don't assume", "do not skip step 7") exist because those are the mistakes
that actually happen — and a rule written in a document is a hope, not a guard.

The failure is not hypothetical and it is not loud. A guessed `test` command produces a **green gate
that proves nothing**, which is worse than a red one: the repo now has ceremony without enforcement,
and nobody finds out until something ships broken. An undeclared `source_root` is the same class —
`flow-doctor` catches that one, which is precisely the difference a check makes.

The same reasoning as flow-0001: deterministic work belongs in tested code; judgement belongs to the
agent. Copying nine workflow files, rewriting a pinned ref, stamping a version and validating a
config are deterministic. Deciding what this project's test command *is* remains a judgement call —
so the tool takes it as a required input rather than making it up.

This also unblocks a future MCP wrapper (see ADR-0003) without committing to one: the MCP would call
this, and CI can call it too, which an MCP server never can.

## Scope

- Add `project-template/.flow/bin/flow-init.mjs`, taking its inputs as flags or a JSON file:
  project name / language / description, the five commands, `source_roots` (path + check pairs),
  `coverage_min`, `security.focus`, the GitHub `owner/repo`, and the canonical repo + ref.
- It performs the mechanical steps of INIT.md 1–4: copy `.flow/`, `.claude/` and all nine
  `flow-*.yml` callers from canonical at the pinned ref; rewrite the `uses:` pins **and** the
  `flow-sync` caller's `canonical_ref` (see `docs/repinning-a-consuming-repo.md` — these must agree
  or the repo runs edge workflows with stable tooling); write `.flow/config.yml`; stamp
  `.flow/VERSION` from the pinned ref; set `REPO` in `.flow/board.html`.
- **Every required input is required.** No defaults for the five commands, `source_roots`, or
  `coverage_min` — the tool exits non-zero naming what is missing rather than guessing.
- `--dry-run` prints the full plan (files that would be written, pins that would be set) and writes
  nothing.
- It is **idempotent and non-destructive**: re-running against an initialised repo reports what
  differs and changes nothing unless `--force`.
- Update `INIT.md` so steps 1–4 become "run this command", keeping the prose for the judgement steps
  (calibrating the config values, the human-only repo settings, gate-greening the baseline).

Deliberately **not** in scope: running the gate, seeding tasks, registering with the flightdeck, or
touching repo settings. Those are judgement, human-only, or both — the tool does the mechanical part
and stops.

## Acceptance criteria

- [ ] Given a complete input set and an empty repo, when the tool runs, then all nine `flow-*.yml` callers, `.flow/` and `.claude/` exist, and `.flow/config.yml` contains no `REPLACE-ME`.
- [ ] Given an input set missing the `coverage` command, when the tool runs, then it exits non-zero naming that field and writes nothing.
- [ ] Given a canonical ref of `v1-edge`, when the tool runs, then every caller's `uses:` line ends `@v1-edge` **and** the `flow-sync` caller's `canonical_ref` is `v1-edge`.
- [ ] Given a canonical repo other than the default, when the tool runs, then every `uses:` line names that repo and none names the default.
- [ ] Given `--dry-run`, when the tool runs against an empty repo, then it prints the planned writes and the repo is byte-identically unchanged.
- [ ] Given an already-initialised repo, when the tool runs without `--force`, then it exits non-zero reporting the differences and changes nothing.
- [ ] Given a completed run, when `node .flow/bin/flow-doctor.mjs` runs, then it reports no consistency failures.
- [ ] Given a `source_roots` entry whose `path` does not exist in the target repo, when the tool runs, then it exits non-zero naming that path — a root that isn't there cannot be gated.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- Fetching canonical at a ref needs network. Keep that in one function so the tests can substitute a
  local fixture directory; the tests must not hit the network.
- Resist adding an interactive prompt mode. The caller — an agent, a human, or CI — supplies inputs;
  a tool that can block on stdin is a tool that hangs in CI.
- The count of caller workflows (nine) should be derived from what canonical's template actually
  contains, not hardcoded. Hardcoding it is how INIT.md came to claim six.
