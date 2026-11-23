---
id: "flow-0238"
title: "Every task says why and where it came from"
status: "proposed"
priority: 3
project: "flow"
owner: ""
created: "2026-11-23"
started: ""
branch: ""
pr: ""
issue: ""
intent: "work-readable-outside-the-project"
serves: ["G11"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: ""
accepted_at: ""
accepted_via: ""
touches:
  - "project-template/.flow/tasks/_TEMPLATE.md"
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "project-template/.flow/bin/task-origin.mjs"
  - "project-template/.flow/bin/task-origin.test.mjs"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "project-template/.flow/bin/flow-doctor.test.mjs"
  - "project-template/.flow/config.yml"
  - ".flow/config.yml"
  - "changes/flow-0238.md"
labels: [task-writer, flow-doctor]
model: "opus"
effort: "high"
model_reason: "Changes the published task template, the task-writer skill and flow-doctor, which every adopting repo runs after its next sync."
notes:
  - "2026-11-23: Written from the TanPlan project thread 'Add why section rule to Flow tasks'. The wording of the section and the check is reused from CandidDan/tanplan-platform PR #557 (task tanplan-0575): .claude/skills/task-writer/LOCAL.md and scripts/task-origin.mjs."
  - "2026-11-23: Checked _flow-sync.yml: sync copies .flow/bin/, .flow/PROTOCOL.md and canonical-named skill directories, but never .flow/tasks/ (so not _TEMPLATE.md) and never .flow/config.yml. That is why the template change and the config key are a caller action in the changelog, not something sync does."
asks: []
---

## Why and where this came from

- **Asked by:** Dan, in the TanPlan project chat on 23 Nov 2026. He opened TanPlan task
  tanplan-0538 ("Free minutes codes work on bundles bought online") and had no idea why it existed.
  The origin was only in the task's `notes`, which sit in the frontmatter and which he does not
  read. His words: "Can we ensure that when tasks are written it includes a section on why and
  where the task came from." He then asked for the rule to live in Flow, for every Flow repo.
- **Where it was agreed:** intent `work-readable-outside-the-project` (approved by CandidDan on
  5 Nov 2026), whose outcome is that a developer who has never seen the project can open any task
  and say what it is for. TanPlan already built a local version in CandidDan/tanplan-platform
  PR #557. Written on 23 Nov 2026 in the TanPlan thread "Add why section rule to Flow tasks".
- **The problem:** a task file is written for the worker session. It says what to change, but not
  who asked, why, or where it was agreed, so the person who approves and merges the work cannot
  tell why it exists. TanPlan kept its fix local because the next Flow sync would overwrite an edit
  to the shared skill, so every other Flow repo still has the gap.
- **What this task does about it:** puts the section in Flow's own task template and task-writer
  skill, and adds a warn-only flow-doctor check, so every Flow repo gets the rule on sync and
  TanPlan can drop its local copy.

## Context

The four-line section TanPlan uses (from `.claude/skills/task-writer/LOCAL.md` on PR #557):

```markdown
## Why and where this came from

- **Asked by:** who asked, by name, and how. Quote their words when you have them. If nobody
  asked (a review finding, a CI failure, a follow-up from another task), say that and name what
  raised it.
- **Where it was agreed:** the intent and its PR, the issue, the PR whose review raised it, or
  "No intent". Then the date and where the task was written.
- **The problem:** two or three plain sentences. What goes wrong today, for whom, with a real
  example or number where there is one. No code names here; those belong in Context.
- **What this task does about it:** one sentence. When the task is one of a set, say which part
  it is.
```

TanPlan's rules for it: use facts from the conversation, the intent, the issue or the PR; never
invent a name, date or quote; write "Not recorded" when the asker is unknown and tell the human;
keep `notes` too, because `notes` are for the next session and this section is for a person; do
not add it to a task that is `done` or `cancelled`.

TanPlan's check (`scripts/task-origin.mjs` on PR #557) reports a task that is not `done` or
`cancelled`, was created on or after a cutoff date, and has no `## Why and where this came from`
heading or an empty section. It warns and exits 0. Its tests are `scripts/task-origin.test.mjs`
on the same PR. Reuse its logic; do not copy the TanPlan-specific cutoff or paths.

How things reach an adopting repo today (`.github/workflows/_flow-sync.yml`, header comment):

| Path | Reaches adopters on sync? |
|---|---|
| `.flow/bin/*` (flow-doctor, the new module) | yes |
| `.claude/skills/task-writer/SKILL.md` | yes (a repo's `LOCAL.md` beside it is kept) |
| `.flow/tasks/_TEMPLATE.md` | **no**, sync never touches `.flow/tasks/` |
| `.flow/config.yml` | **no**, it is per repo |

The cutoff follows the existing pattern of `tasks.accept_from` and `intents.required_from`: a dated
key in `.flow/config.yml`, forward-only, so no old task is ever asked to backfill. The parsing to
copy is `parseAcceptFromText` and `acceptCutoff` in `project-template/.flow/bin/acceptance.mjs`.

## Scope

1. **Template.** In `project-template/.flow/tasks/_TEMPLATE.md`, add `## Why and where this came
   from` as the first body section, above `## Context`, with the four labelled lines exactly as in
   Context above. Change the `## Context` placeholder text so it no longer says it holds "the
   problem in the human's words": Context is now the technical background a worker needs (files,
   prior tasks, design links), and the human's problem lives in the new section.
2. **Skill.** In `project-template/.claude/skills/task-writer/SKILL.md`, add a Procedure step that
   requires the section on every new task, with TanPlan's rules listed in Context above (facts
   only, "Not recorded", keep `notes`, not on `done`/`cancelled`). In an intent-adopted repo,
   "Where it was agreed" names the intent id. Add the check to the Pre-flight list (flow-doctor
   already runs there, so no new command).
3. **Check.** New module `project-template/.flow/bin/task-origin.mjs`, exporting the parse of
   `tasks.origin_from` and a findings function, wired into `flow-doctor.mjs` beside the
   `acceptanceFindings` block. It returns **warnings only, never problems**. For each task whose
   status is not `done` or `cancelled` and whose `created` is on or after `tasks.origin_from`, warn
   when:
   - the body has no `## Why and where this came from` heading, or
   - the section is empty, or
   - any of the four labels (`**Asked by:**`, `**Where it was agreed:**`, `**The problem:**`,
     `**What this task does about it:**`) is missing or has no text after it. "Not recorded"
     counts as text.
   Each warning names the task id and what is missing. When `tasks.origin_from` is not set,
   flow-doctor prints exactly one warning saying the check is off and naming the key to set,
   the same way it treats an unset `intents.required_from`. When the value is not a `YYYY-MM-DD`
   date, one warning saying so.
4. **Config.** Add `tasks.origin_from` with an explaining comment to
   `project-template/.flow/config.yml` (beside `accept_from`) and to canonical's own
   `.flow/config.yml`, set to the date the PR is opened.
5. **Changelog.** `changes/flow-0238.md`, with the caller action: on the sync PR that brings this
   in, (a) add `tasks.origin_from: "<today>"` under `tasks:` in `.flow/config.yml`, (b) copy the
   new section from the template into the repo's own `.flow/tasks/_TEMPLATE.md` on `main`, and
   (c) delete any local copy of this rule (for TanPlan: the "Every task says why" and "Pre-flight"
   sections of `.claude/skills/task-writer/LOCAL.md`, and `scripts/task-origin.mjs` with its test
   and its entry in `.flow/config.yml`'s `test` command).

**Not in scope:**
- No change to `_flow-sync.yml`. Making sync write into `.flow/tasks/` crosses the store-guard
  and is a separate decision.
- No change to `.flow/PROTOCOL.md`.
- No backfill of existing tasks in canonical or any repo.
- Removing TanPlan's local copy. That is a TanPlan task after its sync PR merges.
- Nothing in this task fails the gate or blocks a worker: the check warns only.

## Acceptance criteria

- [ ] Given `project-template/.flow/tasks/_TEMPLATE.md`, when its body is read, then the first
  `## ` heading is `## Why and where this came from` and the section contains the four labels
  `**Asked by:**`, `**Where it was agreed:**`, `**The problem:**` and
  `**What this task does about it:**`.
- [ ] Given the task-writer `SKILL.md`, when it is read, then it names the heading
  `## Why and where this came from`, each of the four labels, and the "Not recorded" rule.
- [ ] Given `tasks.origin_from: "2026-11-24"` and a `ready` task created 2026-11-25 with no
  section, when flow-doctor runs, then it prints one warning naming that task id and the missing
  section, and exits 0 when nothing else is wrong.
- [ ] Given the same config and a task created 2026-11-25 with the section but an empty
  `**The problem:**` line, when flow-doctor runs, then it warns naming that task and that label.
- [ ] Given the same config and a task created 2026-11-25 with all four labels filled (one of them
  "Not recorded"), when flow-doctor runs, then it prints no origin warning for that task.
- [ ] Given the same config, when a task was created 2026-11-23, or its status is `done` or
  `cancelled`, then flow-doctor prints no origin warning for it, with or without the section.
- [ ] Given a config with no `tasks.origin_from`, when flow-doctor runs over tasks with no
  section, then it prints exactly one warning naming the key `tasks.origin_from` and no per-task
  origin warnings. Given `tasks.origin_from: "next week"`, it prints one warning that the value is
  not a date.
- [ ] Given the heading and label strings, when the template, the skill and `task-origin.mjs` are
  compared, then all three use the same text (one test reads all three files, so they cannot
  drift apart).
- [ ] Given `project-template/.flow/config.yml` and canonical's `.flow/config.yml`, when they are
  parsed with the new module, then each yields a valid `tasks.origin_from` date.
- [ ] Given `changes/flow-0238.md`, it states the caller action in Scope item 5. Proved by
  `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- The template's fixture task `project-template/.flow/tasks/0001-newsletter-signup.md` predates
  any sensible `origin_from` date, so it should not warn. If a test runs flow-doctor over the
  template store and it does warn, set the template config's date after the fixture's `created`;
  do not edit the fixture (it is outside `touches`).
- If `npm test` does not pick up `task-origin.test.mjs` by glob, that is a scope signal: stop and
  block rather than editing `package.json`, which is outside `touches`.
