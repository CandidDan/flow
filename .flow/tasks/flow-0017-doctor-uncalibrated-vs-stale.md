---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0017"
title: "Let flow-doctor tell an uncalibrated repo apart from a stale declaration"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-08-19"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G2"]            # a check that states its decision instead of collapsing two facts into one
touches: ["project-template/.flow/bin/flow-doctor.mjs", "project-template/.flow/bin/flow-doctor.test.mjs", ".flow/bin/vision-template.test.mjs"]
labels: [infra, gate]
notes:
  - "2026-08-19: surfaced by flow-0011, which shipped project-template/VISION.md and could not fix this (project-template/.flow/config.yml was outside its touches). It shipped a deliberately narrowed assertion instead; clearing that narrowing is criterion 7 here."
  - "2026-08-19: a second defect found while specifying this, not in the original report — `check: \"REPLACE-ME\"` is truthy, so flow-doctor.mjs:496's `if (!r.check)` never fires for it and a placeholder check reads as a declared one. That is a check passing on silence, which is why this task is G2 rather than housekeeping. It is criterion 4."
  - "2026-08-19: touches intersected against every ready task on 2026-08-19 (flow-0003/0005/0007/0008/0012/0013/0014/0015/0016) and against flow-0018, written in the same batch. Disjoint from all. The near-miss is flow-0007, which declares project-template/.flow/config.yml — disjoint ONLY because this task deliberately does not touch that file. Widening scope to include it breaks parallel-safety with flow-0007."
---

## Context

`flow-doctor` collapses two different facts into one hard failure:

- **"you declared a `source_root` that doesn't exist"** — real drift. Should FAIL.
- **"you haven't calibrated this repo yet"** — a fresh scaffold still holding the shipped
  `REPLACE-ME` sentinels. Should WARN.

Both land on `project-template/.flow/bin/flow-doctor.mjs:497` with the same message:
`source_root "REPLACE-ME/" does not exist on disk — stale declaration`. A check that cannot
distinguish two facts is the failure class Flow exists to catch, and the cost is concrete: the
first thing an adopter sees after scaffolding is a red doctor blaming them for drift they have not
had the chance to create. A check people learn to ignore on day one is not a check.

There is a second, quieter half of the same defect. Line 496 reads
`if (!r.check) problems.push(...has no check...)`, and the string `"REPLACE-ME"` is truthy — so a
repo that calibrated `path` and left `check` at the placeholder gets **no** problem and **no**
warning. The gate-coverage floor silently reports itself satisfied by a command that does not
exist. That is a check passing on silence, which is the G2 failure mode exactly.

**Where it surfaced.** flow-0011 shipped `project-template/VISION.md`, activating the vision checks
over the template's own fixture store. Its criterion 4 asked that the template's `flow-doctor`, run
as a CLI, exit 0 — proving the shipped fixture self-consistent. It exits 1, and always has, because
of the placeholder. flow-0011 could not fix it (`project-template/.flow/config.yml` was outside its
`touches`) and shipped a deliberately narrowed assertion instead, in
`.flow/bin/vision-template.test.mjs:125` — the test named *"the template store's only flow-doctor
problem is the REPLACE-ME source_root placeholder"*, with a nine-line comment explaining why it had
to be narrowed. Clearing that narrowing is part of this task's point.

**Why the fix is not "fill in the template's `config.yml`."** `project-template/INIT.md` rule 1 is
*"Never invent a config value. Every `REPLACE-ME` in `.flow/config.yml` is either derived from…"*.
The sentinel is documented, load-bearing behaviour that the adoption runbook depends on, and
naming a real tree in the shipped template would defeat it. The fix belongs in the doctor.

## Scope

**Does:**

- Treat a `source_roots` entry whose `path` **or** `check` still holds `REPLACE-ME` as
  **uncalibrated** → a WARNING that names the offending entry and points at the calibration step
  (`INIT.md` step 2, or `flow-init` once flow-0005 lands) — not a PROBLEM.
- Mirror the graceful-adoption posture already in this file: `flow-doctor.mjs:490` for
  `configExists && !declared`, and the vision layer's posture for a missing `VISION.md` at
  `flow-doctor.mjs:513`. This is an existing pattern being applied consistently, not a new one.
