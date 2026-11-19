---
id: "flow-0235"
title: "The template denies reads of secret files"
status: "proposed"
priority: 3
project: "flow"
owner: ""
created: "2026-11-19"
started: ""
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: ["flow-0234"]
accepted_by: ""
accepted_at: ""
accepted_via: ""
touches:
  - "project-template/.claude/settings.json"
  - "project-template/.flow/bin/template-settings.test.mjs"
  - "changes/flow-0235.md"
labels: [template, security]
model: "sonnet"
effort: "medium"
model_reason: "Well specified: a fixed list of rules in one JSON file, with the matching syntax to be checked against the docs."
notes:
  - "2026-11-19: Written from the Claude Code best-practices review (reports/claude-code-best-practices-vs-flow.md, item 4). blocked_by flow-0234 because both edit the same settings file and their touches overlap."
asks:
  - "fyi: Force-push is deliberately NOT denied. The protocol has a worker rebase onto main after its draft PR is already pushed, which needs git push --force-with-lease. Protect main with branch protection on GitHub instead."
  - "fyi: Same reach limit as flow-0234. flow-sync never touches .claude/settings.json, so only repos set up after this release get the rules. Existing repos copy them by hand."
---

## Context

The template's `.claude/settings.json` has hooks but no `permissions`. Nothing stops a session
from reading a `.env` file or `~/.ssh`. A `Read(...)` deny rule applies in every permission mode.
It stops the Read tool and common shell readers such as `cat`. It does not stop a script that opens
the file, so it narrows the risk and does not remove it.

## Scope

- Check the rule syntax in https://code.claude.com/docs/en/permissions.md before writing, and use
  the documented form.
- Add `permissions.deny` to `project-template/.claude/settings.json` with exactly these reads, each
  at the repo root and at any depth: `.env`, `.env.local`, `.env.development`, `.env.staging`,
  `.env.production`, and `.git-credentials`. Also deny `~/.ssh/**`.
- `.env.example` and similar files stay readable. Do not deny `.env.*` as a whole.
- Deny nothing about `git push`, `main`, or `.flow/tasks/`. Flow commits task state to `main` on
  purpose.
- Keep the `hooks` block exactly as flow-0234 leaves it.
- Add `changes/flow-0235.md`: no caller action to receive the release; to get the rules, copy
  `permissions.deny` from the template's `.claude/settings.json` into the repo's own.
- Not in scope: `allow` or `ask` rules, sandbox settings, canonical's own `.claude/`, `flow-sync`.

## Acceptance criteria

- [ ] `project-template/.claude/settings.json` is valid JSON and has `permissions.deny` containing
  a rule for each file listed above at the root and at depth, plus `~/.ssh/**`.
- [ ] No deny rule matches `.env.example`. No deny rule mentions `push`, `main` or `.flow`.
- [ ] The `hooks` block is unchanged from the version on `main` when this task is claimed.
- [ ] `changes/flow-0235.md` exists and states the caller action above. Proved by
  `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] All five gate commands pass and coverage stays at or above the floor.

The first three are proved by `project-template/.flow/bin/template-settings.test.mjs`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

None.
