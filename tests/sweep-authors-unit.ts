/**
 * Regression guard for the sweep author probe (scripts/sweep-authors.ts).
 *
 * The probe exists because arXiv has no affiliation field, so a lab-name search
 * cannot find a paper tied to the lab only by its title page. EMO (2605.13247,
 * MBZUAI-IFM) went unfiled for five months that way. The probe can regress
 * silently in six places, and each one puts us back where we started:
 *
 *   1. the author index misses the person who would have found the paper;
 *   2. the listing parser stops matching arXiv's API response shape;
 *   3. the tracked-id scan misses an id shape, so filed papers reappear as
 *      candidates and the real ones get skimmed past;
 *   4. the date floor is wrong, so recent papers get filtered out;
 *   5. throttled probes are not retried, so the run under-reports while
 *      looking complete (the first full run lost 304 of 534 to HTTP 429);
 *   6. one person's name variants count as two vouchers, inflating the
 *      corroboration signal the triage ranks on.
 *
 * Run: npm run test:sweep-authors
 */
import {
  harvestAuthors, trackedArxivIds, parseAuthorListing, untracked, yymmFloor, searchUrl,
  isRetryable, backoffMs, personKey, distinctPeople,
} from '../scripts/sweep-authors';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

// ---------------------------------------------------------------- author index

// Shaped like data/labs/mbzuai.yaml: Eric Xing is in `people:` and co-authors
// EMO. He is the probe target that would have caught it.
const mbzuai = {
  people: [{ name: 'Eric Xing' }, { name: 'Preslav Nakov' }, { name: 'Timothy Baldwin' }],
};
const mbzuaiOutputs = [
  { paper: { authors: ['Eric Xing', 'Zhengzhong Liu'] } },
  { paper: { authors: ['Eric Xing', { name: 'Xuezhe Ma' }] } },
  { paper: { authors: ['Preslav Nakov'] } },
  { slug: 'a-model-with-no-paper-block' },
];

const authors = harvestAuthors(mbzuai, mbzuaiOutputs, 6);
const names = authors.map((a) => a.name);

check('author index includes the people: block', names.includes('Timothy Baldwin'));
check('author index includes paper-only co-authors', names.includes('Zhengzhong Liu'));
check('most prolific author sorts first', names[0] === 'Eric Xing', names.join(', '));
check('object-form author names are read', names.includes('Xuezhe Ma'));
check('people: member is flagged listed',
  authors.find((a) => a.name === 'Eric Xing')?.listed === true);
check('paper counts are tallied',
  authors.find((a) => a.name === 'Eric Xing')?.papers === 2);
check('an output with no paper block does not throw', authors.length === 5, names.join(', '));
check('--limit truncates', harvestAuthors(mbzuai, mbzuaiOutputs, 2).length === 2);
check('a lab with neither people nor papers yields nothing',
  harvestAuthors({}, [], 6).length === 0);
check('search URL hits the API, not the scraped HTML search',
  searchUrl('Eric Xing').startsWith('https://export.arxiv.org/api/query'), searchUrl('Eric Xing'));
check('search URL quotes the author name',
  searchUrl('Eric Xing').includes('au%3A%22Eric+Xing%22'), searchUrl('Eric Xing'));
check('search URL asks newest-first',
  searchUrl('x').includes('sortBy=submittedDate') && searchUrl('x').includes('sortOrder=descending'));

// -------------------------------------------------------------- tracked ids

const dataSample = `
  - label: Paper (arXiv)
    url: https://arxiv.org/abs/2609.40285
paper:
  arxiv: "2605.13247"
  pdf_url: https://arxiv.org/pdf/2604.13010v2
prose: see <a href="https://arxiv.org/abs/2512.11614">the earlier report</a>
`;
const tracked = trackedArxivIds([dataSample]);
check('tracked ids: bare arxiv: field', tracked.has('2605.13247'));
check('tracked ids: /abs/ URL', tracked.has('2609.40285'));
check('tracked ids: version suffix stripped', tracked.has('2604.13010'));
check('tracked ids: id inside prose HTML', tracked.has('2512.11614'));
check('tracked ids: no phantom entries', tracked.size === 4, [...tracked].join(','));

// ------------------------------------------------------------ listing parser

// Trimmed from a live arXiv API response, keeping the shape the parser depends
// on: the feed's own <id>/<title> before the first <entry>, which must not be
// read as a paper, and two entries so one cannot absorb the next's fields.
// A multi-word title is wrapped the way arXiv wraps them, and &amp; appears
// because unescaping is part of the contract.
const listing = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>http://arxiv.org/api/abcdef</id>
  <title type="html">ArXiv Query: search_query=au:"Eric Xing"</title>
  <opensearch:totalResults>376</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2605.15290v1</id>
    <title>Something regarding transfer &amp; weight decay</title>
    <updated>2026-05-14T10:23:42Z</updated>
    <summary>Not the title.</summary>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <published>2026-05-14T10:23:42Z</published>
    <arxiv:primary_category term="cs.LG"/>
    <author><name>Zhengzhong Liu</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2605.13247v2</id>
    <title>EMO: Frustratingly Easy Progressive Training of
  Extendable MoE</title>
    <updated>2026-05-14T08:00:00Z</updated>
    <summary>On-policy ... not the title either.</summary>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <published>2026-05-13T08:00:00Z</published>
    <arxiv:primary_category term="cs.LG"/>
    <author><name>Eric Xing</name></author>
  </entry>
