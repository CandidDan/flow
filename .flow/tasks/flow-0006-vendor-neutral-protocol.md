---
id: "flow-0006"
title: "Make the protocol vendor-neutral so any coding agent can work a Flow task"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-08-11"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
touches: ["project-template/.flow/PROTOCOL.md", "project-template/CLAUDE.md", "project-template/AGENTS.md", "project-template/INIT.md", "project-template/RETROFIT.md"]
labels: [infra, portability]
notes: []
---

## Context

Flow is closer to agent-agnostic than it looks. Measured, not assumed: **six of the nine reusable
workflows have no vendor binding at all** (`gates`, `status`, `done`, `open-pr`, `recover`, `sync`),
and the three that do (`queue-runner`, `review`, `triage`) are exactly the opt-in automation tier
that ships disabled. The gate does not care who wrote the code — `touches-guard` fails a scope
violation identically whoever produced it, and `flow-status` reads the branch name, not the author.

The remaining binding in the *protocol* layer is a filename. Claude Code auto-loads `CLAUDE.md`;
other agents look for their own conventions. **Nothing in the tooling reads `CLAUDE.md`
programmatically** — every occurrence in `.flow/bin/` is a comment or a test fixture — so the name is
convention, not dependency, and the cost of neutralising it is close to zero.

Why now rather than when a second agent appears: a business standardising on Flow is betting its
entire delivery process on one vendor's CLI. Doing this before that matters makes it a config choice;
doing it after makes it a migration.

## Scope

- Move the protocol body to **`.flow/PROTOCOL.md`** — the store, lifecycle, concurrency, the loop,
  the gate, hard rules. Verbatim; this task moves text, it does not rewrite it.
- `CLAUDE.md` and `AGENTS.md` become **thin pointers** to it, each using its host's native
  include/import mechanism where one exists and an explicit "read this file first" instruction where
  one does not. Project-specific notes stay in the host file — they are genuinely per-agent context.
- Update `INIT.md` and `RETROFIT.md` where they name the protocol file.
- **Verify the pointer actually loads**, per criterion below. A pointer an agent silently ignores is
  worse than the status quo: the protocol would appear adopted and be absent.

Deliberately **not** in scope: the three vendor-bound automation workflows (a Codex equivalent is
separate work, and they are opt-in), and the review subagents (flow-0007).

## Acceptance criteria

- [ ] Given a repo scaffolded from the template, when the protocol text is compared between `.flow/PROTOCOL.md` and the pre-change `CLAUDE.md`, then the protocol sections are identical apart from the heading level.
- [ ] Given `CLAUDE.md`, when it is read, then it contains the pointer to `.flow/PROTOCOL.md` and no duplicated copy of the protocol body.
- [ ] Given `AGENTS.md`, when it is read, then it points at the same single file — there is exactly one copy of the protocol in the repo.
- [ ] Given a Claude Code session opened in a scaffolded repo, when it is asked to state a hard rule it was not told in the prompt (e.g. what happens to a PR that modifies `.flow/tasks/`), then it answers correctly — proving the pointer resolved.
- [ ] Given the repo, when `grep -rn "CLAUDE.md" .flow/bin/` runs, then every remaining hit is a comment or test fixture and none is a file the code opens.
- [ ] Given `wc -c CLAUDE.md`, when measured on a scaffolded repo, then it is well under the 25k budget, with the protocol no longer counted against project notes.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Verify each host's current include syntax before writing it** — the conventions in this space
  move quickly, and a stale mechanism fails silently rather than loudly. Check the vendor's own docs
  at implementation time; do not copy a syntax from memory or from this task.
- If a host inlines the imported file, the context cost is unchanged — this is a de-duplication and
  portability change, not a context saving. Do not claim otherwise in the PR.
- **This task and flow-0005 both declare `project-template/INIT.md`.** That is intentional and
  handled: a `ready` task whose `touches` overlap an `in_progress` one is skipped, so they serialise
  rather than collide. Whichever runs second rebases. No action needed — it is the concurrency model
  working.
