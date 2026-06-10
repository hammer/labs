import { readFileSync, existsSync } from 'fs';
import { globSync } from 'glob';
import { parse } from 'yaml';
import { LabSchema, OutputSchema, isGrouped, type Lab, type Output, type MetricsEntry } from '../schema.js';
import { parseScaleToBillions, parseScaleToTrillions } from '../lib/scale.js';

export type OutputWithMeta = Output & { _labSlug: string; _metrics?: MetricsEntry };

export interface NewsItem {
  _kind: 'news';
  _labSlug: string;
  title: string;
  url: string;
  source?: string;
  date: string;
  labName: string;
}

export type TimelineItem =
  | (OutputWithMeta & { _kind: 'output' })
  | NewsItem;

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

const parseParamsToBillions = parseScaleToBillions;

// ─── Type-specific facets for filter/sort row attributes ────────────────

export interface ModelFacets {
  /** Comma-joined union of architectures across all model units, e.g. "dense,moe". */
  arch: string;
  /** Max parameters in billions across units, variants, and estimates. 0 = none. */
  paramsB: number;
  /** Where the max came from: '' = a unit's reported top-level value. */
  paramsSrc: '' | 'variant' | 'estimate';
  /** Max active parameters in billions across units and variants. */
  aparamsB: number;
  aparamsSrc: '' | 'variant';
  /** Max training tokens in trillions across units. */
  tokensT: number;
  /** Max context window across units. */
  ctx: number;
  /** Max intelligence_index across units — AA v4-tagged scores only (older
   * unversioned scores predate the v4 recalibration and aren't comparable). */
  intel: number;
  /** Max openness_index across units (all values are AAOI v1.0). */
  openness: number;
}

/**
 * Containment semantics for timeline filtering/sorting: "this release
 * contains a model with X". Categorical facets union across all model units
 * in the file; numeric facets take the file-wide max across units, variants,
 * and third-party estimates (same semantics as getLargestModel / the home
 * Scale facet). Display surfaces mark variant/estimate-derived values so the
 * top-level-anchoring convention isn't violated silently.
 */
export function getModelFacets(output: Output): ModelFacets | null {
  const blocks = isGrouped(output)
    ? output.outputs.filter(o => o.model).map(o => o.model!)
    : output.model ? [output.model] : [];
  if (blocks.length === 0) return null;

  const archSet = new Set<string>();
  let paramsB = 0;
  let paramsSrc: ModelFacets['paramsSrc'] = '';
  let aparamsB = 0;
  let aparamsSrc: ModelFacets['aparamsSrc'] = '';
  let tokensT = 0;
  let ctx = 0;
  let intel = 0;
  let openness = 0;

  function considerParams(value: string | undefined, src: ModelFacets['paramsSrc']) {
    const b = parseScaleToBillions(value);
    if (b > paramsB) { paramsB = b; paramsSrc = src; }
  }
  function considerAparams(value: string | undefined, src: ModelFacets['aparamsSrc']) {
    const b = parseScaleToBillions(value);
    if (b > aparamsB) { aparamsB = b; aparamsSrc = src; }
  }

  for (const m of blocks) {
    if (m.architecture) archSet.add(m.architecture);
    considerParams(m.parameters, '');
    considerParams(m.parameters_estimated?.value, 'estimate');
    considerAparams(m.active_parameters, '');
    for (const v of m.variants ?? []) {
      considerParams(v.parameters, 'variant');
      considerParams(v.parameters_estimated?.value, 'estimate');
      considerAparams(v.active_parameters, 'variant');
    }
    tokensT = Math.max(tokensT, parseScaleToTrillions(m.training_tokens));
    ctx = Math.max(ctx, m.context_window ?? 0);
    if ((m.intelligence_index_version ?? '').startsWith('AA v4')) {
      intel = Math.max(intel, m.intelligence_index ?? 0);
    }
    openness = Math.max(openness, m.openness_index ?? 0);
  }

  return {
    arch: [...archSet].sort().join(','),
    paramsB, paramsSrc, aparamsB, aparamsSrc, tokensT, ctx, intel, openness,
  };
}

export interface EvalFacets {
  /** Max num_questions across eval units. 0 = unknown. */
  questions: number;
  /** Max num_tasks across eval units. 0 = unknown. */
  tasks: number;
}

/** Containment semantics, same as getModelFacets — max across eval units. */
export function getEvalFacets(output: Output): EvalFacets | null {
  const blocks = isGrouped(output)
    ? output.outputs.filter(o => o.eval).map(o => o.eval!)
    : output.eval ? [output.eval] : [];
  if (blocks.length === 0) return null;
  let questions = 0;
  let tasks = 0;
  for (const e of blocks) {
    questions = Math.max(questions, e.num_questions ?? 0);
    tasks = Math.max(tasks, e.num_tasks ?? 0);
  }
  return { questions, tasks };
}

