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
 * set the current `intelligence_index_version`. This both version-tags
 * pre-versioning entries and refreshes drifted scores after AA point
 * releases (e.g. v4.0.4). It does NOT add scores to outputs that have none —
 * picking the right variant/mode to anchor is a curation decision.
 *
 * Slugs with an AA URL but no leaderboard entry are listed for manual
 * attention (renamed slugs, models retired from the index).
 *
 * --discover inverts the question: which tracked model outputs (no AA URL
 * anywhere in the file) now match an unclaimed leaderboard slug? AA's pickup
 * often lags a release by weeks-to-months, so filing-day "AA hasn't scored
 * it" goes stale silently — Solar Open 100B and Solar Pro 3 sat scored-but-
 * unimported for ~6 months until the 2026-07 from-scratch audit. Run this
 * every sweep; it only reports (anchoring stays a curation decision).
 *
 * --audit-modes checks every existing anchor against AA's mode siblings of the
 * SAME checkpoint (…-thinking, …-reasoning, …-non-reasoning, …-xhigh/high/
 * medium/low, …-adaptive, …-max) and reports anchors whose linked page scores
 * below another mode — a violation of the highest-mode anchoring rule. Found
 * five on 2026-09-08 (Claude 4, Claude 4.5 Opus, GLM-4.6, EXAONE 4.0, Qwen3.5)
 * that had sat on a lower mode through three recalibrations. High-recall: a
 * mode-looking suffix can also name a distinct release (kimi-k2-thinking is
 * the Nov-2025 Kimi K2 Thinking, not a mode of kimi-k2) — verify each hit.
 * Siblings within 1.0 raw point are ignored (AA's own CI is under ±1%; effort
 * levels of one model routinely swap places by a few tenths between syncs and
 * re-anchoring on that would churn the history trail for nothing).
 *
 * Usage:
 *   npm run fetch-aa-intelligence
 *   npm run fetch-aa-intelligence -- --dry-run
 *   npm run fetch-aa-intelligence -- --discover
 *   npm run fetch-aa-intelligence -- --audit-modes
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const LEADERBOARD_URL = 'https://artificialanalysis.ai/leaderboards/models';
const AAII_VERSION = 'AA v4.3';
const TODAY = new Date().toISOString().slice(0, 10);
const dryRun = process.argv.includes('--dry-run');
const discover = process.argv.includes('--discover');
const auditModes = process.argv.includes('--audit-modes');

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
  // Sentinel (2026-09-11): records now open with {"slug":"…","shortName"; the
  // pre-Sep-2026 shape opened with {"id":uuid,"name":…,"shortName". Accept both.
  const records = body.split(/(?=\{"slug":"[^"]+","shortName"|\{"id":"[0-9a-f-]{36}","name":"[^"]*","shortName")/);
  const map = new Map<string, number>();
  for (const r of records) {
    const slug = r.match(/"slug":"([^"]+)"/)?.[1];
    const ii = r.match(/"intelligenceIndex":([\d.]+)/)?.[1];
    if (slug && ii && !map.has(slug)) map.set(slug, parseFloat(ii));
  }
  // CAP WARNING: this leaderboard payload is paginated — it carries only the
  // top ~500 models. Low-ranked models AA *does* score (e.g. olmo-3-1-32b-think
  // = 8) are simply absent here, so a "not on leaderboard" slug does NOT mean
  // "unscored." The per-model page DOES show the composite but stores it in a
  // snake_case schema with no `intelligence_index` key (it's computed
  // client-side), so it can't be scraped the same way — verify those by eye
  // on https://artificialanalysis.ai/models/<slug> (the "X (estimated)" figure).
  if (map.size < 300) throw new Error(`Parsed only ${map.size} scored records — sentinel likely drifted, refusing to write`);
  return map;
}

// ── YAML mutation ────────────────────────────────────────────────────────

// Regex-based edits preserve existing file formatting. Every file has at
// most one intelligence_index occurrence (validated assumption — multi-score
// grouped files don't exist today and would need per-unit anchoring).
//
// When the rounded score changes value, the superseded reading is prepended
// to `intelligence_index_history` (newest first) as `{score, version, until}`
// with `until` = today — the date we observed the replacement. A version-only
// re-tag across a POINT release (v4.1 → v4.1.1, same score) does NOT append a
// trail entry: nothing was superseded, so recording it would be noise. A
// RECALIBRATION (different major.minor index version, e.g. v4.1.1 → v4.2,
// which swaps evals and re-anchors grading) DOES append even when the rounded
// number coincides: the old reading was measured on a different eval mix, so
// it is a genuinely superseded observation and the trail must keep it.

