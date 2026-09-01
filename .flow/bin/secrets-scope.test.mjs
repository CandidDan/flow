// secrets-scope.test.mjs — proving tests for the caller-side secrets narrowing.
//
// Every `flow-*.yml` caller — in `project-template/` (the published artefact, pinned `@v1`) and
// in canonical's own `.github/workflows/` (pinned `@main`, dogfooding the same callers) — used
// to pass `secrets: inherit` to its reusable. Each `_flow-*.yml` reusable declares a MINIMAL
// `on.workflow_call.secrets` block, so `inherit` was handing every job every OTHER configured
// secret too — FLOW_PAT is repo-scoped and bounded, but CLAUDE_CODE_OAUTH_TOKEN is account-scoped,
// and it was reaching workflows that never invoke claude-code-action, including `flow-open-pr`,
// which fires on every push with no human review.
//
// This proves the caller side now names exactly what its paired reusable declares, and that the
// three callers with no secret today (flow-gates, flow-done, flow-status) still have none — a
// regression there would be a silent widening, not a narrowing.
//
// ONE REAL SPLIT, checked directly rather than assumed: `_flow-queue-runner.yml` declares BOTH
// CLAUDE_CODE_OAUTH_TOKEN and FLOW_PAT on `main` (FLOW_PAT was added by flow-0026, PR #40), but
// the `v1` tag's copy declares only CLAUDE_CODE_OAUTH_TOKEN — flow-0026 has not been released.
// So canonical's own `@main` caller must forward both; the template's `@v1` caller must forward
// only one, and would fail GitHub's own validation (an undeclared named secret) if it forwarded
// FLOW_PAT today. Every other reusable's secret set is identical between `v1` and `main` (checked
// by hand against `git show v1:.github/workflows/_flow-*.yml` while writing this).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE — see check-workflows.test.mjs. `_flow-gates.yml`'s `flow-tooling` job runs
// `node --test .flow/bin/*.test.mjs` with no install step; these tests need `yaml` to read a
// workflow the way GitHub does. They skip visibly there and run for real in the per-stack job.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");

const parse = (file) => yamlMod.parse(readFileSync(file, "utf8"));
// Every caller here is a thin, single-job workflow — the one job's name varies (flow-review,
// flow-open-pr, …) but there is always exactly one.
const soleJob = (file) => {
  const jobs = Object.values(parse(file).jobs ?? {});
  assert.equal(jobs.length, 1, `${file} must be a thin caller: exactly one job`);
  return jobs[0];
};

// Which secret(s) each caller should pass — null for "none", a string for one, an array for more
// than one. Split into REPO (canonical's own `@main` callers) and TEMPLATE (`@v1`) only where
// they genuinely differ; everything else is shared via COMMON.
const COMMON = {
  "flow-compass.yml": "CLAUDE_CODE_OAUTH_TOKEN",
  "flow-done.yml": null,
  "flow-gates.yml": null,
  "flow-open-pr.yml": "FLOW_PAT",
  "flow-recover.yml": "FLOW_PAT",
  "flow-review.yml": "CLAUDE_CODE_OAUTH_TOKEN",
  "flow-status.yml": null,
  "flow-triage.yml": "CLAUDE_CODE_OAUTH_TOKEN",
};
const REPO_EXPECTED = { ...COMMON, "flow-queue-runner.yml": ["CLAUDE_CODE_OAUTH_TOKEN", "FLOW_PAT"] };
const TEMPLATE_EXPECTED = {
  ...COMMON,
  "flow-queue-runner.yml": "CLAUDE_CODE_OAUTH_TOKEN",
  // canonical has no flow-sync.yml caller by design (flow-0015) — see flow-open-pr.yml's header.
  "flow-sync.yml": "FLOW_PAT",
};

function assertScoped(dir, name, wanted) {
  const file = join(dir, ".github/workflows", name);
  const job = soleJob(file);
  if (wanted === null) {
    assert.equal(job.secrets, undefined,
      `${file} must carry no secrets: block at all — it never did, and gaining one here would ` +
      `be a silent widening this test exists to catch`);
    return;
  }
  const wantedKeys = (Array.isArray(wanted) ? wanted : [wanted]).slice().sort();
  assert.notEqual(job.secrets, "inherit",
    `${file} must not use \`secrets: inherit\` — its reusable declares only ` +
    `{${wantedKeys.join(", ")}}, so inherit would additionally hand this job every other ` +
    `configured secret`);
  assert.deepEqual(Object.keys(job.secrets ?? {}).sort(), wantedKeys,
    `${file} must pass exactly {${wantedKeys.join(", ")}} and nothing else`);
  for (const key of wantedKeys) {
    assert.equal(job.secrets[key], `\${{ secrets.${key} }}`,
      `${file}'s ${key} must be forwarded verbatim from the caller's own secret of that name`);
  }
}

test("canonical's own _flow-*.yml reusables (on main) declare exactly what REPO_EXPECTED says", { skip }, () => {
  for (const [name, wanted] of Object.entries(REPO_EXPECTED)) {
    if (wanted === null) continue;
    const reusable = join(REPO, ".github/workflows", `_${name.slice(0, -".yml".length)}.yml`);
    const declared = parse(reusable).on?.workflow_call?.secrets ?? {};
    const wantedKeys = (Array.isArray(wanted) ? wanted : [wanted]).slice().sort();
    assert.deepEqual(Object.keys(declared).sort(), wantedKeys,
      `${reusable} must declare exactly {${wantedKeys.join(", ")}}, matching the table this ` +
      `test file's caller-side assertions are built from`);
  }
});

for (const [name, wanted] of Object.entries(TEMPLATE_EXPECTED)) {
  test(`project-template caller ${name} (@v1) passes exactly the secret(s) its reusable needs`, { skip }, () => {
    assertScoped(TEMPLATE, name, wanted);
  });
}

for (const [name, wanted] of Object.entries(REPO_EXPECTED)) {
  // canonical has no flow-sync.yml caller — see TEMPLATE_EXPECTED's comment above.
  if (name === "flow-sync.yml") continue;
  test(`canonical's own caller ${name} (@main) passes exactly the secret(s) its reusable needs`, { skip }, () => {
    assertScoped(REPO, name, wanted);
  });
}
