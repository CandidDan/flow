---
id: "PROJ-0001"
title: "Add email + frequency to newsletter signup with validation"
status: "ready"
priority: 2
project: "proj"
owner: ""
created: "2026-06-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G1"]           # the VISION.md goal id this advances (or "maintenance");
                         # flow-doctor fails a ready task whose serves does not resolve there
touches: ["src/components/signup/**", "src/lib/validation/email.*"]
labels: [frontend, forms]
notes: []
---

## Context

The signup component currently captures email only. Product wants subscribers to pick a
cadence (daily / weekly / monthly) at signup so we can segment sends. This is the first
task scaffolded from the template — it doubles as a reference for how a `ready` task reads.

## Scope

- Add a frequency selector (daily / weekly / monthly) to the existing signup component.
- Validate email format client-side before submit; block submit on invalid.
- Send `{ email, frequency }` to the existing `/api/subscribe` endpoint.
- Does **not** touch the backend endpoint, the email-sending pipeline, or styling beyond
  the new control fitting the current design tokens.

## Acceptance criteria

- [ ] Given the form, when it renders, then a frequency selector with exactly three options is present, defaulting to weekly.
- [ ] Given an invalid email, when the user submits, then submit is blocked and an inline error shows.
- [ ] Given a valid email and a chosen frequency, when the user submits, then `/api/subscribe` receives `{ email, frequency }`.
- [ ] Given a successful response, when it returns, then the form shows a confirmation state and clears.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

None — this is intended to be directly workable. Confirmation copy can match the existing
toast pattern; no new copy decision required.
