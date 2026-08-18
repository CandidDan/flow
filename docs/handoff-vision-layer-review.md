# Review — the vision-layer handoff, validated against canonical

**Reviewing:** `flowvisionhandoff.zip` — `HANDOFF.md`, addenda 1 (visibility) and 2 (mission
control), ten templates, and `flow-mission-control-mock.html`.
**Against:** `CandidDan/flow` @ `97de2e6` (VERSION 1.1.0).
**Purpose:** separate what is buildable as written from what needs a decision first, and
correct the places where the handoff describes a canonical that does not exist.

The design is sound and the reasoning holds up — the code-plane placement argument, the
teeth budget (mechanical fails, judgment advises), warn-on-absent, the adoption grace, and
routing compass findings through the existing inbox are all right, and the supplied
`_TEMPLATE.md` is byte-identical to the repo's file plus the `serves` block. What follows is
the delta between the handoff's picture of canonical and canonical.

Severity: **BLOCK** = decide before writing tasks · **FIX** = correct during implementation ·
**NOTE** = record it.

---

## 1. The handoff describes a migration canonical has not decided

### 1.1 BLOCK — "board.html and flightdeck HTML are being migrated to GitHub Projects"

Addendum 1 opens on this premise. It is not what `docs/adr/0002` decided. ADR-0002 chose the
Projects projection **alongside** moving flightdeck aggregation and rendering into tested code
(`flightdeck-state.mjs`, `render-flightdeck.mjs`), and demoted the rendered artifact to "the
**offline** view rather than the primary one" (ADR-0002, consequences) — it did not retire it.
`board.html` is not mentioned by that ADR at all and is fully live today: `board-builder`
regenerates it, `apply-board-edits.mjs` round-trips human drags, `flow-doctor` checks the
snapshot for drift, `INIT.md:145` configures it, and `.gitattributes` marks it generated.

There is one migration-shaped task in the store — `flow-0003`, still `ready` — and it covers
the per-repo Project projection only. There is no org-level work and no board.html retirement
to coordinate with.

**Needed:** either amend ADR-0002 to record the migration the addenda assume, or rewrite the
addenda's premise. Everything in §1.2–1.4 follows from this one.

### 1.2 BLOCK — D12 contradicts two `ready` tasks

Addendum 2's D12 says the mission-control page "**replaces** the flightdeck HTML, it does not
sit beside a second cross-repo view." `flow-0001` (data layer) and `flow-0002` (renderer +
provenance UI) are both `ready` and build exactly the artifact D12 retires. D12 also says
"`flightdeck/index.html`, rebuilt" — no such file exists; today's artifact is `flightdeck.html`,
written by an agent skill.

Note the two are not interchangeable: `flow-0001` aggregates by shelling out to each project's
local `flow-state.mjs` over local clones, which a browser page cannot do. D12 is a genuinely
different data path, not a re-skin.

**Recommended:** keep `flow-0001`'s thesis (aggregation belongs in tested code, not a prompt)
and rescope it to D12's fetch/derivation layer; supersede `flow-0002`'s HTML renderer; record
both in an ADR-0002 amendment rather than by silent supersession. See §5.2 for why this also
solves D13's "shared module or mirrored spec" problem.

### 1.3 BLOCK — D11 reopens two decisions `flow-0003` already closed

D11 ("the projection sync") restates `flow-0003` under different filenames — D11's item sync is
`project-sync.mjs` + `_flow-project-sync.yml`, already specified with acceptance criteria. Two
of its details contradict that task:

| | `flow-0003` (recorded) | Addendum 1 D11 |
|---|---|---|
| Auth | A **separate** `FLOW_PROJECT_PAT` with `project: read/write` and nothing else. "`FLOW_PAT` is **not** widened — the whole point of a second token is that the blast radius of the board is the board." | "`FLOW_PAT` needs Projects read/write scope… add this to the human-only settings list next to the existing FLOW_PAT warning" |
| UI edits | Full reconciliation, overwritten by design; acceptance criterion: no code path that writes `.flow/tasks/` | "ignored on next sync **or** explicitly round-tripped through a defined path" |