- Keep the undeclared-top-level-source-tree scan (`flow-doctor.mjs:499–504`) firing regardless of
  placeholder state. This is the backstop that stops the softening going vacuous: without it,
  "uncalibrated" would become a way to switch the gate-coverage floor off entirely.

**Deliberately does NOT:**

- **Touch `project-template/.flow/config.yml`.** The placeholder stays. This is also what keeps the
  task disjoint from flow-0007, which declares that file.
- **Change what a genuinely stale root does.** A non-placeholder `path` absent from disk must still
  be a PROBLEM and still exit 1.
- **Touch canonical's own `.flow/config.yml` or `.flow/bin/config.test.mjs`.** Canonical is
  calibrated, and `config.test.mjs:44` already asserts no `REPLACE-ME` survives there.
- **Change the `REPLACE-ME` sentinel itself**, or introduce a second sentinel spelling. Match the
  string the template already ships.

## Acceptance criteria

- [ ] Given `project-template/.flow/config.yml` exactly as shipped, when
      `node project-template/.flow/bin/flow-doctor.mjs` is run as a CLI, then it exits **0** and its
      output contains a WARNING that names the uncalibrated `source_roots` entry and points at the
      calibration step.
- [ ] Given a config declaring a `source_root` whose `path` is a real (non-placeholder) value that
      is absent from disk, when the doctor runs, then it reports a **PROBLEM** naming that path and
      exits **1** — the stale-declaration behaviour is unchanged. *(This is the criterion that
      proves the change did not simply mute the check. Do not drop it.)*
- [ ] Given a half-calibrated config — one real `source_root` that exists on disk, plus one entry
      still holding `REPLACE-ME` — when the doctor runs, then the placeholder entry produces a
      warning and the real root is checked normally; neither entry goes silent.
- [ ] Given a `source_roots` entry whose `path` is real and present but whose `check` is still
      `REPLACE-ME`, when the doctor runs, then it produces the uncalibrated WARNING rather than
      passing silently — the truthy-placeholder hole at `flow-doctor.mjs:496` is closed.
- [ ] Given a repo whose config is uncalibrated **and** which holds an undeclared top-level source
      tree, when the doctor runs, then the `source tree "<dir>/" is not covered by any source_root`
      PROBLEM still fires and the exit code is **1** — the backstop survives the softening.
- [ ] Given a `source_roots` entry with **no** `path` key at all, when the doctor runs, then it is
      still the existing PROBLEM (`source_root with no path in config.yml`) and is not reclassified
      as uncalibrated — an absent key is malformed config, not a placeholder.
- [ ] Given `.flow/bin/vision-template.test.mjs`, when it is read after this change, then it
      asserts the template's `flow-doctor` CLI exits **0** outright, with no `REPLACE-ME` carve-out
      and with the comment block explaining the narrowing deleted.
- [ ] Given the repo after this change, when `npm ci`, `npm run build`, `npm run lint`, `npm test`
      and `npm run coverage` all run, then every one passes and coverage stays at or above
      `coverage_min`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **The undeclared-tree criterion cannot be proved against the shipped fixture — build a unit
  fixture for it.** `topLevelSourceDirs` filters out dot-directories
  (`flow-doctor.mjs:143` and `:155`), and `project-template/` holds no non-dot source tree, so
  running the doctor over the shipped template will never exercise that path no matter how the
  config is arranged. Criterion 5 needs a purpose-built temporary fixture with a real, non-dot
  top-level directory containing a source file. Canonical's own `.flow/config.yml` records this
  same limitation in prose. Build the fixture; do not discover this mid-gate and report the
  criterion untestable.
- **Warning, not silence.** The uncalibrated state must produce output. Downgrading it to nothing
  at all would trade one G2 failure for another — an adopter would then have no signal that the
  gate-coverage floor is unverified.
- **`flow-doctor` fails store-wide, not per-PR.** The comment at `flow-doctor.mjs:509–512` explains
  why the vision layer degrades to warnings rather than problems: one unfixable item otherwise
  reddens every open PR in the repo, including PRs whose authors cannot fix it. The same reasoning
  is why this task is worth doing rather than tolerating.
- Priority 2 rather than 1: nothing is currently blocked on it, but it is a false positive in a
  shipped tool that every adopting repo meets on its first run, and it holds a narrowed assertion
  open in canonical's own suite.
