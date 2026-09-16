---
id: "flow-0060"
title: "`workflows: write` is not a real permission — flow-0051 shipped a workflow GitHub refuses to parse"
status: "in_progress"
priority: 1
project: "flow"
owner: "session_01AGXF2nXiccFaQxPJgoiEsT"
created: "2026-09-16"
started: "2026-09-16T06:47:32Z"
branch: "flow/flow-0060-workflows-write-is-not-a-permission"
pr: "https://github.com/CandidDan/flow/pull/80"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G10"]
touches:
  - ".github/workflows/_flow-sync.yml"
  - "project-template/.github/workflows/flow-sync.yml"
  - ".flow/bin/check-workflows.mjs"
  - ".flow/bin/check-workflows.test.mjs"
  - ".flow/bin/sync-permissions.test.mjs"
  - "CHANGELOG.md"
notes:
  - "2026-09-16 (orchestrator): GitHub's own parser is the evidence, not an inference. Dispatching `flow-sync` in `CandidDan/Nudge` returned `failed to parse workflow: (Line: 43, Col: 7): Unexpected value 'workflows'`. Line 43 of that repo's `.github/workflows/flow-sync.yml` is `workflows: write`. `workflows` IS NOT A VALID `permissions:` KEY for `GITHUB_TOKEN`. The valid set is actions, attestations, checks, contents, deployments, discussions, id-token, issues, models, packages, pages, pull-requests, repository-projects, security-events, statuses. `workflows` exists only for GitHub Apps and fine-grained PATs — which is exactly WHY GITHUB_TOKEN cannot push a file under `.github/workflows/`: there is no permission to grant it. flow-0051's premise was wrong at the root."
  - "2026-09-16 (orchestrator): the blast radius, all four places the invalid key now lives. `.github/workflows/_flow-sync.yml:51` (workflow-level `permissions:`), `project-template/.github/workflows/flow-sync.yml:40` (job-level, the published caller), and via the v2 tag both of those at `63959b5`. Two adopting repos carry it on their default branch — `CandidDan/Nudge` and `CandidDan/TanPlan`, hand-edited before this was known. So `_flow-sync.yml@v2` is unparseable: any repo calling it gets a startup failure rather than a sync. The state is WORSE than the bug flow-0051 set out to fix — that one ran and failed at `git push`; this one does not start."
  - "2026-09-16 (orchestrator): four independent checks passed a change that cannot work, and that is the finding this task actually serves. (1) `npm run build` runs `.flow/bin/check-workflows.mjs`, which parses YAML — syntactically valid, semantically rejected. (2) `.flow/bin/sync-permissions.test.mjs` asserts the STRING `workflows: write` is present, i.e. it tests that the wrong thing is there. (3) canonical has NO `flow-sync` caller of its own, so the reusable is never executed here and GitHub never got the chance to reject it. (4) GitHub validates a workflow only when it tries to run one, and `flow-sync` is schedule/dispatch-only, so nothing tried for the entire life of the change. A green gate on work that cannot run is G10 failing, stated plainly."
  - "2026-09-16 (orchestrator): the real fix is a CREDENTIAL, not a permission. The push must be made by a token that carries the `workflows` scope — `FLOW_PAT` as a fine-grained PAT with Workflows: Write. `_flow-sync.yml` already threads `FLOW_PAT` to `gh` (`GH_TOKEN: ${{ secrets.FLOW_PAT || github.token }}`), but its `actions/checkout` takes no `token:`, so the remote credential the `git push` uses is GITHUB_TOKEN. Passing FLOW_PAT to that checkout is what makes the push legal. Note the fallback matters: with FLOW_PAT unset the push is GITHUB_TOKEN's and will still be refused, so the workflow must say so loudly rather than failing at the push with GitHub's opaque message."
  - "2026-09-16 (orchestrator): this is a CALLER ACTION and therefore MAJOR-shaped, by `docs/flow-versioning-policy.md`'s own tell. It does not change the caller's YAML, but it changes what `FLOW_PAT` must be: every adopting repo has to add Workflows: Write to that secret or `flow-sync` stays broken. A permission a repo owner must widen by hand is exactly the 'coordinated caller update' the policy reserves MAJOR for. Whether that means re-cutting `v2` or cutting `v2.0.1` is the human's call and is stated in the PR body, not decided here."
  - "2026-09-16 (orchestrator): do NOT stop at deleting the bad line. The reason this reached four repos is that nothing mechanical knows which permission keys exist, so `check-workflows.mjs` must learn the valid set — that is the part which prevents the NEXT invented key, and it is cheap because the list is short, closed and public. Equally, `sync-permissions.test.mjs` has to stop asserting a string is present and start asserting the thing that is actually true of a working sync. A fix that leaves both checks as they are re-earns this bug at the next permission someone guesses at."
  - "2026-09-16 (orchestrator): the two adopting repos cannot be repaired by `flow-sync`, for the second time in this chain. Their `flow-sync.yml` carries the invalid key, so their caller will not parse; and even once it does, `_flow-sync.yml@v2` is invalid too. Both halves have to be corrected and the alias moved before any sync can deliver anything. Their hand-edits are the human's to make and are out of this task's scope — name them in the PR body so the sequencing is written down somewhere other than a chat log."
  - "2026-09-16 (orchestrator): there was a FIFTH missed signal, and it is the most damning because GitHub reported the breakage immediately and for free. Every push carrying the invalid file produced a failed run in `CandidDan/Nudge` — run 8 (04:55:38, the first push to the PR branch), run 9 (05:01:51), run 10 (06:05:16, the merge to main). All three are `event: push` against a `flow-sync.yml` that declares only `schedule` and `workflow_dispatch`: GitHub records a synthetic startup-failure run for any push containing an unparseable workflow. The tells are unmistakable in the API — `created_at` and `updated_at` identical to the second, and `name` is the literal path `.github/workflows/flow-sync.yml` rather than `flow-sync`, because the parser never reached the `name:` field. So the defect was visible in the repo over an hour before anyone read GitHub's parser error. It was missed because a startup-failure run is NOT attached to the pull request as a check run: `get_check_runs` on PR #274 returned nine green checks while this sat red in the Actions tab. Any detection story that relies on a PR's check list — the orchestrator's included — has this hole in it."