The first would implement the option `flow-0003` explicitly rejected. The second reopens a
closed question by offering an alternative.

**Recommended:** D11 and D8 become *amendments to `flow-0003`* — add the `Serves` field, the
goal-as-item rows, and the `[vision]`-merge field-option sync to its scope — not new
deliverables. Keep `FLOW_PROJECT_PAT`.

### 1.4 NOTE — read addendum 1 as D8/D10/D11 only

Addendum 2 supersedes D9. Since D8's "per-repo Project" *is* `flow-0003`'s board, what survives
addendum 1 as new work is: the `Serves` field, goal items, the four saved views, D10's per-goal
reading, and D11's vision-merge option sync.

---

## 2. Mechanically blocking: doctor failures are store-wide, not PR-scoped

### 2.1 BLOCK — one unanchored `ready` task turns every open PR red

`_flow-gates.yml` runs `node .flow/bin/flow-doctor.mjs` in the `flow-tooling` job on **every**
PR, against the **whole store**, and the CLI exits 1 if `problems.length`. The handoff describes
`serves` as gating a ready task. Mechanically it gates the repo: a single `ready` task without
`serves` fails every open PR, including unrelated ones and the `flow-sync` adoption PR itself.

That is defensible for a store-integrity check — it is how the existing rules behave — but it has
to be sized deliberately, because it changes the retrofit sequence:

**`RETROFIT-VISION.md` has the order backwards.** Step 1 merges `VISION.md` and says "human
approves and merges before anything else proceeds"; step 2 then backfills `serves` on `ready`
tasks. Between those two steps every PR in the repo is red. Invert them: backfill `serves` on
`main` **first** (harmless — rule 1 short-circuits the whole check while `VISION.md` is absent,
so unvalidatable ids sit there quietly), then merge the vision PR. Add the invariant to the
runbook explicitly, because the natural reading is the broken one.

### 2.2 BLOCK — canonical's own vision is an unlisted deliverable

`.flow/bin/flow-doctor.mjs` is a thin adapter that imports `runDoctor` from
`project-template/.flow/bin/flow-doctor.mjs` and points it at canonical's own store. So D3 lands
on canonical automatically the moment it merges — no separate work, which is good.

The consequence is not addressed anywhere in the handoff: canonical has **eight `ready` tasks
with no `serves`**. The day canonical gets a root `VISION.md`, its own gate goes red on every PR
until all eight are backfilled. And canonical will want one — `flow-0009` exists precisely to
stop canonical skipping its own protocol.