function applyIntelToYaml(content: string, score: number): string {
  const idx = content.match(/^(\s+)intelligence_index:\s*([\d.]+)/m);
  if (!idx) return content; // caller guards; defensive
  const indent = idx[1];
  const oldScore = parseFloat(idx[2]);
  const oldVersion = content.match(/^\s+intelligence_index_version:\s*"?([^"\n]+?)"?\s*$/m)?.[1];
  const scoreChanged = Math.round(oldScore) !== score;
  // major.minor of the index version ("AA v4.1.1" → "4.1"); undefined for
  // untagged or non-numeric tags (pre-v4 / delisted markers).
  const minor = (v?: string) => v?.match(/v(\d+\.\d+)/)?.[1];
  const recalibrated = minor(oldVersion) !== undefined && minor(oldVersion) !== minor(AAII_VERSION);

  let out = content.replace(/^(\s+)intelligence_index:\s*[\d.]+/m, `$1intelligence_index: ${score}`);
  if (/^\s+intelligence_index_version:/m.test(out)) {
    out = out.replace(/^(\s+)intelligence_index_version:\s*[^\n]+/m, `$1intelligence_index_version: "${AAII_VERSION}"`);
  } else {
    out = out.replace(/^(\s+)intelligence_index:\s*[\d.]+/m, `$1intelligence_index: ${score}\n$1intelligence_index_version: "${AAII_VERSION}"`);
  }

  if (scoreChanged || recalibrated) {
    const entry =
      `${indent}  - score: ${oldScore}\n` +
      (oldVersion ? `${indent}    version: "${oldVersion}"\n` : '') +
      `${indent}    until: "${TODAY}"`;
    if (/^\s+intelligence_index_history:[ \t]*$/m.test(out)) {
      // Prepend as the first list item under the existing history key.
      out = out.replace(/^(\s+)intelligence_index_history:[ \t]*\n/m, `$1intelligence_index_history:\n${entry}\n`);
    } else {
      // Create the history block immediately after the version line.
      out = out.replace(/^(\s+)intelligence_index_version:\s*"[^"]*"[ \t]*$/m, `$&\n${indent}intelligence_index_history:\n${entry}`);
    }
  }
  return out;
}

// ── Discover mode ────────────────────────────────────────────────────────

// AA slugs append mode/variant suffixes (solar-open-100b-reasoning) and use
// dashes where our slugs may use dots (minimax-m2.5 vs minimax-m2-5), so
// match on normalized exact-or-dash-prefix. Prefix matching needs ≥4 chars
// to keep short slugs (o1, kat) from spraying false positives.
function slugsMatch(outputSlug: string, aaSlug: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[._]/g, '-');
  const a = norm(outputSlug);
  const b = norm(aaSlug);
  if (a === b) return true;
  if (a.length < 4) return false;
  return b.startsWith(a + '-') || a.startsWith(b + '-');
}

