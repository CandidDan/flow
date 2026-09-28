---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0088"
title: "Release 2.1.1: the synced tests pass in an adopting repo, and canonical's gate proves it"
status: "done"
priority: 1
project: "flow"
owner: "orchestrator"
created: "2026-09-28"
started: "2026-09-28"
branch: "release/v2.1.1"
pr: "https://github.com/CandidDan/flow/pull/121"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]    # G10: the gate tells the truth. 2.1.0's synced tests were green in canonical and red in every adopting repo.
touches:
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/bin/source-roots.test.mjs"
  - "project-template/.flow/bin/check-claude-md.test.mjs"
  - ".flow/bin/adopter-layout.test.mjs"
  - "CHANGELOG.md"
  - "changes/**"
  - "VERSION"
  - "project-template/.flow/VERSION"
labels: [release, hotfix, flow-infra]
notes:
  - "2026-09-28 (orchestrator): WRITTEN AFTER THE WORK, deliberately. PR #121 was opened as a task-less release PR, like #117 (2.1.0). The qa reviewer passed #117 as 'no task, expected' and failed #121 for the same reason, so a task-less release PR's verdict is currently a coin toss. This task gives #121 criteria to be held to. Status is `in_review`, not `ready`, so the queue runner cannot claim work that already exists. The protocol gap (what a release PR is, and whether it needs a task) is its own follow-up."
  - "2026-09-28 (orchestrator): CAUSE. 2.1.0 moved `v2` before the canary (progress) was green. On progress, after flow-sync, `flow-tooling` failed five synced tests: three read `.flow/intents/_TEMPLATE.md`, which flow-sync does not deliver (flow-0063, flow-0073); two read canonical's own config or expect the template's REPLACE-ME config (flow-0077). Canonical's gate only ever ran those tests inside canonical."
---

## Context

flow-sync copies `project-template/.flow/bin/`, tests included, into every adopting repo, and
`flow-gates / flow-tooling` runs `node --test .flow/bin/*.test.mjs` there with nothing installed.
Five tests shipped in 2.1.0 pass only in canonical. The same release also needs its VERSION bump so
flow-sync can deliver `check-claude-md.mjs`, which the edge gate (flow-0050) already calls.

## Scope

**Does:**

- Makes the three intent-template tests in `flow-doctor.test.mjs` (plus the two flow-0073 criterion
  tests and the module-level read) skip, with a reason, when `.flow/intents/_TEMPLATE.md` is absent.
- Makes the two canonical-only tests in `source-roots.test.mjs` skip outside canonical.
- Adds canonical-only `.flow/bin/adopter-layout.test.mjs`: a scratch adopter (template copy, no
  `.flow/intents/`, every REPLACE-ME in config filled) runs every synced test.
- Makes the flow-0050 and flow-0073 changelog tests accept the assembled CHANGELOG entry once the
  fragment is deleted by `--assemble`.
- Assembles pending fragments (flow-0050, flow-0087) and stamps both VERSION files 2.1.1.

**Does not touch:** any helper's behaviour, any workflow, flow-sync's surface (whether it should
deliver the intent template is separate), the protocol.

## Acceptance criteria

- [ ] Given a scratch adopter built from `project-template/` without `.flow/intents/` and with a
      calibrated config, when every synced test runs there, then none fails
      (`.flow/bin/adopter-layout.test.mjs`, "every synced test passes (or skips)…").
- [ ] Given the scratch adopter, then it really has no intent template, no REPLACE-ME in config,
      and at least one synced test (`adopter-layout.test.mjs`, "the stand-in really is an adopter…").
- [ ] Given canonical, then the five previously failing tests still run and pass here (they skip
      only outside canonical / without the template): `npm test` in canonical reports them `ok`,
      not `skipped`.
- [ ] Given `--assemble` has deleted `changes/flow-0050.md` and `changes/flow-0073.md`, then the
      flow-0050 criterion-14 test and the flow-0073 criterion-9 test pass against CHANGELOG.md.
- [ ] `VERSION` and `project-template/.flow/VERSION` both read `2.1.1`; `changes/` holds only
      `README.md`; `release-guard --tag v2.1.1` reports 0 problems.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
