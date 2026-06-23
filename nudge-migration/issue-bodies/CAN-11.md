<!-- title: CAN-11: Fix debrief parser silent-failure on natural-language replies -->
<!-- labels: bug,trust-buster,P1 -->

## Repro
Bot prompt at 21:00: `How was today? Anything worth noting — what you worked on, how long things took, or stuff that came up unplanned? (Voice note works too.)`
User reply at 21:01: `Been working on Profis Rams and Profis mobile mainly today and an hour of Bone Shaker working on the seo tasks`
Bot response: `Thanks — nothing to log. Let me know if you want me to note anything specifically.`

Expected: at least three entries extracted — Profis RAMS (ambiguous, "mainly today"), Profis mobile (null project, ambiguous), Bone Shaker (60 mins, literal, "SEO tasks").
Actual: empty parse, polite-but-lossy confirmation, zero data persisted, Phase 4.5 untracked-project promotion loop never primed for "Profis mobile."

## Diagnosis
`handleDebriefReply` at `supabase/functions/process-inbound/index.ts:2845` calls `runDebriefParser` (line 2872). At line 2874:

```ts
if (parsed.entries.length === 0 && parsed.completed_items.length === 0 && parsed.skipped_items.length === 0) {
  return "Thanks — nothing to log. Let me know if you want me to note anything specifically.";
}
```

Two failure modes produce that, and we can't tell them apart today:

**Scenario A — Sonnet returned the empty object.** The prompt at `debrief-logic.ts:221` explicitly allows `reported_mins: 0` with `duration_intent: "ambiguous"` for vague entries — so a correct Sonnet response should have produced at least the unambiguous "an hour of Bone Shaker" entry. Returning zero for this input is a model regression — Sonnet over-applied "precision over recall" and discarded everything, including the clearly-extractable Bone Shaker line.

**Scenario B — JSON parse threw.** At `index.ts:3361` the try/catch swallows any parse failure and returns the same empty shape, logging to console.error. Indistinguishable from Scenario A from the user's side.

## Fix (three sub-fixes)
1. **Defensive UX — friendly fallback.** When `parsed` is empty but the transcript is non-trivial (>10 words, or contains at least one number/duration hint, or matches a known project name case-insensitively), respond with `"I didn't catch the project or duration — try again? e.g. 'an hour on Bone Shaker on SEO tasks'"` instead of "nothing to log". Only emit the polite "nothing to log" for genuinely empty transcripts (`"thanks"`, `"all good"`, etc.).
2. **Diagnostic logging.** In `runDebriefParser` (`index.ts:3341`), log the raw Sonnet output BEFORE `JSON.parse` and a separator after parse, so Scenario A vs B is debuggable from logs. Structured `[debrief_parse] {...}` format matching the existing `[time_query]` convention from v45.
3. **Prompt revision.** Add a "Minimum extraction" rule to `buildDebriefSystemPrompt` (`debrief-logic.ts:221`): "If the user mentions a specific duration tied to a specific project, you MUST extract at least that entry — even if other parts of the message are vague. Use `null` for `project_match` if the project isn't in the list, and `ambiguous` for any vague portion. Returning a fully empty entries array is only correct when the user provided no project, duration, or task signal at all (e.g. 'thanks', 'nothing today')."

## Acceptance
- The repro transcript above produces ≥1 entry on Bone Shaker (60 mins, "SEO tasks").
- Empty-transcript replies ("thanks") still get the polite "nothing to log" message.
- Non-trivial replies that genuinely parse to empty get the "I didn't catch …" fallback.
- Sonnet's raw output appears in the logs for any debrief reply.

## Why this matters more than CAN-10
Debrief is the highest-value capture of the day. The current behaviour eats your retrospective, blocks PRD-DEBRIEF Phase 4.5's untracked-project promotion (mentions never accumulate), and the polite confirmation makes the failure invisible — you only notice when something feels off later.

## Long-term
Pull harness Phase 1 (CAN-19) forward to cover debrief replies — would have caught this before deploy.

## File refs
- `supabase/functions/process-inbound/index.ts:2845` — `handleDebriefReply`
- `supabase/functions/process-inbound/index.ts:2874` — the "nothing to log" branch
- `supabase/functions/process-inbound/index.ts:3341` — `runDebriefParser`
- `supabase/functions/process-inbound/debrief-logic.ts:221` — Sonnet system prompt
- `supabase/functions/process-inbound/debrief-logic.ts:268` — user message builder (project list context)

_Migrated from Linear CAN-11 (verbatim). Related: CAN-23 (the Pattern B umbrella covers this site)._
