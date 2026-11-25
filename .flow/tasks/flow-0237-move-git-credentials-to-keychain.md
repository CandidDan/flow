---
id: "flow-0237"
title: "Move the git credentials file out of the flow project folder"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-11-19"
started: ""
branch: ""
pr: ""
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: "human-only: needs Dan's Mac"
cancelled_reason: ""
blocked_by: []
accepted_by: "CandidDan"
accepted_at: "2026-11-25T06:38:29Z"
accepted_via: "inflight"
touches: []
labels: [human-only, security]
notes:
  - "2026-11-19: Written from the Claude Code best-practices review (reports/claude-code-best-practices-vs-flow.md, item 10). The file was never opened or printed by any session while writing this."
  - "2026-11-25 (CandidDan via inflight): accepted"
  - "2026-11-25: worker picked up, set blocked at once per Scope (human-only). Credentials file not opened."
  - "2026-11-25: worker set blocked, human-only: needs Dan's Mac. Credentials file not opened."
asks:
  - "fyi: This is a task only Dan can do, on his Mac. No code changes and no PR, so Flow cannot move it to done. After doing it, cancel it with cancelled_reason 'Done by hand on <date>'. Accept it only when you are about to do it, so no worker picks it up first."
---

## Context

`/Users/danimal/Projects/flow/.git-credentials` (123 bytes) holds a Git login in plain text. It is
gitignored (`/.git-credentials` in `.gitignore`), so it will not be committed. But any Claude
session with access to that folder can read it, and a `Read()` deny rule does not stop a script
that opens the file. macOS has a credential helper that keeps the login in the Keychain instead.

## Scope

This task is done by Dan, by hand, on his Mac. **A worker that picks this task up must set it
`blocked` at once** with `blocked_reason: "human-only: needs Dan's Mac"`. Do not open, print or
copy the credentials file.

Steps, in order:

1. In a terminal, run `git config --show-origin --get-all credential.helper`. Note which entry
   points at `.git-credentials` (it will say `store --file ...`).
2. Put the helper in place: `git config --global credential.helper osxkeychain`.
3. Load the login into the Keychain without showing it:
   `printf 'url=%s\n\n' "$(head -n1 /Users/danimal/Projects/flow/.git-credentials)" | git credential approve`
4. Check it works from a different folder, with the file still in place:
   `cd ~ && git ls-remote https://github.com/CandidDan/flow HEAD`. It must print a commit id and
   must not ask for a password.
5. Delete the file: `rm /Users/danimal/Projects/flow/.git-credentials`. Remove any
   `credential.helper` entry from step 1 that points at it.
6. Run step 4 again. It must still work.
7. Recommended: revoke the old token on GitHub and create a new fine-grained one, then repeat steps
   3 to 4 with it. Any session that had access to the folder could have read the old one.

## Acceptance criteria

- [ ] `/Users/danimal/Projects/flow/.git-credentials` does not exist.
- [ ] `git config --show-origin --get-all credential.helper` lists `osxkeychain` and no
  `store --file` entry.
- [ ] `cd ~ && git ls-remote https://github.com/CandidDan/flow HEAD` prints a commit id without a
  password prompt.
- [ ] `git status` in the flow folder shows no new changes caused by this task.

These are checked by Dan by running the commands. There is no automated test, because the task
changes no repository file.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

Other project folders on the Mac may hold the same kind of file. Check with
`ls -a ~/Projects/*/.git-credentials` (it lists names only; do not open them).
