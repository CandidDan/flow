---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0050"
title: "Enforce the CLAUDE.md ceiling against resolved context, not file bytes"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-15"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G9"]
touches:
  - "project-template/.flow/bin/check-claude-md.mjs"
  - "project-template/.flow/bin/check-claude-md.test.mjs"
  - ".flow/bin/check-claude-md.mjs"
  - "project-template/.flow/config.yml"
  - ".flow/config.yml"
  - "project-template/CLAUDE.md"
  - ".github/workflows/_flow-gates.yml"
  - "CHANGELOG.md"
labels: [infra, gate, context]
notes:
  - "2026-09-15 (orchestrator): `serves` is G9, and the fit is exact rather than convenient. G9 says 'No threshold is set deliberately; if one is ever set, it belongs here.' `claude_md_max` is a token-cost threshold, so by G9's own words the number's existence is a vision matter. This task does NOT amend VISION.md — that is vision-writer's job on its own branch, and it is the human's call. Flagging it so the amendment is a decision someone makes rather than one this task makes by omission."
  - "2026-09-15 (orchestrator): the honest justification is adherence, not space. Measured in a live CandidDan/Nudge session: CLAUDE.md was 14.2k tokens against a 1M window — 1.4%, with 75.7% of the window free. Nothing is running out. The cost of a large always-on instruction block is that every rule competes with every other rule for adherence, and that does not improve as windows grow. Do not let a reviewer talk this into a 'context pressure' framing; the data refutes that framing and the task does not rest on it."
  - "2026-09-15 (orchestrator): this task was written as flow-0049 and renumbered to flow-0050 within minutes — another session had allocated flow-0049 (queue-runner-summary) concurrently, and the collision only surfaced on `git pull --rebase` after the first push. flow-doctor caught it as a duplicate id. Recording it as live evidence for flow-0021 (atomic task id allocation), which is still `ready`: `allocate-task-id.mjs` exists and I did not use it, which is exactly the failure mode a manual id pick invites."
  - "2026-09-15 (orchestrator): sequencing — `touches` overlaps flow-0047 (CHANGELOG.md, in_progress) and flow-0048 (CHANGELOG.md, ready). Per the concurrency rule this task waits for a clear window rather than running alongside either. It is otherwise independent of both: flow-0048 fixes what flow-sync copies, this fixes what the gate measures."
---

## Context

`project-template/CLAUDE.md` imposes a ceiling on every adopting repo:

> Keep this file well under **25k characters** (`wc -c CLAUDE.md`). The protocol no longer counts
> against that budget, so the whole allowance is available for real project knowledge.

Two problems, and the second is why the first matters.

**The ceiling is unenforced.** It is a sentence in a template. `CandidDan/Nudge` sat at 36,338
characters — 45% over — with nothing reporting it. Every other number Flow cares about
(`coverage_min`) fails the gate. This one is advice.

**The stated measurement is wrong.** `wc -c CLAUDE.md` does not measure what the sentence claims.
`@.flow/PROTOCOL.md` on line 11 of that same file is a Claude Code **import**: the target is
resolved and loaded into the context window at session start, in full. The template knows this —
it says "the protocol arrives in full every session" seven lines earlier, and tells the reader to
verify via `/context` → **Memory files**. So the protocol very much still counts; it just stopped
counting against `wc -c`.

The two sentences contradict each other, and the file is the published artefact every repo copies.

The consequence is not academic. A repo can halve `wc -c CLAUDE.md` and *increase* the context it
loads, by moving prose behind an import. Nudge's adoption PR does exactly that, honestly and with
the arithmetic stated: `CLAUDE.md` drops 36,338 → 25,630 while the session gains the full
23,753-character protocol. A ceiling measured with `wc -c` would have called that an improvement of
10,708 characters. It is a regression of roughly 13,000.

**A check that measures file bytes is defeated on day one by canonical's own template.** That is
the specific thing this task exists to prevent.

## Why the number is per-repo and the mechanism is not

This is the `coverage_min` shape, and it is deliberate. The enforcement is generic — every Flow repo
has a `CLAUDE.md`, every one auto-loads it into every session, every one suffers the same dilution.
The number cannot be: a repo carrying generated routing tables needs a different allowance from one
that does not. So: **`claude_md_max` is declared per-repo in `.flow/config.yml`; the check that
enforces it is shared infra authored here.** No second config idiom.

## What the check must measure

The resolved set, not the file:

