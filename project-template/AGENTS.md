# Agent instructions

## Read the protocol first — it is not in this file

**Before you do anything else, open and read `.flow/PROTOCOL.md` in full.**

That file is the contract you work under: the task store, the status lifecycle, the concurrency
rules, the loop you run, the gate a PR must pass, and the hard rules. It is not optional context
and it is not a reference to consult later — a session that skips it will break the rules it has
not read, and the first sign of that is a rejected PR.

The AGENTS.md convention defines no import or include mechanism, so this pointer is a plain
instruction rather than a directive your host expands. Acting on it is your responsibility. If
you cannot read `.flow/PROTOCOL.md`, stop and say so rather than proceeding without it.

There is exactly **one** copy of the protocol in this repo. `CLAUDE.md` imports the same file
for Claude Code. Do not copy the protocol into this file, and do not follow a stale copy of it
from anywhere else.

## Writing tasks, not just executing them

Everything above is the **worker's** contract: claim a `ready` task, execute it, open a PR. If
this session is instead acting as the **orchestrator** — turning a human's direction into new
`ready` tasks rather than picking one up — `PROTOCOL.md` already told you where to look, in its
"Creating a task (orchestrator)" paragraph: read `.claude/skills/task-writer/SKILL.md` in full and
follow it. That is not repeated here.

Two companion skills the procedure itself calls out, which `PROTOCOL.md` does not point at with
the same precision: `.claude/skills/vision-writer/SKILL.md` if the repo has no `VISION.md` yet
(every task's `serves` needs one to resolve against — `PROTOCOL.md` never names this skill), and
`.claude/skills/board-builder/SKILL.md` to regenerate `.flow/board.html` after writing or changing
tasks (`PROTOCOL.md` names it but gives no path, relying on Claude Code's skill-name resolution —
an agent that only follows the AGENTS.md convention has no such resolution). Read each in full
before using it — they are short, load-bearing procedures, not references to skim.

The authority rule does not change with which agent is running it: the human decides what
matters — priority, direction, and every goal or non-goal in `VISION.md`. Decomposition into
tasks is the orchestrator's job; inventing priority is not, regardless of which model is doing
the writing.

## Project notes

Everything below is *this project's* context — the things a fresh session cannot derive from the
codebase. The protocol above is identical in every Flow repo; these notes are not.

<!-- Replace this list when you adopt Flow. INIT.md and RETROFIT.md both walk you through it. -->

- **What this project is:** _one or two lines — what it does and who for._
- **Stack and layout:** _where the code lives, and anything surprising about how it is organised._
- **Local commands:** _how to run it, beyond the five gate commands in `.flow/config.yml`._
- **Conventions that differ from the defaults:** _the corrections you would otherwise retype._
- **Scars:** _the mistakes that have already been made here once._
