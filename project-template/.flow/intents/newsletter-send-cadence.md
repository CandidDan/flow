---
# ── machine fields (the intent-writer skill and flow-doctor read/write these) ──
id: "newsletter-send-cadence"
title: "Let people choose how often they hear from us, so we stop losing the ones who like us"
status: "proposed"
created: "2026-06-01"
source: "Priya (marketing lead), interviewed 2026-06-01"
serves: ["G1"]
supersedes: ""
approved_by: ""
approved_at: ""
evidence: []
---

> This file is the worked example that ships with the template — an intent filled in, at the
> status every intent starts at. It is not about this repo. Read it for the shape, then delete it
> or leave it; `_TEMPLATE.md` next to it is the blank to copy. Note the one `[assumption]` line
> below, and that `## Problem` does not contain one.

## Problem

"Everyone on the list gets the same email on the same day, and the unsubscribes all arrive in the
two hours after a send. The people leaving aren't the ones who never open it — they're the ones
who opened the last four. They're not bored, they're swamped. I've had three replies this quarter
saying some version of 'I like this, it's just too much', and the only thing I can offer them is
the unsubscribe link."

Priya has no way to tell the difference between someone who wants less and someone who wants
none, so both end up in the same place.

## Cost of inaction

The list keeps shedding its most engaged readers — the ones who opened four in a row before they
left — and every one of them is a person who told us, by opening, that they wanted to hear from
us. Nothing about that gets better on its own, and the people lost this way are the hardest and
most expensive to win back.

## Outcome

Someone who likes the newsletter but not its frequency has something to do other than
unsubscribe, and takes it: the share of departures that are a cadence change rather than a full
unsubscribe is visible and non-trivial, and Priya can say which it was without asking anyone.

Stated so it can fail: if we ship this and everyone who would have unsubscribed still
unsubscribes, the intent was wrong, not under-built.

## Constraints

- The existing `/api/subscribe` endpoint and the send pipeline are not being replaced as part of
  this; whatever is chosen has to sit on top of them.
- Whatever a subscriber picks has to be changeable later without emailing support.
- [assumption] Three options — daily, weekly, monthly — is enough granularity, and weekly is the
  right default because it is what everyone receives today. Priya named no specific set; strike
  this and say what the real options are if it is wrong, because the answer changes the work.

## Open questions

- What happens to the people already on the list? Are they defaulted to the current cadence
  silently, or asked once? Priya has a view on whether asking is a second unsubscribe prompt.
- Does the cadence choice belong at signup, in a preferences page, in the footer of every send,
  or in all three? The interview only covered signup.
- Is "pause for 30 days" the same feature or a different one? It came up and was not resolved.
