---
id: "flow-0141"
title: "A PR that changes what a person sees carries key screenshots and, for motion, a recording"
status: "in_progress"
priority: 3
project: "flow"
owner: "claude-session-012CTneThg94vo5drhs7QSEY-w0141"
created: "2026-10-09"
started: "2026-10-09T03:40:35Z"
branch: "flow/flow-0141-pr-visual-captures"
pr: "https://github.com/CandidDan/flow/pull/200"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
intent: "pr-visual-captures"
touches:
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/.claude/skills/show-me/SKILL.md"
  - ".flow/bin/show-me.test.mjs"
  - "changes/flow-0141.md"
labels: [review, protocol]
notes:
  - "2026-10-09 (orchestrator): ORIGIN. Dan, verbatim: 'in Presence pr #2 codex added screenshots and a screen recording to the pr this was a massive help. Can we add this as guidance as well where it would benefit and is possible key screenshots and recordings are added'. Reference PR: https://github.com/CandidDan/presence/pull/2 (section 'Review captures': one .webm scroll recording linked, two PNGs inline, desktop and mobile, all pinned to a commit SHA)."
  - "2026-10-09 (orchestrator): DECIDED, do not re-litigate. (1) Guidance, not a check: no CI job asserts a capture exists (the intent's open question 'should a check flag a missing capture' is answered no for this task; a check would need to know what is visual, which is judgement). (2) The procedure lives in show-me/SKILL.md, not a new skill: a new skill directory must be added to CANONICAL_SKILLS in flow-review.mjs and _flow-sync.yml's header, which overlaps flow-0140's touches; show-me is already the 'show, don't tell' skill and is loaded for every PR description. (3) PROTOCOL.md gets one clause only, in the PR-description order sentence: the protocol counts against claude_md_max and depth belongs in the skill. (4) Captures never travel on the feature branch: they would trip touches-guard and land binaries on main. They go on an orphan branch `captures/<task-id>` (not `flow/…`, which flow-status would parse as a task branch), linked by commit SHA so a later push cannot change what the reviewer saw."
  - "2026-10-09 (orchestrator): UNBLOCKED. Intent pr-visual-captures merged (PR #194, approved by Dan). blocked_by cleared; status ready. The queue-cap part of the old blocked_reason is moot for a transition: the cap governs new allocations, and Dan asked for this work."
---

## Context

The human's merge touchpoint is the weak one (VISION G10): PR text is long, and a green check
says nothing about whether a visible change looks or moves right. Presence PR #2 showed the fix:
two screenshots and a short recording let the change be judged by looking. Flow's PR description
order (`PROTOCOL.md` *Response style*, and show-me's `## PR description`) has no place for that,
so workers add captures only by chance.

## Scope

**Does:**

- `PROTOCOL.md`, *Response style*, the PR-description order sentence: add **captures** after
  "one visual of the change" and before the criteria checklist, with the condition in a few
  words ("when the change is something a person sees and the session can run it"). One clause;
  no new section.
- `show-me/SKILL.md` `## PR description`: insert step 3 **Captures** (renumber the rest), and add
  a `## Captures` section covering, briefly:
  - **When:** the diff changes something a person sees or interacts with (UI, rendered page,
    email, generated visual), and the session can run it. Not for backend, infra, docs or
    tooling-only diffs.
  - **What:** the fewest frames that show the change: the changed state at each layout that
    differs (typically desktop and mobile); before/after when an existing screen changed; a
    short recording (≤ 30 s, `.webm` or `.gif`) only when the change is motion or a multi-step
    interaction.
  - **Where:** push to an orphan branch `captures/<task-id>` (never the feature branch, never
    a `flow/…` name), then link by commit SHA. Give the exact URL form for an inline image and a
    linked recording.
  - **When not possible:** the section still appears, as one line, `Not captured: <reason>`
    (no runnable preview, no browser in the environment). An absent section and a stated skip
    must be distinguishable, as with the security check.
  - **Data:** synthetic data only; never a real user's data, a credential, a token or a
    production screen.
  - **Tooling:** whatever headless browser the environment already has (Playwright with a
    preinstalled Chromium is typical); never add it to the repo's dependencies to take a capture.
- Tests in `.flow/bin/show-me.test.mjs` (below), and `changes/flow-0141.md`.

**Does not:** add a CI check or a workflow step; add a new skill directory; change
`review-guide.mjs`, the review prompts or the qa check; clean up old `captures/*` branches (name
that as a `follow-up` ask if you think it is needed); touch Presence or any adopter.

**Verify before writing the URL form.** Canonical is public, so any form renders here. Pick the
form that also renders inline for a viewer of a **private** repo, check it against GitHub's docs
or by rendering a test PR body through the REST API (`Accept: application/vnd.github.html+json`
on the PR, then inspect the `img` src), and say in the PR description which you verified and how.
Do not guess. (Presence PR #2 used `raw.githubusercontent.com`, which does not render for a
private repo without a token.)

## Acceptance criteria

- [ ] Given `PROTOCOL.md`'s *Response style* section, then the PR-description order names TL;DR,
      visual, captures, criteria checklist, to-dos in that order, and the captures clause carries
      its condition. Proved by the existing order test in `.flow/bin/show-me.test.mjs`, extended
      to include "captures".
- [ ] Given `show-me/SKILL.md`, then `## PR description` lists Captures as step 3 between the
      visual and the criteria, and a `## Captures` section exists. Proved by a new test in
      `.flow/bin/show-me.test.mjs`.
- [ ] Given that `## Captures` section, then it states each of: the condition (something a
      person sees, and the session can run it); the `captures/<task-id>` orphan branch and that
      captures never go on the feature branch; SHA-pinned links; the `Not captured: <reason>`
      line; synthetic data only; and that the tool is never added to the repo's dependencies.
      Proved by a new test asserting each, named so qa can map it.
- [ ] Given the template's resolved import set, then `node .flow/bin/check-claude-md.mjs --entry
      CLAUDE.md` still passes under `claude_md_max` (existing gate; state the before/after byte
      count of `PROTOCOL.md` in the PR).
- [ ] Given `changes/flow-0141.md`, then it exists and states the caller action ("none; adopters
      receive the guidance at their next sync"). Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
