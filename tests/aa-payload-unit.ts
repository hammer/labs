/**
 * Regression guard for the Artificial Analysis payload parser.
 *
 * AA has changed the record opener three times (see scripts/aa-payload.ts);
 * each change silently collapsed the sync to "Parsed only 1 scored records".
 * These fixtures pin every shape seen so far plus the creator-object trap,
 * and the record-count floor that tells sentinel drift from a payload prune.
 *
 * Run: npm run test:aa
 */
import { readFileSync } from 'fs';
import { findPromotionCandidates } from '../scripts/aa-promotion';
import { parseAaScores, splitAaRecords, checkAaRecordCount, checkAaPayload, listAaSlugs, AA_MIN_SCORED_RECORDS, AA_DRIFT_CEILING } from '../scripts/aa-payload';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

const creator = '{"id":"11111111-2222-3333-4444-555555555555","name":"Z AI","color":"#1c7ff8"}';
const shapes: Record<string, string> = {
  'pre-Sep-2026 id+name+shortName':
    `preamble ${creator} {"id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","name":"GLM-5.2 (Reasoning)","shortName":"GLM-5.2","slug":"glm-5-2","modelCreator":${creator},"intelligenceIndex":41.2}` +
    `{"id":"aaaaaaaa-bbbb-cccc-dddd-ffffffffffff","name":"Kimi K3","shortName":"Kimi K3","slug":"kimi-k3","modelCreator":${creator},"intelligenceIndex":52.9}`,
  '2026-09-11 slug+shortName':
    `preamble ${creator} {"slug":"glm-5-2","shortName":"GLM-5.2","modelCreator":${creator},"intelligenceIndex":41.2}` +
    `{"slug":"kimi-k3","shortName":"Kimi K3","modelCreator":${creator},"intelligenceIndex":52.9}`,
  '2026-09-17 slug+name+shortName':
    `preamble ${creator} {"slug":"glm-5-2","name":"GLM-5.2 (Reasoning)","shortName":"GLM-5.2","modelCreator":${creator},"intelligenceIndex":41.2}` +
    `{"slug":"kimi-k3","name":"Kimi K3","shortName":"Kimi K3","modelCreator":${creator},"intelligenceIndex":52.9}`,
};

for (const [name, body] of Object.entries(shapes)) {
  const m = parseAaScores(body);
  check(`${name}: two records parsed`, m.size === 2, `got ${m.size}`);
  check(`${name}: glm-5-2 = 41.2`, m.get('glm-5-2') === 41.2, `got ${m.get('glm-5-2')}`);
  check(`${name}: kimi-k3 = 52.9`, m.get('kimi-k3') === 52.9, `got ${m.get('kimi-k3')}`);
  check(`${name}: creator objects do not open a record`, splitAaRecords(body).length === 3, `spans ${splitAaRecords(body).length}`);
}

// A mixed payload (AA has shipped mixed shapes mid-migration) must still resolve every record.
const mixed = shapes['pre-Sep-2026 id+name+shortName'] + shapes['2026-09-17 slug+name+shortName'].replace('glm-5-2', 'glm-5-3').replace('kimi-k3', 'kimi-k3-1');
check('mixed shapes: four records', parseAaScores(mixed).size === 4, `got ${parseAaScores(mixed).size}`);

// Floor diagnosis: drift (~1 record) and shrink (2026-10-24: 266 unique slugs)
// must produce different errors, and today's real payload size must pass.
function errOf(n: number): string { try { checkAaRecordCount(n); return ''; } catch (e) { return (e as Error).message; } }
check('floor: 266 (2026-10-24 payload) passes', errOf(266) === '', errOf(266));
check('floor: floor sits below the 2026-10-24 size', AA_MIN_SCORED_RECORDS < 266);
check('floor: 1 record is diagnosed as sentinel drift', /sentinel drift/.test(errOf(1)));
check('floor: drift ceiling well below the floor', AA_DRIFT_CEILING * 10 < AA_MIN_SCORED_RECORDS);
check('floor: 180 records is diagnosed as a payload prune', /pruned the payload/.test(errOf(180)));

// Version rollout (v5.0, 2026-10-27): AA lists every model but scores only
// the ones it has re-run; the rest carry "intelligenceIndex":null. The floor
// must apply to listed records, so 272 listed / 76 scored passes, while a
// drifted parser (scored ≈ 0) still throws.
function rec(slug: string, ii: string) { return `{"slug":"${slug}","name":"${slug}","shortName":"${slug}","intelligenceIndex":${ii},"x":1}`; }
function rollout(listed: number, scored: number) {
  return Array.from({ length: listed }, (_, i) => rec(`m-${i}`, i < scored ? String(50 - i / 10) : 'null')).join(',');
}
function payloadErr(body: string): string { try { checkAaPayload(body, parseAaScores(body)); return ''; } catch (e) { return (e as Error).message; } }
const v5 = rollout(272, 76);
check('rollout: null records are listed', listAaSlugs(v5).size === 272, `got ${listAaSlugs(v5).size}`);
check('rollout: null records are not scored', parseAaScores(v5).size === 76, `got ${parseAaScores(v5).size}`);
check('rollout: 272 listed / 76 scored passes', payloadErr(v5) === '', payloadErr(v5));
check('rollout: flagged as a rollout', (() => { try { return checkAaPayload(v5, parseAaScores(v5)).rollout; } catch { return false; } })());
check('rollout: 272 listed / 0 scored is still drift', /sentinel drift/.test(payloadErr(rollout(272, 0))));
check('rollout: 180 listed is still a prune', /pruned the payload/.test(payloadErr(rollout(180, 180))));

// Promotion candidates: a sibling scored on the current version while the
// file's own anchor is not (the v5.0 Qwen3.8 / Ling-3.1-flash case).
const aa = (slug: string) => `  - url: https://artificialanalysis.ai/models/${slug}\n`;
const v5scores = new Map([['qwen3-8-max', 33.6], ['qwen3-8-27b', 20.1], ['ling-3-1-flash-1019', 29.5], ['glm-5-3', 31.7], ['glm-5-3-low', 23.1]]);
const promo = (files: Array<[string, string]>) => findPromotionCandidates(files.map(([file, content]) => ({ file, content })), v5scores);
const parent = aa('qwen3-8-2-4t-a95b') + aa('qwen3-8-max') + aa('qwen3-8-27b');
check('promotion: v4-only anchor with v5 siblings → both flagged, best first',
  JSON.stringify(promo([['qwen3.8', parent]]).map(c => c.sibling)) === '["qwen3-8-max","qwen3-8-27b"]');
check('promotion: sibling already anchored by its own file → not flagged',
  JSON.stringify(promo([['qwen3.8', parent], ['qwen3.8-max', aa('qwen3-8-max')]]).map(c => c.sibling)) === '["qwen3-8-27b"]');
check('promotion: anchor itself scored → nothing to promote',
  promo([['ling', aa('ling-3-1-flash-1019') + aa('qwen3-8-max')]]).length === 0);
check('promotion: mode sibling of the anchor is the mode audit\'s job, not a promotion',
  promo([['glm', aa('glm-5-3-max') + aa('glm-5-3-low')]]).length === 0);

// Optional live guard: with AA_PAYLOAD=<file> the saved payload must clear the shared floor.
if (process.env.AA_PAYLOAD) {
  const n = listAaSlugs(readFileSync(process.env.AA_PAYLOAD, 'utf8')).size;
  check(`live payload ${process.env.AA_PAYLOAD}: ≥${AA_MIN_SCORED_RECORDS} listed records`, n >= AA_MIN_SCORED_RECORDS, `got ${n}`);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
