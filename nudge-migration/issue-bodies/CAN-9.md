<!-- title: CAN-9: Add WhatsApp quick-reply buttons to session nudges -->
<!-- labels: feature,P3 -->

Replace the free-text "Reply: done / later / skip" footers on recurring-commitment, stall-detection, mid-day checkpoint, and post-meeting capture prompts with WhatsApp interactive quick-reply buttons. One tap instead of typing, and zero parser ambiguity.

**Why:** the parser keeps catching edge cases ("Yep all done", voice-to-text variations) that buttons would side-step entirely. Recent fixes on `claude/fix-voice-command-loop-eLSd7`: 5300+ lines of `process-inbound` parsing complexity that buttons let us trim.

**Implementation outline:**
- Register `twilio/quick-reply` Content Templates in Twilio Console: `session_done_later_skip` (recurring commitments execution), `session_done_move_skip` (escalation), `stall_on-it_tomorrow_done` (stall detection), `checkpoint_on-it_push_show-all` (mid-day checkpoint)
- Get Meta approval for each (typically <24h)
- Add `TWILIO_TEMPLATE_SID_*` env vars
- Update senders to Twilio Content API with template SID + dynamic body var: `nudge-commitments`, `send-stall-detection`, `send-midday-checkpoint`, `send-post-meeting-nudge` (all under supabase/functions/)
- Inbound: button taps come back as `Body=<label>` so existing `parseSessionReply` keeps working — no logic change
- Drop the "Reply: done / later / skip" footer from `_shared/commitments.ts buildTonedDispatchMessage`

**Acceptance:**
- Tapping a button on the bin-out prompt resolves the session in <1s
- 24h-window prompts deliver as templates with buttons
- Free-text fallback still works (existing parser path)
- No regression in existing parser specs

**Out of scope:** WhatsApp List Messages (>3 options), debrief prompts (need free-form replies).

**Note (2026-06-05):** CAN-28 has since shipped `_shared/twilio.ts` sendTemplated + ButtonPayload routing in reply-context.ts — check current state before scoping; part of the inbound path may already exist.

_Migrated from Linear CAN-9 (verbatim + migration note). PRD-EDITING's inline-edit deferral gates on this + the (shipped) CAN-12._
