---
id: "flow-0240"
title: "Install Claude Code from npm in the review checks, not from the download site"
status: "in_review"
priority: 2
project: "flow"
owner: "session_01NfrcUCGdo6GcBvWugscEm1"
created: "2026-11-26"
started: "2026-11-26T04:03:45Z"
branch: "claude/project-thread-b6oro8"
pr: "https://github.com/CandidDan/flow/pull/323"
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: "CandidDan"
accepted_at: "2026-11-26T04:00:00Z"
accepted_via: "chat"
touches:
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/_flow-pr-text.yml"
  - ".github/workflows/_flow-kickback.yml"
  - ".flow/bin/claude-code-install-workflow.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0240.md"
labels: [workflows, urgent]
model: "opus"
effort: "high"
model_reason: "Edits three reusable workflows that every adopting repo calls; a mistake breaks the fleet's review checks at once."
notes:
  - "2026-11-26: Found on CandidDan/tanplan-platform. Since 25 Nov, 11 of 96 flow-review jobs failed at claude-code-action's install step: `curl https://claude.ai/install.sh` got HTTP 403 on all three attempts. Every failure ran on the self-hosted Hetzner runners, which share one public IP; neighbouring jobs on the same server succeeded. Dan ruled it a real bug, not a re-run (26 Nov)."
asks: []
---

## Why and where this came from

- **Asked by:** Dan, in the TanPlan project ("Claude Code install 403 in review checks is a real bug, not 'just rerun'", 26 Nov 2026).
- **Where it was agreed:** TanPlan project thread "Speed up CI runs", then thread "Fix Claude Code install in review checks".
- **The problem:** `claude-code-action` downloads the Claude Code CLI from `claude.ai/install.sh` on every job. From a self-hosted runner whose public IP is shared by many jobs, the download site sometimes answers 403, and the check fails before any review runs.
- **What this task does:** installs a pinned `@anthropic-ai/claude-code` from the npm registry in each job and points the action at it with `path_to_claude_code_executable`.

## Context

`anthropics/claude-code-action` at the pinned SHA `6fed3ca145920b639991cb756090506e1bcaf515` (v1.0.245) installs Claude Code `2.1.293` in `src/entrypoints/run.ts` (`installClaudeCode`) by piping `https://claude.ai/install.sh` to bash, three attempts. Its input `path_to_claude_code_executable` (declared in `action.yml`) skips that install and uses the given binary instead.

`@anthropic-ai/claude-code@2.1.293` on npm ships the same native binary through per-platform optional dependencies (`@anthropic-ai/claude-code-linux-x64` and so on); its `postinstall` copies the binary into place and downloads nothing else. So the npm registry is the only host involved.

## Scope

**Does:**
- Each of `_flow-review.yml`, `_flow-pr-text.yml` and `_flow-kickback.yml` declares the Claude Code version once, as top-level `env.FLOW_CLAUDE_CODE_VERSION`, set to the version the pinned action installs (`2.1.293`).
- Every job that runs `claude-code-action` gains a step `id: claude-code`, right after `actions/setup-node`, that runs `npm install` of `@anthropic-ai/claude-code@$FLOW_CLAUDE_CODE_VERSION` into `$RUNNER_TEMP/claude-code`, retries three times, checks `claude --version` prints that version, and writes the binary's path to the step output `path`.
- That step is `continue-on-error: true`. If it fails, `path` is empty and the action falls back to its own download, as today, with a `::warning::` saying so. The review checks' pass or fail behaviour is otherwise unchanged.
- Every `claude-code-action` step in those files passes `path_to_claude_code_executable: ${{ steps.claude-code.outputs.path }}`.
- A test holds the three files to one version, and maps the pinned action SHA to the version it installs, so a bump of the action SHA fails the test until the version is checked and updated.
- `docs/flow-reusable-workflows.md` says how the pin is updated.

**Not in scope:** `_flow-triage.yml` and `_flow-compass.yml`. They also run the action, but their jobs have no `actions/setup-node` and run rarely (on issues and weekly). Follow-up.

## Acceptance criteria

- [ ] Given each of the three workflows, when parsed, then top-level `env.FLOW_CLAUDE_CODE_VERSION` is an exact `x.y.z` version and is the same in all three. Proved by "one exact Claude Code version across the workflows" in `claude-code-install-workflow.test.mjs`.
- [ ] Given every job in those files with a `claude-code-action` step, when parsed, then a step `id: claude-code` comes before the first such step, is `continue-on-error: true`, and runs `npm install` of `@anthropic-ai/claude-code@$FLOW_CLAUDE_CODE_VERSION` and checks the installed version. Proved by "every job installs Claude Code from npm before the action".
- [ ] Given every `claude-code-action` step in those files, when parsed, then `with.path_to_claude_code_executable` is `${{ steps.claude-code.outputs.path }}`. Proved by "every action step uses the npm install".
- [ ] Given the action SHA pinned in those files, when the test runs, then it maps to the Claude Code version that action release installs, and that equals `FLOW_CLAUDE_CODE_VERSION`. Proved by "the version matches what the pinned action installs".
- [ ] `changes/flow-0240.md` exists and states caller action: none.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or visibly skipped as out of its trigger paths · code-review check blocking items resolved · build + lint + test pass · coverage >= `coverage_min` (a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving test named.
