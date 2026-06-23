<!-- title: CAN-16: Verify send-channel-health-check is actually firing correctly -->
<!-- labels: investigation,P3 -->

## Why
Dan's gut said WhatsApp messages aren't all landing because of "the sandbox." The `send-channel-health-check` watchdog shipped 2026-05-06 (PR #26) specifically to catch silent Twilio outages within ~1h of entering active hours. Confirm it's doing its job — either zero alerts (delivery actually fine) or surfacing alerts we missed.

## Investigation steps
1. `notification_log` last 7 days: count of `channel='whatsapp'` rows by status (sent/failed). Silent failures?
2. `profiles.last_channel_alert_at` — has the watchdog fired in the last 7 days?
3. Verify cron scheduled: grep `app/vercel.json` for `channel-health-check`.
4. Verify `verify_jwt: false` in `supabase/config.toml` for `send-channel-health-check` (silent-failure pattern per CLAUDE.md re: Supabase rebrand).
5. Send a test failure (misconfigure a phone temporarily, or the `whatsapp/test` route) and confirm the alert fires.

## Likely outcomes
- Outage detected but no alert → bug in `health-logic.ts` or cron not wired
- No outage → perception was sandbox-side or memory artefact; close as no-op
- Alerts fired but unnoticed → revisit the alert channel

## File refs
`supabase/functions/send-channel-health-check/health-logic.ts` · `health-email.ts` · `app/src/app/api/cron/channel-health-check/route.ts` · `app/vercel.json` · `supabase/config.toml`

_Migrated from Linear CAN-16 (verbatim)._
