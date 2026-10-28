// setup-node-check-latest.test.mjs — every actions/setup-node step must set `check-latest: true`
// (flow-0166). A major-line range alone takes the runner image's cached patch, which trailed
// Node's 2026-10-21 security release (CVE-2026-111497) by days. Empty set = parse broke = fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github', 'workflows');

export function findViolations(dir) {
  const bad = [];
  let seen = 0;
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    const doc = parse(readFileSync(join(dir, f), 'utf8'));
    for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
      (job?.steps ?? []).forEach((step, i) => {
        if (!String(step?.uses ?? '').startsWith('actions/setup-node@')) return;
        seen++;
        const v = step.with?.['check-latest'];
        if (v !== true && v !== 'true') bad.push(`${f}: job ${jobId}, step ${i + 1} (${step.name ?? step.uses})`);
      });
    }
  }
  return { seen, bad };
}

// The check: throws naming every offending step, or on an empty set.
export function checkLatest(dir) {
  const { seen, bad } = findViolations(dir);
  assert.ok(seen > 0, `no setup-node steps found in ${dir} — the parse broke`);
  assert.deepEqual(bad, [], `setup-node without check-latest: true:\n${bad.join('\n')}`);
}

test('every setup-node step in .github/workflows sets check-latest: true', () => {
  checkLatest(WORKFLOWS);
});

test('a step with check-latest removed fails, naming file and step', () => {
  const d = mkdtempSync(join(tmpdir(), 'sn-'));
  writeFileSync(join(d, 'x.yml'), 'jobs:\n  a:\n    steps:\n      - uses: actions/setup-node@abc\n        with:\n          node-version: 22\n');
  const { bad } = findViolations(d);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /x\.yml: job a, step 1/);
  assert.throws(() => checkLatest(d), /x\.yml: job a, step 1/);
});

test('a directory with no setup-node steps fails rather than passing empty', () => {
  const d = mkdtempSync(join(tmpdir(), 'sn-'));
  writeFileSync(join(d, 'x.yml'), 'jobs:\n  a:\n    steps:\n      - run: echo\n');
  assert.equal(findViolations(d).seen, 0);
  assert.throws(() => checkLatest(d), /no setup-node steps found/);
});
