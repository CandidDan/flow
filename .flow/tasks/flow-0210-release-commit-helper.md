---
id: "flow-0210"
title: "A repo can ask Flow which commit to release when the newest commit on main is a Flow state commit that was never built"
status: "done"
priority: 1
project: "flow"
owner: "session_01NfrcU9iRVh8RVpDF6wsSzV"
created: "2026-11-04"
started: "2026-11-06T02:36:41Z"
branch: "claude/project-thread-f0zs28"
pr: "https://github.com/CandidDan/flow/pull/295"
issue: "https://github.com/CandidDan/flow/issues/286"
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/deployable-sha.mjs"
  - "project-template/.flow/bin/deployable-sha.test.mjs"
  - "project-template/.flow/bin/only-flow-changed.mjs"
  - "project-template/.flow/bin/only-flow-changed.test.mjs"
  - ".flow/bin/deployable-sha.mjs"
  - "project-template/.flow/PROTOCOL.md"
  - ".flow/bin/protocol-portability.test.mjs"
  - "changes/flow-0210.md"
labels: [release, deploy]
model: "opus"
effort: "high"
model_reason: "Decides which commit a repo releases to production; a wrong answer ships unbuilt or unchecked code"
notes: []
asks: []
---

## Context

After every merge, Flow writes a small commit to `main` that changes only `.flow/` files (the
task's status). The protocol tells repos to skip deploying those commits, through
`.flow/bin/only-flow-changed.mjs`. So the newest commit on `main` is usually one that passed the
gate but was never built, and the merge commit just before it was built but the gate on `main`
had already moved on. A release that requires "the gated commit is the built commit" can never
release.

TanPlan hit this on 2026-11-03: three of three release runs failed (run `41605424012`: "Vercel
has no READY production deployment for da8d4e6…: its production builds are CANCELED"), and
production was released by hand. Full report: issue #286.

Flow ships the half that says "skip building this commit". It does not ship the other half:
"given the commit that passed the gate, which commit was actually built, and is it the same
code?" Every repo that releases by promoting a built deployment has to write that half itself.

## Scope

1. New helper `project-template/.flow/bin/deployable-sha.mjs`:
   ```
   node .flow/bin/deployable-sha.mjs --head <sha> [--max 20]
   ```
   - Walks back from `<head>` along first parents, at most `--max` commits (default 20), to the
     nearest commit (it may be `<head>` itself) whose own change is NOT Flow-only, which is the
     commit a host would have built.
   - Prints that commit's full sha on stdout and exits 0 only if every commit between it and
     `<head>` changed Flow-only paths. That is what makes the found commit run the same code as
     `<head>`.
   - Exits 1, printing nothing on stdout and the reason on stderr, when: no such commit is
     found within `--max`; any git command fails; the clone is shallow and does not hold the
     needed history; an argument is missing or malformed; or anything else is in doubt. No error
     path exits 0. When unsure it refuses, because the safe answer here is "do not release".
2. "Flow-only" is decided by the same list `only-flow-changed.mjs` uses. That list is already
   exported as `FLOW_PATHS`: import it, do not copy it. If a shared helper is needed to test one
   commit's change against that list, move it into `only-flow-changed.mjs` and export it, so
   "skipped by the deploy hook" and "safe to step over" cannot drift apart.
3. Canonical's adapter `.flow/bin/deployable-sha.mjs` follows the existing adapter pattern
   (`.flow/bin/only-flow-changed.mjs` is the model): only the CLI shell, no logic.
4. `project-template/.flow/PROTOCOL.md`, **The store**, next to the deploy-skip paragraph: one
   or two sentences. A Flow state commit is never a release target. To release, take the commit
   that passed the gate and release the commit `deployable-sha.mjs` returns for it. Record the
   new digest in `INTENTIONAL_DIVERGENCES` (`.flow/bin/protocol-portability.test.mjs`) in the same
   commit, with a `why` naming this task.
5. Changelog fragment `changes/flow-0210.md`. Caller action: none required. Say that a repo whose
   release script pairs "gated" with "built" can switch to this helper, and name TanPlan's
   `tanplan-0271` as the local workaround it replaces.

**Does not touch:** any adopter's release script; whether the gate on `main` should stop being
cancelled for code commits (a possible later improvement, not this task); `only-flow-changed.mjs`'s
behaviour or exit codes.

## Acceptance criteria

- [ ] Given a history `code commit A` → `Flow-only commit B` (head), then `--head B` prints A and
      exits 0. Proved by `deployable-sha.test.mjs` on a temporary git repo.
- [ ] Given `--head A` where A itself is a code commit, then it prints A and exits 0. Proved by
      `deployable-sha.test.mjs`.
- [ ] Given `A` (code) → `B` (Flow-only) → `C` (code) → `D` (Flow-only, head), then it prints C,
      not A. Proved by `deployable-sha.test.mjs`.
- [ ] Given more than `--max` Flow-only commits on top of the last code commit, then it exits 1
      with nothing on stdout. Proved by `deployable-sha.test.mjs`.
- [ ] Given a shallow clone that lacks the needed history, an unknown sha, or a missing `--head`,
      then it exits 1 with nothing on stdout and a reason on stderr. Proved by
      `deployable-sha.test.mjs`, one test each.
- [ ] Given a commit that changes a path in `FLOW_PATHS` and one other path, then it counts as a
      code commit (not stepped over). Proved by `deployable-sha.test.mjs`.
- [ ] The Flow-only list used by `deployable-sha.mjs` is the `FLOW_PATHS` export of
      `only-flow-changed.mjs`, not a copy. Proved by a test in `deployable-sha.test.mjs` that
      checks the import.
- [ ] Given `PROTOCOL.md`, then **The store** says a state commit is never a release target and
      names `deployable-sha.mjs`. Proved by `.flow/bin/protocol-portability.test.mjs` (digest,
      with a `why` naming this task) and an assertion on the sentence.
- [ ] `changes/flow-0210.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
