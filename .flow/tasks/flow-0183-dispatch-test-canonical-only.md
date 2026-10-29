---
id: "flow-0183"
title: "flow-dispatch's config-cap test checks the template's config only in canonical, so it no longer fails every consuming repo's gate"
status: "done"
priority: 1
project: "flow"
owner: "claude-worker-flow-0183"
created: "2026-10-29"
started: "2026-10-29T11:18:04Z"
branch: "flow/flow-0183-dispatch-test-canonical-only"
pr: "https://github.com/CandidDan/flow/pull/267"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - "project-template/.flow/bin/flow-dispatch.test.mjs"
  - "changes/flow-0183.md"
labels: [hotfix, tests, dispatch]
model: "sonnet"
effort: "medium"
model_reason: "One test guarded to canonical, using a pattern flow-review.test.mjs already has; plus a regression test"
asks: []
notes:
  - "2026-10-29 orchestrator: found by the v4.0.0 canary. progress#137 (the flow-sync/4.0.0 PR) fails `flow-gates / source-roots-plan` at `not ok 139 - the template's config declares the dispatch cap at the default` (flow-dispatch.test.mjs:325). The rollout stopped before repinning any other repo. v4 now points at 4.0.0. No other repo pins @v4 yet."
---

## Context

flow-0182 added this test to `project-template/.flow/bin/flow-dispatch.test.mjs` (about line 325):

```js
test("the template's config declares the dispatch cap at the default", () => {
  const text = readFileSync(join(BIN, "..", "config.yml"), "utf8");
  assert.equal(readMaxInProgress(text), 3);
  assert.match(text, /^dispatch:\n {2}max_in_progress: 3$/m);
});
```

In canonical, `BIN/../config.yml` is `project-template/.flow/config.yml`, which is the template's
config, so the test passes. flow-sync copies the test into every consuming repo's `.flow/bin/`. It
never copies `config.yml`, because that file is the repo's own. There, `BIN/../config.yml` is the
repo's own config, which has no `dispatch:` block, so the test fails. Every repo that syncs 4.0.0
gets a red gate on its sync PR. The v4.0.0 canary (CandidDan/progress#137) showed this.

`flow-review.test.mjs` already guards a test that only makes sense in canonical:
`const inCanonical = resolve(CANON_ROOT, "project-template", ".flow", "bin") === resolve(BIN);`
and then `{ skip: inCanonical ? false : "…" }`.

## Scope

- Guard the template-config assertion so it runs only in canonical, the same way
  `flow-review.test.mjs` does. Downstream, it is skipped with a reason that says why.
- Downstream, the dispatch code must keep working when the repo's config has no `dispatch:` block.
  Add a test proving that `readMaxInProgress` on a config with no `dispatch:` block returns the
  default of 3. If that test already exists, say so in the PR and point to it.
- Write a changelog fragment `changes/flow-0183.md` as a top-level bullet: `- **…** (paths,
  flow-0183). **No caller action.** …`.

**Does not:** touch `flow-dispatch.mjs`, any workflow, or `config.yml`. It does not change which
config keys flow-sync copies.

## Acceptance criteria

- [ ] Given canonical, when `node --test project-template/.flow/bin/flow-dispatch.test.mjs` runs,
      then the template-config test runs and passes. It is not skipped.
- [ ] Given a copy of `project-template/.flow/bin/` placed at `<tmp>/.flow/bin/`, next to a
      `<tmp>/.flow/config.yml` that has no `dispatch:` block (this is how a consuming repo is laid
      out), when the dispatch test file runs there, then it reports 0 failures, and the
      template-config test shows as skipped with a reason. Prove this with a test, not by hand.
- [ ] `readMaxInProgress` of a config with no `dispatch:` block returns 3.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
