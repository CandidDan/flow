---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0018"
title: "Make the triage sweep able to find its own instructions in canonical, and check that every workflow prompt's cited path resolves"
status: "ready"
priority: 3
project: "flow"
owner: ""
created: "2026-08-19"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G4"]            # canonical can run the infra it publishes, and the drift is caught by a check
touches: [".github/workflows/_flow-triage.yml", ".flow/bin/workflow-prompt-paths.test.mjs"]
labels: [infra, dogfood, integrity]
notes:
  - "2026-08-19: this is the residual of flow-0015, not a duplicate of it. flow-0015 adds canonical's five missing thin callers (including .github/workflows/flow-triage.yml) and explicitly excludes reusables from its scope. This task fixes the reusable those callers invoke. touches are disjoint: flow-0015 owns flow-triage.yml, this owns _flow-triage.yml. Either can land first."
  - "2026-08-19: a second broken citation found while specifying this, not in the original report — the same prompt also cites .flow/tasks/_TEMPLATE.md, and canonical has no such file (only project-template/.flow/tasks/_TEMPLATE.md). Two sites, one root cause, and neither is caught by anything today. That is what makes the check the durable half."
  - "2026-08-19: touches intersected against every ready task on 2026-08-19 (flow-0003/0005/0007/0008/0012/0013/0014/0015/0016) and against flow-0017, written in the same batch. Disjoint from all. Note the deliberate choice of a NEW test file rather than .flow/bin/check-workflows.test.mjs, which flow-0013 declares — putting the check there would have made these two tasks sequential for no benefit."
---

## Context

flow-0015 wires canonical's five missing thin callers, `flow-triage.yml` among them, so that the
repo authoring Flow stops being the one repo exempt from running it. That closes the caller gap.
It does not close this one: `.github/workflows/_flow-triage.yml` — the reusable those callers
invoke — instructs the sweep to read **two repo-relative paths that do not exist in canonical**.

- `_flow-triage.yml:56` — *"following the 'Triaging the inbox' section of
  `.claude/skills/task-writer/SKILL.md` exactly"*. Canonical has **no root `.claude/` directory
  at all**. The skill lives at `project-template/.claude/skills/task-writer/SKILL.md`.
- `_flow-triage.yml:62` — *"the `.flow/tasks/_TEMPLATE.md` shape"*. Canonical's store holds task
  files only; there is no `_TEMPLATE.md` in `.flow/tasks/`. It lives at
  `project-template/.flow/tasks/_TEMPLATE.md`.

Both paths are correct for a repo scaffolded from `project-template/`, which is why nothing has
noticed. They are wrong for exactly one repo — the one that authors them.

