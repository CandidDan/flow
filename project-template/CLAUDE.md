# Project protocol — Claude Code

The protocol is not in this file. It lives in one place, `.flow/PROTOCOL.md`, and every agent
that works this repo reads that same copy. This file is the Claude Code entry point to it.

The next line is a Claude Code **import**, not a mention: Claude Code expands `@`-prefixed paths
and loads the target into context at session start, so the protocol arrives in full every session.
Leave it outside backticks and outside code fences — import parsing skips both, and a pointer that
silently does not resolve is worse than no pointer at all.

@.flow/PROTOCOL.md

<!--
Maintainer notes (stripped before this file reaches context, so they cost no tokens):

  * The import path is relative to THIS file, so it stays correct wherever the repo is checked
    out. Claude Code follows imports up to four hops deep; this is one.
  * Do not paste the protocol back into this file. Two copies drift, and the copy an agent
    happens to read stops being the one anyone maintains. Edit `.flow/PROTOCOL.md` instead.
  * `AGENTS.md` points at the same file with a plain-English instruction, because the AGENTS.md
    convention defines no import mechanism. One protocol, two doorways.
  * To confirm the import resolved in a live session, run `/context` and look for
    `.flow/PROTOCOL.md` under **Memory files**.
  * The ONE deliberate exception to "do not paste the protocol back into this file" is the
    `notes`/`asks` split below. It is restated, not pasted: four lines and three examples, with
    the protocol named as authoritative. `asks.test.mjs` asserts that both copies name all three
    kinds, so the duplication cannot drift silently — which is the only condition under which a
    second copy is allowed to exist here.
-->

## The split this file repeats on purpose: `notes` vs `asks`

The protocol above is authoritative. This one rule is restated here because it is the rule a
worker breaks while *following* the protocol correctly — it writes a careful handoff, and buries
in it the one line a person had to see.

| Field | Read by | Holds |
|---|---|---|
| `notes` | the next **session** | what is done, what only looks done, branch/PR, the exact next action |
| `asks` | the **human** | the open items only a person can act on — three kinds, nothing else |

```yaml
asks:
  - "decision: v2 or v3 in the schema id? Recommend: v3, the id should say the shape"
  - "follow-up: the retry path needs its own task, it is out of scope here"
  - "fyi: the fixture store moved, so a stale checkout fails one test"
```

A `decision` **must** carry `Recommend:`. `flow-doctor` fails a malformed ask; `flow-state
--json` reports them parsed. Resolving an ask removes it from `asks` and records the answer in
`notes`.

## Project notes

Everything below is *this project's* context — the things a fresh session cannot derive from the
codebase. It is deliberately separate from the protocol above: the protocol is identical in every
Flow repo, these notes are not.

Keep this file within the **`claude_md_max`** declared in `.flow/config.yml`, and note what that
bounds: the **resolved import set** — this file *plus every file Claude Code loads from it by
`@`-import*, followed transitively and counted once each. So **the protocol counts.** It is
imported above and arrives in full every session; what it stopped counting against is `wc -c
CLAUDE.md`, and that is why `wc -c` is not the measurement and is not sufficient — halving it by
moving prose behind an import *increases* what a session loads.

Run `node .flow/bin/check-claude-md.mjs --entry CLAUDE.md` for the real total, the headroom, and a per-file breakdown
largest-first; the gate runs the same command and fails over the ceiling.

What is being bounded is **adherence**, not window space. Nothing is running out — measured live,
this block was 1.4% of a 1M-token window. The cost of a large always-on instruction block is that
every rule competes with every other rule for attention, and that does not improve as windows grow.

<!-- Replace this list when you adopt Flow. INIT.md and RETROFIT.md both walk you through it. -->

- **What this project is:** _one or two lines — what it does and who for._
- **Stack and layout:** _where the code lives, and anything surprising about how it is organised._
- **Local commands:** _how to run it, beyond the five gate commands in `.flow/config.yml`._
- **Conventions that differ from the defaults:** _the corrections you would otherwise retype._
- **Scars:** _the mistakes that have already been made here once._