function discoverMode(aaii: Map<string, number>) {
  const yamls = globSync('data/outputs/*/*.yaml').sort();
  const claimed = new Set<string>();
  const candidates: Array<{ file: string; slug: string }> = [];
  for (const file of yamls) {
    const content = readFileSync(file, 'utf-8');
    for (const m of content.matchAll(/artificialanalysis\.ai\/models\/([a-zA-Z0-9._-]+)/g)) {
      claimed.add(m[1]);
    }
    if (/artificialanalysis\.ai\/models\//.test(content)) continue;
    if (!/(^|\n)\s*model:/.test(content)) continue;
    const slug = content.match(/^slug:\s*([a-z0-9._-]+)/m)?.[1];
    if (slug) candidates.push({ file, slug });
  }

  const hits: Array<{ file: string; aaSlug: string; score: number }> = [];
  let unclaimed = 0;
  for (const [aaSlug, score] of aaii) {
    if (claimed.has(aaSlug)) continue;
    unclaimed++;
    for (const c of candidates) {
      if (slugsMatch(c.slug, aaSlug)) hits.push({ file: c.file, aaSlug, score });
    }
  }

  console.log('');
  console.log(`Discover: ${candidates.length} tracked model outputs without an AA URL,`);
  console.log(`${unclaimed} leaderboard slugs unclaimed by any tracked output.`);
  if (hits.length === 0) {
    console.log('No slug matches — no evident AA pickups to backfill.');
  } else {
    console.log(`${hits.length} probable AA pickup(s) — verify each page, then anchor per the`);
    console.log('add-output skill (AA URL in sources + score + version + provenance check):');
    for (const h of hits.sort((x, y) => y.score - x.score)) {
      console.log(`  ${String(Math.round(h.score)).padStart(3)}  ${h.aaSlug.padEnd(40)}  ${h.file}`);
    }
  }
  console.log('');
  console.log('Note: the payload holds only the top ~500 models; a missing slug does not');
  console.log('mean unscored. New models AA scores under names unlike our slugs will not');
  console.log('match — eyeball the unclaimed list during sweeps if coverage looks off.');
}

// ── Mode-sibling audit ───────────────────────────────────────────────────

// Tokens AA appends to a checkpoint's slug to name a reasoning mode or effort
// level. A slug whose trailing tokens are ALL from this set is a mode of the
// slug that remains once they are stripped (the "root"). Anything else in the
// suffix — a date (0925), a size (mini), a checkpoint name (terminus, preview),
// a version digit (5-6-sol) — means a different model, not a mode, and is
// deliberately NOT treated as a sibling.
const MODE_GAP_MIN = 1.0; // raw points; below this a sibling is noise, not a mis-anchor
const MODE_TOKENS = new Set(['thinking', 'reasoning', 'non', 'adaptive', 'xhigh', 'high', 'medium', 'low', 'max', 'minimal', 'effort', 'fallback', 'default']);
function modeRoot(slug: string): string {
  const t = slug.split('-');
  while (t.length > 1 && MODE_TOKENS.has(t[t.length - 1])) t.pop();
  return t.join('-');
}

function auditModesMode(aaii: Map<string, number>) {
  const byRoot = new Map<string, Array<[string, number]>>();
  for (const [slug, v] of aaii) {
    const r = modeRoot(slug);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push([slug, v]);
  }
  const hits: Array<{ file: string; slug: string; own: number; better: Array<[string, number]> }> = [];
  let nearTies = 0;
  for (const file of globSync('data/outputs/*/*.yaml').sort()) {
    const content = readFileSync(file, 'utf-8');
    if (!/^\s+intelligence_index:/m.test(content)) continue;
    const slug = content.match(/artificialanalysis\.ai\/models\/([a-zA-Z0-9._-]+)/)?.[1];
    if (!slug || !aaii.has(slug)) continue;
    const ownRaw = aaii.get(slug)!;
    const own = Math.round(ownRaw);
    const sibs = (byRoot.get(modeRoot(slug)) ?? []).filter(([s]) => s !== slug);
    const better = sibs.filter(([, v]) => v - ownRaw >= MODE_GAP_MIN).sort((a, b) => b[1] - a[1]);
    if (better.length) hits.push({ file, slug, own, better });
    else if (sibs.some(([, v]) => Math.round(v) > own)) nearTies++;
  }
  console.log('');
  console.log(`Mode audit: ${hits.length} anchor(s) score below a mode sibling of the same checkpoint.`);
  if (hits.length) {
    console.log('Verify each on AA (a suffix can also be a distinct release), then re-anchor per');
    console.log('AGENTS.md: switch the AA URL, set the score, keep the old reading in the trail.');
    for (const h of hits.sort((a, b) => (b.better[0][1] - b.own) - (a.better[0][1] - a.own))) {
      console.log(`  ${h.file}`);
      console.log(`      anchor ${h.slug} = ${h.own}   higher: ${h.better.map(([s, v]) => `${s} = ${Math.round(v)}`).join(', ')}`);
    }
  }
  if (nearTies) console.log(`(${nearTies} anchor(s) have a sibling that rounds higher but sits within ${MODE_GAP_MIN} raw point — left alone as noise.)`);
}

// ── Drive ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching ${LEADERBOARD_URL} ...`);
  const aaii = await fetchAaiiDataset();
  console.log(`  Parsed ${aaii.size} model→AAII pairs from AA leaderboard`);

  if (discover) {
    discoverMode(aaii);
    return;
  }
  if (auditModes) {
    auditModesMode(aaii);
    return;
  }

  const yamls = globSync('data/outputs/*/*.yaml').sort();
  let rescored = 0;   // integer score changed → history entry appended
  let retagged = 0;   // version-only bump, same score
  let unchanged = 0;  // no write needed (already current)
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

    const newScore = Math.round(score);
    const oldScore = parseFloat(content.match(/^\s+intelligence_index:\s*([\d.]+)/m)![1]);
    const next = applyIntelToYaml(content, newScore);
    if (next === content) { unchanged++; continue; }
    if (!dryRun) writeFileSync(file, next);
    if (newScore !== oldScore) {
      rescored++;
      console.log(`  ✓ ${file}  ${oldScore} → ${newScore}  (slug: ${slug}, history +)`);
    } else {
      retagged++;
      if (/intelligence_index_history:\n\s+- score: [\d.]+\n\s+version: "[^"]*"\n\s+until: "\d{4}-\d{2}-\d{2}"/.test(next) && next !== content && !/history:\n/.test(content.split('intelligence_index_version')[1]?.split('\n')[1] ?? ''))
        console.log(`  = ${file}  ${oldScore} → ${newScore}  (slug: ${slug}, same score, recalibration → history +)`);
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Rescored (score moved, history appended): ${rescored}${dryRun ? ' (dry-run — no writes)' : ''}`);
  console.log(`  Re-tagged (version bump, same score):     ${retagged}`);
  console.log(`  Unchanged:                                ${unchanged}`);
  console.log(`  Slug not in top-~500 leaderboard payload — VERIFY each by eye at`);
  console.log(`  artificialanalysis.ai/models/<slug> (may be a low-ranked but still-scored`);
  console.log(`  model, a renamed slug, or genuinely unscored): ${missing.length}`);
  for (const x of missing) console.log(`    ${x.slug.padEnd(40)}  ${x.file}`);
}

main().catch(e => { console.error(e); process.exit(1); });