The failure mode this produces is the bad kind. `anthropics/claude-code-action` reports success
whether or not the agent accomplished anything; the reusable's own header comment records this
happening before (*"the sweep burned its turns on denials and exited clean without proposing
anything — the action reports success either way, so it looked healthy for weeks"*). A sweep that
cannot find its instructions runs, finds nothing, exits 0, and shows a green tick. Nobody learns
anything until someone wonders why canonical's issue inbox never gets triaged.

Which is why the durable deliverable here is the **check**, not the two-line prose fix. Two cited
paths drifted from one structural fact about canonical, and neither was caught by anything —
`npm run build` parses every workflow file, but a YAML parser has no opinion about whether a string
inside a prompt names a file that exists. G4 asks for drift surfaced *by a check rather than by a
surprise*; the fix is what proves the check works.

## Scope

**Does:**

- Correct both citations in `.github/workflows/_flow-triage.yml` so the sweep can locate the
  task-writer skill and the task template **in the repo it is running in**, canonical included,
  without either file being duplicated into canonical's root. Prompt prose only — no change to the
  workflow's triggers, permissions, `if:` gate, action version, or `claude_args`.
- Add `.flow/bin/workflow-prompt-paths.test.mjs`: a drift check over every file in
  `.github/workflows/` asserting that repo-relative paths cited in workflow prompts resolve.
  Scanned dynamically from the directory, never a hardcoded file list, so a workflow added later
  is covered without anyone remembering to add it. An **empty scan is a failure, not a pass** —
  same rule `check-workflows.mjs` states for `build`.

**Deliberately does NOT:**

- **Create a root `.claude/` directory in canonical, or a `.flow/tasks/_TEMPLATE.md`.** See the
  first note below — this is decided, not open.
- **Add or edit any thin caller.** `.github/workflows/flow-triage.yml` is flow-0015's; the
  template's `project-template/.github/workflows/flow-triage.yml` carries no prompt and needs no
  change. A caller and its reusable are separate files by design, which is what makes this
  parallel-safe with flow-0015 in either landing order.
- **Change any other reusable**, even one whose prompt the new check turns out to flag. If the
  check finds a second offender, that is a note for the orchestrator and a new task — not silent
  extra work, and not a reason to loosen the check.
- **Enable anything.** The reusable stays gated on `vars.FLOW_AI == 'true'`. Enablement is a
  human-only step (see notes) and is not an acceptance criterion.

## Acceptance criteria

- [ ] Given `.github/workflows/_flow-triage.yml` after this change, when every repo-relative path
      its prompt cites is resolved against canonical's checkout, then each one resolves to a file
      that exists — specifically the task-writer skill and the task-template shape are both
      locatable from canonical's repo root.
- [ ] Given the same file, when it is diffed against its previous version, then the change is
      confined to the prompt text: `on:`, `permissions:`, the job's `if:` condition, the
      `anthropics/claude-code-action` version and its non-prompt inputs are byte-identical.
- [ ] Given `.flow/bin/workflow-prompt-paths.test.mjs`, when it runs against the repo as it stands
      **before** the prompt fix is applied, then it fails and names both offending citations —
      the check demonstrably catches the bug it was written for, rather than being fitted to
      already-passing code.
- [ ] Given every file under `.github/workflows/`, when the check runs, then each repo-relative
      path cited in a prompt resolves at canonical's repo root, **or** under `project-template/`
      and is covered by a stated exclusion; any path resolving in neither place fails the check
      naming the file, the line and the path.
- [ ] Given a workflow directory containing no files, or containing files from which no citation
      is extracted, when the check runs, then it **fails** — a check that scanned nothing must not
      report success.
- [ ] Given the check's failure message, when it fires, then it names each exclusion in force and
      why, so the reader can tell a deliberate carve-out from a hole.
- [ ] Given the repo after this change, when `npm ci`, `npm run build`, `npm run lint`, `npm test`
      and `npm run coverage` all run, then every one passes and coverage stays at or above
      `coverage_min`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **Canonical does not get a root `.claude/` or a second `_TEMPLATE.md` — decided, do not
  re-litigate.** Three reasons, in order of weight. (1) Both would be *copies* of files canonical
  already holds under `project-template/`, and "adopt by reference, never by copy" is G4 itself —
  a duplicate `_TEMPLATE.md` would start drifting the moment flow-0012 lands, since that task
  edits the template's copy to add `serves`. (2) The root `CLAUDE.md` already directs every
  session in this repo to read the skills at `project-template/.claude/`, so pointing the workflow
  at the same place makes the automation do what canonical's own protocol already prescribes,
  rather than inventing a third arrangement. (3) `CLAUDE.md` records the absence of a root
  `.claude/agents/` as deliberate, with flow-0007 owning where those files end up; adding a
  sibling `.claude/skills/` now would pre-empt that decision. **A symlink is not the escape
  hatch:** `CLAUDE.md` already records symlinks resolving somewhere surprising in this repo, and
  agent skill-discovery through a symlinked directory is unverified — the failure would again be
  silent.
- **`.claude/agents/**` is an expected exclusion from the resolves-at-repo-root half of the check,
  and must be stated as one in the failure message.** No workflow cites an agent path today — this
  is forward cover. flow-0007 moves the review agents into CI and will decide where they live; a
  check that hard-fails on agent paths before that lands would redden flow-0015's PR for a
  decision neither task owns. Once flow-0007 has merged, removing this exclusion is a one-line
  follow-on and should be raised as one.
- **Match the claim, not one phrasing.** Extract citations by shape — a repo-relative path ending
  in a file extension, appearing inside a prompt block — rather than by grepping the two strings
  that are wrong today. A check pinned to the current wording stops working the moment someone
  rewords the prompt, which is precisely when it is needed.
- **Human-only enablement, and why it matters here.** The triage sweep is inert until a human sets
  the repo variable `FLOW_AI=true` and adds the `CLAUDE_CODE_OAUTH_TOKEN` secret (from
  `claude setup-token`). Neither is in this task's scope and neither is an acceptance criterion —
  a worker cannot do them. Record them on the PR so the merge does not read as "triage is now
  running". **Sequencing warning for the human:** if flow-0015 lands and `FLOW_AI` is switched on
  before this task merges, canonical's triage sweep will run against unresolvable instructions and
  report success. Enable after both.
- Priority 3, below flow-0015 at P2. Nothing is broken for adopting repos today — both cited paths
  resolve in a scaffolded repo — and canonical's sweep is not wired yet, so there is no live
  failure to race. It sits above flow-0016 (P4) because it is a prerequisite for a P2 task
  actually working.
