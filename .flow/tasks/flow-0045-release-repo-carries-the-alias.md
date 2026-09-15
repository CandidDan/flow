---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0045"
title: "Give the release repo the floating `v1` alias the fleet actually pins, moved by the same deliberate act that moves canonical's"
status: "blocked"
priority: 2
project: "flow"
owner: "claude-worker-flow-0045"
created: "2026-09-15"
started: "2026-09-15T03:37:18Z"
branch: "flow/flow-0045-release-repo-alias"
pr: ""
issue: ""
blocked_reason: "Two blockers, both outside this task's reach, and both not machine-checkable — each needs a human decision, not a task or PR to land. (1) CREDENTIAL: no credential in the worker session can push a `.github/workflows/` change, so the `mirror-alias` job — the whole mechanism — cannot reach the branch. The Actions GITHUB_TOKEN is a GitHub App token and GitHub categorically refuses workflow-file writes from one (`refusing to allow a GitHub App to create or update workflow ... without `workflows` permission`); there is no `workflows:` key for a workflow `permissions:` block, so this cannot be granted in YAML. FLOW_PAT, which could carry it, has NO Contents write at all — 403 on every `git push` and on the REST contents API. A human must grant FLOW_PAT Contents: Read and write + Workflows: Read and write. (2) SCOPE: the CHANGELOG criterion collides with flow-0044's new `release-stamp.test.mjs` assertion that `## Unreleased` must hold zero entries. `## 1.3.0` is shipped history (canonical carries the v1.3.0 tag), so the entry cannot go there, and the only honest homes — a VERSION/project-template/VERSION bump opening `## 1.4.0`, or fixing that test — are both outside `touches`."
blocked_by: []
serves: ["maintenance"]   # release plumbing; no live VISION goal names it (see the note on G4)
touches: [".flow/bin/release-publish.mjs", ".flow/bin/release-publish.test.mjs", ".github/workflows/flow-release-publish.yml", "docs/flow-versioning-policy.md", "CHANGELOG.md"]
labels: [infra, release, fleet]
notes:
  - "2026-09-15: found while publishing 1.3.0 by hand. `git ls-remote https://github.com/CandidDan/flow-protocol` returns exactly three refs — refs/heads/main, refs/tags/v1.2.0, refs/tags/v1.3.0. No `v1`. The publisher pushes one tag (`release-publish.mjs`, the single `git push <remote> refs/tags/<tag>`) and `tagIsFree` makes re-pushing it a problem rather than a move, which is correct for an immutable release and leaves the alias unimplemented. Every adopting repo pins the ALIAS: Nudge and write both carry nine `@v1` callers. So flow-0030 would repin the fleet at a ref that does not exist — nine broken callers per repo, in their CI, with no local change to explain it. This task is the prerequisite, not a tidy-up."
  - "2026-09-15: `serves` is `maintenance` deliberately rather than G4. G4 (\"a repo stays current by reference\") is the goal flow-0030 names and it sits under VISION.md's `## Retired` after the 2026-09-01 rewrite; naming it here would anchor new work to a dead goal, which task-writer calls out as the one move that makes drift look anchored. No live goal (G6-G11) names release plumbing, so the reserved id is the honest answer."
  - |
    2026-09-15 (worker, session claude-worker-flow-0045): BLOCKED after the build was finished and
    green. Branch `flow/flow-0045-release-repo-alias` is pushed, two commits, and carries
    everything except one file. No PR — the branch is deliberately incomplete, see below.

    GENUINELY DONE, on the branch and pushed:
      * `.flow/bin/release-publish.mjs` — `parseRefs` (one ls-remote parser, peeled refs win so
        the alias lands on the COMMIT; `tagIsFree` now uses it), `aliasTag` (vMAJOR derived from
        the stamp, never hardcoded), `ALIAS_OUTCOME`, `decideAliasMove` (the whole decision as a
        pure function over ls-remote output + the stamp), `runAliasMirror` (a SEPARATE run from
        `runPublish`), `formatAliasReport`, a `format` parameter on `reportAndExit`, and a
        `--mirror-alias` CLI path. `runPublish` gained an `alias` field and a note saying the
        alias was deliberately NOT moved.
      * `.flow/bin/release-publish.test.mjs` — 20 new tests, one section per criterion. 54/54 pass.
      * `docs/flow-versioning-policy.md` — new "What the release repo carries" section (ref table,
        who moves each, at which numbered step) + a history entry. Two tests assert the doc and
        the code agree.
      * `CHANGELOG.md` — entry under `## Unreleased`, caller action: none.

    DESIGN DECISION, so a fresh session does not re-litigate it. The mechanism is a `push:` trigger
    on canonical's bare `vMAJOR` tag (filter `["v[0-9]*", "!v*.*", "!v*-edge"]`), running a second
    job `mirror-alias` in `flow-release-publish.yml`. `git tag -f v1 v1.3.0 && git push -f origin v1`
    — step 6 of the release procedure — fires a push event on `refs/tags/v1`, so ONE human act moves
    both aliases. Rejected: moving the alias at the end of the publish (deletes the canary, which is
    the one thing the Scope forbids) and a documented second manual tag move (this repo is the
    evidence that gets forgotten — v1 sat 305 commits behind main for 3.5 weeks).

    ALSO DECIDED: the logic stayed in `.flow/bin/release-publish.mjs` and NO
    `project-template/.flow/bin/release-publish.mjs` was created, even though `touches` admits one.
    That file does not exist and its header argues why: an adopting repo consumes Flow, it never
    publishes it, so a template copy would hand every adopter a publisher aimed at a repository
    that is not theirs. `touches` permits the path; it does not require it.

    LOOKS DONE BUT IS NOT — the branch is RED on 4 tests, for the two reasons in `blocked_reason`:
      * 3 workflow-shape tests fail because `.github/workflows/flow-release-publish.yml` is NOT on
        the branch. The change is written and was verified green locally (build 24 workflows parsed,
        lint 80 files, test 970/971, coverage lines 94.64% vs floor 83.5 — the single failure was
        the CHANGELOG one below, never a workflow one). It could not be pushed. The exact patch is
        reproduced at the end of this note; apply it verbatim.
      * 1 test, `release-stamp.test.mjs:138` "`## Unreleased` survives the release, empty", fails
        because this task's own criterion put an entry there. That assertion is unconditional, so
        as written it forbids the thing its own name says the section exists for — the first change
        after 1.3.0 to need a changelog entry is this one, and it cannot have one. A human call:
        either bump both VERSION stamps and open `## 1.4.0`, or make that assertion conditional.

    EXACT NEXT ACTION, in order:
      1. Human: grant the `FLOW_PAT` fine-grained token `Contents: Read and write` AND
         `Workflows: Read and write` on CandidDan/flow. Without Workflows, no agent can ever land a
         `.github/workflows/` change here; without Contents, no agent can push anything at all
         (this session claimed the task only by falling back to the Actions token).
      2. Human: decide the CHANGELOG placement (bump to 1.4.0, or relax the flow-0044 assertion),
         and widen this task's `touches` accordingly — or raise it as its own task.
      3. Worker: check out the branch, apply the patch below to
         `.github/workflows/flow-release-publish.yml`, settle (2), re-run all four gate commands,
         then open the PR titled "[flow-0045] Give the release repo the floating `v1` alias the
         fleet actually pins, moved by the same deliberate act that moves canonical's".

    RELATED FINDING, not this task's to fix but confirmed here beyond doubt (flow-0044's worker
    suspected it): canonical's `FLOW_PAT` has no Contents write. `git push` returns
    `Permission to CandidDan/flow.git denied to CandidDan` (403) and `PUT /repos/.../contents/...`
    returns `Resource not accessible by personal access token`. That is why a worker's branch push
    does not fire `flow-open-pr` here — the push never happens.

    THE PENDING PATCH (`git apply` this on the branch):

      diff --git a/.github/workflows/flow-release-publish.yml b/.github/workflows/flow-release-publish.yml
      index ae7848f..0122d9a 100644
      --- a/.github/workflows/flow-release-publish.yml
      +++ b/.github/workflows/flow-release-publish.yml
      @@ -27,15 +27,50 @@ name: flow-release-publish
       # fleet resolves. flow-0031 makes this a checked rule across the directory; it is done here at
       # authoring time so that task finds nothing to fix. Comments name the version the SHA is.
       
      +# TWO ENTRY POINTS, TWO JOBS, AND THEY ARE NOT THE SAME EVENT.
      +#
      +#   release: published   -> `publish`      — the snapshot and its immutable `vX.Y.Z` tag.
      +#   push: tags: v<major> -> `mirror-alias` — the floating `vX` every adopting repo pins.
      +#
      +# The second is triggered by CANONICAL'S OWN `v1` MOVING, which is step 6 of the release
      +# procedure in docs/flow-versioning-policy.md — `git tag -f v1 v1.3.0 && git push -f origin v1`
      +# fires a `push` event on `refs/tags/v1`, force-updates included. That makes one deliberate
      +# human act move both aliases, instead of two acts a human has to remember in two
      +# repositories. This repo is the evidence that the second one gets forgotten: canonical's `v1`
      +# sat 305 commits behind `main` for three and a half weeks while release-guard measured the gap
      +# as a warning nobody read.
      +#
      +# WHY NOT JUST MOVE THE ALIAS AT THE END OF THE PUBLISH. Because that deletes the canary. The
      +# policy makes `vMAJOR` a deliberate act taken only after the edge has proven itself, precisely
      +# because auto-advancing a single alias means a bad reusable reaches the whole fleet before
      +# anyone has run it once in anger. An alias that advanced on publish would reintroduce exactly
      +# that, one repository removed from where anyone would look for it. `release-publish.mjs` keeps
      +# the two runs apart and its tests pin the asymmetry (immutable tag refused, alias moved).
      +#
      +# The tag filter admits ONLY the bare alias: `v[0-9]*` with `!v*.*` excluding every exact
      +# version and `!v*-edge` excluding the canary channel, which is not published to the release
      +# repo at all (nothing pins it there yet — see flow-0045's Scope). The job re-derives the alias
      +# from VERSION and refuses a ref the stamp does not name, so the filter is a narrowing, not the
      +# check.
      +
       on:
         release:
           types: [published]
      +  push:
      +    tags:
      +      - "v[0-9]*"
      +      - "!v*.*"
      +      - "!v*-edge"
         workflow_dispatch:
           inputs:
             dry_run:
               description: "Report the file list and the tag, write nothing, push nothing"
               type: boolean
               default: true
      +      mirror_alias:
      +        description: "Mirror the floating vMAJOR alias instead of publishing (recovery path for a missed tag-push event)"
      +        type: boolean
      +        default: false
       
       # LEAST PRIVILEGE, and this block is the declared blast radius rather than a log of which token
       # happened to be used. It governs GITHUB_TOKEN, which reaches CANONICAL only — and canonical is
      @@ -54,7 +89,10 @@ concurrency:
       
       jobs:
         publish:
      -    if: vars.FLOW_RELEASE_PUBLISH == 'true'
      +    # Never on a tag push: that event is the alias mirror's, and a publish fired by it would be
      +    # a second snapshot of an already-released version — refused by the immutable-tag rule, but
      +    # refused loudly, in a red job, every time a human moved `v1`.
      +    if: vars.FLOW_RELEASE_PUBLISH == 'true' && github.event_name != 'push' && !inputs.mirror_alias
           runs-on: ubuntu-latest
       
           env:
      @@ -178,3 +216,77 @@ jobs:
                   cat "$RUNNER_TEMP/publish.log" 2>/dev/null || echo "(no publisher output — an earlier step failed)"
                   echo '```'
                 } >> "$GITHUB_STEP_SUMMARY"
      +
      +  # ── the floating alias the fleet actually pins ──────────────────────────────────────────
      +  # Runs when canonical's own `vX` moves (step 6 of the release procedure), never when a
      +  # release is published. See the header for why those must not be the same act.
      +  mirror-alias:
      +    if: vars.FLOW_RELEASE_PUBLISH == 'true' && (github.event_name == 'push' || inputs.mirror_alias)
      +    runs-on: ubuntu-latest
      +
      +    env:
      +      FLOW_RELEASE_REPO: ${{ vars.FLOW_RELEASE_REPO || 'CandidDan/flow-protocol' }}
      +      DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run }}
      +      # Only a tag push carries a moved ref. A manual dispatch runs from `main`, whose ref name
      +      # is not an alias, so passing it would trip the module's own "a ref this release does not
      +      # name" refusal — the recovery path deliberately supplies nothing and lets the stamp decide.
      +      PUSHED_REF: ${{ github.event_name == 'push' && github.ref_name || '' }}
      +
      +    steps:
      +      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
      +        with:
      +          # The commit the alias was just moved TO — that is the tree whose VERSION decides both
      +          # the alias name and the release tag it points at. Depth 1: nothing here needs history,
      +          # and this job runs `git push` to another remote.
      +          fetch-depth: 1
      +          persist-credentials: false
      +
      +      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
      +        with:
      +          node-version: 22
      +
      +      # Invocation only, same division as the publish step. Every decision — which alias the
      +      # stamp derives, whether the release it would point at is even on the target, and what
      +      # "the release tag landed but the alias did not" is called — lives in release-publish.mjs
      +      # and is proved by tests over `ls-remote` output rather than by a live push.
      +      #
      +      # The credential is handled exactly as the publish step handles it, and for the same three
      +      # reasons spelled out there: not in the remote URL, not in argv, not in the runner's
      +      # global git config. GIT_CONFIG_COUNT scopes it to this command's process tree, which the
      +      # git children the module spawns inherit.
      +      - name: Mirror the alias to the release repo
      +        env:
      +          FLOW_RELEASE_PAT: ${{ secrets.FLOW_RELEASE_PAT }}
      +        run: |
      +          set -euo pipefail
      +          AUTH="$(printf 'x-access-token:%s' "$FLOW_RELEASE_PAT" | base64 -w0)"
      +          echo "::add-mask::$AUTH"
      +
      +          ARGS=(--mirror-alias
      +                --remote "https://github.com/$FLOW_RELEASE_REPO.git"
      +                --work-dir "$RUNNER_TEMP/flow-release-alias")
      +          if [ -n "$PUSHED_REF" ]; then ARGS+=(--pushed-ref "$PUSHED_REF"); fi
      +          if [ "$DRY_RUN" = "true" ]; then ARGS+=(--dry-run); fi
      +
      +          GIT_CONFIG_COUNT=1 \
      +          GIT_CONFIG_KEY_0="http.https://github.com/.extraheader" \
      +          GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $AUTH" \
      +            node .flow/bin/release-publish.mjs "${ARGS[@]}" | tee "$RUNNER_TEMP/alias.log"
      +
      +      # `if: always()`, because the run this summary matters most for is the FAILED one: a
      +      # release whose tag landed and whose alias did not is the state that looks fine from the
      +      # release repo's tag list and resolves to the previous release from every caller. The
      +      # module's last line carries `decision=published-without-its-alias`, so the distinction
      +      # survives into the summary rather than living only in the exit code.
      +      - name: Summarise the alias move
      +        if: always()
      +        run: |
      +          set -euo pipefail
      +          {
      +            echo "### flow-release-publish / alias -> \`$FLOW_RELEASE_REPO\`"
      +            echo ""
      +            if [ "$DRY_RUN" = "true" ]; then echo "**Dry run** — nothing was pushed."; echo ""; fi
      +            echo '```'
      +            cat "$RUNNER_TEMP/alias.log" 2>/dev/null || echo "(no output — an earlier step failed)"
      +            echo '```'
      +          } >> "$GITHUB_STEP_SUMMARY"
