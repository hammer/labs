import { readFileSync } from 'fs';
import { globSync } from 'glob';
import { parse } from 'yaml';
import { LabSchema, OutputSchema, type Lab, type Output } from '../schema.js';

let _labs: Lab[] | null = null;
let _outputs: (Output & { _labSlug: string })[] | null = null;

function loadLabs(): Lab[] {
  if (_labs) return _labs;
  const files = globSync('data/labs/*.yaml').sort();
  _labs = files.map((file) => {
    const raw = readFileSync(file, 'utf-8');
    return LabSchema.parse(parse(raw));
  });
  return _labs;
}

function loadOutputs(): (Output & { _labSlug: string })[] {
  if (_outputs) return _outputs;
  const files = globSync('data/outputs/**/*.yaml').sort();
  _outputs = files.map((file) => {
    const raw = readFileSync(file, 'utf-8');
    const output = OutputSchema.parse(parse(raw));
    const dirSlug = file.split('/').at(-2)!;
    return { ...output, _labSlug: dirSlug };
  });
  return _outputs;
}

export function getAllLabs(): Lab[] {
  return loadLabs();
}

export function getLabBySlug(slug: string): Lab | undefined {
  return loadLabs().find((l) => l.slug === slug);
}

export function getLabsGroupedByType(): Record<string, Lab[]> {
  const groups: Record<string, Lab[]> = {};
  for (const lab of loadLabs()) {
    const type = lab.type ?? 'other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(lab);
  }
  return groups;
}

export function getOutputsForLab(labSlug: string): Output[] {
  return loadOutputs()
    .filter((o) => {
      const labs = Array.isArray(o.lab) ? o.lab : [o.lab];
      return labs.includes(labSlug);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getAllOutputsChronological(): (Output & { _labSlug: string })[] {
  return [...loadOutputs()].sort((a, b) => b.date.localeCompare(a.date));
}

export function getOutputBySlug(labSlug: string, slug: string): Output | undefined {
  return loadOutputs().find((o) => o._labSlug === labSlug && o.slug === slug);
}

export function getOutputCount(labSlug: string): number {
  return getOutputsForLab(labSlug).length;
}