</feed>`;

const entries = parseAuthorListing(listing);
check('parser finds both entries', entries.length === 2, `got ${entries.length}`);
check('parser ignores the feed-level id/title', !entries.some((e) => e.title.startsWith('ArXiv Query')));
const emo = entries.find((e) => e.id === '2605.13247');
check('parser finds the EMO id (version suffix stripped)', !!emo);
check('parser rejoins a wrapped title',
  emo?.title === 'EMO: Frustratingly Easy Progressive Training of Extendable MoE', emo?.title);
check('parser reads the category', emo?.categories.join(',') === 'cs.LG', emo?.categories.join(','));
check('parser dedupes repeated categories', emo?.categories.length === 1);
check('parser prefers <published> over <updated>', emo?.submitted === '2026-05-13', emo?.submitted);
check('parser unescapes XML entities',
  entries[0].title === 'Something regarding transfer & weight decay', entries[0].title);
check('parser does not leak the neighbouring title into a block',
  entries[0].id === '2605.15290', entries[0].id);
check('parser survives an empty response', parseAuthorListing('').length === 0);

// ----------------------------------------------------------- throttle handling

// The first full run lost 304 of 534 probes to HTTP 429 and still printed a
// confident total, because a throttled probe is indistinguishable from an author
// with no new papers. Retrying is the fix; these pin that it is attempted.
check('429 is retryable', isRetryable(429));
check('403 is retryable (arXiv throttles with it too)', isRetryable(403));
check('503 is retryable', isRetryable(503));
check('404 is not retryable', !isRetryable(404));
check('200 is not retryable', !isRetryable(200));
check('backoff grows with attempts', backoffMs(2) > backoffMs(0));
check('backoff honours Retry-After seconds', backoffMs(0, '30') >= 30_000 && backoffMs(0, '30') <= 30_000);
check('backoff ignores a junk Retry-After', backoffMs(0, 'soon') > 0);
check('backoff is capped', backoffMs(99) <= 61_000, String(backoffMs(99)));

// --------------------------------------------------------------- date floor

check('yymmFloor: 2026-05 -> 2605', yymmFloor('2026-05') === 2605);
check('yymmFloor: zero-padded month', yymmFloor('2026-01') === 2601);
let threw = false;
try { yymmFloor('May 2026'); } catch { threw = true; }
check('yymmFloor rejects a malformed --since', threw);

// ------------------------------------------------------------------- diffing

const via = (author: string) => entries.map((entry) => ({ author, entry }));

// The regression that matters: with EMO unfiled, the probe must surface it.
const missed = untracked(via('Eric Xing'), trackedArxivIds(['']), yymmFloor('2026-05'));
check('EMO surfaces when untracked', missed.some((e) => e.id === '2605.13247'));

// And once filed, it must stop being reported, or the list fills with noise.
const afterFiling = untracked(via('Eric Xing'), trackedArxivIds([dataSample]), yymmFloor('2026-05'));
check('EMO disappears once tracked', !afterFiling.some((e) => e.id === '2605.13247'));

check('--since filters out older papers',
  untracked(via('Eric Xing'), new Set<string>(), yymmFloor('2026-06')).length === 0);

// Two authors on the same paper is one candidate, not two — and the attribution
// keeps both names, because that is what tells a reader the hit is not a
// namesake collision.
const shared = untracked(
  [...via('Eric Xing'), ...via('Zhengzhong Liu')], new Set<string>(), yymmFloor('2026-05'));
check('duplicate ids across two authors collapse', shared.length === 2, `got ${shared.length}`);
check('attribution keeps every author who surfaced a hit',
  shared.find((e) => e.id === '2605.13247')?.via.join(',') === 'Eric Xing,Zhengzhong Liu',
  shared.find((e) => e.id === '2605.13247')?.via.join(','));
check('attribution does not repeat an author',
  untracked([...via('Eric Xing'), ...via('Eric Xing')], new Set<string>(), yymmFloor('2026-05'))
    .every((e) => e.via.length === 1));

// ------------------------------------------------------- author identity

// Probing both spellings is deliberate — arXiv indexes them as separate
// queries — but they must count as ONE voucher. Before this, 2609.34272 looked
// twice-corroborated for MBZUAI off a single author, and its title page is
// Rutgers/CMU/Oracle/NYU with no MBZUAI on it.
check('personKey collapses a middle initial',
  personKey('Eric Xing') === personKey('Eric P. Xing'), personKey('Eric P. Xing'));
check('personKey keeps different people apart',
  personKey('Eric Xing') !== personKey('Lei Xing'));
check('personKey keeps same-surname different-initial apart',
  personKey('Zhengzhong Liu') !== personKey('Pengfei Liu'));
check('personKey survives a mononym', personKey('Plato') === 'plato');
check('distinctPeople: name variants count once',
  distinctPeople(['Eric Xing', 'Eric P. Xing']) === 1);
check('distinctPeople: two people count twice',
  distinctPeople(['Eric Xing', 'Zhengzhong Liu']) === 2);

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
