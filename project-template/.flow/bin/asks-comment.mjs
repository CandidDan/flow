#!/usr/bin/env node
// asks-comment.mjs — the PR comment that tells the repo owner a task needs them (flow-0120).
//
// flow-0119 gave a task an `asks` list: the items a person must act on. The owner reviews in
// GitHub and wants a PR that needs them to say so where they already are, with a notification on
// their phone. `_flow-status.yml` calls this on `opened`, `reopened` and `ready_for_review`. It
// reads the task's `asks` from `main`, works out which of them an earlier Flow comment on this PR
// already announced, and renders ONE new comment for the rest, starting with an @-mention of the
// owner. GitHub does not notify on a mention added by editing a comment, so a new ask always gets
// a new comment, and an ask already announced is never posted again.
//
// Pure functions first, a thin CLI last. Nothing here calls GitHub: the workflow fetches the
// earlier comments, passes them in by file, and posts the body this writes to a file. Ask text
// therefore never reaches a shell command line.
//
//   node asks-comment.mjs plan --tasks-dir .flow/tasks --id flow-0120 --owner CandidDan \
//        --comments comments.jsonl --body-out body.md
//
// prints `has_asks=…`, `post=…`, `new=…` and `errors=…` lines for `$GITHUB_OUTPUT`, and writes the
// body only when there is something new to post. `--comments` is JSON Lines, one
// `{"body": "...", "user": "..."}` per earlier comment on the PR.
//
// It runs from canonical's tree, materialised at the reusable's own commit, so a repo that has
// never synced still gets it. Every path it reads is passed in; nothing is resolved relative to
// this file.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { ASK_KINDS, parseAsks } from "./asks.mjs";
import { parseListField } from "./flow-doctor.mjs";

// --- main-module detection (do not simplify back to a string compare) -------------------
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------

/** The hidden line that records which asks a comment announced. */
export const MARKER_PREFIX = "<!-- flow-asks: ";
const MARKER_RE = /<!-- flow-asks: ([0-9a-z,]*) -->/g;

/**
 * Comment authors whose markers count. `_flow-status.yml` posts with the job's `GITHUB_TOKEN`, so
 * its comments are always `github-actions[bot]`'s. A marker in anyone else's comment is ignored:
 * otherwise anyone who can comment on the PR could stop an ask from being announced.
 */
export const TRUSTED_AUTHORS = Object.freeze(["github-actions[bot]"]);

/** The label a PR carries while its task has any open ask (the label flow-0109 introduced). */
export const NEEDS_INPUT_LABEL = "needs-input";

const KIND_TITLE = { decision: "Decision", "follow-up": "Follow-up", fyi: "FYI" };

/**
 * `s` made safe to show as written in a GitHub comment.
 *
 * Every ASCII punctuation character Markdown or GitHub's math rendering could act on is
 * backslash-escaped, so backticks, `$(...)`, `*`, `<!-- -->` and the like display literally. An
 * `@` is followed by a zero-width space, so ask text can never mention anyone (only the owner
 * line does). Line breaks are kept as single line breaks: blank lines would end the ask's
 * paragraph early, so runs of them collapse to one.
 */
