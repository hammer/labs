/**
 * Scan prose for AAII score mentions and classify them against current data.
 *
 * The AA sync (fetch-aa-intelligence) only rewrites structured fields; scores
 * quoted in descriptions, notes, variant notes, and lab blurbs rot silently
 * when AA rescores (the 2026-08-03 sweep found ~25 stale of 136 mentions).
 * This is the standing sweep tool that finds them.
 *
 * Each mention is classified:
 *   ✓ structured  — equals a structured intelligence_index in the same file
 *   ✓ tracked     — a tracked output is named in the surrounding context and
 *                   its structured score equals the mention (lab blurbs,
 *                   cross-references)
 *   ≈ aa-current  — equals the rounded live AA value of a slug related to
 *                   the file slug or the variant's own name (modes/siblings)
 *   ⏳ historical — context carries an explicit era marker (v3.0,
 *                   pre-recalibration, "at release", release-era, debuted)
 *   ✗ UNRESOLVED  — none of the above; verify by hand and either fix the
 *                   number or add an era marker
 *
 * News titles are not scanned: they are historical records of what an outlet
 * wrote and are never edited (sweep rule, AGENTS.md).
 *
 * Usage:
 *   npm run scan-aaii-mentions            # full report
 *   npm run scan-aaii-mentions -- --all   # also list ✓/≈/⏳ mentions
 */

import { readFileSync } from 'fs';
import { globSync } from 'glob';
import { parse } from 'yaml';

const LEADERBOARD_URL = 'https://artificialanalysis.ai/leaderboards/models';
const showAll = process.argv.includes('--all');

