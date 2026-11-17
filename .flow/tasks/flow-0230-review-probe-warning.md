---
id: "flow-0230"
title: "The review check says why it fell back to the old verdict command, instead of always blaming an old helper"
status: "proposed"
priority: 4
project: "flow"
owner: ""
created: "2026-11-17"
started: ""
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: ""
accepted_at: ""
accepted_via: ""
touches:
  - ".github/workflows/_flow-review.yml"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/helper-command-compat.test.mjs"
  - "changes/flow-0230.md"
labels: [review, ci]
model: "haiku"
effort: "medium"
model_reason: "Two small, fully specified shell changes repeated in three steps of one workflow, with the tests that pin them named. Precedent: flow-0229."
notes:
  - "2026-11-17: From PR #308 (flow-0196), code-review non-blocking finding 2 and the security review's Low finding. Both are the same problem. #308 merged without them. Code-review findings 1 and 3 are out of scope here."
asks: []
---

## Context

flow-0196 (PR #308) made each of the three review steps in `_flow-review.yml` (qa, code-review,
security) ask the base-branch helper which commands it supports:

```sh
if node "$FLOW_REVIEW_DIR"/flow-review.mjs commands 2>/dev/null | grep -qx enforce; then
  ... enforce ...
else
  echo "::warning::Older BASE-branch Flow review helper: using verdict; merge a Flow sync to enable enforce."
  ... verdict ...
fi
```

Any failure of that probe, not only an old helper, takes the `else` branch. If a current helper
crashes (for example on import), its error is thrown away by `2>/dev/null`, and the warning tells
the reader to merge a Flow sync, which is wrong. The check still fails closed, because `verdict`
crashes too, so this is a wrong message, not a security hole. Both reviewers on #308 flagged it
as optional.

## Scope

In each of the three enforce steps of `.github/workflows/_flow-review.yml`:

1. **Keep the probe's error output.** Do not send the `commands` probe's stderr to `/dev/null`.
   Capture its exit status and output without letting `bash -e` stop the step.
2. **Say which case happened.** Take the `enforce` path when the probe exits 0 and lists
   `enforce`, as today. Otherwise warn with a message that matches the case:
   - the probe exited 0 but did not list `enforce`: keep today's "Older BASE-branch Flow review
     helper" warning;
   - the probe exited non-zero: a warning that says the helper's `commands` probe failed, with its
     exit status, and print its stderr to the log. Then fall back to `verdict` as today.

The fallback itself (the `mktemp` copy, the `verdict` call and its flags) does not change. The
check must still fail closed in every case it fails closed today.

Update the tests that pin the step's shell text (`flow-review-workflow.test.mjs`,
`helper-command-compat.test.mjs`) to match, and add the new case.

## Acceptance criteria

- [ ] Given a base-branch helper whose `commands` probe exits non-zero with a message on stderr,
  when an enforce step runs, then the log contains that stderr text and a `::warning::` naming the
  probe failure and its exit status, and does not contain "Older BASE-branch". Proved by a test
  that runs the parsed step shell against a stub helper that fails the probe.
- [ ] Given that same failing helper whose `verdict` also fails, the step exits non-zero. Proved
  by the same test.
- [ ] Given the `v4.0.1` helper (no `commands` command), the step still warns "Older BASE-branch
  Flow review helper" and the existing pass/fail/missing/invalid results are unchanged. Proved by
  the existing `helper-command-compat.test.mjs` cases, still passing.
- [ ] Given the current helper, the step still prints `Flow review: using enforce` with no
  warning. Proved by the existing `kind=current` case.
- [ ] All three enforce steps (qa, code-review, security) carry the change. Proved by a test that
  checks each step, and fails if any one is reverted (mutation, as in flow-0196).
- [ ] `changes/flow-0230.md` exists and says "No caller action." Proved by the usual fragment test
  pattern (fragment if present, else the assembled CHANGELOG entry).
- [ ] All five gate commands pass and coverage stays at or above the floor.

## Out of scope

- Code-review finding 1 from #308 (the hand-written `commands` list in `flow-review.mjs`).
- Code-review finding 3 from #308 (the compat test matching exact shell text).
- Any change to `project-template/.flow/bin/flow-review.mjs`.
