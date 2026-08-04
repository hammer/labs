// Pure type definitions for the filter framework.
// No runtime imports — safe to use anywhere.

export type DimKind = 'multi' | 'range' | 'tristate' | 'single';

// Serializable format token for range values. Dimension config crosses the
// SSR→client boundary as JSON (FilterBar.astro), so this must be plain data,
// not a function. Resolved by formatValue() in runtime.ts.
export type FormatToken = 'plain' | 'paramsB' | 'tokensT' | 'usdB' | 'score100' | 'compact';

export interface MultiOption {
  slug: string;
  label: string;
  flag?: string;
  count: number;
}

export interface FilterDimension {
  key: string;
  label: string;
  kind: DimKind;
  // For 'multi' and 'single' kinds
  options?: MultiOption[];
  // For 'range' kinds
  unit?: string;
  format?: FormatToken;
  // When true and kind is 'range', rows whose attr is 0 are additionally
  // excluded by an active filter. Note: rows whose attr is missing/empty
  // always fail an active range filter (parseFloat('') is NaN), regardless
  // of this flag — emit missing numerics as '' (or omit the attribute).
  excludeMissing?: boolean;
  // The row.dataset key holding this dimension's value — camelCase, e.g.
  // rowAttr 'ipoStatus' reads data-ipo-status. Multi-word kebab keys would
  // silently never match.
  rowAttr: string;
  // Scoped visibility: this dimension only appears (and only filters) while
  // the named dimension is narrowed to exactly one selected value contained
  // in `values`. While out of scope the dimension's state is suspended —
  // kept in memory for restore, but excluded from row matching, chips, and
  // the URL. Plain data; survives the JSON config boundary.
  visibleWhen?: { dim: string; values: string[] };
  // Optional coverage hint shown in the dimension's value panel,
  // e.g. "47 of 550 model rows have data".
  hint?: string;
  // Tristate only, inline mode only: clicking the control cycles
  // any → yes → no → any directly instead of opening the value panel —
  // a 1-click toggle for the common case while keeping "no" reachable.
  // Palette mode ignores this (the palette flow already has the panel open).
  toggle?: boolean;
}

export type RangeValue = { min: number | null; max: number | null };
export type TristateValue = 'any' | 'yes' | 'no';

// State for a single dimension.
export type DimState =
  | { kind: 'multi'; values: Set<string> }
  | { kind: 'range'; value: RangeValue }
  | { kind: 'tristate'; value: TristateValue }
  | { kind: 'single'; value: string | null };

// Total filter state for a page = map of dimension key → DimState.
export type FilterState = Record<string, DimState>;

export interface FilterChangeDetail {
  state: FilterState;
  dirtyKeys: string[];
}
