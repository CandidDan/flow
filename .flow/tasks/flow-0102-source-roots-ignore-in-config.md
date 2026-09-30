---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0102"
title: "A repo lists top-level folders that are not source in config.yml, so flow-doctor stops failing on them"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-30"
started: ""
branch: ""
pr: ""
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