---

## Context

ADR-0005 splits canonical into a private authoring repo and a public release repo, and flow-0029
built the publisher that pushes the history-free snapshot to `CandidDan/flow-protocol`. It works —
1.3.0 was published there on 2026-09-15 as a parentless commit carrying `VERSION` 1.3.0, the
reusables, and no `.flow/tasks/`.

What it does not push is the alias. `flow-protocol` carries `main`, `v1.2.0` and `v1.3.0` and
nothing else, because the publisher pushes exactly one ref per release and `tagIsFree` deliberately
refuses to move a `vX.Y.Z` that already exists ("A moved tag silently changes what every pinned
adopter runs"). That is right for an immutable release tag. It also means the floating `vX` alias —
**the ref every adopting repo actually pins** — has no implementation on the release-repo side.

The consequence is concrete and it lands on flow-0030: repointing the fleet's `uses:` lines at
`CandidDan/flow-protocol/.github/workflows/_flow-gates.yml@v1` today resolves to nothing. Nine
callers per repo, failing in the consuming repo's CI.

**The trap this task exists to avoid.** The obvious implementation — have the publisher move `vX`
to whatever it just published — would quietly destroy the canary. `docs/flow-versioning-policy.md`
makes `vMAJOR` a *deliberate human act* taken only after the edge has proven itself, precisely
because "auto-advancing a single alias removes the canary" and a bad reusable would reach the whole
fleet before anyone had run it once in anger. An alias on the release repo that advances on every
publish reintroduces that, one repository removed from where anyone would look for it. The release
repo's `v1` must mirror canonical's `v1` — same deliberate act, same moment — not the publish.

This session is the evidence that the manual half of a release path gets forgotten: canonical's
`v1` sat 305 commits behind `main` for three and a half weeks while `release-guard` measured the
gap as a warning nobody read. So a design where a human must remember two separate tag moves is a
design that will produce a release repo whose alias lags its own tags. Prefer a mechanism where
moving canonical's `v1` is the single act that also moves the release repo's — a workflow that
fires on that tag move, and mirrors it — over documentation asking someone to do it twice.

## Scope

**Does:**

- Make the release repo carry `v1` (generally: `vMAJOR`, derived from `VERSION` the way
  `release-tag.yml` already derives its own alias names — never hardcoded).
- Tie the alias move to **canonical's `v1` moving**, not to a publish. Mechanism is the worker's
  to choose, and the choice must be argued in the PR: a workflow triggered when canonical's `v1`
  is force-updated, a flag on the publisher used only by that path, or an explicit
  `workflow_dispatch`. What is NOT acceptable is the alias advancing as a side effect of
  publishing a release, for the canary reason above.
- Keep the immutable-tag behaviour exactly as it is: `vX.Y.Z` on the target is still refused if it
  already exists. The alias and the release tag have deliberately different rules, and a test
  must pin both so a later simplification cannot collapse them into one.
- Make a partial publish fail loudly. If the release tag lands and the alias does not, the run
  must not report success — "published" and "published without the ref the fleet pins" have to be
  distinguishable in the verdict and in the job summary.
- Record in `docs/flow-versioning-policy.md` what the release repo carries, who moves it and when,
  so the policy describes the fleet's real resolution path rather than canonical's alone.
- Record the change in `CHANGELOG.md` with its caller action (none for existing adopters — they
  still pin canonical until flow-0030 lands).

**Deliberately does NOT:**

- **Repin any adopting repo, or the template.** That is flow-0030, which this task unblocks.
- **Publish `v1-edge` to the release repo.** Decided out, not overlooked: nothing currently pins
  `@v1-edge` at all (canonical pins `@main`, Nudge and write pin `@v1`), so the canary channel has
  no subscriber to serve there yet. Restoring the canary is a separate decision about *which repo*
  holds the pin; when it is taken, whether edge needs to exist on the release repo follows from it.
  A second alias shipped now would be an unused moving ref on a public repo.
- **Change canonical's own `v1`/`v1-edge` mechanics**, `release-tag.yml`'s derivation, or
  `release-guard`'s rules. This adds a mirror; it does not renegotiate the model.
- **Make canonical private, or migrate the store.** Human acts, sequenced well after flow-0030.

## Acceptance criteria

- [ ] Given a published version `X.Y.Z` and the act that moves canonical's `vX`, when the release
      repo's refs are listed, then `vX` exists and points at the same commit as `vX.Y.Z` on that
      target — proved by a test over the publisher's decided ref set (a pure function over
      `ls-remote` output and the stamp, as `tagIsFree` already is), not by a live push.
