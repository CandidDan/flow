#!/usr/bin/env node
// worker-host.mjs — where does this repo's worker run? (flow-0170)
//
// Every adopting repo used to get `flow-queue-runner`, which starts a Claude Code worker on a
// GitHub-hosted runner, billed per minute while the runner waits on the model. That tied every
// adopter to Claude and to Actions billing — in October 2026 it was about $60 across private
// repos. Where the worker runs is now a per-repo choice, read from `.flow/config.yml`:
//
//   worker:
//     host: manual   # manual | claude-routine | github-actions
//
//   · manual          nothing starts a worker; a person (or any agent) works ready tasks.
//   · claude-routine  a Claude Code cloud routine does the work; queue-runner does nothing.
//   · github-actions  queue-runner dispatches a worker, exactly as before.
//
// NO `worker` KEY MEANS `github-actions`, so a repo that adopted before this key existed behaves
// exactly as it did until it opts out. The TEMPLATE ships `host: manual`, so a new adopter gets
// no automatic worker and no surprise bill. An unknown value is an ERROR, never a fallback: a
// typo that silently meant "github-actions" would be the surprise bill this exists to prevent.
//
//   node .flow/bin/worker-host.mjs [--config .flow/config.yml]
//
// Writes `host` / `run` / `reason` to `$GITHUB_OUTPUT` and one line to `$GITHUB_STEP_SUMMARY`
// when those are set, prints the reason on stdout, and exits 0 for every valid host — "this
// repo's worker runs elsewhere" is a correct outcome, not a failure. Exits 1 on an unknown value.
//
// Zero dependencies (Node >= 18): `_flow-gates.yml`'s flow-tooling job runs these tests with no
// install step, so the `worker:` block is read with the same tolerant line scan flow-review.mjs
// uses for `review:`, not a YAML library.

import { appendFileSync, existsSync, readFileSync, realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";

// --- main-module detection (do not simplify back to a string compare) -------------------
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED. Reached
// through a symlink they differ and the CLI block never runs. See main-module.test.mjs.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

export const HOSTS = Object.freeze(["manual", "claude-routine", "github-actions"]);
export const DEFAULT_HOST = "github-actions";

const unquote = (v) => {
  const s = String(v ?? "").replace(/\s+#.*$/, "").trim();
  const m = s.match(/^(["'])(.*)\1$/);
  return m ? m[2] : s;
};

// The raw `worker.host` value, or `null` when the config does not set one. Handles the block
// form (`worker:` then an indented `host:`) and the inline flow form (`worker: { host: x }`).
export function readWorkerHost(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^worker:(\s|$)/.test(l));
  if (start === -1) return null;
  const inline = lines[start].replace(/^worker:/, "").replace(/\s+#.*$/, "").trim();
  if (inline) {
    const m = inline.match(/^\{(.*)\}$/);
    if (!m) throw new Error(`\`worker:\` in .flow/config.yml must be a block, not ${JSON.stringify(inline)}.`);
    const pair = m[1].split(",").map((p) => p.trim()).find((p) => /^host\s*:/.test(p));
    return pair ? unquote(pair.replace(/^host\s*:/, "")) || null : null;
  }
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;                     // the next top-level key ends the block
    const m = line.match(/^\s+host:(.*)$/);
    if (m) return unquote(m[1]) || null;
  }
  return null;
}

// The validated host. Unset is the default; anything outside HOSTS throws, naming all three.
export function resolveWorkerHost(text) {
  const raw = readWorkerHost(text);
  if (raw === null) return DEFAULT_HOST;
  if (!HOSTS.includes(raw)) {
    throw new Error(`worker.host in .flow/config.yml is ${JSON.stringify(raw)}; ` +
      `allowed values are ${HOSTS.map((h) => `\`${h}\``).join(", ")}.`);
  }
  return raw;
}

// The workflow's decision: does queue-runner dispatch a worker in this repo?
export function hostDecision(host, { configured = true } = {}) {
  if (host === "github-actions") {
    return { host, run: true, reason: configured
      ? "worker.host is `github-actions` — queue-runner dispatches a worker on this runner."
      : "no `worker` key in .flow/config.yml, so worker.host defaults to `github-actions` — queue-runner dispatches a worker as before." };
  }
  const where = host === "manual"
    ? "ready tasks are worked by hand, in a session"
    : "a Claude Code cloud routine works this repo's queue";
  return { host, run: false,
    reason: `worker.host is \`${host}\` — ${where}, so queue-runner starts no worker. Set \`worker.host: github-actions\` in .flow/config.yml to run it here.` };
}

export function summaryLine({ host, run, reason }) {
  return `- **${run ? "worker dispatch" : "no worker"}** (\`${host}\`) — ${reason}`;
}

export function runCli(argv = [], { env = process.env, out = process.stdout, err = process.stderr,
  append = appendFileSync, read = readFileSync, exists = existsSync } = {}) {
  const i = argv.indexOf("--config");
  const path = i > -1 && argv[i + 1] ? argv[i + 1] : ".flow/config.yml";
  const text = exists(path) ? read(path, "utf8") : "";
  let decision;
  try {
    decision = hostDecision(resolveWorkerHost(text), { configured: readWorkerHost(text) !== null });
  } catch (e) {
    err.write(`::error::worker-host: ${e.message}\n`);
    return 1;
  }
  out.write(`${decision.reason}\n`);
  if (env.GITHUB_OUTPUT) {
    append(env.GITHUB_OUTPUT, `host=${decision.host}\nrun=${decision.run}\nreason=${decision.reason}\n`);
  }
  if (env.GITHUB_STEP_SUMMARY) append(env.GITHUB_STEP_SUMMARY, `${summaryLine(decision)}\n`);
  return 0;
}

if (__isMain) {
  process.exitCode = runCli(process.argv.slice(2));
}