interface ParamsEstimateMeta {
  source: string;
  source_label?: string;
  method?: string;
  posted?: string;
  notes?: string;
}

interface LargestModel {
  name: string;
  params: string;
  paramsB: number;
  slug: string;
  labSlug: string;
  estimated: boolean;
  estimate?: ParamsEstimateMeta;
}

/** Get the largest model for a lab — picks max(reported, estimated) per variant, then max across all. */
export function getLargestModel(labSlug: string): LargestModel | null {
  const outputs = getOutputsForLab(labSlug);
  let best: LargestModel | null = null;

  function check(
    displayName: string,
    params: string | undefined,
    paramsEst: { value: string; source: string; source_label?: string; method?: string; posted?: string; notes?: string } | undefined,
    outputSlug: string,
    outLabSlug: string,
  ) {
    const b = parseParamsToBillions(params);
    const bEst = parseParamsToBillions(paramsEst?.value);
    let chosen: { paramsStr: string; paramsB: number; estimated: boolean } | null = null;
    if (b >= bEst && b > 0) {
      chosen = { paramsStr: params!, paramsB: b, estimated: false };
    } else if (bEst > 0) {
      chosen = { paramsStr: paramsEst!.value, paramsB: bEst, estimated: true };
    }
    if (!chosen) return;
    if (best && chosen.paramsB <= best.paramsB) return;
    best = {
      name: displayName,
      params: chosen.paramsStr,
      paramsB: chosen.paramsB,
      slug: outputSlug,
      labSlug: outLabSlug,
      estimated: chosen.estimated,
      estimate: chosen.estimated ? {
        source: paramsEst!.source,
        source_label: paramsEst!.source_label,
        method: paramsEst!.method,
        posted: paramsEst!.posted,
        notes: paramsEst!.notes,
      } : undefined,
    };
  }

  for (const output of outputs) {
    const oSlug = output.slug;
    const oLab = (output as OutputWithMeta)._labSlug;
    const baseName = output.name.replace(/:.*$/, '').replace(/\s*\(.*$/, '').trim();
    if (isGrouped(output)) {
      for (const sub of output.outputs) {
        if (sub.model) {
          check(baseName, sub.model.parameters, sub.model.parameters_estimated, oSlug, oLab);
          for (const v of sub.model.variants ?? []) {
            check(baseName, v.parameters, v.parameters_estimated, oSlug, oLab);
          }
        }
      }
    } else {
      if (output.model) {
        check(baseName, output.model.parameters, output.model.parameters_estimated, oSlug, oLab);
        for (const v of output.model.variants ?? []) {
          check(baseName, v.parameters, v.parameters_estimated, oSlug, oLab);
        }
      }
    }
  }
  return best;
}

interface TopIntelligence {
  score: number;
  name: string;
  slug: string;
  labSlug: string;
  openness?: number;
  opennessVersion?: string;
}

/**
 * Get the highest intelligence_index score across all outputs for a lab.
 * Only AA v4-tagged scores count — same rule as the timeline's Intelligence
 * facet (getModelFacets): pre-v4 scores predate the recalibration and aren't
 * comparable. The result also surfaces an openness reading: per the rule in
 * AGENTS.md, we pick the highest-AAII model that also has an openness_index
 * set ("Option C" — see issue #42). AA's openness coverage drifts behind the
 * latest AAII checkpoints, so always preferring the absolute top-AAII would
 * leave the openness slot empty for many labs.
 */
export function getTopIntelligence(labSlug: string): TopIntelligence | null {
  const outputs = getOutputsForLab(labSlug);
  let topAaii: TopIntelligence | null = null;
  let topWithOpenness: TopIntelligence | null = null;

  function check(
    score: number | undefined,
    version: string | undefined,
    openness: number | undefined,
    opennessVersion: string | undefined,
    displayName: string,
    outputSlug: string,
    outLabSlug: string,
  ) {
    if (!score) return;
    if (!(version ?? '').startsWith('AA v4')) return;
    const entry: TopIntelligence = {
      score, name: displayName, slug: outputSlug, labSlug: outLabSlug,
      openness, opennessVersion,
    };
    if (!topAaii || score > topAaii.score) topAaii = entry;
    if (openness !== undefined && (!topWithOpenness || score > topWithOpenness.score)) {
      topWithOpenness = entry;
    }
  }

  for (const output of outputs) {
    const oSlug = output.slug;
    const oLab = (output as OutputWithMeta)._labSlug;
    const baseName = output.name.replace(/:.*$/, '').replace(/\s*\(.*$/, '').trim();
    if (isGrouped(output)) {
      for (const sub of output.outputs) {
        if (sub.model) {
          check(sub.model.intelligence_index, sub.model.intelligence_index_version, sub.model.openness_index, sub.model.openness_index_version, baseName, oSlug, oLab);
        }
      }
    } else {
      if (output.model) {
        check(output.model.intelligence_index, output.model.intelligence_index_version, output.model.openness_index, output.model.openness_index_version, baseName, oSlug, oLab);
      }
    }
  }

  // The intelligence slot is anchored on the absolute top-AAII model;
  // the openness slot pulls from whichever AAII-scored model happens to
  // also have an AAOI value (may or may not be the same row).
  if (!topAaii) return null;
  return {
    ...topAaii,
    openness: topWithOpenness?.openness,
    opennessVersion: topWithOpenness?.opennessVersion,
  };
}

export function getAllNewsChronological(): NewsItem[] {
  clearCacheIfDev();
  const labs = loadLabs();
  const items: NewsItem[] = [];
  for (const lab of labs) {
    if (!lab.news) continue;
    for (const n of lab.news) {
      items.push({
        _kind: 'news',
        _labSlug: lab.slug,
        title: n.title,
        url: n.url,
        source: n.source,
        date: n.date,
        labName: lab.name,
      });
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export function getAllTimelineItems(): TimelineItem[] {
  clearCacheIfDev();
  const outputs: TimelineItem[] = [...loadOutputs()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(o => ({ ...o, _kind: 'output' as const }));
  const news = getAllNewsChronological();
  // Merge two sorted-descending arrays in O(n+m)
  const merged: TimelineItem[] = [];
  let i = 0, j = 0;
  while (i < outputs.length && j < news.length) {
    if (outputs[i].date >= news[j].date) {
      merged.push(outputs[i++]);
    } else {
      merged.push(news[j++]);
    }
  }
  while (i < outputs.length) merged.push(outputs[i++]);
  while (j < news.length) merged.push(news[j++]);
  return merged;
}

// --- Person pages ---

export interface PersonAffiliation {
  labSlug: string;
  labName: string;
  role?: string;
  formerly?: string;
  current: boolean;
}

export interface PersonWithLabs {
  slug: string;
  name: string;
  description?: string;
  url?: string;
  urls?: { label: string; url: string }[];
  affiliations: PersonAffiliation[];
}

export function slugifyName(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\s*\(.*?\)\s*/g, '') // remove parenthetical (e.g., Chinese chars)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getAllPeople(): PersonWithLabs[] {
  clearCacheIfDev();
  const labs = loadLabs();
  const bySlug = new Map<string, PersonWithLabs>();

  for (const lab of labs) {
    if (!lab.people) continue;
    for (const p of lab.people) {
      const slug = p.slug || slugifyName(p.name);
      const isCurrent = !p.role || !/(former|departed|now at)/i.test(p.role);

      const existing = bySlug.get(slug);
      if (existing) {
        // Merge: add this lab's affiliation
        existing.affiliations.push({
          labSlug: lab.slug,
          labName: lab.name,
          role: p.role,
          formerly: p.formerly,
          current: isCurrent,
        });
        // Prefer richer data
        if (!existing.url && p.url) existing.url = p.url;
        if (!existing.description && p.description) existing.description = p.description;
        if (p.urls) {
          const existingLabels = new Set((existing.urls || []).map(u => u.label));
          for (const u of p.urls) {
            if (!existingLabels.has(u.label)) {
              existing.urls = existing.urls || [];
              existing.urls.push(u);
            }
          }
        }
      } else {
        bySlug.set(slug, {
          slug,
          name: p.name,
          description: p.description,
          url: p.url,
          urls: p.urls ? [...p.urls] : undefined,
          affiliations: [{
            labSlug: lab.slug,
            labName: lab.name,
            role: p.role,
            formerly: p.formerly,
            current: isCurrent,
          }],
        });
      }
    }
  }

  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getPersonBySlug(slug: string): PersonWithLabs | undefined {
  return getAllPeople().find(p => p.slug === slug);
}

export function getOutputsForPerson(personName: string): OutputWithMeta[] {
  // Extract the core name parts for matching (no parenthetical characters)
  const coreName = personName.replace(/\s*\(.*?\)\s*/g, '').trim();
  const parts = coreName.split(/\s+/);
  if (parts.length < 2) return [];

  return loadOutputs().filter(o => {
    const desc = o.description || '';
    // Require full name match (both parts) to avoid false positives with short names
    return desc.includes(coreName);
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
}

export function getNewsForPerson(personName: string): NewsItem[] {
  const coreName = personName.replace(/\s*\(.*?\)\s*/g, '').trim();
  const parts = coreName.split(/\s+/);
  if (parts.length < 2) return [];

  const results: NewsItem[] = [];
  for (const lab of loadLabs()) {
    if (!lab.news) continue;
    for (const n of lab.news) {
      if (n.title.includes(coreName)) {
        results.push({
          _kind: 'news',
          _labSlug: lab.slug,
          title: n.title,
          url: n.url,
          source: n.source,
          date: n.date,
          labName: lab.name,
        });
      }
    }
  }
  return results.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
}

export { isGrouped };