// Same RSC extraction as fetch-aa-intelligence (kept self-contained like the
// other scripts). Sentinel comment there applies here too.
async function fetchAaScores(): Promise<Map<string, number>> {
  const res = await fetch(LEADERBOARD_URL, {
    headers: { RSC: '1', 'User-Agent': 'labindex-aaii-sync/1.0 (https://labindex.ai)' },
  });
  if (!res.ok) throw new Error(`AA leaderboard fetch failed: ${res.status}`);
  const body = await res.text();
  const records = body.split(/(?=\{"id":"[0-9a-f-]{36}","name":"[^"]*","shortName")/);
  const map = new Map<string, number>();
  for (const r of records) {
    const slug = r.match(/"slug":"([^"]+)"/)?.[1];
    const ii = r.match(/"intelligenceIndex":([\d.]+)/)?.[1];
    if (slug && ii && !map.has(slug)) map.set(slug, parseFloat(ii));
  }
  if (map.size < 300) throw new Error(`Parsed only ${map.size} records — sentinel drifted?`);
  return map;
}

const PATTERNS = [
  /(?:AA )?Intelligence Index(?:\s*v4\.\d+)?[:\s]*(?:<\/?strong>)?\s*(?:<strong>)?(\d{1,2})\b/g,
  /AA(?:II)? [Ii]ndex(?:\s*v4\.\d+)?[:\s]*(?:<strong>)?(\d{1,2})\b/g,
  /\(AA(?: index)?:? (\d{1,2})\)/g,
  /AA [Ii]ntelligence[:\s]+(\d{1,2})\b/g,
  /AAII[:\s]+(\d{1,2})\b/g,
];

const HISTORICAL = /pre-recalibration|v3\.\d|release-era|at release|at launch|debuted|era claims|until \d{4}/i;

const norm = (s: string) => s.toLowerCase().replace(/[._\s]+/g, '-');
function slugRelated(fileSlug: string, aaSlug: string): boolean {
  const a = norm(fileSlug);
  const b = norm(aaSlug);
  if (a === b) return true;
  if (a.length < 4) return false;
  return b.startsWith(a + '-') || a.startsWith(b + '-');
}

interface Mention {
  file: string;
  field: string;
  n: number;
  ctx: string;
  cls: 'structured' | 'tracked' | 'aa-current' | 'historical' | 'UNRESOLVED';
  note?: string;
}

// (needle, score) for every tracked output/sub with a structured score —
// lets lab blurbs and cross-references resolve against our own data.
// Matching is on canonicalized text so "Grok 4.3" finds slug "grok-4.3".
const canon = (s: string) => s.toLowerCase().replace(/[-._]/g, ' ');
const needles: Array<{ needle: string; score: number; ref: string }> = [];
function addNeedle(name: string | undefined, score: number, ref: string) {
  if (name && name.length >= 4) needles.push({ needle: canon(name), score, ref });
}

async function main() {
  console.log(`Fetching ${LEADERBOARD_URL} ...`);
  const aa = await fetchAaScores();
  console.log(`  ${aa.size} scored slugs\n`);

  const mentions: Mention[] = [];

  function scan(file: string, fileSlug: string, field: string, text: unknown, own: number[]) {
    if (typeof text !== 'string') return;
    const seen = new Set<number>();
    for (const pat of PATTERNS) {
      for (const m of text.matchAll(pat)) {
        if (m.index === undefined || seen.has(m.index)) continue;
        seen.add(m.index);
        const n = parseInt(m[1], 10);
        const s = Math.max(0, m.index - 90);
        const ctx = text.slice(s, m.index + m[0].length + 70).replace(/\s+/g, ' ');
        let cls: Mention['cls'] = 'UNRESOLVED';
        let note: string | undefined;
        // Variant mentions can resolve via the variant's own name → AA slug.
        const variantName = field.startsWith('variant:') ? field.slice(8) : '';
        // Needle search uses a wider window than the display context so a
        // model named earlier in the sentence still anchors the number.
        const wide = canon(text.slice(Math.max(0, m.index - 250), m.index + m[0].length + 80));
        const tracked = needles.find((x) => wide.includes(x.needle) && x.score === n);
        if (own.includes(n)) {
          cls = 'structured';
        } else if (tracked) {
          cls = 'tracked';
          note = tracked.ref;
        } else {
          // A slug "relates" if it extends the file slug or the variant's own
          // name — or if the slug (less trailing mode tokens) is literally
          // named in the surrounding text ("Claude Sonnet 4.6" ⊃
          // claude-sonnet-4-6-adaptive minus "adaptive").
          const namedInText = (slug: string) => {
            const toks = canon(slug).split(' ');
            for (let drop = 0; drop <= 2 && toks.length - drop >= 3; drop++) {
              const frag = toks.slice(0, toks.length - drop).join(' ');
              if (frag.length >= 8 && wide.includes(frag)) return true;
            }
            return false;
          };
          const hit = [...aa.entries()].find(
            ([slug, v]) =>
              Math.round(v) === n &&
              (slugRelated(fileSlug, slug) ||
                (variantName && slugRelated(variantName, slug)) ||
                namedInText(slug)),
          );
          if (hit) {
            cls = 'aa-current';
            note = `${hit[0]} = ${hit[1]}`;
          } else if (HISTORICAL.test(ctx)) {
            cls = 'historical';
          }
        }
        mentions.push({ file, field, n, ctx, cls, note });
      }
    }
  }

  // Pre-pass: needles from every scored output, so cross-references and lab
  // blurbs can resolve regardless of scan order.
  const parsed: Array<[string, any, number[]]> = [];
  for (const file of globSync('data/outputs/*/*.yaml').sort()) {
    const d = parse(readFileSync(file, 'utf-8'));
    const own: number[] = [];
    if (d.model?.intelligence_index != null) own.push(d.model.intelligence_index);
    for (const sub of d.outputs ?? []) {
      if (sub.model?.intelligence_index != null) {
        own.push(sub.model.intelligence_index);
        addNeedle(sub.name, sub.model.intelligence_index, `sub ${sub.name}`);
      }
    }
    if (own.length && d.model?.intelligence_index != null) {
      addNeedle(d.name, d.model.intelligence_index, d.slug);
      addNeedle(d.slug, d.model.intelligence_index, d.slug);
    }
    parsed.push([file, d, own]);
  }

  for (const [file, d, own] of parsed) {
    const slug = d.slug ?? '';
    scan(file, slug, 'desc', d.description, own);
    scan(file, slug, 'notes', d.notes, own);
    for (const v of d.model?.variants ?? []) scan(file, slug, `variant:${v.name}`, v.notes, own);
    for (const sub of d.outputs ?? []) {
      scan(file, slug, `sub:${(sub.name ?? '').slice(0, 24)}`, sub.description, own);
      for (const v of sub.model?.variants ?? []) scan(file, slug, `variant:${v.name}`, v.notes, own);
    }
  }
  for (const file of globSync('data/labs/*.yaml').sort()) {
    const d = parse(readFileSync(file, 'utf-8'));
    // Lab blurbs name other outputs' scores; there is no file-local anchor, so
    // slug-relation resolves against the lab slug (rarely matches) and most
    // verified-current lab mentions surface as UNRESOLVED for the human pass.
    scan(file, d.slug ?? '', 'lab-desc', d.description, []);
    scan(file, d.slug ?? '', 'lab-notes', d.notes, []);
    // news[].title intentionally not scanned — historical records, never edited.
  }

  const by = (c: Mention['cls']) => mentions.filter((m) => m.cls === c);
  console.log(`${mentions.length} prose mentions`);
  console.log(`  ✓ ${by('structured').length} match a structured score in their file`);
  console.log(`  ✓ ${by('tracked').length} match a named tracked output's structured score`);
  console.log(`  ≈ ${by('aa-current').length} match a live AA value for a related slug`);
  console.log(`  ⏳ ${by('historical').length} explicitly era-marked`);
  console.log(`  ✗ ${by('UNRESOLVED').length} UNRESOLVED — verify each, then fix or era-mark:\n`);
  for (const m of by('UNRESOLVED')) {
    console.log(`  ${m.file} [${m.field}] mentions ${m.n}`);
    console.log(`      …${m.ctx}…`);
  }
  if (showAll) {
    for (const cls of ['tracked', 'aa-current', 'historical', 'structured'] as const) {
      console.log(`\n── ${cls}`);
      for (const m of by(cls)) {
        console.log(`  ${m.file} [${m.field}] ${m.n}${m.note ? `  (${m.note})` : ''}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
