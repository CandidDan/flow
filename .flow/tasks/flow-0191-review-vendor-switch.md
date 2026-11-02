---
id: "flow-0191"
title: "qa, code-review and security can each be switched between Claude and Codex by one config value, and each still runs in its own session on whichever vendor is chosen"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-11-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Waits on three tasks. flow-0186 creates the per-check verdict file the Codex step must write. flow-0187's research doc names the Codex model and action inputs this task uses. flow-0188 adds the verifier model call, which must also follow the check's vendor, so this task is specified against the workflow after it lands."
blocked_by: ["flow-0186", "flow-0187", "flow-0188"]
serves: ["G10", "G9"]
intent: "review-runs-on-any-agent"
touches:
  - ".github/workflows/_flow-review.yml"
  - ".github/workflows/flow-review.yml"
  - "project-template/.github/workflows/flow-review.yml"
  - "project-template/.flow/bin/flow-review.mjs"
  - "project-template/.flow/bin/flow-review.test.mjs"
  - "project-template/.flow/config.yml"
  - "project-template/.flow/PROTOCOL.md"
  - ".flow/bin/review-vendor-workflow.test.mjs"
  - ".flow/bin/flow-review-workflow.test.mjs"
  - ".flow/bin/secrets-scope.test.mjs"
  - ".flow/bin/action-pins.test.mjs"
  - ".flow/bin/workflow-prompt-paths.test.mjs"
  - "docs/flow-reusable-workflows.md"
  - "changes/flow-0191.md"
labels: [review, gate, vendor]
model: "opus"
effort: "high"
model_reason: "Adds a second vendor to the fleet's review gate and a new secret to a reusable workflow; a silent fallback or a fail-open Codex step would weaken every adopting repo's gate"
asks: []
notes:
  - "2026-11-01 orchestrator: derived from the approved intent review-runs-on-any-agent (merged in CandidDan/flow#271). Written in a different session from the one that drafted the intent."
  - "2026-11-01 orchestrator: intent open question 'who chooses the vendor' is decided here as BOTH, following the flow-0144 precedent for models: canonical holds the default per check (DEFAULT_VENDORS in flow-review.mjs, all `claude`), so one reviewed canonical PR switches the fleet; a repo can override one check with `review.<check>_vendor` in its .flow/config.yml, and the plan summary warns naming the override, as it does for a set model key. Dan may overrule."
  - "2026-11-01 orchestrator: intent open question 'are intent-review and the guide in scope' is decided here as NO: only the three verdict-giving checks Dan named. intent-review and the guide stay on Claude. Dan may overrule; it would be a follow-up task, not a change to this one."
  - "2026-11-01 orchestrator: intent open question 'calibrate Codex before its verdict blocks' is decided here as: switching is never gated (Dan: 'switch any review to codex and vice-versa at anytime'), and a Codex review blocks from the first run, exactly like a Claude one. Calibration is measurement, not a gate: flow-0192 scores both vendors on the eval set so the switch is an informed one. Dan may overrule."
  - "2026-11-01 orchestrator: billing. Dan rejected moving reviews to per-token API billing. So this task never wires an OpenAI API key. The Codex step takes the credential that flow-0187's research doc (docs/research/review-runtime.md, section 3) identifies as billing the ChatGPT plan. If that doc says Codex in CI can only bill API tokens, the worker blocks (see Scope step 0) rather than building. SUPERSEDED 2026-11-02 by Dan's decision below."
  - "2026-11-01 orchestrator: if flow-0187 recommends moving reviews off GitHub runners (Claude routines), that is a separate phase-2 task. This task builds on the review job as it exists when claimed (one runner job, from flow-0193). Whichever task moves the reviews later must carry both vendors."
  - "2026-11-02 orchestrator: Dan decided Codex is OPT-IN on API-token billing. flow-0187 (PR #272) found the only Codex path that returns a verdict in CI is openai/codex-action with an API key; Codex's plan-billed GitHub review gives no pass/fail and sets no check. So: secret FLOW_CODEX_API_KEY, every default stays claude, and no repo pays tokens unless it switches a check. Dan has set a $50 spending cap as the ceiling. Codex access tokens (plan-billed automation) exist only for ChatGPT Enterprise workspaces and are documented for private CI runners; they are out of scope here and would be a follow-up task if Dan moves to Enterprise."
