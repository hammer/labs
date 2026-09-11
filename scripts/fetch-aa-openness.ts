/**
 * Fetch AA Openness Index scores and write them into output YAMLs.
 *
 * Strategy: AA's openness leaderboard page exposes the full dataset (319
 * records as of Sep 2026) via its React Server Component when fetched with the
 * RSC header. The bulk records carry {id, name, opennessIndex} — no slug — and
 * since Sep 2026 the Intelligence leaderboard payload carries no model ids
 * either, so the join is on the full variant NAME: the Intelligence page's
 * secondary {"slug","name"} component maps that name to the slug our YAMLs
 * link. (Aug-2026 payloads joined on uuid; pre-Aug ones had slugs inline.)
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

// Join key (2026-09-11 payload shapes):
//   • Openness bulk records open with {"id":uuid,"name":"<full variant name>",…}
//     and carry "opennessIndex" but no slug.
//   • The Intelligence leaderboard payload no longer carries model ids at all —
//     its main records open with {"slug":…,"shortName":…} — but a second
//     component on the same page lists every model as {"slug":…,"name":…}
//     with the SAME full variant name the openness records use
//     ("DeepSeek V4 Pro 0813 (Reasoning, Max Effort)"). So the join is
//     openness.name → intelligence.name → slug. Verified 319/319 on 2026-09-11.
//   Pre-Sep-2026 shapes joined on uuid; that key is gone.
function collectNameToSlug(body: string, into: Map<string, string>): void {
  for (const m of body.matchAll(/\{"slug":"([^"]+)","name":"([^"]*)"/g)) {
    if (!into.has(m[2])) into.set(m[2], m[1]);
  }
}

async function fetchAaoiDataset(): Promise<Map<string, number>> {
  const ua = 'labindex-aaoi-sync/1.0 (https://labindex.ai)';
  const [oiBody, lbBody] = await Promise.all([fetchRsc(AAOI_URL, ua), fetchRsc(LEADERBOARD_URL, ua)]);

  const nameToSlug = new Map<string, string>();
  collectNameToSlug(lbBody, nameToSlug);
  collectNameToSlug(oiBody, nameToSlug);
  if (nameToSlug.size < 300) throw new Error(`Only ${nameToSlug.size} name→slug pairs parsed — leaderboard payload shape likely drifted, refusing to write`);

  // One span per openness record: from its {"id":uuid,"name":…} opener to the
  // next opener. Creator objects also open with id+name but hold no
  // opennessIndex, so they simply yield nothing.
  const map = new Map<string, number>();
  let unmapped = 0;
  const spans = oiBody.split(new RegExp(`(?=\\{"id":"${UUID}","name":"[^"]*")`));
  for (const s of spans) {
    const name = s.match(new RegExp(`^\\{"id":"${UUID}","name":"([^"]*)"`))?.[1];
    const v = s.match(/"opennessIndex":([\d.]+)/)?.[1];
    if (!name || !v) continue;
    const slug = nameToSlug.get(name);
    if (!slug) { unmapped++; console.log(`  ? no slug for openness record "${name}"`); continue; }
    if (!map.has(slug)) map.set(slug, Math.round(parseFloat(v) * 10) / 10);
  }
  if (unmapped > 0) console.log(`  ${unmapped} openness record(s) had no name→slug mapping`);
  if (map.size < 200) throw new Error(`Parsed only ${map.size} openness records — AAOI payload shape likely drifted, refusing to write`);
  return map;
}

// ── Mode siblings ────────────────────────────────────────────────────────

// Same checkpoint-root logic as fetch-aa-intelligence --audit-modes (kept
// self-contained like the other scripts): a slug whose trailing tokens are all
// mode/effort words is a mode of the slug that remains ("root"). AAOI is a
// property of the checkpoint (weights, license, disclosure), so every mode of
// one checkpoint must carry the same value. Two uses:
//   • FILL — the anchor slug has no openness record but a mode sibling does
//     (AA often files AAOI under the non-reasoning name while we anchor the
//     reasoning page). Written with a "(mode sibling: <slug>)" tag; unlike
//     "(family inference)" this is the same checkpoint, not a relative.
//   • AUDIT — the anchor and a sibling both have records but disagree, which
//     means AA scored them as different checkpoints or one of them is
//     mis-rooted; reported, never auto-resolved.
const MODE_TOKENS = new Set(['thinking', 'reasoning', 'non', 'adaptive', 'xhigh', 'high', 'medium', 'low', 'max', 'minimal', 'effort', 'fallback', 'default']);
function modeRoot(slug: string): string {
  const t = slug.split('-');
  while (t.length > 1 && MODE_TOKENS.has(t[t.length - 1])) t.pop();
  return t.join('-');
}

// ── YAML mutation ────────────────────────────────────────────────────────

// We do regex-based edits rather than YAML round-trip so we preserve the
// existing file formatting (comments, key order, anchors). The model:
// block always exists when intelligence_index does, so we just insert
// openness_index right after intelligence_index_version (if present) or
// intelligence_index.

function applyOpennessToYaml(content: string, aaoi: number, version: string = AAOI_VERSION): string {

  // If openness_index already present, update it in place.
  if (/^\s+openness_index:/m.test(content)) {
    let out = content.replace(/^(\s+)openness_index:\s*[\d.]+/m, `$1openness_index: ${aaoi}`);
    if (/^\s+openness_index_version:/m.test(out)) {
      out = out.replace(/^(\s+)openness_index_version:\s*[^\n]+/m, `$1openness_index_version: "${version}"`);
    } else {
      out = out.replace(/^(\s+)openness_index:\s*[\d.]+/m, `$1openness_index: ${aaoi}\n$1openness_index_version: "${version}"`);
    }
    return out;
  }

  // Otherwise insert after intelligence_index_version, or intelligence_index.
  const afterVersion = /^(\s+)intelligence_index_version:\s*[^\n]+\n/m;
  if (afterVersion.test(content)) {
    return content.replace(afterVersion, (match, indent) =>
      `${match}${indent}openness_index: ${aaoi}\n${indent}openness_index_version: "${version}"\n`,
    );
  }
  const afterIntel = /^(\s+)intelligence_index:\s*[\d.]+\n/m;
  if (afterIntel.test(content)) {
    return content.replace(afterIntel, (match, indent) =>
      `${match}${indent}openness_index: ${aaoi}\n${indent}openness_index_version: "${version}"\n`,
    );
  }
  return content;
}

// ── Drive ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching ${AAOI_URL} ...`);
  const aaoiMap = await fetchAaoiDataset();
  console.log(`  Parsed ${aaoiMap.size} model→AAOI pairs from AA dataset`);

  // checkpoint root → every scored mode of it
  const byRoot = new Map<string, Array<[string, number]>>();
  for (const [slug, v] of aaoiMap) { const r = modeRoot(slug); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r)!.push([slug, v]); }

  const yamls = globSync('data/outputs/*/*.yaml').sort();
  let updated = 0;
  let unchanged = 0;
  let noAaUrl = 0;
  let filledViaSibling = 0;
  const disagreements: string[] = [];
  let noAaoiMatchUnset = 0;     // version-drift, openness genuinely unset
  let noAaoiMatchInferred = 0;  // version-drift, family-inference fallback applied
  const missing: Array<{ file: string; slug: string }> = [];

  for (const file of yamls) {
    const content = readFileSync(file, 'utf-8');
    if (!/^\s+intelligence_index:/m.test(content)) continue;

    const m = content.match(/artificialanalysis\.ai\/models\/([a-zA-Z0-9._-]+)/);
    if (!m) { noAaUrl++; continue; }
    const aaSlug = m[1];

    let aaoi = aaoiMap.get(aaSlug);
    let version = AAOI_VERSION;
    const sibs = (byRoot.get(modeRoot(aaSlug)) ?? []).filter(([s]) => s !== aaSlug);
    if (aaoi !== undefined) {
      // AUDIT: modes of one checkpoint must agree.
      const off = sibs.filter(([, v]) => Math.abs(v - aaoi!) >= 0.1);
      if (off.length) disagreements.push(`${aaSlug} = ${aaoi}  vs  ${off.map(([s, v]) => `${s} = ${v}`).join(', ')}   (${file})`);
    } else if (sibs.length) {
      // FILL from a mode sibling of the same checkpoint — only when siblings agree.
      const vals = sibs.map(([, v]) => v);
      if (Math.max(...vals) - Math.min(...vals) < 0.1) {
        aaoi = sibs[0][1];
        version = `${AAOI_VERSION} (mode sibling: ${sibs[0][0]})`;
        filledViaSibling++;
      } else {
        disagreements.push(`${aaSlug} (no record)  siblings disagree: ${sibs.map(([s, v]) => `${s} = ${v}`).join(', ')}   (${file})`);
      }
    }
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

    const next = applyOpennessToYaml(content, aaoi, version);
    if (next === content) { unchanged++; continue; }
    if (!dryRun) writeFileSync(file, next);
    updated++;
    console.log(`  ✓ ${file}  →  AAOI ${aaoi}  (slug: ${aaSlug}${version !== AAOI_VERSION ? `, via ${version.match(/mode sibling: ([^)]+)/)?.[1]}` : ''})`);
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Updated:        ${updated}${dryRun ? ' (dry-run — no writes)' : ''}`);
  console.log(`  …of which filled from a mode sibling of the same checkpoint: ${filledViaSibling}`);
  console.log(`  Mode-sibling disagreements (same root, different AAOI — check by hand): ${disagreements.length}`);
  for (const d of disagreements) console.log(`    ! ${d}`);
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
