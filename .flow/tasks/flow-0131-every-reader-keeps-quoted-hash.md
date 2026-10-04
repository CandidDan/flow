---
id: "flow-0131"
title: "Every frontmatter reader keeps a quoted '#', not only flow-doctor's"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-10-04"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Queue cap. Runs after flow-0119 merges (it adds yamlScalar/stripYamlComment to flow-doctor.mjs)."
blocked_by: ["flow-0119"]
serves: ["maintenance"]
touches:
  - "project-template/.flow/bin/flow-recover.mjs"
  - "project-template/.flow/bin/flow-recover.test.mjs"
  - "project-template/.flow/bin/pick-task.mjs"
  - "project-template/.flow/bin/pick-task.test.mjs"
  - "project-template/.flow/bin/source-roots.mjs"
  - "project-template/.flow/bin/source-roots.test.mjs"
  - "project-template/.flow/bin/check-claude-md.mjs"
  - "project-template/.flow/bin/check-claude-md.test.mjs"
  - "project-template/.flow/bin/flow-doctor.mjs"
  - "changes/flow-0131.md"
labels: [flow-infra, parsing]
notes:
  - "2026-10-04 orchestrator: found in the code review on #175 (flow-0119). The frontmatter readers did `value.split('#')[0]`, which truncates any quoted value containing a '#', such as 'see PR #127'. flow-0119 fixes parseListField and scalarReader in flow-doctor.mjs and exports yamlScalar/stripYamlComment. The same pattern remains at flow-recover.mjs:234, pick-task.mjs:64, source-roots.mjs:115, check-claude-md.mjs:235, and flow-doctor.mjs:153/173/574/587."
---

## Context

YAML treats `#` as a comment only outside quotes and after whitespace. Several Flow readers cut
every value at its first `#`. A `blocked_reason: "waits for PR #172"` is therefore read as
`"waits for PR`. pick-task and flow-recover make decisions from these fields.

## Scope

- Replace each `split("#")[0]` reader with flow-doctor's exported `yamlScalar` /
  `stripYamlComment`, or use the same logic where an import would cross a sync boundary.
- Add one regression test per reader: a quoted value carrying `#` is read whole, and an
  unquoted value with a trailing ` # comment` is still cut.

## Acceptance criteria

- [ ] No `split("#")` remains in `project-template/.flow/bin/*.mjs` outside tests, and a test greps for it.
- [ ] pick-task, flow-recover, source-roots and check-claude-md each read `"x #1"` as `x #1`, each proven by a test.
- [ ] Every reader still drops a trailing unquoted ` # comment`, proven by a test.
- [ ] `changes/flow-0131.md` exists, with no caller action.