- [ ] Given a target that already carries `vX.Y.Z`, when a publish runs, then the immutable tag is
      still refused with the existing "refusing to move it" problem — and, in the same test file,
      the alias is shown to be movable. Both rules asserted, so neither can be dropped silently.
- [ ] Given an alias name derived from a stamp, when `VERSION` is `2.0.0`, then the alias is `v2`
      and nothing named `v1` is touched — derived, never hardcoded, same property
      `release-tag.yml` already holds.
- [ ] Given a run where the release tag pushes and the alias push fails, when the job finishes,
      then it fails, and the verdict/summary names the release as published-without-its-alias
      rather than reporting success.
- [ ] Given `docs/flow-versioning-policy.md`, when the release section is read, then it states
      which refs the release repo carries, who moves the alias, and at what point in the
      procedure — and the answer matches what the code does.
- [ ] Given the repo after this change, when `build`, `lint`, `test` and `coverage` run, then all
      pass with coverage at or above the floor of 83.5.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **CORRECTION (2026-09-15, orchestrator).** This note originally said the shared logic belongs in
  `project-template/.flow/bin/release-publish.mjs` and `touches` named that file and its test.
  **Both were wrong and have been removed.** No such file exists: `.flow/bin/release-publish.mjs`
  is canonical-only and says so in its own header — "NOT AN ADAPTER … like check-workflows.mjs: an
  adopting repo consumes Flow, it never publishes it, so there is no template counterpart for this
  to adapt and shipping one would hand every adopter a publisher aimed at a repository that is not
  theirs." The adapter rule in the root `CLAUDE.md` is real but does not reach this file. Edit
  `.flow/bin/release-publish.mjs` directly, and do not create a template counterpart.
- **The credential is not this task's to create.** `FLOW_RELEASE_PAT` already exists and pushes to
  the target. If moving a ref needs a scope it lacks, that is a finding for the human, not a
  secret to mint — say so in the PR and mark the task `blocked` rather than widening a token.
- A related scope defect was recorded by flow-0044's worker and is NOT in this task's scope, but
  belongs in the same conversation with the human: canonical's own `FLOW_PAT` appears to lack
  Contents write ("403 for pushes"), which is why a worker's branch push does not fire
  `flow-open-pr` there. `_flow-queue-runner.yml`'s header already documents that this consumer
  needs Contents Read/Write, unlike `_flow-open-pr.yml`'s Read.
