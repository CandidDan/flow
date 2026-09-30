---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0102"
title: "A repo lists top-level folders that are not source in config.yml, so flow-doctor stops failing on them"
status: "in_review"
priority: 2
project: "flow"
owner: "claude-worker-flow-0102"
created: "2026-09-30"
started: "2026-09-30T04:50:12Z"
branch: "flow/flow-0102-source-roots-ignore-in-config"
pr: "https://github.com/CandidDan/flow/pull/135"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/config.yml"
  - "changes/flow-0102.md"
labels: [flow-doctor, source-roots, config]
notes:
  - "2026-09-30 (orchestrator): Reported from tanplan-platform. flow-doctor fails when a top-level folder holding source-extension files is not declared in `source_roots` and not in `ROOT_IGNORE`. `ROOT_IGNORE` is hard-coded in flow-doctor.mjs (around line 127), so tanplan's `docs/` and `holding/` (deliberately not gated) can only be exempted by patching a copied Flow file, which the next flow-sync overwrites. Declaring them as source_roots was rejected: docs/ has no check to run, and gating holding/ reverses a decision the human already made."
  - "2026-09-30 (orchestrator): Overlaps flow-0100 on project-template/.flow/config.yml; sequence."
  - "2026-09-30 (worker): Implementation done on branch flow/flow-0102-source-roots-ignore-in-config (pushed). flow-doctor parses `source_roots_ignore:` (both YAML list forms), validates entries against disk, and merges the valid ones into ROOT_IGNORE at all three consult sites; undeclared-tree FAIL now names the config key. Template config ships the key empty, documented. 10 new tests + the published-config test pass (127 total in flow-doctor.test.mjs). Next: run the full five-command gate, then open the PR. Out of scope and left undone: `flow-init.mjs` still GENERATES a config comment pointing at ROOT_IGNORE (line ~398) — not in this task's touches, needs its own task."
  - "2026-09-30 (worker): PR #135 open and marked ready for review (branch flow/flow-0102-source-roots-ignore-in-config, rebased onto main). All five gate commands green: build 34 workflows, lint 101 .mjs, test 1444 pass / 1 pre-existing opt-in skip, coverage 95.85% vs floor 83.5. Every criterion has a named proving test in the PR body; the changes/flow-0102.md criterion is proven by the file plus `changelog-fragments.mjs --check`, because the template test suite ships into repos with no changes/ directory. Nothing left for this task — the three review checks run on the PR. FOLLOW-UP for the orchestrator: flow-init.mjs (~line 398) and project-template/INIT.md (line 156) still tell adopters to add a tree to flow-doctor's ROOT_IGNORE, and flow-init emits no source_roots_ignore key, so a freshly scaffolded repo never learns the hatch exists. Both are outside this task's touches."
---

## Context

The doctor's undeclared-source-tree check exists so a source tree is never silently ungated. Its
escape hatch, `ROOT_IGNORE`, is canonical's list of build output and plumbing folders, and a repo
cannot extend it without editing Flow's own code. That pushes adopters into exactly the local
patch the protocol forbids.

## Scope

**Does:**
- Read an optional top-level `source_roots_ignore:` list from `.flow/config.yml`: bare top-level
  folder names (no `/`, no globs). flow-doctor treats each entry exactly as it treats a
  `ROOT_IGNORE` entry, everywhere it consults that set.
- An entry containing `/` or a glob character, or naming a folder that does not exist, is a
  flow-doctor warning naming the entry. It is not fatal, and it does not exempt anything.
- The undeclared-tree FAIL message names `source_roots_ignore` in `.flow/config.yml` as the fix
  when a folder should not be gated, instead of `ROOT_IGNORE`.
- `project-template/.flow/config.yml` documents the key next to `source_roots:`, empty, with one
  line saying an ignored folder is never gated, so ignoring it is a decision.
- Changelog fragment `changes/flow-0102.md`. **No caller action**; a repo opts in by setting the
  key, and can then drop any local `ROOT_IGNORE` patch at its next flow-sync.

**Does not touch:** `ROOT_IGNORE`'s built-in entries; `source-roots.mjs` and the gate matrix.

## Acceptance criteria

- [ ] Given a repo with a top-level `holding/` of `.ts` files, not in `source_roots`, when
      `source_roots_ignore: ["holding"]` is set, then flow-doctor reports no undeclared-tree
      failure for it.
- [ ] Given the same repo without the key, then flow-doctor still fails naming `holding/`
      (existing behaviour kept), and the message names `source_roots_ignore`.
- [ ] Given an entry `"docs/api"` or `"hold*"`, then flow-doctor warns naming the entry and
      exempts nothing.
- [ ] Given an entry naming a folder that does not exist, then flow-doctor warns naming it.
- [ ] `project-template/.flow/config.yml` documents the key.
- [ ] `changes/flow-0102.md` exists and says no caller action is needed.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
