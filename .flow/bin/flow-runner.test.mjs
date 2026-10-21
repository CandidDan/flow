// flow-runner.test.mjs — proving tests for flow-0149 (FLOW_RUNNER).
//
// Every job in every `_flow-*.yml` reusable runs on `${{ inputs.runner }}`, default
// `ubuntu-latest`. Each TEMPLATE caller passes `vars.FLOW_RUNNER || 'ubuntu-latest'`; canonical's
// own callers never pass it (canonical is public — a third-party runner would run fork-PR code on
// someone else's box). Line-based, not YAML-parsed, like action-pins.test.mjs: the flow-tooling
// job runs these tests with no install step, and a violation can name its line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WF = join(ROOT, '.github/workflows');
const TPL = join(ROOT, 'project-template/.github/workflows');
const PASS = "runner: ${{ vars.FLOW_RUNNER || 'ubuntu-latest' }}";

const read = (d, f) => readFileSync(join(d, f), 'utf8');
const list = (d, re) => readdirSync(d).filter((f) => re.test(f));
const REUSABLES = list(WF, /^_flow-.*\.yml$/);
const TEMPLATE_CALLERS = list(TPL, /^flow-.*\.yml$/);
const CANON_CALLERS = list(WF, /^flow-.*\.yml$/);

const stripComments = (text) => text.split('\n').map((l) => l.replace(/^\s*#.*$/, ''));

// Violations of rule 1 for one reusable: returns strings naming file (and job / line).
export function checkReusable(file, text) {
  const out = [];
  const lines = stripComments(text);
  const wc = lines.findIndex((l) => l === '  workflow_call:');
  const block = wc < 0 ? '' : lines.slice(wc, wc + 60).join('\n');
  if (!/^ {6}runner:\n(?: {8}.*\n)*? {8}default: "ubuntu-latest"/m.test(block)) {
    out.push(`${file}: workflow_call.inputs.runner missing or not defaulting to ubuntu-latest`);
  }
  let job = null;
  let inJobs = false;
  lines.forEach((l, i) => {
    if (l === 'jobs:') inJobs = true;
    const m = /^ {2}([\w-]+):\s*$/.exec(l);
    if (inJobs && m) job = m[1];
    const r = /^\s+runs-on:\s*(.*)$/.exec(l);
    if (r && r[1].trim() !== '${{ inputs.runner }}') {
      out.push(`${file}: job ${job} line ${i + 1} runs-on is "${r[1].trim()}", not \${{ inputs.runner }}`);
    }
  });
  return out;
}

// Rule 2: a template caller of a reusable passes the runner line.
export function checkTemplateCaller(file, text) {
  const lines = stripComments(text);
  if (!lines.some((l) => /^\s+uses: .*\/_flow-[\w-]+\.yml@/.test(l))) return [];
  return lines.some((l) => l.trim() === PASS) ? [] : [`${file}: caller does not pass ${PASS}`];
}

// Rule 3: canonical's own callers never pass runner.
export function checkCanonCaller(file, text) {
  return stripComments(text).some((l) => /^\s+runner:/.test(l))
    ? [`${file}: canonical caller passes runner (public repo — must not)`]
    : [];
}

test('every reusable declares inputs.runner and no runs-on is a literal', () => {
  assert.ok(REUSABLES.length > 0, 'found no reusables — an empty check is a failure');
  const v = REUSABLES.flatMap((f) => checkReusable(f, read(WF, f)));
  assert.deepEqual(v, []);
});

test('every template caller passes vars.FLOW_RUNNER with the ubuntu-latest fallback', () => {
  assert.ok(TEMPLATE_CALLERS.length > 0);
  const v = TEMPLATE_CALLERS.flatMap((f) => checkTemplateCaller(f, read(TPL, f)));
  assert.deepEqual(v, []);
});

test("canonical's own callers pass no runner", () => {
  assert.ok(CANON_CALLERS.length > 0);
  const v = CANON_CALLERS.flatMap((f) => checkCanonCaller(f, read(WF, f)));
  assert.deepEqual(v, []);
});

test('mutation: a hard-coded runs-on in a reusable fails naming file and job', () => {
  const mutated = read(WF, '_flow-done.yml').replace('${{ inputs.runner }}', 'ubuntu-latest');
  const v = checkReusable('_flow-done.yml', mutated);
  assert.equal(v.length, 1);
  assert.match(v[0], /_flow-done\.yml: job mark-done/);
});

test('mutation: a reusable without the runner input fails naming the file', () => {
  const mutated = read(WF, '_flow-done.yml').replace(/ {6}runner:\n(?: {8}.*\n)+/, '');
  assert.match(checkReusable('_flow-done.yml', mutated)[0], /^_flow-done\.yml: .*inputs\.runner/);
});

test('mutation: a template caller without the runner line fails naming the file', () => {
  const mutated = read(TPL, 'flow-done.yml').replace(/.*runner:.*\n/, '');
  assert.match(checkTemplateCaller('flow-done.yml', mutated)[0], /^flow-done\.yml:/);
});

test('mutation: a canonical caller passing runner fails naming the file', () => {
  const mutated = read(WF, 'flow-done.yml').replace(
    /(uses: .*\n)/,
    `$1    with:\n      ${PASS}\n`,
  );
  assert.match(checkCanonCaller('flow-done.yml', mutated)[0], /^flow-done\.yml:/);
});

test('docs document FLOW_RUNNER, private repos only, and the secrets note', () => {
  const doc = read(join(ROOT, 'docs'), 'flow-reusable-workflows.md');
  assert.match(doc, /FLOW_RUNNER/);
  assert.match(doc, /private repos only/i);
  assert.match(doc, /sees every secret its jobs hold/);
});