---

## Context

flow-0051 diagnosed a real bug: `flow-sync` could not push the `.github/workflows/flow-*.yml`
callers it exists to deliver, and had been dying at `git push` weekly since 2026-09-02. The
diagnosis was right. The fix was not.

It added `workflows: write` to the `permissions:` block of both `_flow-sync.yml` and the published
thin caller. **There is no such permission.** GitHub's parser, asked to run the result:

```
failed to parse workflow: (Line: 43, Col: 7): Unexpected value 'workflows'
```

`GITHUB_TOKEN`'s permission set is closed and does not include `workflows`; that scope belongs to
GitHub Apps and fine-grained PATs. Which is the whole reason a push under `.github/workflows/` is
refused in the first place — the permission cannot be granted to the token doing the pushing, so
the answer was never going to be found in a `permissions:` block.

The result is a workflow that does not start, in four places at once, including behind the `v2`
tag. That is worse than the bug it replaced: the old one ran and failed at the push.

## Acceptance criteria

- [ ] Given `_flow-sync.yml` and `project-template/.github/workflows/flow-sync.yml`, when they are
      read, then neither contains a `workflows:` key under any `permissions:` block, and the
      comments that argued for it are replaced by ones that state why it cannot exist.
- [ ] Given `_flow-sync.yml`'s checkout of the repo it syncs, when it is read, then the push
      credential is `secrets.FLOW_PAT`, so the `git push` is made by a token that can carry the
      `workflows` scope.
- [ ] Given a run where `FLOW_PAT` is unset, when the workflow executes, then it fails with a
      message naming `FLOW_PAT` and Workflows: Write **before** reaching the push — not with
      GitHub's opaque `refusing to allow a GitHub App to create or update workflow` at the end.
- [ ] Given `check-workflows.mjs`, when it runs over a workflow declaring any `permissions:` key
      outside GitHub's documented set, then `npm run build` **fails**, naming the file, the key and
      the valid set. This is the criterion that matters most: the invented key, not the specific
      one, is what got through.
- [ ] Given a fixture workflow carrying `workflows: write`, when `check-workflows.test.mjs` runs,
      then it fails — the exact key this task is about is pinned as a regression case by name.
- [ ] Given fixtures using every valid key including the less common ones (`id-token`, `models`,
      `attestations`, `repository-projects`), when the check runs, then all pass — a validator that
      rejects legitimate keys would be a worse outage than the one it prevents.
- [ ] Given `sync-permissions.test.mjs`, when it is read after this change, then it no longer
      asserts that the literal string `workflows: write` is present, and its replacement assertion
      is one that would have failed against the broken tree.
- [ ] Given `CHANGELOG.md`, when it is read, then it states that `workflows: write` was invalid,
      that `FLOW_PAT` must gain **Workflows: Write** in every adopting repo, and that a repo which
      adopted the broken version must have both its caller and the alias corrected before any sync
      can run.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run, then
      all pass and coverage stays at or above 83.5.

## Scope

**Does not edit `CandidDan/Nudge` or `CandidDan/TanPlan`** — both carry the invalid key on their
default branch and both need a hand-edit, but that is outside this store. Name the required edit in
the PR body. **Does not move or cut any tag**; whether `v2` is re-cut or a `v2.0.1` is published is
the human's call, stated not decided. **Does not change what `flow-sync` copies** — flow-0051's
copied-surface reasoning was sound and is not what broke. **Does not widen `check-workflows.mjs`
into a general workflow-schema validator**: one closed, public, rarely-changing list, not an
attempt to reimplement GitHub's parser.