---

## Context

After flow-0186 and flow-0188, `.github/workflows/_flow-review.yml` runs qa, code-review and
security in one runner job (flow-0193), which posts the three check runs. Each check has its own model step (`anthropics/claude-code-action`),
which writes `$RUNNER_TEMP/flow-review/<check>.json`; flow-0188 adds one verifier model call per
blocking finding, which writes `$RUNNER_TEMP/flow-review/<check>.verify/<id>.json`. Everything
after the model steps reads only those files. Every model step is Claude. Nothing in canonical
can run a review on Codex.

`project-template/.flow/PROTOCOL.md` (section *The gate*) says the reviewer is "not a
vendor-neutral reviewer". After this task that sentence is false and must change in the same PR.

## Scope

0. **Read first.** Read `docs/research/review-runtime.md` (flow-0187), sections 3 and 5, for the
   Codex model to default to and the `openai/codex-action` inputs. Codex in CI bills API tokens
   (decided 2026-11-02, see notes): build it, opt-in only.
1. **The vendor setting.** In `project-template/.flow/bin/flow-review.mjs`:
   - Export `DEFAULT_VENDORS = { qa: "claude", "code-review": "claude", security: "claude" }`
     and `CODEX_DEFAULT_MODELS` (one Codex model per check, from section 3 of the research doc).
   - `parseReviewConfig` reads three optional keys, `review.qa_vendor`,
     `review.code_review_vendor` and `review.security_vendor`. Allowed values: `claude`, `codex`.
     Any other value throws a `ReviewError` naming the key and the value. A set key adds a
     warning in the same style as `setModelWarning`.
   - The model for a check is: its model key if set, else `DEFAULT_MODELS` when the vendor is
     `claude`, else `CODEX_DEFAULT_MODELS` when the vendor is `codex`. A check whose vendor is
     `codex` and whose model is a Claude model (starts with `claude-`, or is `haiku`, `sonnet`,
     `opus` or `fable`) throws a `ReviewError` naming the check, the vendor and the model.
   - `plan` emits `qa_vendor`, `code_review_vendor` and `security_vendor` as outputs and prints
     each check's vendor and model in the run summary.
2. **The Codex step.** For each of qa, code-review and security, add a Codex model step next to
   the Claude one. Exactly one of the two runs, chosen by that check's vendor output. Both:
   - get the **same prompt text**, from one source (for example one `env` value or one file
     written by an earlier step), so the two vendors can never drift to different instructions;
   - write the same verdict file, `$RUNNER_TEMP/flow-review/<check>.json`, validated by the same
     validator; a missing or invalid file fails the check closed, as for Claude;
   - are separate invocations: one Codex process per check, never resumed and never given another
     check's session, prompt, output or verdict file.
   Do the same for flow-0188's verifier call: the verifier for a finding runs on the vendor of the
   check that raised it, as its own invocation.
   Use either `openai/codex-action` pinned by full commit SHA (the rule `action-pins.test.mjs`
   enforces) or the Codex CLI installed at an exact version. Never run Codex with its sandbox
   switched off.
3. **The credential.** The reusable workflow declares one new optional secret,
   `FLOW_CODEX_API_KEY` (an OpenAI API key, billed per token). Canonical's caller (`.github/workflows/flow-review.yml`) and the template
   caller (`project-template/.github/workflows/flow-review.yml`) pass it by name, never with
   `secrets: inherit`. Never interpolate it into a `run:` string; pass it through `env:`, set on the
   Codex step only (never job-wide), because the job runs repository-controlled code. It is the
   only OpenAI credential any workflow declares.
