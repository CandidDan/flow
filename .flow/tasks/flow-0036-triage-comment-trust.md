---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0036"
title: "Extend flow-triage's authorship trust boundary to comments, not just issue selection"
status: "in_review"
priority: 1
project: "flow"
owner: "claude/flow-0036-triage-comment-trust"
created: "2026-08-31"
started: "2026-09-01T02:40:02Z"
branch: "flow/flow-0036-triage-comment-trust"
pr: "https://github.com/CandidDan/flow/pull/51"
issue: ""
blocked_reason: ""
serves: ["G1"]             # same rationale as flow-0027: the approve-the-spec touchpoint is only
                            # real if nothing else can reach the queue — a comment is "something else"
touches: [".github/workflows/_flow-triage.yml", ".flow/bin/triage-author-trust.test.mjs", "CHANGELOG.md"]
labels: [infra, triage, integrity, security]
notes:
  - "2026-08-31: this is the residual half of the finding flow-0027 fixed, raised by the security
    check on flow-0027's own PR and deliberately left unfixed there as out of scope for that task.
    flow-0027 filters WHICH ISSUES the sweep works, by the issue's own author_association. It does
    not filter what the agent reads once it is working an admitted issue. The triage agent runs
    with `--permission-mode bypassPermissions` and full `gh`/bash access (see
    `.github/workflows/_flow-triage.yml`'s claude-code-action step); it is hand a bare issue NUMBER
    and independently calls `gh` to read that issue's content to draft a proposal — nothing
    pre-filters that read. So an issue opened by a trusted collaborator (which passes flow-0027's
    filter) can still carry a comment from anyone — GitHub does not require comment authors to
    be collaborators — and that comment's text reaches the same agent, unfiltered, when it
    investigates the issue for context. A comment is a smaller attack surface than the open issue
    inbox flow-0027 closed, but it is the same shape of bug: authorship-based trust checked at
    the wrong layer."
  - "2026-08-31: the fix is a same-mechanism extension, not a stricter one. Rejected: never expose
    ANY comment content to the agent, trusted or not — this throws away the legitimate case (a
    trusted collaborator clarifying scope in a comment instead of editing the issue body), and
    flow-0027 itself did not take that route for the issue body; it filtered by trust rather than
    banning all issue content. Chosen: extend the SAME author_association filter flow-0027 already
    built and tested (`triage-author-trust.test.mjs` / the inbox step's `extractFilter()`) to
    comment authors, using the same `FLOW_TRIAGE_TRUSTED_ASSOCIATIONS` resolution so the two
    boundaries can never drift out of sync with each other."
  - "2026-09-01: touches widened, on main, to the radius this task body already mandates.
    As written, touches declared only _flow-triage.yml, while Scope and acceptance criterion 6
    require extending .flow/bin/triage-author-trust.test.mjs and adding a CHANGELOG.md entry.
    touches-guard ignores all of .flow/, so the test file was never going to fail the gate — but
    CHANGELOG.md did (decision=enforced, outside=1), and dropping the changelog entry to fit the
    declaration would have dropped a deliverable the spec names. Both paths are declared here so
    the declaration matches the spec; no path outside the two the task body already names has
    been added, and the change itself did not widen."
  - "2026-09-01: PR #51 open (draft), branch flow/flow-0036-triage-comment-trust. Genuinely
    done: the content step, the shared-resolution wiring, 13 new proving tests in
    .flow/bin/triage-author-trust.test.mjs, the CHANGELOG entry. Full local gate green (build 23
    workflows, lint 70 .mjs, test 773/772 pass 1 skip, coverage 95.47% vs floor 83.5);
    touches-guard decision=enforced reason=in-scope outside=0; branch does not touch .flow/tasks/.
    Decisions a fresh session should not re-litigate: (1) the comment filter deliberately has NO
    default trusted set and fails closed — it consumes the inbox step trusted output, which is the
    only reason the two boundaries cannot drift; do not add a DEFAULT_TRUSTED constant to it, a
    test asserts its absence. (2) The one edit to the existing inbox filter is the additive line
    publishing its already-resolved set as a step output; its filtering logic is untouched, per
    Scope. (3) Issue/comment text reaches the agent as FILES under runner.temp, never through a
    workflow expression — a test allow-lists the prompt interpolations. (4) touches was widened on
    main first (see the note above). Next action: none from the worker — the three review checks
    run on the PR; address any kickback on the same branch."
  - "2026-09-01: FOR THE ORCHESTRATOR — follow-on finding from the security check on PR #51
    (verdict PASS, no high/critical; this was its one Info row, marked no-action-for-this-PR).
    The content step withholds untrusted comment text mechanically, but the agent still runs with
    bypassPermissions and a github_token that can call `gh issue view` / `gh api`, so the only
    thing stopping it re-fetching the withheld thread is the prompt hard limit — guidance to a
    model, which is the exact distinction flow-0027 and flow-0036 both rest on. NOT a regression:
    the same is already true of issue SELECTION today (nothing mechanically stops the agent
    calling `gh issue list`). flow-0036 scoped this out by name (Deliberately does NOT: 'Remove
    the agent's gh/bash access, or its bypassPermissions posture'), so it is a separate task, not
    silent extra work here. Suggested shape: set `disallowed_tools` on the claude-code-action step
    so the read paths the prompt forbids are refused by the harness rather than by instruction,
    turning both backstops into bounds. Worth checking whether the same applies to
    _flow-review.yml and _flow-compass.yml before scoping."
---

## Context

`.github/workflows/_flow-triage.yml`'s `inbox` step (built in flow-0027) lists open issues via
`gh api`, filters them so only issues authored by someone in the trusted `author_association` set
(`OWNER`, `MEMBER`, `COLLABORATOR` by default, widened only by the repo variable
`FLOW_TRIAGE_TRUSTED_ASSOCIATIONS`) are handed to the agent step, by issue number.

That filter answers "which issues may the sweep work" — it says nothing about what the agent may
read once it is working an admitted one. The agent step is a `claude-code-action` run with
`--permission-mode bypassPermissions` and `gh`/bash tool access; given an issue number, it reads
that issue's content itself (there is no pre-fetched, pre-filtered body or comment text embedded in
the prompt). GitHub does not require a commenter to be a collaborator, so any account can comment
on an issue a trusted collaborator opened, and that comment's text is available to the agent the
same way the issue body is, with no trust check applied to it.

This means the trust boundary flow-0027 built is real but incomplete: it closes the "open an issue
yourself" vector and leaves the "comment on someone else's admitted issue" vector open. Both put
attacker-controlled text in front of an agent that drafts task specs and can create task files
directly (the `auto-ok` / `approved` lanes commit to `main` without further human review of the
draft's provenance). This was raised by the security check on flow-0027's own PR and explicitly
scoped out of that task as a separate finding — this task is that finding.

## Scope

**Does:**

- Extend `.github/workflows/_flow-triage.yml` so that, for each issue number admitted by the
  existing `inbox` step, its comments are fetched (`gh api repos/$GITHUB_REPOSITORY/issues/{n}/comments`)
  and classified by the commenting account's `author_association`, using the exact same trusted-set
  resolution the issue-level filter already uses (`FLOW_TRIAGE_TRUSTED_ASSOCIATIONS`, defaulting to
  `OWNER`/`MEMBER`/`COLLABORATOR`) — one resolution, not a second copy that can drift from the first.
- Assemble a trusted-only view of each admitted issue (body — already trust-gated by the issue-level
  filter — plus only the comments whose author passed the same check) and hand that to the agent as
  the issue's content, the same way the inbox step already hands over a vetted issue-number list
  rather than letting the agent list issues itself.
- Add a Hard limit to the agent's prompt, matching the existing "never re-list the inbox yourself"
  instruction in shape: the agent must treat the content it is handed as the complete view of the
  issue and must not independently call `gh issue view` / `gh api .../comments` to read a fuller
  thread. This is a backstop alongside the mechanical filter above, not a substitute for it — exactly
  the posture flow-0027 already takes for its own "do not re-list" instruction.
- Report excluded comments the same way flow-0027 reports excluded issues: a count and identifying
  detail (issue + comment id) in the run log / job summary, so a filtered injection attempt is
  visible rather than silently dropped.
- Extend the existing proving-test file (`.flow/bin/triage-author-trust.test.mjs`) with the comment
  filter's own tests, following its established pattern of extracting the pure filter function from
  the embedded workflow script and testing it directly — do not invent a second test file or a
  second testing convention for the same workflow.
- Add a `## Unreleased` entry to `CHANGELOG.md`, matching flow-0027's own entry in shape and detail,
  including a `[caller action: ...]` note stating whether this narrows behaviour by default for
  adopters (it does, in the same way flow-0027's issue-level filter did) and how to opt out via the
  existing `FLOW_TRIAGE_TRUSTED_ASSOCIATIONS` variable (both boundaries share the one variable —
  say so explicitly, so an adopter does not go looking for a second one).

**Deliberately does NOT:**

- **Touch the issue-level filter.** `extractFilter()` / the `inbox` step's own logic is correct and
  already tested; this task adds a comment-level companion, it does not modify the existing one.
- **Add a second trust variable.** Comments and issues share `FLOW_TRIAGE_TRUSTED_ASSOCIATIONS` —
  a repo that widens one boundary widens both, deliberately, so the two cannot silently diverge.
- **Remove the agent's `gh`/bash access, or its `bypassPermissions` posture.** That access is what
  lets it post proposals, apply labels and read issues at all; this task closes the untrusted-input
  path into it, it does not sandbox the agent itself. That is a materially larger change and not
  this task's problem to solve.
- **Touch `flow-0031` (action SHA pinning) or `flow-0033` (secrets scope, currently `in_progress`)**
  — both touch files in `.github/workflows/`, but neither overlaps `_flow-triage.yml`
  (checked, not assumed: flow-0031's touches list every `_flow-*.yml` **except** `_flow-triage.yml`
  is in flow-0031's list too — if flow-0031 lands first and also modifies `_flow-triage.yml`'s
  action pins, rebase onto it rather than treating that as scope creep).
- **Extend the same protection to `flow-compass` or any other workflow that reads issue/PR content.**
  If a parallel gap exists elsewhere, that is a separate finding for the orchestrator to write up,
  not silent extra work here.

## Acceptance criteria

- [ ] Given a comment on an admitted issue whose `author_association` is `NONE` or `CONTRIBUTOR`,
      when the sweep assembles what the agent receives for that issue, then the comment's text is
      excluded.
- [ ] Given comments from `OWNER`, `MEMBER` and `COLLABORATOR` authors on an admitted issue, when
      the sweep assembles what the agent receives, then all of them are included — the filter
      admits everyone who could already direct the repo, and no fewer, matching the issue-level
      filter's own bar.
- [ ] Given the repo variable `FLOW_TRIAGE_TRUSTED_ASSOCIATIONS` is set, when the comment filter
      resolves its trusted set, then it uses the exact same resolved set as the issue-level filter
      — proven by a test that both filters agree given the same environment, not by two filters
      that happen to be configured identically today.
- [ ] Given a sweep in which one or more comments were excluded, when the run finishes, then the
      count and identifying detail of excluded comments is reported in the run output, the same way
      excluded issues already are.
- [ ] Given `.github/workflows/_flow-triage.yml`, when a test parses the agent's prompt text, then
      it contains an instruction not to independently fetch or act on issue content beyond what the
      workflow supplies, and the test fails if that instruction is removed.
- [ ] Given `CHANGELOG.md`, when it is read, then a new `## Unreleased` entry describes this change
      in the same shape as flow-0027's entry, including a `[caller action: ...]` note.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- Before claiming, re-check `flow-0031`'s live state: it is `ready` today and also touches
  `.github/workflows/_flow-triage.yml` (for its action-pin fix, unrelated logic). Two `ready`
  tasks sharing a touches path is not itself a block — the protocol only skips a `ready` task
  against an `in_progress` one — but if flow-0031 is claimed first, rebase this branch onto its
  result rather than reverting its pin changes.
- The `gh api` comments endpoint is paginated the same way the issues endpoint is
  (`--paginate --slurp`); reuse that exact pattern rather than a fresh one, for the same
  single-page-vs-multi-page robustness reason the inbox step's own comment explains.
- This does not need a new GitHub Issue link — it was raised by the security check on flow-0027's
  PR, not triaged from the inbox, so `issue:` stays empty by design.
