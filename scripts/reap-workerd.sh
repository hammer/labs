#!/usr/bin/env bash
# Kill workerd processes this repo's dev server left behind.
#
# Why this is needed: @astrojs/cloudflare starts a `workerd` child per dev
# server and cleans it up from an exit handler. SIGTERM therefore works fine —
# the child dies with its parent. SIGKILL does not: the handler never runs,
# workerd has no parent-death watch, and the orphan is reparented to init and
# lives forever holding ~60-70MB. Measured 2026-10-07:
#
#   kill -TERM <astro dev>  ->  workerd exits          (clean)
#   kill -9    <astro dev>  ->  workerd ppid becomes 1 (leaked)
#
# Anything that SIGKILLs the dev server leaks one: a supervisor restart, the
# OOM killer, or a hand-typed `kill -9`. On this VM 49 of them had accumulated
# over ~64 days alongside 12 abandoned dev servers, together holding enough
# memory that a Playwright suite could no longer run.
#
# Wired to `npm run dev` via the `predev` script, so each dev start clears
# whatever the last one stranded. That bounds the leak at one orphan rather
# than letting it grow without limit.
#
# Safety: only processes that are BOTH orphaned (ppid 1) AND running from this
# repo's node_modules are touched. A workerd with a live parent is a working
# dev server and is never killed, including one belonging to another checkout.

set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
marker="$root/node_modules"

killed=0
while read -r pid ppid; do
  [ -n "${pid:-}" ] || continue
  kill -9 "$pid" 2>/dev/null && killed=$((killed + 1))
done < <(ps -eo pid=,ppid=,args= \
  | awk -v m="$marker" '$2 == 1 && index($0, m) && index($0, "workerd") { print $1, $2 }')

if [ "$killed" -gt 0 ]; then
  echo "reap-workerd: cleaned up $killed orphaned workerd process(es)"
fi
exit 0