1. Start at the repo-root `CLAUDE.md`.
2. Find `@`-prefixed import paths, resolved relative to the file containing them.
3. Follow them transitively, to Claude Code's depth limit of 5 hops.
4. Count each unique file once (a diamond import is not double-counted).
5. Sum the bytes. That total is what the ceiling applies to.

Two parser rules are load-bearing, and both come from the template's own text: imports inside
inline backticks and inside fenced code blocks are **not** imports (Claude Code's parser skips
both — it is why the template says "Leave it outside backticks and outside code fences"), and an
`@` path that does not resolve to a file is a **failure**, not a zero. The template's reason is
already written down: "a pointer that silently does not resolve is worse than no pointer at all."
A repo that adds the import without copying `.flow/PROTOCOL.md` has a `CLAUDE.md` with no protocol
in it and no error anywhere — this check is what catches that.

## Acceptance criteria

- [ ] Given a `CLAUDE.md` containing `@other.md`, when the check runs, then the reported total is
      the sum of both files' bytes, not `CLAUDE.md`'s alone.
- [ ] Given a chain `CLAUDE.md` → `a.md` → `b.md`, when the check runs, then all three are counted;
      and given a chain 6 files deep, then only the first 5 hops are followed and the check says so
      in its output.
- [ ] Given two files that both import `shared.md`, when the check runs, then `shared.md`'s bytes
      are counted exactly once.
- [ ] Given a `CLAUDE.md` whose only `@path` occurrence is inside backticks or inside a fenced code
      block, when the check runs, then it is not treated as an import and the total equals
      `CLAUDE.md`'s own size.
- [ ] Given a `CLAUDE.md` with `@missing.md` that resolves to no file, when the check runs, then it
      exits non-zero naming the unresolved path — it does not count it as zero and pass.
- [ ] Given a repo whose resolved total exceeds `claude_md_max`, when the check runs, then it exits
      non-zero and prints a per-file breakdown ordered largest first, so the output names which file
      to cut.
- [ ] Given a repo whose resolved total is at or below `claude_md_max`, when the check runs, then it
      exits zero and prints the total and the headroom.
- [ ] Given a `.flow/config.yml` with no `claude_md_max` key, when the check runs, then it exits
      zero with an explicit "no ceiling declared" warning on stdout — adoption must not break the
      fleet — and `flow-doctor` reports the missing key as uncalibrated.
- [ ] Given a repo with no `CLAUDE.md` at the root at all, when the check runs, then it exits
      non-zero. An empty check is a failure, not a pass — the same rule `build` and `lint` follow.
- [ ] Given `project-template/.flow/config.yml`, when it is read, then it declares a default
      `claude_md_max` alongside `coverage_min`, commented with what it measures.
- [ ] Given `project-template/CLAUDE.md`, when the budget paragraph is read, then it no longer
      claims the protocol does not count against the budget, and it states that the ceiling applies
      to the resolved import set with `wc -c` named as insufficient.
- [ ] Given `.github/workflows/_flow-gates.yml`, when the `gate` job is read, then the check runs as
      a step in it, after the config read, and a failure fails the gate.
- [ ] Given `.flow/bin/check-claude-md.mjs`, when it is read, then it is a thin adapter importing
      the template's exported logic and supplying only the CLI shell and canonical's store location
      — not a copy, and not a symlink.
- [ ] Given `npm run coverage`, when it runs on this branch, then it is at or above 83.5.
- [ ] Given `CHANGELOG.md`, when the entry is read, then it names the caller action: an adopting
      repo must add `claude_md_max` to `.flow/config.yml` or the check warns, and a repo that adds
      the `@.flow/PROTOCOL.md` import without the file present will now fail the gate rather than
      loading a `CLAUDE.md` with no protocol in it.

## Scope boundaries

**Does not** pick canonical's own `claude_md_max` value as a judgement call — set it from the
measured resolved total of this repo with headroom stated in the PR description, and say what the
measured number was. The human adjusts it; do not tune it to make the gate green.

**Does not** amend `VISION.md`. See the first note: G9 says a threshold belongs there, and that is
vision-writer's branch and the human's decision, not this task's.

**Does not** trim `project-template/.flow/PROTOCOL.md`. At 23,753 characters it is the largest
single block of always-on context in every Flow repo and shortening it is the only change that
actually reduces anything — but it is a separate, judgement-heavy task, and bundling a prose edit
into a gate change would make both harder to review.

**Does not** touch `_flow-sync.yml` or what it copies. That is flow-0048.

**Does not** change any repo's `CLAUDE.md` other than `project-template/`'s budget paragraph.

**Does not** add a warn-only mode, a second threshold, or a per-file ceiling. One number, one
behaviour, matching `coverage_min`.
