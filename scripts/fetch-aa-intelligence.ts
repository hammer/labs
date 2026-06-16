/**
 * Sync AA Intelligence Index scores into output YAMLs.
 *
 * Strategy: AA's models leaderboard exposes ~500 full model records via its
 * React Server Component payload when fetched with the RSC header. One
 * request returns everything; records are split on the model-record sentinel
 * `{"id":"<uuid>","name":"...","shortName"` (creator objects lack shortName)
 * and we extract `slug` + `intelligenceIndex` from each.
 *
 * For each labindex output with an `artificialanalysis.ai/models/<slug>` URL
 * in its sources AND an existing `intelligence_index`, we update the score to
 * AA's current value (rounded to an integer, matching house convention) and
 * set `intelligence_index_version: "AA v4.0"`. This both version-tags
 * pre-versioning entries and refreshes drifted scores after AA point
 * releases (e.g. v4.0.4). It does NOT add scores to outputs that have none —
 * picking the right variant/mode to anchor is a curation decision.
 *
 * Slugs with an AA URL but no leaderboard entry are listed for manual
 * attention (renamed slugs, models retired from the index).
 *
 * Usage:
 *   npm run fetch-aa-intelligence
 *   npm run fetch-aa-intelligence -- --dry-run
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const LEADERBOARD_URL = 'https://artificialanalysis.ai/leaderboards/models';
const AAII_VERSION = 'AA v4.1';
const dryRun = process.argv.includes('--dry-run');

// ── Fetch the RSC payload ────────────────────────────────────────────────

async function fetchAaiiDataset(): Promise<Map<string, number>> {
  const res = await fetch(LEADERBOARD_URL, {
    headers: { RSC: '1', 'User-Agent': 'labindex-aaii-sync/1.0 (https://labindex.ai)' },
  });
  if (!res.ok) throw new Error(`AA leaderboard fetch failed: ${res.status}`);
  const body = await res.text();

  // Model-record sentinel (verified June 2026): id+name+shortName. Splitting
  // on bare {"id":uuid,"name" also matches nested creator objects and
  // misattributes slugs to neighboring records.
  const records = body.split(/(?=\{"id":"[0-9a-f-]{36}","name":"[^"]*","shortName")/);
  const map = new Map<string, number>();
  for (const r of records) {
    const slug = r.match(/"slug":"([^"]+)"/)?.[1];
    const ii = r.match(/"intelligenceIndex":([\d.]+)/)?.[1];
    if (slug && ii && !map.has(slug)) map.set(slug, parseFloat(ii));
  }
  if (map.size < 300) throw new Error(`Parsed only ${map.size} scored records — sentinel likely drifted, refusing to write`);
  return map;
}

// ── YAML mutation ────────────────────────────────────────────────────────

// Regex-based edits preserve existing file formatting. Every file has at
// most one intelligence_index occurrence (validated assumption — multi-score
// grouped files don't exist today and would need per-unit anchoring).

function applyIntelToYaml(content: string, score: number): string {
  let out = content.replace(/^(\s+)intelligence_index:\s*[\d.]+/m, `$1intelligence_index: ${score}`);
  if (/^\s+intelligence_index_version:/m.test(out)) {
    out = out.replace(/^(\s+)intelligence_index_version:\s*[^\n]+/m, `$1intelligence_index_version: "${AAII_VERSION}"`);
  } else {
    out = out.replace(/^(\s+)intelligence_index:\s*[\d.]+/m, `$1intelligence_index: ${score}\n$1intelligence_index_version: "${AAII_VERSION}"`);
  }
  return out;
}

// ── Drive ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching ${LEADERBOARD_URL} ...`);
  const aaii = await fetchAaiiDataset();
  console.log(`  Parsed ${aaii.size} model→AAII pairs from AA leaderboard`);

  const yamls = globSync('data/outputs/*/*.yaml').sort();
  let updated = 0;
  let unchanged = 0;
  const missing: Array<{ file: string; slug: string }> = [];

  for (const file of yamls) {
    const content = readFileSync(file, 'utf-8');
    if (!/^\s+intelligence_index:/m.test(content)) continue;
    const occurrences = content.match(/^\s+intelligence_index:/gm)!.length;
    if (occurrences > 1) {
      console.warn(`  ⚠ ${file}: ${occurrences} intelligence_index occurrences — skipping (needs per-unit anchoring)`);
      continue;
    }

    const m = content.match(/artificialanalysis\.ai\/models\/([a-zA-Z0-9._-]+)/);
    if (!m) { missing.push({ file, slug: '(no AA URL)' }); continue; }
    const slug = m[1];

    const score = aaii.get(slug);
    if (score === undefined) {
      missing.push({ file, slug });
      continue;
    }

    const next = applyIntelToYaml(content, Math.round(score));
    if (next === content) { unchanged++; continue; }
    if (!dryRun) writeFileSync(file, next);
    updated++;
    const old = content.match(/intelligence_index:\s*([\d.]+)/)?.[1];
    console.log(`  ✓ ${file}  ${old} → ${Math.round(score)}  (slug: ${slug})`);
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Updated:   ${updated}${dryRun ? ' (dry-run — no writes)' : ''}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Slug not on AA leaderboard (renamed or retired — manual attention): ${missing.length}`);
  for (const x of missing) console.log(`    ${x.slug.padEnd(40)}  ${x.file}`);
}

main().catch(e => { console.error(e); process.exit(1); });
