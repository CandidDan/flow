---
id: "flow-0175"
title: "docs/flow-routines.md covers firing a routine from an app, the account-wide limits, and the auto-mode stall risk, so it is the one routine runbook"
status: "done"
priority: 2
project: "flow"
owner: "worker-flow-0175"
created: "2026-10-28"
started: "2026-10-28T05:18:08Z"
branch: "claude/flow-0175-routines-doc-fold-in-850a93"
pr: "https://github.com/CandidDan/flow/pull/255"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G9"]
intent: "model-work-off-github-actions"
touches:
  - "docs/flow-routines.md"
  - ".flow/bin/protocol-routine-handoff.test.mjs"
  - "changes/flow-0175.md"
labels: [docs, routines]
model: ""
effort: ""
model_reason: ""
notes: []
asks: []
---

## Context

Two runbooks for running Flow's worker as a Claude Code cloud routine were written in parallel on
2026-10-28: `docs/flow-routines.md` (flow-0172, merged in PR #253) and `docs/claude-routine-worker.md`
(flow-0171, PR #252). Dan ruled "Fold into flow-routines": `docs/flow-routines.md` stays as the one
runbook, PR #252 is closed and flow-0171 cancelled. Three things in #252 are not yet in
`docs/flow-routines.md`. This task carries them across.

1. **Firing from an app** (inflight's "Work this →" will need this):
   ```sh
   curl -X POST "https://api.anthropic.com/v1/claude_code/routines/<trigger-id>/fire" \
     -H "Authorization: Bearer $ROUTINE_TOKEN" \
     -H "anthropic-version: 2026-10-21" \
     -H "Content-Type: application/json" \
     -d '{"text": "<task-id>"}'
   ```
   - The API trigger is created in the claude.ai routines UI (Edit → Trigger "+" → API → Generate
     token). **The token is shown once**: store it as a secret right away; if lost, regenerate it.
   - The call returns once the session is created, with `claude_code_session_id` and
     `claude_code_session_url`; it does not wait for the run.
   - `text` is optional and is the task id. Empty means the worker picks with `pick-task.mjs`,
     which `docs/flow-routines.md`'s saved prompt already handles.
   - The `anthropic-version` header is from Anthropic's "Trigger a routine through the API" doc
     (platform.claude.com/docs/en/api/claude-code/routines-fire). It is not yet exercised by a
     Flow run, so say that in the doc.
2. **Limits beyond the per-routine one already documented:** 100 API fires and 100 scheduled runs
   per hour **per account**; and routine usage is **shared with interactive sessions** on the same
   Max subscription, so heavy routine use leaves less for hands-on work.
3. **Auto-mode stalls:** a routine starts in auto mode, and repeated classifier blocks can stop an
   unattended run to wait for a human. The 2026-10-28 canary did not hit one, but it has not been
   tested on a task that has to set itself `blocked`. Record that as untested.

## Scope

- Add the three items above to `docs/flow-routines.md`. Put the firing call in its own section,
  and the two limits plus the stall risk in the existing *Limits that matter* section.
- Add assertions for them to `.flow/bin/protocol-routine-handoff.test.mjs`, beside its existing
  `docs/flow-routines.md` assertions.
- Changelog fragment `changes/flow-0175.md`. It is docs only, so it says **No caller action**.

**Deliberately does NOT:**
- Add `worker.host` or any `.flow/config.yml` key. That is flow-0170's (PR #251), and the doc
  gains it when that lands.
- Touch `PROTOCOL.md`, any workflow, or inflight.
- Bring over #252's "canary checklist". The canary ran on 2026-10-28, and its evidence is already
  in the doc.

## Acceptance criteria

- [ ] Given `docs/flow-routines.md`, when it is read, then it contains the fire endpoint `https://api.anthropic.com/v1/claude_code/routines/<trigger-id>/fire` in a fenced block with the `Authorization: Bearer` and `anthropic-version` headers (`.flow/bin/protocol-routine-handoff.test.mjs`).
- [ ] Given the doc, then it says the trigger token is shown once and must be stored as a secret (same test file).
- [ ] Given the doc, then it states the per-account limit of 100 per hour and that routine usage is shared with interactive sessions (same test file).
- [ ] Given the doc, then it names the auto-mode stall risk and says it is untested on a task that blocks (same test file).
- [ ] Given `changes/flow-0175.md`, then it states its caller action (`.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`).

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

None. Everything to carry over is quoted above, so the worker does not need PR #252.
