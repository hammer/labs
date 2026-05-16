/**
 * Fetch AA Openness Index scores and write them into output YAMLs.
 *
 * Strategy: AA's openness leaderboard page exposes the full 234-record dataset
 * via its React Server Component when fetched with the RSC header. One request
 * returns all entries; we parse by splitting on the per-record sentinel
 * `{"additional_text"` and extracting `slug` + `opennessIndex` from each chunk.
 *
 * For each labindex output that has an `artificialanalysis.ai/models/<slug>`
 * URL in its sources, we look up the slug in AA's dataset and write
 * `openness_index` (rounded to one decimal) + `openness_index_version: "AA Openness Index v1.0"`
 * onto the model entry (or sub-output, for grouped outputs).
 *
 * Usage:
 *   npm run fetch-aa-openness
 *   npm run fetch-aa-openness -- --dry-run    # report changes without writing
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const AAOI_URL = 'https://artificialanalysis.ai/evaluations/artificial-analysis-openness-index';
const AAOI_VERSION = 'AA Openness Index v1.0';
const dryRun = process.argv.includes('--dry-run');

// ── Fetch the RSC payload ────────────────────────────────────────────────

async function fetchAaoiDataset(): Promise<Map<string, number>> {
  const res = await fetch(AAOI_URL, {
    headers: { RSC: '1', 'User-Agent': 'labindex-aaoi-sync/1.0 (https://labindex.ai)' },
  });
  if (!res.ok) throw new Error(`AAOI fetch failed: ${res.status}`);
  const body = await res.text();

  // Each record begins with `{"additional_text"` (verified May 2026).
  const records = body.split(/(?=\{"additional_text")/).filter(r => r.includes('"openness"'));
  const map = new Map<string, number>();
  for (const r of records) {
    const slugMatch = r.match(/"slug"\s*:\s*"([^"]+)"/);
    const aaoiMatch = r.match(/"opennessIndex"\s*:\s*([\d.]+)/);
    if (slugMatch && aaoiMatch) {
      map.set(slugMatch[1], Math.round(parseFloat(aaoiMatch[1]) * 10) / 10);
    }
  }
  return map;
}

// ── YAML mutation ────────────────────────────────────────────────────────

// We do regex-based edits rather than YAML round-trip so we preserve the
// existing file formatting (comments, key order, anchors). The model:
// block always exists when intelligence_index does, so we just insert
// openness_index right after intelligence_index_version (if present) or
// intelligence_index.

function applyOpennessToYaml(content: string, aaoi: number): string {
  const versionLine = `  openness_index_version: "${AAOI_VERSION}"`;
  const scoreLine = `  openness_index: ${aaoi}`;

  // If openness_index already present, update it in place.
  if (/^\s+openness_index:/m.test(content)) {
    let out = content.replace(/^(\s+)openness_index:\s*[\d.]+/m, `$1openness_index: ${aaoi}`);
    if (/^\s+openness_index_version:/m.test(out)) {
      out = out.replace(/^(\s+)openness_index_version:\s*[^\n]+/m, `$1openness_index_version: "${AAOI_VERSION}"`);
    } else {
      out = out.replace(/^(\s+)openness_index:\s*[\d.]+/m, `$1openness_index: ${aaoi}\n$1openness_index_version: "${AAOI_VERSION}"`);
    }
    return out;
  }

  // Otherwise insert after intelligence_index_version, or intelligence_index.
  const afterVersion = /^(\s+)intelligence_index_version:\s*[^\n]+\n/m;
  if (afterVersion.test(content)) {
    return content.replace(afterVersion, (match, indent) =>
      `${match}${indent}openness_index: ${aaoi}\n${indent}openness_index_version: "${AAOI_VERSION}"\n`,
    );
  }
  const afterIntel = /^(\s+)intelligence_index:\s*[\d.]+\n/m;
  if (afterIntel.test(content)) {
    return content.replace(afterIntel, (match, indent) =>
      `${match}${indent}openness_index: ${aaoi}\n${indent}openness_index_version: "${AAOI_VERSION}"\n`,
    );
  }
  return content;
}

// ── Drive ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching ${AAOI_URL} ...`);
  const aaoiMap = await fetchAaoiDataset();
  console.log(`  Parsed ${aaoiMap.size} model→AAOI pairs from AA dataset`);

  const yamls = globSync('data/outputs/*/*.yaml').sort();
  let updated = 0;
  let unchanged = 0;
  let noAaUrl = 0;
  let noAaoiMatch = 0;
  const missing: Array<{ file: string; slug: string }> = [];

  for (const file of yamls) {
    const content = readFileSync(file, 'utf-8');
    if (!/^\s+intelligence_index:/m.test(content)) continue;

    const m = content.match(/artificialanalysis\.ai\/models\/([a-zA-Z0-9._-]+)/);
    if (!m) { noAaUrl++; continue; }
    const aaSlug = m[1];

    const aaoi = aaoiMap.get(aaSlug);
    if (aaoi === undefined) { noAaoiMatch++; missing.push({ file, slug: aaSlug }); continue; }

    const next = applyOpennessToYaml(content, aaoi);
    if (next === content) { unchanged++; continue; }
    if (!dryRun) writeFileSync(file, next);
    updated++;
    console.log(`  ✓ ${file}  →  AAOI ${aaoi}  (slug: ${aaSlug})`);
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Updated:        ${updated}${dryRun ? ' (dry-run — no writes)' : ''}`);
  console.log(`  Unchanged:      ${unchanged}`);
  console.log(`  No AA URL:      ${noAaUrl}`);
  console.log(`  AA URL present, slug not in AAOI v1.0: ${noAaoiMatch}`);
  if (noAaoiMatch > 0) {
    console.log('');
    console.log('Slugs that need manual attention (in AAII URL but not in AAOI):');
    for (const m of missing.slice(0, 30)) console.log(`  ${m.slug.padEnd(40)}  ${m.file}`);
    if (missing.length > 30) console.log(`  ... and ${missing.length - 30} more`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
