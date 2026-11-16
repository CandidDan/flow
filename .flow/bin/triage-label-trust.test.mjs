// triage-label-trust.test.mjs — the triage sweep acts on lane labels only once their actor is
// verified (flow-0201, ADR-0010 §2).
//
// `intake-trust.test.mjs` proves the rules. This file proves the WIRING in `_flow-triage.yml`:
// that the verifier runs in its own step between the inbox filter and the agent, that issue data
// reaches it only through `env:` and files, that the agent is told to use the verified lanes, and —
// by running the shipped `run:` block against a fake `gh` — that an unhonoured label really prints
// the `label-not-honoured` line and really reaches the agent as `false`.
//
// Canonical-only by location (`.flow/bin/`), like the other tests of the reusable workflows.

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const REPO = resolve(import.meta.dirname, "..", "..");
const TRIAGE = join(REPO, ".github", "workflows", "_flow-triage.yml");
const TEMPLATE_BIN = join(REPO, "project-template", ".flow", "bin");
const source = readFileSync(TRIAGE, "utf8");

const steps = () => yamlMod.parse(source).jobs?.triage?.steps ?? [];
const isAgent = (s) => String(s?.uses ?? "").startsWith("anthropics/claude-code-action");

function lanesStep(all = steps()) {
  const step = all.find((s) => s?.id === "lanes");
  assert.ok(step, "_flow-triage.yml must have a step with id `lanes` that verifies lane-label actors");
  return step;
}

test("the lanes step runs intake-trust.mjs from $FLOW_BIN, after the inbox step and before the agent", { skip }, () => {
  const all = steps();
  const at = (pred) => all.findIndex(pred);
  const inbox = at((s) => s?.id === "inbox");
  const content = at((s) => s?.id === "content");
  const lanes = at((s) => s?.id === "lanes");
  const agent = at(isAgent);
  for (const [name, i] of Object.entries({ inbox, content, lanes, agent })) {
    assert.notEqual(i, -1, `sanity: the ${name} step must exist`);
  }
  assert.ok(inbox < lanes, "the verifier must run after the inbox filter, which decides the issue set");
  assert.ok(content < lanes,
    "…and after the content step, which writes the issue-<n>.json files the verifier reads labels from");
  assert.ok(lanes < agent, "the verifier must run BEFORE the agent — after it, the agent has already acted");

  const step = all[lanes];
  assert.match(String(step.run), /node "\$FLOW_BIN"\/intake-trust\.mjs/,
    "canonical's own copy, materialised at this workflow's commit — never the caller's .flow/bin/");
  assert.equal(step.if, all[agent].if,
    "the verifier must run whenever the agent does; a skipped verifier would leave the lanes file absent");
  assert.match(String(step.run), /issues\/\$n\/events/, "the lanes come from the issue's event history");
  assert.match(String(step.run), /--paginate --slurp/, "every page of events, not only the first");
});

