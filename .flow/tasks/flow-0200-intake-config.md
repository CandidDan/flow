---
id: "flow-0200"
title: "Add an `intake:` block to the config template, read by one parser that trusts no labeler by default"
status: "in_progress"
priority: 3
project: "flow"
owner: "session_01NfrcU8RK5GP8XRT3wkjgry"
created: "2026-11-03"
started: "2026-11-03T12:14:09Z"
branch: "flow/flow-0200-intake-config"
pr: "https://github.com/CandidDan/flow/pull/283"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G11"]
intent: ""
touches:
  - "project-template/.flow/config.yml"
  - "project-template/.flow/bin/intake-config.mjs"
  - "project-template/.flow/bin/intake-config.test.mjs"
  - "changes/flow-0200.md"
labels: [intake, config, adr-0010]
model: "opus"
effort: "high"
model_reason: "Defines the default of the trust list every later intake check reads; a parser that defaults to trusting anyone, or misreads a list, opens the write-capable triage agent to public text"
notes:
  - "2026-11-03 orchestrator: ADR-0010 task 6 of 6, written first because tasks 1, 3 and 4 read its parser. Derives from docs/adr/0010-intake-lanes.md, accepted when Dan merged CandidDan/flow#277 (b81de46). Canonical has no intent file for intake; the merged ADR is the approval, so `intent` is empty and flow-doctor's missing-intent warning on this task is expected."
  - "2026-11-03 orchestrator: Dan set intake.trivial.max_changed_lines = 20, counted as additions plus deletions."
asks: []
---

## Context

ADR-0010 (`docs/adr/0010-intake-lanes.md`, §6) adds an `intake:` block to a consuming repo's
`.flow/config.yml`. Three later tasks read it: label-actor verification (`trusted_labelers`), the
size classifier (`classifier_model`) and the diff-size check (`trivial.max_changed_lines`). This
task adds the block to the template and one parser they all import, so the defaults are decided in
one place.

Dan's answer to the ADR's open question: `max_changed_lines` is **20**, counted as **additions plus
deletions** across the PR's diff.

## Scope

1. `project-template/.flow/config.yml` gains a commented `intake:` block:
   ```yaml
   intake:
     trusted_labelers: []        # logins whose `flow:trusted` label is believed; empty trusts none
     classifier_model: "haiku"   # a tier name from task-model.mjs
     trivial:
       max_changed_lines: 20     # additions + deletions; above this an intake: auto PR fails a check
   ```
   `trusted_labelers` is **empty** in the template. ADR §6's `inflight-flow[bot]` is a placeholder;
   the comment says a consuming repo sets its own App's `<slug>[bot]` login.
2. New `project-template/.flow/bin/intake-config.mjs` exporting `readIntakeConfig(configText)`,
   returning `{ trustedLabelers: string[], classifierModel: string, maxChangedLines: number }`.
   Use the tolerant line-scan house style (no YAML dependency), as `parseQueueCap` does in
   `allocate-task-id.mjs`.
3. Fragment `changes/flow-0200.md`: **No caller action** — the block is optional and every default
   is the restrictive one.

**Does not:** read the config from any workflow, verify any label, classify anything, or add
`intake:` to canonical's own `.flow/config.yml` (canonical does not run the intake lanes).

## Acceptance criteria

- [ ] `intake-config.test.mjs`: given config text with no `intake:` block, `readIntakeConfig`
      returns `trustedLabelers: []`, `classifierModel: "haiku"`, `maxChangedLines: 20`.
- [ ] `intake-config.test.mjs`: given `trusted_labelers: ["inflight-flow[bot]", "other[bot]"]`
      (inline list) and the same as a block list (`- "inflight-flow[bot]"` lines), both return
      exactly those two logins, in order, with quotes stripped.
- [ ] `intake-config.test.mjs`: given `trusted_labelers: []`, an empty value, or a malformed value
      (for example an unterminated `[`), it returns `[]` — never a list containing a wildcard,
      an empty string, or the raw malformed text.
- [ ] `intake-config.test.mjs`: given `max_changed_lines: 50` it returns `50`; given `0`, a
      negative number, a non-integer or non-numeric text it returns the default `20`.
- [ ] `intake-config.test.mjs`: a `trusted_labelers:` key that appears under a different top-level
      block (for example under `review:`) is not read as the intake list.
- [ ] `intake-config.test.mjs`: the template file `project-template/.flow/config.yml`, run through
      `readIntakeConfig`, yields `trustedLabelers: []` and `maxChangedLines: 20`.
- [ ] `changes/flow-0200.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run coverage`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

## Notes / open questions

`classifier_model` is returned as written. Deciding what an unknown tier means is the classifier
task's job (it fails closed to `normal`), not this parser's.
