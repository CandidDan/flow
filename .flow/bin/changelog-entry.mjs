// changelog-entry.mjs — a task's changelog entry, wherever it currently lives. Canonical-only.
//
// A task writes its entry as `changes/<task-id>.md`. A release runs
// `changelog-fragments.mjs --assemble`, which folds every fragment into `CHANGELOG.md` and deletes
// the file. A test that proves "my entry exists and says X" by reading the fragment is therefore
// green until the next release and red on the release's own PR: 2.1.0, 2.1.1 and 2.1.2 each hit it
// (flow-0069, 0073, 0050, 0093, 0094, 0095). Read the entry through this instead.
//
// NOT AN ADAPTER, and not synced: adopting repos have no `changes/` and no canonical CHANGELOG.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The file list can wrap, so the comma and the id may be split across lines: allow any whitespace.
const OTHER_TASK = /,\s+([a-z][a-z0-9-]*-\d{4})\)/;

/**
 * The changelog entry for `id` in the repo at `repo`: the fragment if it still exists, otherwise
 * the assembled entry in CHANGELOG.md, otherwise "".
 *
 * An assembled entry starts at the bullet whose file list ends `, <id>)` and runs through any
 * following bullets that name no other task (one fragment may hold several bullets), stopping at
 * the next bullet naming a different task or at the next `## ` heading.
 */
export function changelogEntry(repo, id) {
  const fragment = join(repo, "changes", `${id}.md`);
  if (existsSync(fragment)) return readFileSync(fragment, "utf8");

  const logPath = join(repo, "CHANGELOG.md");
  if (!existsSync(logPath)) return "";
  const lines = readFileSync(logPath, "utf8").split("\n");
  const marker = new RegExp(`,\\s+${id.replace(/[-]/g, "\\-")}\\)`);

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("- **")) {
      // the file list can wrap onto the bullet's next lines, so look ahead within this bullet
      let j = i;
      let bullet = lines[i];
      while (j + 1 < lines.length && !lines[j + 1].startsWith("- **") && !lines[j + 1].startsWith("## ")) {
        j++;
        bullet += "\n" + lines[j];
        if (lines[j].trim() === "") break;
      }
      if (marker.test(bullet)) { start = i; break; }
    }
  }
  if (start === -1) return "";

  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) break;
    if (line.startsWith("- **")) {
      // a new bullet: part of this entry only if its opening paragraph names no other task
      let para = line;
      for (let k = i + 1; k < lines.length && lines[k].trim() !== "" && !lines[k].startsWith("- **"); k++) {
        para += "\n" + lines[k];
      }
      const m = para.match(OTHER_TASK);
      if (m && m[1] !== id) break;
    }
    out.push(line);
  }
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n") + "\n";
}