4. **No silent fallback.** When a check's vendor is `codex` and `FLOW_CODEX_API_KEY` is empty, that
   check fails, and its summary says `vendor is codex but the FLOW_CODEX_API_KEY secret is not set`.
   It never runs on Claude instead. The same rule the other way: a check set to `claude` with no
   `CLAUDE_CODE_OAUTH_TOKEN` fails rather than running on Codex.
5. **What does not change.** The PR check names stay exactly `qa`, `code-review` and `security`
   whichever vendor runs them. The "Report the model that answered" step names the vendor as well
   as the model; for Codex it prints `not reported by codex` when the output does not name one.
6. **Docs.** Rewrite the PROTOCOL.md paragraph that ends "not a vendor-neutral reviewer" to say
   each review check can run on Claude or Codex, chosen per check, each in its own session.
   Add a section to `docs/flow-reusable-workflows.md` titled `### Running a review on Codex`:
   the three keys, the canonical default, the secret, and that switching one check does not
   change the others. Document the three keys as comments in the `review:` block of
   `project-template/.flow/config.yml`, unset, in the same style as the model keys.
7. Fragment `changes/flow-0191.md`: a top-level bullet stating the caller action. Expected:
   **No caller action** to stay on Claude; to run a check on Codex, add the `FLOW_CODEX_API_KEY`
   secret and set that check's `review.<check>_vendor: codex`.

**Does not:** change any review prompt's content; change `DEFAULT_MODELS` or any Claude default;
move intent-review, the guide, or the auto-fix worker (`_flow-kickback.yml`) to Codex; switch any
check in canonical or the template to Codex (all defaults stay `claude`);
change how the review is triggered or where it runs.

## Acceptance criteria

- [ ] `flow-review.test.mjs`: given no vendor keys, `parseReviewConfig` resolves all three checks
      to `claude` with the `DEFAULT_MODELS` models and no vendor warning.
- [ ] `flow-review.test.mjs`: given `code_review_vendor: codex` alone, code-review resolves to
      `codex` with its `CODEX_DEFAULT_MODELS` model, qa and security stay `claude` with their
      Claude models, and the warnings name `review.code_review_vendor`.
- [ ] `flow-review.test.mjs`: a vendor value other than `claude`/`codex`, and a `codex` check whose
      model is `claude-opus-5-5` or `opus`, each throw a `ReviewError` naming the key or check.
- [ ] `review-vendor-workflow.test.mjs` parses `_flow-review.yml` and asserts that, for each of
      qa, code-review and security, there is one Claude and one Codex model step, gated on that
      check's vendor output with conditions that cannot both be true; and the same pairing for
      every verifier model step.
- [ ] The same test asserts that each pair receives its prompt from one shared source, and that
      each Codex step writes `$RUNNER_TEMP/flow-review/<check>.json` (or the verifier path) and
      reads no other check's files or outputs.
- [ ] The same test asserts no Codex step is resumed or reuses a session, and that every Codex
      invocation keeps its sandbox on.
- [ ] The same test asserts that a `codex` check with an empty `FLOW_CODEX_API_KEY` fails with the
      message in Scope step 4 and runs no Claude step for that check.
- [ ] `secrets-scope.test.mjs`: the reusable declares `FLOW_CODEX_API_KEY` as optional, both callers
      pass it by name, it reaches only the Codex steps, through step-level `env:`, and no workflow
      declares any other OpenAI credential secret.
- [ ] `flow-review-workflow.test.mjs`: the PR checks are still named `qa`, `code-review` and
      `security`.
- [ ] `review-vendor-workflow.test.mjs` asserts `project-template/.flow/PROTOCOL.md` no longer contains "not a vendor-neutral
      reviewer" and that `docs/flow-reusable-workflows.md` has the `### Running a review on Codex`
      heading.
- [ ] `changes/flow-0191.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
