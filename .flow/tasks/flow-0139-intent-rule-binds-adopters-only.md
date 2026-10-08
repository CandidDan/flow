---
id: "flow-0139"
title: "The intent rule binds only a repo that has adopted intents, so task-writer no longer refuses product work everywhere else"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-10-08"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "project-template/.claude/skills/task-writer/SKILL.md"
  - "project-template/.flow/PROTOCOL.md"
  - "project-template/README.md"
  - ".flow/bin/intent-derivation-docs.test.mjs"
  - ".flow/bin/protocol-portability.test.mjs"
  - "changes/flow-0139.md"
labels: [flow-infra, hotfix, urgent]
notes:
  - "2026-10-08 (orchestrator): URGENT, applied by Dan 2026-10-08. ORIGIN: progress#126's qa flagged the task-writer diff in the 3.2.1 sync. flow-0074 (shipped 3.2.0) made task-writer's Procedure step 6 UNCONDITIONAL: product work must name an intent already on main, otherwise 'say so to the human and stop'. It also points at an `intent-writer` skill that does not exist (flow-0072, unbuilt). No adopter has `.flow/intents/` intents or `intents.required_from`, so in every repo on 3.2.x the task-writer now refuses all product tasks. flow-doctor was correctly gated (store + date); the prose was not. The PROTOCOL.md hard rule and the intro's 'approves the intent up front' have the same overreach."
  - "2026-10-08 (orchestrator): qa's other point, that task-writer is 'repo-owned' and R1–R5 removal is unreviewed, is wrong and out of scope here: task-writer is a canonical skill that sync replaces wholesale (flow-0081), and progress keeps R1–R5 in CLAUDE.md by Dan's decision (2026-10-06, progress#123)."
---

## Context

flow-0074 rolled the intent rule out warn-first and forward-only in flow-doctor: active only when
`.flow/intents/` exists, and binding only on tasks created on or after `intents.required_from`.
The prose it shipped alongside is not gated. Task-writer step 6, Pre-flight 4, the PROTOCOL hard
rule and the touchpoint paragraph all apply to every repo, and they name an `intent-writer` skill
that does not exist yet. Since no adopter has adopted intents, task-writer now stops on all
product work.

## Scope

**Does:**
- task-writer Procedure step 6 and Pre-flight 4 apply **only when the repo has adopted intents**
  (`.flow/intents/` exists **and** `.flow/config.yml` sets `intents.required_from`). Otherwise
  `intent` is left empty and the task is written as before.
- Remove the `intent-writer` skill reference until that skill ships (flow-0072). Say "the intent is
  written and merged in its own PR, by the human or in a separate session".
- PROTOCOL.md: the hard rule and the touchpoint paragraph state the same condition. Record the new
  Hard-rules digest in `protocol-portability.test.mjs`.
- README.md: the touchpoint sentence states the same condition.
- Update `intent-derivation-docs.test.mjs` so it requires the condition and forbids an
  `intent-writer` reference.
- Changelog fragment.

**Does not touch:** flow-doctor (already correctly gated), the task template, any intent file.

## Acceptance criteria

- [ ] task-writer's Procedure and Pre-flight make the intent requirement conditional on the repo
      having adopted intents, naming both signals (`.flow/intents/` and `intents.required_from`),
      and say what to do otherwise (leave `intent` empty, write the task as before).
- [ ] Neither task-writer, PROTOCOL.md nor README.md references an `intent-writer` skill.
- [ ] PROTOCOL.md's hard rule and touchpoint paragraph, and README's touchpoint sentence, state the
      adopted-intents condition.
- [ ] The synced suite passes in a simulated adopter (template copied to a repo root with its own
      stub CLAUDE.md and task template).
- [ ] build + lint + test + coverage pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.
