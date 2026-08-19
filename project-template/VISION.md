# Vision — <project name>

<!-- THIS FILE SHIPS AS A SHAPE, NOT AS CONTENT. Every angle-bracket slot below is a placeholder
     and means nothing until a human replaces it. Fill it in with the `vision-writer` skill
     (`.claude/skills/vision-writer/SKILL.md`) — it interviews you rather than reading the repo,
     which is the whole point: a vision written by describing what the code already does can only
     ever report "on course", and will do so right up to the moment you give up on the project.

     WHAT IT IS FOR. One page, always. This is the drift anchor: the orchestrator reads it before
     writing any task, every task's `serves:` names a goal id declared here, and flow-doctor fails
     a `ready` task whose `serves` doesn't resolve against it. Delete this file and the vision
     layer goes quiet — flow-doctor drops to a single warning and stops checking `serves`.

     HEADING SHAPE IS LOAD-BEARING. Ids are extracted by a line regex, never by a Markdown parser:

         ### G<n> — <title>        a goal
         ### NG<n> — <title>       a non-goal

     The separator may be an em dash, an en dash or a hyphen (humans type all three), and the
     title must not be empty. A heading that starts `### G1` but doesn't match the shape is
     reported as malformed rather than silently dropped — so a mistyped dash is noisy, not fatal.

     ID RULES — APPEND-ONLY, NO EXCEPTIONS.
       · Never renumber. `serves: ["G2"]` on a task merged a year ago must still mean the same
         thing today; renumbering rewrites every one of those references at once, silently.
       · Never reuse. A retired id stays reserved forever. The next new goal takes the next unused
         number, not the freed one.
       · Retiring is a move, not a delete: the heading moves under `## Retired` with a one-line
         reason and keeps its id. Tasks still pointing at it get a warning — that is the signal
         you want, not something to tidy away.
       · Promoting a non-goal is not an edit in place: retire the NG id and add a new G id. "We
         changed our minds about this" is a fact worth keeping.
       · Every material change appends a row to the change log at the bottom, with the reason.

     CHANGES ARE A BRANCH AND A PR, NEVER A DIRECT COMMIT TO MAIN. This file sits on the code
     plane on purpose, so the PR machinery you already have reviews it. That is what makes
     evolution mechanically distinguishable from drift: divergence with a reviewed vision change
     is evolution, divergence without one is drift. -->

<One paragraph. What this is, who it is for, and what changes for them — in the human's own
words, not a feature list. Then state the audience as a **decision**: solo tool, team tool, or
product; and whether a multi-user option is *preserved* (kept possible, not built) or *foreclosed*
(deliberately ruled out). Say which, and say what each word costs — an audience nobody decided is
an audience every session infers differently. A stranger should be able to read this paragraph
plus the non-goals and correctly reject a plausible-but-wrong feature idea. If they couldn't,
sharpen it before you ship it.>

## Goals

<!-- Three to six. Fewer than three is usually one goal wearing a hat; more than six is a backlog.
     Each is an OUTCOME that could fail, not a feature that could ship, and each ends with a
     *Progress looks like:* line naming what you would observe if it were working — that line is
     what the flow-compass audit reads when it asks whether the work is actually advancing. -->

### G1 — <the first outcome, one line, stated so it could fail>

<Two or three sentences: what has to be true for this to hold, and the tension it is under —
what pulls against it. *Progress looks like:* <the observable you would point at to say this is
being met, not a feature name>.>

### G2 — <the second outcome>

<As above. Keep going to G3–G6 as needed; stop when the next one is a task, not a direction.>

## Non-goals

<!-- Humans under-supply these, and they are the half that does the rejecting. Each names
     something plausible you are NOT doing, and *why* — the reason is what survives contact with
     a tempting idea six months from now. -->

### NG1 — <something plausible this deliberately does not do>

<Why not. The reason matters more than the refusal: "no, because a thing that must be operated
eventually isn't" rejects a whole class of future ideas; a bare "no" rejects only this one.>

### NG2 — <a second one — the tempting adjacent thing>

<Why not, and what would have to change for it to become a goal. If the answer is "an amendment
here first", say so.>

## Retired

<!-- Retired goals keep their ids forever and are never renumbered or reused. This section starts
     as "*None yet.*" — the example below shows the shape; delete it when you write the real
     thing. A task that still `serves` a retired id gets a warning, which is the point. -->

### G3 — <a goal that is no longer pursued>

*Retired <YYYY-MM-DD>: <one line — why it stopped being a goal. Not "done"; a goal that has been
achieved is still a goal you are holding.>*

## Change log

<!-- Append-only, newest at the bottom. The PR review is the touchpoint; this table is the
     history. A material edit with no row here is the drift this whole layer exists to catch. -->

| Date | Change | Why |
|---|---|---|
| <YYYY-MM-DD> | Initial vision. | <Why now — what decision or confusion prompted writing it down.> |
