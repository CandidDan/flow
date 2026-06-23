<!-- title: resolveAgendaWindow ignores its timezone argument (agenda windows wrong for non-UTC users) -->
<!-- labels: bug,trust-buster,timezone -->

## Summary

`resolveAgendaWindow(window, timezone, now)` in `supabase/functions/_shared/agenda.ts` does not
honour its `timezone` argument — it computes day/hour boundaries against the **system clock**
instead. Three tests in `supabase/functions/_shared/__tests__/agenda.test.ts` only pass when the
process runs in UTC; the Flow gate masks this by pinning `TZ=UTC` on the `test`/`coverage`
commands, so CI is green while the underlying behaviour is wrong.

## Reproduce

Run the suite **without** forcing UTC (i.e. in any non-UTC system timezone, e.g. Europe/Madrid):

```
cd app && npm test
```

Three failures in `agenda.test.ts`, all a fixed offset from the expected UTC boundary:

```
this_morning: expected 2026-05-18T00:00:00.000Z, received 2026-05-17T23:00:00.000Z
this_evening: expected 2026-05-18T17:00:00.000Z, received 2026-05-18T16:00:00.000Z
today:        expected 2026-05-18T00:00:00.000Z, received 2026-05-17T23:00:00.000Z
```

The test passes `"UTC"` explicitly, so a correct implementation would return UTC boundaries
regardless of the host TZ. It doesn't → the `timezone` parameter is being ignored.

## Impact

This is real, not cosmetic. Nudge computes agenda/digest windows ("what's on this morning",
active hours, day boundaries) per user timezone — and the primary user is moving to
Europe/Madrid (UTC+2). With the bug, a user not in UTC gets agenda windows shifted by their
offset, so "this morning" / "today" can resolve to the wrong day boundary. The gate's `TZ=UTC`
pin means a regression here will never be caught by CI as long as the masking stays.

## Suggested fix

1. Make `resolveAgendaWindow` derive its boundaries from the passed `timezone` (e.g. compute the
   local day start/end in that zone, then convert to ISO/UTC) rather than relying on the host
   clock. The other date helpers (`buildDateResolutionGuidance`) already inject an offset table —
   reuse that approach.
2. Add a test that runs with the host TZ set to a non-UTC zone and still gets correct UTC
   boundaries for a given `timezone` arg (proves the param is honoured, not the host clock).
3. Once fixed, **remove the `TZ=UTC` pin** from the `test`/`coverage` commands in `.flow/config.yml`
   so the gate exercises real timezone behaviour instead of hiding it.

## Provenance

Surfaced 2026-06-08 during the first Flow task on Nudge (CAN-30): the gate ran `npm test` and the
three agenda tests failed locally (non-UTC), revealing the `TZ=UTC` mask. Captured here rather
than fixed inline to keep CAN-30 in scope.
