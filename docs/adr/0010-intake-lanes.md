# ADR-0010: Intake lanes: every submission is an issue, and only a vouched-for trivial fix skips the decision

**Status:** Proposed — accepted when this PR merges
**Date:** 2026-11-02
**Deciders:** Dan (inspirator / sole maintainer)
**Consumer:** inflight intent `send-to-an-agent` (CandidDan/inflight), which supplies the form

## Context

Dan wants people without GitHub accounts (Jaime first) to send bugs and ideas into a Flow project,
after seeing Paxel's "Send to an agent" form. In his words (2026-11-02):

> "If something is submitted, it should always go into issues on GitHub, but maybe it can be
> pre-validated by a cheap model. If it's really simple … a word change, a spelling mistake …
> it can be triaged, turned into a task, and fixed automatically. If it's a bigger job, then it
> stays an issue, and I have to go through it and review it as normal."

He also decided: the form lives in inflight on Vercel; submissions without an invite link are
accepted; a trivial fix is opened as a PR automatically and **merged by him**; the sorting is
Flow-wide, not inflight-only.

Today's triage (`_flow-triage.yml`) cannot take this as it stands, for three reasons:

1. **Trust is read from the issue author.** The sweep admits an issue only when its
   `author_association` is in the trusted set (`OWNER`, `MEMBER`, `COLLABORATOR` by default). A
   form creates every issue as one GitHub App, so every submission has the same author. Either all
   of them are trusted (a public form then feeds the write-capable agent directly) or none are
   (nothing from the form is ever triaged). Neither is acceptable.
