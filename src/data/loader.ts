import { readFileSync, existsSync } from 'fs';
import { globSync } from 'glob';
import { parse } from 'yaml';
import { LabSchema, OutputSchema, isGrouped, type Lab, type Output, type MetricsEntry } from '../schema.js';

export type OutputWithMeta = Output & { _labSlug: string; _metrics?: MetricsEntry };

let _labs: Lab[] | null = null;
let _outputs: OutputWithMeta[] | null = null;
let _metrics: Record<string, MetricsEntry> | null = null;

function loadLabs(): Lab[] {
  if (_labs) return _labs;
  const files = globSync('data/labs/*.yaml').sort();
  _labs = files.map((file) => {
    const raw = readFileSync(file, 'utf-8');
    return LabSchema.parse(parse(raw));
  });
  return _labs;
}

function loadMetrics(): Record<string, MetricsEntry> {
  if (_metrics) return _metrics;
  const path = 'data/metrics.json';
  if (existsSync(path)) {
    _metrics = JSON.parse(readFileSync(path, 'utf-8'));
  } else {
    _metrics = {};
  }
  return _metrics!;
}

function loadOutputs(): OutputWithMeta[] {
  if (_outputs) return _outputs;
  const files = globSync('data/outputs/**/*.yaml').sort();
  const metrics = loadMetrics();
  _outputs = files.map((file) => {
    const raw = readFileSync(file, 'utf-8');
    const output = OutputSchema.parse(parse(raw));
    const dirSlug = file.split('/').at(-2)!;
    const key = `${dirSlug}/${output.slug}`;
    const m = metrics[key];
    return { ...output, _labSlug: dirSlug, ...(m ? { _metrics: m } : {}) };
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

export function getOutputsForLab(labSlug: string): OutputWithMeta[] {
  return loadOutputs()
    .filter((o) => {
      const labs = Array.isArray(o.lab) ? o.lab : [o.lab];
      return labs.includes(labSlug);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getAllOutputsChronological(): OutputWithMeta[] {
  return [...loadOutputs()].sort((a, b) => b.date.localeCompare(a.date));
}

export function getOutputBySlug(labSlug: string, slug: string): OutputWithMeta | undefined {
  return loadOutputs().find((o) => o._labSlug === labSlug && o.slug === slug);
}

/** Count outputs for a lab. Grouped entries count as 1. */
export function getOutputCount(labSlug: string): number {
  return getOutputsForLab(labSlug).length;
}

/** Get the primary display type(s) for an output */
export function getOutputTypes(output: Output): string[] {
  if (isGrouped(output)) {
    return [...new Set(output.outputs.map(o => o.type))];
  }
  return [output.type];
}

export { isGrouped };
