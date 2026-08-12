#!/usr/bin/env bash
# Flow canonical — housekeeping before going public.
#
#   bash flow-tidy.sh            # show what it would do, change nothing
#   bash flow-tidy.sh --apply    # do it
#
# Dry-run by default. Nothing is deleted — files move to _private/, which is gitignored,
# so anything wrongly retired is one `mv` from coming back.

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

REPO="${FLOW_REPO:-$HOME/Projects/flow}"
cd "$REPO" || { echo "!! can't cd to $REPO"; exit 1; }
rm -f .git/index.lock

say()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
act()  { if [ "$APPLY" -eq 1 ]; then printf '    \033[32mDO\033[0m   %s\n' "$1"; else printf '    would %s\n' "$1"; fi; }

mkdir -p _private

retire() {  # retire <path> <reason>
  [ -e "$1" ] || { printf '    (absent, skipping: %s)\n' "$1"; return; }
  act "retire $1 -> _private/    [$2]"
  if [ "$APPLY" -eq 1 ]; then
    git ls-files --error-unmatch "$1" >/dev/null 2>&1 && git rm -r --cached --quiet "$1"
    mv "$1" "_private/$(basename "$1")"
  fi
}

say "1. Spent artefacts (safe — superseded by docs that exist now)"
retire "project-template/FLOW-handoff.html" \
       "40KB, the largest tracked file; a pre-docs handoff artefact superseded by INIT.md + README"
retire "docs/adopting-flow-cutover.md" \
       "one-time Phase-1 cutover runbook; the repos it describes are already cut over, and repinning-a-consuming-repo.md covers the live case"

say "2. Completed plan (your call — history vs clutter)"
echo "    docs/flow-infra-propagation-plan.md — phases 0-4 are done. It reads as an open"
echo "    plan but is now a record. Options: leave it (it explains WHY the infra looks like"
echo "    this, which is genuinely useful publicly), or mark it Status: Completed at the top."
echo "    I'd leave it and add the status line — the reasoning is worth publishing."

say "3. Working files that shouldn't sit in the repo root"
for s in flow-catchup.sh flow-release.sh flow-publish.sh flow-finish.sh flow-tidy.sh; do
  if [ -e "$s" ] && [ "$s" != "flow-tidy.sh" ]; then
    act "move $s -> _private/    [one-off migration script, already gitignored]"
    [ "$APPLY" -eq 1 ] && mv "$s" "_private/$s"
  fi
done
echo "    (flow-tidy.sh left in place — move it yourself once you're done with it)"

if [ -d mnt ] && [ -z "$(ls -A mnt 2>/dev/null)" ]; then
  act "remove empty mnt/    [Cowork mount artefact, not yours]"
  [ "$APPLY" -eq 1 ] && rmdir mnt 2>/dev/null
elif [ -d mnt ]; then
  echo "    mnt/ is not empty — leaving it. It's gitignored; delete by hand if it's a mount stub."
fi

say "4. Adding the root README"
if [ -f README.md ]; then
  echo "    README.md exists — leaving it"
else
  echo "    README.md is MISSING. This is the page GitHub shows visitors."
  echo "    Write the delivered README.md to the repo root before publishing."
fi

say "5. What stays, and why"
cat <<'EOF'
    docs/landing.html, docs/flow-map.html, docs/blog-two-touchpoints.md
      -> site content. Keep; these become the public site.
    docs/flow-reusable-workflows.md, docs/flow-versioning-policy.md,
    docs/repinning-a-consuming-repo.md, docs/adr/*
      -> live reference. Keep.
    flow-validation/, flow-plugin/
      -> untracked already, still on disk. Leave; they're not published.
EOF

say "Summary"
if [ "$APPLY" -eq 1 ]; then
  echo "    Applied. Review and commit:"
  echo "        git status --short"
  echo "        git add -A && git commit -m 'chore: housekeeping + root README'"
else
  echo "    Dry run — nothing changed. Re-run with --apply to do it."
fi
echo "    Retired files live in _private/ (gitignored). Nothing was deleted."
