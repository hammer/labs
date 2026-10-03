/**
 * Regression guard for the sweep secondary-org probe (scripts/sweep-orgs.ts).
 *
 * The probe turns a lab's existing source URLs into the org list a sweep must
 * check. Two ways it can silently under-report, both of which have cost us a
 * real miss: a URL shape it does not match (so a lab's second org never
 * appears), or a non-org path segment it mistakes for an org (so the list
 * fills with noise and the real entries get skimmed past).
 *
 * Run: npm run test:sweep-orgs
 */
import { harvestOrgs } from '../scripts/sweep-orgs';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

// The URL shapes that actually appear in data/, drawn from the three misses
// that motivated the probe plus the forms used across existing entries.
const sample = `
  - label: GitHub
    url: https://github.com/kvcache-ai/AgentENV
  - label: HuggingFace (weights)
    url: https://huggingface.co/LG-AI-Research/EXAONE-Tabular
  - label: HuggingFace
    url: https://huggingface.co/apple/LensVLM-9B
  - label: HuggingFace (collection)
    url: https://huggingface.co/collections/kuleshov-group/plantcad2-67e437e241a382671371a572
  - label: HuggingFace (dataset)
    url: https://huggingface.co/datasets/marin-community/grug-moe-mix-swarm
  - label: API probe
    url: https://huggingface.co/api/models?author=CohereLabs
  prose: see <a href="https://github.com/MoonshotAI/MoonEP">MoonEP</a>, and github.com paths with punctuation
    url: https://github.com/plantcad/genecad.
`;

const gh = harvestOrgs(sample, 'github');
const hf = harvestOrgs(sample, 'huggingface');

// Found: the orgs behind the three real misses.
check('github: kvcache-ai (Moonshot AgentENV miss)', gh.includes('github:kvcache-ai'));
check('huggingface: LG-AI-Research (EXAONE weights miss)', hf.includes('huggingface:LG-AI-Research'));
check('huggingface: apple (LensVLM miss)', hf.includes('huggingface:apple'));

// Found: orgs behind the non-obvious URL shapes.
check('huggingface: org inside a /collections/ path', hf.includes('huggingface:kuleshov-group'));
check('huggingface: org inside a /datasets/ path', hf.includes('huggingface:marin-community'));
check('huggingface: org in an ?author= API probe', hf.includes('huggingface:CohereLabs'));
check('github: org inside an HTML href', gh.includes('github:MoonshotAI'));
check('github: trailing punctuation stripped', gh.includes('github:plantcad'), gh.join(','));

// Not found: path segments that are not orgs.
for (const bogus of ['huggingface:collections', 'huggingface:datasets', 'huggingface:api']) {
  check(`rejects non-org segment ${bogus}`, !hf.includes(bogus));
}

// An empty document yields nothing rather than throwing.
check('empty input is empty', harvestOrgs('', 'github').length === 0);

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