**Needed:** decide whether canonical gets a `VISION.md` in this batch (recommended: yes — this
layer's credibility rests on canonical running it), and if so add it as a deliverable with the
§2.1 ordering baked in. D1 currently names only `project-template`.

### 2.3 FIX — the template's `VISION.md` placement has a mechanical answer

D1 leaves this "TBD by you". The constraint: the template's doctor resolves its store from its
own realpath to `project-template/.flow`, so its repo root is `project-template/`. Shipping the
placeholder at `project-template/VISION.md` therefore activates the check over the template's
fixture store — where `0001-newsletter-signup.md` is `ready` with no `serves`, which fails.

Cheapest fix that keeps the template honest: ship `project-template/VISION.md` **and** add
`serves: ["G1"]` to the sample task, so the fixture demonstrates the field by example. The
alternative (ship it as `VISION.template.md`) avoids the failure but means new repos get a file
whose name they must know to rename — and `flow-init` (`flow-0005`, `ready`) is where that copy
would belong anyway.

---

## 3. Errors and omissions in the supplied templates

### 3.1 FIX — `templates/workflows/flow-compass.yml` will not run as written

Four concrete mismatches with canonical's conventions:

1. `uses: CandidDan/flow/.github/workflows/flow-compass-reusable.yml@v1` — all nine reusables
   are `_flow-*.yml`. It is `_flow-compass.yml`.
2. `permissions:` sits at workflow level. Every existing caller declares them at **job** level,
   and `.flow/config.yml`'s security focus names "a repo-wide default" as the thing to avoid.
3. **Missing `id-token: write`.** Every AI-session reusable needs OIDC for `claude-code-action`,
   and per `flow-triage.yml`'s own comment, "a reusable workflow can't raise it above the
   caller's grant." Compass as specified would fail at the action.
4. "ship commented-out or behind the same enablement mechanism" — the actual convention is
   neither. The file ships **enabled**, with the job inside the reusable gated on
   `if: ${{ vars.FLOW_AI == 'true' }}`, plus a `workflow_call` secrets block declaring
   `CLAUDE_CODE_OAUTH_TOKEN` as optional.

`contents: read` + `issues: write` is right, and keeping the permission block as the mechanical
proof of the read-only boundary is the correct instinct — it just needs the OIDC grant beside it.

### 3.2 FIX — the goal-id regex is fragile in a way rule 7 does not catch

`^### (G\d+) — ` requires an **em dash**. Rule 7 fires only when *zero* goals parse, so a vision
with three em-dashed goals and one hyphenated one loses that goal silently: tasks serving it fail
with `no such id in VISION.md` and nothing points at the real cause. Accept `[—–-]`, and add a
WARN for any `^### G\d+` line that does not match the strict form.

### 3.3 FIX — `HANDOFF.md` §3.3 and the doctor spec disagree

| | §3.3 table | `flow-doctor-vision-serves.md` |
|---|---|---|
| Graced statuses | `in_progress`/`in_review`/`done` | adds `blocked` |
| Unknown / non-goal id on a non-`ready` task | FAIL (unconditional) | **downgraded to WARN** (rule 6) |
| Empty vision (rule 7) | absent | repo-level FAIL |

The spec file is the better of the two. State which wins so the implementer is not choosing.

### 3.4 FIX — implementation details the spec assumes

- `runDoctor({ flowDir, … })` takes no repo root. Derive it (`resolve(flowDir, '..')`) or add a
  parameter — the adapter path in §2.2 depends on getting this right for both call sites.
- `parseTask`'s `get()` truncates each value at the first `#`, and only reads the first line of a
  key. The `_TEMPLATE.md` comment block is safe (continuation lines are not matched), but
  `serves` needs its own list parser mirroring `parseTouchesList`.

### 3.5 FIX — nothing creates the labels

There is no `gh label create` anywhere in the repo, and neither `INIT.md` nor `RETROFIT.md` has a
label step. `compass` (D4) and `automation-down` (D13) must exist before an issue can be filed
with them. This is a pre-existing gap — `proposed`/`approved`/`auto-ok` share it — but the two new
paths are unattended automation, so first run is where it surfaces.

### 3.6 NOTE — `[vision]` PR titles are safe today, and should stay that way on purpose

`parse-task-id` matches `[A-Za-z][A-Za-z0-9]*-\d{1,4}`, so `[vision] Initial vision` yields no id
and `touches-guard` skips — a vision PR passes the gate. `flow-0008` (`ready`) hardens the guard
against silent skips but explicitly preserves "a legitimate skip stays a pass", so there is no
conflict. Worth one line in ADR-0004 so nobody later closes that path and breaks vision PRs.

---

## 4. The propagation gap: the enforcing half ships downstream, the enabling half does not

**BLOCK.** D7 says "`flow-sync` delivers it downstream." `_flow-sync.yml` copies exactly two
things:

```
rsync -a --delete "$CANON_TPL/.flow/bin/" .flow/bin/
for f in "$CANON_TPL"/.github/workflows/flow-*.yml; do cp "$f" .github/workflows/; done
```

It does **not** copy `.flow/tasks/_TEMPLATE.md`, `.claude/skills/**`, or `CLAUDE.md`. So what
reaches an existing consuming repo automatically is the doctor check and the compass thin
caller — the rules — while the template field, the `vision-writer` and `flow-compass` skills, and
the CLAUDE.md block do not. Nothing breaks (warn-only without a `VISION.md`), but the layer
cannot activate downstream without manual copying.

`RETROFIT-VISION.md` §2.1 is factually wrong as a result: "Confirm the template/tooling carry the
vision layer (`_TEMPLATE.md` has `serves`…) — `flow-sync` if not." `flow-sync` cannot do that.

**Decide:** extend the sync's copy set, or make the manual copies explicit steps in
RETROFIT-VISION. Extending it is not free — `.claude/skills/**` is a surface repos customise, and
`rsync --delete`-style adoption would clobber local edits. A middle path: sync `_TEMPLATE.md`
(canonical shape, rarely customised) and leave skills to an explicit runbook step naming the
files.

---

## 5. Addendum 2 — things to settle before D12/D13 are written

### 5.1 BLOCK — topic discovery as specified matches most of GitHub

`topic:flow` is not a private namespace; a bare topic query returns every public repo carrying it.
The query must be owner-scoped (`user:CandidDan topic:flow`, or `org:…`).

There is a second-order problem with R4 ("near-zero ceremony to enrol"): a fine-grained PAT only
sees repos it was granted, so the **PAT's grant list is the real registry**. Unless the token is
an all-repos one, enrolling a repo is "add the topic **and** re-scope the PAT" — which is not
near-zero, and is exactly the kind of thing that silently omits a project from the pane that
exists to stop projects being forgotten. Either accept an all-repos read-only token (and say so
plainly, with the blast radius written down) or state the two-step enrolment honestly.

### 5.2 FIX — put the logic where the gate can see it

`flightdeck/` is a declared `source_root` in `.flow/config.yml`, checked by `npm run lint` —
which is `check-syntax.mjs` over tracked `.mjs`. A ~600-line page with its fetch, parse, and
liveness logic inline is neither linted nor unit-tested, in the repo whose own `flow-0001`
argues that untestable aggregation is why the flightdeck is not trusted. D12's acceptance
criterion "the page makes no write API calls (verifiable from its source)" would be verified by
eyeball, and D13's "a small shared module **or mirrored spec**" offers a mirrored spec as an
option — a guaranteed drift source in the one component whose job is detecting drift.

**Recommended:** liveness rules, frontmatter parsing, and row derivation live in
`flightdeck/bin/*.mjs` with tests; `index.html` is a thin shell that imports them. D12 and D13
then share code by construction, `flow-0001` is rescoped rather than cancelled (§1.2), and "no
write calls" becomes a test instead of an inspection.

### 5.3 NOTE — three smaller ones

- **PAT storage.** "Remember on this device" means a PAT in `localStorage` on a `file://` page.
  Default-memory-only is the right call; put the trade-off in the ADR rather than only in the UI.
- **Rate ceiling.** Task frontmatter is one blob request per file: 15 repos × ~30 tasks reaches
  the "few hundred" ceiling before Actions, PR, and issue calls. Batch via GraphQL from the
  start, and cache responses for the session rather than "where it materially helps".
- **Watchdog latency.** "Older than ~2× the schedule interval" against a weekly compass means a
  dead compass is only red after a fortnight. Correct by the rule, worth stating so it is not
  read as a bug later.

---

## 6. Collision map — D1–D13 against the eight `ready` tasks

`HANDOFF.md` §4 asks for parallel-safety to be proved by intersecting `touches` rather than
asserted. Done, against the current store. `flow-doctor` warns on any overlapping live pair, so
these cannot be called parallel-safe:

| Deliverable | Collides with | Shared surface |
|---|---|---|
| **D3** doctor check | **flow-0010** (`ready`) | `project-template/.flow/bin/flow-doctor.mjs` + `.test.mjs` — the same two files, exactly |
| **D5** adoption docs | **flow-0006** (`ready`) | `project-template/CLAUDE.md`, `INIT.md`, `RETROFIT.md` |
| **D5** INIT vision step | **flow-0005** (`ready`) | `project-template/INIT.md` |
| **D8 / D11** | **flow-0003** (`ready`) | the entire projection surface (see §1.3) |
| **D12 / D13** | **flow-0001**, **flow-0002** (`ready`) | `flightdeck/` (see §1.2) |
| D1 vision artifact + skill | — | clean (new paths) |
| D2 `serves` in `_TEMPLATE.md` | — | clean |
| D4 flow-compass | — | clean (new paths) |
| D6 ADR-0004 | — | clean — `0004` is free (`docs/adr/` holds 0001–0003) |
| D7 versioning | — | clean |

Five of seven core deliverables collide with in-flight work. D3 ↔ flow-0010 is the sharpest:
same two files, and flow-0010 is also a doctor-hardening task, so the sensible move is to
sequence D3 after it (or fold the vision check into flow-0010's scope and re-approve).

---

## 7. The three open decisions (§6), with recommendations

1. **Compass cadence / first-run target.** Weekly fits canonical's PR volume. First run should
   file issues like every other run — a first-run-to-dashboard path is a second surface, and the
   retrofit's first audit is `workflow_dispatch` anyway, not the schedule.
2. **Goal id format.** `G1`/`NG1` is fine. Fix §3.2's em-dash fragility before it is load-bearing;
   that, not the letter choice, is what will bite.
3. **`touches-guard` × `serves` cross-check.** Agree: no. Worth recording *why* in the ADR —
   `maintenance` has no declared file surface, so the check could only ever be a heuristic, and
   heuristics do not belong in the mechanical tier by this layer's own teeth budget.

---

## 8. What needs Dan, in one list

> **Resolved 2026-08-18 — items 1, 2 and 3.** ADR-0002 Amendment 1 records the decision: the
> primary view is the computed mission-control page, `flow-0003` is deferred until a
> non-operator needs a board (auth decision preserved), `flow-0001` is rescoped to the page's
> tested module and `flow-0002` is superseded. There is no Projects migration, so D8/D10/D11
> are not built and the `FLOW_PAT` question dissolves with them. Items 4–8 stand.

1. Is the Projects/flightdeck migration in addendum 1's premise a real decision? If yes it needs
   an ADR-0002 amendment; if no, the addenda's framing changes. (§1.1)
2. `flow-0001` and `flow-0002`: cancel, rescope, or keep alongside D12? (§1.2, §5.2)
3. `FLOW_PAT` widened vs `FLOW_PROJECT_PAT` — `flow-0003` says the latter. (§1.3)
4. Does canonical get its own `VISION.md` in this batch? (§2.2)
5. Extend `flow-sync`'s copy set, or document manual adoption steps? (§4)
6. Mission-control PAT: all-repos read-only token, or honest two-step enrolment? (§5.1)
7. Sequencing for the five colliding deliverables, D3 ↔ flow-0010 first. (§6)
8. The three §6 open decisions. (§7)

Items 1–4 gate task-writing. 5–8 can be answered while D1/D2/D4/D6 are being built, since those
four are collision-free.

---

## 9. Build triage

### 9.1 Buildable now — no open decision, no `touches` collision

| | Deliverable | Carry these corrections in |
|---|---|---|
| **D1** | `VISION.md` template + `vision-writer` skill | Ship at `project-template/VISION.md` and add `serves: ["G1"]` to `0001-newsletter-signup.md`, or the template's own doctor fails (§2.3) |
| **D2** | `serves` on `_TEMPLATE.md` + task-writer additions | None — the supplied template is this repo's file plus the field, verified clean |
| **D4** | `flow-compass` skill + `_flow-compass.yml` + thin caller | The four workflow corrections (§3.1); create the `compass` label as part of the deliverable (§3.5) |
| **D6** | ADR-0004 | Core-layer sections only. Its addenda consequences (visibility surfaces, watchdog residual risk) depend on decisions 1–2 in §8 — leave them for an amendment rather than writing them speculatively |

These four are the whole core layer minus the check itself. They are also the half that
`flow-sync` does **not** propagate (§4), so shipping them changes nothing downstream until
that is settled — which is fine: they are the enabling half, and nothing enforces against
them yet.

### 9.2 Buildable after one small decision each

| | Deliverable | The one thing in the way |
|---|---|---|
| **D3** | doctor `vision-serves` check | Same two files as `flow-0010` (`ready`). Fold the check into that task's scope and re-approve, or sequence after it. Also: resolve §3.3-vs-spec (§3.3) and fix the em-dash regex (§3.2) |
| **D5** | adoption docs | Overlaps `flow-0006` (CLAUDE.md, INIT, RETROFIT) and `flow-0005` (INIT). Sequence after both, or split `RETROFIT-VISION.md` — a new file, collision-free — out as its own task and hold the edits to existing docs |
| **D7** | versioning | Process, not files. Blocked only by D3 existing; note the canary can't prove this check until a repo has a `VISION.md` |

### 9.3 Not buildable as written

| | Deliverable | Why |
|---|---|---|
| **D8, D11** | Project fields, goal items, projection sync | **Not built** (ADR-0002 Amendment 1 — the vision drawer carries their purpose). Were they revived they would still not be separate work — they are amendments to `flow-0003`, and as written they reverse its `FLOW_PROJECT_PAT` and no-round-trip decisions (§1.3) |
| **D10** | compass per-goal `Reading` | Retargeted by Amendment 1: the reading now lands in the page's vision drawer and the workflow job summary, not a Project field. The reading itself is well-specified and still wanted |
| **D9** | org-level Project | Superseded by D12 in addendum 2. Dead unless D12 is dropped |
| **D12, D13** | mission control + watchdog | **Now the chosen path** (Amendment 1), so §1.2 is settled — but three build blockers remain: topic query matches most of GitHub (§5.1); the enrolment story doesn't survive fine-grained PAT scoping; and as specified the logic sits untested inside an HTML file in a declared source root (§5.2) |

### 9.4 Needs a thinking pass, not a task

These are design questions the handoff either assumes settled or doesn't raise. None is
answerable by an implementer.

1. **The migration premise.** Is the Projects/flightdeck migration real? It is the root of
   §1.1–1.4 and needs an ADR-0002 amendment either way. Until it exists, addendum 1 and 2
   are describing infrastructure that isn't decided.
2. **Is store-wide failure the right teeth?** `vision-serves` as specified reddens every open
   PR over one unanchored `ready` task — including PRs whose authors can't fix it, since the
   store is main-only. The alternatives (fail only for the PR's own task; fail only for tasks
   created after the vision landed; warn in the gate and fail in the sweep) each trade
   enforcement against blast radius, and the handoff's teeth-budget principle doesn't settle
   it because the field *is* mechanical — the question is scope, not judgment.
3. **What `flow-sync` should propagate at all.** Extending it to `_TEMPLATE.md` and
   `.claude/skills/**` is bigger than this layer: skills are a surface repos customise, and
   the current copy set looks like a deliberate line (things repos shouldn't edit) rather than
   an oversight. Worth deciding as a versioning-policy question.
4. **Canonical's own vision.** Not a task — an interview. Running `vision-writer` on canonical
   is the honest first test of D1, and it produces the artifact §2.2 needs.
5. **The mission-control architecture.** Whether liveness and derivation live in tested `.mjs`
   with a thin HTML shell (recommended, §5.2) decides whether D12/D13 share code or a spec,
   and whether `flow-0001` is rescoped or cancelled.
6. **The enrolment/PAT model.** All-repos read-only token vs per-repo grants changes what R4
   ("near-zero ceremony") can honestly promise.

### 9.5 Suggested order

1. Answer §8 items 1–4 (the migration premise, `flow-0001`/`0002`, the PAT, canonical's vision).
2. Build **D2 → D1 → D6-core** — the field, the artifact and its skill, the record.
3. Fold **D3** into `flow-0010` and build it; canonical's own `VISION.md` lands in the same
   window, backfill before merge (§2.1).
4. Build **D4** once the cadence is confirmed; the layer is now closed-loop on canonical.
5. Settle §9.4 items 3 and 5, then take the addenda: **D11/D8 as a `flow-0003` amendment**,
   then **D10**, then **D13 → D12**.
6. **D7** last: advance `v1` only after the check has run clean on a real repo with a vision,
   which by then is canonical itself.

---

## 10. Decisions taken, 2026-08-18

Recorded here so the next session inherits them rather than re-deriving them. Items 1–3 of §8
were settled by ADR-0002 Amendment 1; these settle the rest.

### 10.1 Audience — solo-first, option preserved

Flow is for one operator running several projects. The repo stays public, Apache-licensed and
vendor-neutral, and nothing in the design forecloses a second person — but no feature is built
*for* an employee or client until one exists. Written into `VISION.md` as the purpose paragraph's
explicit decision and as **NG4**, because an audience assumption nobody made is pre-loaded drift.

This is the same premise Amendment 1 leans on to defer `flow-0003`; the two now agree in writing.

### 10.2 Canonical has a vision — `VISION.md` at root

Five goals (two touchpoints hold · a green gate worth believing · direction survives the work ·
canonical and the fleet run the same protocol · always knowing where the work is and whether the
machinery is alive) and five non-goals taken from decisions already recorded across the README and
ADR-0001..0003. G3 and G5 are aspirational by design — the vision layer and the mission-control
view do not exist yet, and an anchor written only from what exists is the as-built failure mode
`RETROFIT-VISION.md` §1 warns about.

**Ordering consequence, corrected from §2.1.** The gate fires only when *both* the rule and the
anchor exist, so the constraint is narrower than first stated: `serves` must be backfilled on the
eight `ready` tasks **before the doctor check merges**, not before `VISION.md` merges.

**And a mechanical constraint on that backfill:** it cannot ride a PR. `_flow-gates.yml`'s
store-guard fails any PR touching `.flow/tasks/`, so the backfill is a direct commit to `main`,
the same path triage and claim transitions already use.

### 10.3 The doctor check folds into `flow-0010`

Rather than a separate D3 task colliding on the same two files. The fit is exact: `flow-0010`
already extends the template's doctor, already applies checks only to `ready` tasks (the same
adoption grace `vision-serves` needs), already records that canonical's adapter inherits the
change for free, and already carries the rollout note about softening a PROBLEM to a WARNING if
adopting repos fail widely on first sync.

Boundaries preserved: the fold adds **only** the check. `_TEMPLATE.md` and the `task-writer` skill
stay out of scope — `flow-0010` explicitly excludes them, and they are D2's, which remains its own
task.

A property worth noticing: `flow-0010`'s existing final criterion — *every existing `ready` task
in canonical's store passes the new checks* — mechanically enforces §10.2's ordering. If the
backfill hasn't happened, the task cannot pass its own acceptance criteria. The constraint doesn't
need documenting into a runbook; it is already a test.

### 10.4 D5 splits

`RETROFIT-VISION.md` is a new file and ships now, collision-free. The edits to
`project-template/CLAUDE.md`, `INIT.md` and `RETROFIT.md` wait behind `flow-0006`, which claims all
three.

### 10.5 The handoff's three open decisions (§6 of `HANDOFF.md`)

1. **Compass cadence:** weekly, findings filed as issues like every other run. No first-run
   special case — the retrofit's first audit is `workflow_dispatch`, not the schedule.
2. **Goal id format:** `G1`/`NG1` confirmed. The fragility is the separator, not the letter — the
   extraction regex accepts `[—–-]` and WARNs on a `### G<n>` line that doesn't match the strict
   form, so one mistyped heading can't silently vanish while rule 7 stays quiet.
3. **`touches-guard` × `serves` cross-check:** no. `maintenance` has no declared file surface, so
   the check could only be a heuristic, and heuristics don't belong in the tier that hard-fails.
   Recorded in ADR-0004 as future work.

### 10.6 flow-sync copies `_TEMPLATE.md`; skills get drift *detection*, not copying

The task template joins the synced surface — canonical shape, rarely customised, and it is what
the new rule validates against. `.claude/skills/**` stays out, because it is a surface repos
customise and a copy-on-sync would clobber local edits with only PR review to catch it.

**But skills currently don't propagate at all, and there are two copies that disagree.** The
committed `.claude/` is merged into a repo once at onboarding (`RETROFIT.md`:24) and never updated:
`flow-sync` copies `.flow/bin/` and `flow-*.yml`, `.flow/VERSION` stamps only that surface, and
`flow-doctor` doesn't look at skills. Meanwhile `.claude/settings.json` points at the Flow plugin
marketplace, which *does* update — but it serves **Cowork**, which doesn't auto-discover a repo's
local `.claude/`. So a plugin update reaches planning sessions and never reaches the committed
copy, and the committed copy is the one automation runs: `_flow-triage.yml`:56 instructs the action
to follow **the consuming repo's** `.claude/skills/task-writer/SKILL.md`.

The fix keeps the copy manual and makes the fork visible. Canonical ships a skills manifest inside
`.flow/bin/` (which does sync); `flow-doctor` compares the repo's committed skills against it and
**WARNs**, naming the file and the fix. Detect and propose, never silently self-update — the
posture `docs/flow-versioning-policy.md` already states for infra.

**Store git blob SHAs in the manifest, not content hashes.** Git's SHA-1 is what the GitHub trees
API already returns for every blob in a listing, so the mission-control page can compare with zero
extra fetches, and `flow-doctor` can compute the same value locally with `git hash-object`. One
manifest, two surfaces, no second hashing scheme.

This serves **G4** directly, and it is live today independent of the vision layer.

### 10.7 Mission control shows infra drift — against the pinned channel, not against latest

A scope addition to D12. The page already fetches each repo's `.flow/` tree, so `.flow/VERSION`
costs one blob and canonical's current version is a single fetch shared across every repo.

**The comparison that matters is "behind the channel you pinned."** `docs/flow-versioning-policy.md`
defines three pin types — `@v1` for the fleet, `@v1-edge` for the canary, an exact `@v1.3.0` for a
repo deliberately frozen. A `@v1` repo behind `v1-edge` is correct, not drifted; a frozen repo is
not drifted at all. So the cell renders the pinned ref, the local stamp, and what that ref
currently resolves to, and flags only a genuine lag — otherwise the pane cries wolf at every repo
that is behaving exactly as designed.

The page reads the pinned ref from the caller workflows' `uses: …@ref` lines in the same tree
fetch, which also catches a drift the version stamp cannot: callers pinning *different* refs
within one repo, or a repo that never adopted a MAJOR caller-level change.

Why the page rather than the existing check: `flow-doctor`'s version-drift warning is opt-in (it
only fires when `FLOW_CANONICAL_VERSION` is set) and is only visible in the output of a run that
happened. D12's whole premise is not depending on a workflow having remembered to run.

**No fix button.** Detection only, linking to the repo's `flow-sync` workflow. Acting on the pane
would be a write scope, which Amendment 1's first tripwire forbids.

### 10.8 Mission-control auth — one all-repos read-only fine-grained PAT

Contents, Actions, Issues, Pull requests; read-only across all owned repos. This is what makes
topic discovery work as advertised — add the topic, appear on next load — because a per-repo grant
list would become the real registry, and a forgotten re-scope would silently omit a project from
the pane whose purpose is stopping projects being forgotten. The cost, recorded rather than
glossed: the token can read every repo the owner has, not only the `flow`-topic ones. Its worst
failure remains a blank pane, never a corrupted store, because it holds no write scope.
