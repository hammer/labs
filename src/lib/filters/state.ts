// Pure state machine for the filter framework.
// No DOM access; safe to test in Node.

import type {
  FilterDimension,
  FilterState,
  DimState,
  RangeValue,
  TristateValue,
} from './types.js';

export function emptyState(dims: FilterDimension[]): FilterState {
  const s: FilterState = {};
  for (const d of dims) {
    s[d.key] = freshDimState(d);
  }
  return s;
}

function freshDimState(d: FilterDimension): DimState {
  switch (d.kind) {
    case 'multi':
      return { kind: 'multi', values: new Set() };
    case 'range':
      return { kind: 'range', value: { min: null, max: null } };
    case 'tristate':
      return { kind: 'tristate', value: 'any' };
    case 'single':
      return { kind: 'single', value: null };
  }
}

export function isActive(s: DimState): boolean {
  switch (s.kind) {
    case 'multi':
      return s.values.size > 0;
    case 'range':
      return s.value.min !== null || s.value.max !== null;
    case 'tristate':
      return s.value !== 'any';
    case 'single':
      return s.value !== null;
  }
}

export function activeCount(state: FilterState): number {
  return Object.values(state).filter(isActive).length;
}

// ─── Mutation ops (return new dim state; caller writes back into state) ─

export function toggleMulti(s: DimState, slug: string): DimState {
  if (s.kind !== 'multi') return s;
  const next = new Set(s.values);
  if (next.has(slug)) next.delete(slug); else next.add(slug);
  return { kind: 'multi', values: next };
}

export function selectOnly(s: DimState, slug: string): DimState {
  if (s.kind !== 'multi') return s;
  return { kind: 'multi', values: new Set([slug]) };
}

export function selectAll(s: DimState, allSlugs: string[]): DimState {
  if (s.kind !== 'multi') return s;
  return { kind: 'multi', values: new Set(allSlugs) };
}

export function selectNone(s: DimState): DimState {
  if (s.kind !== 'multi') return s;
  return { kind: 'multi', values: new Set() };
}

export function invertMulti(s: DimState, allSlugs: string[]): DimState {
  if (s.kind !== 'multi') return s;
  const next = new Set<string>();
  for (const slug of allSlugs) {
    if (!s.values.has(slug)) next.add(slug);
  }
  return { kind: 'multi', values: next };
}

export function setRange(s: DimState, range: RangeValue): DimState {
  if (s.kind !== 'range') return s;
  return { kind: 'range', value: { ...range } };
}

export function setTristate(s: DimState, v: TristateValue): DimState {
  if (s.kind !== 'tristate') return s;
  return { kind: 'tristate', value: v };
}

export function setSingle(s: DimState, v: string | null): DimState {
  if (s.kind !== 'single') return s;
  return { kind: 'single', value: v };
}

export function clearDim(d: FilterDimension): DimState {
  return freshDimState(d);
}

export function clearAll(dims: FilterDimension[]): FilterState {
  return emptyState(dims);
}

// ─── URL sync ──────────────────────────────────────────────────────────

const RANGE_PATTERN = /^(-?[\d.]*)-(-?[\d.]*)$/;

function parseRangeValue(s: string): RangeValue {
  const m = s.match(RANGE_PATTERN);
  if (!m) return { min: null, max: null };
  const minStr = m[1] ?? '';
  const maxStr = m[2] ?? '';
  const minN = minStr === '' ? null : Number.parseFloat(minStr);
  const maxN = maxStr === '' ? null : Number.parseFloat(maxStr);
  return {
    min: minN !== null && Number.isFinite(minN) ? minN : null,
    max: maxN !== null && Number.isFinite(maxN) ? maxN : null,
  };
}

function rangeToString(r: RangeValue): string {
  const lo = r.min !== null ? String(r.min) : '';
  const hi = r.max !== null ? String(r.max) : '';
  return `${lo}-${hi}`;
}

// Legacy: timeline used flagship=1 / flagship=0 for tristate.
function parseTristate(s: string): TristateValue {
  if (s === 'yes' || s === '1') return 'yes';
  if (s === 'no' || s === '0') return 'no';
  return 'any';
}

