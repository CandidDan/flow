---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0045"
title: "Give the release repo the floating `v1` alias the fleet actually pins, moved by the same deliberate act that moves canonical's"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-15"
started: ""
branch: "flow/flow-0045-release-repo-alias"
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # release plumbing; no live VISION goal names it (see the note on G4)
touches: [".flow/bin/release-publish.mjs", ".flow/bin/release-publish.test.mjs", ".github/workflows/flow-release-publish.yml", "docs/flow-versioning-policy.md", "CHANGELOG.md"]
labels: [infra, release, fleet]
notes:
  - "2026-09-17 (orchestrator): unblocked on both halves, and the reason cleared rather than left behind as stale data. SCOPE: flow-0047 is done, so the `## Unreleased` CHANGELOG collision that reddened every changelog-bearing PR is gone, and `blocked_by` was emptied earlier today. CREDENTIAL: the human confirms FLOW_PAT now carries `Contents: Read and write` as well as `Workflows: Read and write` — the rotation prompted by flow-0051/flow-0060 delivered both scopes, not Workflows alone, which was the specific risk raised before this flip. The earlier orchestrator note withheld dispatch until both cleared; both have, so that condition is discharged and the task is claimable. `owner` and `started` are cleared so the claim is atomic again. The original worker session is gone, but its branch `flow/flow-0045-release-repo-alias` is pushed with two commits and carries everything except one file — the worker note further down records the remaining patch, and a session that starts without reading it will rebuild work that already exists."
  - "2026-09-15: found while publishing 1.3.0 by hand. `git ls-remote https://github.com/CandidDan/flow-protocol` returns exactly three refs — refs/heads/main, refs/tags/v1.2.0, refs/tags/v1.3.0. No `v1`. The publisher pushes one tag (`release-publish.mjs`, the single `git push <remote> refs/tags/<tag>`) and `tagIsFree` makes re-pushing it a problem rather than a move, which is correct for an immutable release and leaves the alias unimplemented. Every adopting repo pins the ALIAS: Nudge and write both carry nine `@v1` callers. So flow-0030 would repin the fleet at a ref that does not exist — nine broken callers per repo, in their CI, with no local change to explain it. This task is the prerequisite, not a tidy-up."
  - "2026-09-15: `serves` is `maintenance` deliberately rather than G4. G4 (\"a repo stays current by reference\") is the goal flow-0030 names and it sits under VISION.md's `## Retired` after the 2026-09-01 rewrite; naming it here would anchor new work to a dead goal, which task-writer calls out as the one move that makes drift look anchored. No live goal (G6-G11) names release plumbing, so the reserved id is the honest answer."
  - "2026-09-15 (orchestrator): both blockers accepted as correctly refused, neither widened into this task. (2) THE CHANGELOG COLLISION IS AN ORCHESTRATOR DEFECT, now flow-0047 (ready, priority 1): flow-0044's criterion said `## Unreleased` survives the release 'empty', which is true for an instant and became an unconditional assertion, so the section is empty-or-red and no PR can record a change until it is fixed. Raised as its own task rather than widened into this one, because it blocks every changelog-bearing PR in the repo, not just this task — that is not this task's scope, it is a live trap in canonical's gate. `blocked_by` now names it, so this task's unblock is machine-checkable on that half. (1) THE CREDENTIAL STAYS HUMAN and stays out of blocked_by deliberately: FLOW_PAT needs Contents: Read and write PLUS Workflows: Read and write, and no task or PR can grant it. The worker's reading is right and checked — a GitHub App token cannot write workflow files without the `workflows` permission, and there is no `workflows:` key in a job `permissions:` block to grant it in YAML. Do NOT dispatch another worker at this task before both are cleared: the patch it needs is in the note below and a fresh session would rediscover the same wall."
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

    THE PENDING PATCH. Base64, not a raw diff, and deliberately: a unified diff's `--- a/` and
    `+++ b/` lines and its leading-space context columns do not survive a frontmatter scanner
    or an editor that trims trailing whitespace, and a patch that silently stops applying is
    worse than no patch. On the branch, run:

      grep -oE '^ +[A-Za-z0-9+/=]{40,}$' <this file> | tr -d ' \n' | base64 -d | git apply -

    (or paste the block into `base64 -d > /tmp/p.patch && git apply /tmp/p.patch`). It targets
    `.github/workflows/flow-release-publish.yml` only, and `sha256sum` of the decoded patch is
    9c0e2a398bad259f9c3e0ccdbe1741f3b4c95c3275888cfcf09f7e83d1670cf9.


      ZGlmZiAtLWdpdCBhLy5naXRodWIvd29ya2Zsb3dzL2Zsb3ctcmVsZWFzZS1wdWJsaXNoLnltbCBiLy5naXRodWIvd29ya2Zs
      b3dzL2Zsb3ctcmVsZWFzZS1wdWJsaXNoLnltbAppbmRleCBhZTc4NDhmLi4wMTIyZDlhIDEwMDY0NAotLS0gYS8uZ2l0aHVi
      L3dvcmtmbG93cy9mbG93LXJlbGVhc2UtcHVibGlzaC55bWwKKysrIGIvLmdpdGh1Yi93b3JrZmxvd3MvZmxvdy1yZWxlYXNl
      LXB1Ymxpc2gueW1sCkBAIC0yNywxNSArMjcsNTAgQEAgbmFtZTogZmxvdy1yZWxlYXNlLXB1Ymxpc2gKICMgZmxlZXQgcmVz
      b2x2ZXMuIGZsb3ctMDAzMSBtYWtlcyB0aGlzIGEgY2hlY2tlZCBydWxlIGFjcm9zcyB0aGUgZGlyZWN0b3J5OyBpdCBpcyBk
      b25lIGhlcmUgYXQKICMgYXV0aG9yaW5nIHRpbWUgc28gdGhhdCB0YXNrIGZpbmRzIG5vdGhpbmcgdG8gZml4LiBDb21tZW50
      cyBuYW1lIHRoZSB2ZXJzaW9uIHRoZSBTSEEgaXMuCiAKKyMgVFdPIEVOVFJZIFBPSU5UUywgVFdPIEpPQlMsIEFORCBUSEVZ
      IEFSRSBOT1QgVEhFIFNBTUUgRVZFTlQuCisjCisjICAgcmVsZWFzZTogcHVibGlzaGVkICAgLT4gYHB1Ymxpc2hgICAgICAg
      4oCUIHRoZSBzbmFwc2hvdCBhbmQgaXRzIGltbXV0YWJsZSBgdlguWS5aYCB0YWcuCisjICAgcHVzaDogdGFnczogdjxtYWpv
      cj4gLT4gYG1pcnJvci1hbGlhc2Ag4oCUIHRoZSBmbG9hdGluZyBgdlhgIGV2ZXJ5IGFkb3B0aW5nIHJlcG8gcGlucy4KKyMK
      KyMgVGhlIHNlY29uZCBpcyB0cmlnZ2VyZWQgYnkgQ0FOT05JQ0FMJ1MgT1dOIGB2MWAgTU9WSU5HLCB3aGljaCBpcyBzdGVw
      IDYgb2YgdGhlIHJlbGVhc2UKKyMgcHJvY2VkdXJlIGluIGRvY3MvZmxvdy12ZXJzaW9uaW5nLXBvbGljeS5tZCDigJQgYGdp
      dCB0YWcgLWYgdjEgdjEuMy4wICYmIGdpdCBwdXNoIC1mIG9yaWdpbiB2MWAKKyMgZmlyZXMgYSBgcHVzaGAgZXZlbnQgb24g
      YHJlZnMvdGFncy92MWAsIGZvcmNlLXVwZGF0ZXMgaW5jbHVkZWQuIFRoYXQgbWFrZXMgb25lIGRlbGliZXJhdGUKKyMgaHVt
      YW4gYWN0IG1vdmUgYm90aCBhbGlhc2VzLCBpbnN0ZWFkIG9mIHR3byBhY3RzIGEgaHVtYW4gaGFzIHRvIHJlbWVtYmVyIGlu
      IHR3bworIyByZXBvc2l0b3JpZXMuIFRoaXMgcmVwbyBpcyB0aGUgZXZpZGVuY2UgdGhhdCB0aGUgc2Vjb25kIG9uZSBnZXRz
      IGZvcmdvdHRlbjogY2Fub25pY2FsJ3MgYHYxYAorIyBzYXQgMzA1IGNvbW1pdHMgYmVoaW5kIGBtYWluYCBmb3IgdGhyZWUg
      YW5kIGEgaGFsZiB3ZWVrcyB3aGlsZSByZWxlYXNlLWd1YXJkIG1lYXN1cmVkIHRoZSBnYXAKKyMgYXMgYSB3YXJuaW5nIG5v
      Ym9keSByZWFkLgorIworIyBXSFkgTk9UIEpVU1QgTU9WRSBUSEUgQUxJQVMgQVQgVEhFIEVORCBPRiBUSEUgUFVCTElTSC4g
      QmVjYXVzZSB0aGF0IGRlbGV0ZXMgdGhlIGNhbmFyeS4gVGhlCisjIHBvbGljeSBtYWtlcyBgdk1BSk9SYCBhIGRlbGliZXJh
      dGUgYWN0IHRha2VuIG9ubHkgYWZ0ZXIgdGhlIGVkZ2UgaGFzIHByb3ZlbiBpdHNlbGYsIHByZWNpc2VseQorIyBiZWNhdXNl
      IGF1dG8tYWR2YW5jaW5nIGEgc2luZ2xlIGFsaWFzIG1lYW5zIGEgYmFkIHJldXNhYmxlIHJlYWNoZXMgdGhlIHdob2xlIGZs
      ZWV0IGJlZm9yZQorIyBhbnlvbmUgaGFzIHJ1biBpdCBvbmNlIGluIGFuZ2VyLiBBbiBhbGlhcyB0aGF0IGFkdmFuY2VkIG9u
      IHB1Ymxpc2ggd291bGQgcmVpbnRyb2R1Y2UgZXhhY3RseQorIyB0aGF0LCBvbmUgcmVwb3NpdG9yeSByZW1vdmVkIGZyb20g
      d2hlcmUgYW55b25lIHdvdWxkIGxvb2sgZm9yIGl0LiBgcmVsZWFzZS1wdWJsaXNoLm1qc2Aga2VlcHMKKyMgdGhlIHR3byBy
      dW5zIGFwYXJ0IGFuZCBpdHMgdGVzdHMgcGluIHRoZSBhc3ltbWV0cnkgKGltbXV0YWJsZSB0YWcgcmVmdXNlZCwgYWxpYXMg
      bW92ZWQpLgorIworIyBUaGUgdGFnIGZpbHRlciBhZG1pdHMgT05MWSB0aGUgYmFyZSBhbGlhczogYHZbMC05XSpgIHdpdGgg
      YCF2Ki4qYCBleGNsdWRpbmcgZXZlcnkgZXhhY3QKKyMgdmVyc2lvbiBhbmQgYCF2Ki1lZGdlYCBleGNsdWRpbmcgdGhlIGNh
      bmFyeSBjaGFubmVsLCB3aGljaCBpcyBub3QgcHVibGlzaGVkIHRvIHRoZSByZWxlYXNlCisjIHJlcG8gYXQgYWxsIChub3Ro
      aW5nIHBpbnMgaXQgdGhlcmUgeWV0IOKAlCBzZWUgZmxvdy0wMDQ1J3MgU2NvcGUpLiBUaGUgam9iIHJlLWRlcml2ZXMgdGhl
      IGFsaWFzCisjIGZyb20gVkVSU0lPTiBhbmQgcmVmdXNlcyBhIHJlZiB0aGUgc3RhbXAgZG9lcyBub3QgbmFtZSwgc28gdGhl
      IGZpbHRlciBpcyBhIG5hcnJvd2luZywgbm90IHRoZQorIyBjaGVjay4KKwogb246CiAgIHJlbGVhc2U6CiAgICAgdHlwZXM6
      IFtwdWJsaXNoZWRdCisgIHB1c2g6CisgICAgdGFnczoKKyAgICAgIC0gInZbMC05XSoiCisgICAgICAtICIhdiouKiIKKyAg
      ICAgIC0gIiF2Ki1lZGdlIgogICB3b3JrZmxvd19kaXNwYXRjaDoKICAgICBpbnB1dHM6CiAgICAgICBkcnlfcnVuOgogICAg
      ICAgICBkZXNjcmlwdGlvbjogIlJlcG9ydCB0aGUgZmlsZSBsaXN0IGFuZCB0aGUgdGFnLCB3cml0ZSBub3RoaW5nLCBwdXNo
      IG5vdGhpbmciCiAgICAgICAgIHR5cGU6IGJvb2xlYW4KICAgICAgICAgZGVmYXVsdDogdHJ1ZQorICAgICAgbWlycm9yX2Fs
      aWFzOgorICAgICAgICBkZXNjcmlwdGlvbjogIk1pcnJvciB0aGUgZmxvYXRpbmcgdk1BSk9SIGFsaWFzIGluc3RlYWQgb2Yg
      cHVibGlzaGluZyAocmVjb3ZlcnkgcGF0aCBmb3IgYSBtaXNzZWQgdGFnLXB1c2ggZXZlbnQpIgorICAgICAgICB0eXBlOiBi
      b29sZWFuCisgICAgICAgIGRlZmF1bHQ6IGZhbHNlCiAKICMgTEVBU1QgUFJJVklMRUdFLCBhbmQgdGhpcyBibG9jayBpcyB0
      aGUgZGVjbGFyZWQgYmxhc3QgcmFkaXVzIHJhdGhlciB0aGFuIGEgbG9nIG9mIHdoaWNoIHRva2VuCiAjIGhhcHBlbmVkIHRv
      IGJlIHVzZWQuIEl0IGdvdmVybnMgR0lUSFVCX1RPS0VOLCB3aGljaCByZWFjaGVzIENBTk9OSUNBTCBvbmx5IOKAlCBhbmQg
      Y2Fub25pY2FsIGlzCkBAIC01NCw3ICs4OSwxMCBAQCBjb25jdXJyZW5jeToKIAogam9iczoKICAgcHVibGlzaDoKLSAgICBp
      ZjogdmFycy5GTE9XX1JFTEVBU0VfUFVCTElTSCA9PSAndHJ1ZScKKyAgICAjIE5ldmVyIG9uIGEgdGFnIHB1c2g6IHRoYXQg
      ZXZlbnQgaXMgdGhlIGFsaWFzIG1pcnJvcidzLCBhbmQgYSBwdWJsaXNoIGZpcmVkIGJ5IGl0IHdvdWxkIGJlCisgICAgIyBh
      IHNlY29uZCBzbmFwc2hvdCBvZiBhbiBhbHJlYWR5LXJlbGVhc2VkIHZlcnNpb24g4oCUIHJlZnVzZWQgYnkgdGhlIGltbXV0
      YWJsZS10YWcgcnVsZSwgYnV0CisgICAgIyByZWZ1c2VkIGxvdWRseSwgaW4gYSByZWQgam9iLCBldmVyeSB0aW1lIGEgaHVt
      YW4gbW92ZWQgYHYxYC4KKyAgICBpZjogdmFycy5GTE9XX1JFTEVBU0VfUFVCTElTSCA9PSAndHJ1ZScgJiYgZ2l0aHViLmV2
      ZW50X25hbWUgIT0gJ3B1c2gnICYmICFpbnB1dHMubWlycm9yX2FsaWFzCiAgICAgcnVucy1vbjogdWJ1bnR1LWxhdGVzdAog
      CiAgICAgZW52OgpAQCAtMTc4LDMgKzIxNiw3NyBAQCBqb2JzOgogICAgICAgICAgICAgY2F0ICIkUlVOTkVSX1RFTVAvcHVi
      bGlzaC5sb2ciIDI+L2Rldi9udWxsIHx8IGVjaG8gIihubyBwdWJsaXNoZXIgb3V0cHV0IOKAlCBhbiBlYXJsaWVyIHN0ZXAg
      ZmFpbGVkKSIKICAgICAgICAgICAgIGVjaG8gJ2BgYCcKICAgICAgICAgICB9ID4+ICIkR0lUSFVCX1NURVBfU1VNTUFSWSIK
      KworICAjIOKUgOKUgCB0aGUgZmxvYXRpbmcgYWxpYXMgdGhlIGZsZWV0IGFjdHVhbGx5IHBpbnMg4pSA4pSA4pSA4pSA4pSA
      4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA
      4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACisgICMgUnVucyB3aGVuIGNhbm9uaWNhbCdzIG93biBg
      dlhgIG1vdmVzIChzdGVwIDYgb2YgdGhlIHJlbGVhc2UgcHJvY2VkdXJlKSwgbmV2ZXIgd2hlbiBhCisgICMgcmVsZWFzZSBp
      cyBwdWJsaXNoZWQuIFNlZSB0aGUgaGVhZGVyIGZvciB3aHkgdGhvc2UgbXVzdCBub3QgYmUgdGhlIHNhbWUgYWN0LgorICBt
      aXJyb3ItYWxpYXM6CisgICAgaWY6IHZhcnMuRkxPV19SRUxFQVNFX1BVQkxJU0ggPT0gJ3RydWUnICYmIChnaXRodWIuZXZl
      bnRfbmFtZSA9PSAncHVzaCcgfHwgaW5wdXRzLm1pcnJvcl9hbGlhcykKKyAgICBydW5zLW9uOiB1YnVudHUtbGF0ZXN0CisK
      KyAgICBlbnY6CisgICAgICBGTE9XX1JFTEVBU0VfUkVQTzogJHt7IHZhcnMuRkxPV19SRUxFQVNFX1JFUE8gfHwgJ0NhbmRp
      ZERhbi9mbG93LXByb3RvY29sJyB9fQorICAgICAgRFJZX1JVTjogJHt7IGdpdGh1Yi5ldmVudF9uYW1lID09ICd3b3JrZmxv
      d19kaXNwYXRjaCcgJiYgaW5wdXRzLmRyeV9ydW4gfX0KKyAgICAgICMgT25seSBhIHRhZyBwdXNoIGNhcnJpZXMgYSBtb3Zl
      ZCByZWYuIEEgbWFudWFsIGRpc3BhdGNoIHJ1bnMgZnJvbSBgbWFpbmAsIHdob3NlIHJlZiBuYW1lCisgICAgICAjIGlzIG5v
      dCBhbiBhbGlhcywgc28gcGFzc2luZyBpdCB3b3VsZCB0cmlwIHRoZSBtb2R1bGUncyBvd24gImEgcmVmIHRoaXMgcmVsZWFz
      ZSBkb2VzIG5vdAorICAgICAgIyBuYW1lIiByZWZ1c2FsIOKAlCB0aGUgcmVjb3ZlcnkgcGF0aCBkZWxpYmVyYXRlbHkgc3Vw
      cGxpZXMgbm90aGluZyBhbmQgbGV0cyB0aGUgc3RhbXAgZGVjaWRlLgorICAgICAgUFVTSEVEX1JFRjogJHt7IGdpdGh1Yi5l
      dmVudF9uYW1lID09ICdwdXNoJyAmJiBnaXRodWIucmVmX25hbWUgfHwgJycgfX0KKworICAgIHN0ZXBzOgorICAgICAgLSB1
      c2VzOiBhY3Rpb25zL2NoZWNrb3V0QDExZDU5NjBhMzI2NzUwZDU4MzgwNzhlMzZjZjM4Yjg1YWY2NzcyNjIgIyB2NC40LjAK
      KyAgICAgICAgd2l0aDoKKyAgICAgICAgICAjIFRoZSBjb21taXQgdGhlIGFsaWFzIHdhcyBqdXN0IG1vdmVkIFRPIOKAlCB0
      aGF0IGlzIHRoZSB0cmVlIHdob3NlIFZFUlNJT04gZGVjaWRlcyBib3RoCisgICAgICAgICAgIyB0aGUgYWxpYXMgbmFtZSBh
      bmQgdGhlIHJlbGVhc2UgdGFnIGl0IHBvaW50cyBhdC4gRGVwdGggMTogbm90aGluZyBoZXJlIG5lZWRzIGhpc3RvcnksCisg
      ICAgICAgICAgIyBhbmQgdGhpcyBqb2IgcnVucyBgZ2l0IHB1c2hgIHRvIGFub3RoZXIgcmVtb3RlLgorICAgICAgICAgIGZl
      dGNoLWRlcHRoOiAxCisgICAgICAgICAgcGVyc2lzdC1jcmVkZW50aWFsczogZmFsc2UKKworICAgICAgLSB1c2VzOiBhY3Rp
      b25zL3NldHVwLW5vZGVANDk5MzNlYTUyODhjYWVjYTg2NDJkMWU4NGFmYmQzZjdkNjgyMDAyMCAjIHY0LjQuMAorICAgICAg
      ICB3aXRoOgorICAgICAgICAgIG5vZGUtdmVyc2lvbjogMjIKKworICAgICAgIyBJbnZvY2F0aW9uIG9ubHksIHNhbWUgZGl2
      aXNpb24gYXMgdGhlIHB1Ymxpc2ggc3RlcC4gRXZlcnkgZGVjaXNpb24g4oCUIHdoaWNoIGFsaWFzIHRoZQorICAgICAgIyBz
      dGFtcCBkZXJpdmVzLCB3aGV0aGVyIHRoZSByZWxlYXNlIGl0IHdvdWxkIHBvaW50IGF0IGlzIGV2ZW4gb24gdGhlIHRhcmdl
      dCwgYW5kIHdoYXQKKyAgICAgICMgInRoZSByZWxlYXNlIHRhZyBsYW5kZWQgYnV0IHRoZSBhbGlhcyBkaWQgbm90IiBpcyBj
      YWxsZWQg4oCUIGxpdmVzIGluIHJlbGVhc2UtcHVibGlzaC5tanMKKyAgICAgICMgYW5kIGlzIHByb3ZlZCBieSB0ZXN0cyBv
      dmVyIGBscy1yZW1vdGVgIG91dHB1dCByYXRoZXIgdGhhbiBieSBhIGxpdmUgcHVzaC4KKyAgICAgICMKKyAgICAgICMgVGhl
      IGNyZWRlbnRpYWwgaXMgaGFuZGxlZCBleGFjdGx5IGFzIHRoZSBwdWJsaXNoIHN0ZXAgaGFuZGxlcyBpdCwgYW5kIGZvciB0
      aGUgc2FtZSB0aHJlZQorICAgICAgIyByZWFzb25zIHNwZWxsZWQgb3V0IHRoZXJlOiBub3QgaW4gdGhlIHJlbW90ZSBVUkws
      IG5vdCBpbiBhcmd2LCBub3QgaW4gdGhlIHJ1bm5lcidzCisgICAgICAjIGdsb2JhbCBnaXQgY29uZmlnLiBHSVRfQ09ORklH
      X0NPVU5UIHNjb3BlcyBpdCB0byB0aGlzIGNvbW1hbmQncyBwcm9jZXNzIHRyZWUsIHdoaWNoIHRoZQorICAgICAgIyBnaXQg
      Y2hpbGRyZW4gdGhlIG1vZHVsZSBzcGF3bnMgaW5oZXJpdC4KKyAgICAgIC0gbmFtZTogTWlycm9yIHRoZSBhbGlhcyB0byB0
      aGUgcmVsZWFzZSByZXBvCisgICAgICAgIGVudjoKKyAgICAgICAgICBGTE9XX1JFTEVBU0VfUEFUOiAke3sgc2VjcmV0cy5G
      TE9XX1JFTEVBU0VfUEFUIH19CisgICAgICAgIHJ1bjogfAorICAgICAgICAgIHNldCAtZXVvIHBpcGVmYWlsCisgICAgICAg
      ICAgQVVUSD0iJChwcmludGYgJ3gtYWNjZXNzLXRva2VuOiVzJyAiJEZMT1dfUkVMRUFTRV9QQVQiIHwgYmFzZTY0IC13MCki
      CisgICAgICAgICAgZWNobyAiOjphZGQtbWFzazo6JEFVVEgiCisKKyAgICAgICAgICBBUkdTPSgtLW1pcnJvci1hbGlhcwor
      ICAgICAgICAgICAgICAgIC0tcmVtb3RlICJodHRwczovL2dpdGh1Yi5jb20vJEZMT1dfUkVMRUFTRV9SRVBPLmdpdCIKKyAg
      ICAgICAgICAgICAgICAtLXdvcmstZGlyICIkUlVOTkVSX1RFTVAvZmxvdy1yZWxlYXNlLWFsaWFzIikKKyAgICAgICAgICBp
      ZiBbIC1uICIkUFVTSEVEX1JFRiIgXTsgdGhlbiBBUkdTKz0oLS1wdXNoZWQtcmVmICIkUFVTSEVEX1JFRiIpOyBmaQorICAg
      ICAgICAgIGlmIFsgIiREUllfUlVOIiA9ICJ0cnVlIiBdOyB0aGVuIEFSR1MrPSgtLWRyeS1ydW4pOyBmaQorCisgICAgICAg
      ICAgR0lUX0NPTkZJR19DT1VOVD0xIFwKKyAgICAgICAgICBHSVRfQ09ORklHX0tFWV8wPSJodHRwLmh0dHBzOi8vZ2l0aHVi
      LmNvbS8uZXh0cmFoZWFkZXIiIFwKKyAgICAgICAgICBHSVRfQ09ORklHX1ZBTFVFXzA9IkFVVEhPUklaQVRJT046IGJhc2lj
      ICRBVVRIIiBcCisgICAgICAgICAgICBub2RlIC5mbG93L2Jpbi9yZWxlYXNlLXB1Ymxpc2gubWpzICIke0FSR1NbQF19IiB8
      IHRlZSAiJFJVTk5FUl9URU1QL2FsaWFzLmxvZyIKKworICAgICAgIyBgaWY6IGFsd2F5cygpYCwgYmVjYXVzZSB0aGUgcnVu
      IHRoaXMgc3VtbWFyeSBtYXR0ZXJzIG1vc3QgZm9yIGlzIHRoZSBGQUlMRUQgb25lOiBhCisgICAgICAjIHJlbGVhc2Ugd2hv
      c2UgdGFnIGxhbmRlZCBhbmQgd2hvc2UgYWxpYXMgZGlkIG5vdCBpcyB0aGUgc3RhdGUgdGhhdCBsb29rcyBmaW5lIGZyb20g
      dGhlCisgICAgICAjIHJlbGVhc2UgcmVwbydzIHRhZyBsaXN0IGFuZCByZXNvbHZlcyB0byB0aGUgcHJldmlvdXMgcmVsZWFz
      ZSBmcm9tIGV2ZXJ5IGNhbGxlci4gVGhlCisgICAgICAjIG1vZHVsZSdzIGxhc3QgbGluZSBjYXJyaWVzIGBkZWNpc2lvbj1w
      dWJsaXNoZWQtd2l0aG91dC1pdHMtYWxpYXNgLCBzbyB0aGUgZGlzdGluY3Rpb24KKyAgICAgICMgc3Vydml2ZXMgaW50byB0
      aGUgc3VtbWFyeSByYXRoZXIgdGhhbiBsaXZpbmcgb25seSBpbiB0aGUgZXhpdCBjb2RlLgorICAgICAgLSBuYW1lOiBTdW1t
      YXJpc2UgdGhlIGFsaWFzIG1vdmUKKyAgICAgICAgaWY6IGFsd2F5cygpCisgICAgICAgIHJ1bjogfAorICAgICAgICAgIHNl
      dCAtZXVvIHBpcGVmYWlsCisgICAgICAgICAgeworICAgICAgICAgICAgZWNobyAiIyMjIGZsb3ctcmVsZWFzZS1wdWJsaXNo
      IC8gYWxpYXMgLT4gXGAkRkxPV19SRUxFQVNFX1JFUE9cYCIKKyAgICAgICAgICAgIGVjaG8gIiIKKyAgICAgICAgICAgIGlm
      IFsgIiREUllfUlVOIiA9ICJ0cnVlIiBdOyB0aGVuIGVjaG8gIioqRHJ5IHJ1bioqIOKAlCBub3RoaW5nIHdhcyBwdXNoZWQu
      IjsgZWNobyAiIjsgZmkKKyAgICAgICAgICAgIGVjaG8gJ2BgYCcKKyAgICAgICAgICAgIGNhdCAiJFJVTk5FUl9URU1QL2Fs
      aWFzLmxvZyIgMj4vZGV2L251bGwgfHwgZWNobyAiKG5vIG91dHB1dCDigJQgYW4gZWFybGllciBzdGVwIGZhaWxlZCkiCisg
      ICAgICAgICAgICBlY2hvICdgYGAnCisgICAgICAgICAgfSA+PiAiJEdJVEhVQl9TVEVQX1NVTU1BUlkiCg==

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
