#!/usr/bin/env bash
# Tech-report backfill probe (AGENTS.md sweep step 7).
#
# Work-list = flagship entries with no arXiv link anywhere in the file. For each:
#   1. HF README scan — every huggingface.co/<org>/<repo> the entry links; any
#      arXiv ID / report PDF the README now cites that the entry lacks is printed.
#      Catches family reports and late citation blocks (LongCat-Next, Trinity).
#   2. arXiv title search — export.arxiv.org (HTTPS; http 301s to an empty body)
#      for the entry's name, 2026+ results only. Catches late postings of
#      web-only papers (Scaling Monosemanticity → 2605.29358) and report drops
#      for untracked siblings (Qwen3.5-Omni TR surfaced from qwen3.5.yaml).
#
# Both lists are high-recall: papers that merely mention the model in their
# title (Claude Code studies, "Aquila" astronomy) and cited prior work show up.
# Read titles; attach only the entry's own report or a family report, per the
# add-output skill. Never re-file an existing entry.
#
# Usage: scripts/probe-tech-reports.sh [--since YYYY-MM-DD] [--no-arxiv]
#   --since limits the work-list to entries dated on/after the date (default: all)
#   --no-arxiv skips the slow title search (~3 s per entry, arXiv rate limit)
set -u
SINCE="0000-00-00"; ARXIV=1
while [ $# -gt 0 ]; do case "$1" in --since) SINCE="$2"; shift 2;; --no-arxiv) ARXIV=0; shift;; *) shift;; esac; done

WORK=$(mktemp)
for f in $(grep -L "arxiv" data/outputs/*/*.yaml | xargs grep -l "flagship: true"); do
  d=$(grep -m1 "^date:" "$f" | awk '{print $2}' | tr -d '"')
  [ "${d:-0000-00-00}" \< "$SINCE" ] || echo "$f" >> "$WORK"
done
echo "Work-list: $(wc -l < "$WORK") flagship entries without an arXiv link (since $SINCE)"

echo; echo "── HF README citations the entry lacks"
while read -r f; do
  for repo in $(grep -o "huggingface.co/[A-Za-z0-9_.-]*/[A-Za-z0-9_.-]*" "$f" | grep -v -E "huggingface.co/(blog|papers|datasets|collections|spaces)" | sed 's#huggingface.co/##' | sort -u | head -3); do
    r=$(curl -sL -m 20 "https://huggingface.co/$repo/raw/main/README.md")
    for h in $(echo "$r" | grep -o -i -E "arxiv\.org/(abs|pdf)/[0-9]{4}\.[0-9]{4,5}|https?://[^ )\"'>]*[Tt]ech(nical)?[_-]?[Rr]eport[^ )\"'>]*\.pdf" | sort -u | head -5); do
      key=$(echo "$h" | grep -o -E '[0-9]{4}\.[0-9]{4,5}|[A-Za-z0-9_-]+\.pdf' | head -1)
      grep -q -F "$key" "$f" || echo "  $f  [$repo]  $h"
    done
  done
done < "$WORK"

if [ "$ARXIV" = 1 ]; then
  echo; echo "── arXiv title matches (2026+) — read the title before attaching"
  while read -r f; do
    name=$(grep -m1 "^name:" "$f" | cut -c7- | sed 's/"//g; s/ (.*//; s/ \/.*//')
    [ -z "$name" ] && continue
    q=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote('ti:\"'+sys.argv[1]+'\"'))" "$name")
    curl -s -m 30 "https://export.arxiv.org/api/query?search_query=$q&max_results=6&sortBy=submittedDate&sortOrder=descending" | python3 -c "
import sys,re
x=sys.stdin.read()
for e in re.findall(r'<entry>(.*?)</entry>', x, re.S):
    t=re.sub(r'\s+',' ',re.search(r'<title>(.*?)</title>',e,re.S).group(1)).strip()
    i=re.search(r'<id>http://arxiv.org/abs/([^<]+)</id>',e).group(1)
    p=re.search(r'<published>([^<]+)</published>',e).group(1)[:10]
    if p>='2026-01-01': print(f'  $f  {i}  {p}  {t[:100]}')
"
    sleep 3
  done < "$WORK"
fi
rm -f "$WORK"
