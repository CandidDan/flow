---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0086"
title: "flow-doctor warns when claude_md_max is not declared"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-09-28"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G9"]
touches:
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "changes/flow-0086.md"
labels: [infra, context]
notes:
  - "2026-10-02 (orchestrator): unblocked on the human's say-so. Every blocked_by entry had landed (checked against main), and inflight listed it as UNBLOCK."
  - "2026-09-28 (orchestrator): split out of flow-0050, whose acceptance criterion 8 originally carried this as its second half. The flow-0050 worker left it undelivered on purpose because neither flow-doctor file was in that task's `touches`, and QA failed PR #114 on the unproven half. The human chose to split rather than widen flow-0050's scope, so criterion 8 there was amended to the check's own behaviour and this task owns the doctor's."
---

## Context

flow-0050 added `claude_md_max` to `.flow/config.yml`: a ceiling on the bytes of the resolved
`CLAUDE.md` import set, enforced by `.flow/bin/check-claude-md.mjs` in the `gate` job. When a repo
declares no `claude_md_max`, that check deliberately **passes** with a "no ceiling declared" warning
on stdout, so adopting the check cannot turn the fleet red.

That warning only appears in a CI log nobody reads when the gate is green. So a repo can sit with no
ceiling indefinitely, which is the state `CandidDan/Nudge` was in at 45% over the old advisory limit.
`flow-doctor` is where Flow already surfaces "configured but not calibrated". It warns for a
`source_root` that still holds the shipped `REPLACE-ME` placeholder, in the wording
`source_root "…" is uncalibrated — …` (`project-template/.flow/bin/flow-doctor.mjs`, the
gate-coverage block). The missing ceiling is the same kind of gap and belongs beside it.

## Acceptance criteria

- [ ] Given a repo whose `.flow/config.yml` exists and has no `claude_md_max` key, when
      `flow-doctor` runs, then it emits exactly one **warning** (not a problem) saying the context
      ceiling is uncalibrated, naming the `claude_md_max` key and `.flow/config.yml`, and exits 0.
- [ ] Given a repo whose `.flow/config.yml` declares a valid `claude_md_max`, when `flow-doctor`
      runs, then no warning about the ceiling is emitted.
- [ ] Given a repo with no `.flow/config.yml` at all, when `flow-doctor` runs, then it emits no
      ceiling warning. This matches the `source_roots` block, which warns only when the config
      exists (`configExists && !declared`): a repo with no config has nothing to calibrate yet.
- [ ] Given the warning text, when it is read, then the key name comes from the `CEILING_KEY` export
      of `check-claude-md.mjs` rather than a second hard-coded copy, so renaming the key cannot leave
      the doctor warning about a key that no longer exists. A test asserts the warning contains
      `CEILING_KEY`'s value.
- [ ] Given a repo where `check-claude-md.mjs` is not present beside `flow-doctor.mjs` (a caller
      that bumped refs without running flow-sync), when `flow-doctor` runs, then it adds a note that
      the ceiling check was skipped and says to run flow-sync. It neither throws nor fails, matching
      how the doctor already treats an absent `source-roots.mjs`.
- [ ] Given canonical's own `.flow/config.yml`, which declares `claude_md_max`, when
      `node .flow/bin/flow-doctor.mjs` runs in this repo, then it emits no ceiling warning.
- [ ] Given `npm run coverage`, when it runs on this branch, then it is at or above 83.5.
- [ ] Given `changes/flow-0086.md`, when it is read, then it tells adopting repos that flow-doctor
      now warns until `claude_md_max` is declared, and that the fix is to add it to
      `.flow/config.yml`.

## Scope boundaries

**Does not** change `check-claude-md.mjs`, its behaviour, or the gate step. Its no-key behaviour
(pass with a warning) is flow-0050's and stays as is.

**Does not** make a missing ceiling a doctor **problem**. It is a warning, the same as an
uncalibrated `source_root`. Failing on it would break every repo that has not adopted the key yet.

**Does not** validate the declared value. A present but unparseable `claude_md_max` already fails the
gate through `check-claude-md.mjs`; repeating that in the doctor would give two verdicts on one line.

**Does not** edit `.flow/bin/flow-doctor.mjs`. It is an adapter over the template helper and
picks the change up from there.
