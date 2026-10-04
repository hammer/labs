/**
 * Regression guard for the sweep author probe (scripts/sweep-authors.ts).
 *
 * The probe exists because arXiv has no affiliation field, so a lab-name search
 * cannot find a paper tied to the lab only by its title page. EMO (2605.13247,
 * MBZUAI-IFM) went unfiled for five months that way. The probe can regress
 * silently in four places, and each one puts us back where we started:
 *
 *   1. the author index misses the person who would have found the paper;
 *   2. the listing parser stops matching arXiv's result markup;
 *   3. the tracked-id scan misses an id shape, so filed papers reappear as
 *      candidates and the real ones get skimmed past;
 *   4. the date floor is wrong, so recent papers get filtered out.
 *
 * Run: npm run test:sweep-authors
 */
import {
  harvestAuthors, trackedArxivIds, parseAuthorListing, untracked, yymmFloor, searchUrl,
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
check('search URL encodes the name',
  searchUrl('Eric Xing').includes('query=Eric+Xing'), searchUrl('Eric Xing'));

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

// Trimmed from the live arXiv author-search page for Zhengzhong Liu, keeping the
// markup the parser depends on. Two results so a block cannot absorb the next.
const listing = `
<li class="arxiv-result">
    <div class="is-marginless">
      <p class="list-title is-inline-block"><a href="https://arxiv.org/abs/2605.15290">arXiv:2605.15290</a>
        <span>&nbsp;[<a href="https://arxiv.org/pdf/2605.15290">pdf</a>]&nbsp;</span>
      </p>
      <div class="tags is-inline-block">
        <span class="tag is-small is-link tooltip is-tooltip-top" data-tooltip="Machine Learning">cs.LG</span>
      </div>
    </div>
    <p class="title is-5 mathjax">
      Something regarding transfer over weight decay
    </p>
    <p class="is-size-7"><span class="has-text-black-bis has-text-weight-semibold">Submitted</span> 14 May, 2026;
      <span class="has-text-black-bis has-text-weight-semibold">originally announced</span> May 2026.
    </p>
  </li>
  <li class="arxiv-result">
    <div class="is-marginless">
      <p class="list-title is-inline-block"><a href="https://arxiv.org/abs/2605.13247">arXiv:2605.13247</a>
        <span>&nbsp;[<a href="https://arxiv.org/pdf/2605.13247">pdf</a>]&nbsp;</span>
      </p>
      <div class="tags is-inline-block">
        <span class="tag is-small is-link tooltip is-tooltip-top" data-tooltip="Machine Learning">cs.LG</span>
        </div>
    </div>
    <p class="title is-5 mathjax">
      EMO: Frustratingly Easy Progressive Training of Extendable MoE
    </p>
    <p class="authors">
      <span class="search-hit">Authors:</span>
      <a href="/search/?searchtype=author&amp;query=Xing%2C+E">Eric Xing</a>
    </p>
    <p class="is-size-7"><span class="has-text-black-bis has-text-weight-semibold">Submitted</span> 13 May, 2026;
      <span class="has-text-black-bis has-text-weight-semibold">originally announced</span> May 2026.
    </p>
  </li>
`;

const entries = parseAuthorListing(listing);
check('parser finds both results', entries.length === 2, `got ${entries.length}`);
const emo = entries.find((e) => e.id === '2605.13247');
check('parser finds the EMO id', !!emo);
check('parser reads the title verbatim',
  emo?.title === 'EMO: Frustratingly Easy Progressive Training of Extendable MoE', emo?.title);
check('parser reads the category', emo?.categories.join(',') === 'cs.LG', emo?.categories.join(','));
check('parser reads the submitted date', emo?.submitted === '13 May, 2026', emo?.submitted);
check('parser does not leak the neighbouring title into a block',
  entries[0].title === 'Something regarding transfer over weight decay', entries[0].title);
check('parser survives an empty page', parseAuthorListing('').length === 0);

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

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
