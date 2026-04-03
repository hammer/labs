import { readFileSync, existsSync } from 'fs';
import { globSync } from 'glob';
import { parse } from 'yaml';
import { LabSchema, OutputSchema, isGrouped, type Lab, type Output, type MetricsEntry } from '../schema.js';

export type OutputWithMeta = Output & { _labSlug: string; _metrics?: MetricsEntry };

let _labs: Lab[] | null = null;
let _outputs: OutputWithMeta[] | null = null;
let _metrics: Record<string, MetricsEntry> | null = null;

// In dev mode, don't cache — re-read YAML on every request so changes
// are picked up without restarting the dev server
const isDev = import.meta.env?.DEV ?? false;
function clearCacheIfDev() {
  if (isDev) { _labs = null; _outputs = null; _metrics = null; }
}

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
  clearCacheIfDev();
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
  clearCacheIfDev();
  return [...loadOutputs()].sort((a, b) => b.date.localeCompare(a.date));
}

export function getOutputBySlug(labSlug: string, slug: string): OutputWithMeta | undefined {
  // First try canonical (file directory) match
  const canonical = loadOutputs().find((o) => o._labSlug === labSlug && o.slug === slug);
  if (canonical) return canonical;
  // For multi-lab outputs, also match by any lab in the lab array
  return loadOutputs().find((o) => {
    if (o.slug !== slug) return false;
    const labs = Array.isArray(o.lab) ? o.lab : [o.lab];
    return labs.includes(labSlug);
  });
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

/** Parse a parameter string like "671B", "1T", "1T+" into billions */
function parseParamsToBillions(s?: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[+,]/g, '').trim();
  const tMatch = cleaned.match(/^([\d.]+)\s*T$/i);
  if (tMatch) return parseFloat(tMatch[1]) * 1000;
  const bMatch = cleaned.match(/^([\d.]+)\s*B$/i);
  if (bMatch) return parseFloat(bMatch[1]);
  const mMatch = cleaned.match(/^([\d.]+)\s*M$/i);
  if (mMatch) return parseFloat(mMatch[1]) / 1000;
  return 0;
}

/** Get the largest model (by total params) for a lab. Returns { name, params, paramsB, slug, labSlug } */
export function getLargestModel(labSlug: string): { name: string; params: string; paramsB: number; slug: string; labSlug: string } | null {
  const outputs = getOutputsForLab(labSlug);
  let best: { name: string; params: string; paramsB: number; slug: string; labSlug: string } | null = null;

  function check(displayName: string, params: string | undefined, outputSlug: string, outLabSlug: string) {
    const b = parseParamsToBillions(params);
    if (b > 0 && (!best || b > best.paramsB)) {
      best = { name: displayName, params: params!, paramsB: b, slug: outputSlug, labSlug: outLabSlug };
    }
  }

  for (const output of outputs) {
    const oSlug = output.slug;
    const oLab = (output as OutputWithMeta)._labSlug;
    // Use the top-level output name as the display name for all children
    const baseName = output.name.replace(/:.*$/, '').replace(/\s*\(.*$/, '').trim();
    if (isGrouped(output)) {
      for (const sub of output.outputs) {
        if (sub.model) {
          check(baseName, sub.model.parameters, oSlug, oLab);
          for (const v of sub.model.variants ?? []) {
            check(baseName, v.parameters, oSlug, oLab);
          }
        }
      }
    } else {
      if (output.model) {
        check(baseName, output.model.parameters, oSlug, oLab);
        for (const v of output.model.variants ?? []) {
          check(baseName, v.parameters, oSlug, oLab);
        }
      }
    }
  }
  return best;
}

/** Get the highest intelligence_index score across all outputs for a lab */
export function getTopIntelligence(labSlug: string): { score: number; name: string; slug: string; labSlug: string } | null {
  const outputs = getOutputsForLab(labSlug);
  let best: { score: number; name: string; slug: string; labSlug: string } | null = null;

  function check(score: number | undefined, displayName: string, outputSlug: string, outLabSlug: string) {
    if (score && (!best || score > best.score)) {
      best = { score, name: displayName, slug: outputSlug, labSlug: outLabSlug };
    }
  }

  for (const output of outputs) {
    const oSlug = output.slug;
    const oLab = (output as OutputWithMeta)._labSlug;
    const baseName = output.name.replace(/:.*$/, '').replace(/\s*\(.*$/, '').trim();
    if (isGrouped(output)) {
      for (const sub of output.outputs) {
        if (sub.model) {
          check(sub.model.intelligence_index, baseName, oSlug, oLab);
        }
      }
    } else {
      if (output.model) {
        check(output.model.intelligence_index, baseName, oSlug, oLab);
      }
    }
  }
  return best;
}

export { isGrouped };
