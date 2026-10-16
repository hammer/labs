/**
 * The step 8d gate. These pin the two questions it answers: did every candidate
 * reach a terminal state, and is a claim that something was filed actually true.
 *
 * The second half is the point. A ledger that only checked states would have
 * passed the 2026-10-15 sweep the moment someone wrote `filed` next to
 * Nemotron 3.5 Super VL, which is precisely the bookkeeping that went wrong —
 * three releases were judged new and never filed, and nothing looked.
 */
import { extractIds, appearsInData, violation, STATES } from '../scripts/sweep-ledger';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

// ------------------------------------------------------------- id extraction

const authorLog = `
ant-group
** 2609.22253  cs.LG,cs.AI,cs.CL  2026-09-06  via 2: Jingang Zhou, Xu-Yao Zhang
     CAMFT: Conflict-Aware Mergeable Fine-Tuning
nvidia
** 2610.06647  cs.CL  2026-10-05  via 3: Jan Kautz, Jian Hu, Yi Dong
     LoGRA: Scaling LLM Reinforcement Learning
`;
const ids = extractIds(authorLog);
check('extractIds finds arXiv ids in a sweep-authors log',
  ids.includes('2609.22253') && ids.includes('2610.06647'));
check('extractIds does not invent ids from author names', !ids.some((i) => /Kautz/.test(i)));

const hfLog = `
   159♥      402dl  2026-09-15  meta    model meta-models/Muse-Spark-Open-816B-A42B
    97♥     1137dl  2026-10-07  nvidia  model nvidia/NVIDIA-Nemotron-3.5-Bolt-74B-A9B-24GB
`;
const hf = extractIds(hfLog);
check('extractIds finds HuggingFace owner/name ids',
  hf.includes('meta-models/Muse-Spark-Open-816B-A42B'));
check('extractIds catches the id that was dropped in the real sweep',
  hf.includes('nvidia/NVIDIA-Nemotron-3.5-Bolt-74B-A9B-24GB'));
// A log is full of paths; treating them as candidates would bury the real ones.
check('extractIds skips source paths',
  !extractIds('see scripts/sweep-orgs.ts and data/outputs/meta/muse.yaml')
    .some((i) => i.includes('.ts') || i.includes('.yaml')));
check('extractIds skips URL scheme segments',
  !extractIds('https://huggingface.co/api/models').some((i) => i.startsWith('https/')));
check('extractIds dedupes', extractIds('2610.06647 and again 2610.06647').length === 1);
// Probe logs are full of ratios. The first live run seeded 21 progress lines
// ("...500/538 probed") as candidates before this was excluded.
check('extractIds ignores progress ratios',
  extractIds('  ...500/538 probed\n  ...525/538 probed').length === 0);
check('extractIds ignores a bare fraction', extractIds('coverage 78/78').length === 0);

// --------------------------------------------------------- data verification

const corpus = `
  - label: Paper (arXiv)
    url: https://arxiv.org/abs/2610.06647
  - label: HuggingFace
    url: https://huggingface.co/meta-models/Muse-Spark-Open-816B-A42B
`;
check('appearsInData sees a bare arXiv id inside a URL', appearsInData('2610.06647', corpus));
check('appearsInData sees a full HuggingFace path',
  appearsInData('meta-models/Muse-Spark-Open-816B-A42B', corpus));
// The leaf fallback: an entry may cite only the repo name in prose.
check('appearsInData falls back to the repo name',
  appearsInData('someone-else/Muse-Spark-Open-816B-A42B', corpus));
check('appearsInData says no for an untracked id', !appearsInData('2610.99999', corpus));
// A two-character leaf would match almost anything; the length floor stops that.
check('appearsInData will not match on a tiny leaf', !appearsInData('x/ab', corpus));

// ------------------------------------------------------------------ the gate

check('flagged is a violation',
  violation({ id: '2610.06647', state: 'flagged' }, corpus) !== null);
check('filed and present in data/ passes',
  violation({ id: '2610.06647', state: 'filed' }, corpus) === null);
// The case the whole script exists for.
check('filed but absent from data/ is a violation',
  violation({ id: '2610.99999', state: 'filed' }, corpus) !== null);
check('attached is verified the same way as filed',
  violation({ id: '2610.99999', state: 'attached' }, corpus) !== null);
check('rejected needs a reason',
  violation({ id: '2610.99999', state: 'rejected' }, corpus) !== null);
check('rejected with a reason passes',
  violation({ id: '2610.99999', state: 'rejected', reason: 'fails gate clause 1' }, corpus) === null);
check('a whitespace reason does not count',
  violation({ id: '2610.99999', state: 'rejected', reason: '   ' }, corpus) !== null);
check('deferred needs a reason too',
  violation({ id: '2610.99999', state: 'deferred' }, corpus) !== null);
// Rejected items are not expected in data/ — that is the whole point of rejecting.
check('rejected is not required to appear in data/',
  violation({ id: '2610.99999', state: 'rejected', reason: 'application of an FM' }, corpus) === null);
check('an unknown state is a violation',
  violation({ id: 'x', state: 'done' as never }, corpus) !== null);
check('STATES lists exactly the five dispositions', STATES.length === 5);

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
