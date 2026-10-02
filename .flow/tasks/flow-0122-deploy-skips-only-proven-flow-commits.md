---
id: "flow-0122"
title: "A deploy skips a Flow-only commit only when that is proven: one tested check, a protocol rule, wiring left to each adopter"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-10-02"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Held out of the ready queue by queue_cap (10 ready vs cap 8 on 2026-10-02); the human chose blocked over urgent because the 2026-10-02 dashboard fix already stops the failures. Not machine-checkable: clears when the ready count drops below the cap. Flip to ready then."
blocked_by: []
serves: ["G9"]    # G9: not materially expensive to run. Every task-state commit to main triggers a full deploy build in every adopting repo; skipping them must never cost a broken deploy.
touches:
  - "project-template/.flow/bin/only-flow-changed.mjs"
  - "project-template/.flow/bin/only-flow-changed.test.mjs"
  - ".flow/bin/only-flow-changed.mjs"
  - "project-template/.flow/PROTOCOL.md"
  - "changes/flow-0122.md"
labels: [flow-infra, deploy, cost]
notes:
  - "2026-10-02 (orchestrator): the split was decided with the human. The rule goes in the protocol, the check is shared code, and the host wiring belongs to each adopter. Instruction-only was rejected because of the incident in Context."
---

## Context

Every task-state transition is a commit to `main` (claim, hand-off, done, board). In an adopting
repo deployed on Vercel, each one triggers a full production build that changes nothing. On
2026-10-01 a session added Vercel "Ignored Build Step" commands to six of the author's projects by
hand, in the dashboard, so nothing is in git:

- **v1:** `git rev-parse -q --verify HEAD^ || exit 1; git diff --quiet HEAD^ HEAD -- . ':(exclude).flow' …`.
  Guarded, but it diffs only against the parent commit. When a code commit and a task commit are
  pushed together, Vercel builds the tip, sees only `.flow/` changed, and **skips real code**.
- **v2:** `git diff --quiet ${VERCEL_GIT_PREVIOUS_SHA:-HEAD^} HEAD -- …`. It diffs against the
  last deployed commit, which is correct, but it **dropped the guard**. Vercel's checkout is
  shallow, so once the last deploy was more than ~10 commits back the base object was missing,
  `git diff` exited 128 (`fatal: bad object`), and **every deploy errored for ~12 hours** across
  inflight, nudge and nudge-holding.

The six copies had drifted apart, and the one invariant that mattered was lost in rewriting:
**when unsure, build.** Prose cannot hold that rule. A shared, tested check can. The wiring (which
host, which hook, which root folder, which extra paths) differs per project and stays with the
adopter.

## Scope

Does:

- **`project-template/.flow/bin/only-flow-changed.mjs`**: zero dependencies, Node ≥ 18, host-agnostic.
  ```
  node .flow/bin/only-flow-changed.mjs [--base <sha>] [--] [extra paths…]
    exit 0  → skip: every change between <base> and HEAD inside the watched scope is Flow-only
    exit 1  → build: anything else, or any doubt
  ```
  - **Base:** `--base`, else `$VERCEL_GIT_PREVIOUS_SHA`, else `$CACHED_COMMIT_REF` (Netlify), else
    `HEAD^`.
  - **Watched scope:** the current working directory (the host's root folder), plus each extra path
    given, each resolved relative to the cwd (e.g. `../supabase/functions`).
  - **Flow-only paths:** `.flow/`, `changes/` and `.github/`, all resolved from the repository top,
    not the cwd (`:(top,exclude)…`).
  - **Exit 1 (build) on any doubt:** the base is missing from the checkout, git exits with an error,
    the cwd is not inside a git work tree, an argument is malformed, or anything is thrown. It never
    exits 0 on an error path.
  - It prints exactly one line to stdout giving the decision and why, e.g.
    `only-flow-changed: build — base 0a3ed61 not in checkout (shallow clone)` or
    `only-flow-changed: skip — 3 files changed, all under .flow/ changes/ .github/`.
  - **The header comment is the adopter's recipe**, with the exact hook line for Vercel
    (`vercel.json` → `"ignoreCommand": "node .flow/bin/only-flow-changed.mjs"`, paths relative to
    the project's Root Directory, so a nested app writes `node ../.flow/bin/…`) and for Netlify
    (`netlify.toml` → `[build] ignore = "…"`). A line notes that both hosts use exit 0 = skip.
- **`.flow/bin/only-flow-changed.mjs`** in canonical: a thin adapter (the CLI shell importing the
  template's logic), per this repo's adapter rule, so canonical's own `flow-site` can use it.
- **`project-template/.flow/PROTOCOL.md`**: one short paragraph, placed after *The store*, stating
  the rule. Task-state commits change nothing deployable. A repo may skip deploys for them **only**
  through `.flow/bin/only-flow-changed.mjs` (or an equivalent that keeps its contract), and any
  doubt builds. Hand-written skip commands in a host dashboard are discouraged because they live
  outside git.
- `changes/flow-0122.md` (renamed with the allocated id), in the format `changes/README.md` describes.

Does not:

- Configure any host, edit any adopting repo, or add a `vercel.json`/`netlify.toml` to the template.
  Wiring is the adopter's, after a sync.
- Touch any workflow. The CI gate still runs on every PR.

## Acceptance criteria

Tests build throwaway git repos in a temp dir. Shallow clones use `git clone --depth`.

- [ ] Given a base and a HEAD whose only changes are under `.flow/` and `changes/`, then exit 0, and
      stdout starts `only-flow-changed: skip`.
- [ ] Given a base and a HEAD that change `app/page.js` **and** `.flow/tasks/x.md`, then exit 1. Given
      a code commit followed by a task-only commit on top, with the base before both, then exit 1:
      v1's skipped-code bug cannot recur.
- [ ] Given a shallow clone whose base commit is not in the checkout, then exit 1, and the line says
      the base is not in the checkout: v2's crash cannot recur, and it builds instead of erroring.
- [ ] Given no `--base`, with `VERCEL_GIT_PREVIOUS_SHA` set, it is used. With only `CACHED_COMMIT_REF`
      set, that is used. With neither, `HEAD^` is used. On a root commit with no `HEAD^`, exit 1.
- [ ] Given a cwd of `web/` with the extra path `../supabase/functions`, then a change only under
      `supabase/functions/` exits 1, a change only under `api/` (outside the scope) exits 0, and a
      change only under `.flow/` exits 0. Flow paths are resolved from the repo top, not from `web/`.
- [ ] Given a cwd outside any git repo, a malformed flag, or a forced git failure, then exit 1 every
      time. A table-driven test asserts that no error path exits 0.
- [ ] `.flow/bin/only-flow-changed.mjs` is an adapter: it imports the template module and holds no
      decision logic. (An existing adapter-shape test or a new assertion.)
- [ ] `project-template/.flow/PROTOCOL.md` contains the rule paragraph, naming
      `.flow/bin/only-flow-changed.mjs` and the phrase "any doubt builds". (A string assertion.)

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Decided: exit 0 = skip and exit 1 = build, matching both Vercel's and Netlify's ignore-hook
  convention, so the hook line needs no wrapper.
- Decided: `.github/` counts as Flow-only for deploy purposes. A workflow change cannot alter a
  host's build output. If an adopter's deploy *is* a GitHub workflow, they do not use this hook.
- After release, each adopter's wiring is a small PR in that repo. Today's dashboard commands
  (guarded, set 2026-10-02) cover the gap until then. Once a repo has `vercel.json`, its dashboard
  value no longer applies.