2. **Lane labels are trusted without checking who applied them.** `approved` and `auto-ok` are
   read as human decisions (the workflow's own header says "both human-applied"), but nothing
   verifies the actor. That is safe today only because the issue author must already be trusted. An
   App that can create issues can also label them, so the same gap becomes an open door the moment
   an App authors issues.
3. **Triage runs once a weekday.** A form whose button says "Send to an agent" and answers a day
   later does not do what its button says.

Paxel's own model was considered and is not adopted: there, the form starts an agent on the raw
prompt immediately and the only human check is the merge. Reviewing a prompt costs the operator
seconds; reviewing a PR built from a bad prompt costs a PR review and an agent run. And an agent
working from a raw prompt has no acceptance criteria for the PR checks to verify.

## Decision

### 1. Every submission is an issue; issues are the one capture inbox

Bugs and ideas, from a form or filed directly on GitHub, arrive as issues. An issue is raw
material: nothing in it is wanted until it becomes an intent, or, for a trivial fix only, a
maintenance task (§4). VISION.md G11 is amended in this PR to say so, and its Open item "where a
reader's feedback lands" is closed by it.

### 2. Two separate signals per issue: who vouches for it, and how big it is

| Signal | Values | Decided by | Can a model set it? |
|---|---|---|---|
| **Provenance** | `trusted`, `public` | the issue author's `author_association`, **or** a `flow:trusted` label whose `labeled` event was made by a configured intake App | No |
| **Size** | `trivial`, `normal`, `spam` | a cheap model (§3), recorded as a `flow:size/<value>` label | Yes, and only this |

Provenance is a fact about identity. A form vouches for a submitter by applying `flow:trusted`
after verifying their invite link; triage believes that label only when the issue's event history
(`GET /repos/{o}/{r}/issues/{n}/events`) shows the `labeled` event's actor is one of the logins
listed in `.flow/config.yml` under `intake.trusted_labelers` (for inflight, its App's
`<slug>[bot]` login). An empty or absent list trusts no labeler, so the restrictive posture is the
default, as it is for `FLOW_TRIAGE_TRUSTED_ASSOCIATIONS`.

The same check closes gap 2: `approved` and `auto-ok` count only when their `labeled` event was
made by a user (not a bot) whose association is in the trusted set. An App can vouch for **who**
sent something. It can never approve **what** was sent.

### 3. Size is classified by a model with no tools and no write access

A new job classifies each issue into exactly one of `trivial | normal | spam`.

- It runs on a cheap model, configured as `intake.classifier_model` and defaulting to the `haiku`
  tier in `task-model.mjs`.
- It has no tools, `contents: read` only, and no token that can write.
- It reads the issue as data. A prompt-injected issue can, at worst, choose the wrong one of three
  values.
- Its output is validated against the three values by a script. Anything else is `normal`.
- A separate step that runs no model applies the `flow:size/<value>` label.

It runs on public issues too, so the operator sees a size on everything, but for a public issue
the size changes nothing except the label.

### 4. The automatic lane needs both signals, opens a PR, and never merges

```
issue opened
 ├─ provenance = trusted AND size = trivial
 │     → triage creates a ready task directly (as `auto-ok` does today):
 │         serves: maintenance · model: haiku · effort: low · narrow `touches`
 │     → worker builds it → PR opened → review checks → Dan merges
 ├─ provenance = trusted, size = normal
 │     → today's path: spec drafted as a comment, label `proposed`, wait for `approved`
 └─ provenance = public (any size)
       → stays an issue. The write-capable triage agent never reads it.
         Dan decides it (in inflight); his `approved` label, verified per §2, admits it
         to the trusted path above.
```

- **Neither signal alone opens the lane.** A trusted submitter's large request waits for a
  decision. A public submission that claims to be "just a typo" stays an issue.
- **The merge stays human** (VISION NG7). Auto-merge is out of scope and needs a VISION.md
  amendment, not a flag.
- **The fix is bounded mechanically, not by the model's word.** The task's narrow `touches` is
  enforced by `touches-guard`. A task created by this lane also carries `intake: auto`, and a PR
  for such a task fails a check if its diff exceeds `intake.trivial.max_changed_lines` (default 20;
  Dan sets the number). A failed check is a kickback Dan sees, never a merge.
- **Public text never reaches the write-capable agent un-vouched.** The inbox filter admits an
  issue authored by an intake App only when it carries a verified `flow:trusted` label or a
  verified human `approved` label. That keeps the property flow-0027 and flow-0036 built: a step
  that never hands over the text is the boundary, and prompt wording is not.

### 5. Triage runs when an issue opens, as well as on the schedule

The thin caller gains an `issues: [opened, labeled]` trigger alongside its cron. It is opt-in per
repo through a repository variable, so a repo that has not adopted intake spends no extra CI
minutes (VISION G9). The daily sweep stays as the backstop for anything a missed event left
behind.

### 6. Configuration

```yaml
# .flow/config.yml (consuming repo)
intake:
  trusted_labelers: ["inflight-flow[bot]"]   # [assumption] the App's real login is set at install
  classifier_model: "haiku"                   # a tier name from task-model.mjs
  trivial:
    max_changed_lines: 20
```

## Rejected alternatives

- **Classify in inflight.** It would put a model API key in inflight, and only form submissions
  would be classified; issues filed directly on GitHub would not. Flow-wide was Dan's call.
- **Trust form issues by `author_association`.** The author is always the App, so this trusts
  everything or nothing (gap 1).
- **Let the model's verdict open the automatic lane on its own.** The cheapest model is the
  easiest to talk into "this is just a spelling fix". Size is a model's opinion; provenance is not.
- **Start an agent on the raw prompt and gate only at merge (Paxel's model).** It moves the
  operator's check from a prompt (seconds) to a PR (minutes), spends an agent run on every bad
  idea, and leaves the PR checks no acceptance criteria to verify.
- **Auto-merge trivial fixes.** VISION NG7. It can be revisited only by amending the vision, after
  the automatic lane has a record.
- **A separate idea store in inflight.** It would be a second inbox beside issues and a store
  inflight's NG2 forbids. inflight's `send-to-an-agent` intent reverses its 2026-10-20 allowance
  for exactly this reason.

## Consequences

- Jaime, and anyone Dan sends a link, can submit without a GitHub account, and every submission
  is visible in the repo where the work happens.
- `approved` and `auto-ok` become verified rather than assumed. A repo where a bot applied either
  label stops honouring it. This is a behaviour change, called out in the CHANGELOG fragment of the
  task that ships it.
- The automatic lane removes the up-front touchpoint for one narrow class of work, by a policy Dan
  sets (who is trusted, how big is trivial), in the same way `auto-ok` already does. The merge
  touchpoint is unchanged.
- CI cost grows by one cheap-model call per opened issue, in repos that opt in.
- Tasks that follow from this ADR, written separately:
  1. Verify the actor of `approved`, `auto-ok` and `flow:trusted` labels from the issue events.
  2. Admit intake-App issues only when vouched for (inbox filter).
  3. Classifier job and `flow:size/*` labels.
  4. The automatic lane (task shape, `intake: auto`) and the diff-size check.
  5. The `issues` trigger in the thin caller, opt-in per repo; `intake:` in the config template.

## What would void this decision

- **Trusted submitters' "trivial" PRs are often rejected.** The classifier, or the line limit, is
  wrong. Tighten the limit or drop the automatic lane.
- **Public spam reaches the issue list faster than Dan clears it.** The form's edge protection is
  not enough. Gate public submissions harder in inflight; this ADR's lanes do not change.
- **An App-applied label is honoured as an approval.** That is the bug §2 exists to prevent, and
  it would mean the event check has a hole.
