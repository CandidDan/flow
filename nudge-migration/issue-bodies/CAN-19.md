<!-- title: CAN-19: Harness Phase 1 — reply-context replays + fixtures library -->
<!-- labels: feature,testing,P3 -->

## Why
The existing `/harness` (Phase 0, shipped 2026-04-28) is prompt-only — it feeds raw WhatsApp-style text to the intent classifier and inspects Haiku/Sonnet output. Useful for the generic intent classifier, but doesn't simulate the case that matters most for trust: **"user is in reply context X, sent body Y, what does the pipeline actually do?"** That's the gap that let CAN-10 and CAN-11 slip into production — those repros live in the reply-handler integration layer where parser → DB lookup → handler → response interact.

## Scope
1. **Reply-context selector in /harness** — dropdown of message_type: session_nudge, debrief, close_loop_draft, photo_confirm, capacity_warning, weekly_review, post_meeting_capture, stall_detection, midday_checkpoint, photo_recurring. Defaults to "none / generic intent".
2. **Mock DB state per context** — each context has known dependencies (e.g. session_nudge needs a commitment_sessions row + parent recurring_commitments). Harness accepts a JSON blob (or form) describing pending state, then routes the inbound through parser + handler in **dry-run mode** (no DB writes; capture intended writes for display). Reuse the pure-logic separation; wrap = stubbed supabase client.
3. **Full trace display** — route matched (0.4/0.5/0.75/0.77/0.85/0.9/0.95/dispatchReplyContext), parser output, fall-through events with reason (CAN-18 telemetry format), handler response string, intended DB writes (table+payload), Sonnet call count + raw output for LLM parsers.
4. **Fixtures library** — `tests/harness/fixtures/replies/*.json`, schema: {name, context, pending_state, inbound_body, expected_response_contains[], expected_db_writes[]}. Seed with the two trust-busters: `can-10-later-10pm-on-session-nudge.json`, `can-11-debrief-natural-language.json`.
5. **CI integration** — `npm run harness:fixtures` runs every fixture headless and asserts. Hook into the pre-merge gate.

## Acceptance
- Both screenshot bugs reproducible in /harness without real WhatsApp messages.
- Each reply context: ≥1 positive fixture + 1 negative (verifies the CAN-12 soft-gate fires).
- Fixtures run via `npm test` or `npm run harness:fixtures`.
- New reply contexts require a fixture (lint or docs convention).

## Not in scope
Voice/forwarded/photo (Phase 2); real Supabase staging (keep dry-run).

## Long-term payoff
Every parser ticket adds a fixture to its definition of done. Over a year that's a real eval corpus — for swapping regex parsers for LLM ones or grading new models. The fixtures library is the durable artefact; the UI is the on-ramp.

_Migrated from Linear CAN-19 (verbatim)._
