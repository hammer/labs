/**
 * Regression guard for the Artificial Analysis payload parser.
 *
 * AA has changed the record opener three times (see scripts/aa-payload.ts);
 * each change silently collapsed the sync to "Parsed only 1 scored records".
 * These fixtures pin every shape seen so far plus the creator-object trap.
 *
 * Run: npm run test:aa
 */
import { readFileSync } from 'fs';
import { parseAaScores, splitAaRecords } from '../scripts/aa-payload';

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

// Optional live guard: with AA_PAYLOAD=<file> the saved payload must parse to >300 scored slugs.
if (process.env.AA_PAYLOAD) {
  const n = parseAaScores(readFileSync(process.env.AA_PAYLOAD, 'utf8')).size;
  check(`live payload ${process.env.AA_PAYLOAD}: >300 scored records`, n > 300, `got ${n}`);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