function tristateToString(v: TristateValue): string | null {
  return v === 'any' ? null : v;
}

export function serialize(state: FilterState, dims: FilterDimension[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const d of dims) {
    const s = state[d.key];
    if (!s || !isActive(s)) continue;
    if (s.kind === 'multi') {
      params.set(d.key, [...s.values].join(','));
    } else if (s.kind === 'range') {
      params.set(d.key, rangeToString(s.value));
    } else if (s.kind === 'tristate') {
      const str = tristateToString(s.value);
      if (str) params.set(d.key, str);
    } else if (s.kind === 'single') {
      if (s.value !== null) params.set(d.key, s.value);
    }
  }
  return params;
}

export function parse(params: URLSearchParams, dims: FilterDimension[]): FilterState {
  const state = emptyState(dims);
  for (const d of dims) {
    const raw = params.get(d.key);
    if (raw === null) continue;
    if (d.kind === 'multi') {
      const validSet = new Set(d.options?.map(o => o.slug) ?? []);
      const values = new Set<string>();
      for (const v of raw.split(',')) {
        if (v && (validSet.size === 0 || validSet.has(v))) values.add(v);
      }
      state[d.key] = { kind: 'multi', values };
    } else if (d.kind === 'range') {
      state[d.key] = { kind: 'range', value: parseRangeValue(raw) };
    } else if (d.kind === 'tristate') {
      state[d.key] = { kind: 'tristate', value: parseTristate(raw) };
    } else if (d.kind === 'single') {
      const validSet = new Set(d.options?.map(o => o.slug) ?? []);
      const v = (validSet.size === 0 || validSet.has(raw)) ? raw : null;
      state[d.key] = { kind: 'single', value: v };
    }
  }
  return state;
}

// ─── Diff ──────────────────────────────────────────────────────────────

export function diffStates(prev: FilterState, next: FilterState): string[] {
  const dirty: string[] = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (!a && !b) continue;
    if (!a || !b) { dirty.push(k); continue; }
    if (!sameDimState(a, b)) dirty.push(k);
  }
  return dirty;
}

function sameDimState(a: DimState, b: DimState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'multi' && b.kind === 'multi') {
    if (a.values.size !== b.values.size) return false;
    for (const v of a.values) if (!b.values.has(v)) return false;
    return true;
  }
  if (a.kind === 'range' && b.kind === 'range') {
    return a.value.min === b.value.min && a.value.max === b.value.max;
  }
  if (a.kind === 'tristate' && b.kind === 'tristate') {
    return a.value === b.value;
  }
  if (a.kind === 'single' && b.kind === 'single') {
    return a.value === b.value;
  }
  return false;
}

// ─── Row matching ──────────────────────────────────────────────────────
// Given a row's data-* attrs and a state, decide if the row passes.

export function rowMatches(
  rowData: Record<string, string | undefined>,
  state: FilterState,
  dims: FilterDimension[],
): boolean {
  for (const d of dims) {
    const s = state[d.key];
    if (!s || !isActive(s)) continue;
    const raw = rowData[d.rowAttr] ?? '';
    if (s.kind === 'multi') {
      // Row attr may be comma-joined list (e.g. data-tags="a,b,c") or single value.
      const cells = raw === '' ? [] : raw.split(',');
      let hit = false;
      for (const cell of cells) {
        if (s.values.has(cell)) { hit = true; break; }
      }
      if (!hit) return false;
    } else if (s.kind === 'range') {
      const n = Number.parseFloat(raw);
      const validNumber = Number.isFinite(n);
      if (!validNumber) return false;
      if (n === 0 && d.excludeMissing) return false;
      if (s.value.min !== null && n < s.value.min) return false;
      if (s.value.max !== null && n > s.value.max) return false;
    } else if (s.kind === 'tristate') {
      // Row attr is treated as boolean: '1' / 'yes' / 'true' = yes.
      const truthy = raw === '1' || raw === 'yes' || raw === 'true';
      if (s.value === 'yes' && !truthy) return false;
      if (s.value === 'no' && truthy) return false;
    } else if (s.kind === 'single') {
      if (raw !== s.value) return false;
    }
  }
  return true;
}
