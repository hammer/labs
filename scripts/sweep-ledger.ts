/**
 * Enforce AGENTS.md step 8d: every candidate a sweep surfaces must reach a
 * terminal state, and a claim that something was filed must be true.
 *
 * The probes were never the weak link. Each one ends by printing candidates and
 * nothing makes a candidate reach a *disposition*, so an item can be surfaced,
 * judged new, written down and lost between triage and filing with no check
 * failing. On 2026-10-15 three open-weights releases went that way — NVIDIA's
 * Nemotron 3.5 Super VL and Bolt, and Liquid's LFM2.5-24B-A2B — and the sweep
 * reported itself complete. The user noticed, not the sweep.
 *
 * Two commands:
 *
 *   seed    Append candidates from probe output to the ledger as `flagged`.
 *           Reads arXiv ids and owner/name HuggingFace ids out of any text, so
 *           it accepts a sweep-authors log, a listing dump, or an ad-hoc probe's
 *           stdout without those probes needing to know the ledger exists.
 *   check   The gate. Fails when any row is still `flagged`, when a
 *           filed/attached row cannot be found in data/, or when a
 *           rejected/deferred row carries no reason.
 *
 * `check` is deliberately suspicious of the *claim*, not just the state. A row
 * marked `filed` whose identifier appears nowhere in data/ is the exact failure
 * this exists to catch, and it is indistinguishable from honest bookkeeping
 * unless something looks.
 *
 * Usage: npm run sweep-ledger -- seed <file...>     # or pipe to stdin
 *        npm run sweep-ledger -- set <id> <state> [reason...]
 *        npm run sweep-ledger -- check
 *        npm run sweep-ledger -- check --summary    # counts only, never fails
 *        LEDGER=path npm run sweep-ledger -- check  # override the path
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { glob } from 'glob';

export const STATES = ['flagged', 'filed', 'attached', 'rejected', 'deferred'] as const;
export type State = typeof STATES[number];
/** The two that assert an artifact now exists in data/, and so are verifiable. */
export const VERIFIABLE: State[] = ['filed', 'attached'];
/** The two that assert a judgment, and so must carry its reason. */
export const NEEDS_REASON: State[] = ['rejected', 'deferred'];

export interface Row { id: string; state: State; reason?: string; note?: string }

const LEDGER = process.env.LEDGER || '.sweep-ledger.json';

/**
 * Pull candidate identifiers out of arbitrary probe output.
 *
 * arXiv ids are unambiguous. HuggingFace ids are matched as `owner/name` with a
 * conservative owner pattern, because the looser forms also match every URL
 * path in a log. Anything a probe emits that this misses can be added by hand
 * with `set`; the point is that the common cases need no cooperation from the
 * probe.
 */
export function extractIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/\b(\d{4}\.\d{4,5})\b/g)) ids.add(m[1]);
  for (const m of text.matchAll(/\b([A-Za-z0-9][\w.-]{1,38})\/([\w.-]{2,60})\b/g)) {
    // Skip paths that are plainly not model ids.
    if (/^(https?|www|data|scripts|tests|src|node_modules|public)$/i.test(m[1])) continue;
    if (/\.(ts|js|mjs|yaml|yml|json|md|html|png|txt|log|py)$/i.test(m[2])) continue;
    // Both halves numeric is a ratio, not an id. Probe logs are full of them —
    // sweep-authors alone prints "...500/538 probed" every 25 authors, and the
    // first live run seeded 21 of those as candidates.
    if (/^\d+$/.test(m[1]) && /^\d+$/.test(m[2])) continue;
    // An owner must contain a letter; a bare number never names one.
    if (!/[A-Za-z]/.test(m[1])) continue;
    ids.add(`${m[1]}/${m[2]}`);
  }
  return [...ids];
}

/**
 * Does this identifier appear anywhere in data/?
 *
 * Substring, not exact: an arXiv id shows up bare or inside a URL, and a
 * HuggingFace id usually appears as its full path in a source URL but sometimes
 * only as the repo name in prose. Matching the last path segment as a fallback
 * trades a little precision for not failing an honest filing — a false "yes"
 * here only loosens the gate for one row, while a false "no" would block a
 * sweep that did everything right.
 */
