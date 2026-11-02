# Review runtime spike: can the PR review run off GitHub runners? (flow-0187)

**TL;DR**: Stay on one runner job (flow-0186) for phase 2. Add a per-review vendor switch behind
its verdict file. Two reasons. First, Claude routines can carry the fleet's peak load: 18 review
runs an hour against a cap of 30 an hour per routine. But Codex has no off-runner path that both
returns a verdict and sets a check, so routines would break Dan's condition that any single review
can be switched between Claude and Codex at any time. Second, a routine cannot set the
`qa`/`code-review`/`security` result at all: from a routine session, both the commit-status and the
check-run endpoints return HTTP 403 (measured).

Measured on 2026-11-01 from a Claude Code cloud session started by a routine. The window is
2026-10-02 to 2026-11-01 (30 days). All times are UTC.

```
PR push ─► option A  routine per review   ─► no check: proxy refuses (403)    Claude only
        ─► option B  one runner job       ─► check run (github-actions)      Claude or Codex  ◄ recommended
        ─► option C  webhook relay        ─► check run (own GitHub App)      Claude or Codex  (phase 3)
```

## 1. Load

**What was counted.** Every `flow-review` workflow run created in the window, read from each
repo's Actions run history
(`GET /repos/CandidDan/<repo>/actions/workflows/flow-review.yml/runs?created=>=2026-10-02`, every
page). All 1,830 runs came from `pull_request` events.

1,000 of them ended `skipped`. Those are pushes to draft PRs: `plan` is gated on
`draft != true` (`_flow-review.yml`), so no review model ran. The load is the other **830** runs:
589 success, 200 failure, 40 cancelled (superseded by a newer push), 1 startup_failure. Every one
of those started at least the qa and code-review model calls.

| Repo | Review runs, 30 days | Busiest day | Runs that day | Busiest hour | Runs that hour | Runs on fleet's busiest day (10-28) | Runs in fleet's busiest hour (10-09 09:00) |
|---|---:|---|---:|---|---:|---:|---:|
| flow | 153 | 2026-10-28 | 32 | 2026-10-28 00:00 | 15 | 32 | 1 |
| Nudge | 103 | 2026-10-28 | 37 | 2026-10-28 13:00 | 5 | 37 | 2 |
| inflight | 70 | 2026-10-09 | 11 | 2026-10-09 09:00 | 5 | 0 | 5 |
| progress | 39 | 2026-10-05 | 8 | 2026-10-02 06:00 | 4 | 0 | 2 |
| write | 164 | 2026-10-29 | 41 | 2026-10-29 11:00 | 6 | 0 | 3 |
| tanplan-platform | 301 | 2026-10-23 | 46 | 2026-10-23 13:00 | 9 | 9 | 5 |
| later *(estimated, see below)* | ≈33 | 2026-10-09 | ≈8 | — | ≤2 | ≈2 | 0 |
| **Fleet** | **≈863** | **2026-10-28** | **78 (+≈2)** | **2026-10-09 09:00** | **18** | | |

- **Peak hour: 18 review runs** (fleet, 2026-10-09 09:00). One repo alone peaked at 15 (flow,
  2026-10-28 00:00).
- **Peak day: 78 review runs** measured, ≈80 with `later`. Mean: 27.7 a day.
- **Model calls are a multiple of runs.** Each run makes 2 model calls (qa, code-review), or 3 when
  security runs. At the peak that is **36–54 model calls an hour** and **156–234 a day**.
- **If drafts were also reviewed**, the peaks would be 33 an hour and 187 a day. That is the
  ceiling if the draft gate is ever removed.
- **Current runtime.** Wall-clock time of a successful run, 100 most recent per repo: median 119 s
  (flow), 209 s (tanplan-platform), 129 s (write); p90 302 s, 241 s, 203 s. Billed minutes are
  higher because jobs run in parallel and each bills at least a minute. Billed minutes were not
  measured: the billing API needs an admin token this session does not have.
- **`later` was not measured from Actions.** This session was refused API access to its run
  history (adding it with credentials was denied). The estimate comes from its git history:
  20 PRs merged in the window, 1 of them on 2026-10-28, 5 on 2026-10-09, none in the 09:00 hour.
  Each was multiplied by the fleet's measured ratio of 830 review runs to 508 merged PRs
  (1.63 runs per merged PR, from `GET /repos/CandidDan/<repo>/pulls?state=closed` on the other
  six repos).

