/**
 * Fetch AA Openness Index scores and write them into output YAMLs.
 *
 * Strategy: AA's openness leaderboard page exposes the full dataset (314
 * records as of Aug 2026) via its React Server Component when fetched with the
 * RSC header. Since ~Aug 2026 the bulk `models` array carries only `id` (uuid)
 * + `name` + `opennessIndex` — no `slug` — so we join on the uuid against the
 * Intelligence leaderboard RSC payload (the same source fetch-aa-intelligence
 * parses), whose records carry both `id` and `slug`. The openness page's own
 * `initialModels` chart subset (id + slug) is merged in as a second id→slug
 * source. Pre-Aug-2026 payloads split on `{"additional_text"` and had slugs
 * inline; that shape is no longer served.
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

const LEADERBOARD_URL = 'https://artificialanalysis.ai/leaderboards/models';
const UUID = '[0-9a-f-]{36}';

async function fetchRsc(url: string, ua: string): Promise<string> {
  const res = await fetch(url, { headers: { RSC: '1', 'User-Agent': ua } });
  if (!res.ok) throw new Error(`AA fetch failed: ${res.status} ${url}`);
  return res.text();
}

// id → slug from every model record that carries both keys. Two record shapes
// occur: `{"id":uuid,"name":...,"shortName":...,"slug":...}` (Intelligence
// leaderboard) and `{"id":uuid,"slug":...,"name":...,"shortName":...}` (the
// openness page's initialModels). Both are split on an id+…+shortName sentinel
// so nested creator objects (`{"id":uuid,"slug":"kimi","name":"Kimi","color"`)
// never masquerade as model records.
function collectIdToSlug(body: string, into: Map<string, string>): void {
  const sentinel = new RegExp(`(?=\\{"id":"${UUID}",(?:"name":"[^"]*",|"slug":"[^"]+","name":"[^"]*",)"shortName")`);
  for (const r of body.split(sentinel)) {
    const id = r.match(new RegExp(`^\\{"id":"(${UUID})"`))?.[1];
    const slug = r.match(/"slug":"([^"]+)"/)?.[1];
    if (id && slug && !into.has(id)) into.set(id, slug);
  }
}

async function fetchAaoiDataset(): Promise<Map<string, number>> {
  const ua = 'labindex-aaoi-sync/1.0 (https://labindex.ai)';
  const [oiBody, lbBody] = await Promise.all([fetchRsc(AAOI_URL, ua), fetchRsc(LEADERBOARD_URL, ua)]);

  const idToSlug = new Map<string, string>();
  collectIdToSlug(lbBody, idToSlug);
  collectIdToSlug(oiBody, idToSlug);
  if (idToSlug.size < 300) throw new Error(`Only ${idToSlug.size} id→slug pairs parsed — leaderboard sentinel likely drifted, refusing to write`);

  // Bulk openness records (verified Aug 2026): {"id":uuid,"name":"…","creator":{…},"opennessIndex":N,…}
  const map = new Map<string, number>();
  let unmapped = 0;
  const rec = new RegExp(`\\{"id":"(${UUID})","name":"[^"]*","creator":\\{[^{}]*\\},"opennessIndex":([\\d.]+)`, 'g');
  for (const m of oiBody.matchAll(rec)) {
    const slug = idToSlug.get(m[1]);
    if (!slug) { unmapped++; continue; }
    if (!map.has(slug)) map.set(slug, Math.round(parseFloat(m[2]) * 10) / 10);
  }
  if (unmapped > 0) console.log(`  ${unmapped} openness record(s) had no id→slug mapping (not on the Intelligence leaderboard payload)`);
  if (map.size < 200) throw new Error(`Parsed only ${map.size} openness records — AAOI payload shape likely drifted, refusing to write`);
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
  let noAaoiMatchUnset = 0;     // version-drift, openness genuinely unset
  let noAaoiMatchInferred = 0;  // version-drift, family-inference fallback applied
  const missing: Array<{ file: string; slug: string }> = [];

  for (const file of yamls) {
    const content = readFileSync(file, 'utf-8');
    if (!/^\s+intelligence_index:/m.test(content)) continue;

    const m = content.match(/artificialanalysis\.ai\/models\/([a-zA-Z0-9._-]+)/);
    if (!m) { noAaUrl++; continue; }
    const aaSlug = m[1];

    const aaoi = aaoiMap.get(aaSlug);
    if (aaoi === undefined) {
      // No direct AAOI match for this slug. Distinguish entries that have a
      // family-inferred value (audit-trail-tagged with "(family inference)")
      // from entries that are genuinely unset and need manual attention.
      if (/openness_index_version:\s*"[^"]*\(family inference\)"/m.test(content)) {
        noAaoiMatchInferred++;
      } else {
        noAaoiMatchUnset++;
        missing.push({ file, slug: aaSlug });
      }
      continue;
    }

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
  console.log(`  Slug not in AAOI v1.0, family-inferred fallback applied: ${noAaoiMatchInferred}`);
  console.log(`  Slug not in AAOI v1.0, openness unset (needs attention): ${noAaoiMatchUnset}`);
  if (noAaoiMatchUnset > 0) {
    console.log('');
    console.log('Entries that need manual attention (AAII URL present but openness unset):');
    for (const m of missing.slice(0, 30)) console.log(`  ${m.slug.padEnd(40)}  ${m.file}`);
    if (missing.length > 30) console.log(`  ... and ${missing.length - 30} more`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
