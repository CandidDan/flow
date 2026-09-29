// secrets-scope.test.mjs — proving tests for the caller-side secrets narrowing.
//
// THE RULE THIS FILE OWNS, and owns alone: every `flow-*.yml` caller forwards exactly the secrets
// its paired `_flow-*.yml` reusable declares — by name, never `secrets: inherit`. The rule is
// stated once, in the table below. A second copy of it in another test file is a second thing to
// drift, which is why flow-0095's caller-side assertions were folded in here rather than kept
// beside the reusable-side ones in flow-pat-forwarding.test.mjs.
//
// Both caller sets are covered: `project-template/` (the published artefact, pinned `@v2`) and
// canonical's own `.github/workflows/` (pinned `@main`, dogfooding the same callers). Every
// `_flow-*.yml` reusable declares a MINIMAL `on.workflow_call.secrets` block, and the callers used
// to pass `secrets: inherit` — which handed each job every OTHER configured secret as well.
// FLOW_PAT is repo-scoped and bounded, but CLAUDE_CODE_OAUTH_TOKEN is account-scoped, and it was
// reaching workflows that never invoke claude-code-action, including `flow-open-pr`, which fires
// on every push with no human review.
//
// The three callers with no secret at all today (flow-gates, flow-done, flow-status) must still
// have none — a regression there would be a silent widening, not a narrowing.
//
// THE PER-TAG SPLIT THAT USED TO LIVE HERE IS CLOSED, and closing it was flow-0095.
// `_flow-queue-runner.yml` gained FLOW_PAT on `main` in flow-0026 (PR #40) while the `v1` tag
// still declared only CLAUDE_CODE_OAUTH_TOKEN, so this table carried two different expectations
// for the same caller: canonical forwarded both, the template forwarded one, and forwarding
// FLOW_PAT from the template would have failed GitHub's own validation as an undeclared named
// secret. flow-0026 has since released. The template caller pins `@v2`, and
// `git show v2:.github/workflows/_flow-queue-runner.yml` declares BOTH secrets, each
// `required: false` — so the forward is additive and a repo that has not set FLOW_PAT keeps
// today's behaviour. flow-queue-runner therefore moves into COMMON with everything else, and no
// per-tag expectation is left in this file to go stale. The only remaining asymmetry is
// flow-sync.yml, which the template has and canonical deliberately has no caller for (flow-0015).
// Every other reusable's secret set was identical between `v1` and `main` and stays identical at
// `v2` (checked by hand against `git show <tag>:.github/workflows/_flow-*.yml`).

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
  // Both, and one entry rather than two: the agent's own credential plus the one the worker uses
  // to touch the repo (checkout's persisted git credential and GH_TOKEN, flow-0093). A single
  // shared entry is what makes "canonical and the template forward the same names" structural
  // rather than a coincidence two lines apart.
  "flow-queue-runner.yml": ["CLAUDE_CODE_OAUTH_TOKEN", "FLOW_PAT"],
  "flow-recover.yml": "FLOW_PAT",
  "flow-review.yml": "CLAUDE_CODE_OAUTH_TOKEN",
  "flow-status.yml": null,
  "flow-triage.yml": "CLAUDE_CODE_OAUTH_TOKEN",
};
const REPO_EXPECTED = { ...COMMON };
const TEMPLATE_EXPECTED = {
  ...COMMON,
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
  test(`project-template caller ${name} (@v2) passes exactly the secret(s) its reusable needs`, { skip }, () => {
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

// ─── flow-0095: the two halves of the rule, asserted from the FILES rather than the table ────
//
// Everything above checks each caller against its expected entry, so a wrong entry is a wrong
// test in both directions at once. These two read the files directly and compare them to each
// other, which is the form that survives someone editing the table to make a failure go away.

test("every secret a caller forwards is declared by the reusable it calls", { skip }, () => {
  for (const [dir, table] of [[REPO, REPO_EXPECTED], [TEMPLATE, TEMPLATE_EXPECTED]]) {
    for (const name of Object.keys(table)) {
      const reusable = join(REPO, ".github/workflows", `_${name}`);
      const declared = Object.keys(parse(reusable).on?.workflow_call?.secrets ?? {});
      const forwarded = Object.keys(soleJob(join(dir, ".github/workflows", name)).secrets ?? {});
      for (const secret of forwarded) {
        assert.ok(declared.includes(secret),
          `${dir}/.github/workflows/${name} forwards ${secret}, which ${reusable} does not ` +
          `declare in on.workflow_call.secrets. GitHub rejects an undeclared named secret at ` +
          `call time, so this is not a silent no-op — it fails the whole run, and for the ` +
          `template caller it fails it in every adopting repo at once. Declared: ` +
          `{${declared.join(", ")}}`);
      }
    }
  }
});

test("canonical and project-template callers forward identical secret names", { skip }, () => {
  const names = (dir, file) =>
    Object.keys(soleJob(join(dir, ".github/workflows", file)).secrets ?? {}).sort();
  const canonical = {};
  const template = {};
  // COMMON is exactly the set of callers both sides have; flow-sync.yml is template-only by
  // design (flow-0015) and has nothing on this side to compare against.
  for (const name of Object.keys(COMMON)) {
    canonical[name] = names(REPO, name);
    template[name] = names(TEMPLATE, name);
  }
  assert.deepEqual(template, canonical,
    "canonical dogfoods the callers it publishes, so a divergence here means canonical works and " +
    "every adopting repo quietly does not — the exact shape of the gap flow-0095 closed, where " +
    "the reusable used FLOW_PAT, canonical's caller forwarded it, and the template caller did " +
    "not, so `secrets.FLOW_PAT` evaluated empty inside the reusable in every repo that had " +
    "adopted Flow. If the two ever must differ, that is a deliberate decision and this test is " +
    "where it gets recorded");
});