export function literal(s) {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[\\`*_{}[\]()#+\-.!|~<>$&]/g, "\\$&")
    .replace(/@/g, "@​");
}

/** A GitHub login, or "" when `owner` is not one (then the comment carries no mention). */
export function mentionable(owner) {
  const s = String(owner ?? "").trim();
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(s) ? s : "";
}

/** Every ask id announced by a trusted earlier comment. `comments` is `[{ body, user }]`. */
export function announcedIds(comments, trusted = TRUSTED_AUTHORS) {
  const ids = new Set();
  for (const c of comments ?? []) {
    if (!c || !trusted.includes(c.user)) continue;
    for (const m of String(c.body ?? "").matchAll(MARKER_RE)) {
      for (const id of m[1].split(",")) if (id) ids.add(id);
    }
  }
  return ids;
}

/** `asks` sorted for a person: decisions first, then follow-ups, then FYIs, task order within. */
export function orderAsks(asks) {
  return ASK_KINDS.flatMap((kind) => (asks ?? []).filter((a) => a.kind === kind));
}

/** The comment body announcing `asks` (already parsed, already filtered to the new ones). */
export function renderAsksComment({ owner, asks }) {
  const who = mentionable(owner);
  const ordered = orderAsks(asks);
  const lines = [who ? `@${who} this PR needs you:` : "This PR needs you:", ""];
  for (const a of ordered) {
    lines.push(`**${KIND_TITLE[a.kind]}** — ${literal(a.text)}`);
    if (a.recommend) lines.push(`↳ Recommend: ${literal(a.recommend)}`);
    lines.push("");
  }
  lines.pop();
  lines.push(`${MARKER_PREFIX}${ordered.map((a) => a.id).join(",")} -->`);
  return lines.join("\n") + "\n";
}

/** The frontmatter block of a task file, or "" when it has none. */
export function frontmatter(text) {
  const m = String(text ?? "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : "";
}

/** The `id:` value in a frontmatter block, unquoted, or "". */
export function frontmatterId(head) {
  const m = String(head ?? "").match(/^id:\s*["']?([^"'\s#]+)["']?/m);
  return m ? m[1] : "";
}

/**
 * The frontmatter of the task whose `id:` is `id`, from the `.md` files in `tasksDir`, or null.
 * Found by the frontmatter id, never by file name, the same rule flow-0099 set for review.
 */
export function findTaskHead(tasksDir, id) {
  if (!id || !existsSync(tasksDir)) return null;
  const want = String(id).toLowerCase();
  for (const name of readdirSync(tasksDir).sort()) {
    if (!name.endsWith(".md") || name.startsWith("_")) continue;
    const head = frontmatter(readFileSync(join(tasksDir, name), "utf8"));
    if (frontmatterId(head).toLowerCase() === want) return head;
  }
  return null;
}

/**
 * What the workflow should do for one PR event.
 *
 * `hasAsks` decides the `needs-input` label. `body` is the comment to post, or null when every
 * ask was already announced. `errors` counts asks that did not parse: flow-doctor fails those on
 * `main`, so they are not announced here, and the count is only reported.
 */
export function planAsks({ head, comments, owner }) {
  const { asks, errors } = parseAsks(parseListField(head ?? "", "asks"));
  const seen = announcedIds(comments);
  const fresh = asks.filter((a) => !seen.has(a.id));
  return {
    hasAsks: asks.length > 0,
    newIds: orderAsks(fresh).map((a) => a.id),
    body: fresh.length ? renderAsksComment({ owner, asks: fresh }) : null,
    errors: errors.length,
  };
}

/** One earlier comment per JSON line; blank and malformed lines are skipped. */
export function readComments(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const c = JSON.parse(line);
      if (c && typeof c === "object") out.push({ body: String(c.body ?? ""), user: String(c.user ?? "") });
    } catch { /* not a comment record */ }
  }
  return out;
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

const USAGE = "usage: asks-comment.mjs plan --tasks-dir DIR --id ID --owner LOGIN " +
  "--comments FILE --body-out FILE";

export function runCli(argv, { out = process.stdout, err = process.stderr } = {}) {
  if (argv[0] !== "plan") { err.write(USAGE + "\n"); return 2; }
  const tasksDir = flag(argv, "--tasks-dir");
  const id = flag(argv, "--id");
  const bodyOut = flag(argv, "--body-out");
  const commentsFile = flag(argv, "--comments");
  if (!tasksDir || !id || !bodyOut) { err.write(USAGE + "\n"); return 2; }

  const head = findTaskHead(tasksDir, id);
  if (head === null) {
    out.write("has_asks=false\npost=false\nnew=\nerrors=0\n");
    err.write(`asks-comment: no task with id ${id} in ${tasksDir} — nothing to announce.\n`);
    return 0;
  }
  const comments = commentsFile && existsSync(commentsFile)
    ? readComments(readFileSync(commentsFile, "utf8")) : [];
  const plan = planAsks({ head, comments, owner: flag(argv, "--owner") });
  if (plan.body) writeFileSync(bodyOut, plan.body);
  out.write(`has_asks=${plan.hasAsks}\npost=${plan.body !== null}\nnew=${plan.newIds.join(",")}\n` +
    `errors=${plan.errors}\n`);
  return 0;
}

if (__isMain) process.exitCode = runCli(process.argv.slice(2));
