---
id: "flow-0005"
title: "Make project adoption an executable command instead of a runbook an agent improvises"
status: "done"
priority: 2
project: "flow"
owner: "claude/next-task-tjqgta"
created: "2026-08-11"
started: "2026-08-20T05:40:29Z"
branch: "claude/next-task-tjqgta"
pr: "https://github.com/CandidDan/flow/pull/20"
issue: ""
blocked_reason: ""
serves: ["G4"]            # adoption as an executable command rather than folklore
touches: ["project-template/.flow/bin/flow-init.mjs", "project-template/.flow/bin/flow-init.test.mjs", "project-template/INIT.md"]
labels: [infra, adoption]
notes:
  - "2026-08-19: DEPENDS ON flow-0006 - do not claim this until flow-0006 has merged. Dropped from P2 to P3 to make that mechanical (pick-task takes the lowest priority number; at equal priority the id tiebreak picked this one FIRST, which was the wrong order). Reason: both tasks edit project-template/INIT.md with interleaved edits, and flow-0006 moves the protocol body to .flow/PROTOCOL.md and adds AGENTS.md. Writing flow-init.mjs before that move means writing its file-copy list against a file set that is about to change, and fixing it afterwards would need an edit to flow-init.mjs from inside flow-0006 - outside that task's touches. Land flow-0006 first and flow-init.mjs is written once, against the final file set. Restore to P2 once flow-0006 is done."
  - "2026-08-19: restored to P2. flow-0006 is `done` (PR #15 merged), so the sequencing reason recorded above is discharged — project-template/.flow/PROTOCOL.md and AGENTS.md exist on main and flow-init.mjs can be written once against the final file set. The INIT.md interleave risk is gone with it."
  - "2026-08-20: PR #20 open on claude/next-task-tjqgta, gate green (build 14 workflows, lint 40 .mjs, 333 tests / 332 pass / 1 pre-existing skip, coverage 91.73% vs floor 83.5, flow-doctor clean). All eight criteria have named proving tests in project-template/.flow/bin/flow-init.test.mjs; the PR body carries the mapping. Nothing is half-done: flow-init.mjs, its tests and the INIT.md rewrite all landed together."
  - "2026-08-20: four decisions a fresh session would otherwise re-litigate. (1) CRITERION 6 vs IDEMPOTENCE. The criterion says an already-initialised repo exits non-zero reporting the differences; a byte-identical re-run has no differences to report, so exiting non-zero there would make re-running adoption in CI fail for no reason. Resolved as: identical re-run = exit 0 no-op, a plan that DIFFERS = exit 3 and nothing written. Both are tested, so neither reading is unproven; the criterion's test uses the realistic collision (re-running at a different canonical ref). (2) THE SAMPLE TASK AND VISION.md DO NOT TRAVEL. The sample is `status: ready` with touches src/components/signup/** — copied into a new repo it is a genuinely dispatchable task pointing at files that do not exist, and the queue-runner would dispatch it. VISION.md ships as placeholder slots; a placeholder vision is worse than none. The board's TASKS snapshot is emptied to match so flow-doctor is clean on commit one. (3) ROOT FILES TRAVEL BY SUBTRACTION, not an include list. An include list would have to name CLAUDE.md in code, which protocol-portability.test.mjs fails (flow-0006 removed exactly that binding) — the first draft did, and the full suite caught it. (4) INIT.md STEP NUMBERS ARE UNCHANGED: RETROFIT.md refers to `INIT.md step 2` and `from step 5`, and RETROFIT.md is outside this task's touches, so steps 1 and 4 were rewritten in place rather than renumbered."
  - "2026-08-20: scars for whoever touches this next. `flow-init.test.mjs` is copied into every adopting repo and runs in the flow-tooling job with NO npm ci, so it must stay dependency-free — the YAML assertions are line scans for that reason, not for style. Its fixture is assembled from the REAL tree via resolve(import.meta.dirname, '../..'), which is project-template/ in canonical and the repo root downstream; that is why the caller count is derived rather than asserted as 9. The board.html copy and its assertions are existsSync-guarded on purpose so flow-0022 (retire the board) can delete the file without this test file becoming collateral damage. No adapter was added under canonical's own .flow/bin/ — flow-init is not invoked by any reusable workflow, and .flow/bin/flow-init.mjs is outside this task's touches."
  - "2026-08-20: next action — review and merge PR #20. flow-done flips this task to done. If a kickback lands, address it on claude/next-task-tjqgta; the branch's copy of this task file is stale by design and must not be 'fixed'."
  - "2026-08-20: kickback round 1 (Copilot review on PR #20), addressed in bb2ae6a — head is now bb2ae6a, all four checks green. Finding: a source_root path could climb out of the repo. Half right and worth recording precisely, because the wrong half will be repeated. TRUE: join(target, '../src') normalises to a directory OUTSIDE the target, so the existence check confirmed a tree the repo does not contain — and the same string is written into .flow/config.yml, where every later flow-doctor run resolves it against the repo root, so the blast radius is a gate aimed at another repo's files, not just one bad validation. FALSE: path.join does NOT ignore its base for an absolute second argument (that is path.resolve) — join('/repo','/tmp') is '/repo/tmp', which nests under the target and fails the existence check anyway. Absolute paths are refused regardless, because an absolute path in a config file that travels to other checkouts is meaningless. validateInputs now rejects isAbsolute or any '..' segment before the existence check; the unit test passes exists: () => true so the containment rule is provably doing the work rather than the filesystem happening to disagree. Test count 29 -> 31, coverage 91.77%."
  - "2026-08-20: do NOT rebase this branch onto main to 'catch up'. It was tried once this session and rewrote the PR head (46918f7 -> 76abfa8), which would have force-pushed over an open PR for no gain: main had only moved by this task's own notes commit to .flow/tasks/, which the branch must never carry, and the PR was already mergeable_state=clean. The fix was reset --hard to origin/<branch> and cherry-pick. Stack fixes on the existing head unless main has actually moved under the code."
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
