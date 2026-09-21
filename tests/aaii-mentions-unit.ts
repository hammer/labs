/**
 * Regression guard for the AAII prose sweep (scripts/aaii-mentions.ts).
 *
 * Pins the two misses from the 2026-09-21 audit: the "it scores N" phrasing
 * that no pattern extracted, and a number equal to an old score in the file's
 * own history that the live-leaderboard match passed by coincidence.
 *
 * Run: npm run test:aaii
 */
import { classifyMention, eraWindow, findMentions, historyMap, POINT_DIFF } from '../scripts/aaii-mentions';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

// --- extraction -------------------------------------------------------------
const k2 = "On the <strong>Artificial Analysis Intelligence Index v4.3</strong> it scores <strong>34</strong> (38 on v4.2; 47 on v4.1.1 at release), 23 points above K2 Think V2's 11.";
const nums = findMentions(k2).map((m) => m.n);
check('verb phrasing: "it scores <strong>34</strong>" is extracted', nums.includes(34), `got ${JSON.stringify(nums)}`);
check('one mention per number position (no duplicates)', new Set(findMentions(k2).map((m) => m.index)).size === findMentions(k2).length);

const shapes: Array<[string, number]> = [
  ['AA Intelligence Index v4.3: <strong>7</strong> (Pro)', 7],
  ['AA Intelligence Index v4.3: 40 / 33', 40],
  ['AAII 37 (v4.3, max effort)', 37],
  ['the 120B at high effort scores <strong>12 on Intelligence Index v4.3</strong> and the 20B scores 9', 12],
  ['on the current <strong>v4.3 it stands at 19</strong>', 19],
  ['(AA: 25)', 25],
];
for (const [text, n] of shapes) check(`extracts ${n} from "${text.slice(0, 50)}…"`, findMentions(text).some((m) => m.n === n));
check('does not extract a version number as a score', !findMentions('AA Intelligence Index v4.3 is the current version').some((m) => m.n === 4));
check('ignores numbers that belong to another AA index', findMentions('On the Artificial Analysis Speech-to-Speech Index the model scores <strong>82.6</strong>, first place').length === 0);
check('an old version tag is an era marker', classifyMention({ n: 52, near: 'AA Intelligence Index v4.1.1 score 52 at xhigh', ctx: '', current: [40], history: new Map(), currentVersion: 'AA v4.3' }).cls === 'historical');

// --- classification ---------------------------------------------------------
const { current, history } = historyMap([
  { intelligence_index: 31, intelligence_index_history: [{ score: 34, version: 'AA v4.3' }, { score: 38, version: 'AA v4.2' }, { score: 47, version: 'AA v4.1.1' }] },
]);
check('historyMap: current [31], history has 34/38/47', current[0] === 31 && [34, 38, 47].every((s) => history.has(s)));

function cls(n: number, opts: Partial<Parameters<typeof classifyMention>[0]> = {}) {
  // Build the context the way findMentions does, from the number's position in the sentence.
  const idx = k2.search(new RegExp(`(?<![\\d.])${n}(?![\\d.])`));
  const near = eraWindow(k2, idx);
  const ctx = k2.slice(Math.max(0, idx - 110), idx + 80);
  return classifyMention({ n, near, ctx, current, history, currentVersion: 'AA v4.3', ...opts }).cls;
}
check('34 (old v4.3 score, no marker) → STALE even though a live match exists', cls(34, { liveHit: 'some-sibling = 34.0' }) === 'STALE' || cls(34, { liveHit: 'some-sibling = 34.0' }) === 'CHECK');
check('34 with no live match → STALE', cls(34) === 'STALE');
check('34 with a live match → CHECK (surfaced, never hidden)', cls(34, { liveHit: 'k2-horizon-mova = 34.0' }) === 'CHECK');
check('38 next to "on v4.2" → historical', cls(38) === 'historical');
check('47 next to "v4.1.1 at release" → historical', cls(47) === 'historical');
check('31 → structured', cls(31) === 'structured');
check('11 named tracked output → tracked', classifyMention({ n: 11, near: "K2 Think V2's 11", ctx: k2, current, history, currentVersion: 'AA v4.3', trackedHit: 'k2-think-v2' }).cls === 'tracked');
check('unknown number with no evidence → UNRESOLVED', cls(52) === 'UNRESOLVED');

// A mode score in a variant note that equals an old top-level score but is right for its own slug is CHECK, not STALE.
const { current: c2, history: h2 } = historyMap([{ intelligence_index: 21, intelligence_index_history: [{ score: 19, version: 'AA v4.2' }] }]);
check('variant mode score equal to an old top-level score, live-confirmed → CHECK', classifyMention({ n: 19, near: 'Index v4.3: 19 (extended thinking)', ctx: '', current: c2, history: h2, currentVersion: 'AA v4.3', liveHit: 'claude-4-sonnet-thinking = 18.9' }).cls === 'CHECK');

// --- derived differences ----------------------------------------------------
check('eraWindow for 34 stops before the neighbouring 38', !eraWindow(k2, k2.indexOf('34')).includes('v4.2'));
check('eraWindow for 38 keeps its own "on v4.2"', eraWindow(k2, k2.indexOf('38')).includes('v4.2'));
check('"23 points above" is found for re-derivation', [...k2.matchAll(POINT_DIFF)].map((m) => m[1]).includes('23'));

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
