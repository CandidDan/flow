---
id: "CAN-29"
title: "Enable prompt caching on classify, extract, and process-inbound edge functions"
status: "in_progress"
priority: 4
project: "nudge"
owner: "dan"
created: "2026-05-21"
started: "2026-05-30"
branch: ""
pr: ""
issue: "https://linear.app/candid-tech/issue/CAN-29/enable-prompt-caching-on-classify-extract-and-process-inbound-edge"
blocked_reason: ""
touches: ["supabase/functions/extract/index.ts", "supabase/functions/classify/index.ts", "supabase/functions/process-inbound/intent-prompts.ts", "app/src/app/api/harness/**"]
labels: [feature, cost, migrated-from-linear]
notes:
  - "2026-06-05 migrated from Linear CAN-29 (was In Progress; bounced Done→In Progress on 2026-06-01)"
---

## Context

Sonnet traffic (`extract` + intent classification) runs at 0.0% cache read ratio — every email
and inbound message pays full input cost. Caching the static portion of the system prompts
shaves ~85% off that input spend. Low priority at today's volume (~$0.14/day) but the refactor
is cheap (~2h) and the win compounds with Alpha users. Full background, console baselines and
caveats: see the linked Linear issue (export before sunsetting Linear).

**Verify before starting:** confirm Nudge's API key workspace attribution, and investigate why
Haiku shows only ~4K tokens/7d when classify crons every 15 min — don't trust the baseline blind.

## Scope

- Refactor 4 prompt builders to return `{ static, dynamic }`: `extract` (buildInbound/Outbound
  SystemPrompt), `classify` (both SYSTEM_PROMPTs), `process-inbound/intent-prompts.ts` (Haiku
  triage + Sonnet intent). Static = instructions/examples/rules (≥1024 tokens, verified);
  dynamic = timezone/today/userEmail/date-resolution guidance, AFTER static.
- Update SDK call-sites to `system: [{text: STATIC, cache_control: {type:"ephemeral"}}, {text: DYNAMIC}]`.
- Keep a `buildFullPrompt()` concatenating wrapper so the harness contract is unchanged.
- Does **not** touch prompt content/behaviour, the extended-cache-ttl beta (deferred), or any
  other edge function.

## Acceptance criteria

- [ ] Given a saved harness case, when run before and after the refactor, then classifier output matches char-for-char.
- [ ] Given the refactored call-sites, when a request fires, then the system parameter is the two-block structured form with cache_control on the static block only.
- [ ] Given 24h of production traffic post-deploy, when the caching dashboard is checked, then Sonnet read ratio > 60% and Haiku > 50%.
- [ ] Given the harness route, when invoked, then it still receives the full concatenated prompt via the wrapper.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

The dashboard-read-ratio criterion (24h post-deploy) can't gate the PR — treat it as a
post-merge verification step recorded back onto this task. Cache writes cost 1.25×; net win
needs ≥2 reads per 5-min window — fine at 15-min cron during active hours, watch overnight.
