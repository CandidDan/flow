---
id: "flow-0197"
title: "flow-sync keeps a caller's repo-owned with: inputs when it copies canonical's caller over it"
status: "in_review"
priority: 2
project: "flow"
owner: "session_01NfrcUBhaCrypn74UzzFPUZ"
created: "2026-11-03"
started: "2026-11-03T12:13:49Z"
branch: "flow/flow-0197-sync-keeps-caller-inputs"
pr: "https://github.com/CandidDan/flow/pull/285"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
intent: ""
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.flow/bin/flow-sync.mjs"
  - "project-template/.flow/bin/flow-sync.test.mjs"
  - ".flow/bin/sync-customised-caller.test.mjs"
  - "changes/flow-0197.md"
labels: [bug, sync]
model: "opus"
effort: "high"
model_reason: "Changes what the fleet's sync writes into every adopter's workflow callers"
asks:
  - "follow-up: in the sync PR's Kept inputs section, mark an input that overrides a value canonical also sets, separately from an input only the repo sets, so a stale override of a security default stands out (security review on PR #285, Low)"
notes:
  - "2026-11-03 orchestrator: found on CandidDan/mapd#52 (4.1.0 sync). mapd's flow-gates.yml caller passed `setup_node_version: \"24.22.1\"` (a pin for the CVE-2026-111497 Node security release). The sync copied canonical's caller over it and dropped the input, which would have moved mapd's CI to Node 22. Restored by hand on the sync branch (commit 2a82e0d). The sync's existing KEPT rule only protects callers with extra JOBS, not callers with extra or changed `with:` inputs."
---

## Context

`_flow-sync.yml` copies each template `flow-*.yml` caller into `.github/workflows/` unless the repo's
copy declares jobs the template does not (then it is KEPT untouched). A caller whose job passes extra or
different `with:` inputs (e.g. `setup_node_version`) is overwritten and the input is lost.

## Scope

1. Add a `flow-sync.mjs` subcommand (or extend `pin-callers`) that, given the repo's current caller and
   canonical's incoming caller, carries every `with:` key the repo's copy sets on a `uses:
   CandidDan/flow/...` job into the incoming copy for the same job, keeping the repo's value. A key canonical
   also sets keeps the repo's value. Comments on carried lines are carried with them.
2. `_flow-sync.yml` runs it on every copied (not KEPT) caller, after `pin-callers`, and lists each carried
   input under a "Kept inputs" heading in the sync PR body.
3. Fragment `changes/flow-0197.md`: **No caller action.**

**Does not:** change the KEPT-jobs rule; carry anything outside `with:`; change `pin-callers`'s ref logic.

## Acceptance criteria

- [ ] `flow-sync.test.mjs`: a repo caller with `setup_node_version: "24.22.1"` under `with:` and an
      incoming template caller without it produces an output caller with the same input and value.
- [ ] A key both set keeps the repo's value; a key only canonical sets is kept from canonical.
- [ ] `sync-customised-caller.test.mjs`: running the sync's copy loop on a fixture repo keeps the input
      and the PR body lists it under "Kept inputs".
- [ ] `changes/flow-0197.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