export function appearsInData(id: string, corpus: string): boolean {
  if (corpus.includes(id)) return true;
  const leaf = id.split('/').pop();
  return !!leaf && leaf.length >= 6 && corpus.includes(leaf);
}

/** The gate's verdict for one row. `null` means the row is fine. */
export function violation(row: Row, corpus: string): string | null {
  if (!STATES.includes(row.state)) return `unknown state '${row.state}'`;
  if (row.state === 'flagged') return 'still flagged — give it a terminal state';
  if (NEEDS_REASON.includes(row.state) && !row.reason?.trim()) {
    return `${row.state} with no reason`;
  }
  if (VERIFIABLE.includes(row.state) && !appearsInData(row.id, corpus)) {
    return `marked ${row.state} but not found anywhere in data/`;
  }
  return null;
}

function load(): Row[] {
  if (!existsSync(LEDGER)) return [];
  try {
    const rows = JSON.parse(readFileSync(LEDGER, 'utf-8'));
    return Array.isArray(rows) ? rows : [];
  } catch {
    console.error(`${LEDGER} is not readable JSON — fix or delete it.`);
    process.exit(2);
  }
}

const save = (rows: Row[]) => writeFileSync(LEDGER, `${JSON.stringify(rows, null, 2)}\n`);

async function dataCorpus(): Promise<string> {
  const files = await glob('data/**/*.yaml');
  return files.map((f) => readFileSync(f, 'utf-8')).join('\n');
}

function readInputs(args: string[]): string {
  if (args.length) return args.map((f) => readFileSync(f, 'utf-8')).join('\n');
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const rows = load();

  if (cmd === 'seed') {
    const text = readInputs(rest.filter((a) => !a.startsWith('--')));
    if (!text.trim()) {
      console.error('seed: nothing on stdin and no files given'); process.exitCode = 2; return;
    }
    const known = new Set(rows.map((r) => r.id));
    const added = extractIds(text).filter((id) => !known.has(id));
    rows.push(...added.map((id): Row => ({ id, state: 'flagged' })));
    save(rows);
    console.log(`seeded ${added.length} new candidate(s); ledger holds ${rows.length}`);
    if (added.length) console.log('All are `flagged`. `check` fails until each has a disposition.');
    return;
  }

  if (cmd === 'set') {
    const [id, state, ...reason] = rest;
    if (!id || !STATES.includes(state as State)) {
      console.error(`set: usage — set <id> <${STATES.join('|')}> [reason...]`);
      process.exitCode = 2; return;
    }
    const row = rows.find((r) => r.id === id);
    if (!row) { console.error(`set: ${id} is not in the ledger`); process.exitCode = 2; return; }
    row.state = state as State;
    if (reason.length) row.reason = reason.join(' ');
    save(rows);
    console.log(`${id} -> ${state}${row.reason ? ` (${row.reason})` : ''}`);
    return;
  }

  if (cmd === 'check') {
    if (!rows.length) {
      console.log(`${LEDGER} is empty or absent — nothing to check.`);
      console.log('Seed it from each probe\'s output so a dropped candidate cannot pass as a clean sweep.');
      return;
    }
    const corpus = await dataCorpus();
    const counts: Record<string, number> = {};
    const bad: [Row, string][] = [];
    for (const row of rows) {
      counts[row.state] = (counts[row.state] ?? 0) + 1;
      const v = violation(row, corpus);
      if (v) bad.push([row, v]);
    }
    console.log(`${rows.length} candidate(s): ` +
      STATES.map((s) => `${counts[s] ?? 0} ${s}`).join(', '));
    if (rest.includes('--summary')) return;
    if (!bad.length) { console.log('✅ every candidate reached a terminal state.'); return; }
    console.log('');
    for (const [row, why] of bad) console.log(`  ✗ ${row.id.padEnd(44)} ${why}`);
    console.log('\nA sweep is not finished while any candidate is unresolved. Resolve each with');
    console.log('  npm run sweep-ledger -- set <id> <filed|attached|rejected|deferred> [reason]');
    process.exitCode = 1;
    return;
  }

  console.error('usage: sweep-ledger <seed|set|check> …  (see the header of this file)');
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