## 2. Claude routines

Source: [Automate work with scheduled tasks](https://code.claude.com/docs/en/routines)
(code.claude.com, read 2026-11-01). "Scheduled tasks" is the new name for routines. The page says
they are "in research preview. Behavior, limits, and the API surface may change".

**Quoted, not fired.** Finding a cap by firing means running past it: at least 31 fires of one
routine in an hour. Each fire is a full cloud session drawn from the plan, and the overflow fires
fail by design. The spike's rules allow quoting where firing is not possible, so these limits are
quoted. The status and check-run probes in the second table were measured.

| Limit (from "Usage and limits") | Value | Counted for | Over the limit |
|---|---:|---|---|
| API fires, **Run now** and one-off re-runs | **30 per hour** | each routine | the fire fails |
| API fires | **100 per hour** | the account | the fire fails |
| **Run now** and one-off re-runs | 100 per hour | the account | the action fails |
| Scheduled runs | 100 per hour | the account | the run waits |
| GitHub-event triggers | "per-task and per-account hourly caps"; **no number published** | routine and account | "Events beyond the limit are dropped until the window resets" |
| Subscription usage | "draw down subscription usage the same way interactive sessions do" | the plan | runs rejected, or metered overage if usage credits are on |

- **Pro and Max get the same hourly caps.** All of them are per routine or per account, not per
  plan. The page lists Pro, Max, Ultra, Team and Enterprise as eligible.
- **There is no daily run allowance any more.** The current page has no per-day run count for any
  plan. The daily ceiling is the subscription's usage window, which the page does not give as a
  number. No routine review has run, so the usage cost of one review is **unmeasured**.
- **Against the load.** With one routine per review fired by API, the peak needs 18 fires an hour
  on each routine (cap 30). On the account it needs 36–54 (cap 100), and that budget is shared with
  `flow-dispatch`'s worker fires. GitHub-event triggers are ruled out for a required gate: their
  caps are unpublished and they drop events past them, so a review would silently never run.
  Firing by API still needs something to call `/fire` on each PR push. That could be a seconds-long
  Actions job, which waits on nothing.

**Can a routine set a status or a check on a PR?** The routine runs as the account's GitHub
identity: "Anything a scheduled task does through your connected GitHub identity … appears as
you". Probed from this session, which is the same environment a routine runs in, against this
spike's own PR head commit:

| Write | Endpoint | Result |
|---|---|---|
| Commit status | `POST /repos/{owner}/{repo}/statuses/{sha}` (canonical) | **HTTP 403**: "Write access to this GitHub API path is not permitted through this proxy." |
| Check run | `POST /repos/{owner}/{repo}/check-runs` (canonical) | **HTTP 403**, same message |

What this means. **A routine as configured today cannot set the `qa`, `code-review` or `security`
result at all.** Its GitHub traffic goes through Anthropic's proxy, and the proxy refuses both
endpoints. The same session can push, open a PR and mark it ready, so this is a per-path allowlist,
not a missing permission. A routine could only post a result by holding its own GitHub token. That
would be a new secret, which this spike may not add. Even then, the token would be a user token, and:

- **Check runs are out.** GitHub's [check-runs API](https://docs.github.com/en/rest/checks/runs) accepts only a GitHub App's token, so a user
  token cannot create one either way.
- **A commit status would carry the worker's identity.** The worker routine pushes as that same
  user. Anything holding that identity, the worker included, could post `qa: success`. Today the
  check comes from the `github-actions` app, which a worker session cannot impersonate.

The other way to get a result onto the PR is a PR comment, which the routine can post. A comment is
not a check, so nothing in branch protection can require it.

## 3. Codex

Sources (all read 2026-11-01; the `developers.openai.com/codex/*` URLs redirect to these):
[Codex pricing](https://learn.chatgpt.com/docs/pricing),
[Codex GitHub Action](https://learn.chatgpt.com/docs/github-action),
[Codex code review](https://learn.chatgpt.com/docs/code-review),
[Codex GitHub integration](https://learn.chatgpt.com/docs/third-party/github).
None of these pages carries a date. None of the numbers below was measured: this session has no
OpenAI credential, and the spike must not add one.

| Option | Runs on a GitHub runner? | Billed as | Limits (quoted) | Posts a check or status? | Gives a pass/fail verdict? |
|---|---|---|---|---|---|
| **Codex code review on GitHub** (Codex connector, automatic reviews or `@codex review`) | **No**, runs on OpenAI's cloud | ChatGPT plan; "Reviews run through GitHub have their own usage category" | **No number published** for reviews. Plus: 5-hour local-message estimates per model, from 5–45 to 350–3,000; "Weekly limits may also apply". Pro: "no five-hour limit" | **No**. It posts "a standard GitHub code review" and reacts 👀. No check run or commit status is documented | **No**. It flags "only P0 and P1 issues". Merge is left to a human |
| **`openai/codex-action`** | **Yes**: "Run the job on a Linux or macOS runner" | API tokens: "Codex usage with an API key is billed at standard API rates"; needs an `OPENAI_API_KEY` secret | API rate limits for the key's tier | Not by itself. It exposes `final-message`, and a later step posts it | Yes, if the prompt asks for one; the workflow parses it |
| **Codex cloud task fired by API** | — | — | — | — | **Not documented.** The pages read describe starting cloud tasks only from a PR comment or the UI |

- **One off-runner Codex path exists, and it cannot be a Flow review.** Codex's GitHub review runs
  without a runner and bills to the plan. But it returns no pass/fail and sets no check. It is also
  steered only by account-level review instructions and an `AGENTS.md` `## Code Review Rules`
  section. That makes one review per PR, not three separate reviews each with its own prompt.
- **The Codex path that does produce a verdict is a runner job** (`codex-action`). That is
  option B.

## 4. Switching cost

flow-0186's verdict contract: each review's model step writes
`$RUNNER_TEMP/flow-review/<check>.json` with `{ check, verdict: pass|fail, summary }`. Everything
after the model step reads only that file. So a vendor switch only has to replace the step that
writes the file.

| Moving one review (qa, code-review or security) Claude → Codex | A: routines | B: one runner job (flow-0186) | C: webhook relay (phase 3) |
|---|---|---|---|
| What changes | The review leaves the routine. It needs a runner job again (`codex-action`), or Codex's GitHub review, which has no verdict and no check. Note that the Claude side has no check either until the proxy allows one | That review's model step: `anthropics/claude-code-action` → `openai/codex-action`, same prompt, writing the same verdict file | The relay's call for that check: Anthropic API → OpenAI API, writing the same verdict |
| Where the switch lives | Two systems: a routine in claude.ai plus a workflow | One per-review key in `.flow/config.yml` `review:` | Relay config |
| New credential in the repo | `OPENAI_API_KEY` (runner path) | `OPENAI_API_KEY` | None in the repo; held by the relay |
| Check-name continuity (`qa`, `code-review`, `security`) | None on the routine side: it cannot post the check (403) | Kept: same job, same check names | Kept: the relay owns the checks |
| Moving it back | Rebuild the routine and its trigger | Flip the key | Flip the config |

The same table read Codex → Claude has the same cells. Only option B is symmetric with nothing
outside the repo. Option C is symmetric too, but it is a service someone has to run.

## 5. Recommendation

**Stay on one runner job (flow-0186).** Moving a single review between Claude and Codex then
means changing that review's vendor key in `.flow/config.yml` `review:`. The job runs
`claude-code-action` or `codex-action` for that review, and the action writes the same
`$RUNNER_TEMP/flow-review/<check>.json`. Everything after it, including the `qa` /
`code-review` / `security` check, is unchanged. The runner still waits on a model, for about 2–3.5
minutes wall-clock per run at today's 27.7 runs a day. That is the price of keeping the vendor
switch a one-line change.

**What would change it:** Codex documenting a headless, API-fired task that can write a commit
status or check run, *and* Anthropic letting a routine post a check run as an app (today the
proxy refuses both statuses and check runs) and publishing GitHub-trigger caps. With both, reviews as routines become symmetric
across vendors and worth the move. Without them, the next step is the webhook relay (phase 3), not
routines.
