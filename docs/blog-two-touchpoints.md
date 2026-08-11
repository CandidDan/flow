# Two touchpoints: making AI coding agents trustworthy

There's a moment, the first time you let an AI coding agent run on its own, that feels like magic — and a second moment, about an hour later, that doesn't. The agent finished. It says it's done. And now you're reading every line it wrote, re-running the tests yourself, checking whether it quietly broke something three files away. You've become a babysitter with extra steps.

That's the real problem with autonomous coding, and it isn't capability. The models are good enough to do the work. What's missing is a system that makes the agent's "done" mean **done** — trustworthy enough that you don't have to watch. Without it, autonomy collapses straight back into supervision.

Flow is my answer to that. The whole design is organised around one promise:

> **You approve the spec going in, and the pull request coming out. Everything in between runs itself.**

Two touchpoints. That's the bar. Every part of the system exists to keep it there.

## How it actually works

Flow is a thin protocol that lives **inside the repo** — not a dashboard, not a SaaS, not a database. The work is plain Markdown files in `.flow/tasks/`, committed to `main`. Git is the coordination layer; your existing CI is the engine.

The loop is three beats:

1. **Spec.** You and Claude turn a piece of direction into a *task* — and a task isn't a vibe, it's a contract: observable acceptance criteria, the exact files it's allowed to touch, and an explicit boundary. The rule is that a task is only "ready" if a fresh session could complete it with zero further questions. If it can't, it isn't ready yet.

2. **Build, behind a gate.** A fresh Claude Code worker claims the task, branches, and implements it — and here's the part that matters: it **cannot open a pull request** until it clears a hard Definition of Done. Every acceptance criterion has to have a test that exercises it, checked by name. A security review and a code review have to pass. Build, lint, tests, and a coverage floor have to be green. "Looks good to me" is not in the vocabulary.

3. **Merge.** You read the PR — each criterion ticked, each with the test that proves it — and you merge. Done.

Several workers run at once. Claiming a task is an atomic, first-push-wins commit to `main`; a `touches` list on each task keeps two workers out of the same files. There's no orchestration daemon and no lock server — coordination is just git doing what git already does.

## The two honest escape hatches

A system that *only* runs on the happy path is lying to you. Flow has exactly two places where a human touchpoint is added back, on purpose:

- A **kickback**: you don't like something on the PR, so you ask for changes.
- A **blocked** task: the worker hits a real decision the spec didn't settle, and instead of guessing, it stops and surfaces it.

That second one is the behaviour I've come to value most. **The most useful thing an AI agent can do is refuse to guess.** A blocked task isn't a failure of the model — it's the model declining to fabricate, which is exactly what you want from something you're not watching.

## Every failure becomes a guardrail

Flow wasn't designed on a whiteboard. It was hardened by getting burned, and the through-line of the whole project is this: **turn every incident into a permanent check.** A few of the scars:

- A parse error in an edge function — a duplicate declaration an old runtime tolerated and a new one didn't — silently dropped inbound messages for about a week. The gate had only ever run the app's tests; it never *parsed* that whole tree. The fix wasn't "be more careful." It was a rule: the gate now fails if there's any source tree it doesn't actually parse before merge.
- A worker did the entire job — built, tested, pushed its branch — and then ended its turn without opening the PR, leaving the task stranded. The fix was to take the model off the critical path: a workflow opens the PR on push, so a stall can't strand the work.
- A task got written but never pushed, so a cloud worker cloning `main` correctly couldn't see it and refused to invent it. The fix: a store check that fails loudly the instant a task exists on disk but not on `main`.

None of these were clever features. They were missing checks, discovered the hard way, then made non-skippable. The system gets safer the more it's used — and the agent's job is never to remember the rule, it's to run into the guard.

## Is this not just… spec-driven development?

Fair question — and worth being honest about. This space got crowded fast. "Spec-driven development" (Kiro, GitHub's Spec Kit, Tessl, and friends) emerged in 2025 as the field's answer to vibe-coding's drift: treat the spec as the primary artifact, the code as a regenerable output. Orchestration platforms (Vibe Kanban, Conductor, Claude Squad, Cursor's background agents) give you a board to run agents in parallel with diff review and merge control. Claude Code itself now ships much of this natively — `CLAUDE.md` as the project constitution, subagents, a tasks system.

So no, Flow didn't invent the category. If anything, converging on the same shape as the rest of the field is reassurance that the shape is right: everyone got burned by the same thing and reached for specs and gates.

What's distinctive about Flow is the *flavour*:

- **It's git-native, not a platform.** The store is files on `main`; the board is a generated view; the engine is your CI. There's nothing to adopt, host, or be locked into. Most orchestrators are an app that sits *beside* your repo. Flow lives *in* it.
- **The gate has teeth.** Plenty of tools generate tasks and implement them. Fewer make a PR physically unable to open until every acceptance criterion is mapped to a passing test. That criterion-to-test gate is the load-bearing wall.
- **It hardens itself.** The back-port-the-incident-into-a-check discipline is the actual product. The protocol you'd copy is small; the value is the accumulated set of guards.

Put plainly: Flow is spec-driven development with teeth, implemented as a protocol in your repo rather than a product you log into — and arrived at empirically, by watching what broke.

## The point

The interesting work in AI engineering right now isn't the model writing code. It's building the harness that lets you stop watching it — and the unglamorous truth is that the harness is mostly *checks*: a definition of done you can't bypass, an agent that blocks instead of guessing, and a habit of turning every failure into a guard.

Get that right and the magic from the first hour comes back, and stays. You give the work. The system keeps the promise. You approve the spec, and you approve the PR.