test("issue data reaches the lanes step only through env: and files", { skip }, () => {
  const step = lanesStep();
  const run = String(step.run);
  assert.ok(!run.includes("${{"),
    "no expression may be interpolated into the lanes step's script — numbers come through env:");
  assert.equal(step.env?.FLOW_TRIAGE_NUMBERS, "${{ steps.inbox.outputs.numbers }}",
    "the admitted issue numbers arrive as an environment variable");
  assert.match(run, /\*\[!0-9\]\*/, "each number is re-checked as digits before it builds a URL");

  // And nowhere in the workflow: no `github.event.issue.*` inside any run: block.
  for (const s of steps()) {
    assert.ok(!/\$\{\{\s*github\.event\.issue\./.test(String(s?.run ?? "")),
      `step ${s?.id ?? s?.name}: \${{ github.event.issue.* }} must never be interpolated into a run: block`);
  }
  assert.ok(!/\$\{\{\s*github\.event\.issue\./.test(source.replace(/^\s*#.*$/gm, "")),
    "the workflow does not read github.event.issue.* in an expression at all");
});

test("the agent prompt uses the verified lanes, not the raw labels", { skip }, () => {
  const prompt = String(steps().find(isAgent)?.with?.prompt ?? "");
  const flat = prompt.replace(/\s+/g, " ");
  assert.ok(flat.includes("flow-triage-lanes.json"), "the prompt must name the verified-lanes file");
  assert.ok(flat.includes("Use the verified lanes, not the raw labels"),
    "the prompt must say the verified lanes decide, not the labels");
  assert.ok(flat.includes("treated as if the label were absent"),
    "an unhonoured `approved`/`auto-ok` must be treated as absent");
  assert.ok(flat.includes("WITHOUT a verified `auto-ok` lane"),
    "step 2 (draft a proposal) must key off the verified `auto-ok` lane");
  assert.ok(flat.includes("whose verified lane (step 1b) is `approved`"),
    "step 3 (create a task) must key off the verified lanes");
  assert.ok(!/labelled `approved`/.test(flat) && !/WITHOUT the `auto-ok` label/.test(flat),
    "the raw-label wording of steps 2 and 3 must be gone");
  assert.equal(lanesStep().env?.FLOW_TRIAGE_LANES, "${{ runner.temp }}/flow-triage-lanes.json",
    "the file the prompt names must be the file the lanes step writes");
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// The shipped run: block, executed against a fake `gh`
// ─────────────────────────────────────────────────────────────────────────────────────────

function runLanesStep({ issues, permissions, config }) {
  const dir = mkdtempSync(join(tmpdir(), "flow-triage-lanes-"));
  try {
    const runner = join(dir, "runner");
    const raw = join(runner, "flow-triage-raw");
    const fixtures = join(dir, "fixtures");
    const bin = join(dir, "bin");
    const workspace = join(dir, "ws");
    for (const d of [raw, fixtures, bin, join(workspace, ".flow")]) mkdirSync(d, { recursive: true });
    writeFileSync(join(workspace, ".flow", "config.yml"), config);

    for (const [n, { labels, events }] of Object.entries(issues)) {
      // What the `content` step leaves behind.
      writeFileSync(join(raw, `issue-${n}.json`), JSON.stringify({ number: Number(n), labels: labels.map((name) => ({ name })) }));
      writeFileSync(join(fixtures, `events-${n}.json`), JSON.stringify([events]));
    }
    for (const [login, permission] of Object.entries(permissions)) {
      writeFileSync(join(fixtures, `perm-${login}.json`), JSON.stringify({ permission }));
    }
    // A fake `gh api`: serves the events and permission fixtures, and 404s anything else.
    const gh = join(bin, "gh");
    writeFileSync(gh, [
      "#!/usr/bin/env node",
      'const { existsSync, readFileSync } = require("node:fs");',
      `const fx = ${JSON.stringify(fixtures)};`,
      'const url = process.argv.slice(2).find((a) => a.startsWith("repos/")) || "";',
      'let m = url.match(/issues\\/(\\d+)\\/events$/);',
      'let file = m ? `${fx}/events-${m[1]}.json` : null;',
      'm = url.match(/collaborators\\/([^/]+)\\/permission$/);',
      'if (m) file = `${fx}/perm-${m[1]}.json`;',
      'if (!file || !existsSync(file)) { process.stderr.write("gh: Not Found (HTTP 404)\\n"); process.exit(1); }',
      "process.stdout.write(readFileSync(file));",
    ].join("\n"));
    chmodSync(gh, 0o755);

    const lanesFile = join(runner, "flow-triage-lanes.json");
    const res = spawnSync("bash", ["-e", "-c", String(lanesStep().run)], {
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: runner,
        FLOW_BIN: TEMPLATE_BIN,
        GITHUB_WORKSPACE: workspace,
        GITHUB_REPOSITORY: "acme/widgets",
        FLOW_TRIAGE_NUMBERS: Object.keys(issues).join(","),
        FLOW_TRIAGE_LANES: lanesFile,
      },
    });
    assert.equal(res.status, 0, `lanes step exited ${res.status}: ${res.stderr}`);
    return { stdout: res.stdout, lanes: JSON.parse(readFileSync(lanesFile, "utf8")) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const at = (i) => new Date(Date.parse("2026-11-01T10:00:00Z") + i * 60_000).toISOString();
const ev = (i, event, label, login, type = "User") =>
  ({ id: 100 + i, event, label: { name: label }, actor: { login, type }, created_at: at(i) });

test("an unhonoured label prints exactly the label-not-honoured line, and reaches the agent as false", { skip }, () => {
  const { stdout, lanes } = runLanesStep({
    config: 'intake:\n  trusted_labelers: ["inflight-flow[bot]"]\n',
    permissions: { dan: "admin", reader: "read" },
    issues: {
      // A bot's `approved`: refused.
      11: { labels: ["approved"], events: [ev(1, "labeled", "approved", "inflight-flow[bot]", "Bot")] },
      // A person whose write was revoked: refused.
      12: { labels: ["auto-ok"], events: [ev(1, "labeled", "auto-ok", "reader")] },
      // Dan, an admin: honoured. And the App's `flow:trusted`: honoured.
      13: { labels: ["approved", "flow:trusted"], events: [
        ev(1, "labeled", "flow:trusted", "inflight-flow[bot]", "Bot"),
        ev(2, "labeled", "approved", "dan"),
      ] },
      // A login the fake gh does not know (404): no write.
      14: { labels: ["approved"], events: [ev(1, "labeled", "approved", "stranger")] },
    },
  });

  assert.deepEqual(lanes, {
    11: { approved: false, "auto-ok": false, "flow:trusted": false },
    12: { approved: false, "auto-ok": false, "flow:trusted": false },
    13: { approved: true, "auto-ok": false, "flow:trusted": true },
    14: { approved: false, "auto-ok": false, "flow:trusted": false },
  });
  const notHonoured = stdout.split("\n").filter((l) => l.startsWith("flow-triage: label-not-honoured"));
  assert.deepEqual(notHonoured, [
    "flow-triage: label-not-honoured issue=11 label=approved actor=inflight-flow[bot] reason=actor-not-user",
    "flow-triage: label-not-honoured issue=12 label=auto-ok actor=reader reason=actor-lacks-write",
    "flow-triage: label-not-honoured issue=14 label=approved actor=stranger reason=actor-lacks-write",
  ]);
});
