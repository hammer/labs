/**
 * Unit + regression tests for the /whats-new changelog (src/data/changelog.ts).
 *
 * Why this exists: on 2026-09-12 the feed showed dozens of "news added {…}"
 * and "paper added {…}" rows — fmtValue only knew value/year/amount/name, and
 * news items carry `title`, paper blocks carry `arxiv`/`pdf_url`. Nothing
 * caught it because no test rendered a real diff. These tests do:
 *   1. unit: every object shape the schema can produce gets a readable label;
 *   2. diff: adding a news item / paper block / variant to a YAML yields no
 *      placeholder;
 *   3. regression guard: the REAL changelog over recent git history contains
 *      no "{…}", "[object Object]", "undefined", or "NaN" in any rendered
 *      subject or field value — so the next new object shape fails here, at
 *      commit time, instead of on the live page.
 *
 * Runs without a dev server:   npm run test:changelog
 */
import { fmtValue, diffNodes, getChangelog, type FieldChange } from '../src/data/changelog.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const PLACEHOLDER = /\{…\}|\[object Object\]|\bundefined\b|\bNaN\b/;

// ── 1. fmtValue: one readable label per object shape ─────────────────
check('fmtValue: news item → title', fmtValue({ title: 'Lab X Raises $1B', url: 'https://x', source: 'FT', date: '2026-09-01' }) === 'Lab X Raises $1B');
check('fmtValue: long title is truncated with an ellipsis', fmtValue({ title: 'T'.repeat(200) }).length <= 140);
check('fmtValue: paper block → arXiv id', fmtValue({ arxiv: '2609.10445', authors: ['A'] }) === 'arXiv 2609.10445');
check('fmtValue: repo-PDF paper block → pdf url', fmtValue({ pdf_url: 'https://h/x.pdf', huggingface_url: 'https://hf' }) === 'https://h/x.pdf');
check('fmtValue: variant → name', fmtValue({ name: 'Foo 7B', parameters: '7B' }) === 'Foo 7B');
check('fmtValue: valuation → amount', fmtValue({ amount: '$24.5B', type: 'private', date: '2026-09' }) === '$24.5B');
check('fmtValue: parameters_estimated → value', fmtValue({ value: '1.4T', source: 'https://arxiv' }) === '1.4T');
check('fmtValue: benchmark row → generic key: value', fmtValue({ benchmark: 'GPQA Diamond', score: '90.9' }) === 'benchmark: GPQA Diamond');
check('fmtValue: eval block → generic key: value', /^scoring_method: /.test(fmtValue({ num_tasks: 507, scoring_method: 'repeated-success' })));
check('fmtValue: only a truly opaque object renders the placeholder', fmtValue({ n: 1, ok: true }) === '{…}');
check('fmtValue: arrays render a count, never [object Object]', fmtValue([{ a: 1 }, { b: 2 }]) === '[2 items]');

// ── 2. diffNodes on realistic YAML shapes ─────────────────────────────
function diff(before: unknown, after: unknown, kind: 'lab' | 'output'): FieldChange[] {
  const out: FieldChange[] = []; diffNodes(before, after, '', kind, out); return out;
}
const labBefore = { name: 'Lab', slug: 'lab', news: [{ title: 'Old', url: 'https://o', source: 'S', date: '2026-01-01' }] };
const labAfter = { ...labBefore, news: [{ title: 'New Model Ships With 1M Context', url: 'https://n', source: 'S', date: '2026-09-10' }, ...labBefore.news] };
const labDiff = diff(labBefore, labAfter, 'lab');
check('diff: added news item renders its title', labDiff.some(f => f.path === 'news' && f.op === 'added' && f.after === 'New Model Ships With 1M Context'), JSON.stringify(labDiff));
const outBefore = { name: 'M', slug: 'm', type: 'model', model: { parameters: '7B' } };
const outAfter = { ...outBefore, paper: { arxiv: '2609.00001' }, model: { parameters: '7B', variants: [{ name: 'M-mini', parameters: '1B' }], benchmark_scores: [{ benchmark: 'HLE', score: '36.8' }] } };
const outDiff = diff(outBefore, outAfter, 'output');
check('diff: added paper block renders arXiv id', outDiff.some(f => f.path === 'paper' && f.after === 'arXiv 2609.00001'), JSON.stringify(outDiff));
check('diff: no placeholder in any rendered value', !outDiff.concat(labDiff).some(f => PLACEHOLDER.test(String(f.after ?? '')) || PLACEHOLDER.test(String(f.before ?? ''))), JSON.stringify(outDiff.concat(labDiff)));

// ── 3. Regression guard over the real repository history ──────────────
const events = getChangelog({ since: '6 months ago' });
check('regression: changelog builds from git', events.length > 0, `${events.length} events`);
const bad: string[] = [];
for (const ev of events) {
  if (PLACEHOLDER.test(ev.subject)) bad.push(`${ev.date} ${ev.kind} subject: ${ev.subject}`);
  for (const f of ev.fields ?? []) {
    if (PLACEHOLDER.test(String(f.after ?? '')) || PLACEHOLDER.test(String(f.before ?? ''))) bad.push(`${ev.date} ${ev.subject} · ${f.path} ${f.op}: ${f.before ?? ''} → ${f.after ?? ''}`);
  }
}
check('regression: no placeholder in any rendered event over 6 months of history', bad.length === 0, bad.slice(0, 8).join(' | '));

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
