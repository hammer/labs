/**
 * The org-health pass decides whether a lab's declared HuggingFace org is worth
 * acting on. These pin the decision table and the URL parsing, which are pure;
 * the probes themselves are network and are not tested here.
 *
 * Why this matters enough to pin: the declared `huggingface:` field is what the
 * org probe reads by default, so a wrong verdict either hides a broken pointer
 * (a lab reads as quiet when it is actually unprobed — `meta.yaml` sat on the
 * dormant `meta-llama` for about eighteen months) or invents one (the first run
 * of this script called `princeton-nlp` DEAD two weeks after it shipped a
 * model, because it trusted an API endpoint that 404s for live orgs).
 */
import { classify, orgFromUrl, ageDays } from '../scripts/sweep-org-health';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

const NOW = new Date('2026-10-13T00:00:00Z');
const ago = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

// ------------------------------------------------------------------ parsing

check('orgFromUrl pulls the org', orgFromUrl('https://huggingface.co/meta-models') === 'meta-models');
check('orgFromUrl tolerates a trailing slash',
  orgFromUrl('https://huggingface.co/CohereLabs/') === 'CohereLabs');
check('orgFromUrl keeps case', orgFromUrl('https://huggingface.co/THUDM') === 'THUDM');
check('orgFromUrl handles hyphens and underscores',
  orgFromUrl('https://huggingface.co/latent-action-pretraining') === 'latent-action-pretraining');
// A link to a specific model is not an org pointer; returning the org from one
// would silently declare the wrong thing.
check('orgFromUrl rejects a model URL',
  orgFromUrl('https://huggingface.co/meta-models/Muse-Glimmer-30B') === null);
check('orgFromUrl rejects a non-HF URL',
  orgFromUrl('https://github.com/facebookresearch') === null);

// ------------------------------------------------------------- decision table

// A 404 page means the handle resolves to nothing at all.
check('missing org is DEAD', classify(false, null, NOW) === 'DEAD');

// HuggingFace keeps a renamed org's old handle resolving, so a rename looks
// like "exists but holds nothing" from outside — CohereForAI after the move to
// CohereLabs, ZGCA after zgcagi. This is the case that must NOT read as DEAD,
// because the fix is a redirect to the new name, not a deletion.
check('empty but resolving org is RENAMED', classify(true, null, NOW) === 'RENAMED');

check('recent upload is OK', classify(true, ago(30), NOW) === 'OK');
check('just inside the window is OK', classify(true, ago(364), NOW) === 'OK');
// Boundary: exactly at the threshold is not yet stale.
check('exactly at the threshold is OK', classify(true, ago(365), NOW) === 'OK');
check('past the threshold is DORMANT', classify(true, ago(366), NOW) === 'DORMANT');
check('long-dead org is DORMANT', classify(true, ago(1393), NOW) === 'DORMANT');

// The window is tunable, because "stale" for a pointer is not the same question
// as "stale" for a release cadence.
check('threshold is overridable', classify(true, ago(100), NOW, 90) === 'DORMANT');
check('a wide window forgives', classify(true, ago(700), NOW, 1000) === 'OK');

// An org with artifacts is never DEAD regardless of age: something shipped from
// it, so the handle resolves whatever a page probe says.
check('an org with artifacts is never DEAD', classify(true, ago(5000), NOW) !== 'DEAD');

// ------------------------------------------------------------------ age column

check('ageDays is null when nothing shipped', ageDays(null, NOW) === null);
check('ageDays counts days', ageDays(ago(49), NOW) === 49);
check('ageDays of today is 0', ageDays(NOW.toISOString(), NOW) === 0);

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
