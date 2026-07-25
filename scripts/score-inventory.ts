import { readFileSync } from 'fs';
import { basename, dirname } from 'path';
import { glob } from 'glob';
import { parse } from 'yaml';

// Inventory of every recorded AA Intelligence Index score across all outputs.
// A score lives on a `model:` block either at the top level of a simple output
// OR on each entry of a grouped output's `outputs:` list — so a flat grep
// anchored to one indent level (e.g. `^  intelligence_index:`) silently misses
// the nested ones. Walk both, mirroring the unit idiom in src/validate.ts.

interface Row {
  score: number;
  version: string;
  name: string;
  lab: string;
}

async function main() {
  const files = (await glob('data/outputs/**/*.yaml')).sort();
  const rows: Row[] = [];

  for (const file of files) {
    const content = parse(readFileSync(file, 'utf-8'));
    if (!content) continue;
    const lab = basename(dirname(file));
    const units = Array.isArray(content.outputs) ? content.outputs : [content];
    for (const unit of units) {
      const ii = unit?.model?.intelligence_index;
      if (typeof ii !== 'number') continue;
      rows.push({
        score: ii,
        version: unit.model?.intelligence_index_version ?? '(no version)',
        name: unit.name ?? content.name ?? '(unnamed)',
        lab,
      });
    }
  }

  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const nameW = Math.max(4, ...rows.map((r) => r.name.length));
  const labW = Math.max(3, ...rows.map((r) => r.lab.length));
  for (const r of rows) {
    console.log(
      `${String(r.score).padStart(3)}  ${r.name.padEnd(nameW)}  ${r.lab.padEnd(labW)}  ${r.version}`,
    );
  }
  console.log(`\n${rows.length} scored models.`);
}

main();
